import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowRight,
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  RotateCcw,
  TableProperties,
  TrendingUp,
} from 'lucide-react';
import {
  BulletinState,
  CodecinSnapshot,
  OutbreakCluster,
  QueueTabId,
} from '../../types/clinical';
import {
  computeCodecinAnalytics,
  ensureFullHistoricalBaseline,
  exportCodecinWorkbook,
  loadCodecinSnapshots,
  saveCodecinSnapshotFromAnalytics,
} from '../../domain/codecinMetrics';
import {
  buildIaasTrendAnalysis,
  CodecinPeriodFilter,
  DEFAULT_CODECIN_PERIOD_FILTER,
  describeActivePeriodFilter,
  extractPeriodCatalog,
  IaasTrendPoint,
  matchesCodecinPeriodFilter,
  QuarterFilter,
  QuickWindowPreset,
  TimeGranularity,
} from '../../domain/iaasTrends';
import { fmtFull } from '../../domain/dates';
import { IaasTrendsDashboard } from './IaasTrendsDashboard';
import { MonthlyStatisticalSummary } from './MonthlyStatisticalSummary';

export type CodecinViewMode = 'dashboard' | 'monthly_summary' | 'tables';

interface CodecinSectionProps {
  bulletin: BulletinState;
  outbreakIds: Set<string>;
  clusters: OutbreakCluster[];
  identicalClusters: OutbreakCluster[];
  canWrite: boolean;
  darkMode: boolean;
  externalSnapshots?: CodecinSnapshot[] | null;
  onSyncSnapshots?: (next: CodecinSnapshot[]) => Promise<void> | void;
  onNavigateToService: (service: string) => void;
  onNavigateToQueue: (tab: QueueTabId) => void;
  onNavigateToOutbreaks: () => void;
  onNotify: (msg: string) => void;
}

