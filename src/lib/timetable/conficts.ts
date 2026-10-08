import { db } from '@/lib/db/db';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface ConflictCheck {
  termId: number;
  day: number;
  periodId: number;
  roomId: number;
  trainerId: number;
  classIds: number[];              // primary class plus any combined classes
  excludeIds?: string[];           // the slot being edited
  excludeGroupId?: string | null;  // its combined/multi-period siblings
  skipRoom?: boolean;              // defaults to "is this a workshop?"
  skipTrainer?: boolean;
}

export async function findConflicts(c: ConflictCheck): Promise<string[]> {
  const skipRoom = c.skipRoom ?? (
    (await db.rooms.findUnique({ where: { id: c.roomId }, select: { room_type: true } }))
      ?.room_type?.toLowerCase() === 'workshop'
  );

  const clashOr: any[] = [{ class_id: { in: c.classIds } }];
  if (!skipRoom) clashOr.push({ room_id: c.roomId });
  if (!c.skipTrainer) clashOr.push({ employee_id: c.trainerId });

  const and: any[] = [{ OR: clashOr }];
  if (c.excludeIds?.length) and.push({ id: { notIn: c.excludeIds } });
  if (c.excludeGroupId) {
    // A plain `not` filter would also drop rows where session_group_id is null
    and.push({ OR: [{ session_group_id: null }, { session_group_id: { not: c.excludeGroupId } }] });
  }

  const [clashes, period] = await Promise.all([
    db.timetableslots.findMany({
      where: { term_id: c.termId, day_of_week: c.day, lesson_period_id: c.periodId, AND: and },
      include: {
        classes:  { select: { code: true } },
        subjects: { select: { name: true } },
        rooms:    { select: { name: true } },
        users:    { select: { name: true } },
      },
    }),
    db.lessonperiods.findUnique({ where: { id: c.periodId }, select: { name: true } }),
  ]);

  const when = `${DAY_NAMES[c.day]}, ${period?.name ?? 'this period'}`;
  const messages = new Set<string>();

  for (const s of clashes) {
    const what = `${s.subjects.name} (${s.classes.code})`;
    if (!skipRoom && s.room_id === c.roomId)
      messages.add(`Room ${s.rooms.name} is already booked on ${when} for ${what}.`);
    if (!c.skipTrainer && s.employee_id === c.trainerId)
      messages.add(`${s.users.name} is already teaching ${what} on ${when}.`);
    if (c.classIds.includes(s.class_id))
      messages.add(`${s.classes.code} already has ${s.subjects.name} on ${when}.`);
  }

  return [...messages];
}

// Returns the codes of any classes that don't take this subject this term.
// An empty array means every class is valid to combine.
export async function invalidCombinedClasses(
  termId: number,
  subjectId: number,
  classIds: number[]
): Promise<string[]> {
  if (!classIds.length) return [];

  const valid = await db.classsubjects.findMany({
    where: { term_id: termId, subject_id: subjectId, class_id: { in: classIds } },
    select: { class_id: true },
  });

  const validIds = new Set(valid.map(v => v.class_id));
  const invalid = classIds.filter(id => !validIds.has(id));
  if (!invalid.length) return [];

  const rows = await db.classes.findMany({
    where: { id: { in: invalid } },
    select: { code: true },
  });
  return rows.map(r => r.code);
}