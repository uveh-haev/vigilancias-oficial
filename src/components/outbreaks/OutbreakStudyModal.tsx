import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BulletinPayload,
  CodecinSnapshot,
  CultureAttachment,
  IaasPatientOutcome,
  IaasType2024,
  InvasiveDeviceCode,
  OutbreakCaseMember,
  OutbreakCluster,
  OutbreakControlAction,
  OutbreakFollowUpLog,
  OutbreakLifecycleStage,
  OutbreakStudyRecord,
  RadarEvent,
  SharedMark,
  SuiveAgeGroupKey,
  SuiveTemplateMappingSummary,
} from '../../types/clinical';
import { fmtFull, todayISO } from '../../domain/dates';
import {
  ALL_NORMALIZED_SPECIMENS,
  CARE_BUNDLE_TEMPLATES,
  COMMON_CLINICAL_SIGNS,
  IAAS_GROUP_LABELS,
  IAAS_TYPES_2024,
  INVASIVE_DEVICE_LABELS,
  OUTCOME_LABELS,
  STAGE_LABELS,
  SUIVE_AGE_GROUPS,
  composeOutbreakDiagnoses,
  computeDaysSinceLastCase,
  computeEpidemicCurveByFis,
  computeSpatialCroquis,
  computeSuivePersonDistribution,
  computeSymptomFrequency,
  findDischargedClusterCandidates,
  generateCodecinPanoramaNarrative,
  getIaasCatalogEntry,
  isAmbiguousOrInvalidSpecimen,
  parsePatientAge,
  radarRowToOutbreakCase,
  toPatientInitials,
  validateOutbreakStudy,
} from '../../domain/iaasTaxonomy2024';
import { prettyOrganism } from '../../domain/outbreaks';
import { indexByPatient } from '../../domain/services';
import {
  SUIVE_TEMPLATE_FIELDS,
  clearSavedSuiveTemplate,
  exportOutbreakStudyToExcel,
  getSavedSuiveTemplateMeta,
  hasActiveTemplateBytes,
  inspectAndSaveSuiveTemplate,
  updateSuiveTemplateOverrides,
} from '../../domain/suive3ExcelEngine';

type ModalTabId = 'caratula' | 'curva' | 'analisis' | 'seguimiento';

interface OutbreakStudyModalProps {
  open: boolean;
  initialStudy: OutbreakStudyRecord | null;
  activeCluster: OutbreakCluster | null;
  bulletin: BulletinPayload;
  sharedMarks: Record<string, SharedMark> | null;
  cultures: CultureAttachment[];
  codecinSnapshots: CodecinSnapshot[];
  existingStudies: OutbreakStudyRecord[];
  canWrite: boolean;
  darkMode: boolean;
  authorName: string;
  onClose: () => void;
  onSave: (study: OutbreakStudyRecord) => Promise<void>;
  onNotify: (msg: string) => void;
}