export function CodecinSection({
  bulletin,
  outbreakIds,
  clusters,
  identicalClusters,
  canWrite,
  darkMode,
  externalSnapshots,
  onSyncSnapshots,
  onNavigateToService,
  onNavigateToQueue,
  onNavigateToOutbreaks,
  onNotify,
}: CodecinSectionProps) {
  const [localSnapshots, setLocalSnapshots] = useState<CodecinSnapshot[]>(() =>
    loadCodecinSnapshots()
  );

  const snapshots = useMemo(
    () =>
      externalSnapshots && externalSnapshots.length > 0
        ? ensureFullHistoricalBaseline(externalSnapshots)
        : localSnapshots,
    [externalSnapshots, localSnapshots]
  );

  const [viewMode, setViewMode] = useState<CodecinViewMode>('dashboard');
  const [periodFilter, setPeriodFilter] = useState<CodecinPeriodFilter>(
    DEFAULT_CODECIN_PERIOD_FILTER
  );
  const [includeLiveCut, setIncludeLiveCut] = useState<boolean>(true);
  const [selectedSite, setSelectedSite] = useState<string>('');
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [highlightedCutIds, setHighlightedCutIds] = useState<Set<string>>(
    () => new Set(['live-current-cut'])
  );

  const [archiveLabel, setArchiveLabel] = useState('');
  const [showArchiveInput, setShowArchiveInput] = useState(false);

  const analytics = useMemo(
    () =>
      computeCodecinAnalytics({
        bulletin,
        outbreakIds,
        clusters,
        identicalClusters,
      }),
    [bulletin, outbreakIds, clusters, identicalClusters]
  );

  const periodCatalog = useMemo(
    () => extractPeriodCatalog(snapshots, bulletin.corte, includeLiveCut && !bulletin.empty),
    [snapshots, bulletin.corte, bulletin.empty, includeLiveCut]
  );

  const trendAnalysis = useMemo(
    () =>
      buildIaasTrendAnalysis({
        snapshots,
        corte: bulletin.corte,
        liveAnalytics: analytics,
        bulletin,
        outbreakIds,
        periodFilter,
        selectedSite,
        selectedService,
        includeLiveCut,
      }),
    [
      snapshots,
      bulletin,
      outbreakIds,
      analytics,
      periodFilter,
      selectedSite,
      selectedService,
      includeLiveCut,
    ]
  );

  const filteredTableSnapshots = useMemo(
    () =>
      snapshots.filter((s) =>
        matchesCodecinPeriodFilter(s.corte, periodFilter, periodCatalog.maxMonth)
      ),
    [snapshots, periodFilter, periodCatalog.maxMonth]
  );

  const liveSnapshot: CodecinSnapshot | null = useMemo(() => {
    if (bulletin.empty || !bulletin.corte) return null;
    const porSitio: Record<string, number> = {};
    analytics.bySite.forEach((s) => {
      porSitio[s.shortCode] = s.total;
    });
    const porServicio: Record<string, number> = {};
    analytics.byService.forEach((s) => {
      porServicio[s.service] = s.activeIaas;
    });
    return {
      id: 'live-current-cut',
      corte: bulletin.corte,
      etiqueta: `Corte en vivo (${fmtFull(bulletin.corte)})`,
      creadoEn: `${bulletin.corte}T12:00:00.000Z`,
      totalIaas: analytics.totalActiveIaas,
      capturadasRhove: analytics.rhoveCapturedCount,
      urgentes: analytics.urgentPendingCount,
      brotesActivos: analytics.activeClustersCount,
      clustersIdenticos: analytics.identicalClustersCount,
      bleeCount: analytics.bleeCount,
      carbapenemResistantCount: analytics.carbapenemResistantCount,
      defuncionesConIaas: analytics.closedDeathsCount,
      porSitio,
      porServicio,
    };
  }, [bulletin.empty, bulletin.corte, analytics]);

  const showLiveCutInTable =
    includeLiveCut &&
    !bulletin.empty &&
    matchesCodecinPeriodFilter(bulletin.corte, periodFilter, periodCatalog.maxMonth);

  const isCustomPeriodActive =
    periodFilter.granularity !== DEFAULT_CODECIN_PERIOD_FILTER.granularity ||
    periodFilter.year !== DEFAULT_CODECIN_PERIOD_FILTER.year ||
    periodFilter.quarter !== DEFAULT_CODECIN_PERIOD_FILTER.quarter ||
    periodFilter.preset !== DEFAULT_CODECIN_PERIOD_FILTER.preset ||
    Boolean(periodFilter.startMonth || periodFilter.endMonth) ||
    !includeLiveCut;

  const handleGranularityChange = (nextGranularity: TimeGranularity) => {
    setPeriodFilter((prev) => ({
      ...prev,
      granularity: nextGranularity,
      // When switching to Trimestres or Años, expand rolling window to 'all' unless custom range is set
      preset:
        nextGranularity !== 'month' && (prev.preset === '6m' || prev.preset === '12m')
          ? 'all'
          : nextGranularity === 'month' && prev.preset === 'all' && prev.year === 'all'
            ? '12m'
            : prev.preset,
    }));
  };

  const handleYearChange = (nextYear: string) => {
    setPeriodFilter((prev) => ({
      ...prev,
      year: nextYear,
      preset: prev.preset === 'custom' ? 'all' : prev.preset,
      startMonth: '',
      endMonth: '',
    }));
  };

  const handleQuarterChange = (nextQuarter: QuarterFilter) => {
    setPeriodFilter((prev) => ({
      ...prev,
      quarter: nextQuarter,
      preset: nextQuarter !== 'all' && prev.preset !== 'custom' ? 'all' : prev.preset,
    }));
  };

  const handlePresetChange = (nextPreset: QuickWindowPreset) => {
    setPeriodFilter((prev) => {
      if (nextPreset === 'custom') {
        const defaultStart =
          prev.startMonth ||
          periodCatalog.availableMonths[Math.max(0, periodCatalog.availableMonths.length - 6)]
            ?.ym ||
          periodCatalog.minMonth;
        const defaultEnd = prev.endMonth || periodCatalog.maxMonth;
        return {
          ...prev,
          year: 'all',
          quarter: 'all',
          preset: 'custom',
          startMonth: defaultStart,
          endMonth: defaultEnd,
        };
      }
      return {
        ...prev,
        preset: nextPreset,
        startMonth: '',
        endMonth: '',
      };
    });
  };

  const handleResetPeriod = () => {
    setPeriodFilter(DEFAULT_CODECIN_PERIOD_FILTER);
    setIncludeLiveCut(true);
  };

  const handleSaveSnapshot = () => {
    const updated = saveCodecinSnapshotFromAnalytics(
      bulletin.corte,
      archiveLabel,
      analytics
    );
    setLocalSnapshots(updated);
    if (onSyncSnapshots) {
      void onSyncSnapshots(updated);
    }
    const newest = updated[updated.length - 1];
    if (newest) {
      setSelectedPointId(newest.id);
      setHighlightedCutIds(new Set([newest.id]));
    }
    setArchiveLabel('');
    setShowArchiveInput(false);
    onNotify('Corte archivado en la serie histórica CODECIN y actualizado en el dashboard');
  };

  const handleExportWorkbook = () => {
    exportCodecinWorkbook(
      bulletin.corte,
      analytics,
      filteredTableSnapshots.length > 0 ? filteredTableSnapshots : snapshots
    );
    onNotify('Informe ejecutivo CODECIN y serie histórica (.xlsx) descargado');
  };

  const handleOpenCodecinTableForPoint = (point: IaasTrendPoint) => {
    setSelectedPointId(point.id);
    setHighlightedCutIds(new Set(point.memberCutIds));
    setViewMode('tables');
  };

  const handleInspectCutInDashboard = (snap: CodecinSnapshot | 'live-current-cut') => {
    setHighlightedCutIds(new Set([typeof snap === 'string' ? snap : snap.id]));
    if (periodFilter.granularity !== 'month') {
      setPeriodFilter((prev) => ({ ...prev, granularity: 'month' }));
    }
    setSelectedPointId(typeof snap === 'string' ? snap : snap.id);
    setViewMode('dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFocusPeakPoint = (point: IaasTrendPoint) => {
    setSelectedPointId(point.id);
    setHighlightedCutIds(new Set(point.memberCutIds));
    if (viewMode !== 'dashboard') {
      setViewMode('dashboard');
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Unified Header: Dashboard de Tendencias <-> Indicadores CODECIN */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Dashboard de tendencias IAAS e indicadores CODECIN
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Análisis histórico longitudinal por meses, trimestres y años para identificar picos de
            incidencia con precisión y respaldar las sesiones del comité CODECIN.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Connected Mode Toggle: Visual Trends Dashboard <-> Executive CODECIN Tables */}
          <div
            role="group"
            aria-label="Vista de indicadores CODECIN"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800"
          >
            <button
              type="button"
              onClick={() => setViewMode('dashboard')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'dashboard'
                  ? 'bg-white dark:bg-[#111726] text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>Dashboard de tendencias</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('monthly_summary')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'monthly_summary'
                  ? 'bg-white dark:bg-[#111726] text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>Resumen estadístico mensual</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('tables')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                viewMode === 'tables'
                  ? 'bg-white dark:bg-[#111726] text-teal-800 dark:text-teal-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <TableProperties className="w-4 h-4 shrink-0" />
              <span>Tablas e informe CODECIN</span>
            </button>
          </div>

          {canWrite && !showArchiveInput && (
            <button
              type="button"
              onClick={() => setShowArchiveInput(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Archive className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Archivar corte</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportWorkbook}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>Exportar CODECIN (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Shared Inline Snapshot Archiver */}
      {showArchiveInput && (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <input
            type="text"
            value={archiveLabel}
            onChange={(e) => setArchiveLabel(e.target.value)}
            placeholder={`Ej. Sesión ordinaria CODECIN (${fmtFull(bulletin.corte)})`}
            className="flex-1 min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
          />
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveSnapshot}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold whitespace-nowrap"
            >
              Guardar en serie histórica
            </button>
            <button
              type="button"
              onClick={() => setShowArchiveInput(false)}
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Time Period Selector (Months / Quarters / Years + Date Window + Peak Incidence Detector) */}
      {viewMode !== 'monthly_summary' && (
        <section
          aria-label="Selector de periodo epidemiológico"
          className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden"
        >
        <div className="p-4 flex flex-col gap-3.5">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mr-0.5">
                <CalendarRange className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span>Periodo:</span>
              </span>

              {/* 1. Granularity Switcher: Meses | Trimestres | Años */}
              <div
                role="group"
                aria-label="Agrupación temporal"
                className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-800"
              >
                {(
                  [
                    { id: 'month', label: 'Meses' },
                    { id: 'quarter', label: 'Trimestres' },
                    { id: 'year', label: 'Años' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleGranularityChange(item.id)}
                    className={`min-h-[32px] px-3 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                      periodFilter.granularity === item.id
                        ? 'bg-white dark:bg-[#111726] text-teal-800 dark:text-teal-300 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* 2. Year Selector */}
              <select
                aria-label="Filtrar por año"
                value={periodFilter.year}
                onChange={(e) => handleYearChange(e.target.value)}
                className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="all">Todos los años</option>
                {periodCatalog.availableYears.map((yr) => (
                  <option key={yr} value={yr}>
                    Año {yr}
                  </option>
                ))}
              </select>

              {/* 3. Quarter Selector (Seasonal / Quarterly Comparison) */}
              {periodFilter.granularity !== 'year' && (
                <select
                  aria-label="Filtrar por trimestre"
                  value={periodFilter.quarter}
                  onChange={(e) => handleQuarterChange(e.target.value as QuarterFilter)}
                  className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  <option value="all">Todos los trimestres</option>
                  <option value="Q1">T1 · Ene–Mar</option>
                  <option value="Q2">T2 · Abr–Jun</option>
                  <option value="Q3">T3 · Jul–Sep</option>
                  <option value="Q4">T4 · Oct–Dic</option>
                </select>
              )}

              {/* 4. Quick Horizon / Custom Range Presets */}
              <div
                role="group"
                aria-label="Horizonte de ventana temporal"
                className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-800"
              >
                {(
                  [
                    { id: '6m', label: '6 meses' },
                    { id: '12m', label: '12 meses' },
                    { id: 'all', label: 'Todo' },
                    { id: 'custom', label: 'Rango' },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetChange(preset.id)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                      periodFilter.preset === preset.id &&
                      (preset.id === 'custom' ||
                        (periodFilter.year === 'all' && periodFilter.quarter === 'all'))
                        ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
              {!bulletin.empty && (
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={includeLiveCut}
                    onChange={(e) => setIncludeLiveCut(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>Incluir corte activo ({fmtFull(bulletin.corte)})</span>
                </label>
              )}

              {isCustomPeriodActive && (
                <button
                  type="button"
                  onClick={handleResetPeriod}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restablecer periodo</span>
                </button>
              )}
            </div>
          </div>

          {/* Custom Month-to-Month Range Pickers */}
          {periodFilter.preset === 'custom' && (
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs">
              <span className="font-medium text-slate-600 dark:text-slate-400">
                Intervalo personalizado:
              </span>
              <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span>Desde</span>
                <select
                  aria-label="Mes inicial"
                  value={periodFilter.startMonth}
                  onChange={(e) => {
                    const nextStart = e.target.value;
                    setPeriodFilter((prev) => ({
                      ...prev,
                      startMonth: nextStart,
                      endMonth:
                        prev.endMonth && nextStart && prev.endMonth < nextStart
                          ? nextStart
                          : prev.endMonth,
                    }));
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                >
                  {periodCatalog.availableMonths.map((m) => (
                    <option key={m.ym} value={m.ym}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="inline-flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span>Hasta</span>
                <select
                  aria-label="Mes final"
                  value={periodFilter.endMonth}
                  onChange={(e) => {
                    const nextEnd = e.target.value;
                    setPeriodFilter((prev) => ({
                      ...prev,
                      endMonth: nextEnd,
                      startMonth:
                        prev.startMonth && nextEnd && prev.startMonth > nextEnd
                          ? nextEnd
                          : prev.startMonth,
                    }));
                  }}
                  className="min-h-[34px] px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-slate-100"
                >
                  {periodCatalog.availableMonths.map((m) => (
                    <option key={m.ym} value={m.ym}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>

        {/* Live Incidence Peak Readout Bar (Synchronized with Period Selector) */}
        <div className="px-4 py-2.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/65 dark:bg-slate-900/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-slate-700 dark:text-slate-300">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {describeActivePeriodFilter(periodFilter)}
            </span>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
              {trendAnalysis.points.length}{' '}
              {periodFilter.granularity === 'year'
                ? trendAnalysis.points.length === 1
                  ? 'año'
                  : 'años'
                : periodFilter.granularity === 'quarter'
                  ? trendAnalysis.points.length === 1
                    ? 'trimestre'
                    : 'trimestres'
                  : trendAnalysis.points.length === 1
                    ? 'corte'
                    : 'cortes'}
            </span>
            {trendAnalysis.peakPoint && (
              <>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                  <TrendingUp className="w-3.5 h-3.5 text-red-700 dark:text-red-400 shrink-0" />
                  <span>
                    Pico de incidencia:{' '}
                    <strong className="font-semibold text-red-700 dark:text-red-400">
                      {trendAnalysis.peakPoint.axisLabel} ({trendAnalysis.peakPoint.focusedCases}{' '}
                      casos)
                    </strong>
                  </span>
                </span>
              </>
            )}
          </div>

          {trendAnalysis.peaksAboveThreshold.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-slate-500 dark:text-slate-400">Ir a pico:</span>
              {trendAnalysis.peaksAboveThreshold.slice(0, 4).map((pk) => (
                <button
                  key={pk.id}
                  type="button"
                  onClick={() => handleFocusPeakPoint(pk)}
                  className="px-2 py-0.5 rounded border border-red-200 dark:border-red-900/70 bg-white dark:bg-[#111726] hover:bg-red-50 dark:hover:bg-red-950/30 font-mono text-[11px] font-semibold tabular-nums text-red-700 dark:text-red-400 transition-colors"
                >
                  {pk.axisLabel} ({pk.focusedCases})
                </button>
              ))}
            </div>
          ) : (
            trendAnalysis.peakPoint && (
              <button
                type="button"
                onClick={() => {
                  if (trendAnalysis.peakPoint) handleFocusPeakPoint(trendAnalysis.peakPoint);
                }}
                className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-300 hover:underline whitespace-nowrap"
              >
                <span>Inspeccionar {trendAnalysis.peakPoint.axisLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )
          )}
        </div>
      </section>
      )}

      {viewMode === 'dashboard' ? (
        <IaasTrendsDashboard
          bulletin={bulletin}
          analysis={trendAnalysis}
          periodFilter={periodFilter}
          selectedSite={selectedSite}
          onChangeSelectedSite={setSelectedSite}
          selectedService={selectedService}
          onChangeSelectedService={setSelectedService}
          darkMode={darkMode}
          selectedPointId={selectedPointId}
          onSelectPointId={(id) => {
            setSelectedPointId(id);
            const pt = trendAnalysis.points.find((p) => p.id === id);
            if (pt) setHighlightedCutIds(new Set(pt.memberCutIds));
          }}
          onOpenCodecinTableForPoint={handleOpenCodecinTableForPoint}
          onNavigateToService={onNavigateToService}
          onNavigateToQueue={onNavigateToQueue}
          onNavigateToOutbreaks={onNavigateToOutbreaks}
        />
      ) : viewMode === 'monthly_summary' ? (
        <MonthlyStatisticalSummary
          snapshots={snapshots}
          liveCut={liveSnapshot}
          includeLiveCut={includeLiveCut}
          darkMode={darkMode}
          onNavigateToService={onNavigateToService}
          onNotify={onNotify}
        />
      ) : (
        <>
          {/* Flat 4-Column KPI Summary Strip */}
          <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800">
            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                IAAS activas en censo
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {analytics.totalActiveIaas}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {analytics.rhoveCapturedCount} ({analytics.rhoveCapturePct}%)
                </span>{' '}
                capturadas en RHOVE
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Pendientes urgentes de dictamen
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-red-700 dark:text-red-400">
                {analytics.urgentPendingCount}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Casos prioritarios sin captura RHOVE
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Fenotipos críticos de resistencia
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {analytics.bleeCount + analytics.carbapenemResistantCount}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {analytics.bleeCount} BLEE ·{' '}
                <span className="font-semibold text-amber-700 dark:text-amber-400">
                  {analytics.carbapenemResistantCount} Carbapenem-R
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Clusters microbiológicos activos
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {analytics.activeClustersCount}
              </div>
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                <span className="font-semibold text-teal-700 dark:text-teal-300">
                  {analytics.identicalClustersCount}
                </span>{' '}
                con antibiograma idéntico
              </div>
            </div>
          </div>

          {/* Main 2-Column Analytical Split: By Site & By Service */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
            {/* Distribution by IAAS Site */}
            <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Distribución por tipo de IAAS (NOM-045-SSA2)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Clasificación operativa por sitio anatómico o dispositivo invasivo asociado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewMode('dashboard')}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
                >
                  Ver curva histórica
                </button>
              </div>

              {analytics.bySite.length > 0 ? (
                <div className="flex flex-col gap-3.5">
                  {analytics.bySite.map((item) => (
                    <div key={item.shortCode} className="flex flex-col gap-1.5">
                      <div className="flex items-baseline justify-between gap-3 text-xs sm:text-sm">
                        <div className="min-w-0">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {item.shortCode}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 ml-1.5">
                            · {item.site}
                          </span>
                        </div>
                        <span className="font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200 shrink-0">
                          {item.total} ({item.pct}%) · RHOVE {item.rhoveCaptured}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-teal-700 dark:bg-teal-500 rounded-full"
                          style={{ width: `${Math.max(item.pct, 4)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                  No hay casos activos de IAAS en el corte actual.
                </p>
              )}
            </section>

            {/* Distribution by Hospital Service */}
            <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Concentración por servicio hospitalario
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Servicios ordenados por infecciones activas. Selecciona un servicio para auditar
                  su censo en Vigilancia.
                </p>
              </div>

              {analytics.byService.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-3 font-semibold">Servicio</th>
                        <th className="py-2 px-2 font-semibold text-right">IAAS</th>
                        <th className="py-2 px-2 font-semibold text-right">RHOVE</th>
                        <th className="py-2 px-2 font-semibold text-right">Urgentes</th>
                        <th className="py-2 pl-2 font-semibold text-right">Cluster</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {analytics.byService.map((svc) => (
                        <tr
                          key={svc.service}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                            <button
                              type="button"
                              onClick={() => onNavigateToService(svc.service)}
                              className="inline-flex items-center gap-1 hover:text-teal-700 dark:hover:text-teal-300 transition-colors text-left"
                            >
                              <span>{svc.service}</span>
                              <ArrowRight className="w-3 h-3 opacity-60 shrink-0" />
                            </button>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                            {svc.activeIaas}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {svc.rhoveCaptured}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {svc.urgentPending > 0 ? (
                              <span className="font-semibold text-red-700 dark:text-red-400">
                                {svc.urgentPending}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="py-2.5 pl-2 text-right font-mono tabular-nums">
                            {svc.outbreakLinked > 0 ? (
                              <span className="font-semibold text-amber-700 dark:text-amber-400">
                                {svc.outbreakLinked}
                              </span>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                  Sin servicios con IAAS activas en este corte.
                </p>
              )}
            </section>
          </div>

          {/* Microbiological Resistance Profile Table */}
          <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Aislamientos microbiológicos y vigilancia de resistencia antimicrobiana
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Patógenos identificados en eventos activos y frecuencia de betalactamasas de
                espectro extendido (BLEE) o resistencia a carbapenémicos.
              </p>
            </div>

            {analytics.byOrganism.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-semibold">Microorganismo</th>
                      <th className="py-2 px-3 font-semibold text-right">Aislamientos</th>
                      <th className="py-2 px-3 font-semibold text-right">Fenotipo BLEE</th>
                      <th className="py-2 px-3 font-semibold text-right">Carbapenem-R</th>
                      <th className="py-2 pl-3 font-semibold">Servicios involucrados</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {analytics.byOrganism.map((org) => (
                      <tr
                        key={org.organism}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      >
                        <td className="py-2.5 pr-3 italic font-semibold text-slate-900 dark:text-slate-100">
                          {org.organism}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                          {org.isolates}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {org.blee > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              {org.blee}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {org.carbapenemR > 0 ? (
                            <span className="font-semibold text-red-700 dark:text-red-400">
                              {org.carbapenemR}
                            </span>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </td>
                        <td className="py-2.5 pl-3 text-xs text-slate-600 dark:text-slate-400">
                          {org.services.join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No se registran microorganismos aislados en eventos activos.
              </p>
            )}
          </section>

          {/* Bottom Split: Historical Series (Filtered by Period Selector) & Closed Episode Outcomes */}
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5 items-stretch">
            <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Serie histórica de cortes ({filteredTableSnapshots.length} en periodo activo)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Filtrada por el selector de periodo superior. Haz clic en Inspeccionar para
                    abrir cualquier corte en el Dashboard.
                  </p>
                </div>
                <FileSpreadsheet className="w-4 h-4 text-slate-400 shrink-0" />
              </div>

              <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs sm:text-sm">
                  <thead className="sticky top-0 bg-white dark:bg-[#111726]">
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-semibold">Periodo / Corte</th>
                      <th className="py-2 px-2 font-semibold text-right">IAAS</th>
                      <th className="py-2 px-2 font-semibold text-right">RHOVE</th>
                      <th className="py-2 px-2 font-semibold text-right">Clusters</th>
                      <th className="py-2 px-2 font-semibold text-right">BLEE</th>
                      <th className="py-2 px-2 font-semibold text-right">Carb-R</th>
                      <th className="py-2 pl-2 font-semibold text-right">Gráfica</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {filteredTableSnapshots.map((snap) => {
                      const isHighlighted = highlightedCutIds.has(snap.id);
                      return (
                        <tr
                          key={snap.id}
                          className={
                            isHighlighted
                              ? 'bg-teal-50/70 dark:bg-teal-950/30'
                              : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                          }
                        >
                          <td className="py-2.5 pr-3">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {snap.etiqueta}
                            </div>
                            <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                              {fmtFull(snap.corte)}
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-semibold tabular-nums">
                            {snap.totalIaas}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                            {snap.capturadasRhove}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {snap.brotesActivos}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                            {snap.bleeCount}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono tabular-nums text-red-700 dark:text-red-400">
                            {snap.carbapenemResistantCount}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <button
                              type="button"
                              onClick={() => handleInspectCutInDashboard(snap)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                            >
                              <span>Inspeccionar</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Live Current Cut Row */}
                    {showLiveCutInTable && (
                      <tr
                        className={`font-semibold ${
                          highlightedCutIds.has('live-current-cut')
                            ? 'bg-teal-100/60 dark:bg-teal-950/40'
                            : 'bg-teal-50/50 dark:bg-teal-950/20'
                        }`}
                      >
                        <td className="py-2.5 pr-3">
                          <div className="text-teal-900 dark:text-teal-200">
                            Corte activo en pantalla
                          </div>
                          <div className="font-mono text-[11px] tabular-nums text-teal-700 dark:text-teal-400">
                            {fmtFull(bulletin.corte)}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {analytics.totalActiveIaas}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {analytics.rhoveCapturedCount}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {analytics.activeClustersCount}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {analytics.bleeCount}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-red-700 dark:text-red-400">
                          {analytics.carbapenemResistantCount}
                        </td>
                        <td className="py-2.5 pl-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleInspectCutInDashboard('live-current-cut')}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 dark:text-teal-300 hover:underline whitespace-nowrap"
                          >
                            <span>Inspeccionar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    )}
                    {filteredTableSnapshots.length === 0 && !showLiveCutInTable && (
                      <tr>
                        <td
                          colSpan={7}
                          className="py-6 text-center text-sm text-slate-500 dark:text-slate-400"
                        >
                          Sin cortes registrados en el periodo seleccionado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Closed Episode Outcomes */}
            <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Desenlace de seguimientos cerrados
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Motivos de cierre registrados en el concentrado histórico (
                  {bulletin.cerrados.length} episodios).
                </p>
              </div>

              {analytics.outcomes.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {analytics.outcomes.map((o) => (
                    <div
                      key={o.outcome}
                      className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800/70 last:border-0 text-sm"
                    >
                      <span
                        className={
                          o.outcome === 'Defunción'
                            ? 'font-semibold text-red-700 dark:text-red-400'
                            : 'text-slate-800 dark:text-slate-200 font-medium'
                        }
                      >
                        {o.outcome}
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                        {o.count} ({o.pct}%)
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No hay episodios cerrados registrados en este archivo.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
