import { useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  FileScan,
  FileText,
  MessageSquarePlus,
  PanelRightOpen,
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

export interface PatientCardDisplayOptions {
  showRhoveStatus?: boolean;
  showProgram?: boolean;
  hideReviewActions?: boolean;
  isDischargedView?: boolean;
}

interface PatientCardProps {
  group: PatientGroup;
  corte: string | null;
  outbreakIds: Set<string>;
  doneMap: Record<string, DoneRecord>;
  markingIds: Record<string, boolean>;
  sharedMarks: Record<string, SharedMark> | null;
  notesIndex: PatientIndexedList<NursingNote>;
  culturesIndex: PatientIndexedList<CultureAttachment>;
  options?: PatientCardDisplayOptions;
  onMark: (event: RadarEvent, tipo: 'revisado' | 'descartado') => void;
  onUnmark: (event: RadarEvent) => void;
  onSaveCriteria: (event: RadarEvent, evaluation: CriteriaEvaluation) => Promise<boolean>;
  onSubmitNursingNote: (patientRow: RadarEvent, text: string) => Promise<boolean>;
  onUploadCulture: (patientRow: RadarEvent, file: File) => Promise<boolean>;
  onOpenSmartCulture?: (patientRow: RadarEvent, file?: File | null) => void;
  onOpenInspector: (patientKey: string) => void;
  onOpenCulture: (culture: CultureAttachment) => void;
}

function PriorityStatusText({ level }: { level: PriorityLevel }) {
  if (level === PriorityLevel.Urgent) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{PRIORITY_LABELS[level]}</span>
      </span>
    );
  }
  if (level === PriorityLevel.Today) {
    return (
      <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-400">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>{PRIORITY_LABELS[level]}</span>
      </span>
    );
  }
  if (level === PriorityLevel.NextCut) {
    return (
      <span className="font-semibold text-teal-700 dark:text-teal-300">
        {PRIORITY_LABELS[level]}
      </span>
    );
  }
  return (
    <span className="font-medium text-slate-600 dark:text-slate-400">
      {PRIORITY_LABELS[level]}
    </span>
  );
}

function hasExtraClinicalDetails(r: RadarEvent): boolean {
  return Boolean(
    r.res || r.muestra || r.disp || r.tipo || r.ing || r.exp || r.epi || r.atb || r.obs
  );
}

