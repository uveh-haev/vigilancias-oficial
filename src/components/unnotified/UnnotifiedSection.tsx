/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  LayoutGrid,
  MessageSquare,
  Microscope,
  RotateCcw,
  Search,
  Table2,
  User,
  X,
} from 'lucide-react';
import {
  CriteriaEvaluation,
  CultureAttachment,
  DoneRecord,
  NursingNote,
  RadarEvent,
  SharedMark,
  ViewDensity,
} from '../../types/clinical';
import {
  buildUnnotifiedWhatsAppReport,
  computeUnnotifiedAudit,
  exportUnnotifiedExcel,
  formatRhoveClipboardPayload,
  UnnotifiedCategory,
  UnnotifiedItem,
} from '../../domain/unnotifiedAudit';
import { fmtFull, formatLongSpanishDate, norm, todayISO } from '../../domain/dates';
import { getPatientKey } from '../../domain/services';

interface UnnotifiedSectionProps {
  rows: RadarEvent[];
  cerrados: RadarEvent[];
  outbreakIds: Set<string>;
  doneMap: Record<string, DoneRecord>;
  corte: string | null;
  notes?: NursingNote[];
  canWrite: boolean;
  searchQuery: string;
  onClearSearch: () => void;
  onSearchChange: (q: string) => void;
  onOpenInspector: (patientKey: string) => void;
  onOpenSmartCulture?: (patientRow: RadarEvent) => void;
  onOpenCulture?: (culture: CultureAttachment) => void;
  onSaveCriteria?: (event: RadarEvent, evaluation: CriteriaEvaluation) => Promise<boolean>;
  onSubmitNote?: (patientRow: RadarEvent, text: string) => Promise<boolean>;
  onMarkCapturado?: (event: RadarEvent) => void;
  onNotify: (msg: string) => void;
}

type FilterCategory = 'todos' | UnnotifiedCategory | 'rezago_critico';

const COMMON_JUSTIFICATIONS = [
  'Esperando confirmación definitiva de 2do cultivo bacteriológico',
  'Sospecha de contaminación o recuento no significativo; en espera de reprueba',
  'Infección de presunto origen comunitario (<48h de ingreso hospitalario)',
  'Expediente clínico físico en archivo / en cotejo de notas médicas',
  'Pendiente de dictamen conjunto con Infectología / Comité CODECIN',
  'Paciente trasladado a otra unidad médica previo a conclusión de toma',
  'Corroborando fecha exacta de instalación de dispositivo invasivo',
];

