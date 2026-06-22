'use client';
import { TimetableSlot } from '@/lib/types/timetable';

export type SlotTypeFilter = 'all' | 'nta' | 'rna' | 'nta_rna';

interface PrintableTimetableProps {
  slots: TimetableSlot[];
  currentWeek: { start: Date; end: Date; weekNumber: number };
  termName?: string;
  groupBy: 'class' | 'trainer' | 'department' | 'room';
  printedClasses?: Array<{ id: number; name: string; code: string; department?: string }>;
  filterDepartment?: string;
  filterSlotType?: SlotTypeFilter;
}

const DAYS = [
  { name: 'Monday',    short: 'Mon', value: 1 },
  { name: 'Tuesday',   short: 'Tue', value: 2 },
  { name: 'Wednesday', short: 'Wed', value: 3 },
  { name: 'Thursday',  short: 'Thu', value: 4 },
  { name: 'Friday',    short: 'Fri', value: 5 },
];

const BREAK_LABELS = ['BREAK', 'LUNCH'];

const fmt = (t: Date | string) => new Date(t).toISOString().slice(11, 16);

function gapMinutes(
  a: { end_time: Date | string },
  b: { start_time: Date | string }
): number | null {
  const gap = Math.round(
    (new Date(b.start_time).getTime() - new Date(a.end_time).getTime()) / 60_000
  );
  return gap > 1 ? gap : null;
}

const isNTA          = (s: TimetableSlot) => (s as any).status === 'NTA';
const isRoomFallback = (s: TimetableSlot) => !!(s as any).is_room_fallback;

function slotTypeLabel(filter: SlotTypeFilter): string {
  if (filter === 'nta')     return 'NTA Slots';
  if (filter === 'rna')     return 'RNA Slots';
  if (filter === 'nta_rna') return 'NTA + RNA Slots';
  return '';
}

