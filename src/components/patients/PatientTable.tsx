import { Check, PanelRightOpen, RotateCcw, X } from 'lucide-react';
import {
  DoneRecord,
  PatientGroup,
  PriorityLevel,
  RadarEvent,
} from '../../types/clinical';
import { isRhoveCaptured } from '../../domain/classification';
import { daysBetween } from '../../domain/dates';
import { getPriorityLevel, PRIORITY_LABELS } from '../../domain/services';
import { PatientCardDisplayOptions } from './PatientCard';

interface PatientTableProps {
  groups: PatientGroup[];
  corte: string | null;
  doneMap: Record<string, DoneRecord>;
  markingIds: Record<string, boolean>;
  options?: PatientCardDisplayOptions;
  onMark: (event: RadarEvent, tipo: 'revisado' | 'descartado') => void;
  onUnmark: (event: RadarEvent) => void;
  onOpenInspector: (patientKey: string, orderedKeys: string[]) => void;
}

export function PatientTable({
  groups,
  corte,
  doneMap,
  markingIds,
  options,
  onMark,
  onUnmark,
  onOpenInspector,
}: PatientTableProps) {
  const orderedKeys = groups.map((g) => g.patientKey);

  return (
    <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <th className="py-2.5 pl-4 pr-3">Cama</th>
              <th className="py-2.5 px-3">Paciente</th>
              <th className="py-2.5 px-3">Servicio</th>
              <th className="py-2.5 px-3">Microorganismo y motivo</th>
              <th className="py-2.5 px-3 text-right">Estancia</th>
              <th className="py-2.5 px-3">Prioridad y RHOVE</th>
              <th className="py-2.5 pl-3 pr-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {groups.map((group) => {
              const r = group.primary;
              const pri = getPriorityLevel(r);
              const done = doneMap[r.id];
              const isBusy = Boolean(markingIds[r.id]);
              const stayDays =
                r.ing && corte && daysBetween(r.ing, corte) >= 0
                  ? daysBetween(r.ing, corte) + 1
                  : null;

              const openRow = () => onOpenInspector(group.patientKey, orderedKeys);

              return (
                <tr
                  key={group.patientKey}
                  tabIndex={0}
                  onClick={openRow}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openRow();
                    }
                  }}
                  aria-label={`Abrir expediente operativo de ${r.nombre || 'paciente'}`}
                  className={`cursor-pointer hover:bg-slate-50/90 dark:hover:bg-slate-800/40 focus-visible:bg-teal-50/60 dark:focus-visible:bg-teal-950/30 transition-colors ${
                    done ? 'opacity-65' : ''
                  }`}
                >
                  <td className="py-2.5 pl-4 pr-3 font-mono text-xs font-semibold tabular-nums whitespace-nowrap text-slate-900 dark:text-slate-100">
                    {r.cama || 's/c'}
                  </td>
                  <td className="py-2.5 px-3 min-w-[200px]">
                    <div className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                      {r.nombre || '—'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      {r.exp ? `Exp. ${r.exp}` : 'Sin exp.'}
                      {r.edad != null ? ` · ${r.edad}a` : ''}
                      {group.events.length > 1 ? ` · ${group.events.length} alertas` : ''}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {group.subservice && group.subservice !== group.serviceGroup
                      ? `${group.serviceGroup} · ${group.subservice}`
                      : group.serviceGroup}
                  </td>
                  <td className="py-2.5 px-3 max-w-[300px]">
                    {r.micro ? (
                      <div className="italic font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {r.micro.replace(/\(\s*pendiente[^)]*\)/gi, '').trim()}
                      </div>
                    ) : null}
                    <div className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {r.motivo || r.tipo || '—'}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {stayDays != null ? `${stayDays} d` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                    <div
                      className={
                        pri === PriorityLevel.Urgent
                          ? 'font-semibold text-red-700 dark:text-red-400'
                          : pri === PriorityLevel.Today
                            ? 'font-semibold text-amber-700 dark:text-amber-400'
                            : 'font-medium text-slate-600 dark:text-slate-400'
                      }
                    >
                      {PRIORITY_LABELS[pri]}
                    </div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {isRhoveCaptured(r) ? 'En RHOVE' : 'Pendiente RHOVE'}
                    </div>
                  </td>
                  <td
                    className="py-2 pl-3 pr-4 text-right whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={openRow}
                        title="Abrir expediente"
                        aria-label="Abrir expediente"
                        className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-1"
                      >
                        <PanelRightOpen className="w-3.5 h-3.5" />
                        <span className="hidden xl:inline">Ficha</span>
                      </button>

                      {!options?.hideReviewActions &&
                        (done ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onUnmark(r)}
                            title="Deshacer marca"
                            className="min-h-[40px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Deshacer</span>
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onMark(r, 'revisado')}
                              title="Marcar como revisado"
                              className="min-h-[40px] px-3 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Revisar</span>
                            </button>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => onMark(r, 'descartado')}
                              title="Descartar IAAS"
                              aria-label="Descartar IAAS"
                              className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
