// app/api/timetable/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { db } from '@/lib/db/db';
import { randomUUID } from 'crypto';

interface GenerationSettings {
  term_id: number;
  min_classes_per_day: number;
  regenerate: boolean;
  department?: string | null; // null or omitted = master timetable
}

async function verifyAuth() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');
    if (!token) return { error: 'No token found', status: 401 };

    const { payload } = await jwtVerify(
      token.value,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );

    const userId = Number(payload.id);
    const role = payload.role as string;

    const user = await db.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, is_active: true, has_timetable_admin: true }
    });

    if (!user || !user.is_active) return { error: 'User not found or inactive', status: 401 };
    return { user: { ...user, id: userId, role } };
  } catch {
    return { error: 'Invalid token', status: 401 };
  }
}

function hasTimetableAdminAccess(user: any): boolean {
  return user.role === 'admin' || user.has_timetable_admin === true;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotToCreate {
  id: string;
  term_id: number;
  class_id: number;
  subject_id: number;
  employee_id: number;
  room_id: number;
  lesson_period_id: number;
  day_of_week: number;
  status: string;
  is_online_session: boolean;
  created_at: Date;
  updated_at: Date;
  combined_class_ids?: number[];
  session_group_id?: string;
  is_room_fallback?: boolean;
}

interface SkippedAssignment {
  trainer_assignment_id: number;
  subject_code: string;
  subject_name: string;
  class_code: string;
  trainer_name: string;
  scheduled: number;
  requested: number;
  reason: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Core scheduling algorithm ────────────────────────────────────────────────
function generateSlots(
  trainerAssignments: any[],
  workingDaysArray: number[],
  lessonPeriods: any[],
  rooms: any[],
  subjectRoomTiers: Map<number, any[][]>,
  subjectCombinations: any[],
  term_id: number,
  rnaRoomId: number | null,
  rnaOnlySubjectIds: Set<number>,
  occupiedSlots: Array<{
    employee_id: number;
    class_id: number;
    room_id: number;
    lesson_period_id: number;
    day_of_week: number;
    session_group_id: string | null;
  }> = []
) {
  const slotsToCreate: SlotToCreate[] = [];
  const skippedAssignments: SkippedAssignment[] = [];

  const scheduledSlots = new Map<string, boolean>();
  const usedRooms = new Set<number>();
  const usedTrainers = new Set<number>();

  // ── Workshop room set ─────────────────────────────────────────────────────
  const workshopRoomIds = new Set<number>(
    rooms.filter((r: any) => r.room_type === 'workshop').map((r: any) => r.id)
  );

  occupiedSlots.forEach(s => {
  const day = s.day_of_week;
  const p   = s.lesson_period_id;
  scheduledSlots.set(`trainer-${day}-${p}-${s.employee_id}`, true);
  scheduledSlots.set(`class-${day}-${p}-${s.class_id}`,      true);
  scheduledSlots.set(`room-${day}-${p}-${s.room_id}`,        true);
  if (s.session_group_id) {
    scheduledSlots.set(`room-group-${day}-${p}-${s.room_id}-${s.session_group_id}`, true);
  }
});

  // ── Build combination lookup ──────────────────────────────────────────────
  const combinationMap = new Map<number, Map<number, number[]>>();
  const secondaryAssignmentIds = new Set<number>();

  subjectCombinations.forEach(combo => {
    if (!combinationMap.has(combo.primary_assignment_id)) {
      combinationMap.set(combo.primary_assignment_id, new Map());
    }
    const sessionMap = combinationMap.get(combo.primary_assignment_id)!;
    const existing = sessionMap.get(combo.session_number) ?? [];
    existing.push(combo.combined_assignment_id);
    sessionMap.set(combo.session_number, existing);
    secondaryAssignmentIds.add(combo.combined_assignment_id);
  });

  // ── Assignment lookup ─────────────────────────────────────────────────────
  const assignmentById = new Map<number, any>();
  trainerAssignments.forEach(ta => assignmentById.set(ta.id, ta));

  // ── Auto-fill missing combination sessions ────────────────────────────────
  combinationMap.forEach((sessionMap, primaryAssignmentId) => {
    const firstSessionNum = Math.min(...sessionMap.keys());
    const seedCombos = sessionMap.get(firstSessionNum);
    if (!seedCombos || seedCombos.length === 0) return;

    const primaryAssignment = assignmentById.get(primaryAssignmentId);
    if (!primaryAssignment) return;

    const spw: number =
      primaryAssignment.sessions_per_week ??
      primaryAssignment.classsubjects.sessions_per_week ??
      primaryAssignment.classsubjects.subjects.sessions_per_week ?? 1;

    const lt: string =
      primaryAssignment.lesson_type ??
      primaryAssignment.classsubjects.lesson_type ??
      primaryAssignment.classsubjects.subjects.lesson_type ?? 'single';

    const groupSize = lt === 'triple' ? 3 : lt === 'double' ? 2 : 1;
    const numGroups = groupSize > 1 ? Math.floor(spw / groupSize) : 0;
    const numSingles = groupSize > 1 ? spw % groupSize : spw;
    const total = numGroups + numSingles;

    for (let s = 1; s <= total; s++) {
      if (!sessionMap.has(s)) {
        sessionMap.set(s, [...seedCombos]);
      }
    }
  });

  // ── Sort assignments: hardest constraints first ───────────────────────────
  const typeScore = (t: string) => t === 'triple' ? 3 : t === 'double' ? 2 : 1;

  const sortedAssignments = [...trainerAssignments].sort((a, b) => {
    const aType = a.classsubjects.lesson_type ?? a.classsubjects.subjects.lesson_type ?? 'single';
    const bType = b.classsubjects.lesson_type ?? b.classsubjects.subjects.lesson_type ?? 'single';
    const aSessions = a.classsubjects.sessions_per_week ?? a.classsubjects.subjects.sessions_per_week ?? 1;
    const bSessions = b.classsubjects.sessions_per_week ?? b.classsubjects.subjects.sessions_per_week ?? 1;
    const aRooms = (subjectRoomTiers.get(a.classsubjects.subjects.id) ?? []).flat().length;
    const bRooms = (subjectRoomTiers.get(b.classsubjects.subjects.id) ?? []).flat().length;

    if (typeScore(bType) !== typeScore(aType)) return typeScore(bType) - typeScore(aType);
    if (bSessions !== aSessions) return bSessions - aSessions;
    return aRooms - bRooms;
  });

  // ── Slot availability check ───────────────────────────────────────────────
  const isSlotAvailable = (
    day: number,
    periodId: number,
    roomId: number,
    trainerId: number,
    classIds: number[],
    combinationGroupId?: string
  ): boolean => {
    if (scheduledSlots.has(`trainer-${day}-${periodId}-${trainerId}`)) return false;
    for (const classId of classIds) {
      if (scheduledSlots.has(`class-${day}-${periodId}-${classId}`)) return false;
    }
    if (combinationGroupId) {
      if (scheduledSlots.has(`room-${day}-${periodId}-${roomId}`)) return false;
      if (scheduledSlots.has(`room-group-${day}-${periodId}-${roomId}-${combinationGroupId}`)) return false;
    } else {
      if (scheduledSlots.has(`room-${day}-${periodId}-${roomId}`)) return false;
    }
    return true;
  };

  const isSlotAvailableIgnoreTrainer = (
    day: number,
    periodId: number,
    roomId: number,
    classIds: number[]
  ): boolean => {
    for (const classId of classIds) {
      if (scheduledSlots.has(`class-${day}-${periodId}-${classId}`)) return false;
    }
    if (scheduledSlots.has(`room-${day}-${periodId}-${roomId}`)) return false;
    return true;
  };

  // ── Mark slot used ────────────────────────────────────────────────────────
  const markSlotUsed = (
    day: number,
    periodId: number,
    roomId: number,
    trainerId: number,
    classIds: number[],
    combinationGroupId?: string,
    isLastMemberInGroup?: boolean,
    additionalTrainerIds?: number[]
  ) => {
    scheduledSlots.set(`trainer-${day}-${periodId}-${trainerId}`, true);
    if (additionalTrainerIds) {
      for (const tid of additionalTrainerIds) {
        scheduledSlots.set(`trainer-${day}-${periodId}-${tid}`, true);
      }
    }
    for (const classId of classIds) {
      scheduledSlots.set(`class-${day}-${periodId}-${classId}`, true);
    }
    if (combinationGroupId) {
      scheduledSlots.set(`room-group-${day}-${periodId}-${roomId}-${combinationGroupId}`, true);
      if (isLastMemberInGroup) {
        scheduledSlots.set(`room-${day}-${periodId}-${roomId}`, true);
      }
    } else {
      scheduledSlots.set(`room-${day}-${periodId}-${roomId}`, true);
    }
  };

  const markSlotUsedIgnoreTrainer = (
    day: number,
    periodId: number,
    roomId: number,
    classIds: number[]
  ) => {
    for (const classId of classIds) {
      scheduledSlots.set(`class-${day}-${periodId}-${classId}`, true);
    }
    scheduledSlots.set(`room-${day}-${periodId}-${roomId}`, true);
  };

  // ── Consecutive period groups ─────────────────────────────────────────────
  const getConsecutivePeriodGroups = (count: number): number[][] => {
    const groups: number[][] = [];
    for (let i = 0; i <= lessonPeriods.length - count; i++) {
      groups.push(lessonPeriods.slice(i, i + count).map((p: any) => p.id));
    }
    return groups;
  };

  // ── Slot factory ──────────────────────────────────────────────────────────
  const makeSlot = (
    termId: number,
    classId: number,
    subjectId: number,
    trainerId: number,
    roomId: number,
    periodId: number,
    day: number,
    combinedClassIds?: number[],
    sessionGroupId?: string,
    status: string = 'scheduled'
  ): SlotToCreate => ({
    id: randomUUID(),
    term_id: termId,
    class_id: classId,
    subject_id: subjectId,
    employee_id: trainerId,
    room_id: roomId,
    lesson_period_id: periodId,
    day_of_week: day,
    status,
    is_online_session: false,
    created_at: new Date(),
    updated_at: new Date(),
    ...(combinedClassIds && combinedClassIds.length > 0 ? { combined_class_ids: combinedClassIds } : {}),
    ...(sessionGroupId ? { session_group_id: sessionGroupId } : {}),
    ...(rnaRoomId && roomId === rnaRoomId ? { is_room_fallback: true } : {})
  });

  // ── Place a multi-trainer combined group ──────────────────────────────────
  const placeMultiTrainerGroup = (
    day: number,
    periodIds: number[],
    primaryTrainerId: number,
    primaryClassId: number,
    combinedAssignments: any[],
    allClassIds: number[],
    allowedRooms: any[],
    groupId: string
  ): number | null => {
    if (allowedRooms.length === 0) return null;

    const allTrainerIds = [primaryTrainerId, ...combinedAssignments.map((ca: any) => ca.users.id)];

    const selectedRoom = allowedRooms.find(room =>
      periodIds.every(periodId => {
        if (scheduledSlots.has(`room-${day}-${periodId}-${room.id}`)) return false;
        if (scheduledSlots.has(`room-group-${day}-${periodId}-${room.id}-${groupId}`)) return false;
        return allTrainerIds.every(
          tid => !scheduledSlots.has(`trainer-${day}-${periodId}-${tid}`)
        );
      })
    );

    if (!selectedRoom) return null;

    periodIds.forEach((periodId) => {
      markSlotUsed(day, periodId, selectedRoom.id, primaryTrainerId, allClassIds, groupId, true);
    });

    combinedAssignments.forEach((ca: any, memberIdx: number) => {
      const caTrainerId = ca.users.id;
      const caClassId = ca.classsubjects.classes.id;
      const isLastMember = memberIdx === combinedAssignments.length - 1;
      periodIds.forEach((periodId, periodIdx) => {
        const isLastOverall = isLastMember && periodIdx === periodIds.length - 1;
        markSlotUsed(day, periodId, selectedRoom.id, caTrainerId, [caClassId], groupId, isLastOverall);
      });
    });

    return selectedRoom.id;
  };

  // ── Helper: place a single period slot ───────────────────────────────────
  const placeSinglePeriod = (
    day: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number,
    combinedAssignments: any[],
    combinedClassIds: number[],
    allClassIds: number[],
    allowedRooms: any[]
  ): boolean => {
    const sessionGroupId = allClassIds.length > 1 ? randomUUID() : undefined;

    const shuffledPeriods = shuffleArray(lessonPeriods);
    for (const period of shuffledPeriods) {
      const availableRooms = allowedRooms.filter(room =>
        isSlotAvailable(day, period.id, room.id, trainerId, allClassIds)
      );
      if (availableRooms.length === 0) continue;

      const selectedRoom = availableRooms[Math.floor(Math.random() * availableRooms.length)];

      slotsToCreate.push(makeSlot(
        term_id, primaryClassId, subjectId, trainerId,
        selectedRoom.id, period.id, day,
        allClassIds.length > 1 ? allClassIds : undefined,
        sessionGroupId
      ));
      markSlotUsed(
        day, period.id, selectedRoom.id, trainerId, allClassIds,
        sessionGroupId, true,
        combinedAssignments.map((ca: any) => ca.users.id)
      );

      combinedAssignments.forEach((ca: any) => {
        slotsToCreate.push(makeSlot(
          term_id,
          ca.classsubjects.classes.id,
          ca.classsubjects.subjects.id,
          ca.users.id,
          selectedRoom.id,
          period.id,
          day,
          allClassIds,
          sessionGroupId
        ));
        usedTrainers.add(ca.users.id);
      });

      usedRooms.add(selectedRoom.id);
      usedTrainers.add(trainerId);
      return true;
    }
    return false;
  };

  // ── Helper: place a consecutive group ────────────────────────────────────
  const placeConsecutiveGroup = (
    day: number,
    groupSize: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number,
    combinedAssignments: any[],
    combinedClassIds: number[],
    allClassIds: number[],
    allowedRooms: any[]
  ): boolean => {
    const consecutiveGroups = shuffleArray(getConsecutivePeriodGroups(groupSize));
    const sessionGroupId = randomUUID();

    for (const periodGroup of consecutiveGroups) {
      const roomFreeForAll = allowedRooms.find(room =>
        periodGroup.every(periodId =>
          isSlotAvailable(day, periodId, room.id, trainerId, allClassIds)
        )
      );
      if (!roomFreeForAll) continue;

      periodGroup.forEach(periodId => {
        slotsToCreate.push(makeSlot(
          term_id, primaryClassId, subjectId, trainerId,
          roomFreeForAll.id, periodId, day,
          allClassIds.length > 1 ? allClassIds : undefined,
          sessionGroupId
        ));
        markSlotUsed(
          day, periodId, roomFreeForAll.id, trainerId, allClassIds,
          sessionGroupId, true,
          combinedAssignments.map((ca: any) => ca.users.id)
        );
      });

      combinedAssignments.forEach((ca: any) => {
        periodGroup.forEach(periodId => {
          slotsToCreate.push(makeSlot(
            term_id,
            ca.classsubjects.classes.id,
            ca.classsubjects.subjects.id,
            ca.users.id,
            roomFreeForAll.id,
            periodId,
            day,
            allClassIds,
            sessionGroupId
          ));
        });
        usedTrainers.add(ca.users.id);
      });

      usedRooms.add(roomFreeForAll.id);
      usedTrainers.add(trainerId);
      return true;
    }
    return false;
  };

  // ── Helper: place a multi-trainer single ─────────────────────────────────
  const placeMTSingle = (
    day: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number,
    combinedAssignments: any[],
    combinedClassIds: number[],
    allClassIds: number[],
    allowedRooms: any[],
    combinationGroupId: string
  ): boolean => {
    const shuffledPeriods = shuffleArray(lessonPeriods);
    for (const period of shuffledPeriods) {
      const roomId = placeMultiTrainerGroup(
        day, [period.id], trainerId, primaryClassId,
        combinedAssignments, allClassIds, allowedRooms, combinationGroupId
      );
      if (roomId === null) continue;

      slotsToCreate.push(makeSlot(
        term_id, primaryClassId, subjectId, trainerId,
        roomId, period.id, day,
        allClassIds.length > 1 ? allClassIds : undefined,
        combinationGroupId
      ));

      combinedAssignments.forEach((ca: any) => {
        slotsToCreate.push(makeSlot(
          term_id,
          ca.classsubjects.classes.id,
          ca.classsubjects.subjects.id,
          ca.users.id,
          roomId,
          period.id,
          day,
          allClassIds,
          combinationGroupId
        ));
        usedTrainers.add(ca.users.id);
      });

      usedRooms.add(roomId);
      usedTrainers.add(trainerId);
      return true;
    }
    return false;
  };

  // ── Helper: place a multi-trainer consecutive group ───────────────────────
  const placeMTGroup = (
    day: number,
    groupSize: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number,
    combinedAssignments: any[],
    combinedClassIds: number[],
    allClassIds: number[],
    allowedRooms: any[],
    combinationGroupId: string
  ): boolean => {
    const consecutiveGroups = shuffleArray(getConsecutivePeriodGroups(groupSize));

    for (const periodGroup of consecutiveGroups) {
      const roomId = placeMultiTrainerGroup(
        day, periodGroup, trainerId, primaryClassId,
        combinedAssignments, allClassIds, allowedRooms, combinationGroupId
      );
      if (roomId === null) continue;

      periodGroup.forEach(periodId => {
        slotsToCreate.push(makeSlot(
          term_id, primaryClassId, subjectId, trainerId,
          roomId, periodId, day,
          allClassIds.length > 1 ? allClassIds : undefined,
          combinationGroupId
        ));
      });

      combinedAssignments.forEach((ca: any) => {
        periodGroup.forEach(periodId => {
          slotsToCreate.push(makeSlot(
            term_id,
            ca.classsubjects.classes.id,
            ca.classsubjects.subjects.id,
            ca.users.id,
            roomId,
            periodId,
            day,
            allClassIds,
            combinationGroupId
          ));
        });
        usedTrainers.add(ca.users.id);
      });

      usedRooms.add(roomId);
      usedTrainers.add(trainerId);
      return true;
    }
    return false;
  };

  // ── Shared placement helper ───────────────────────────────────────────────
  const placeSession = (
    assignment: any,
    sessionNum: number,
    isGroup: boolean,
    groupSize: number,
    day: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number,
    allowedRooms: any[]
  ): { placed: boolean; periodsPlaced: number } => {
    const combosBySession = combinationMap.get(assignment.id);
    const combinedAssignmentIds = combosBySession?.get(sessionNum) ?? [];
    const combinedAssignments = combinedAssignmentIds
      .map((id: number) => assignmentById.get(id))
      .filter(Boolean);
    const combinedClassIds = combinedAssignments.map((ca: any) => ca.classsubjects.classes.id);
    const allClassIds = [primaryClassId, ...combinedClassIds];
    const isMultiTrainer = combinedAssignments.some((ca: any) => ca.users.id !== trainerId);
    const isCombined = combinedAssignments.length > 0;
    const combinationGroupId = (isMultiTrainer || isCombined) ? randomUUID() : undefined;

    let placed = false;

    if (isGroup) {
      if (isMultiTrainer) {
        placed = placeMTGroup(
          day, groupSize, trainerId, primaryClassId, subjectId,
          combinedAssignments, combinedClassIds, allClassIds,
          allowedRooms, combinationGroupId!
        );
      } else {
        placed = placeConsecutiveGroup(
          day, groupSize, trainerId, primaryClassId, subjectId,
          combinedAssignments, combinedClassIds, allClassIds,
          allowedRooms
        );
      }
      return { placed, periodsPlaced: placed ? groupSize : 0 };
    } else {
      if (isMultiTrainer) {
        placed = placeMTSingle(
          day, trainerId, primaryClassId, subjectId,
          combinedAssignments, combinedClassIds, allClassIds,
          allowedRooms, combinationGroupId!
        );
      } else {
        placed = placeSinglePeriod(
          day, trainerId, primaryClassId, subjectId,
          combinedAssignments, combinedClassIds, allClassIds,
          allowedRooms
        );
      }
      return { placed, periodsPlaced: placed ? 1 : 0 };
    }
  };

  // ── Unified helper — place with a specific block size override ────────────
  const tryPlaceWithBlockSize = (
    blockSize: number,
    day: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number,
    sessionNum: number,
    assignment: any,
    allowedRooms: any[]
  ): number => {
    const combosBySession = combinationMap.get(assignment.id);
    const combinedAssignmentIds = combosBySession?.get(sessionNum) ?? [];
    const combinedAssignments = combinedAssignmentIds
      .map((id: number) => assignmentById.get(id))
      .filter(Boolean);
    const combinedClassIds = combinedAssignments.map((ca: any) => ca.classsubjects.classes.id);
    const allClassIds = [primaryClassId, ...combinedClassIds];
    const isMultiTrainer = combinedAssignments.some((ca: any) => ca.users.id !== trainerId);
    const isCombined = combinedAssignments.length > 0;
    const combinationGroupId = (isMultiTrainer || isCombined) ? randomUUID() : undefined;

    if (blockSize === 1) {
      const placed = isMultiTrainer
        ? placeMTSingle(day, trainerId, primaryClassId, subjectId, combinedAssignments, combinedClassIds, allClassIds, allowedRooms, combinationGroupId!)
        : placeSinglePeriod(day, trainerId, primaryClassId, subjectId, combinedAssignments, combinedClassIds, allClassIds, allowedRooms);
      return placed ? 1 : 0;
    } else {
      const placed = isMultiTrainer
        ? placeMTGroup(day, blockSize, trainerId, primaryClassId, subjectId, combinedAssignments, combinedClassIds, allClassIds, allowedRooms, combinationGroupId!)
        : placeConsecutiveGroup(day, blockSize, trainerId, primaryClassId, subjectId, combinedAssignments, combinedClassIds, allClassIds, allowedRooms);
      return placed ? blockSize : 0;
    }
  };

  // ── Tiered placement wrappers ─────────────────────────────────────────────
  const placeSessionTiered = (
    assignment: any,
    sessionNum: number,
    isGroup: boolean,
    groupSize: number,
    day: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number
  ): { placed: boolean; periodsPlaced: number } => {
    const tiers = subjectRoomTiers.get(subjectId) ?? [rooms];
    for (const tierRooms of tiers) {
      const result = placeSession(
        assignment, sessionNum, isGroup, groupSize,
        day, trainerId, primaryClassId, subjectId, tierRooms
      );
      if (result.placed) return result;
    }
    return { placed: false, periodsPlaced: 0 };
  };

  const tryPlaceWithBlockSizeTiered = (
    blockSize: number,
    day: number,
    trainerId: number,
    primaryClassId: number,
    subjectId: number,
    sessionNum: number,
    assignment: any
  ): number => {
    const tiers = subjectRoomTiers.get(subjectId) ?? [rooms];
    for (const tierRooms of tiers) {
      const n = tryPlaceWithBlockSize(
        blockSize, day, trainerId, primaryClassId,
        subjectId, sessionNum, assignment, tierRooms
      );
      if (n > 0) return n;
    }
    return 0;
  };

  // ── Main scheduling loop ──────────────────────────────────────────────────
  for (const assignment of sortedAssignments) {
    if (secondaryAssignmentIds.has(assignment.id)) continue;

    const classSubject = assignment.classsubjects;
    const subject = classSubject.subjects;
    const classData = classSubject.classes;
    const trainer = assignment.users;

    const trainerId = trainer.id;
    const primaryClassId = classData.id;
    const subjectId = subject.id;

    const sessionsPerWeek: number =
      assignment.sessions_per_week ??
      classSubject.sessions_per_week ??
      subject.sessions_per_week ?? 1;

    const lessonType: string =
      assignment.lesson_type ??
      classSubject.lesson_type ??
      subject.lesson_type ?? 'single';

    const groupSize = lessonType === 'triple' ? 3 : lessonType === 'double' ? 2 : 1;
    const numGroups  = groupSize > 1 ? Math.floor(sessionsPerWeek / groupSize) : 0;
    const numSingles = groupSize > 1 ? sessionsPerWeek % groupSize : sessionsPerWeek;

    let sessionsScheduled = 0;
    const usedDaysForGroups = new Set<number>();
    const usedDaysForSingles = new Set<number>();
    const shuffledDays = shuffleArray([...workingDaysArray]);
    let sessionNum = 1;

    // Phase 1: consecutive groups
    for (let g = 0; g < numGroups; g++) {
      const daysToTry = shuffledDays.filter(d => !usedDaysForGroups.has(d));
      let placed = false;
      for (const day of daysToTry) {
        if (placed) break;
        const result = placeSessionTiered(
          assignment, sessionNum, true, groupSize,
          day, trainerId, primaryClassId, subjectId
        );
        if (result.placed) {
          usedDaysForGroups.add(day);
          usedDaysForSingles.add(day);
          sessionsScheduled += result.periodsPlaced;
          placed = true;
        }
      }
      sessionNum++;
    }

    // Phase 2: remainder singles
    for (let s = 0; s < numSingles; s++) {
      const daysToTry = [
        ...shuffledDays.filter(d => !usedDaysForSingles.has(d)),
        ...shuffledDays.filter(d => usedDaysForSingles.has(d))
      ];
      let placed = false;
      for (const day of daysToTry) {
        if (placed) break;
        const result = placeSessionTiered(
          assignment, sessionNum, false, groupSize,
          day, trainerId, primaryClassId, subjectId
        );
        if (result.placed) {
          usedDaysForSingles.add(day);
          sessionsScheduled += result.periodsPlaced;
          placed = true;
        }
      }
      sessionNum++;
    }

    if (sessionsScheduled < sessionsPerWeek) {
      skippedAssignments.push({
        trainer_assignment_id: assignment.id,
        subject_code: subject.code,
        subject_name: subject.name,
        class_code: classData.code,
        trainer_name: trainer.name,
        scheduled: sessionsScheduled,
        requested: sessionsPerWeek,
        reason: sessionsScheduled === 0
          ? `No slots found — tiers=${subjectRoomTiers.get(subjectId)?.length ?? 0}, type=${lessonType}`
          : `Only ${sessionsScheduled}/${sessionsPerWeek} periods placed after main pass`
      });
    }
  }

  // ── Pass 2: Backfill ──────────────────────────────────────────────────────
  const afterBackfill: SkippedAssignment[] = [];

  for (const skipped of [...skippedAssignments]) {
    const assignment = assignmentById.get(skipped.trainer_assignment_id);
    if (!assignment || secondaryAssignmentIds.has(assignment.id)) {
      afterBackfill.push(skipped);
      continue;
    }

    const classSubject = assignment.classsubjects;
    const subject = classSubject.subjects;
    const trainerId = assignment.users.id;
    const primaryClassId = classSubject.classes.id;
    const subjectId = subject.id;

    const sessionsPerWeek: number =
      assignment.sessions_per_week ??
      classSubject.sessions_per_week ??
      subject.sessions_per_week ?? 1;

    const lessonType: string =
      assignment.lesson_type ??
      classSubject.lesson_type ??
      subject.lesson_type ?? 'single';

    const groupSize = lessonType === 'triple' ? 3 : lessonType === 'double' ? 2 : 1;
    const numGroups = groupSize > 1 ? Math.floor(sessionsPerWeek / groupSize) : 0;

    let alreadyScheduled = skipped.scheduled;
    let stillNeeded = sessionsPerWeek - alreadyScheduled;

    const groupsPlaced = groupSize > 1 ? Math.floor(alreadyScheduled / groupSize) : 0;
    const singlesPlaced = groupSize > 1 ? alreadyScheduled % groupSize : alreadyScheduled;
    let sessionNum = groupsPlaced + singlesPlaced + 1;

    const backfillDays = shuffleArray([...workingDaysArray, ...workingDaysArray]);
    const usedGroupDays = new Set<number>();

    while (stillNeeded > 0) {
      const isGroup = groupSize > 1 && sessionNum <= numGroups;
      let placed = false;

      const daysToTry = isGroup
        ? backfillDays.filter(d => !usedGroupDays.has(d))
        : backfillDays;

      for (const day of daysToTry) {
        if (placed) break;
        const result = placeSessionTiered(
          assignment, sessionNum, isGroup, groupSize,
          day, trainerId, primaryClassId, subjectId
        );
        if (result.placed) {
          if (isGroup) usedGroupDays.add(day);
          alreadyScheduled += result.periodsPlaced;
          stillNeeded -= result.periodsPlaced;
          placed = true;
        }
      }

      if (!placed) break;
      sessionNum++;
    }

    if (alreadyScheduled < sessionsPerWeek) {
      afterBackfill.push({
        ...skipped,
        scheduled: alreadyScheduled,
        reason: alreadyScheduled === 0
          ? skipped.reason
          : `Only ${alreadyScheduled}/${sessionsPerWeek} periods placed after backfill`
      });
    }
  }

  // ── Pass 3: Guarantee ─────────────────────────────────────────────────────
  const afterGuarantee: SkippedAssignment[] = [];

  for (const skipped of afterBackfill) {
    const assignment = assignmentById.get(skipped.trainer_assignment_id);
    if (!assignment || secondaryAssignmentIds.has(assignment.id)) {
      afterGuarantee.push(skipped);
      continue;
    }

    const classSubject    = assignment.classsubjects;
    const subject         = classSubject.subjects;
    const trainerId       = assignment.users.id;
    const primaryClassId  = classSubject.classes.id;
    const subjectId       = subject.id;

    const sessionsPerWeek: number =
      assignment.sessions_per_week ??
      classSubject.sessions_per_week ??
      subject.sessions_per_week ?? 1;

    const lessonType: string =
      assignment.lesson_type ??
      classSubject.lesson_type ??
      subject.lesson_type ?? 'single';

    const originalGroupSize =
      lessonType === 'triple' ? 3 : lessonType === 'double' ? 2 : 1;

    const allDays = shuffleArray([
      ...workingDaysArray,
      ...workingDaysArray,
      ...workingDaysArray,
    ]);

    const blockSizesToTry =
      originalGroupSize === 3 ? [3, 2, 1] :
      originalGroupSize === 2 ? [2, 1]    : [1];

    let stillNeeded   = sessionsPerWeek - skipped.scheduled;
    let nowScheduled  = skipped.scheduled;
    let sessionNum    = skipped.scheduled + 1;

    while (stillNeeded > 0) {
      let placedThisSession = false;

      outer:
      for (const blockSize of blockSizesToTry) {
        for (const day of allDays) {
          const periodsPlaced = tryPlaceWithBlockSizeTiered(
            blockSize, day, trainerId, primaryClassId,
            subjectId, sessionNum, assignment
          );
          if (periodsPlaced > 0) {
            nowScheduled  += periodsPlaced;
            stillNeeded   -= periodsPlaced;
            sessionNum++;
            placedThisSession = true;
            break outer;
          }
        }
      }

      if (!placedThisSession) break;
    }

    if (nowScheduled < sessionsPerWeek) {
      afterGuarantee.push({
        trainer_assignment_id: assignment.id,
        subject_code:  subject.code,
        subject_name:  subject.name,
        class_code:    classSubject.classes.code,
        trainer_name:  assignment.users.name,
        scheduled:     nowScheduled,
        requested:     sessionsPerWeek,
        reason: nowScheduled === 0
          ? 'Trainer has no available periods in the entire week — trainer is overloaded'
          : `Only ${nowScheduled}/${sessionsPerWeek} periods placed after exhaustive guarantee pass`
      });
    }
  }

  // ── Pass 4: TFL/CNA ───────────────────────────────────────────────────────
  // Trainer isolation: overloaded trainer's collisions stay with them only.
  // Pass A: find a period where trainer is free → normal placement.
  // Pass B: trainer is fully loaded → mark class + room only, never trainer key.
  // ─────────────────────────────────────────────────────────────────────────
  const rnaRoom = rnaRoomId ? rooms.find((r: any) => r.id === rnaRoomId) : null;

  for (const skipped of afterGuarantee) {
    const assignment = assignmentById.get(skipped.trainer_assignment_id);
    if (!assignment || secondaryAssignmentIds.has(assignment.id)) continue;

    const classSubject = assignment.classsubjects;
    const subject = classSubject.subjects;
    const trainerId = assignment.users.id;
    const primaryClassId = classSubject.classes.id;
    const subjectId = subject.id;

    const sessionsPerWeek: number =
      assignment.sessions_per_week ??
      classSubject.sessions_per_week ??
      subject.sessions_per_week ?? 1;

    const lessonType: string =
      assignment.lesson_type ??
      classSubject.lesson_type ??
      subject.lesson_type ?? 'single';

    const originalGroupSize = lessonType === 'triple' ? 3 : lessonType === 'double' ? 2 : 1;
    const sessionsStillNeeded = sessionsPerWeek - skipped.scheduled;

    const trainerFreeAny = workingDaysArray.some(day =>
      lessonPeriods.some(p => !scheduledSlots.has(`trainer-${day}-${p.id}-${trainerId}`))
    );
    const fallbackStatus: 'TFL' | 'CNA' = !trainerFreeAny ? 'TFL' : 'CNA';

    const ntaDays = shuffleArray([
      ...workingDaysArray,
      ...workingDaysArray,
      ...workingDaysArray,
      ...workingDaysArray
    ]);

    let ntaPlaced = 0;
    let ntaSessionGroupId: string | null = null;

    while (ntaPlaced < sessionsStillNeeded) {
      const remaining = sessionsStillNeeded - ntaPlaced;
      const blockSizesToTry =
        originalGroupSize === 3 && remaining >= 3 ? [3, 2, 1] :
        originalGroupSize >= 2 && remaining >= 2 ? [2, 1] : [1];

      let sessionPlaced = false;

      outerNTA:
      for (const blockSize of blockSizesToTry) {
        if (blockSize > 1) {
          const consecutiveGroups = shuffleArray(getConsecutivePeriodGroups(blockSize));
          ntaSessionGroupId = randomUUID();

          // Pass A: trainer free, class free, any room free
          for (const day of ntaDays) {
            for (const periodGroup of consecutiveGroups) {
              const freeRoomWithTrainer = rooms.find(room =>
                periodGroup.every(periodId =>
                  isSlotAvailable(day, periodId, room.id, trainerId, [primaryClassId])
                )
              );
              if (!freeRoomWithTrainer) continue;

              periodGroup.forEach(periodId => {
                slotsToCreate.push(makeSlot(
                  term_id, primaryClassId, subjectId, trainerId,
                  freeRoomWithTrainer.id, periodId, day,
                  undefined, ntaSessionGroupId!, fallbackStatus
                ));
                markSlotUsed(day, periodId, freeRoomWithTrainer.id, trainerId, [primaryClassId]);
              });
              ntaPlaced += blockSize;
              sessionPlaced = true;
              break outerNTA;
            }
          }

          // Pass B: trainer busy — any free room, class free
          // Only marks class + room — collision stays with this trainer only
          for (const day of ntaDays) {
            for (const periodGroup of consecutiveGroups) {
              const freeRoomIgnoreTrainer = rooms.find(room =>
                periodGroup.every(periodId =>
                  isSlotAvailableIgnoreTrainer(day, periodId, room.id, [primaryClassId])
                )
              );
              if (!freeRoomIgnoreTrainer) continue;

              periodGroup.forEach(periodId => {
                slotsToCreate.push(makeSlot(
                  term_id, primaryClassId, subjectId, trainerId,
                  freeRoomIgnoreTrainer.id, periodId, day,
                  undefined, ntaSessionGroupId!, fallbackStatus
                ));
                markSlotUsedIgnoreTrainer(day, periodId, freeRoomIgnoreTrainer.id, [primaryClassId]);
              });
              ntaPlaced += blockSize;
              sessionPlaced = true;
              break outerNTA;
            }
          }

        } else {
          // Pass A: trainer free, any room
          for (const day of ntaDays) {
            const shuffledPeriods = shuffleArray(lessonPeriods);
            for (const period of shuffledPeriods) {
              const freeRoom = rooms.find(room =>
                isSlotAvailable(day, period.id, room.id, trainerId, [primaryClassId])
              );
              if (!freeRoom) continue;

              slotsToCreate.push(makeSlot(
                term_id, primaryClassId, subjectId, trainerId,
                freeRoom.id, period.id, day,
                undefined, undefined, fallbackStatus
              ));
              markSlotUsed(day, period.id, freeRoom.id, trainerId, [primaryClassId]);
              ntaPlaced += 1;
              sessionPlaced = true;
              break outerNTA;
            }
          }

          // Pass B: trainer busy — any free room, class free
          if (!sessionPlaced) {
            for (const day of ntaDays) {
              const shuffledPeriods = shuffleArray(lessonPeriods);
              for (const period of shuffledPeriods) {
                const freeRoom = rooms.find(room =>
                  isSlotAvailableIgnoreTrainer(day, period.id, room.id, [primaryClassId])
                );
                if (!freeRoom) continue;

                slotsToCreate.push(makeSlot(
                  term_id, primaryClassId, subjectId, trainerId,
                  freeRoom.id, period.id, day,
                  undefined, undefined, fallbackStatus
                ));
                markSlotUsedIgnoreTrainer(day, period.id, freeRoom.id, [primaryClassId]);
                ntaPlaced += 1;
                sessionPlaced = true;
                break outerNTA;
              }
            }
          }
        }
      }

      if (!sessionPlaced) {
        console.warn(
          `⚠️ ${fallbackStatus} placement failed for ${subject.code} / ${classSubject.classes.code} ` +
          `— class has no free periods remaining in the week`
        );
        break;
      }
    }
  }

  skippedAssignments.length = 0;

  // ── Stats ─────────────────────────────────────────────────────────────────
  const primarySkippedCount = 0;
  const primaryCount = trainerAssignments.length - secondaryAssignmentIds.size;

  const stats = {
    slots_created: slotsToCreate.length,
    trainer_assignments_processed: primaryCount,
    combined_assignments: secondaryAssignmentIds.size,
    assignments_fully_scheduled: primaryCount - primarySkippedCount,
    trainers_assigned: usedTrainers.size,
    rooms_used: usedRooms.size,
    subjects_scheduled: new Set(slotsToCreate.map(s => s.subject_id)).size,
    assignments_partially_scheduled: 0,
    double_triple_sessions: slotsToCreate.filter(s => s.session_group_id).length,
    combined_slots: slotsToCreate.filter(
      s => s.combined_class_ids && s.combined_class_ids.length > 0
    ).length,
    nta_slots: slotsToCreate.filter(s => s.status === 'TFL' || s.status === 'CNA').length,
    tfl_slots: slotsToCreate.filter(s => s.status === 'TFL').length,
    cna_slots: slotsToCreate.filter(s => s.status === 'CNA').length,
    room_fallback_slots: slotsToCreate.filter(s => s.is_room_fallback).length,
  };

  return { slots: slotsToCreate, stats, skipped: skippedAssignments };
}

// ─── POST /api/timetable/generate ─────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth();
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    if (!authResult.user || !hasTimetableAdminAccess(authResult.user)) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin or Timetable Admin access required.' },
        { status: 403 }
      );
    }

    const body: GenerationSettings = await request.json();
    const { term_id, min_classes_per_day, regenerate, department } = body;

    if (!term_id) {
      return NextResponse.json({ error: 'term_id is required' }, { status: 400 });
    }
    if (!min_classes_per_day || min_classes_per_day < 1) {
      return NextResponse.json(
        { error: 'min_classes_per_day must be at least 1' },
        { status: 400 }
      );
    }

    const term = await db.terms.findUnique({ where: { id: term_id } });
    if (!term) {
      return NextResponse.json({ error: 'Term not found' }, { status: 404 });
    }

    let workingDaysArray: number[] = [1, 2, 3, 4, 5];
    try {
      if (term.working_days) {
        workingDaysArray = Array.isArray(term.working_days)
          ? term.working_days
          : JSON.parse(term.working_days as string);
      }
    } catch {
      console.warn('Failed to parse working_days, using default Mon-Fri');
    }

    // ── Fetch ALL trainer assignments first ───────────────────────────────────
    const termClasses = await db.termclasses.findMany({
      where: { term_id },
      include: {
        classes: { select: { id: true, name: true, code: true, is_active: true } }
      }
    });

    const activeTermClasses = termClasses.filter(tc => tc.classes.is_active);
    const classIds = activeTermClasses.map(tc => tc.class_id);

    if (classIds.length === 0) {
      return NextResponse.json(
        { error: 'No active classes assigned to this term' },
        { status: 400 }
      );
    }

    const allClassSubjects = await db.classsubjects.findMany({
      where: { class_id: { in: classIds }, term_id, is_active: true },
      select: { id: true }
    });
    const classSubjectIds = allClassSubjects.map(cs => cs.id);

    const trainerAssignments = await db.trainersubjectassignments.findMany({
      where: {
        term_id,
        is_active: true,
        class_subject_id: { in: classSubjectIds }
      },
      include: {
        classsubjects: {
          include: {
            classes: { select: { id: true, name: true, code: true } },
            subjects: {
              select: {
                id: true,
                name: true,
                code: true,
                credit_hours: true,
                sessions_per_week: true,
                lesson_type: true,
                department: true   // ← needed for department filter
              }
            }
          }
        },
        users: { select: { id: true, name: true } }
      }
    });

    if (trainerAssignments.length === 0) {
      return NextResponse.json(
        { error: 'No trainer assignments found. Trainers must select their subjects first.' },
        { status: 400 }
      );
    }

    // ── Department filter ─────────────────────────────────────────────────────
    // Master timetable: department is null/undefined — use all assignments.
    // Department timetable: filter to only that department's subjects.
    const filteredAssignments = department
      ? trainerAssignments.filter(ta =>
          ta.classsubjects.subjects.department?.toLowerCase() === department.toLowerCase()
        )
      : trainerAssignments;

    if (filteredAssignments.length === 0) {
      return NextResponse.json(
        { error: department
            ? `No active assignments found for department: ${department}`
            : 'No trainer assignments found.'
        },
        { status: 400 }
      );
    }

    // ── Regenerate / existing slots check ─────────────────────────────────────
    if (regenerate) {
      const now = new Date();
      const termStart = new Date(term.start_date);
      const daysSinceStart = Math.floor(
        (now.getTime() - termStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceStart > 14) {
        return NextResponse.json(
          { error: 'Cannot regenerate: More than 2 weeks since term start' },
          { status: 403 }
        );
      }

      if (department) {
        // Only delete this department's slots — leave other departments intact
        const deptSubjectIds = filteredAssignments.map(ta => ta.classsubjects.subjects.id);
        await db.timetableslots.deleteMany({
          where: { term_id, subject_id: { in: deptSubjectIds } }
        });
      } else {
        // Master regenerate — delete everything
        await db.timetableslots.deleteMany({ where: { term_id } });
      }
    } else {
      if (department) {
        // Check if this department already has slots
        const deptSubjectIds = filteredAssignments.map(ta => ta.classsubjects.subjects.id);
        const existingSlots = await db.timetableslots.count({
          where: { term_id, subject_id: { in: deptSubjectIds } }
        });
        if (existingSlots > 0) {
          return NextResponse.json(
            { error: `${department} already has a timetable. Use regenerate option to replace it.` },
            { status: 409 }
          );
        }
      } else {
        const existingSlots = await db.timetableslots.count({ where: { term_id } });
        if (existingSlots > 0) {
          return NextResponse.json(
            { error: 'A confirmed timetable already exists. Use regenerate option if within 2 weeks of term start.' },
            { status: 409 }
          );
        }
      }
    }

    // ── Delete existing drafts for this scope ─────────────────────────────────
    // For department generation, delete only drafts generated for this department.
    // For master, delete all drafts.
    await db.timetabledrafts.deleteMany({ where: { term_id } });

    // ── Fetch combinations scoped to filtered assignments ─────────────────────
    const filteredAssignmentIds = filteredAssignments.map(ta => ta.id);

    const allAssignmentIds = trainerAssignments.map(ta => ta.id);
    const subjectCombinations = await db.subjectcombinations.findMany({
      where: {
        OR: [
          { primary_assignment_id: { in: allAssignmentIds } },
          { combined_assignment_id: { in: allAssignmentIds } }
        ]
      },
      select: {
        id: true,
        subject_id: true,
        session_number: true,
        primary_assignment_id: true,
        combined_assignment_id: true
      }
    });

    // Filter combinations to only those relevant to the filtered assignments
    const filteredCombinations = subjectCombinations.filter(sc =>
      filteredAssignmentIds.includes(sc.primary_assignment_id) ||
      filteredAssignmentIds.includes(sc.combined_assignment_id)
    );

    // ── Rooms ─────────────────────────────────────────────────────────────────
    const rooms = await db.rooms.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        capacity: true,
        room_type: true,
        department: true,
        subjectrooms: { select: { subject_id: true } }
      }
    });

    if (rooms.length === 0) {
      return NextResponse.json(
        { error: 'No active rooms available' },
        { status: 400 }
      );
    }

    // ── Locate RNA room ───────────────────────────────────────────────────────
    const rnaRoom = rooms.find((r: any) =>
      r.name?.toUpperCase() === 'RNA' ||
      (r.room_type === 'lecture_hall' && r.name?.toUpperCase().includes('RNA'))
    ) ?? null;
    const rnaRoomId: number | null = rnaRoom?.id ?? null;

    // ── Build subject room tiers from filtered assignments ────────────────────
    const subjectIdsToSchedule = new Set(
      filteredAssignments.map(ta => ta.classsubjects.subjects.id)
    );

    const occupiedSlots = department
  ? await db.timetableslots.findMany({
      where: {
        term_id,
        subject_id: { notIn: [...subjectIdsToSchedule] }
      },
      select: {
        employee_id: true,
        class_id: true,
        room_id: true,
        lesson_period_id: true,
        day_of_week: true,
        session_group_id: true,
      }
    })
  : [];

    const subjectRoomAssignments = await db.subjectrooms.findMany({
      where: { subject_id: { in: [...subjectIdsToSchedule] } },
      select: { subject_id: true, room_id: true }
    });

    const explicitSubjectRoomMap = new Map<number, number[]>();
    subjectRoomAssignments.forEach(sr => {
      const existing = explicitSubjectRoomMap.get(sr.subject_id) ?? [];
      existing.push(sr.room_id);
      explicitSubjectRoomMap.set(sr.subject_id, existing);
    });

    const subjectDepts = await db.subjects.findMany({
      where: { id: { in: [...subjectIdsToSchedule] } },
      select: { id: true, department: true }
    });
    const subjectDeptMap = new Map<number, string | null>(
      subjectDepts.map(s => [s.id, s.department])
    );

    // ── Build 4-tier room priority map ────────────────────────────────────────
    const subjectRoomTiers = new Map<number, any[][]>();
    const rnaOnlySubjectIds = new Set<number>();

    for (const subjectId of subjectIdsToSchedule) {
      const dept        = subjectDeptMap.get(subjectId);
      const explicitIds = explicitSubjectRoomMap.get(subjectId) ?? [];
      const tiers: any[][] = [];

      if (explicitIds.length > 0) {
        const tier0 = rooms.filter((r: any) => explicitIds.includes(r.id));

        const inactiveExplicitIds = explicitIds.filter(
          id => !rooms.some((r: any) => r.id === id)
        );
        if (inactiveExplicitIds.length > 0) {
          console.warn(
            `⚠️ Subject id=${subjectId} has explicit rooms [${inactiveExplicitIds}] ` +
            `that are inactive or missing — they will be skipped`
          );
        }

        if (tier0.length > 0) tiers.push(tier0);
        if (rnaRoomId && rnaRoom) tiers.push([rnaRoom]);
      } else {
        if (dept) {
          const tier1 = rooms.filter((r: any) =>
            r.department?.toLowerCase() === dept.toLowerCase() &&
            r.department?.toLowerCase() !== 'all'
          );
          if (tier1.length > 0) tiers.push(tier1);
        }

        const tier2 = rooms.filter((r: any) =>
          r.department?.toLowerCase() === 'all' &&
          r.id !== rnaRoomId
        );
        if (tier2.length > 0) tiers.push(tier2);

        if (rnaRoomId && rnaRoom) tiers.push([rnaRoom]);
      }

      if (tiers.length > 0) {
        subjectRoomTiers.set(subjectId, tiers);
        if (tiers.length === 1 && rnaRoomId && tiers[0][0]?.id === rnaRoomId) {
          rnaOnlySubjectIds.add(subjectId);
        }
      } else {
        subjectRoomTiers.set(subjectId, [rooms]);
        console.warn(`⚠️  Subject id=${subjectId} has no eligible rooms and RNA is not configured — using all rooms`);
      }
    }

    // ── Lesson periods ────────────────────────────────────────────────────────
    const lessonPeriods = await db.lessonperiods.findMany({
      where: { is_active: true },
      orderBy: { start_time: 'asc' }
    });

    if (lessonPeriods.length === 0) {
      return NextResponse.json(
        { error: 'No active lesson periods configured' },
        { status: 400 }
      );
    }

    // ── Generate 3 drafts ─────────────────────────────────────────────────────
    const draftsData = [];
    for (let draftNumber = 1; draftNumber <= 3; draftNumber++) {
      let bestResult: ReturnType<typeof generateSlots> | null = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const result = generateSlots(
          filteredAssignments,
          workingDaysArray,
          lessonPeriods,
          rooms,
          subjectRoomTiers,
          filteredCombinations,
          term_id,
          rnaRoomId,
          rnaOnlySubjectIds,
          occupiedSlots   
        );
        if (!bestResult || result.stats.nta_slots < bestResult.stats.nta_slots) {
          bestResult = result;
        }
        if (bestResult.stats.nta_slots === 0) {
          break;
        }
      }

      const { slots, stats, skipped } = bestResult!;
      draftsData.push({ draftNumber, slots, stats, skipped });
    }

    const savedDrafts = await Promise.all(
      draftsData.map(({ draftNumber, slots, stats, skipped }) =>
        db.timetabledrafts.create({
          data: {
            term_id,
            draft_number: draftNumber,
            slots_json: slots as any,
            stats_json: stats as any,
            skipped_json: skipped.length > 0 ? (skipped as any) : null,
            generated_by: authResult.user!.id
          }
        })
      )
    );

    return NextResponse.json(
      {
        success: true,
        message: department
          ? `Generated 3 draft timetables for ${department} — ${term.name}.`
          : `Generated 3 draft timetables for ${term.name}. Review and select one to confirm.`,
        term_id,
        department: department ?? null,
        drafts: draftsData.map(({ draftNumber, stats, skipped }, i) => ({
          draft_id: savedDrafts[i].id,
          draft_number: draftNumber,
          stats,
          skipped_count: skipped.length,
          skipped_assignments: skipped.length > 0 ? skipped : undefined
        }))
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Error generating timetable:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate timetable',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}