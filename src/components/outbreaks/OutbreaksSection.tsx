import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  PanelRightOpen,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  BulletinPayload,
  CodecinSnapshot,
  CriteriaEvaluation,
  CultureAttachment,
  DoneRecord,
  NursingNote,
  OutbreakCluster,
  OutbreakStudyRecord,
  RadarEvent,
  SharedMark,
  SuiveTemplateMappingSummary,
} from '../../types/clinical';
import { filterRowsByQuery, groupEventsByPatient, isIAAS } from '../../domain/classification';
import { loadCodecinSnapshots } from '../../domain/codecinMetrics';
import { fmtFull, fmtShort, norm } from '../../domain/dates';
import {
  STAGE_LABELS,
  buildClusterKey,
  buildOutbreakStudyFromCluster,
  computeDaysSinceLastCase,
} from '../../domain/iaasTaxonomy2024';
import { prettyOrganism } from '../../domain/outbreaks';
import { getPatientKey, getRowMeta, PatientIndexedList } from '../../domain/services';
import {
  exportOutbreakStudyToExcel,
  getSavedSuiveTemplateMeta,
  hasActiveTemplateBytes,
  inspectAndSaveSuiveTemplate,
} from '../../domain/suive3ExcelEngine';
import { PatientCard } from '../patients/PatientCard';
import { OutbreakStudyModal } from './OutbreakStudyModal';

interface OutbreaksSectionProps {
  bulletin: BulletinPayload;
  clusters: OutbreakCluster[];
  identicalClusters: OutbreakCluster[];
  recentCultures: RadarEvent[];
  atbMode: 'all' | 'identico';
  onChangeAtbMode: (mode: 'all' | 'identico') => void;
  searchQuery: string;
  selectedService: string;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  corte: string | null;
  canWrite: boolean;
  darkMode: boolean;
  authorName: string;
  outbreakIds: Set<string>;
  doneMap: Record<string, DoneRecord>;
  markingIds: Record<string, boolean>;
  sharedMarks: Record<string, SharedMark> | null;
  notesIndex: PatientIndexedList<NursingNote>;
  cultures: CultureAttachment[];
  culturesIndex: PatientIndexedList<CultureAttachment>;
  externalCodecinSnapshots: CodecinSnapshot[] | null;
  outbreakStudies: OutbreakStudyRecord[];
  onSaveOutbreakStudy: (study: OutbreakStudyRecord) => Promise<void>;
  onDeleteOutbreakStudy: (studyId: string) => Promise<void>;
  onNotify: (msg: string) => void;
  onMark: (event: RadarEvent, tipo: 'revisado' | 'descartado') => void;
  onUnmark: (event: RadarEvent) => void;
  onSaveCriteria: (event: RadarEvent, evaluation: CriteriaEvaluation) => Promise<boolean>;
  onSubmitNursingNote: (patientRow: RadarEvent, text: string) => Promise<boolean>;
  onUploadCulture: (patientRow: RadarEvent, file: File) => Promise<boolean>;
  onOpenSmartCulture: (patientRow: RadarEvent, file?: File | null) => void;
  onOpenInspector: (patientKey: string, orderedKeys?: string[]) => void;
  onOpenCulture: (culture: CultureAttachment) => void;
}