export function PatientCard({
  group,
  corte,
  outbreakIds,
  doneMap,
  markingIds,
  sharedMarks,
  notesIndex,
  culturesIndex,
  options = {},
  onMark,
  onUnmark,
  onSaveCriteria,
  onSubmitNursingNote,
  onUploadCulture,
  onOpenSmartCulture,
  onOpenInspector,
  onOpenCulture,
}: PatientCardProps) {
  const { primary, events, patientKey, serviceGroup, subservice } = group;

  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [openCriteria, setOpenCriteria] = useState<Record<string, boolean>>({});
  const [showNotesList, setShowNotesList] = useState(false);
  const [showCulturesList, setShowCulturesList] = useState(false);

  const [showNursingForm, setShowNursingForm] = useState(false);
  const [nursingDraft, setNursingDraft] = useState('');
  const [sendingNursingNote, setSendingNursingNote] = useState(false);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const patientNotes = lookupByPatient(notesIndex, patientKey, primary.nombre);
  const patientCultures = lookupByPatient(culturesIndex, patientKey, primary.nombre);

  const ageLabel =
    primary.edad != null
      ? `${primary.edad}${/^\d+$/.test(String(primary.edad)) ? ' años' : ''}`
      : null;

  const serviceDisplay =
    subservice && subservice !== serviceGroup ? subservice : primary.svc || serviceGroup;

  const dischargeReason = options.isDischargedView ? getDischargeReason(primary) : null;

  const toggleDetail = (id: string) =>
    setOpenDetails((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleCrit = (id: string) =>
    setOpenCriteria((prev) => ({ ...prev, [id]: !prev[id] }));

  const renderClinicalDetails = (r: RadarEvent) => {
    const items: Array<[string, string]> = [];
    if (r.res) items.push(['Resultado', r.res]);
    if (r.muestra) {
      items.push(['Muestra', `${r.muestra}${r.fres ? ` (${fmtShort(r.fres)})` : ''}`]);
    }
    if (r.disp) items.push(['Dispositivo o cirugía', r.disp]);
    if (r.tipo) {
      items.push([
        'Tipo de IAAS',
        `${r.tipo}${r.fcap ? ` · capturada ${fmtShort(r.fcap)}` : ''}`,
      ]);
    }
    if (r.ing) {
      const stay =
        corte && daysBetween(r.ing, corte) >= 0
          ? ` · estancia ${daysBetween(r.ing, corte) + 1} días`
          : '';
      items.push(['Ingreso hospitalario', `${fmtFull(r.ing)}${stay}`]);
    }
    if (r.exp) items.push(['Expediente', String(r.exp)]);
    if (r.epi) items.push(['Estado epidemiológico', r.epi]);

    return (
      <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-3 text-sm">
        {items.length > 0 && (
          <dl className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-4 gap-y-1.5">
            {items.map(([dt, dd]) => (
              <div key={dt} className="contents">
                <dt className="text-xs font-medium text-slate-500 dark:text-slate-400 sm:py-0.5">
                  {dt}
                </dt>
                <dd className="text-slate-800 dark:text-slate-200 font-normal break-words sm:py-0.5">
                  {dt === 'Expediente' ? (
                    <span className="font-mono text-[13px] tabular-nums">{dd}</span>
                  ) : (
                    dd
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {r.atb && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Antibiograma reportado
            </div>
            <p className="font-mono text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
              {r.atb}
            </p>
          </div>
        )}

        {r.obs && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Observaciones de censo
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400 max-h-28 overflow-y-auto">
              {r.obs}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderReviewControls = (r: RadarEvent) => {
    const done = doneMap[r.id];
    const isBusy = Boolean(markingIds[r.id]);
    const hideCheck =
      options.hideReviewActions ||
      (options.showRhoveStatus &&
        isRhoveCaptured(r) &&
        !hasPendingCulture(r) &&
        !hasUncapturedMicroorganism(r, outbreakIds));

    if (hideCheck) return null;

    if (done) {
      const isDisc = done.cls === 'sin_iaas';
      const byTxt = done.autor
        ? ` por ${shortAuthor(done.autor)}${
            done.fecha
              ? ` · ${new Date(done.fecha).toLocaleDateString('es-MX', {
                  day: '2-digit',
                  month: '2-digit',
                })}`
              : ''
          }`
        : '';

      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onUnmark(r)}
          className={`w-full min-h-[44px] px-4 py-2 rounded-lg border text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 ${
            isDisc
              ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 hover:bg-rose-100/70 dark:hover:bg-rose-950/50'
              : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/50'
          }`}
        >
          <RotateCcw className="w-4 h-4 shrink-0" />
          <span>
            {isDisc ? 'Descartado' : 'Revisado'}
            {byTxt} · Deshacer
          </span>
        </button>
      );
    }

    return (
      <div className="grid grid-cols-2 max-[420px]:grid-cols-1 gap-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onMark(r, 'revisado')}
          className="min-h-[44px] px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 whitespace-nowrap"
        >
          <Check className="w-4 h-4 shrink-0" />
          <span>{isBusy ? 'Guardando…' : 'Ya lo revisé'}</span>
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onMark(r, 'descartado')}
          className="min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-60 whitespace-nowrap"
        >
          <X className="w-4 h-4 shrink-0" />
          <span>Descartar IAAS</span>
        </button>
      </div>
    );
  };

  return (
    <article className="bg-white dark:bg-[#111726] border border-slate-200/90 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden transition-colors">
      {/* Patient Identity Header */}
      <div className="p-4 sm:p-5 pb-3.5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/90 text-center min-w-[60px] shrink-0">
            <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400">
              Cama
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {primary.cama || 's/c'}
            </span>
          </div>

          <div className="min-w-0">
            <h3 className="font-display text-base sm:text-[17px] font-bold text-slate-900 dark:text-slate-100 leading-snug break-words">
              {primary.nombre || 'Paciente sin nombre'}
            </h3>

            {/* Unboxed Clean Metadata with · Separators */}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-400">
              <span>{serviceDisplay}</span>
              {ageLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{ageLabel}</span>
                </>
              )}
              {primary.exp && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono text-xs tabular-nums">Exp. {primary.exp}</span>
                </>
              )}
              {events.length > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {events.length} alertas activas
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

        {/* Slide-Over Dossier Trigger */}
        <button
          type="button"
          onClick={() => onOpenInspector(patientKey)}
          title="Abrir expediente operativo en panel lateral"
          aria-label={`Abrir expediente operativo de ${primary.nombre || 'paciente'}`}
          className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      </div>

      {/* Clinical Events List */}
      <div className="px-4 sm:px-5 divide-y divide-slate-100 dark:divide-slate-800/80">
        {events.map((ev) => {
          const pri = getPriorityLevel(ev);
          const done = Boolean(doneMap[ev.id]);
          const nuevo = isNewDetection(ev, corte);
          const chips = parseMicroChips(ev);
          const critMark = sharedMarks?.[mkCriterios(ev)];
          const canShowCrit =
            isIAAS(ev, outbreakIds) && !isDiscarded(ev) && !options.isDischargedView;
          const isCritOpen = Boolean(openCriteria[ev.id]);
          const isDetOpen = Boolean(openDetails[ev.id]);

          const descriptors: Array<{
            text: string;
            tone?: 'crit' | 'warn' | 'ok' | 'brand';
          }> = [];
          if (nuevo) descriptors.push({ text: 'Nuevo en el corte', tone: 'brand' });
          if (isReadmission(ev)) descriptors.push({ text: 'Reingreso', tone: 'warn' });
          if (outbreakIds.has(ev.id) && !norm(ev.prog).includes('iaas')) {
            descriptors.push({ text: 'Patrón de posible brote', tone: 'warn' });
          }
          if (hasRecentCulture(ev, corte)) {
            descriptors.push({ text: `Cultivo ${fmtShort(ev.fres)}`, tone: 'brand' });
          }
          if (options.showRhoveStatus) {
            if (isRhoveCaptured(ev)) {
              if (hasPendingCulture(ev)) {
                descriptors.push({ text: 'Cultivo pendiente', tone: 'warn' });
              } else if (hasUncapturedMicroorganism(ev, outbreakIds)) {
                descriptors.push({ text: 'Microorganismo sin capturar en RHOVE', tone: 'warn' });
              }
              descriptors.push({ text: 'Capturada en RHOVE', tone: 'ok' });
            } else {
              descriptors.push({ text: 'Por revisar', tone: 'crit' });
            }
          } else if (isIAAS(ev, outbreakIds) && norm(ev.rhove).startsWith('no capturada')) {
            descriptors.push({ text: 'No está en RHOVE', tone: 'crit' });
          }
          if (options.showProgram && ev.prog) {
            descriptors.push({ text: ev.prog });
          }
          if (!isIAAS(ev, outbreakIds) && norm(ev.notif) === 'pendiente') {
            descriptors.push({ text: 'Notificación pendiente', tone: 'warn' });
          }

          return (
            <div
              key={ev.id}
              className={`py-3.5 first:pt-1 flex flex-col gap-3 ${done ? 'opacity-70' : ''}`}
            >
              {/* Unboxed Priority & Clinical Descriptors Line */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <PriorityStatusText level={pri} />
                {descriptors.map((desc, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2">
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <span
                      className={
                        desc.tone === 'crit'
                          ? 'font-medium text-red-700 dark:text-red-400'
                          : desc.tone === 'warn'
                            ? 'font-medium text-amber-700 dark:text-amber-400'
                            : desc.tone === 'ok'
                              ? 'font-medium text-emerald-700 dark:text-emerald-400'
                              : desc.tone === 'brand'
                                ? 'font-semibold text-teal-700 dark:text-teal-300'
                                : 'text-slate-600 dark:text-slate-400'
                      }
                    >
                      {desc.text}
                    </span>
                  </span>
                ))}
              </div>

              {/* Microorganism */}
              {ev.micro && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Microorganismo
                  </span>
                  {chips.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {chips.map((chip, idx) => (
                        <div
                          key={idx}
                          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                        >
                          <div className="min-w-0">
                            <span className="italic font-semibold text-[15px] text-slate-900 dark:text-slate-100">
                              {chip.label}
                            </span>
                            {ev.muestra && (
                              <span className="text-xs text-slate-600 dark:text-slate-400 ml-2">
                                · {ev.muestra}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-xs font-medium ${
                              chip.captured
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-red-700 dark:text-red-400'
                            }`}
                          >
                            {chip.captured ? 'Capturado en RHOVE' : 'Pendiente valoración/captura'}
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

              {/* Clinical Narrative: Motivo & Conducta */}
              {ev.motivo && (
                <div>
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                    Motivo clínico
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {ev.motivo}
                  </p>
                </div>
              )}

              {ev.accion && (
                <div className="rounded-lg bg-teal-50/60 dark:bg-teal-950/25 px-3.5 py-2.5">
                  <div className="text-[11px] font-semibold text-teal-800 dark:text-teal-300 mb-0.5">
                    Conducta sugerida
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                    {ev.accion}
                  </p>
                </div>
              )}

              {/* Per-event Utility Triggers (Criterios + Más datos) */}
              {(canShowCrit || hasExtraClinicalDetails(ev)) && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                  {canShowCrit ? (
                    <button
                      type="button"
                      onClick={() => toggleCrit(ev.id)}
                      className="min-h-[38px] px-2.5 py-1.5 -ml-2.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                      <span>
                        Criterios UVEH
                        {critMark?.detalle?.cumple
                          ? ` · ${CUMPLE_LABELS[critMark.detalle.cumple]}`
                          : ''}
                      </span>
                      {isCritOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <span />
                  )}

                  {hasExtraClinicalDetails(ev) && (
                    <button
                      type="button"
                      onClick={() => toggleDetail(ev.id)}
                      className="min-h-[38px] px-2.5 py-1.5 -mr-2.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1 transition-colors"
                    >
                      <span>{isDetOpen ? 'Ocultar datos' : 'Ver más datos'}</span>
                      {isDetOpen ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              )}

              {isCritOpen && (
                <CriteriaChecklist
                  event={ev}
                  corte={corte}
                  savedMark={critMark}
                  onSave={onSaveCriteria}
                  onClose={() => toggleCrit(ev.id)}
                />
              )}

              {isDetOpen && renderClinicalDetails(ev)}

              {events.length > 1 && renderReviewControls(ev)}
            </div>
          );
        })}
      </div>

      {/* Compact Collaboration & Attachments Footer */}
      <div className="mt-auto px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-2.5">
        {/* Single Quiet Action Row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-slate-600 dark:text-slate-400">
          {patientCultures.length === 1 && (
            <button
              type="button"
              onClick={() => onOpenCulture(patientCultures[0])}
              className="min-h-[38px] inline-flex items-center gap-1.5 font-semibold text-teal-700 dark:text-teal-300 hover:underline transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Ver cultivo</span>
            </button>
          )}

          {patientCultures.length > 1 && (
            <button
              type="button"
              onClick={() => setShowCulturesList((v) => !v)}
              className="min-h-[38px] inline-flex items-center gap-1.5 font-semibold text-teal-700 dark:text-teal-300 hover:underline transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Cultivos ({patientCultures.length})</span>
              {showCulturesList ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {patientNotes.length > 0 && (
            <button
              type="button"
              onClick={() => setShowNotesList((v) => !v)}
              className="min-h-[38px] inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
            >
              <span>
                {patientNotes.length === 1
                  ? '1 nota de piso'
                  : `${patientNotes.length} notas de piso`}
              </span>
              {showNotesList ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowNursingForm((v) => !v)}
            className="min-h-[38px] inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            <span>Reportar cambio</span>
          </button>

          <button
            type="button"
            onClick={() => setShowUploadForm((v) => !v)}
            className="min-h-[38px] inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Adjuntar cultivo</span>
          </button>
        </div>

        {/* On-demand Attached Cultures List (when > 1) */}
        {showCulturesList && patientCultures.length > 1 && (
          <div className="flex flex-col gap-1.5 pt-1">
            {patientCultures.map((att, idx) => (
              <button
                key={`${att.archivo}-${idx}`}
                type="button"
                onClick={() => onOpenCulture(att)}
                className="min-h-[40px] px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 flex items-center justify-between gap-2.5 text-left text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
              >
                <span className="truncate">{att.archivo}</span>
                <span className="text-teal-700 dark:text-teal-300 font-semibold shrink-0">
                  Ver reporte
                </span>
              </button>
            ))}
          </div>
        )}

        {/* On-demand Nursing Field Notes */}
        {showNotesList && patientNotes.length > 0 && (
          <div className="flex flex-col gap-1.5 pt-1">
            {patientNotes.map((n) => (
              <div
                key={n.fila}
                className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3.5 py-2 text-[13px]"
              >
                <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Nota de enfermería{n.aplicada ? ' · aplicada en corte' : ''}
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

        {/* Inline Nursing Note Form */}
        {showNursingForm && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
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
                className="px-3.5 py-2 min-h-[38px] rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-60"
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
                className="px-3 py-2 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Inline Single Culture Attachment Form */}
        {showUploadForm && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
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
                className="px-3.5 py-2 min-h-[38px] rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-50"
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
                  className="px-3 py-2 min-h-[38px] rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300 text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <FileScan className="w-3.5 h-3.5" />
                  <span>Leer antibiograma</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowUploadForm(false);
                  setSelectedFile(null);
                }}
                className="px-3 py-2 min-h-[38px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Primary Single-Event Review Footer */}
        {events.length === 1 && renderReviewControls(events[0])}
      </div>
    </article>
  );
}
