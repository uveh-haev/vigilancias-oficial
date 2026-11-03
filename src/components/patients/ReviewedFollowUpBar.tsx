import { useState } from 'react';
import { ChevronDown, ChevronUp, PanelRightOpen, RotateCcw } from 'lucide-react';
import { DoneRecord, RadarEvent } from '../../types/clinical';
import { shortAuthor } from '../../domain/dates';
import { getPatientKey, getServiceGroup } from '../../domain/services';

interface ReviewedFollowUpBarProps {
  reviewedRows: RadarEvent[];
  doneMap: Record<string, DoneRecord>;
  markingIds: Record<string, boolean>;
  onUnmark: (event: RadarEvent) => void;
  onOpenInspector: (patientKey: string, orderedKeys: string[]) => void;
}

export function ReviewedFollowUpBar({
  reviewedRows,
  doneMap,
  markingIds,
  onUnmark,
  onOpenInspector,
}: ReviewedFollowUpBarProps) {
  const [open, setOpen] = useState(false);

  if (!reviewedRows.length) return null;

  const orderedKeys = [...new Set(reviewedRows.map((r) => getPatientKey(r)))];

  return (
    <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[46px] px-4 py-2.5 flex items-center justify-between gap-3 text-left text-sm font-semibold text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <span className="tabular-nums">
          {reviewedRows.length} paciente{reviewedRows.length === 1 ? '' : 's'} revisado
          {reviewedRows.length === 1 ? '' : 's'} en seguimiento activo
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
          <span>{open ? 'Ocultar lista' : 'Ver lista'}</span>
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-[420px] overflow-y-auto px-4">
          {reviewedRows.map((r) => {
            const dm = doneMap[r.id];
            const isBusy = Boolean(markingIds[r.id]);
            const pKey = getPatientKey(r);
            const dateLabel = dm?.fecha
              ? new Date(dm.fecha).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: '2-digit',
                })
              : '';

            return (
              <div
                key={r.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0">
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                    Cama {r.cama || 's/c'}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {r.nombre || '—'}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    · {getServiceGroup(r)}
                    {dm?.autor ? ` · por ${shortAuthor(dm.autor)}` : ''}
                    {dateLabel ? ` (${dateLabel})` : ''}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenInspector(pKey, orderedKeys)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                  >
                    <PanelRightOpen className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    <span>Abrir ficha</span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onUnmark(r)}
                    className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Regresar a pendientes</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