export default function PrintableTimetable({
  slots: rawSlots,
  currentWeek,
  termName,
  groupBy = 'class',
  printedClasses,
  filterDepartment,
  filterSlotType = 'all',
}: PrintableTimetableProps) {

  // ── Apply department filter first ────────────────────────────────────────
  const deptFiltered = filterDepartment
    ? rawSlots.filter(s => s.subjects?.department === filterDepartment)
    : rawSlots;

  // ── Apply slot type filter ────────────────────────────────────────────────
  const slots = (() => {
    if (filterSlotType === 'nta')     return deptFiltered.filter(s => isNTA(s));
    if (filterSlotType === 'rna')     return deptFiltered.filter(s => isRoomFallback(s));
    if (filterSlotType === 'nta_rna') return deptFiltered.filter(s => isNTA(s) || isRoomFallback(s));
    return deptFiltered;
  })();

  const periods = Array.from(
    new Map(
      slots.filter(s => s.lessonperiods).map(s => [s.lesson_period_id, s.lessonperiods!])
    ).values()
  ).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  type ColSpec =
    | { type: 'period'; period: (typeof periods)[0] }
    | { type: 'break';  gap: number; label: string };

  const colSpecs: ColSpec[] = [];
  let breakCount = 0;
  periods.forEach((p, i) => {
    if (i > 0) {
      const gap = gapMinutes(periods[i - 1], p);
      if (gap) {
        colSpecs.push({ type: 'break', gap, label: BREAK_LABELS[breakCount] ?? '' });
        breakCount++;
      }
    }
    colSpecs.push({ type: 'period', period: p });
  });

  // ── Group slots ───────────────────────────────────────────────────────────
  const groupedSlots = new Map<string, { name: string; code: string; department: string; roomType?: string; slots: TimetableSlot[] }>();
  slots.forEach(slot => {
    let key: string, name: string, code: string, department: string, roomType: string | undefined;

    if (groupBy === 'class') {
      key = slot.class_id.toString();
      name = slot.classes?.name ?? '';
      code = slot.classes?.code ?? '';
      department = '';
    } else if (groupBy === 'trainer') {
      key = slot.employee_id.toString();
      name = slot.users?.name ?? '';
      code = `T-${slot.employee_id}`;
      department = '';
    } else if (groupBy === 'room') {
      key = slot.room_id.toString();
      name = slot.rooms?.name ?? `Room ${slot.room_id}`;
      code = slot.rooms?.name ?? `Room ${slot.room_id}`;
      department = '';
      roomType = (slot.rooms as any)?.room_type ?? '';
    } else {
      // department
      const dept = slot.subjects?.department ?? 'Unknown';
      key = dept;
      name = dept;
      code = dept;
      department = dept;
    }

    if (!groupedSlots.has(key)) {
      groupedSlots.set(key, { name, code, department, roomType, slots: [] });
    }
    groupedSlots.get(key)!.slots.push(slot);
  });

  // Sort rooms alphabetically for room view
  const groups = groupBy === 'room'
    ? Array.from(groupedSlots.entries()).sort(([, a], [, b]) => a.name.localeCompare(b.name))
    : Array.from(groupedSlots.entries());

  const getTitle = () =>
    groupBy === 'class'   ? 'Class Timetable'
    : groupBy === 'trainer' ? 'Trainer Schedule'
    : groupBy === 'room'    ? 'Room Occupancy'
    : 'Department Timetable';

  const now = new Date().toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const summaryClasses: Array<{ id: number; name: string; code: string; department?: string }> =
    printedClasses ??
    Array.from(
      new Map(
        slots.filter(s => s.classes).map(s => [
          s.class_id,
          { id: s.class_id, name: s.classes!.name, code: s.classes!.code, department: s.subjects?.department },
        ])
      ).values()
    ).sort((a, b) => a.code.localeCompare(b.code));

  const showSummary = groupBy === 'department' && !!filterDepartment && summaryClasses.length > 1;

  const getPrimarySlot = (slot: TimetableSlot, groupSlots: TimetableSlot[]): TimetableSlot => {
    if (!slot.session_group_id) return slot;
    const siblings = groupSlots.filter(
      s => s.session_group_id === slot.session_group_id &&
           s.class_id         === slot.class_id &&
           s.day_of_week      === slot.day_of_week
    );
    return siblings.reduce((earliest, s) => {
      const ep = periods.find(p => p.id === earliest.lesson_period_id);
      const sp = periods.find(p => p.id === s.lesson_period_id);
      if (!ep || !sp) return earliest;
      return new Date(ep.start_time).getTime() <= new Date(sp.start_time).getTime() ? earliest : s;
    }, siblings[0]);
  };

  const getSpanCount = (slot: TimetableSlot, groupSlots: TimetableSlot[]): number => {
    if (!slot.session_group_id) return 1;
    return new Set(
      groupSlots.filter(s =>
        s.session_group_id === slot.session_group_id &&
        s.class_id         === slot.class_id &&
        s.day_of_week      === slot.day_of_week
      ).map(s => s.lesson_period_id)
    ).size;
  };

  return (
    <div className="print-container">
      <style jsx global>{`
        @media screen {
          .print-container {
            display: none !important;
            position: absolute;
            width: 0; height: 0;
            overflow: hidden;
          }
        }

        @media print {
          body * { visibility: hidden; }
          .print-container,
          .print-container * { visibility: visible; }
          .print-container {
            position: absolute;
            left: 0; top: 0;
            width: 100%;
            padding: 0.5cm;
            font-family: Calibri, 'Gill Sans', 'Trebuchet MS', sans-serif;
            color: #000;
          }
          @page { size: A4 landscape; margin: 0.5cm; }

          .page-break { page-break-after: always; break-after: page; }

          /* ── Summary block ── */
          .ps { border: 2px solid #000; border-radius: 4px; padding: 12px 16px; margin-bottom: 12px; }
          .ps-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid #ccc; }
          .ps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px 12px; }
          .ps-item { display: flex; align-items: baseline; gap: 5px; font-size: 9px; padding: 3px 0; border-bottom: 1px dotted #ddd; }
          .ps-item-code { font-family: 'Courier New', monospace; font-weight: 700; font-size: 9px; white-space: nowrap; flex-shrink: 0; }
          .ps-item-name { color: #333; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .ps-count { font-size: 9px; color: #555; font-weight: 400; margin-top: 2px; }

          /* ── Slot type banner ── */
          .slot-type-banner {
            display: flex; align-items: center; gap: 8px;
            border: 2px solid #000; padding: 4px 10px; margin-bottom: 6px;
            font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .slot-type-banner-nta     { background: #fef2f2 !important; border-color: #000 !important; }
          .slot-type-banner-rna     { background: #fff7ed !important; border-color: #000 !important; }
          .slot-type-banner-nta_rna { background: #f5f3ff !important; border-color: #000 !important; }
          .slot-type-banner .stb-dot { width: 10px; height: 10px; border: 1.5px solid #000; display: inline-block; flex-shrink: 0; }
          .slot-type-banner-nta .stb-dot {
            background-image: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 3px) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .slot-type-banner-rna .stb-dot { background: #ccc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* ── Header ── */
          .ph { display: flex; flex-direction: column; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
          .ph-logo-row { text-align: center; margin-bottom: 6px; }
          .ph-logo { height: 36px; width: auto; }
          .ph-row { display: flex; justify-content: space-between; align-items: flex-start; }
          .ph-title    { font-size: 22px; font-weight: 600; }
          .ph-subtitle { font-size: 14px; font-weight: 600; margin-top: 3px; }
          .ph-dept     { font-size: 11px; font-weight: 400; color: #444; margin-top: 2px; letter-spacing: 0.3px; }
          .ph-right    { text-align: right; }
          .ph-term     { font-size: 12px; font-weight: 600; }
          .ph-meta     { font-size: 10px; font-weight: 400; margin-top: 2px; }

          /* ── Room type badge in header ── */
          .ph-room-type {
            display: inline-block; font-size: 9px; font-weight: 700;
            text-transform: uppercase; letter-spacing: 0.5px;
            border: 1.5px solid #000; padding: 1px 6px; margin-top: 3px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }

          /* ── Table ── */
          .pt { border-collapse: collapse; width: 100%; table-layout: fixed; }
          .pt th, .pt td { border: 1.5px solid #000; vertical-align: top; padding: 0; }

          .pt .c-corner {
            background: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
            color: #fff; font-weight: 600; font-size: 10px; text-align: center;
            padding: 5px 3px; width: 62px;
          }
          .pt .c-period-hd { text-align: center; font-weight: 600; font-size: 10px; padding: 5px 4px; border-bottom: 2px solid #000 !important; }
          .pt .c-break-hd, .pt .c-break-cell {
            background: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact;
            width: 22px !important; padding: 0; height: 100%;
          }
          .break-label {
            display: block; writing-mode: vertical-rl; transform: rotate(180deg);
            font-size: 9px; font-weight: 700; color: #fff; letter-spacing: 2px;
            text-align: center; width: 100%; padding: 4px 0;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .pt .c-day { font-weight: 600; font-size: 10px; text-align: center; padding: 5px 3px; vertical-align: middle; }
          .pt tr.day-sep td { border-bottom: 2px solid #000 !important; }
          .pt .c-data { padding: 5px; }
          .pt .c-empty { background: #f5f5f5 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

          /* ── Base slot card ── */
          .sc {
            padding: 4px 4px 4px 7px;
            border-left: 3px solid #000;
            margin-bottom: 5px;
            page-break-inside: avoid;
            line-height: 1.5;
          }
          .sc:last-child { margin-bottom: 0; }
          .sc + .sc { border-top: 1px dashed #555; padding-top: 5px; margin-top: 0; }
          .sc .sn { font-size: 10px; font-weight: 600; color: #000; }
          .sc .sk { font-size: 9px; font-weight: 400; color: #000; font-family: 'Courier New', monospace; margin-top: 2px; }
          .sc .sm { font-size: 9px; font-weight: 400; color: #222; margin-top: 2px; }
          .sc .sm b { font-weight: 600; }
          .sc .stag {
            display: inline-block; font-size: 8px; font-weight: 600;
            border: 1.5px solid #000; padding: 0 3px; margin-left: 5px;
            vertical-align: middle; line-height: 1.6;
          }

          /* ── Room view: occupancy percentage bar ── */
          .room-util-bar {
            height: 4px; background: #e5e7eb; margin-bottom: 6px; border-radius: 2px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .room-util-fill {
            height: 100%; background: #111827; border-radius: 2px;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .room-util-label { font-size: 8px; color: #555; margin-bottom: 8px; }

          /* ── NTA card ── */
          .sc-nta {
            border: 2px dashed #000 !important; border-left: 4px dashed #000 !important;
            background-image: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .sc-nta .sn::before { content: '[NTA] '; font-size: 7px; font-weight: 900; letter-spacing: 0.05em; }
          .sc-nta .trainer-line { text-decoration: line-through; opacity: 0.55; }
          .sc-nta .nta-note { display: block; font-size: 7px; font-style: italic; font-weight: 700; margin-top: 1px; }

          /* ── RNA card ── */
          .sc-rna {
            border: 1px dotted #000 !important; border-left: 4px solid #000 !important;
            background: #efefef !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .sc-rna .room-line::before { content: '[RNA] '; font-size: 7px; font-weight: 900; }

          /* ── NTA + RNA combined card ── */
          .sc-nta-rna {
            border: 2px dashed #000 !important; border-left: 4px solid #000 !important;
            background-image: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .sc-nta-rna .sn::before { content: '[NTA] '; font-size: 7px; font-weight: 900; }
          .sc-nta-rna .room-line::before { content: '[RNA] '; font-size: 7px; font-weight: 900; }
          .sc-nta-rna .trainer-line { text-decoration: line-through; opacity: 0.55; }
          .sc-nta-rna .nta-note { display: block; font-size: 7px; font-style: italic; font-weight: 700; margin-top: 1px; }

          /* ── Combined classes ── */
          .sc .sc-comb { font-size: 8px; font-weight: 400; color: #333; margin-top: 2px; border-top: 1px dotted #aaa; padding-top: 2px; }
          .sc .sc-comb-label { font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; font-size: 7px; margin-right: 3px; }
          .sc .sc-comb-code { font-family: 'Courier New', monospace; font-weight: 700; font-size: 8px; }

          /* ── Print legend ── */
          .print-legend {
            margin-top: 6px; border: 1px solid #000; padding: 4px 8px;
            display: flex; align-items: center; gap: 16px; flex-wrap: wrap; font-size: 8px;
          }
          .print-legend-title { font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
          .legend-item { display: flex; align-items: center; gap: 5px; }
          .legend-swatch { width: 18px; height: 11px; display: inline-block; flex-shrink: 0; }
          .legend-swatch-normal { border: 1.5px solid #000; }
          .legend-swatch-nta {
            border: 2px dashed #000 !important;
            background-image: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .legend-swatch-rna {
            border: 1px dotted #000 !important; border-left: 3px solid #000 !important;
            background: #efefef !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .legend-swatch-nta-rna {
            border: 2px dashed #000 !important; border-left: 4px solid #000 !important;
            background-image: repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }

          /* ── Footer ── */
          .pf { margin-top: 6px; font-size: 9px; font-weight: 400; display: flex; justify-content: space-between; border-top: 1px solid #000; padding-top: 4px; }
        }
      `}</style>

      {/* ── Summary block ── */}
      {showSummary && (
        <div className="ps">
          <div className="ph-logo-row">
            <img src="/logo2.png" alt="Logo" className="ph-logo" loading="eager" decoding="sync" />
          </div>
          <div className="ps-title">
            {getTitle()} · {termName ?? ''} · {summaryClasses.length} Class{summaryClasses.length !== 1 ? 'es' : ''} Included
            {filterSlotType !== 'all' && ` · ${slotTypeLabel(filterSlotType)}`}
            <span className="ps-count"> — printed {now}</span>
          </div>
          <div className="ps-grid">
            {summaryClasses.map((cls, i) => (
              <div key={cls.id ?? i} className="ps-item">
                <span className="ps-item-code">{cls.code}</span>
                <span className="ps-item-name">{cls.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {groups.map(([key, group], index) => {
        const isLast = index === groups.length - 1;

        const cellMap = new Map<string, TimetableSlot[]>();
        group.slots.forEach(s => {
          const k = `${s.day_of_week}-${s.lesson_period_id}`;
          cellMap.set(k, [...(cellMap.get(k) ?? []), s]);
        });

        const groupHasNTA = group.slots.some(s => isNTA(s));
        const groupHasRNA = group.slots.some(s => isRoomFallback(s));
        const showLegend  = groupHasNTA || groupHasRNA;

        // ── Room utilisation stats ────────────────────────────────────────
        const totalCells  = DAYS.length * periods.length;
        const occupiedCells = new Set(
          group.slots.map(s => `${s.day_of_week}-${s.lesson_period_id}`)
        ).size;
        const utilPct = totalCells > 0 ? Math.round((occupiedCells / totalCells) * 100) : 0;

        const classMap = new Map<number, { name: string; code: string }>();
        slots.forEach(s => {
          if (s.classes) classMap.set(s.class_id, s.classes);
        });

        const getCombinedClasses = (slot: TimetableSlot): Array<{ id: number; code: string; name: string }> => {
          const ids = (slot as any).combined_class_ids as number[] | null | undefined;
          if (!ids || ids.length <= 1) return [];
          if (groupBy === 'trainer' || groupBy === 'room') {
            return ids.map(id => ({
              id,
              ...(classMap.get(id) ?? { code: String(id), name: '' })
            }));
          }
          return ids
            .filter(id => id !== slot.class_id)
            .map(id => ({ id, ...(classMap.get(id) ?? { code: String(id), name: '' }) }));
        };

        return (
          <div key={key} className={isLast ? '' : 'page-break'}>

            {/* ── Page header ── */}
            {!(showSummary && index === 0) && (
              <div className="ph">
                <div className="ph-logo-row">
                  <img src="/logo2.png" alt="Logo" className="ph-logo" loading="eager" decoding="sync" />
                </div>
                <div className="ph-row">
                  <div>
                    <div className="ph-title">{getTitle()}</div>
                    {groupBy === 'department' ? (
                      <div className="ph-subtitle">{group.name}</div>
                    ) : groupBy === 'room' ? (
                      <>
                        <div className="ph-subtitle">{group.name}</div>
                        {group.roomType && (
                          <span className="ph-room-type">{group.roomType}</span>
                        )}
                      </>
                    ) : (
                      <div className="ph-subtitle">{group.code} — {group.name}</div>
                    )}
                  </div>
                  <div className="ph-right">
                    {termName && <div className="ph-term">{termName}</div>}
                    {groupBy === 'room' && (
                      <div className="ph-meta" style={{ marginBottom: 2 }}>
                        Utilisation: {occupiedCells}/{totalCells} slots ({utilPct}%)
                      </div>
                    )}
                    <div className="ph-meta">Printed: {now} &nbsp;·&nbsp; Page {index + 1} / {groups.length}</div>
                  </div>
                </div>

                {/* Utilisation bar — room view only */}
                {groupBy === 'room' && (
                  <>
                    <div className="room-util-bar" style={{ marginTop: 6 }}>
                      <div className="room-util-fill" style={{ width: `${utilPct}%` }} />
                    </div>
                    <div className="room-util-label">
                      {utilPct}% occupied across {DAYS.length} working days · {periods.length} periods/day
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Slot type banner ── */}
            {filterSlotType !== 'all' && (
              <div className={`slot-type-banner slot-type-banner-${filterSlotType}`}>
                <span className="stb-dot" />
                Showing: {slotTypeLabel(filterSlotType)}
              </div>
            )}

            {/* ── Timetable grid ── */}
            <table className="pt">
              <thead>
                <tr>
                  <th className="c-corner">Day</th>
                  {colSpecs.map((col, i) => {
                    if (col.type === 'break') {
                      return (
                        <th key={`bh-${i}`} className="c-break-hd">
                          <span className="break-label">{col.label}</span>
                        </th>
                      );
                    }
                    const { period } = col;
                    return (
                      <th key={`ph-${period.id}`} className="c-period-hd">
                        <div style={{ fontWeight: 600 }}>{period.name}</div>
                        <div style={{ fontWeight: 400, marginTop: 2 }}>
                          {fmt(period.start_time as unknown as Date)} – {fmt(period.end_time as unknown as Date)}
                        </div>
                        <div style={{ fontWeight: 400, fontSize: 8, marginTop: 1, color: '#444' }}>
                          {period.duration} min
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {DAYS.map((day, dIdx) => {
                  const date = new Date(currentWeek.start.getTime() + day.value * 24 * 60 * 60 * 1000);
                  const isLastDay = dIdx === DAYS.length - 1;

                  return (
                    <tr key={day.value} className={isLastDay ? '' : 'day-sep'}>
                      <td className="c-day">
                        <div style={{ fontWeight: 600 }}>{day.name}</div>
                        <div style={{ fontWeight: 400, fontSize: 8, marginTop: 1 }}>
                          {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      </td>

                      {colSpecs.map((col, i) => {
                        if (col.type === 'break') {
                          return (
                            <td key={`bc-${day.value}-${i}`} className="c-break-cell">
                              <span className="break-label">{col.label}</span>
                            </td>
                          );
                        }

                        const { period }  = col;
                        const cellSlots   = cellMap.get(`${day.value}-${period.id}`) ?? [];

                        if (cellSlots.length === 0) {
                          return (
                            <td key={`dc-${day.value}-${period.id}`} className="c-data c-empty">
                              <div style={{ textAlign: 'center', color: '#aaa', padding: '10px 0', fontSize: 13 }}>—</div>
                            </td>
                          );
                        }

                        const deduped = new Map<string, TimetableSlot>();
                        cellSlots.forEach(s => {
                          const primary = getPrimarySlot(s, group.slots);
                          const dk = primary.session_group_id
                            ? (groupBy === 'trainer' || groupBy === 'room')
                              ? primary.session_group_id
                              : `${primary.session_group_id}-${primary.class_id}`
                            : primary.id;
                          if (!deduped.has(dk)) deduped.set(dk, primary);
                        });

                        return (
                          <td key={`dc-${day.value}-${period.id}`} className="c-data">
                            {Array.from(deduped.values()).map(slot => {
                              const span  = getSpanCount(slot, group.slots);
                              const label = span === 2 ? 'DBL' : span >= 3 ? 'TRP' : null;

                              const nta  = isNTA(slot);
                              const rna  = isRoomFallback(slot);
                              const both = nta && rna;

                              const cardClass = both ? 'sc sc-nta-rna'
                                : nta            ? 'sc sc-nta'
                                : rna            ? 'sc sc-rna'
                                : 'sc';

                              const combined = getCombinedClasses(slot);

                              return (
                                <div key={`${slot.id}-${period.id}`} className={cardClass}>

                                  {/* Subject name */}
                                  <div className="sn">
                                    {slot.subjects?.name}
                                    {label && <span className="stag">{label}</span>}
                                  </div>

                                  {/* Subject code */}
                                  <div className="sk">{slot.subjects?.code}</div>

                                  {/* Class — shown for trainer, room, and department groupBy */}
                                  {(groupBy === 'trainer' || groupBy === 'room' || groupBy === 'department') && (
                                    <div className="sm">
                                      <b>{slot.classes?.code}</b>
                                      {groupBy === 'room' && slot.classes?.name && (
                                        <span> — {slot.classes.name}</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Trainer — shown for class, room, and department views */}
                                  {groupBy !== 'trainer' && (
                                    nta ? (
                                      <>
                                        <div className="sm trainer-line">{slot.users?.name}</div>
                                        <span className="nta-note">No trainer assigned</span>
                                      </>
                                    ) : (
                                      <div className="sm">{slot.users?.name}</div>
                                    )
                                  )}

                                  {/* Room — shown for class, trainer, department views. Hidden for room view (it IS the room). */}
                                  {groupBy !== 'room' && (
                                    <div className={`sm${rna ? ' room-line' : ''}`}>
                                      Room: <b>{slot.rooms?.name}</b>
                                    </div>
                                  )}

                                  {/* Combined classes */}
                                  {combined.length > 0 && (
                                    <div className="sc-comb">
                                      <span className="sc-comb-label">+ Combined:</span>
                                      {combined.map((c, i) => (
                                        <span key={c.id}>
                                          {i > 0 && ', '}
                                          <span className="sc-comb-code">{c.code}</span>
                                          {c.name && (
                                            <span style={{ fontSize: 7, marginLeft: 2 }}>{c.name}</span>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── Legend ── */}
            {showLegend && (
              <div className="print-legend">
                <span className="print-legend-title">Key:</span>
                <span className="legend-item">
                  <span className="legend-swatch legend-swatch-normal" />Normal
                </span>
                {groupHasNTA && (
                  <span className="legend-item">
                    <span className="legend-swatch legend-swatch-nta" />
                    [NTA] Class Not Available — listed trainer was intended
                  </span>
                )}
                {groupHasRNA && !groupHasNTA && (
                  <span className="legend-item">
                    <span className="legend-swatch legend-swatch-rna" />
                    [RNA] No preferred room — placed in catch-all RNA
                  </span>
                )}
                {groupHasNTA && groupHasRNA && (
                  <span className="legend-item">
                    <span className="legend-swatch legend-swatch-nta-rna" />
                    [NTA]+[RNA] Both flags apply
                  </span>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="pf">
              <span>
                {getTitle()} — {group.name}
                {groupBy === 'room' && group.roomType ? ` · ${group.roomType}` : ''}
                {groupBy === 'department' && group.department ? ` · ${group.department}` : ''}
                {filterSlotType !== 'all' ? ` · ${slotTypeLabel(filterSlotType)}` : ''}
              </span>
              <span>Page {index + 1} of {groups.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}