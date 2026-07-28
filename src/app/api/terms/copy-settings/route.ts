// app/api/terms/copy-settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth-helper';
import { db } from '@/lib/db/db';

interface CopyOptions {
  term_classes: boolean;
  class_subjects: boolean;
  trainer_assignments: boolean;
  combinations: boolean;
}

/**
 * POST /api/terms/copy-settings
 * Copy term-scoped settings from one term to another.
 *
 * Body: {
 *   source_term_id: number,
 *   target_term_id: number,
 *   mode: 'preview' | 'execute',
 *   include: { term_classes, class_subjects, trainer_assignments, combinations }
 * }
 *
 * Merge strategy: existing rows in the target term are skipped, never overwritten.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (authResult.error || !authResult.user) {
      return NextResponse.json(
        { error: authResult.error || 'Unauthorized' },
        { status: authResult.status || 401 }
      );
    }

    const { user } = authResult;

    if (user.role !== 'admin' && !user.has_timetable_admin) {
      return NextResponse.json(
        { error: 'Unauthorized: Only admins and timetable admins can copy term settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { source_term_id, target_term_id, mode } = body;
    const include: CopyOptions = {
      term_classes: body.include?.term_classes ?? true,
      class_subjects: body.include?.class_subjects ?? true,
      trainer_assignments: body.include?.trainer_assignments ?? true,
      combinations: body.include?.combinations ?? true,
    };

    // ── Validation ──────────────────────────────────────────────
    if (!source_term_id || !target_term_id) {
      return NextResponse.json(
        { error: 'source_term_id and target_term_id are required' },
        { status: 400 }
      );
    }

    if (source_term_id === target_term_id) {
      return NextResponse.json(
        { error: 'Source and target term cannot be the same' },
        { status: 400 }
      );
    }

    if (mode !== 'preview' && mode !== 'execute') {
      return NextResponse.json(
        { error: "mode must be 'preview' or 'execute'" },
        { status: 400 }
      );
    }

    // Trainer assignments depend on class subjects existing in the target
    if (include.trainer_assignments && !include.class_subjects) {
      // Allowed — we'll map against whatever classsubjects already exist in the target
    }
    if (include.combinations && !include.trainer_assignments) {
      return NextResponse.json(
        { error: 'Combinations cannot be copied without trainer assignments' },
        { status: 400 }
      );
    }

    const [sourceTerm, targetTerm] = await Promise.all([
      db.terms.findUnique({ where: { id: source_term_id } }),
      db.terms.findUnique({ where: { id: target_term_id } }),
    ]);

    if (!sourceTerm) {
      return NextResponse.json({ error: 'Source term not found' }, { status: 404 });
    }
    if (!targetTerm) {
      return NextResponse.json({ error: 'Target term not found' }, { status: 404 });
    }

    const assignedBy = user.name || user.email || 'system';

    // ── Fetch source + target state ─────────────────────────────
    const [
      sourceTermClasses,
      sourceClassSubjects,
      sourceTSAs,
      targetTermClasses,
      targetClassSubjects,
      targetTSAs,
    ] = await Promise.all([
      db.termclasses.findMany({ where: { term_id: source_term_id } }),
      db.classsubjects.findMany({ where: { term_id: source_term_id } }),
      db.trainersubjectassignments.findMany({
        where: { term_id: source_term_id },
        include: { classsubjects: { select: { class_id: true, subject_id: true } } },
      }),
      db.termclasses.findMany({ where: { term_id: target_term_id } }),
      db.classsubjects.findMany({ where: { term_id: target_term_id } }),
      db.trainersubjectassignments.findMany({
        where: { term_id: target_term_id },
        include: { classsubjects: { select: { class_id: true, subject_id: true } } },
      }),
    ]);

    // Source combinations: scoped via their primary assignment's term
    const sourceTSAIds = sourceTSAs.map((t) => t.id);
    const sourceCombinations = sourceTSAIds.length
      ? await db.subjectcombinations.findMany({
          where: { primary_assignment_id: { in: sourceTSAIds } },
        })
      : [];

    // ── Compute the diff ────────────────────────────────────────

    // 1. Term classes
    const targetClassIdSet = new Set(targetTermClasses.map((tc) => tc.class_id));
    const termClassesToCopy = sourceTermClasses.filter(
      (tc) => !targetClassIdSet.has(tc.class_id)
    );

    // 2. Class subjects — keyed on class_id::subject_id
    const csKey = (classId: number, subjectId: number) => `${classId}::${subjectId}`;
    const targetCSMap = new Map(
      targetClassSubjects.map((cs) => [csKey(cs.class_id, cs.subject_id), cs])
    );
    const classSubjectsToCopy = sourceClassSubjects.filter(
      (cs) => !targetCSMap.has(csKey(cs.class_id, cs.subject_id))
    );

    // 3. Trainer assignments — keyed on trainer::class::subject
    const tsaKey = (trainerId: number, classId: number, subjectId: number) =>
      `${trainerId}::${classId}::${subjectId}`;
    const targetTSASet = new Set(
      targetTSAs.map((t) =>
        tsaKey(t.trainer_id, t.classsubjects.class_id, t.classsubjects.subject_id)
      )
    );

    // A source TSA is copyable if its (class, subject) will exist in the target —
    // either being copied now, or already there — and the trainer doesn't already have it
    const csAvailableInTarget = (classId: number, subjectId: number) =>
      targetCSMap.has(csKey(classId, subjectId)) ||
      (include.class_subjects &&
        classSubjectsToCopy.some(
          (cs) => cs.class_id === classId && cs.subject_id === subjectId
        ));

    const tsasToCopy = sourceTSAs.filter((t) => {
      const { class_id, subject_id } = t.classsubjects;
      return (
        !targetTSASet.has(tsaKey(t.trainer_id, class_id, subject_id)) &&
        csAvailableInTarget(class_id, subject_id)
      );
    });
    const tsasSkippedNoClassSubject = sourceTSAs.filter((t) => {
      const { class_id, subject_id } = t.classsubjects;
      return (
        !targetTSASet.has(tsaKey(t.trainer_id, class_id, subject_id)) &&
        !csAvailableInTarget(class_id, subject_id)
      );
    }).length;

    // 4. Combinations — both sides must be among the TSAs making it across
    const copyableTSAIdSet = new Set(tsasToCopy.map((t) => t.id));
    const combinationsToCopy = sourceCombinations.filter(
      (c) =>
        copyableTSAIdSet.has(c.primary_assignment_id) &&
        copyableTSAIdSet.has(c.combined_assignment_id)
    );

    const summary = {
      source_term: { id: sourceTerm.id, name: sourceTerm.name },
      target_term: { id: targetTerm.id, name: targetTerm.name },
      term_classes: {
        to_copy: include.term_classes ? termClassesToCopy.length : 0,
        skipped_existing: include.term_classes
          ? sourceTermClasses.length - termClassesToCopy.length
          : 0,
      },
      class_subjects: {
        to_copy: include.class_subjects ? classSubjectsToCopy.length : 0,
        skipped_existing: include.class_subjects
          ? sourceClassSubjects.length - classSubjectsToCopy.length
          : 0,
      },
      trainer_assignments: {
        to_copy: include.trainer_assignments ? tsasToCopy.length : 0,
        skipped_existing: include.trainer_assignments
          ? sourceTSAs.length - tsasToCopy.length - tsasSkippedNoClassSubject
          : 0,
        skipped_no_class_subject: include.trainer_assignments
          ? tsasSkippedNoClassSubject
          : 0,
      },
      combinations: {
        to_copy: include.combinations ? combinationsToCopy.length : 0,
        skipped: include.combinations
          ? sourceCombinations.length - combinationsToCopy.length
          : 0,
      },
    };

    // ── Preview mode: return the diff, touch nothing ────────────
    if (mode === 'preview') {
      return NextResponse.json({ success: true, data: summary });
    }

    // ── Execute mode: run the copy in a transaction ─────────────
    const now = new Date();

    await db.$transaction(
      async (tx) => {
        // 1. Term classes
        if (include.term_classes && termClassesToCopy.length) {
          await tx.termclasses.createMany({
            data: termClassesToCopy.map((tc) => ({
              term_id: target_term_id,
              class_id: tc.class_id,
              assigned_by: assignedBy,
            })),
            skipDuplicates: true,
          });
        }

        // 2. Class subjects — copied active and ready
        if (include.class_subjects && classSubjectsToCopy.length) {
          await tx.classsubjects.createMany({
            data: classSubjectsToCopy.map((cs) => ({
              class_id: cs.class_id,
              subject_id: cs.subject_id,
              term_id: target_term_id,
              assigned_by: assignedBy,
              is_active: true,
              activated_at: now,
              sessions_per_week: cs.sessions_per_week,
              lesson_type: cs.lesson_type,
            })),
            skipDuplicates: true,
          });
        }

        // Build old classsubject id → new classsubject id map
        const freshTargetCS = await tx.classsubjects.findMany({
          where: { term_id: target_term_id },
          select: { id: true, class_id: true, subject_id: true },
        });
        const newCSIdByKey = new Map(
          freshTargetCS.map((cs) => [csKey(cs.class_id, cs.subject_id), cs.id])
        );

        // 3. Trainer assignments
        if (include.trainer_assignments && tsasToCopy.length) {
          const tsaData = tsasToCopy
            .map((t) => {
              const newCSId = newCSIdByKey.get(
                csKey(t.classsubjects.class_id, t.classsubjects.subject_id)
              );
              if (!newCSId) return null;
              return {
                trainer_id: t.trainer_id,
                subject_id: t.subject_id,
                term_id: target_term_id,
                class_subject_id: newCSId,
                is_active: t.is_active,
                sessions_per_week: t.sessions_per_week,
                lesson_type: t.lesson_type,
              };
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);

          if (tsaData.length) {
            await tx.trainersubjectassignments.createMany({
              data: tsaData,
              skipDuplicates: true,
            });
          }
        }

        // 4. Combinations — remap both assignment ids through old→new TSA map
        if (include.combinations && combinationsToCopy.length) {
          const freshTargetTSAs = await tx.trainersubjectassignments.findMany({
            where: { term_id: target_term_id },
            include: {
              classsubjects: { select: { class_id: true, subject_id: true } },
            },
          });
          const newTSAIdByKey = new Map(
            freshTargetTSAs.map((t) => [
              tsaKey(t.trainer_id, t.classsubjects.class_id, t.classsubjects.subject_id),
              t.id,
            ])
          );
          const oldTSAById = new Map(sourceTSAs.map((t) => [t.id, t]));

          const mapOldTSAIdToNew = (oldId: number): number | null => {
            const old = oldTSAById.get(oldId);
            if (!old) return null;
            return (
              newTSAIdByKey.get(
                tsaKey(old.trainer_id, old.classsubjects.class_id, old.classsubjects.subject_id)
              ) ?? null
            );
          };

          const comboData = combinationsToCopy
            .map((c) => {
              const newPrimary = mapOldTSAIdToNew(c.primary_assignment_id);
              const newCombined = mapOldTSAIdToNew(c.combined_assignment_id);
              if (!newPrimary || !newCombined) return null;
              return {
                subject_id: c.subject_id,
                session_number: c.session_number,
                primary_assignment_id: newPrimary,
                combined_assignment_id: newCombined,
                created_by: assignedBy,
              };
            })
            .filter((d): d is NonNullable<typeof d> => d !== null);

          if (comboData.length) {
            await tx.subjectcombinations.createMany({
              data: comboData,
              skipDuplicates: true,
            });
          }
        }
      },
      { maxWait: 10000, timeout: 30000 }
    );

    return NextResponse.json({
      success: true,
      message: `Settings copied from "${sourceTerm.name}" to "${targetTerm.name}"`,
      data: summary,
    });
  } catch (error: any) {
    console.error('❌ Error copying term settings:', error);
    return NextResponse.json(
      { error: 'Failed to copy term settings', details: error.message },
      { status: 500 }
    );
  }
}