export function OutbreakStudyModal({
  open,
  initialStudy,
  activeCluster,
  bulletin,
  sharedMarks,
  cultures,
  codecinSnapshots,
  existingStudies,
  canWrite,
  darkMode,
  authorName,
  onClose,
  onSave,
  onNotify,
}: OutbreakStudyModalProps) {
  const [draft, setDraft] = useState<OutbreakStudyRecord | null>(initialStudy);
  const [activeTab, setActiveTab] = useState<ModalTabId>('caratula');
  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [exportUseInitials, setExportUseInitials] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState<boolean>(false);

  // Template management state
  const [templateMeta, setTemplateMeta] = useState<SuiveTemplateMappingSummary | null>(() =>
    getSavedSuiveTemplateMeta()
  );
  const [templateReady, setTemplateReady] = useState<boolean>(() => hasActiveTemplateBytes());
  const [uploadingTemplate, setUploadingTemplate] = useState<boolean>(false);
  const [showMappingEditor, setShowMappingEditor] = useState<boolean>(false);
  const templateInputRef = useRef<HTMLInputElement | null>(null);

  // Follow-up log form
  const [newLogType, setNewLogType] = useState<OutbreakFollowUpLog['tipo']>('nota_semanal');
  const [newLogSummary, setNewLogSummary] = useState<string>('');

  useEffect(() => {
    if (open && initialStudy) {
      setDraft(JSON.parse(JSON.stringify(initialStudy)) as OutbreakStudyRecord);
      setExpandedCaseId(initialStudy.casos[0]?.patientId || null);
      setActiveTab('caratula');
      setTemplateMeta(getSavedSuiveTemplateMeta());
      setTemplateReady(hasActiveTemplateBytes());
    }
  }, [open, initialStudy]);

  const culturesIndex = useMemo(() => indexByPatient(cultures || []), [cultures]);

  const findings = useMemo(
    () => (draft ? validateOutbreakStudy(draft, activeCluster) : []),
    [draft, activeCluster]
  );
  const criticalErrors = useMemo(
    () => findings.filter((f) => f.severity === 'error'),
    [findings]
  );
  const warnings = useMemo(
    () => findings.filter((f) => f.severity === 'warning'),
    [findings]
  );

  const personDist = useMemo(
    () => (draft ? computeSuivePersonDistribution(draft) : []),
    [draft]
  );
  const symptomFreq = useMemo(
    () => (draft ? computeSymptomFrequency(draft) : []),
    [draft]
  );
  const epiCurve = useMemo(
    () => (draft ? computeEpidemicCurveByFis(draft) : []),
    [draft]
  );
  const croquisNodes = useMemo(
    () => (draft ? computeSpatialCroquis(draft) : []),
    [draft]
  );
  const daysSinceLastFis = useMemo(
    () => (draft ? computeDaysSinceLastCase(draft, bulletin.corte || undefined) : null),
    [draft, bulletin.corte]
  );

  // Discharged / deceased candidates from cerrados + new active cluster members not yet in study
  const candidateRowsToInclude = useMemo(() => {
    if (!draft) return { newActive: [] as RadarEvent[], discharged: [] as RadarEvent[] };
    const existingIds = new Set(draft.casos.map((c) => c.patientId));
    const newActive = (activeCluster?.members || []).filter((m) => !existingIds.has(m.id));
    const syntheticCluster: OutbreakCluster = activeCluster || {
      org: draft.organismo,
      shared: draft.serviciosInvolucrados,
      members: [],
      ab: draft.organismo.startsWith('acinetobacter'),
    };
    const discharged = findDischargedClusterCandidates(
      syntheticCluster,
      bulletin.cerrados || [],
      bulletin.abRows || [],
      existingIds
    );
    return { newActive, discharged };
  }, [draft, activeCluster, bulletin.cerrados, bulletin.abRows]);

  if (!open || !draft) return null;

  const updateDraft = (patch: Partial<OutbreakStudyRecord>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            ...patch,
            actualizadoEn: new Date().toISOString(),
            actualizadoPor: authorName || prev.actualizadoPor,
          }
        : prev
    );
  };

  const updateCase = (patientId: string, patch: Partial<OutbreakCaseMember>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const nextCasos = prev.casos.map((c) => {
        if (c.patientId !== patientId) return c;
        const merged = { ...c, ...patch };
        if (patch.nombre !== undefined) {
          merged.iniciales = toPatientInitials(patch.nombre);
        }
        if (patch.edadTexto !== undefined) {
          const parsedAge = parsePatientAge(patch.edadTexto);
          merged.edadAnios = parsedAge.years;
          merged.grupoEdad = parsedAge.group;
        }
        if (patch.iaasType !== undefined) {
          const entry = getIaasCatalogEntry(patch.iaasType);
          merged.iaasGroup = entry.group;
        }
        return merged;
      });

      // Automatically keep outbreak start date aligned with earliest valid FIS
      const validFis = nextCasos
        .filter((c) => c.incluidoEnEstudio && /^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicioSintomas))
        .map((c) => c.fechaInicioSintomas)
        .sort();

      return {
        ...prev,
        casos: nextCasos,
        fechaInicioBrote: validFis[0] || prev.fechaInicioBrote,
        actualizadoEn: new Date().toISOString(),
      };
    });
  };

  const handleSyncDiagnoses = () => {
    const { dxProbable, dxFinal } = composeOutbreakDiagnoses(
      draft.organismo,
      draft.fenotipoResistencia,
      draft.casos
    );
    updateDraft({ dxProbable, dxFinal });
    onNotify('DX Probable y DX Final sincronizados con los tipos de IAAS del censo');
  };

  const handleRegeneratePanorama = () => {
    const text = generateCodecinPanoramaNarrative({
      organismo: draft.organismo,
      servicioPrincipal: draft.servicioMedico,
      snapshots: codecinSnapshots,
      bulletin,
      existingStudies,
      currentStudyId: draft.id,
    });
    updateDraft({ antecedentesPanorama: text });
    onNotify('Panorama epidemiológico actualizado desde histórico CODECIN y corte activo');
  };

  const handleIncorporateRow = (row: RadarEvent) => {
    const newCase = radarRowToOutbreakCase(row, {
      servicioBrote: draft.servicioMedico,
      sharedMarks,
      culturesIndex,
    });
    const nextCasos = [...draft.casos, newCase];
    const { dxProbable, dxFinal } = composeOutbreakDiagnoses(
      draft.organismo,
      draft.fenotipoResistencia,
      nextCasos
    );
    updateDraft({ casos: nextCasos, dxProbable, dxFinal });
    setExpandedCaseId(newCase.patientId);
    onNotify(`Paciente ${newCase.iniciales} incorporado al censo nominal`);
  };

  const handleAddBlankManualCase = () => {
    const manualId = `manual-${Date.now().toString(36)}`;
    const blank: OutbreakCaseMember = {
      patientId: manualId,
      expediente: '',
      nombre: 'NUEVO PACIENTE',
      iniciales: 'N.P.',
      edadAnios: 50,
      edadTexto: '50',
      grupoEdad: '50-59',
      sexo: 'M',
      cama: '',
      fechaIngresoHospital: todayISO(),
      servicioPrevio: '',
      servicioBrote: draft.servicioMedico,
      fechaIngresoServicio: todayISO(),
      iaasGroup: 'NAAS',
      iaasType: 'NAV',
      nivelDiagnostico: 'confirmada_lab',
      folioRhove: '',
      asociadoBroteSeveiaas: false,
      fechaInicioSintomas: todayISO(),
      fechaInicioSeveiaas: todayISO(),
      signosSintomas: ['Fiebre (≥38 °C)'],
      cuadroClinicoDetalle: '',
      dispositivoPrincipal: 'VM',
      fechaInstalacionDisp: '',
      fechaRetiroDisp: '',
      procedimientosAsociados: '',
      fechaProcedimiento: '',
      tipoMuestra: 'Aspirado bronquial',
      fechaTomaMuestra: todayISO(),
      fechaResultadoLab: todayISO(),
      microorganismo: prettyOrganism(draft.organismo),
      mecanismoResistencia: draft.fenotipoResistencia,
      perfilResistencia: '',
      tratamientoAntimicrobiano: '',
      fechaInicioTratamiento: '',
      desenlace: 'hospitalizado',
      fechaEgresoDefuncion: '',
      folioCertificadoDefuncion: '',
      evidenciaCultivoArchivo: '',
      incluidoEnEstudio: true,
    };
    updateDraft({ casos: [...draft.casos, blank] });
    setExpandedCaseId(manualId);
  };

  const handleAddControlAction = (
    preset?: (typeof CARE_BUNDLE_TEMPLATES)[number]
  ) => {
    const action: OutbreakControlAction = {
      id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fecha: todayISO(),
      categoria: preset?.categoria || 'otra',
      descripcion: preset?.descripcion || '',
      responsable: 'UVEH / Jefatura de Servicio',
    };
    updateDraft({ accionesControl: [...draft.accionesControl, action] });
  };

  const handleAppendFollowUpLog = () => {
    if (!newLogSummary.trim()) {
      onNotify('Escribe un breve resumen técnico para la bitácora NOTINMED');
      return;
    }
    const suffix =
      newLogType === 'cierre_1'
        ? '1'
        : newLogType === 'inicial_0'
          ? '0'
          : draft.folioSufijoActual || '0';
    const folio = draft.folioNotinmedBase
      ? `${draft.folioNotinmedBase}-${suffix}`
      : `PENDIENTE-${suffix}`;

    const entry: OutbreakFollowUpLog = {
      id: `log-${Date.now()}`,
      fecha: todayISO(),
      tipo: newLogType,
      folioNotinmed: folio,
      resumen: newLogSummary.trim(),
      autor: authorName || 'UVEH',
    };

    const nextStage: OutbreakLifecycleStage =
      newLogType === 'cierre_1'
        ? 'cerrado'
        : newLogType === 'inicial_0'
          ? 'notificado_inicial'
          : 'en_seguimiento';

    updateDraft({
      stage: nextStage,
      folioSufijoActual: suffix,
      fechaCierre: newLogType === 'cierre_1' ? draft.fechaCierre || todayISO() : draft.fechaCierre,
      bitacoraSeguimiento: [entry, ...(draft.bitacoraSeguimiento || [])],
    });
    setNewLogSummary('');
    onNotify('Movimiento registrado en bitácora NOTINMED');
  };

  const handleTemplateUpload = async (file: File | null) => {
    if (!file) return;
    setUploadingTemplate(true);
    try {
      const summary = await inspectAndSaveSuiveTemplate(file);
      setTemplateMeta(summary);
      setTemplateReady(hasActiveTemplateBytes());
      onNotify(
        `Plantilla "${summary.fileName}" vinculada (${
          Object.keys(summary.detectedFieldAnchors).length
        } campos SUIVE-3 detectados)`
      );
    } catch {
      onNotify('No se pudo leer el archivo Excel (.xlsx). Verifica que no esté protegido.');
    } finally {
      setUploadingTemplate(false);
    }
  };

  const handleOverrideChange = (fieldKey: string, value: string) => {
    if (!templateMeta) return;
    const nextOverrides = { ...(templateMeta.customOverrides || {}) };
    if (!value.trim()) {
      delete nextOverrides[fieldKey];
    } else {
      nextOverrides[fieldKey] = value.trim();
    }
    const updated = updateSuiveTemplateOverrides(nextOverrides);
    if (updated) setTemplateMeta(updated);
  };

  const handleSaveStudy = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = (forceBuiltIn = false) => {
    try {
      const res = exportOutbreakStudyToExcel(draft, {
        useInitials: exportUseInitials,
        forceBuiltInFormat: forceBuiltIn,
      });
      onNotify(
        res.usedUploadedTemplate
          ? `Descargado sobre tu plantilla oficial: ${res.fileName}`
          : `Descargado formato SUIVE-3-2020 completo: ${res.fileName}`
      );
    } catch {
      onNotify('Error al generar el archivo Excel (.xlsx)');
    }
  };

  const includedCases = draft.casos.filter((c) => c.incluidoEnEstudio);
  const totalDistRow = personDist[personDist.length - 1];
  const gridStroke = darkMode ? '#1E293B' : '#E2E8F0';
  const axisTickColor = darkMode ? '#94A3B8' : '#475569';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Estudio Epidemiológico de Brote de IAAS SUIVE-3"
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
    >
      <div className="w-full max-w-[1360px] max-h-[94vh] bg-white dark:bg-[#0F1523] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70 dark:bg-[#111726]">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
              <span>SUIVE-3-2020 · Manual IAAS RHOVE Junio 2024</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {STAGE_LABELS[draft.stage]}
              </span>
              {draft.folioNotinmedBase && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-teal-700 dark:text-teal-300 font-semibold">
                    Folio {draft.folioNotinmedBase}-{draft.folioSufijoActual || '0'}
                  </span>
                </>
              )}
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
              Estudio de Brote: <span className="italic">{prettyOrganism(draft.organismo)}</span> en{' '}
              {draft.servicioMedico}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setAuditDrawerOpen((v) => !v)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                criticalErrors.length > 0
                  ? 'border-red-300 dark:border-red-900/80 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-300'
                  : warnings.length > 0
                    ? 'border-amber-300 dark:border-amber-900/80 bg-amber-50/80 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                    : 'border-emerald-300 dark:border-emerald-900/80 bg-emerald-50/80 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'
              }`}
            >
              {criticalErrors.length > 0 ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span className="tabular-nums">
                {criticalErrors.length > 0
                  ? `${criticalErrors.length} observación(es) crítica(s)`
                  : warnings.length > 0
                    ? `0 críticas · ${warnings.length} aviso(s)`
                    : '0 observaciones estatales'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleExportExcel(false)}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>
                {templateReady ? 'Descargar en tu plantilla (.xlsx)' : 'Descargar SUIVE-3 (.xlsx)'}
              </span>
            </button>

            {canWrite && (
              <button
                type="button"
                disabled={saving}
                onClick={handleSaveStudy}
                className="min-h-[38px] px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Guardando...' : 'Guardar expediente'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar estudio de brote"
              className="min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible Anti-Observation Audit Panel */}
        {auditDrawerOpen && findings.length > 0 && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Verificador preventivo contra observaciones estatales (NOTINMED / SEVEIAAS / Manual
                RHOVE 2024)
              </p>
              <button
                type="button"
                onClick={() => setAuditDrawerOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Ocultar
              </button>
            </div>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {findings.map((f) => (
                <li
                  key={f.id}
                  className="p-2.5 rounded-lg bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2"
                >
                  <div className="text-xs leading-relaxed">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {f.severity === 'error' ? 'Crítico: ' : 'Revisión: '}
                      {f.patientLabel ? `${f.patientLabel} · ` : ''}
                      {f.title}
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">{f.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab(f.section === 'censo' ? 'caratula' : f.section);
                      setAuditDrawerOpen(false);
                    }}
                    className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline whitespace-nowrap shrink-0"
                  >
                    Ir
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Section Segmented Navigation */}
        <div className="px-4 sm:px-6 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 overflow-x-auto bg-white dark:bg-[#0F1523]">
          <div
            role="tablist"
            className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-800 shrink-0"
          >
            {(
              [
                ['caratula', `01. Carátula y Censo Nominal (${includedCases.length})`],
                ['curva', '02. Persona, Curva FIS y Croquis'],
                ['analisis', '03. Análisis (Ap. VI) y Control (Ap. VII)'],
                ['seguimiento', '04. Seguimiento, CODECIAAS y Plantilla .xlsx'],
              ] as Array<[ModalTabId, string]>
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                role="tab"
                aria-selected={activeTab === tabKey}
                onClick={() => setActiveTab(tabKey)}
                className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === tabKey
                    ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={exportUseInitials}
              onChange={(e) => setExportUseInitials(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Exportar con iniciales (confidencialidad externa)</span>
          </label>
        </div>

        {/* Scrollable Workspace Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-6">
          {/* TAB 1: CARÁTULA SUIVE-3 & CENSO NOMINAL */}
          {activeTab === 'caratula' && (
            <div className="flex flex-col gap-6">
              {/* Apartados I y II */}
              <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Apartados I y II. Identificación de la Unidad y Antecedentes del Brote
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      El DX Probable y DX Final deben listar explícitamente todos los tipos de IAAS
                      validados en el censo nominal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSyncDiagnoses}
                    className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Sincronizar DX con censo</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Unidad notificante
                    </span>
                    <input
                      type="text"
                      value={draft.unidadNotificante}
                      onChange={(e) => updateDraft({ unidadNotificante: e.target.value })}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Clave CLUES / SUAVE
                    </span>
                    <input
                      type="text"
                      value={draft.claveClues}
                      onChange={(e) => updateDraft({ claveClues: e.target.value })}
                      placeholder="VZIMB002495"
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Jurisdicción sanitaria
                    </span>
                    <input
                      type="text"
                      value={draft.jurisdiccion}
                      onChange={(e) => updateDraft({ jurisdiccion: e.target.value })}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Servicio médico afectado
                    </span>
                    <input
                      type="text"
                      value={draft.servicioMedico}
                      onChange={(e) => updateDraft({ servicioMedico: e.target.value })}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs font-semibold"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Folio base NOTINMED
                    </span>
                    <input
                      type="text"
                      value={draft.folioNotinmedBase}
                      onChange={(e) =>
                        updateDraft({ folioNotinmedBase: e.target.value.toUpperCase() })
                      }
                      placeholder="Ej. NM00392057"
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Fecha inicio brote (1ª FIS)
                    </span>
                    <input
                      type="date"
                      value={draft.fechaInicioBrote}
                      onChange={(e) => updateDraft({ fechaInicioBrote: e.target.value })}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Fecha detección UVEH
                    </span>
                    <input
                      type="date"
                      value={draft.fechaDeteccion}
                      onChange={(e) => updateDraft({ fechaDeteccion: e.target.value })}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Fecha notificación (&le;24 h)
                    </span>
                    <input
                      type="date"
                      value={draft.fechaNotificacion}
                      onChange={(e) => updateDraft({ fechaNotificacion: e.target.value })}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono text-xs"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      DX. Probable (incluir tipos específicos de IAAS)
                    </span>
                    <input
                      type="text"
                      value={draft.dxProbable}
                      onChange={(e) => updateDraft({ dxProbable: e.target.value })}
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      DX. Final (congruente con casos confirmados del censo)
                    </span>
                    <input
                      type="text"
                      value={draft.dxFinal}
                      onChange={(e) => updateDraft({ dxFinal: e.target.value })}
                      placeholder="Se actualiza conforme se confirman aislamientos"
                      className="min-h-[38px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs"
                    />
                  </label>
                </div>
              </section>

              {/* Candidate Discharged / New Cluster Patients Alert */}
              {(candidateRowsToInclude.newActive.length > 0 ||
                candidateRowsToInclude.discharged.length > 0) && (
                <section className="border border-amber-300 dark:border-amber-900/70 rounded-xl p-4 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col gap-3">
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Pacientes adicionales detectados en el radar / egresos del periodo (evita
                      subregistro de ataque y letalidad)
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Incluye casos nuevos con la misma cepa o pacientes egresados/finados del
                      servicio para mantener íntegro el denominador de letalidad.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ...candidateRowsToInclude.newActive.map((r) => ({ r, tag: 'Activo en cluster' })),
                      ...candidateRowsToInclude.discharged.map((r) => ({ r, tag: 'Egreso / Defunción' })),
                    ].map(({ r, tag }) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handleIncorporateRow(r)}
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-[#111726] hover:bg-amber-50 dark:hover:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 inline-flex items-center gap-2"
                      >
                        <UserPlus className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                        <span className="font-semibold">{r.nombre}</span>
                        <span className="text-slate-500">
                          · {r.cama || 's/c'} · {tag}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Nominal Census List & Per-Patient Validated Editor */}
              <section className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#111726]">
                <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Censo Nominal del Brote (Clasificación RHOVE Junio 2024 y Candados
                      Anti-Observaciones)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Haz clic en cada paciente para validar Fecha de Inicio de Síntomas (FIS),
                      ventanas de dispositivos invasivos, muestra específica y tratamiento.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddBlankManualCase}
                    className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar caso manual</span>
                  </button>
                </div>

                <ul className="divide-y divide-slate-200 dark:divide-slate-800">
                  {draft.casos.map((c, idx) => {
                    const isExpanded = expandedCaseId === c.patientId;
                    const specimenError = isAmbiguousOrInvalidSpecimen(c.tipoMuestra, c.iaasType);
                    const hasFis = /^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicioSintomas);
                    const entry2024 = getIaasCatalogEntry(c.iaasType);

                    return (
                      <li key={c.patientId} className="bg-white dark:bg-[#111726]">
                        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={c.incluidoEnEstudio}
                              onChange={(e) =>
                                updateCase(c.patientId, { incluidoEnEstudio: e.target.checked })
                              }
                              aria-label={`Incluir a ${c.nombre} en el estudio`}
                              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                            />
                            <span className="font-mono text-xs font-bold tabular-nums text-slate-500">
                              #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCaseId(isExpanded ? null : c.patientId)
                              }
                              className="text-left min-w-0"
                            >
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {c.nombre}{' '}
                                <span className="font-mono text-xs font-normal text-slate-500">
                                  ({c.iniciales} · Exp. {c.expediente || 's/e'} · Cama{' '}
                                  {c.cama || 's/c'})
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-1.5 mt-0.5">
                                <span className="font-semibold text-teal-700 dark:text-teal-300">
                                  {c.iaasType}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    hasFis
                                      ? 'font-mono tabular-nums'
                                      : 'text-red-600 dark:text-red-400 font-semibold'
                                  }
                                >
                                  {hasFis
                                    ? `FIS: ${fmtFull(c.fechaInicioSintomas)}`
                                    : 'FIS pendiente'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    specimenError
                                      ? 'text-red-600 dark:text-red-400 font-semibold'
                                      : ''
                                  }
                                >
                                  {c.tipoMuestra || 'Sin muestra'}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{OUTCOME_LABELS[c.desenlace]}</span>
                              </div>
                            </button>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedCaseId(isExpanded ? null : c.patientId)
                              }
                              className="min-h-[32px] px-3 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
                            >
                              {isExpanded ? 'Contraer ficha' : 'Editar variables'}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 sm:px-5 pb-5 pt-3 bg-slate-50/60 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/80 flex flex-col gap-4">
                            {/* Row 1: Demographics & Hospital Traceability */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                              <label className="flex flex-col gap-1 text-xs lg:col-span-2">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Nombre completo
                                </span>
                                <input
                                  type="text"
                                  value={c.nombre}
                                  onChange={(e) =>
                                    updateCase(c.patientId, { nombre: e.target.value })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Expediente
                                </span>
                                <input
                                  type="text"
                                  value={c.expediente}
                                  onChange={(e) =>
                                    updateCase(c.patientId, { expediente: e.target.value })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Cama
                                </span>
                                <input
                                  type="text"
                                  value={c.cama}
                                  onChange={(e) =>
                                    updateCase(c.patientId, { cama: e.target.value })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Edad (ej. 58 o 12 días)
                                </span>
                                <input
                                  type="text"
                                  value={c.edadTexto}
                                  onChange={(e) =>
                                    updateCase(c.patientId, { edadTexto: e.target.value })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Sexo · Grupo SUIVE ({c.grupoEdad})
                                </span>
                                <select
                                  value={c.sexo}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      sexo: e.target.value as 'M' | 'F',
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                >
                                  <option value="M">Masculino (M)</option>
                                  <option value="F">Femenino (F)</option>
                                </select>
                              </label>
                            </div>

                            {/* Row 2: Transfers & Dates */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Fecha ingreso hospitalario
                                </span>
                                <input
                                  type="date"
                                  value={c.fechaIngresoHospital}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      fechaIngresoHospital: e.target.value,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Servicio previo (antecedente común)
                                </span>
                                <input
                                  type="text"
                                  value={c.servicioPrevio}
                                  onChange={(e) =>
                                    updateCase(c.patientId, { servicioPrevio: e.target.value })
                                  }
                                  placeholder="Ej. Urgencias / Quirófano"
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Servicio donde adquirió IAAS
                                </span>
                                <input
                                  type="text"
                                  value={c.servicioBrote}
                                  onChange={(e) =>
                                    updateCase(c.patientId, { servicioBrote: e.target.value })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Fecha ingreso al servicio
                                </span>
                                <input
                                  type="date"
                                  value={c.fechaIngresoServicio}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      fechaIngresoServicio: e.target.value,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                            </div>

                            {/* Row 3: RHOVE 2024 Classification & Strict FIS vs SEVEIAAS */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <label className="flex flex-col gap-1 text-xs lg:col-span-2">
                                <span className="font-semibold text-teal-800 dark:text-teal-300">
                                  Tipo específico de IAAS (Manual RHOVE Junio 2024)
                                </span>
                                <select
                                  value={c.iaasType}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      iaasType: e.target.value as IaasType2024,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                                >
                                  {(Object.keys(IAAS_GROUP_LABELS) as Array<
                                    keyof typeof IAAS_GROUP_LABELS
                                  >).map((grp) => (
                                    <optgroup key={grp} label={IAAS_GROUP_LABELS[grp]}>
                                      {IAAS_TYPES_2024.filter((t) => t.group === grp).map((t) => (
                                        <option key={t.code} value={t.code}>
                                          {t.label}
                                        </option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                              </label>

                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-semibold text-teal-800 dark:text-teal-300">
                                  Fecha Inicio Síntomas (FIS · Curva)
                                </span>
                                <input
                                  type="date"
                                  value={c.fechaInicioSintomas}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      fechaInicioSintomas: e.target.value,
                                      fechaInicioSeveiaas:
                                        c.fechaInicioSeveiaas === c.fechaInicioSintomas ||
                                        !c.fechaInicioSeveiaas
                                          ? e.target.value
                                          : c.fechaInicioSeveiaas,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-teal-500/60 dark:border-teal-500/50 bg-white dark:bg-slate-900 font-mono text-xs font-semibold"
                                />
                              </label>

                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  FIS capturada en SEVEIAAS (cotejo)
                                </span>
                                <input
                                  type="date"
                                  value={c.fechaInicioSeveiaas}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      fechaInicioSeveiaas: e.target.value,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                            </div>

                            {/* Row 4: Invasive Risk Factors & Procedures */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                              <label className="flex flex-col gap-1 text-xs lg:col-span-2">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Dispositivo invasivo principal
                                </span>
                                <select
                                  value={c.dispositivoPrincipal}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      dispositivoPrincipal: e.target.value as InvasiveDeviceCode,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                >
                                  {(
                                    Object.keys(INVASIVE_DEVICE_LABELS) as InvasiveDeviceCode[]
                                  ).map((dev) => (
                                    <option key={dev} value={dev}>
                                      {INVASIVE_DEVICE_LABELS[dev]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Fecha instalación disp.
                                </span>
                                <input
                                  type="date"
                                  value={c.fechaInstalacionDisp}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      fechaInstalacionDisp: e.target.value,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Fecha retiro disp. (si aplica)
                                </span>
                                <input
                                  type="date"
                                  value={c.fechaRetiroDisp}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      fechaRetiroDisp: e.target.value,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Otros proced. (traqueo, sonda, Qx)
                                </span>
                                <input
                                  type="text"
                                  value={c.procedimientosAsociados}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      procedimientosAsociados: e.target.value,
                                    })
                                  }
                                  placeholder="Ej. Traqueostomía 12/08, inhaloterapia"
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                              </label>
                            </div>

                            {/* Row 5: Normalized Specimen, Microbiology, Treatment & Outcome */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <label className="flex flex-col gap-1 text-xs lg:col-span-2">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Tipo de muestra específica (prohibido “Catéter” genérico)
                                </span>
                                <input
                                  type="text"
                                  list={`specimens-${c.patientId}`}
                                  value={c.tipoMuestra}
                                  onChange={(e) =>
                                    updateCase(c.patientId, { tipoMuestra: e.target.value })
                                  }
                                  className={`min-h-[36px] px-2.5 rounded-lg border bg-white dark:bg-slate-900 text-xs ${
                                    specimenError
                                      ? 'border-red-400 dark:border-red-700'
                                      : 'border-slate-200 dark:border-slate-700'
                                  }`}
                                />
                                <datalist id={`specimens-${c.patientId}`}>
                                  {entry2024.validSpecimens.map((sp) => (
                                    <option key={sp} value={sp} />
                                  ))}
                                  {ALL_NORMALIZED_SPECIMENS.filter(
                                    (sp) => !entry2024.validSpecimens.includes(sp)
                                  ).map((sp) => (
                                    <option key={sp} value={sp} />
                                  ))}
                                </datalist>
                                {specimenError && (
                                  <span className="text-[11px] text-red-600 dark:text-red-400">
                                    {specimenError}
                                  </span>
                                )}
                              </label>

                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Fecha toma de muestra
                                </span>
                                <input
                                  type="date"
                                  value={c.fechaTomaMuestra}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      fechaTomaMuestra: e.target.value,
                                    })
                                  }
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                />
                              </label>

                              <label className="flex flex-col gap-1 text-xs">
                                <span className="font-medium text-slate-600 dark:text-slate-400">
                                  Tratamiento antimicrobiano IAAS
                                </span>
                                <input
                                  type="text"
                                  value={c.tratamientoAntimicrobiano}
                                  onChange={(e) =>
                                    updateCase(c.patientId, {
                                      tratamientoAntimicrobiano: e.target.value,
                                    })
                                  }
                                  placeholder="Ej. Colistina + Tigeciclina IV"
                                  className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                />
                              </label>
                            </div>

                            {/* Row 6: Clinical Signs (Separate from FIS!) & Outcome / SEVEIAAS */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 pt-1">
                              <div className="lg:col-span-7 flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                                  Signos y síntomas (alimentan el cuadro de frecuencias del Apartado
                                  III, separados de la FIS)
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                  {COMMON_CLINICAL_SIGNS.map((sign) => {
                                    const active = c.signosSintomas.includes(sign);
                                    return (
                                      <button
                                        key={sign}
                                        type="button"
                                        onClick={() => {
                                          const nextSigns = active
                                            ? c.signosSintomas.filter((s) => s !== sign)
                                            : [...c.signosSintomas, sign];
                                          updateCase(c.patientId, { signosSintomas: nextSigns });
                                        }}
                                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                                          active
                                            ? 'bg-teal-700 border-teal-700 text-white'
                                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                                        }`}
                                      >
                                        {sign}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                                  <span className="font-medium text-slate-600 dark:text-slate-400">
                                    Desenlace (Clasificación de defunciones Manual 2024)
                                  </span>
                                  <select
                                    value={c.desenlace}
                                    onChange={(e) =>
                                      updateCase(c.patientId, {
                                        desenlace: e.target.value as IaasPatientOutcome,
                                      })
                                    }
                                    className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                                  >
                                    {(Object.keys(OUTCOME_LABELS) as IaasPatientOutcome[]).map(
                                      (out) => (
                                        <option key={out} value={out}>
                                          {OUTCOME_LABELS[out]}
                                        </option>
                                      )
                                    )}
                                  </select>
                                </label>

                                <label className="flex flex-col gap-1 text-xs">
                                  <span className="font-medium text-slate-600 dark:text-slate-400">
                                    Folio caso SEVEIAAS
                                  </span>
                                  <input
                                    type="text"
                                    value={c.folioRhove}
                                    onChange={(e) =>
                                      updateCase(c.patientId, { folioRhove: e.target.value })
                                    }
                                    placeholder="Folio plataforma IAAS"
                                    className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                                  />
                                </label>

                                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 self-end pb-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={c.asociadoBroteSeveiaas}
                                    onChange={(e) =>
                                      updateCase(c.patientId, {
                                        asociadoBroteSeveiaas: e.target.checked,
                                      })
                                    }
                                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                                  />
                                  <span className="font-medium">
                                    Marcado “Parte de brote = SÍ”
                                  </span>
                                </label>
                              </div>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {/* TAB 2: DISTRIBUCIÓN POR PERSONA, CURVA EPIDÉMICA POR FIS Y CROQUIS */}
          {activeTab === 'curva' && (
            <div className="flex flex-col gap-6">
              {/* Apartado IV: Epidemic Curve strictly by FIS */}
              <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Apartado IV. Curva Epidémica por Fecha de Inicio de Signos y Síntomas (FIS)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Construida exclusivamente con la FIS validada (nunca por fecha de toma de
                      cultivo). Separa casos vivos de defunciones asociadas a IAAS.
                    </p>
                  </div>
                  <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    Ataque global:{' '}
                    <strong>
                      {totalDistRow?.ataqueT != null ? `${totalDistRow.ataqueT}%` : '—'}
                    </strong>{' '}
                    · Letalidad por IAAS:{' '}
                    <strong>
                      {totalDistRow?.letalidadT != null ? `${totalDistRow.letalidadT}%` : '—'}
                    </strong>
                  </div>
                </div>

                {epiCurve.length > 0 ? (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={epiCurve}
                        margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                        <XAxis
                          dataKey="shortLabel"
                          tick={{ fontSize: 11, fill: axisTickColor }}
                          stroke={gridStroke}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 11, fill: axisTickColor }}
                          stroke={gridStroke}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: darkMode ? '#0F172A' : '#FFFFFF',
                            borderColor: gridStroke,
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(value: unknown, name: unknown) => [
                            String(value),
                            name === 'casosVivos'
                              ? 'Casos (vivos / seguimiento)'
                              : 'Defunciones POR IAAS',
                          ]}
                          labelFormatter={(label, payload) => {
                            const pt = payload?.[0]?.payload;
                            const extra = pt?.pacientes?.length
                              ? ` — ${pt.pacientes.join(', ')}`
                              : '';
                            const ctrlTag = pt?.accionControl
                              ? ' [Acción de control iniciada]'
                              : '';
                            return `FIS ${label}${extra}${ctrlTag}`;
                          }}
                        />
                        <Bar
                          dataKey="casosVivos"
                          stackId="a"
                          fill="#0F766E"
                          radius={[3, 3, 0, 0]}
                        />
                        <Bar
                          dataKey="defuncionesIaas"
                          stackId="a"
                          fill="#DC2626"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Registra al menos una Fecha de Inicio de Síntomas (FIS) válida en el Censo
                    Nominal para trazar la curva epidémica.
                  </div>
                )}
              </section>

              {/* Apartado V: Spatial Bed Croquis Ordered by FIS */}
              <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Apartado V. Croquis de Distribución Espacial por Cama y Orden Consecutivo de FIS
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Casos numerados consecutivamente (#1, #2...) de acuerdo con su fecha de inicio
                    de síntomas, incluyendo antecedente de traslado previo.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {croquisNodes.map((node) => (
                    <div
                      key={node.patientId}
                      className={`p-3.5 rounded-lg border ${
                        node.isDeathByIaas
                          ? 'border-red-300 dark:border-red-900/70 bg-red-50/40 dark:bg-red-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold tabular-nums text-teal-700 dark:text-teal-300">
                          Caso #{node.orderNumber} · {node.cama}
                        </span>
                        <span className="font-mono text-[11px] tabular-nums text-slate-500">
                          FIS {fmtFull(node.fis) || 's/f'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mt-1">
                        {exportUseInitials ? node.iniciales : node.nombre}{' '}
                        <span className="font-normal text-slate-500">({node.iaasType})</span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                        {node.servicioPrevio
                          ? `${node.servicioPrevio} → ${node.servicioBrote}`
                          : `Estancia en ${node.servicioBrote}`}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Apartado III: SUIVE-3-2020 Age/Sex Distribution + Symptom Frequency */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
                <section className="xl:col-span-2 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#111726]">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Apartado III. Distribución por Persona (SUIVE-3-2020)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Tasas de ataque y letalidad por 100 expuestos, libres de errores #¡DIV/0!.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-600 dark:text-slate-400">
                        Expuestos en {draft.servicioMedico}:
                      </span>
                      <label className="inline-flex items-center gap-1">
                        <span className="font-mono">H:</span>
                        <input
                          type="number"
                          min={0}
                          value={draft.expuestosGlobalM}
                          onChange={(e) =>
                            updateDraft({
                              poblacionExpuestaModo: 'global_servicio',
                              expuestosGlobalM: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-16 min-h-[30px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-right"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1">
                        <span className="font-mono">M:</span>
                        <input
                          type="number"
                          min={0}
                          value={draft.expuestosGlobalF}
                          onChange={(e) =>
                            updateDraft({
                              poblacionExpuestaModo: 'global_servicio',
                              expuestosGlobalF: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-16 min-h-[30px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono tabular-nums text-right"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2 px-3 text-left font-semibold">Grupo edad</th>
                          <th className="py-2 px-2 text-right font-semibold">Casos M</th>
                          <th className="py-2 px-2 text-right font-semibold">Casos F</th>
                          <th className="py-2 px-2 text-right font-semibold">Total (C)</th>
                          <th className="py-2 px-2 text-right font-semibold">Def. IAAS</th>
                          <th className="py-2 px-2 text-right font-semibold">Exp. (I)</th>
                          <th className="py-2 px-2 text-right font-semibold">Ataque %</th>
                          <th className="py-2 px-3 text-right font-semibold">Letalidad %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono tabular-nums">
                        {personDist.map((r) => {
                          const isTotal = r.key === 'TOTAL';
                          return (
                            <tr
                              key={r.key}
                              className={
                                isTotal
                                  ? 'bg-slate-50 dark:bg-slate-800/60 font-bold text-slate-900 dark:text-slate-100'
                                  : r.casosT > 0
                                    ? 'text-slate-900 dark:text-slate-100'
                                    : 'text-slate-400 dark:text-slate-500'
                              }
                            >
                              <td className="py-2 px-3 font-sans">{r.label}</td>
                              <td className="py-2 px-2 text-right">{r.casosM}</td>
                              <td className="py-2 px-2 text-right">{r.casosF}</td>
                              <td className="py-2 px-2 text-right font-semibold">{r.casosT}</td>
                              <td className="py-2 px-2 text-right">{r.defT}</td>
                              <td className="py-2 px-2 text-right">
                                {!isTotal ? (
                                  <input
                                    type="number"
                                    min={0}
                                    aria-label={`Expuestos totales grupo ${r.label}`}
                                    value={r.expT}
                                    onChange={(e) => {
                                      const totalVal = Math.max(0, Number(e.target.value) || 0);
                                      const agKey = r.key as SuiveAgeGroupKey;
                                      const halfM = Math.ceil(totalVal / 2);
                                      const halfF = totalVal - halfM;
                                      updateDraft({
                                        poblacionExpuestaModo: 'por_edad',
                                        poblacionExpuestaPorEdad: {
                                          ...draft.poblacionExpuestaPorEdad,
                                          [agKey]: { m: halfM, f: halfF },
                                        },
                                      });
                                    }}
                                    className="w-14 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-right"
                                  />
                                ) : (
                                  r.expT
                                )}
                              </td>
                              <td className="py-2 px-2 text-right">
                                {r.ataqueT != null ? `${r.ataqueT.toFixed(1)}%` : '0.0%'}
                              </td>
                              <td className="py-2 px-3 text-right">
                                {r.letalidadT != null ? `${r.letalidadT.toFixed(1)}%` : '0.0%'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* Symptom Frequency Table */}
                <section className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-[#111726]">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Frecuencia de Signos y Síntomas
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Calculado sobre n = {includedCases.length} casos incluidos.
                    </p>
                  </div>
                  {symptomFreq.length > 0 ? (
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="py-2 px-3 text-left font-semibold">Signo / Síntoma</th>
                          <th className="py-2 px-2 text-right font-semibold">No.</th>
                          <th className="py-2 px-3 text-right font-semibold">%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                        {symptomFreq.map((s) => (
                          <tr key={s.symptom}>
                            <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                              {s.symptom}
                            </td>
                            <td className="py-2 px-2 text-right font-mono tabular-nums">
                              {s.count}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold">
                              {s.pct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-4 text-xs text-slate-500">
                      Selecciona signos y síntomas en las fichas del Censo Nominal.
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}

          {/* TAB 3: ANÁLISIS EPIDEMIOLÓGICO (AP. VI) Y ACCIONES DE CONTROL (AP. VII) */}
          {activeTab === 'analisis' && (
            <div className="flex flex-col gap-6">
              <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Apartado VI. Análisis Epidemiológico (Panorama del Servicio, Brotes Previos e
                      Hipótesis)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Integra automáticamente las cifras históricas de CODECIN, antecedentes de
                      brotes previos (ej. mayo 2026) y revisión de circulación en otros servicios.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleRegeneratePanorama}
                    className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 self-start whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Recalcular con histórico CODECIN</span>
                  </button>
                </div>

                <label className="flex flex-col gap-1 text-xs">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    1. Antecedentes epidemiológicos del brote (frecuencia en el servicio, letalidad,
                    RAM, brotes similares previos y otros servicios)
                  </span>
                  <textarea
                    rows={5}
                    value={draft.antecedentesPanorama}
                    onChange={(e) => updateDraft({ antecedentesPanorama: e.target.value })}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed text-slate-900 dark:text-slate-100"
                  />
                </label>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      2. Probables fuentes del brote (hipótesis de origen)
                    </span>
                    <textarea
                      rows={3}
                      value={draft.probablesFuentes}
                      onChange={(e) => updateDraft({ probablesFuentes: e.target.value })}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      3. Probables mecanismos de transmisión
                    </span>
                    <textarea
                      rows={3}
                      value={draft.probablesMecanismos}
                      onChange={(e) => updateDraft({ probablesMecanismos: e.target.value })}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs leading-relaxed"
                    />
                  </label>
                </div>
              </section>

              {/* Apartado VII: Control Actions with Exact Dates */}
              <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Apartado VII. Acciones de Prevención y Control (con Fechas Exactas de Inicio)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Inserta con un clic los paquetes preventivos (Care Bundles) del Manual RHOVE o
                    registra acciones dirigidas a la fuente sospechosa.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {CARE_BUNDLE_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={() => handleAddControlAction(tpl)}
                      className="min-h-[32px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3 text-teal-700 dark:text-teal-400" />
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleAddControlAction()}
                    className="min-h-[32px] px-2.5 py-1 rounded-md border border-teal-600/40 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-50/50 dark:hover:bg-teal-950/30 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Acción personalizada</span>
                  </button>
                </div>

                <div className="flex flex-col gap-2.5">
                  {draft.accionesControl.map((act) => (
                    <div
                      key={act.id}
                      className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 items-start"
                    >
                      <div className="md:col-span-2">
                        <input
                          type="date"
                          aria-label="Fecha de acción de control"
                          value={act.fecha}
                          onChange={(e) =>
                            updateDraft({
                              accionesControl: draft.accionesControl.map((a) =>
                                a.id === act.id ? { ...a, fecha: e.target.value } : a
                              ),
                            })
                          }
                          className="w-full min-h-[34px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                        />
                      </div>
                      <div className="md:col-span-7">
                        <textarea
                          rows={2}
                          value={act.descripcion}
                          onChange={(e) =>
                            updateDraft({
                              accionesControl: draft.accionesControl.map((a) =>
                                a.id === act.id ? { ...a, descripcion: e.target.value } : a
                              ),
                            })
                          }
                          placeholder="Describe la intervención específica implementada..."
                          className="w-full p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <input
                          type="text"
                          value={act.responsable}
                          onChange={(e) =>
                            updateDraft({
                              accionesControl: draft.accionesControl.map((a) =>
                                a.id === act.id ? { ...a, responsable: e.target.value } : a
                              ),
                            })
                          }
                          placeholder="Responsable"
                          className="w-full min-h-[34px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                        />
                      </div>
                      <div className="md:col-span-1 flex justify-end">
                        <button
                          type="button"
                          aria-label="Eliminar acción"
                          onClick={() =>
                            updateDraft({
                              accionesControl: draft.accionesControl.filter(
                                (a) => a.id !== act.id
                              ),
                            })
                          }
                          className="min-h-[34px] min-w-[34px] rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Nombre y cargo de quien elaboró
                    </span>
                    <input
                      type="text"
                      value={draft.elaboroNombreCargo}
                      onChange={(e) => updateDraft({ elaboroNombreCargo: e.target.value })}
                      className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Vo.Bo. Director del Hospital
                    </span>
                    <input
                      type="text"
                      value={draft.directorNombre}
                      onChange={(e) => updateDraft({ directorNombre: e.target.value })}
                      className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      Vo.Bo. Epidemiólogo UVEH
                    </span>
                    <input
                      type="text"
                      value={draft.epidemiologoNombre}
                      onChange={(e) => updateDraft({ epidemiologoNombre: e.target.value })}
                      className="min-h-[36px] px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </label>
                </div>
              </section>
            </div>
          )}

          {/* TAB 4: SEGUIMIENTO NOTINMED, CARPETA CODECIAAS Y PLANTILLA EXCEL (.XLSX) */}
          {activeTab === 'seguimiento' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: Lifecycle & CODECIAAS Documentary Checklist */}
              <div className="flex flex-col gap-6">
                <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Ciclo de Vida NOTINMED (Inicial -0 → Semanal → Cierre -1)
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {daysSinceLastFis != null
                          ? `Días transcurridos sin casos nuevos desde la última FIS: ${daysSinceLastFis} día(s) ${
                              daysSinceLastFis >= 14
                                ? '(cumple ventana ≥2 periodos de incubación para valorar cierre)'
                                : '(mantener vigilancia activa semanal)'
                            }`
                          : 'Captura las FIS para calcular el conteo hacia el alta sanitaria.'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1 text-xs sm:col-span-2">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        Estatus actual del expediente
                      </span>
                      <select
                        value={draft.stage}
                        onChange={(e) =>
                          updateDraft({ stage: e.target.value as OutbreakLifecycleStage })
                        }
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                      >
                        {(Object.keys(STAGE_LABELS) as OutbreakLifecycleStage[]).map((st) => (
                          <option key={st} value={st}>
                            {STAGE_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        Sufijo folio (-0 / -1)
                      </span>
                      <input
                        type="text"
                        value={draft.folioSufijoActual}
                        onChange={(e) => updateDraft({ folioSufijoActual: e.target.value })}
                        className="min-h-[36px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
                      />
                    </label>
                  </div>

                  {/* Add follow-up entry */}
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex flex-col gap-2.5">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={newLogType}
                        onChange={(e) =>
                          setNewLogType(e.target.value as OutbreakFollowUpLog['tipo'])
                        }
                        className="min-h-[34px] px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      >
                        <option value="inicial_0">Notificación Inicial (-0)</option>
                        <option value="nota_semanal">
                          Nota informativa semanal (sin casos/defunciones nuevas)
                        </option>
                        <option value="actualizacion_casos">
                          Actualización SUIVE-3 (caso nuevo o defunción)
                        </option>
                        <option value="cierre_1">Informe de Cierre por control (-1)</option>
                      </select>
                      <button
                        type="button"
                        onClick={handleAppendFollowUpLog}
                        className="min-h-[34px] px-3 py-1.5 rounded bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold whitespace-nowrap shrink-0"
                      >
                        Registrar envío
                      </button>
                    </div>
                    <input
                      type="text"
                      value={newLogSummary}
                      onChange={(e) => setNewLogSummary(e.target.value)}
                      placeholder="Resumen del envío semanal o dictamen de cierre..."
                      className="min-h-[34px] px-2.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                    />
                  </div>

                  {draft.bitacoraSeguimiento.length > 0 && (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {draft.bitacoraSeguimiento.map((log) => (
                        <li key={log.id} className="py-2 flex flex-col gap-0.5">
                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                            <span>
                              {fmtFull(log.fecha)} · {log.folioNotinmed}
                            </span>
                            <span>{log.autor}</span>
                          </div>
                          <p className="text-slate-800 dark:text-slate-200">{log.resumen}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* CODECIAAS Documentary Checklist (5 State Audit Items) */}
                <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Carpeta de Evidencia Documental Complementaria (CODECIAAS)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Los 5 entregables solicitados en supervisión estatal para respaldar el cierre
                      del brote.
                    </p>
                  </div>

                  {(
                    [
                      [
                        'minutaCodeciaas',
                        'a) Minuta de sesión extraordinaria del CODECIAAS / CODECIN',
                      ],
                      [
                        'minutaRecorridoCampo',
                        'b) Minuta de recorrido de campo para identificación de riesgos en el servicio',
                      ],
                      [
                        'reportesSusceptibilidadLab',
                        'c) Informes de laboratorio con identificación y susceptibilidad (100% casos)',
                      ],
                      [
                        'listasCapacitacionEppHigiene',
                        'd) Listas de asistencia: EPP, precauciones por contacto, higiene de manos y triple cubeta',
                      ],
                      [
                        'evidenciaPaquetesPreventivos',
                        'e) Evidencia de reforzamiento de paquetes preventivos (VM, CVC, sonda vesical)',
                      ],
                    ] as const
                  ).map(([fieldKey, label]) => (
                    <label
                      key={fieldKey}
                      className="flex items-start gap-2.5 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={draft.checklistCodeciaas[fieldKey]}
                        onChange={(e) =>
                          updateDraft({
                            checklistCodeciaas: {
                              ...draft.checklistCodeciaas,
                              [fieldKey]: e.target.checked,
                            },
                          })
                        }
                        className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </section>
              </div>

              {/* Right Column: Official .xlsx Template Uploader, Inspector & Cell Mapper */}
              <section className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 bg-white dark:bg-[#111726] flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Plantilla Excel Oficial del Hospital (.xlsx)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                      Carga aquí tu archivo <strong>Formato Brote IAAS / SUIVE-3 (.xlsx)</strong> en
                      limpio sin convertirlo a PDF. El motor detecta sus pestañas y casillas,
                      respeta todas las fórmulas originales y rellena el estudio automáticamente.
                    </p>
                  </div>
                  <FileSpreadsheet className="w-6 h-6 text-teal-700 dark:text-teal-400 shrink-0" />
                </div>

                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    void handleTemplateUpload(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col items-center text-center gap-2.5">
                  {templateMeta && templateReady ? (
                    <>
                      <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Plantilla activa lista para rellenar: {templateMeta.fileName}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Pestañas detectadas: {templateMeta.sheetNames.join(', ')} ·{' '}
                        <span className="font-mono tabular-nums font-semibold">
                          {Object.keys(templateMeta.detectedFieldAnchors).length}
                        </span>{' '}
                        campos SUIVE-3 +{' '}
                        <span className="font-mono tabular-nums font-semibold">
                          {Object.keys(templateMeta.detectedAgeGroupRows).length}
                        </span>{' '}
                        filas etarias vinculadas
                      </p>
                      <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                        <button
                          type="button"
                          disabled={uploadingTemplate}
                          onClick={() => templateInputRef.current?.click()}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                        >
                          Reemplazar plantilla (.xlsx)
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowMappingEditor((v) => !v)}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-teal-700 dark:text-teal-300"
                        >
                          {showMappingEditor ? 'Ocultar celdas' : 'Ver / ajustar celdas'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearSavedSuiveTemplate();
                            setTemplateMeta(null);
                            setTemplateReady(false);
                            onNotify('Plantilla personalizada desvinculada');
                          }}
                          className="min-h-[34px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          Quitar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-slate-400" />
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {uploadingTemplate
                          ? 'Analizando estructura de tu archivo Excel...'
                          : 'Aún no has cargado una plantilla personalizada (.xlsx)'}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
                        Puedes cargar tu formato oficial en limpio para inyectar datos sobre él, o
                        descargar directamente el libro SUIVE-3-2020 integrado.
                      </p>
                      <button
                        type="button"
                        disabled={uploadingTemplate}
                        onClick={() => templateInputRef.current?.click()}
                        className="mt-1 min-h-[38px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Cargar formato brote IAAS (.xlsx)</span>
                      </button>
                    </>
                  )}
                </div>

                {/* Optional Fine-Grain Cell Coordinate Mapper */}
                {showMappingEditor && templateMeta && (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-3 max-h-64 overflow-y-auto flex flex-col gap-2">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Coordenadas detectadas automáticamente (formato{' '}
                      <code className="font-mono">NombreHoja!Celda</code>). Si tu formato estatal
                      ubica algún campo en otra casilla, puedes ajustarla aquí:
                    </p>
                    {SUIVE_TEMPLATE_FIELDS.map((field) => {
                      const autoVal = templateMeta.detectedFieldAnchors[field.key] || '';
                      const customVal = templateMeta.customOverrides?.[field.key] ?? '';
                      return (
                        <div
                          key={field.key}
                          className="grid grid-cols-12 items-center gap-2 text-xs"
                        >
                          <span className="col-span-7 text-slate-700 dark:text-slate-300 truncate">
                            {field.label}
                          </span>
                          <input
                            type="text"
                            value={customVal || autoVal}
                            onChange={(e) => handleOverrideChange(field.key, e.target.value)}
                            placeholder="Ej. SUIVE-3!C12"
                            className="col-span-5 min-h-[28px] px-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleExportExcel(false)}
                    className="min-h-[38px] px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {templateReady
                        ? 'Rellenar y descargar mi plantilla (.xlsx)'
                        : 'Descargar libro SUIVE-3-2020 completo (.xlsx)'}
                    </span>
                  </button>
                  {templateReady && (
                    <button
                      type="button"
                      onClick={() => handleExportExcel(true)}
                      className="min-h-[38px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      Descargar también versión estándar RHOVE 2024
                    </button>
                  )}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