export function UnnotifiedSection({
  rows,
  cerrados,
  outbreakIds,
  doneMap,
  corte,
  notes = [],
  canWrite,
  searchQuery,
  onClearSearch,
  onSearchChange,
  onOpenInspector,
  onOpenSmartCulture,
  onSaveCriteria,
  onSubmitNote,
  onMarkCapturado,
  onNotify,
}: UnnotifiedSectionProps) {
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('todos');
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [viewDensity, setViewDensity] = useState<ViewDensity>('cards');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modal for registering justification note
  const [justificationModal, setJustificationModal] = useState<{
    open: boolean;
    item: UnnotifiedItem | null;
    text: string;
    saving: boolean;
  }>({
    open: false,
    item: null,
    text: '',
    saving: false,
  });

  // Calculate full audit
  const audit = useMemo(
    () =>
      computeUnnotifiedAudit({
        rows,
        cerrados,
        outbreakIds,
        doneMap,
        corte,
        notes,
      }),
    [rows, cerrados, outbreakIds, doneMap, corte, notes]
  );

  const { items, summary } = audit;

  // Filter items
  const filteredItems = useMemo(() => {
    let result = items;

    // Filter by category
    if (activeCategory === 'rezago_critico') {
      result = result.filter((i) => i.delayLevel === 'critico');
    } else if (activeCategory !== 'todos') {
      result = result.filter((i) => i.category === activeCategory);
    }

    // Filter by service
    if (selectedService) {
      result = result.filter((i) => i.servicio === selectedService);
    }

    // Filter by IAAS type
    if (selectedType) {
      result = result.filter((i) => i.tipoIaas === selectedType);
    }

    // Search query
    if (searchQuery.trim()) {
      const q = norm(searchQuery);
      result = result.filter((i) => {
        const r = i.event;
        const text = norm(
          [
            r.nombre,
            r.exp,
            r.cama,
            i.servicio,
            i.subservicio,
            i.subArea,
            i.tipoIaas,
            r.micro,
            r.motivo,
            r.obs,
            i.causaSugerida,
          ].join(' ')
        );
        return text.includes(q);
      });
    }

    return result;
  }, [items, activeCategory, selectedService, selectedType, searchQuery]);

  const handleCopyClipboard = (item: UnnotifiedItem) => {
    const text = formatRhoveClipboardPayload(item, {
      note: item.justificacionExistente,
    });
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(item.id);
        onNotify(`Ficha de RHOVE copiada para ${item.event.nombre || 'el paciente'}`);
        window.setTimeout(() => setCopiedId(null), 2500);
      })
      .catch(() => {
        onNotify('No se pudo copiar al portapapeles.');
      });
  };

  const handleCopyAllExpedientes = () => {
    const exps = Array.from(
      new Set(
        filteredItems
          .map((i) => i.event.exp)
          .filter(Boolean)
          .map(String)
      )
    );
    if (!exps.length) {
      onNotify('No hay expedientes en la lista filtrada.');
      return;
    }
    navigator.clipboard
      .writeText(exps.join(', '))
      .then(() => {
        onNotify(`${exps.length} expedientes copiados para cotejo rápido.`);
      })
      .catch(() => {
        onNotify('No se pudo copiar los expedientes.');
      });
  };

  const handleExportExcel = () => {
    exportUnnotifiedExcel({
      items: filteredItems,
      summary,
      corte,
      hospitalName: 'HAEV',
    });
    onNotify('Archivo Excel de Brecha RHOVE generado exitosamente.');
  };

  const handleCopyWhatsApp = () => {
    const msg = buildUnnotifiedWhatsAppReport({
      items: filteredItems,
      summary,
      corte,
      selectedService: selectedService || undefined,
    });
    navigator.clipboard
      .writeText(msg)
      .then(() => {
        onNotify('Reporte de WhatsApp copiado para envío al equipo UVEH.');
      })
      .catch(() => {
        onNotify('No se pudo copiar el reporte.');
      });
  };

  const handleSaveJustification = async () => {
    if (!justificationModal.item || !onSubmitNote) return;
    const text = justificationModal.text.trim();
    if (!text) {
      onNotify('Escribe o selecciona una causa de justificación.');
      return;
    }

    setJustificationModal((prev) => ({ ...prev, saving: true }));
    try {
      const fullNote = `[REVISIÓN RHOVE] ${text}`;
      const ok = await onSubmitNote(justificationModal.item.event, fullNote);
      if (ok) {
        onNotify('Causa de no notificación registrada en el expediente.');
        setJustificationModal({ open: false, item: null, text: '', saving: false });
      } else {
        onNotify('No se pudo guardar la nota.');
        setJustificationModal((prev) => ({ ...prev, saving: false }));
      }
    } catch {
      onNotify('Error al guardar la nota.');
      setJustificationModal((prev) => ({ ...prev, saving: false }));
    }
  };

  const handleMarkAsCaptured = (item: UnnotifiedItem) => {
    if (onMarkCapturado) {
      onMarkCapturado(item.event);
      onNotify(`Paciente marcado como gestionado para RHOVE.`);
    }
  };

  const hasFilters = Boolean(
    activeCategory !== 'todos' || selectedService || selectedType || searchQuery
  );

  const resetAllFilters = () => {
    setActiveCategory('todos');
    setSelectedService('');
    setSelectedType('');
    onClearSearch();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header Banner & Executive Audit KPI Strip */}
      <section
        aria-label="Resumen de no notificación y brecha RHOVE"
        className="bg-white dark:bg-[#111726] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs"
      >
        <div className="p-5 sm:p-6 border-b border-slate-200/80 dark:border-slate-800 bg-linear-to-r from-teal-900/5 via-slate-50 to-transparent dark:from-teal-950/20 dark:via-[#111726] dark:to-transparent flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 dark:bg-amber-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  Brecha de Notificación RHOVE
                </h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60">
                  {summary.totalNoNotificados} sin capturar
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                Pacientes y eventos identificados en el censo Excel RADAR que aún no cuentan con registro oficial o reporte definitivo en la plataforma RHOVE (NOM-045-SSA2).
              </p>
            </div>
          </div>

          {/* Quick Action Export Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-2xs transition-colors"
              title="Descargar auditoría detallada en formato Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel</span>
            </button>

            <button
              type="button"
              onClick={handleCopyWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
              title="Copiar resumen estructurado para WhatsApp"
            >
              <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Reporte WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleCopyAllExpedientes}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold border border-slate-200 dark:border-slate-700 transition-colors"
              title="Copiar lista de expedientes de los pacientes filtrados"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Expedientes</span>
            </button>
          </div>
        </div>

        {/* 6 High-Impact Operational KPI Tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y lg:divide-y-0 divide-x divide-slate-200/80 dark:divide-slate-800 text-left">
          {/* Tile 1: Total No Notificados */}
          <button
            type="button"
            onClick={() => setActiveCategory('todos')}
            className={`p-4 transition-colors flex flex-col justify-between gap-1 text-left ${
              activeCategory === 'todos'
                ? 'bg-amber-50/70 dark:bg-amber-950/20'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Total Sin Captura
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {summary.totalNoNotificados}
              </span>
              <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold tabular-nums">
                {summary.tasaBrecha}% brecha
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              de {summary.totalCenso} en censo
            </span>
          </button>

          {/* Tile 2: IAAS Activas */}
          <button
            type="button"
            onClick={() => setActiveCategory('iaas_activa')}
            className={`p-4 transition-colors flex flex-col justify-between gap-1 text-left ${
              activeCategory === 'iaas_activa'
                ? 'bg-amber-50/70 dark:bg-amber-950/20'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              IAAS en Piso
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-red-700 dark:text-red-400 tabular-nums">
                {summary.iaasActivasSinRhove}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                activas
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Pacientes hospitalizados
            </span>
          </button>

          {/* Tile 3: Cultivos Positivos */}
          <button
            type="button"
            onClick={() => setActiveCategory('cultivo_positivo')}
            className={`p-4 transition-colors flex flex-col justify-between gap-1 text-left ${
              activeCategory === 'cultivo_positivo'
                ? 'bg-amber-50/70 dark:bg-amber-950/20'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Cultivos Positivos
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                {summary.cultivosPositivosSinRhove}
              </span>
              <span className="text-xs text-amber-700 dark:text-amber-400 font-semibold">
                aislamientos
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Con bacteria aislada
            </span>
          </button>

          {/* Tile 4: Egresos y Defunciones */}
          <button
            type="button"
            onClick={() => setActiveCategory('egreso_defuncion')}
            className={`p-4 transition-colors flex flex-col justify-between gap-1 text-left ${
              activeCategory === 'egreso_defuncion'
                ? 'bg-amber-50/70 dark:bg-amber-950/20'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Egresos / Defunciones
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-purple-700 dark:text-purple-400 tabular-nums">
                {summary.egresosSinRhove}
              </span>
              <span className="text-xs text-purple-700 dark:text-purple-400 font-semibold">
                urgentes
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Sin RHOVE al egreso
            </span>
          </button>

          {/* Tile 5: Rezago Crítico */}
          <button
            type="button"
            onClick={() => setActiveCategory('rezago_critico')}
            className={`p-4 transition-colors flex flex-col justify-between gap-1 text-left ${
              activeCategory === 'rezago_critico'
                ? 'bg-amber-50/70 dark:bg-amber-950/20'
                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Rezago Crítico
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                {summary.rezagoCriticoCount}
              </span>
              <span className="text-xs text-red-600 dark:text-red-400 font-semibold">
                &gt;5 días
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Promedio: {summary.promedioDiasRetraso}d
            </span>
          </button>

          {/* Tile 6: Tasa de Notificación Actual */}
          <div className="p-4 flex flex-col justify-between gap-1 bg-slate-50/50 dark:bg-slate-900/30">
            <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Efectividad RHOVE
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {summary.tasaCaptura}%
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {summary.totalCapturadas} capturados
              </span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
              <div
                className="bg-emerald-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, summary.tasaCaptura))}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Workstation Filter & Search Controls */}
      <div className="bg-white dark:bg-[#111726] border border-slate-200/90 dark:border-slate-800 rounded-xl p-4 flex flex-col gap-3.5 shadow-2xs">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory('todos')}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'todos'
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Todos los pendientes ({summary.totalNoNotificados})
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('iaas_activa')}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'iaas_activa'
                ? 'bg-red-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            IAAS activas ({summary.iaasActivasSinRhove})
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('cultivo_positivo')}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'cultivo_positivo'
                ? 'bg-teal-700 text-white dark:bg-teal-600'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Cultivos positivos ({summary.cultivosPositivosSinRhove})
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('egreso_defuncion')}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'egreso_defuncion'
                ? 'bg-purple-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Egresos / Defunciones ({summary.egresosSinRhove})
          </button>

          <button
            type="button"
            onClick={() => setActiveCategory('rezago_critico')}
            className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'rezago_critico'
                ? 'bg-red-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Rezago &gt;5 días ({summary.rezagoCriticoCount})
          </button>

          {summary.microPendientesEnRhove > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory('micro_pendiente')}
              className={`min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeCategory === 'micro_pendiente'
                  ? 'bg-amber-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Microorganismo sin agregar ({summary.microPendientesEnRhove})
            </button>
          )}
        </div>

        {/* Secondary Search & Dropdown Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/70 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar paciente, cama, expediente, microorganismo o IAAS…"
                className="w-full min-h-[36px] pl-9 pr-8 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-700 dark:focus:ring-teal-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Service Select */}
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="min-h-[36px] px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none"
            >
              <option value="">Todos los servicios ({summary.porServicio.length})</option>
              {summary.porServicio.map((s) => (
                <option key={s.servicio} value={s.servicio}>
                  {s.servicio} ({s.total})
                </option>
              ))}
            </select>

            {/* IAAS Type Select */}
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="min-h-[36px] px-3 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none max-w-[220px] truncate"
            >
              <option value="">Todos los tipos ({summary.porTipoIaas.length})</option>
              {summary.porTipoIaas.map((t) => (
                <option key={t.tipo} value={t.tipo}>
                  {t.tipo} ({t.count})
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={resetAllFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restablecer</span>
              </button>
            )}
          </div>

          {/* Density Toggle & Counter */}
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Mostrando <strong className="text-slate-800 dark:text-slate-200">{filteredItems.length}</strong> de {summary.totalNoNotificados}
            </span>

            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setViewDensity('cards')}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewDensity === 'cards'
                    ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-2xs font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                title="Vista de fichas clínicas"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewDensity('table')}
                className={`p-1.5 rounded-md text-xs transition-colors ${
                  viewDensity === 'table'
                    ? 'bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 shadow-2xs font-semibold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
                title="Vista tabular de captura rápida"
              >
                <Table2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Items View (Cards or Table) */}
      {filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto my-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Sin casos pendientes con los filtros aplicados
          </h3>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
            {hasFilters
              ? 'No hay registros no notificados que coincidan con la búsqueda o servicio seleccionado.'
              : 'Todos los casos del censo RADAR cuentan con captura registrada en RHOVE.'}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-4 px-3.5 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 rounded-lg hover:bg-teal-100 transition-colors"
            >
              Ver todos los casos pendientes
            </button>
          )}
        </div>
      ) : viewDensity === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map((item) => {
            const r = item.event;
            const patientKey = getPatientKey(r);
            const isCopied = copiedId === item.id;

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-[#111726] border rounded-xl p-5 flex flex-col justify-between gap-4 transition-all shadow-2xs hover:shadow-xs ${
                  item.marcadoCapturado
                    ? 'border-emerald-300 dark:border-emerald-800/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                    : item.delayLevel === 'critico'
                      ? 'border-red-300 dark:border-red-900/60 hover:border-red-400'
                      : item.delayLevel === 'alerta'
                        ? 'border-amber-300 dark:border-amber-900/60'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {/* Top Row: Patient & Delay Badge */}
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                          Exp: {r.exp || 'S/E'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          Cama {r.cama || 'S/C'}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300">
                          {item.servicio}
                        </span>
                        {item.subservicio && item.subservicio !== item.servicio && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            ({item.subservicio})
                          </span>
                        )}
                      </div>

                      <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1 truncate">
                        {r.nombre || 'PACIENTE SIN NOMBRE'}
                      </h4>
                    </div>

                    {/* Delay Meter */}
                    <div className="shrink-0 text-right">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold tabular-nums ${
                          item.delayLevel === 'critico'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border border-red-300 dark:border-red-800'
                            : item.delayLevel === 'alerta'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{item.diasRetraso}d sin captura</span>
                      </span>
                    </div>
                  </div>

                  {/* Diagnosis, IAAS Type & Device */}
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                        <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />
                        <span>{item.tipoIaas}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        Det: {r.det || r.ing || 'Sin fecha'}
                      </span>
                    </div>

                    {r.disp && (
                      <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                        <strong>Dispositivo:</strong> {r.disp}
                      </p>
                    )}

                    {/* Microbiology findings */}
                    {r.micro ? (
                      <div className="flex items-start gap-1.5 pt-1 text-[11px] text-teal-800 dark:text-teal-300 font-medium">
                        <Microscope className="w-3.5 h-3.5 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" />
                        <span>
                          {r.micro} {r.res ? `(${r.res})` : ''}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500 italic">
                        Sin microorganismo especificado en censo
                      </span>
                    )}

                    {/* Antibiogram quick teaser */}
                    {r.atb && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1">
                        <strong>ATB:</strong> {r.atb}
                      </p>
                    )}

                    {/* Alert / Reason */}
                    {r.motivo && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 pt-0.5 border-t border-slate-200/50 dark:border-slate-800">
                        {r.motivo}
                      </p>
                    )}

                    {/* Existing Note / Justification if registered */}
                    {item.justificacionExistente && (
                      <div className="mt-1 p-2 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-900 dark:text-amber-200">
                        <strong>Nota registrada:</strong> {item.justificacionExistente}
                      </div>
                    )}
                  </div>
                </div>

                {/* Bottom Row: Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200/70 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* One-Click Copy for RHOVE Portal */}
                    <button
                      type="button"
                      onClick={() => handleCopyClipboard(item)}
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        isCopied
                          ? 'bg-emerald-700 text-white'
                          : 'bg-teal-700 hover:bg-teal-800 text-white shadow-2xs'
                      }`}
                      title="Copiar ficha estandarizada para capturar en el portal oficial RHOVE"
                    >
                      {isCopied ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>¡Ficha copiada!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar para RHOVE</span>
                        </>
                      )}
                    </button>

                    {/* Mark as captured in RHOVE */}
                    <button
                      type="button"
                      onClick={() => handleMarkAsCaptured(item)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        item.marcadoCapturado
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                          : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                      title="Marcar como caso gestionado o ya capturado en RHOVE"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{item.marcadoCapturado ? 'En RHOVE' : 'Marcar RHOVE'}</span>
                    </button>

                    {/* Add / Edit Justification Note */}
                    <button
                      type="button"
                      onClick={() =>
                        setJustificationModal({
                          open: true,
                          item,
                          text: item.justificacionExistente || '',
                          saving: false,
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-colors"
                      title="Documentar causa clínica de por qué no se ha notificado aún"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Justificar</span>
                    </button>
                  </div>

                  {/* Open Dossier Inspector */}
                  <button
                    type="button"
                    onClick={() => onOpenInspector(patientKey)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                  >
                    <span>Expediente</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Dense Tabular Workstation View */
        <div className="bg-white dark:bg-[#111726] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">Paciente & Expediente</th>
                  <th className="py-3 px-3">Ubicación</th>
                  <th className="py-3 px-3">Tipo IAAS & Dispositivo</th>
                  <th className="py-3 px-3">Microbiología</th>
                  <th className="py-3 px-3">Rezago RHOVE</th>
                  <th className="py-3 px-3">Estado / Categoría</th>
                  <th className="py-3 px-4 text-right">Acciones Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800/80">
                {filteredItems.map((item) => {
                  const r = item.event;
                  const patientKey = getPatientKey(r);
                  const isCopied = copiedId === item.id;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                        item.marcadoCapturado
                          ? 'bg-emerald-50/15 dark:bg-emerald-950/10'
                          : item.delayLevel === 'critico'
                            ? 'bg-red-50/20 dark:bg-red-950/10'
                            : ''
                      }`}
                    >
                      {/* Patient & Record */}
                      <td className="py-3 px-4 min-w-[200px]">
                        <button
                          type="button"
                          onClick={() => onOpenInspector(patientKey)}
                          className="font-bold text-slate-900 dark:text-slate-100 hover:text-teal-700 dark:hover:text-teal-400 text-left truncate block max-w-[240px]"
                        >
                          {r.nombre || 'PACIENTE'}
                        </button>
                        <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          Exp: {r.exp || 'S/E'} · Ingreso: {r.ing || '-'}
                        </span>
                      </td>

                      {/* Location */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.servicio}
                        </span>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Cama {r.cama || 'S/C'}
                        </div>
                      </td>

                      {/* IAAS & Device */}
                      <td className="py-3 px-3 min-w-[180px]">
                        <span className="font-medium text-slate-900 dark:text-slate-100 block">
                          {item.tipoIaas}
                        </span>
                        <span className="text-[11px] text-slate-500 line-clamp-1">
                          {item.dispositivo}
                        </span>
                      </td>

                      {/* Microbiology */}
                      <td className="py-3 px-3 min-w-[180px]">
                        {r.micro ? (
                          <div className="text-teal-800 dark:text-teal-300 font-medium">
                            {r.micro}
                            {r.res && <span className="text-slate-500 block text-[10px]">{r.res}</span>}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Sin aislamiento</span>
                        )}
                      </td>

                      {/* Delay */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold tabular-nums ${
                            item.delayLevel === 'critico'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300'
                              : item.delayLevel === 'alerta'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{item.diasRetraso}d</span>
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Det: {r.det || '-'}
                        </span>
                      </td>

                      {/* Category & Status */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 block w-fit">
                          {item.categoryLabel}
                        </span>
                        {item.marcadoCapturado && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5 block">
                            ✓ Gestionado
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => handleCopyClipboard(item)}
                            className={`p-1.5 rounded-md text-xs font-semibold transition-colors ${
                              isCopied
                                ? 'bg-emerald-700 text-white'
                                : 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 hover:bg-teal-100'
                            }`}
                            title="Copiar ficha de captura RHOVE"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleMarkAsCaptured(item)}
                            className={`p-1.5 rounded-md text-xs transition-colors ${
                              item.marcadoCapturado
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200'
                            }`}
                            title="Marcar capturado en RHOVE"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setJustificationModal({
                                open: true,
                                item,
                                text: item.justificacionExistente || '',
                                saving: false,
                              })
                            }
                            className="p-1.5 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 hover:bg-slate-200"
                            title="Documentar justificación"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenInspector(patientKey)}
                            className="p-1.5 rounded-md text-xs text-teal-700 dark:text-teal-400 hover:bg-slate-100"
                            title="Abrir expediente completo"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Modal for Documenting Justification / Cause */}
      {justificationModal.open && justificationModal.item && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Registrar justificación de no notificación
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Paciente: <strong className="text-slate-800 dark:text-slate-200">{justificationModal.item.event.nombre}</strong> (Cama {justificationModal.item.event.cama})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJustificationModal({ open: false, item: null, text: '', saving: false })}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Causas clínicas frecuentes (haz clic para seleccionar):
              </label>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {COMMON_JUSTIFICATIONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setJustificationModal((prev) => ({ ...prev, text: reason }))}
                    className="p-2 rounded-lg text-left text-xs bg-slate-50 hover:bg-teal-50 dark:bg-slate-900/60 dark:hover:bg-teal-950/40 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                  >
                    • {reason}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Texto de la justificación o nota de seguimiento:
              </label>
              <textarea
                value={justificationModal.text}
                onChange={(e) => setJustificationModal((prev) => ({ ...prev, text: e.target.value }))}
                rows={3}
                placeholder="Escribe la razón por la que no se ha capturado en RHOVE o el plan de resolución…"
                className="w-full p-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-700"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setJustificationModal({ open: false, item: null, text: '', saving: false })}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={justificationModal.saving || !justificationModal.text.trim()}
                onClick={handleSaveJustification}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-50 transition-colors shadow-2xs"
              >
                {justificationModal.saving ? 'Guardando…' : 'Guardar justificación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
