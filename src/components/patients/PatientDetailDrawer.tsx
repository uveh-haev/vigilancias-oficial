import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileScan,
  FileText,
  MessageSquarePlus,
  Paperclip,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  CriteriaEvaluation,
  CultureAttachment,
  DoneRecord,
  NursingNote,
  PatientGroup,
  PriorityLevel,
  RadarEvent,
  SharedMark,
} from '../../types/clinical';
import {
  getDischargeReason,
  hasPendingCulture,
  hasRecentCulture,
  hasUncapturedMicroorganism,
  isDiscarded,
  isDischarged,
  isIAAS,
  isNewDetection,
  isReadmission,
  isRhoveCaptured,
  parseMicroChips,
} from '../../domain/classification';
import { CUMPLE_LABELS, mkCriterios } from '../../domain/criteria';
import {
  daysBetween,
  fmtFull,
  fmtShort,
  formatDateTimeShort,
  norm,
  shortAuthor,
} from '../../domain/dates';
import {
  getPriorityLevel,
  lookupByPatient,
  PatientIndexedList,
  PRIORITY_LABELS,
} from '../../domain/services';
import { CriteriaChecklist } from './CriteriaChecklist';
import { VoiceDictationButton } from '../notes/VoiceDictationButton';

interface PatientDetailDrawerProps {
  inspected: {
    group: PatientGroup;
    index: number;
    total: number;
  } | null;
  corte: string | null;
  outbreakIds: Set<string>;
  doneMap: Record<string, DoneRecord>;
  markingIds: Record<string, boolean>;
  sharedMarks: Record<string, SharedMark> | null;
  notesIndex: PatientIndexedList<NursingNote>;
  culturesIndex: PatientIndexedList<CultureAttachment>;
  onClose: () => void;
  onNavigate: (delta: -1 | 1) => void;
  onMark: (event: RadarEvent, tipo: 'revisado' | 'descartado') => void;
  onUnmark: (event: RadarEvent) => void;
  onSaveCriteria: (event: RadarEvent, evaluation: CriteriaEvaluation) => Promise<boolean>;
  onSubmitNursingNote: (patientRow: RadarEvent, text: string) => Promise<boolean>;
  onUploadCulture: (patientRow: RadarEvent, file: File) => Promise<boolean>;
  onOpenSmartCulture?: (patientRow: RadarEvent, file?: File | null) => void;
  onOpenCulture: (culture: CultureAttachment) => void;
}

