// components/timetable/MasterTimetablePrint.tsx
'use client';
import { TimetableSlot } from '@/lib/types/timetable';

export type SlotTypeFilter = 'all' | 'nta' | 'rna' | 'nta_rna';

interface MasterTimetablePrintProps {
  slots: TimetableSlot[];
  currentWeek: { start: Date; end: Date; weekNumber: number };
  termName?: string;
  filterSlotType?: SlotTypeFilter;
}

const DAYS = [
  { name: 'Monday',    short: 'MON', value: 1 },
  { name: 'Tuesday',   short: 'TUE', value: 2 },
  { name: 'Wednesday', short: 'WED', value: 3 },
  { name: 'Thursday',  short: 'THU', value: 4 },
  { name: 'Friday',    short: 'FRI', value: 5 },
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

function slotTypeLabel(f: SlotTypeFilter) {
  if (f === 'nta')     return 'NTA Slots Only';
  if (f === 'rna')     return 'RNA Slots Only';
  if (f === 'nta_rna') return 'NTA + RNA Slots';
  return '';
}

export default function MasterTimetablePrint({
  slots: rawSlots,
  currentWeek,
  termName,
  filterSlotType = 'all',
}: MasterTimetablePrintProps) {

  const slots = (() => {
    if (filterSlotType === 'nta')     return rawSlots.filter(s => isNTA(s));
    if (filterSlotType === 'rna')     return rawSlots.filter(s => isRoomFallback(s));
    if (filterSlotType === 'nta_rna') return rawSlots.filter(s => isNTA(s) || isRoomFallback(s));
    return rawSlots;
  })();

  const hasAnyNTA = slots.some(s => isNTA(s));
  const hasAnyRNA = slots.some(s => isRoomFallback(s));

  const periods = Array.from(
    new Map(slots.filter(s => s.lessonperiods).map(s => [s.lesson_period_id, s.lessonperiods!])).values()
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

  const slotMap = new Map<string, TimetableSlot[]>();
  slots.forEach(s => {
    const k = `${s.day_of_week}-${s.lesson_period_id}`;
    slotMap.set(k, [...(slotMap.get(k) ?? []), s]);
  });

  // Build class lookup for resolving combined_class_ids
const classMap = new Map<number, string>();
slots.forEach(s => {
  if (s.classes) classMap.set(s.class_id, s.classes.code);
});

const getCombinedCodes = (slot: TimetableSlot): string[] => {
  const ids = (slot as any).combined_class_ids as number[] | null | undefined;
  if (!ids || ids.length <= 1) return [];
  return ids
    .filter(id => id !== slot.class_id)
    .map(id => classMap.get(id) ?? String(id));
};

  return (
    <div className="print-master-timetable">
      <style jsx global>{`
        @media screen { .print-master-timetable { display: none !important; } }

        @media print {
          body * { visibility: hidden; }
          .print-master-timetable, .print-master-timetable * { visibility: visible; }

          .print-master-timetable {
            position: absolute;
            left: 0; top: 0;
            width: 100%;
            color: #000;
          }

          @page { size: A4 landscape; margin: 0.5cm; }

          .page-header-space { height: 75px; }

          .page-header {
            position: relative;
            width: 100%;
            background: white;
            border-bottom: 2px solid #000;
            padding-bottom: 5px;
            z-index: 100;
          }

          /* ── Slot type banner ── */
          .mtp-filter-banner {
            border: 1.5px solid #000;
            padding: 3px 8px;
            margin-bottom: 5px;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .mtp-filter-banner-dot {
            width: 9px; height: 9px;
            border: 1.5px solid #000;
            display: inline-block;
            flex-shrink: 0;
          }

          /* ── Combined classes line ── */
.slot-card .combined-line {
  font-size: 7px;
  font-weight: 600;
  border-top: 1px dotted #aaa;
  margin-top: 2px;
  padding-top: 2px;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.2px;
}
.slot-card .combined-label {
  font-weight: 900;
  font-style: normal;
  margin-right: 2px;
  font-family: Calibri, sans-serif;
  letter-spacing: 0;
}
          .mtp-filter-banner-nta .mtp-filter-banner-dot,
          .mtp-filter-banner-nta_rna .mtp-filter-banner-dot {
            background-image: repeating-linear-gradient(
              45deg, transparent, transparent 2px,
              rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 3px
            ) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .mtp-filter-banner-rna .mtp-filter-banner-dot {
            background: #ccc !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }

          /* ── Main table ── */
          .mtp-table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
            border: 2px solid #000 !important;
          }
          .mtp-table th, .mtp-table td {
            border: 1px solid #000 !important;
            vertical-align: top;
            padding: 2px;
          }
          .day-label-cell {
            background: #eee !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
            font-weight: 900; font-size: 11px; text-align: center;
            vertical-align: middle; width: 50px; padding: 5px 0 !important;
          }
          .mtp-table thead th {
            background: #000 !important; color: #fff !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
            font-size: 10px; padding: 4px 2px;
          }
          .mtp-break-hd, .mtp-break-cell {
            background: #000 !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
            width: 22px !important; padding: 0 !important;
            height: 100%; vertical-align: middle;
          }
          .mtp-break-label {
            display: block; writing-mode: vertical-rl; transform: rotate(180deg);
            font-size: 9px; font-weight: 700; color: #fff; letter-spacing: 2px;
            text-align: center; width: 100%; padding: 4px 0;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }

          /* ── Base slot card ── */
          .slot-card {
            margin-bottom: 2px; padding: 2px 3px;
            border: 1px solid #000; line-height: 1.1;
          }
          .slot-card .subject-code {
            font-size: 9px; font-weight: 900; display: block;
          }
          .slot-card .details { font-size: 8px; font-weight: 500; }

          /* ── NTA card: diagonal hatching + dashed border ── */
          .slot-card-nta {
            border: 2px dashed #000 !important;
            background-image: repeating-linear-gradient(
              45deg,
              transparent, transparent 3px,
              rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px
            ) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .slot-card-nta .subject-code::before {
            content: '[NTA] '; font-size: 7px; font-weight: 900; letter-spacing: 0.05em;
          }
          .slot-card-nta .trainer-name { text-decoration: line-through; opacity: 0.55; }
          .slot-card-nta .nta-note {
            display: block; font-size: 7px; font-style: italic; font-weight: 700;
          }

          /* ── RNA card: gray background + dotted border + thick left border ── */
          .slot-card-rna {
            border: 1px dotted #000 !important;
            border-left: 3px solid #000 !important;
            background: #eeeeee !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .slot-card-rna .room-name::before {
            content: '[RNA] '; font-size: 7px; font-weight: 900;
          }

          /* ── NTA + RNA combined ── */
          .slot-card-nta-rna {
            border: 2px dashed #000 !important;
            border-left: 4px solid #000 !important;
            background-image: repeating-linear-gradient(
              45deg,
              transparent, transparent 3px,
              rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px
            ) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .slot-card-nta-rna .subject-code::before {
            content: '[NTA] '; font-size: 7px; font-weight: 900;
          }
          .slot-card-nta-rna .room-name::before {
            content: '[RNA] '; font-size: 7px; font-weight: 900;
          }
          .slot-card-nta-rna .trainer-name { text-decoration: line-through; opacity: 0.55; }
          .slot-card-nta-rna .nta-note {
            display: block; font-size: 7px; font-style: italic; font-weight: 700;
          }

          /* ── Legend ── */
          .mtp-legend {
            margin-top: 5px; border: 1px solid #000; padding: 3px 8px;
            display: flex; align-items: center; gap: 14px; flex-wrap: wrap; font-size: 8px;
          }
          .mtp-legend-title { font-weight: 700; font-size: 9px; text-transform: uppercase; }
          .mtp-legend-item  { display: flex; align-items: center; gap: 4px; }
          .mtp-legend-swatch { width: 16px; height: 10px; display: inline-block; flex-shrink: 0; }
          .mtp-legend-swatch-normal { border: 1px solid #000; }
          .mtp-legend-swatch-nta {
            border: 2px dashed #000 !important;
            background-image: repeating-linear-gradient(
              45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px
            ) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .mtp-legend-swatch-rna {
            border: 1px dotted #000 !important; border-left: 3px solid #000 !important;
            background: #eee !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .mtp-legend-swatch-nta-rna {
            border: 2px dashed #000 !important; border-left: 4px solid #000 !important;
            background-image: repeating-linear-gradient(
              45deg, transparent, transparent 2px, rgba(0,0,0,0.2) 2px, rgba(0,0,0,0.2) 3px
            ) !important;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
        }
      `}</style>

      <table style={{ width: '100%', border: 'none' }}>
        <thead>
          <tr>
            <td style={{ border: 'none' }}>
              <div className="page-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 10px' }}>
                  <img src="/logo2.png" alt="Logo" style={{ height: 40 }} loading="eager" decoding="sync" />
                  <div style={{ textAlign: 'center' }}>
                    <h1 style={{ fontSize: '20px', margin: '0', fontWeight: '900' }}>MASTER TIMETABLE</h1>
                    <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
                      {termName?.toUpperCase() ?? 'ACADEMIC TERM'}
                    </div>
                    {filterSlotType !== 'all' && (
                      <div style={{ fontSize: '10px', fontWeight: '600', marginTop: 2, letterSpacing: '0.5px' }}>
                        — {slotTypeLabel(filterSlotType)} —
                      </div>
                    )}
                  </div>
                  <div style={{ width: 40 }} />
                </div>
              </div>
              <div className="page-header-space" />
            </td>
          </tr>
        </thead>

        <tbody>
          <tr>
            <td style={{ border: 'none' }}>

              {filterSlotType !== 'all' && (
                <div className={`mtp-filter-banner mtp-filter-banner-${filterSlotType}`}>
                  <span className="mtp-filter-banner-dot" />
                  Showing: {slotTypeLabel(filterSlotType)}
                </div>
              )}

              <table className="mtp-table">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>DAY</th>
                    {colSpecs.map((col, i) => {
                      if (col.type === 'break') {
                        return (
                          <th key={`bh-${i}`} className="mtp-break-hd">
                            <span className="mtp-break-label">{col.label}</span>
                          </th>
                        );
                      }
                      const { period } = col;
                      return (
                        <th key={period.id}>
                          <div style={{ fontSize: '10px' }}>{period.name}</div>
                          <div style={{ fontSize: '8px', fontWeight: 'normal' }}>
                            {fmt(period.start_time)} - {fmt(period.end_time)}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map((day) => (
                    <tr key={day.value}>
                      <td className="day-label-cell">{day.short}</td>
                      {colSpecs.map((col, i) => {
                        if (col.type === 'break') {
                          return (
                            <td key={`bc-${day.value}-${i}`} className="mtp-break-cell">
                              <span className="mtp-break-label">{col.label}</span>
                            </td>
                          );
                        }
                        const { period }  = col;
                        const cellSlots   = slotMap.get(`${day.value}-${period.id}`) ?? [];

                        return (
                          <td key={period.id}>
                            {cellSlots.map(slot => {
                              const nta  = isNTA(slot);
                              const rna  = isRoomFallback(slot);
                              const both = nta && rna;

                              const cardClass = both ? 'slot-card slot-card-nta-rna'
                                : nta          ? 'slot-card slot-card-nta'
                                : rna          ? 'slot-card slot-card-rna'
                                : 'slot-card';

                              return (
                                <div key={slot.id} className={cardClass}>
                                  <span className="subject-code">{slot.subjects?.code}</span>
                                  <div className="details">
                                    <div>{slot.classes?.code}</div>
                                    <div className={rna ? 'room-name' : undefined}>
                                      {slot.rooms?.name}
                                    </div>
                                    {nta ? (
                                      <>
                                        <div className="trainer-name" style={{ fontSize: '7px', opacity: 0.7 }}>
                                          {slot.users?.name}
                                        </div>
                                        <span className="nta-note">No trainer assigned</span>
                                      </>
                                    ) : (
                                      <div style={{ fontSize: '7px', opacity: 0.8 }}>
                                        {slot.users?.name}
                                      </div>
                                    )}
                                  </div>
                                               {(() => {
  const codes = getCombinedCodes(slot);
  if (codes.length === 0) return null;
  return (
    <div className="combined-line">
      <span className="combined-label">+</span>
      {codes.join(', ')}
    </div>
  );
})()}
                                </div>
                              );
                            })}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {(hasAnyNTA || hasAnyRNA) && (
                <div className="mtp-legend">
                  <span className="mtp-legend-title">Key:</span>
                  <span className="mtp-legend-item">
                    <span className="mtp-legend-swatch mtp-legend-swatch-normal" />Normal
                  </span>
                  {hasAnyNTA && (
                    <span className="mtp-legend-item">
                      <span className="mtp-legend-swatch mtp-legend-swatch-nta" />
                      [CNA] Class Not Available — listed trainer was intended
                    </span>
                  )}
                  {hasAnyRNA && !hasAnyNTA && (
                    <span className="mtp-legend-item">
                      <span className="mtp-legend-swatch mtp-legend-swatch-rna" />
                      [RNA] No preferred room — placed in catch-all room RNA
                    </span>
                  )}
                  {hasAnyNTA && hasAnyRNA && (
                    <span className="mtp-legend-item">
                      <span className="mtp-legend-swatch mtp-legend-swatch-nta-rna" />
                      [NTA]+[RNA] Both flags apply
                    </span>
                  )}
                </div>
              )}

            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}