export function OutbreaksSection({
  bulletin,
  clusters,
  identicalClusters,
  recentCultures,
  atbMode,
  onChangeAtbMode,
  searchQuery,
  selectedService,
  hasActiveFilters,
  onClearFilters,
  corte,
  canWrite,
  darkMode,
  authorName,
  outbreakIds,
  doneMap,
  markingIds,
  sharedMarks,
  notesIndex,
  cultures,
  culturesIndex,
  externalCodecinSnapshots,
  outbreakStudies,
  onSaveOutbreakStudy,
  onDeleteOutbreakStudy,
  onNotify,
  onMark,
  onUnmark,
  onSaveCriteria,
  onSubmitNursingNote,
  onUploadCulture,
  onOpenSmartCulture,
  onOpenInspector,
  onOpenCulture,
}: OutbreaksSectionProps) {
  const [modalState, setModalState] = useState<{
    open: boolean;
    study: OutbreakStudyRecord | null;
    cluster: OutbreakCluster | null;
  }>({ open: false, study: null, cluster: null });

  const [templateMeta, setTemplateMeta] = useState<SuiveTemplateMappingSummary | null>(() =>
    getSavedSuiveTemplateMeta()
  );
  const [templateActive, setTemplateActive] = useState<boolean>(() => hasActiveTemplateBytes());
  const quickTemplateInputRef = useRef<HTMLInputElement | null>(null);

  const codecinSnapshots = useMemo(
    () =>
      externalCodecinSnapshots && externalCodecinSnapshots.length > 0
        ? externalCodecinSnapshots
        : loadCodecinSnapshots(),
    [externalCodecinSnapshots]
  );

  // Index identical cluster keys so even in 'all' view we know which clusters have identical strain S/I/R
  const identicalClusterKeys = useMemo(
    () => new Set(identicalClusters.map((ic) => buildClusterKey(ic))),
    [identicalClusters]
  );

  // Map open (non-closed) studies by clusterKey
  const openStudyByClusterKey = useMemo(() => {
    const map = new Map<string, OutbreakStudyRecord>();
    outbreakStudies.forEach((st) => {
      if (st.stage !== 'cerrado' && st.clusterKey) {
        map.set(st.clusterKey, st);
      }
    });
    return map;
  }, [outbreakStudies]);

  const q = norm(searchQuery);
  const matchesCluster = (b: OutbreakCluster) =>
    !q || b.members.some((m) => getRowMeta(m).outbreakSearchText.includes(q));

  const visibleClusters = (atbMode === 'identico' ? identicalClusters : clusters).filter(
    matchesCluster
  );
  const filteredRecent = filterRowsByQuery(recentCultures, searchQuery);
  const recentGroups = groupEventsByPatient(filteredRecent);
  const recentOrderedKeys = recentGroups.map((g) => g.patientKey);

  const handleOpenClusterStudy = (cluster: OutbreakCluster) => {
    const cKey = buildClusterKey(cluster);
    const existingOpen = openStudyByClusterKey.get(cKey);
    if (existingOpen) {
      setModalState({ open: true, study: existingOpen, cluster });
      return;
    }

    const generated = buildOutbreakStudyFromCluster({
      cluster,
      bulletin,
      sharedMarks,
      cultures,
      codecinSnapshots,
      existingStudies: outbreakStudies,
      authorName,
    });
    setModalState({ open: true, study: generated, cluster });
  };

  const handleQuickTemplateUpload = async (file: File | null) => {
    if (!file) return;
    try {
      const summary = await inspectAndSaveSuiveTemplate(file);
      setTemplateMeta(summary);
      setTemplateActive(hasActiveTemplateBytes());
      onNotify(
        `Plantilla "${summary.fileName}" cargada (${
          Object.keys(summary.detectedFieldAnchors).length
        } campos SUIVE-3 reconocidos)`
      );
    } catch {
      onNotify('No se pudo leer el archivo Excel (.xlsx).');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Vigilancia de posibles brotes y estudios SUIVE-3 / NOTINMED
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            {atbMode === 'identico'
              ? 'Coincidencia de 2 o más pacientes con cepa de antibiograma idéntico y servicio común (actual o antecedente previo). Genera en un clic el estudio SUIVE-3 prellenado.'
              : 'Agrupaciones de dos o más pacientes hospitalizados con el mismo microorganismo y coincidencia de servicio. Filtra por antibiograma idéntico para iniciar estudios de brote.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start shrink-0">
          <input
            ref={quickTemplateInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              void handleQuickTemplateUpload(f);
              e.target.value = '';
            }}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => quickTemplateInputRef.current?.click()}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            {templateActive && templateMeta ? (
              <>
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span className="max-w-[200px] truncate">
                  Plantilla: {templateMeta.fileName}
                </span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                <span>Cargar plantilla SUIVE-3 (.xlsx)</span>
              </>
            )}
          </button>

          {/* Interactive Filter Segmented Control */}
          <div
            role="group"
            aria-label="Filtro de coincidencia de antibiograma"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-800 shrink-0"
          >
            <button
              type="button"
              onClick={() => onChangeAtbMode('all')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                atbMode === 'all'
                  ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Todos los clusters ({clusters.length})
            </button>
            <button
              type="button"
              onClick={() => onChangeAtbMode('identico')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                atbMode === 'identico'
                  ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Antibiograma idéntico ({identicalClusters.length})
            </button>
          </div>
        </div>
      </div>

      {/* Outbreak Clusters Grid */}
      {visibleClusters.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          {visibleClusters.map((cluster, idx) => {
            const clusterOrderedKeys = [
              ...new Set(cluster.members.map((m) => getPatientKey(m))),
            ];
            const cKey = buildClusterKey(cluster);
            const isIdenticalStrain =
              Boolean(cluster.identicalAtb) || identicalClusterKeys.has(cKey);
            const linkedOpenStudy = openStudyByClusterKey.get(cKey);
            const knownStudyIds = linkedOpenStudy
              ? new Set(linkedOpenStudy.casos.map((c) => c.patientId))
              : null;
            const unaddedClusterMembers = knownStudyIds
              ? cluster.members.filter((m) => !knownStudyIds.has(m.id)).length
              : 0;

            return (
              <section
                key={`${cluster.org}-${idx}`}
                className={`bg-white dark:bg-[#111726] border rounded-xl overflow-hidden ${
                  cluster.ab || isIdenticalStrain
                    ? 'border-red-300 dark:border-red-900/80'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div
                  className={`px-4 sm:px-5 py-3.5 border-b ${
                    cluster.ab || isIdenticalStrain
                      ? 'bg-red-50/60 dark:bg-red-950/25 border-red-200/80 dark:border-red-900/60'
                      : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-lg font-bold italic text-slate-900 dark:text-slate-100">
                          {prettyOrganism(cluster.org)}
                        </h3>
                        {cluster.ab && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Prioritario</span>
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-400 mt-0.5">
                        <span className="font-mono font-semibold tabular-nums">
                          {cluster.members.length}
                        </span>{' '}
                        pacientes · servicio común{' '}
                        <strong className="font-semibold text-slate-800 dark:text-slate-200">
                          {cluster.shared.join(', ')}
                        </strong>
                        {isIdenticalStrain && ' · cepa S/I/R idéntica'}
                      </p>
                      {linkedOpenStudy && (
                        <p className="text-xs text-teal-800 dark:text-teal-300 mt-1">
                          Expediente activo: {STAGE_LABELS[linkedOpenStudy.stage]}
                          {linkedOpenStudy.folioNotinmedBase
                            ? ` · Folio ${linkedOpenStudy.folioNotinmedBase}-${
                                linkedOpenStudy.folioSufijoActual || '0'
                              }`
                            : ''}
                          {unaddedClusterMembers > 0 && (
                            <span className="text-red-700 dark:text-red-400 font-semibold">
                              {' '}
                              · +{unaddedClusterMembers} caso(s) nuevo(s) por actualizar
                            </span>
                          )}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenClusterStudy(cluster)}
                      className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 self-start ${
                        isIdenticalStrain
                          ? 'bg-teal-700 hover:bg-teal-800 text-white'
                          : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>
                        {linkedOpenStudy ? 'Abrir estudio SUIVE-3' : 'Generar estudio SUIVE-3'}
                      </span>
                    </button>
                  </div>
                </div>

                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cluster.members.map((member) => {
                    const pKey = getPatientKey(member);
                    return (
                      <li key={member.id}>
                        <button
                          type="button"
                          onClick={() => onOpenInspector(pKey, clusterOrderedKeys)}
                          className="w-full min-h-[54px] px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-xs font-semibold tabular-nums px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 shrink-0">
                              {member.cama || 's/c'}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {member.nombre || '—'}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {member.prev ? `${member.prev} → ` : ''}
                                {member.svc || '—'}
                                {member.muestra ? ` · ${member.muestra}` : ''}
                                {member.fres ? ` · ${fmtShort(member.fres)}` : ''}
                              </div>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0">
                            <span>Ficha</span>
                            <PanelRightOpen className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center flex flex-col items-center gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {q ? 'Sin coincidencias con la búsqueda' : 'Sin clusters activos detectados'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              {q
                ? 'Ningún posible brote coincide con el término ingresado.'
                : `No existen dos o más pacientes compartiendo microorganismo y servicio${
                    selectedService ? ` en ${selectedService}` : ''
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
              <span>Restablecer filtros</span>
            </button>
          )}
        </div>
      )}

      {/* Outbreak Studies Lifecycle Ledger (Inicial -0 / Seguimiento / Cierre -1) */}
      <section className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Expedientes de Brote SUIVE-3 / NOTINMED ({outbreakStudies.length})
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Registro histórico y seguimiento activo (notificación inicial -0, notas informativas
              semanales y cierre -1 con carpeta CODECIAAS).
            </p>
          </div>
        </div>

        {outbreakStudies.length > 0 ? (
          <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-2.5 px-4 text-left font-semibold">Folio NOTINMED</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Microorganismo y Servicio</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Inicio (1ª FIS)</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Casos / Def.</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Estatus Ciclo</th>
                  <th className="py-2.5 px-3 text-left font-semibold">CODECIAAS</th>
                  <th className="py-2.5 px-4 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {outbreakStudies.map((st) => {
                  const inc = st.casos.filter((c) => c.incluidoEnEstudio);
                  const defs = inc.filter((c) => c.desenlace === 'defuncion_por_iaas').length;
                  const chk = st.checklistCodeciaas;
                  const doneDocs = [
                    chk.minutaCodeciaas,
                    chk.minutaRecorridoCampo,
                    chk.reportesSusceptibilidadLab,
                    chk.listasCapacitacionEppHigiene,
                    chk.evidenciaPaquetesPreventivos,
                  ].filter(Boolean).length;
                  const daysElapsed = computeDaysSinceLastCase(st, corte || undefined);
                  const matchingActiveCluster =
                    identicalClusters.find((c) => buildClusterKey(c) === st.clusterKey) ||
                    clusters.find((c) => buildClusterKey(c) === st.clusterKey) ||
                    null;

                  return (
                    <tr
                      key={st.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {st.folioNotinmedBase
                          ? `${st.folioNotinmedBase}-${st.folioSufijoActual || '0'}`
                          : 'Borrador s/folio'}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold italic text-slate-900 dark:text-slate-100">
                          {prettyOrganism(st.organismo)}
                        </div>
                        <div className="text-slate-500 dark:text-slate-400">
                          {st.servicioMedico} ·{' '}
                          {Array.from(new Set(inc.map((c) => c.iaasType))).join(', ') || 'IAAS'}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <div>{fmtFull(st.fechaInicioBrote) || '—'}</div>
                        {st.stage === 'cerrado' && st.fechaCierre ? (
                          <div className="text-[11px] text-slate-500">
                            Cierre: {fmtFull(st.fechaCierre)}
                          </div>
                        ) : daysElapsed != null ? (
                          <div className="text-[11px] text-teal-700 dark:text-teal-400">
                            {daysElapsed}d desde última FIS
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {inc.length} / {defs}
                      </td>
                      <td className="py-3 px-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {STAGE_LABELS[st.stage]}
                      </td>
                      <td className="py-3 px-3 font-mono tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {doneDocs}/5 anexos
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setModalState({
                                open: true,
                                study: st,
                                cluster: matchingActiveCluster,
                              })
                            }
                            className="min-h-[30px] px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Abrir
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const res = exportOutbreakStudyToExcel(st);
                              onNotify(`Descargado: ${res.fileName}`);
                            }}
                            aria-label="Descargar Excel SUIVE-3"
                            className="min-h-[30px] px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>.xlsx</span>
                          </button>
                          {canWrite && (
                            <button
                              type="button"
                              onClick={() => void onDeleteOutbreakStudy(st.id)}
                              aria-label="Eliminar expediente"
                              className="min-h-[30px] min-w-[30px] rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-400 hover:text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Aún no hay estudios de brote guardados. Selecciona “Generar estudio SUIVE-3” en
            cualquier cluster con cepa idéntica.
          </p>
        )}
      </section>

      {/* Recent 48h Cultures */}
      {atbMode === 'all' && (
        <section className="pt-4 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Cultivos recibidos en las últimas 48 horas
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Resultados recientes de microbiología para detección oportuna de transmisión cruzada.
            </p>
          </div>

          {recentGroups.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              {recentGroups.map((g) => (
                <PatientCard
                  key={g.patientKey}
                  group={g}
                  corte={corte}
                  outbreakIds={outbreakIds}
                  doneMap={doneMap}
                  markingIds={markingIds}
                  sharedMarks={sharedMarks}
                  notesIndex={notesIndex}
                  culturesIndex={culturesIndex}
                  options={{
                    hideReviewActions: true,
                    showProgram: !isIAAS(g.primary, outbreakIds),
                  }}
                  onMark={onMark}
                  onUnmark={onUnmark}
                  onSaveCriteria={onSaveCriteria}
                  onSubmitNursingNote={onSubmitNursingNote}
                  onUploadCulture={onUploadCulture}
                  onOpenSmartCulture={onOpenSmartCulture}
                  onOpenInspector={(pk) => onOpenInspector(pk, recentOrderedKeys)}
                  onOpenCulture={onOpenCulture}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No hay reportes microbiológicos nuevos en los últimos 2 días
              {selectedService ? ` en ${selectedService}` : ''}.
            </p>
          )}
        </section>
      )}

      <OutbreakStudyModal
        open={modalState.open}
        initialStudy={modalState.study}
        activeCluster={modalState.cluster}
        bulletin={bulletin}
        sharedMarks={sharedMarks}
        cultures={cultures}
        codecinSnapshots={codecinSnapshots}
        existingStudies={outbreakStudies}
        canWrite={canWrite}
        darkMode={darkMode}
        authorName={authorName}
        onClose={() => {
          setModalState({ open: false, study: null, cluster: null });
          setTemplateMeta(getSavedSuiveTemplateMeta());
          setTemplateActive(hasActiveTemplateBytes());
        }}
        onSave={async (updated) => {
          await onSaveOutbreakStudy(updated);
          setModalState((prev) => ({ ...prev, study: updated }));
        }}
        onNotify={onNotify}
      />
    </div>
  );
}