export function PatientDetailDrawer({
  inspected,
  corte,
  outbreakIds,
  doneMap,
  markingIds,
  sharedMarks,
  notesIndex,
  culturesIndex,
  onClose,
  onNavigate,
  onMark,
  onUnmark,
  onSaveCriteria,
  onSubmitNursingNote,
  onUploadCulture,
  onOpenSmartCulture,
  onOpenCulture,
}: PatientDetailDrawerProps) {
  const [openCriteriaId, setOpenCriteriaId] = useState<string | null>(null);

  const [showNursingForm, setShowNursingForm] = useState(false);
  const [nursingDraft, setNursingDraft] = useState('');
  const [sendingNursingNote, setSendingNursingNote] = useState(false);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const patientKey = inspected?.group.patientKey;

  useEffect(() => {
    setOpenCriteriaId(null);
    setShowNursingForm(false);
    setNursingDraft('');
    setShowUploadForm(false);
    setSelectedFile(null);
  }, [patientKey]);

  useEffect(() => {
    if (!inspected) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (!isEditable && inspected.total > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onNavigate(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onNavigate(1);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [inspected, onClose, onNavigate]);

  if (!inspected) return null;

  const { group, index, total } = inspected;
  const { primary, events, serviceGroup, subservice } = group;

  const patientNotes = lookupByPatient(notesIndex, group.patientKey, primary.nombre);
  const patientCultures = lookupByPatient(culturesIndex, group.patientKey, primary.nombre);

  const ageLabel =
    primary.edad != null
      ? `${primary.edad}${/^\d+$/.test(String(primary.edad)) ? ' años' : ''}`
      : null;

  const serviceDisplay =
    subservice && subservice !== serviceGroup
      ? `${serviceGroup} · ${subservice}`
      : primary.svc || serviceGroup;

  const stayDays =
    primary.ing && corte && daysBetween(primary.ing, corte) >= 0
      ? daysBetween(primary.ing, corte) + 1
      : null;

  const discharged = isDischarged(primary);
  const dischargeReason = discharged ? getDischargeReason(primary) : null;

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-xs flex justify-end"
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-patient-name"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-white dark:bg-[#111726] border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Sticky Drawer Header with Navigation */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-[#111726]">
          <div className="flex items-center gap-2">
            {total > 1 && (
              <div className="inline-flex items-center gap-1 mr-1">
                <button
                  type="button"
                  onClick={() => onNavigate(-1)}
                  aria-label="Paciente anterior"
                  title="Paciente anterior (←)"
                  className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 px-1.5">
                  {index + 1} / {total}
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate(1)}
                  aria-label="Paciente siguiente"
                  title="Paciente siguiente (→)"
                  className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Expediente operativo UVEH
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar expediente"
            className="w-10 h-10 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Clinical Body */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 divide-y divide-slate-200/80 dark:divide-slate-800">
          {/* Demographics & Stay Block */}
          <section className="pb-5">
            <div className="flex items-start gap-3.5">
              <div className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800/90 text-center min-w-[68px] shrink-0">
                <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
                  Cama
                </span>
                <span className="font-mono text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {primary.cama || 's/c'}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="drawer-patient-name"
                  className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug"
                >
                  {primary.nombre || 'Paciente sin nombre'}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-400">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {serviceDisplay}
                  </span>
                  {ageLabel && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{ageLabel}</span>
                    </>
                  )}
                  {primary.exp && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Exp. {primary.exp}</span>
                    </>
                  )}
                  {stayDays != null && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        Estancia {stayDays} d ({fmtShort(primary.ing)})
                      </span>
                    </>
                  )}
                  {dischargeReason && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          dischargeReason === 'Defunción'
                            ? 'font-semibold text-red-700 dark:text-red-400'
                            : 'font-semibold text-slate-700 dark:text-slate-300'
                        }
                      >
                        {dischargeReason}
                        {primary.egreso ? ` (${fmtShort(primary.egreso)})` : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Active Events */}
          <section className="py-5 flex flex-col gap-6">
            {events.map((ev, indexEv) => {
              const pri = getPriorityLevel(ev);
              const done = doneMap[ev.id];
              const isBusy = Boolean(markingIds[ev.id]);
              const chips = parseMicroChips(ev);
              const critMark = sharedMarks?.[mkCriterios(ev)];
              const canShowCrit = isIAAS(ev, outbreakIds) && !isDiscarded(ev) && !discharged;
              const isCritOpen = openCriteriaId === ev.id;

              const descriptors: Array<{ text: string; tone?: 'crit' | 'warn' | 'ok' | 'brand' }> =
                [];
              if (isNewDetection(ev, corte)) {
                descriptors.push({ text: 'Nuevo en el corte', tone: 'brand' });
              }
              if (isReadmission(ev)) {
                descriptors.push({ text: 'Reingreso hospitalario', tone: 'warn' });
              }
              if (outbreakIds.has(ev.id)) {
                descriptors.push({ text: 'Coincidencia de cluster', tone: 'warn' });
              }
              if (hasRecentCulture(ev, corte)) {
                descriptors.push({ text: `Cultivo reciente (${fmtShort(ev.fres)})`, tone: 'brand' });
              }
              if (isRhoveCaptured(ev)) {
                descriptors.push({ text: 'Capturada en RHOVE', tone: 'ok' });
                if (hasPendingCulture(ev)) {
                  descriptors.push({ text: 'Cultivo pendiente', tone: 'warn' });
                } else if (hasUncapturedMicroorganism(ev, outbreakIds)) {
                  descriptors.push({ text: 'Microorganismo sin capturar RHOVE', tone: 'warn' });
                }
              } else if (isIAAS(ev, outbreakIds) && !isDiscarded(ev)) {
                descriptors.push({ text: 'Pendiente captura RHOVE', tone: 'crit' });
              }

              return (
                <div
                  key={ev.id}
                  className={`flex flex-col gap-3.5 ${
                    indexEv > 0 ? 'pt-5 border-t border-slate-100 dark:border-slate-800/80' : ''
                  }`}
                >
                  {/* Event Priority & Inline Descriptors */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                    {pri === PriorityLevel.Urgent ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{PRIORITY_LABELS[pri]}</span>
                      </span>
                    ) : pri === PriorityLevel.Today ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{PRIORITY_LABELS[pri]}</span>
                      </span>
                    ) : (
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {PRIORITY_LABELS[pri]}
                      </span>
                    )}

                    {descriptors.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-2">
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                        <span
                          className={
                            d.tone === 'crit'
                              ? 'font-medium text-red-700 dark:text-red-400'
                              : d.tone === 'warn'
                                ? 'font-medium text-amber-700 dark:text-amber-400'
                                : d.tone === 'ok'
                                  ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                  : d.tone === 'brand'
                                    ? 'font-semibold text-teal-700 dark:text-teal-300'
                                    : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {d.text}
                        </span>
                      </span>
                    ))}
                  </div>

                  {/* Microorganism */}
                  {ev.micro && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        Microorganismo
                      </span>
                      {chips.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {chips.map((c, idx) => (
                            <div
                              key={idx}
                              className="py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-baseline justify-between gap-2"
                            >
                              <div>
                                <span className="italic font-semibold text-sm text-slate-900 dark:text-slate-100">
                                  {c.label}
                                </span>
                                {ev.muestra && (
                                  <span className="text-xs text-slate-600 dark:text-slate-400 ml-2">
                                    · {ev.muestra}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-xs font-medium ${
                                  c.captured
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-red-700 dark:text-red-400'
                                }`}
                              >
                                {c.captured ? 'En RHOVE' : 'Sin capturar'}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="italic font-semibold text-sm text-slate-900 dark:text-slate-100">
                          {ev.micro}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Clinical Reason & Conduct */}
                  {ev.motivo && (
                    <div>
                      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                        Motivo clínico de vigilancia
                      </span>
                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                        {ev.motivo}
                      </p>
                    </div>
                  )}

                  {ev.accion && (
                    <div className="rounded-lg bg-teal-50/70 dark:bg-teal-950/25 px-3.5 py-2.5">
                      <span className="block text-xs font-semibold text-teal-800 dark:text-teal-300 mb-0.5">
                        Conducta sugerida
                      </span>
                      <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                        {ev.accion}
                      </p>
                    </div>
                  )}

                  {/* Structured Clinical Data Table */}
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs pt-1">
                    {ev.tipo && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Sitio / Tipo IAAS</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                          {ev.tipo}
                          {ev.fcap ? ` · Cap. ${fmtShort(ev.fcap)}` : ''}
                        </dd>
                      </div>
                    )}
                    {ev.disp && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">
                          Dispositivo invasivo o cirugía
                        </dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                          {ev.disp}
                        </dd>
                      </div>
                    )}
                    {ev.muestra && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Muestra y resultado</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                          {ev.muestra}
                          {ev.res ? ` · ${ev.res}` : ''}
                          {ev.fres ? ` (${fmtShort(ev.fres)})` : ''}
                        </dd>
                      </div>
                    )}
                    {ev.det && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Fecha de detección</dt>
                        <dd className="font-mono font-medium tabular-nums text-slate-900 dark:text-slate-100 mt-0.5">
                          {fmtFull(ev.det)}
                        </dd>
                      </div>
                    )}
                    {ev.prev && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Servicio previo</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                          {ev.prev}
                        </dd>
                      </div>
                    )}
                    {ev.epi && (
                      <div>
                        <dt className="text-slate-500 dark:text-slate-400">Estado epidemiológico</dt>
                        <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                          {ev.epi}
                        </dd>
                      </div>
                    )}
                  </dl>

                  {ev.atb && (
                    <div>
                      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Perfil de antibiograma (S/I/R)
                      </span>
                      <p className="font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/70 rounded-lg p-3 whitespace-pre-wrap break-words">
                        {ev.atb}
                      </p>
                    </div>
                  )}

                  {ev.obs && (
                    <div>
                      <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Observaciones de censo
                      </span>
                      <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                        {ev.obs}
                      </p>
                    </div>
                  )}

                  {/* Criteria Trigger & Checklist */}
                  {canShowCrit && (
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenCriteriaId((prev) => (prev === ev.id ? null : ev.id))
                        }
                        className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 transition-colors"
                      >
                        <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                        <span>
                          {isCritOpen ? 'Ocultar cédula de criterios' : 'Evaluar criterios UVEH'}
                          {critMark?.detalle?.cumple
                            ? ` · ${CUMPLE_LABELS[critMark.detalle.cumple]}`
                            : ''}
                        </span>
                      </button>

                      {isCritOpen && (
                        <CriteriaChecklist
                          event={ev}
                          corte={corte}
                          savedMark={critMark}
                          onSave={onSaveCriteria}
                          onClose={() => setOpenCriteriaId(null)}
                        />
                      )}
                    </div>
                  )}

                  {/* Event Resolution Actions */}
                  {!discharged && (
                    <div className="pt-1">
                      {done ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => onUnmark(ev)}
                          className={`w-full min-h-[44px] px-4 py-2 rounded-lg border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${
                            done.cls === 'sin_iaas'
                              ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
                              : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
                          }`}
                        >
                          <RotateCcw className="w-4 h-4 shrink-0" />
                          <span>
                            {done.cls === 'sin_iaas' ? 'Descartado' : 'Revisado'}
                            {done.autor ? ` por ${shortAuthor(done.autor)}` : ''} · Regresar a
                            pendientes
                          </span>
                        </button>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onMark(ev, 'revisado')}
                            className="min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                          >
                            <Check className="w-4 h-4 shrink-0" />
                            <span>{isBusy ? 'Guardando…' : 'Marcar como revisado'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => onMark(ev, 'descartado')}
                            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                          >
                            <X className="w-4 h-4 shrink-0" />
                            <span>Descartar IAAS</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          {/* Nursing Notes & Lab Cultures */}
          <section className="py-5 flex flex-col gap-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Notas de cambio y cultivos adjuntos
            </h3>

            {/* Nursing Notes */}
            {patientNotes.length > 0 && (
              <div className="flex flex-col gap-2">
                {patientNotes.map((n) => (
                  <div
                    key={n.fila}
                    className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2.5 text-xs sm:text-[13px]"
                  >
                    <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Nota de piso{n.aplicada ? ' · aplicada en corte' : ''}
                    </div>
                    <p className="text-slate-800 dark:text-slate-200 whitespace-pre-wrap mt-0.5">
                      {n.texto}
                    </p>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      {shortAuthor(n.autor)}
                      {n.fecha ? ` · ${formatDateTimeShort(n.fecha)}` : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Cultures */}
            {patientCultures.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {patientCultures.map((att, idx) => (
                  <button
                    key={`${att.archivo}-${idx}`}
                    type="button"
                    onClick={() => onOpenCulture(att)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-left text-xs sm:text-[13px] font-medium text-slate-800 dark:text-slate-200 transition-colors"
                  >
                    <span className="truncate">{att.archivo}</span>
                    <span className="text-teal-700 dark:text-teal-300 font-semibold shrink-0">
                      Ver cultivo
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Quick Collaboration Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowNursingForm((v) => !v)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Reportar cambio a UVEH</span>
              </button>

              <button
                type="button"
                onClick={() => setShowUploadForm((v) => !v)}
                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Adjuntar cultivo</span>
              </button>
            </div>

            {showNursingForm && (
              <div className="pt-2 flex flex-col gap-2">
                <textarea
                  value={nursingDraft}
                  onChange={(e) => setNursingDraft(e.target.value)}
                  rows={2}
                  placeholder="Ej. Se retiró CVC hoy, llegó resultado preliminar, paciente egresó…"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={sendingNursingNote}
                    onClick={async () => {
                      setSendingNursingNote(true);
                      const ok = await onSubmitNursingNote(primary, nursingDraft);
                      setSendingNursingNote(false);
                      if (ok) {
                        setNursingDraft('');
                        setShowNursingForm(false);
                      }
                    }}
                    className="px-3.5 py-2 min-h-[40px] rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-60"
                  >
                    {sendingNursingNote ? 'Enviando…' : 'Enviar nota'}
                  </button>
                  <VoiceDictationButton
                    compact
                    onTranscribed={(spoken) =>
                      setNursingDraft((prev) =>
                        prev.trim() ? `${prev.trim()} ${spoken}` : spoken
                      )
                    }
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setShowNursingForm(false);
                      setNursingDraft('');
                    }}
                    className="px-3 py-2 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {showUploadForm && (
              <div className="pt-2 flex flex-col gap-2">
                <input
                  type="file"
                  accept="image/*,.pdf,application/pdf"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  className="text-xs text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!selectedFile || uploadingFile}
                    onClick={async () => {
                      if (!selectedFile) return;
                      setUploadingFile(true);
                      const ok = await onUploadCulture(primary, selectedFile);
                      setUploadingFile(false);
                      if (ok) {
                        setSelectedFile(null);
                        setShowUploadForm(false);
                      }
                    }}
                    className="px-3.5 py-2 min-h-[40px] rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {uploadingFile ? 'Subiendo…' : 'Solo adjuntar'}
                  </button>
                  {onOpenSmartCulture && (
                    <button
                      type="button"
                      onClick={() => {
                        const fileToPass = selectedFile;
                        setSelectedFile(null);
                        setShowUploadForm(false);
                        onOpenSmartCulture(primary, fileToPass);
                      }}
                      className="px-3 py-2 min-h-[40px] rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <FileScan className="w-3.5 h-3.5" />
                      <span>Leer cultivo y antibiograma</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowUploadForm(false);
                      setSelectedFile(null);
                    }}
                    className="px-3 py-2 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
