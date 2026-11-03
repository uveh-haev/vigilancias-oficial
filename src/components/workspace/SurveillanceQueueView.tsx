import { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import {
  CriteriaEvaluation,
  CultureAttachment,
  DoneRecord,
  NursingNote,
  PriorityLevel,
  QueueTabId,
  RadarEvent,
  SharedMark,
  ViewDensity,
} from '../../types/clinical';
import {
  filterRowsByQuery,
  getDischargeReason,
  groupEventsByPatient,
  hasPendingCulture,
  isFocusPending,
  isRhoveCaptured,
  SurveillanceSlices,
} from '../../domain/classification';
import {
  getPriorityLevel,
  getServiceGroup,
  getSubservice,
  PatientIndexedList,
} from '../../domain/services';
import { PatientCard, PatientCardDisplayOptions } from '../patients/PatientCard';
import { PatientTable } from '../patients/PatientTable';
import { ReviewedFollowUpBar } from '../patients/ReviewedFollowUpBar';

interface SurveillanceQueueViewProps {
  activeTab: QueueTabId;
  slices: SurveillanceSlices;
  corte: string | null;
  canWrite: boolean;
  doneMap: Record<string, DoneRecord>;
  markingIds: Record<string, boolean>;
  sharedMarks: Record<string, SharedMark> | null;
  corteNote: string;
  notesIndex: PatientIndexedList<NursingNote>;
  culturesIndex: PatientIndexedList<CultureAttachment>;
  selectedService: string;
  selectedProgram: string;
  onSelectProgram: (prog: string) => void;
  selectedDischargeReason: string;
  onSelectDischargeReason: (reason: string) => void;
  searchQuery: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  viewDensity: ViewDensity;
  onMark: (event: RadarEvent, tipo: 'revisado' | 'descartado') => void;
  onUnmark: (event: RadarEvent) => void;
  onSaveCriteria: (event: RadarEvent, evaluation: CriteriaEvaluation) => Promise<boolean>;
  onSubmitNursingNote: (patientRow: RadarEvent, text: string) => Promise<boolean>;
  onUploadCulture: (patientRow: RadarEvent, file: File) => Promise<boolean>;
  onOpenSmartCulture: (patientRow: RadarEvent, file?: File | null) => void;
  onOpenInspector: (patientKey: string, orderedKeys?: string[]) => void;
  onOpenCulture: (culture: CultureAttachment) => void;
}

const DISCHARGE_REASONS_ORDER = [
  'Defunción',
  'Egreso',
  'Traslado',
  'No localizado en censo',
  'Ambulatorio',
  'Cerrado',
];

export function SurveillanceQueueView({
  activeTab,
  slices,
  corte,
  canWrite,
  doneMap,
  markingIds,
  sharedMarks,
  corteNote,
  notesIndex,
  culturesIndex,
  selectedService,
  selectedProgram,
  onSelectProgram,
  selectedDischargeReason,
  onSelectDischargeReason,
  searchQuery,
  hasActiveFilters,
  onClearFilters,
  viewDensity,
  onMark,
  onUnmark,
  onSaveCriteria,
  onSubmitNursingNote,
  onUploadCulture,
  onOpenSmartCulture,
  onOpenInspector,
  onOpenCulture,
}: SurveillanceQueueViewProps) {
  const [openServiceAccordions, setOpenServiceAccordions] = useState<Record<string, boolean>>({});
  const [showCompletedGroups, setShowCompletedGroups] = useState<Record<string, boolean>>({});

  const queueDef = slices.queues.find((q) => q.id === activeTab) || slices.queues[0];

  const { rawItems, cardOptions, splitCompleted } = (() => {
    const sortByPri = (a: RadarEvent, b: RadarEvent) =>
      getPriorityLevel(a) - getPriorityLevel(b) ||
      String(b.det || '').localeCompare(String(a.det || ''));

    if (activeTab === 'foco') {
      return {
        rawItems: slices.foco,
        cardOptions: {} as PatientCardDisplayOptions,
        splitCompleted: true,
      };
    }
    if (activeTab === 'iaas') {
      const rank = (r: RadarEvent) =>
        isFocusPending(r, slices.outbreakIds) ? 0 : hasPendingCulture(r) ? 1 : 2;
      const sorted = slices.iaasAll
        .slice()
        .sort((a, b) => rank(a) - rank(b) || sortByPri(a, b));
      return {
        rawItems: sorted,
        cardOptions: { showRhoveStatus: true },
        splitCompleted: true,
      };
    }
    if (activeTab === 'cultpend') {
      return {
        rawItems: slices.cultPendAll.slice().sort(sortByPri),
        cardOptions: { showRhoveStatus: true },
        splitCompleted: true,
      };
    }
    if (activeTab === 'sincult') {
      return {
        rawItems: slices.sinCultAll.slice().sort(sortByPri),
        cardOptions: { showRhoveStatus: true },
        splitCompleted: true,
      };
    }
    if (activeTab === 'sincapturar') {
      return {
        rawItems: slices.sinCapturarAll.slice().sort(sortByPri),
        cardOptions: { showRhoveStatus: true },
        splitCompleted: true,
      };
    }
    if (activeTab === 'reingresos') {
      return {
        rawItems: slices.reingresosAll.slice().sort(sortByPri),
        cardOptions: { showRhoveStatus: true },
        splitCompleted: true,
      };
    }
    if (activeTab === 'revisados') {
      const sorted = slices.revisadosAll
        .slice()
        .sort(
          (a, b) =>
            String(doneMap[b.id]?.fecha || '').localeCompare(
              String(doneMap[a.id]?.fecha || '')
            ) || sortByPri(a, b)
        );
      return {
        rawItems: sorted,
        cardOptions: {},
        splitCompleted: false,
      };
    }
    if (activeTab === 'descartados') {
      const sorted = slices.descartadosAll
        .slice()
        .sort(
          (a, b) =>
            String(doneMap[b.id]?.fecha || '').localeCompare(
              String(doneMap[a.id]?.fecha || '')
            ) || sortByPri(a, b)
        );
      return {
        rawItems: sorted,
        cardOptions: {},
        splitCompleted: false,
      };
    }
    if (activeTab === 'egresos') {
      const byReason = slices.egresosAll.filter(
        (r) => !selectedDischargeReason || getDischargeReason(r) === selectedDischargeReason
      );
      const sorted = byReason
        .slice()
        .sort((a, b) =>
          String(b.egreso || b.det || '').localeCompare(String(a.egreso || a.det || ''))
        );
      return {
        rawItems: sorted,
        cardOptions: { hideReviewActions: true, isDischargedView: true },
        splitCompleted: false,
      };
    }
    if (activeTab === 'otros') {
      const byProg = slices.otrosAll.filter(
        (r) => !selectedProgram || (r.prog || 'Sin programa') === selectedProgram
      );
      return {
        rawItems: byProg.slice().sort(sortByPri),
        cardOptions: { showProgram: !selectedProgram },
        splitCompleted: true,
      };
    }
    const sortedRhove = slices.capturadosRhove
      .slice()
      .sort(
        (a, b) =>
          getServiceGroup(a).localeCompare(getServiceGroup(b), 'es') || sortByPri(a, b)
      );
    return {
      rawItems: sortedRhove,
      cardOptions: { showRhoveStatus: true, hideReviewActions: true },
      splitCompleted: false,
    };
  })();

  const filteredItems = filterRowsByQuery(rawItems, searchQuery);

  const programCounts = (() => {
    if (activeTab !== 'otros') return null;
    const map: Record<string, number> = {};
    slices.otrosAll.forEach((r) => {
      const k = r.prog || 'Sin programa';
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  })();

  const dischargeCounts = (() => {
    if (activeTab !== 'egresos') return null;
    const map: Record<string, number> = {};
    slices.egresosAll.forEach((r) => {
      const reason = getDischargeReason(r);
      map[reason] = (map[reason] || 0) + 1;
    });
    return map;
  })();

  const renderPatientListBlock = (
    items: RadarEvent[],
    scopeKey: string,
    opts: PatientCardDisplayOptions
  ) => {
    const allGroups = groupEventsByPatient(items);
    const pendingGroups = splitCompleted
      ? allGroups.filter((g) => g.events.some((r) => !doneMap[r.id]))
      : allGroups;
    const completedGroups = splitCompleted
      ? allGroups.filter((g) => g.events.every((r) => Boolean(doneMap[r.id])))
      : [];

    const renderGroups = (groupsToRender: typeof allGroups) => {
      const orderedKeys = groupsToRender.map((g) => g.patientKey);

      if (viewDensity === 'table') {
        return (
          <PatientTable
            groups={groupsToRender}
            corte={corte}
            doneMap={doneMap}
            markingIds={markingIds}
            options={opts}
            onMark={onMark}
            onUnmark={onUnmark}
            onOpenInspector={onOpenInspector}
          />
        );
      }

      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {groupsToRender.map((g) => (
            <PatientCard
              key={g.patientKey}
              group={g}
              corte={corte}
              outbreakIds={slices.outbreakIds}
              doneMap={doneMap}
              markingIds={markingIds}
              sharedMarks={sharedMarks}
              notesIndex={notesIndex}
              culturesIndex={culturesIndex}
              options={opts}
              onMark={onMark}
              onUnmark={onUnmark}
              onSaveCriteria={onSaveCriteria}
              onSubmitNursingNote={onSubmitNursingNote}
              onUploadCulture={onUploadCulture}
              onOpenSmartCulture={onOpenSmartCulture}
              onOpenInspector={(pk) => onOpenInspector(pk, orderedKeys)}
              onOpenCulture={onOpenCulture}
            />
          ))}
        </div>
      );
    };

    const showDone = Boolean(showCompletedGroups[scopeKey]);

    return (
      <div className="flex flex-col gap-4">
        {pendingGroups.length > 0 ? (
          renderGroups(pendingGroups)
        ) : (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium py-1">
            Todos los pacientes de este bloque fueron revisados.
          </p>
        )}

        {completedGroups.length > 0 && (
          <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() =>
                setShowCompletedGroups((prev) => ({
                  ...prev,
                  [scopeKey]: !prev[scopeKey],
                }))
              }
              className="min-h-[38px] inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline"
            >
              {showDone ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              <span>Ya revisados en este bloque ({completedGroups.length})</span>
            </button>
            {showDone && <div className="mt-3">{renderGroups(completedGroups)}</div>}
          </div>
        )}
      </div>
    );
  };

  const renderBySubservice = (items: RadarEvent[], serviceName: string) => {
    const subs = [...new Set(items.map(getSubservice))];
    if (subs.length <= 1) {
      return renderPatientListBlock(items, `${activeTab}|${serviceName}`, cardOptions);
    }
    subs.sort((a, b) =>
      a === serviceName ? -1 : b === serviceName ? 1 : a.localeCompare(b, 'es')
    );

    return (
      <div className="flex flex-col gap-5">
        {subs.map((sub) => {
          const subItems = items.filter((r) => getSubservice(r) === sub);
          return (
            <div key={sub} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>{sub}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{subItems.length}</span>
              </div>
              {renderPatientListBlock(
                subItems,
                `${activeTab}|${serviceName}|${sub}`,
                cardOptions
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderGroupedServices = () => {
    if (activeTab === 'egresos' || viewDensity === 'table') {
      return renderPatientListBlock(filteredItems, `${activeTab}|flat`, cardOptions);
    }

    const byService: Record<string, RadarEvent[]> = {};
    filteredItems.forEach((r) => {
      const g = getServiceGroup(r);
      (byService[g] = byService[g] || []).push(r);
    });

    const urgentCountOf = (g: string) =>
      byService[g].filter(
        (r) => getPriorityLevel(r) === PriorityLevel.Urgent && !doneMap[r.id]
      ).length;

    const serviceNames = Object.keys(byService).sort(
      (a, b) =>
        urgentCountOf(b) - urgentCountOf(a) ||
        byService[b].length - byService[a].length ||
        a.localeCompare(b, 'es')
    );

    if (selectedService || serviceNames.length === 1 || searchQuery.trim()) {
      return (
        <div className="flex flex-col gap-6">
          {serviceNames.map((g) => (
            <div key={g} className="flex flex-col gap-3">
              {!selectedService && (
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{g}</h3>
              )}
              {renderBySubservice(byService[g], g)}
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-5">
        {serviceNames.map((g) => {
          const list = byService[g];
          const urg = urgentCountOf(g);
          const pend = list.filter((r) => !doneMap[r.id]).length;
          const accKey = `${activeTab}|${g}`;
          const isOpen =
            accKey in openServiceAccordions ? openServiceAccordions[accKey] : urg > 0 || pend > 0;

          const summaryRight =
            activeTab === 'iaas'
              ? `${list.length} IAAS · ${
                  list.filter((r) => isFocusPending(r, slices.outbreakIds) && !doneMap[r.id])
                    .length
                } por revisar${
                  list.filter(
                    (r) => isRhoveCaptured(r) && hasPendingCulture(r) && !doneMap[r.id]
                  ).length
                    ? ` · ${
                        list.filter(
                          (r) => isRhoveCaptured(r) && hasPendingCulture(r) && !doneMap[r.id]
                        ).length
                      } cultivo pend.`
                    : ''
                }`
              : splitCompleted
                ? `${pend} pendiente${pend === 1 ? '' : 's'}`
                : `${list.length} registro${list.length === 1 ? '' : 's'}`;

          return (
            <section key={g} className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() =>
                  setOpenServiceAccordions((prev) => ({
                    ...prev,
                    [accKey]: !isOpen,
                  }))
                }
                aria-expanded={isOpen}
                className="w-full min-h-[46px] py-2 px-1 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-left group"
              >
                <div className="flex items-center gap-2.5">
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200" />
                  )}
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                    {g}
                  </h3>
                  {urg > 0 && (
                    <span className="text-xs font-semibold text-red-700 dark:text-red-400 tabular-nums">
                      · {urg} urgente{urg === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {summaryRight}
                </span>
              </button>

              {isOpen && renderBySubservice(list, g)}
            </section>
          );
        })}
      </div>
    );
  };

  const renderContextualSummary = () => {
    if (activeTab === 'foco') {
      const urg = filteredItems.filter(
        (r) => getPriorityLevel(r) === PriorityLevel.Urgent && !doneMap[r.id]
      ).length;
      const hoy = filteredItems.filter(
        (r) => getPriorityLevel(r) === PriorityLevel.Today && !doneMap[r.id]
      ).length;
      const pend = filteredItems.filter((r) => !doneMap[r.id]).length;

      return (
        <p className="text-sm sm:text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed">
          {pend > 0 ? (
            <>
              {selectedService ? `En ${selectedService} hay ` : 'Hay '}
              <strong className="font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                {pend}
              </strong>{' '}
              evento{pend === 1 ? '' : 's'} con sospecha de IAAS por revisar.
              {urg > 0 ? (
                <>
                  {' '}
                  Prioriza{' '}
                  <strong className="font-semibold text-red-700 dark:text-red-400 tabular-nums">
                    {urg} urgente{urg === 1 ? '' : 's'}
                  </strong>
                  {hoy > 0 ? ` y enseguida ${hoy} programado${hoy === 1 ? '' : 's'} para hoy.` : '.'}
                </>
              ) : hoy > 0 ? (
                <> {hoy} corresponden a revisión del día de hoy.</>
              ) : null}
            </>
          ) : (
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              No quedan pacientes pendientes por revisar con los filtros actuales.
            </span>
          )}
        </p>
      );
    }

    if (activeTab === 'iaas') {
      const nPend = filteredItems.filter((r) => isFocusPending(r, slices.outbreakIds)).length;
      const nCap = filteredItems.filter(isRhoveCaptured).length;
      const nCultPend = filteredItems.filter(
        (r) => isRhoveCaptured(r) && hasPendingCulture(r)
      ).length;
      return (
        <p className="text-sm sm:text-[15px] text-slate-700 dark:text-slate-300 leading-relaxed tabular-nums">
          {selectedService ? `En ${selectedService}: ` : 'Total hospitalario: '}
          <strong className="font-semibold text-slate-900 dark:text-slate-100">
            {filteredItems.length} IAAS activas
          </strong>{' '}
          · <span className="text-red-700 dark:text-red-400 font-medium">{nPend} por revisar</span> ·{' '}
          <span className="text-emerald-700 dark:text-emerald-400 font-medium">
            {nCap} capturadas en RHOVE
          </span>
          {nCultPend > 0 && (
            <>
              {' '}
              ·{' '}
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                {nCultPend} con cultivo pendiente
              </span>
            </>
          )}
        </p>
      );
    }

    return (
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {queueDef.description}
      </p>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Queue Header & Contextual Summary */}
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {queueDef.label}
          </h2>
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {selectedService || 'Todos los servicios'} · {filteredItems.length} registro
            {filteredItems.length === 1 ? '' : 's'}
          </span>
        </div>
        {renderContextualSummary()}
      </div>

      {/* Sub-filter Segmented Bar for 'otros' */}
      {activeTab === 'otros' && programCounts && Object.keys(programCounts).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectProgram('')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              !selectedProgram
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Todos ({slices.otrosAll.length})
          </button>
          {Object.entries(programCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([prog, count]) => (
              <button
                key={prog}
                type="button"
                onClick={() => onSelectProgram(prog)}
                className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  selectedProgram === prog
                    ? 'bg-teal-700 text-white dark:bg-teal-600'
                    : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {prog} ({count})
              </button>
            ))}
        </div>
      )}

      {/* Sub-filter Segmented Bar for 'egresos' */}
      {activeTab === 'egresos' && dischargeCounts && Object.keys(dischargeCounts).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSelectDischargeReason('')}
            className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
              !selectedDischargeReason
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            Todos ({slices.egresosAll.length})
          </button>
          {DISCHARGE_REASONS_ORDER.filter((m) => dischargeCounts[m]).map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => onSelectDischargeReason(reason)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                selectedDischargeReason === reason
                  ? 'bg-teal-700 text-white dark:bg-teal-600'
                  : 'border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {reason} ({dischargeCounts[reason]})
            </button>
          ))}
        </div>
      )}

      {/* Reviewed in Follow-Up Collapsible Bar (only in 'foco') */}
      {activeTab === 'foco' && (
        <ReviewedFollowUpBar
          reviewedRows={slices.revisadosAll}
          doneMap={doneMap}
          markingIds={markingIds}
          onUnmark={onUnmark}
          onOpenInspector={onOpenInspector}
        />
      )}

      {/* Main Queue Records */}
      {filteredItems.length > 0 ? (
        renderGroupedServices()
      ) : (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center flex flex-col items-center gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {searchQuery.trim()
                ? 'Sin coincidencias con tu búsqueda'
                : 'Sin pacientes en esta lista'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              {searchQuery.trim()
                ? 'Prueba con otro nombre, número de cama, expediente o microorganismo.'
                : `No hay registros activos en “${queueDef.shortLabel}”${
                    selectedService ? ` para ${selectedService}` : ''
                  }.`}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="mt-1 min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Mostrar todos los servicios y limpiar búsqueda</span>
            </button>
          )}
        </div>
      )}

      {/* UVEH Internal Cut-off Note */}
      {canWrite && corteNote && (
        <details className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-sm">
          <summary className="font-semibold text-slate-800 dark:text-slate-200 cursor-pointer select-none">
            Nota interna del corte (UVEH)
          </summary>
          <p className="mt-2 text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
            {corteNote}
          </p>
        </details>
      )}
    </div>
  );
}
