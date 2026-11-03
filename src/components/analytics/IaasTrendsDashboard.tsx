import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Minus,
  RotateCcw,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BulletinState, QueueTabId } from '../../types/clinical';
import {
  CodecinPeriodFilter,
  DecisionFinding,
  IaasTrendAnalysis,
  IaasTrendPoint,
} from '../../domain/iaasTrends';
import { fmtFull } from '../../domain/dates';

interface IaasTrendsDashboardProps {
  bulletin: BulletinState;
  analysis: IaasTrendAnalysis;
  periodFilter: CodecinPeriodFilter;
  selectedSite: string;
  onChangeSelectedSite: (site: string) => void;
  selectedService: string;
  onChangeSelectedService: (service: string) => void;
  darkMode: boolean;
  selectedPointId: string | null;
  onSelectPointId: (pointId: string) => void;
  onOpenCodecinTableForPoint: (point: IaasTrendPoint) => void;
  onNavigateToService: (service: string) => void;
  onNavigateToQueue: (tab: QueueTabId) => void;
  onNavigateToOutbreaks: () => void;
}

interface CustomTooltipEntry {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
  payload?: Record<string, unknown>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<CustomTooltipEntry>;
  label?: string | number;
  unitSuffix?: string;
}

function ChartTooltipBox({ active, payload, label, unitSuffix = '' }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const pt = payload[0]?.payload as Partial<IaasTrendPoint> | undefined;

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/98 dark:bg-[#0D1320]/98 px-3.5 py-2.5 shadow-md text-xs max-w-[280px]">
      <div className="font-semibold text-slate-900 dark:text-slate-100">
        {pt?.etiqueta || String(label ?? '')}
      </div>
      {pt?.isMaxPeak ? (
        <div className="text-[11px] font-semibold text-red-700 dark:text-red-400 mt-0.5">
          Pico máximo del periodo seleccionado
        </div>
      ) : pt?.isEpidemicPeak ? (
        <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
          Supera umbral histórico (+1 DE)
        </div>
      ) : pt?.corte && (pt.cutsCount ?? 1) === 1 ? (
        <div className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
          Corte {fmtFull(pt.corte)}
        </div>
      ) : null}

      <div className="flex flex-col gap-1 pt-1.5 mt-1.5 border-t border-slate-100 dark:border-slate-800">
        {payload.map((entry, idx) => (
          <div
            key={`${entry.dataKey || entry.name || idx}`}
            className="flex items-center justify-between gap-4"
          >
            <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 truncate">
              <span
                className="w-2 h-2 rounded-xs shrink-0"
                style={{ backgroundColor: entry.color || '#0F766E' }}
              />
              <span className="truncate">{entry.name}</span>
            </span>
            <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100 shrink-0">
              {entry.value}
              {unitSuffix}
            </span>
          </div>
        ))}
      </div>

      {pt && (pt.cutsCount ?? 1) > 1 && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400 flex flex-col gap-0.5">
          <span>Promedio por corte: {pt.avgPerCutCases}</span>
          <span>Pico mensual interno: {pt.maxSingleCutCases}</span>
        </div>
      )}
      {pt?.dominantSite && (
        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Predominio: {pt.dominantSite.code} ({pt.dominantSite.count})
          {pt.dominantService ? ` · ${pt.dominantService.service}` : ''}
        </div>
      )}
    </div>
  );
}

const SITE_SERIES_CONFIG = [
  {
    code: 'NAV / Neumonía',
    dataKey: 'site_nav',
    shortLabel: 'NAV / Neumonía',
    lightColor: '#0F766E',
    darkColor: '#2DD4BF',
  },
  {
    code: 'ITS-CC',
    dataKey: 'site_itscc',
    shortLabel: 'ITS-CC',
    lightColor: '#1D4ED8',
    darkColor: '#60A5FA',
  },
  {
    code: 'IVU-CA',
    dataKey: 'site_ivuca',
    shortLabel: 'IVU-CA',
    lightColor: '#B45309',
    darkColor: '#FBBF24',
  },
  {
    code: 'ISQ',
    dataKey: 'site_isq',
    shortLabel: 'ISQ',
    lightColor: '#6D28D9',
    darkColor: '#A78BFA',
  },
  {
    code: 'ITS-Lab',
    dataKey: 'site_itslab',
    shortLabel: 'ITS-Lab',
    lightColor: '#0E7490',
    darkColor: '#22D3EE',
  },
  {
    code: 'Otras IAAS',
    dataKey: 'site_otras',
    shortLabel: 'Otras IAAS',
    lightColor: '#64748B',
    darkColor: '#94A3B8',
  },
] as const;

const SERVICE_LINE_PALETTE = [
  { light: '#0F766E', dark: '#2DD4BF' },
  { light: '#1D4ED8', dark: '#60A5FA' },
  { light: '#B45309', dark: '#FBBF24' },
  { light: '#BE123C', dark: '#FB7185' },
  { light: '#6D28D9', dark: '#A78BFA' },
];

export function IaasTrendsDashboard({
  analysis,
  periodFilter,
  selectedSite,
  onChangeSelectedSite,
  selectedService,
  onChangeSelectedService,
  darkMode,
  selectedPointId,
  onSelectPointId,
  onOpenCodecinTableForPoint,
  onNavigateToService,
  onNavigateToQueue,
  onNavigateToOutbreaks,
}: IaasTrendsDashboardProps) {
  const [siteChartMode, setSiteChartMode] = useState<'stacked' | 'grouped'>('stacked');
  const [rightPanelMetric, setRightPanelMetric] = useState<'amr' | 'rhove'>('amr');

  useEffect(() => {
    if (analysis.points.length === 0) return;
    const exists = selectedPointId && analysis.points.some((p) => p.id === selectedPointId);
    if (!exists) {
      onSelectPointId(analysis.points[analysis.points.length - 1].id);
    }
  }, [analysis.points, selectedPointId, onSelectPointId]);

  const activeInspectedIndex = useMemo(() => {
    if (analysis.points.length === 0) return -1;
    const found = analysis.points.findIndex((p) => p.id === selectedPointId);
    return found >= 0 ? found : analysis.points.length - 1;
  }, [analysis.points, selectedPointId]);

  const inspectedPoint =
    activeInspectedIndex >= 0 ? analysis.points[activeInspectedIndex] : null;
  const inspectedPrevPoint =
    activeInspectedIndex > 0 ? analysis.points[activeInspectedIndex - 1] : null;

  const serviceLineData = useMemo(() => {
    return analysis.points.map((pt) => {
      const row: Record<string, string | number | boolean> = {
        id: pt.id,
        axisLabel: pt.axisLabel,
        etiqueta: pt.etiqueta,
        corte: pt.corte,
        cutsCount: pt.cutsCount,
        avgPerCutCases: pt.avgPerCutCases,
        maxSingleCutCases: pt.maxSingleCutCases,
      };
      analysis.topServices.forEach((svc) => {
        row[svc] = pt.porServicio[svc] || 0;
      });
      return row;
    });
  }, [analysis.points, analysis.topServices]);

  const hasClinicalFilter = Boolean(selectedSite || selectedService);

  const gridStroke = darkMode ? '#1E293B' : '#E2E8F0';
  const axisTickFill = darkMode ? '#94A3B8' : '#64748B';
  const primaryColor = darkMode ? '#2DD4BF' : '#0F766E';
  const rhoveColor = darkMode ? '#34D399' : '#059669';
  const movingAvgColor = darkMode ? '#CBD5E1' : '#334155';
  const alertLineColor = darkMode ? '#F87171' : '#DC2626';
  const peakDotStroke = darkMode ? '#090D16' : '#FFFFFF';
  const carbColor = darkMode ? '#F87171' : '#DC2626';
  const bleeColor = darkMode ? '#FBBF24' : '#D97706';

  const handleFindingAction = (finding: DecisionFinding) => {
    if (!finding.actionTarget) return;
    if (finding.actionTarget.kind === 'service') {
      onNavigateToService(finding.actionTarget.service);
    } else if (finding.actionTarget.kind === 'queue') {
      onNavigateToQueue(finding.actionTarget.tab);
    } else if (finding.actionTarget.kind === 'outbreaks') {
      onNavigateToOutbreaks();
    } else if (finding.actionTarget.kind === 'focus-period') {
      onSelectPointId(finding.actionTarget.pointId);
    } else if (finding.actionTarget.kind === 'codecin-table' && inspectedPoint) {
      onOpenCodecinTableForPoint(inspectedPoint);
    }
  };

  const scopeTitle =
    selectedSite && selectedService
      ? `${selectedSite} en ${selectedService}`
      : selectedSite
        ? `Sitio: ${selectedSite}`
        : selectedService
          ? `Servicio: ${selectedService}`
          : 'Total hospitalario de IAAS';

  const unitPeriodNoun =
    periodFilter.granularity === 'year'
      ? 'año'
      : periodFilter.granularity === 'quarter'
        ? 'trimestre'
        : 'corte';

  return (
    <div className="flex flex-col gap-5">
      {/* Clinical Dimension Focus Strip (Site & Service Drill-down) */}
      <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Enfoque clínico:
          </span>

          <select
            aria-label="Filtrar tendencia por tipo de IAAS"
            value={selectedSite}
            onChange={(e) => onChangeSelectedSite(e.target.value)}
            className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="">Todos los sitios NOM-045</option>
            {analysis.availableSites.map((site) => (
              <option key={site} value={site}>
                {site}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar tendencia por servicio hospitalario"
            value={selectedService}
            onChange={(e) => onChangeSelectedService(e.target.value)}
            className="min-h-[36px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-200"
          >
            <option value="">Todos los servicios</option>
            {analysis.availableServices.map((svc) => (
              <option key={svc} value={svc}>
                {svc}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          {analysis.peaksAboveThreshold.length > 0 && (
            <span className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <strong className="font-semibold text-red-700 dark:text-red-400">
                {analysis.peaksAboveThreshold.length}
              </strong>{' '}
              pico{analysis.peaksAboveThreshold.length === 1 ? '' : 's'} &gt; umbral (
              {analysis.alertThreshold})
            </span>
          )}

          {hasClinicalFilter && (
            <button
              type="button"
              onClick={() => {
                onChangeSelectedSite('');
                onChangeSelectedService('');
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar enfoque clínico</span>
            </button>
          )}
        </div>
      </div>

      {/* 4-Column Longitudinal & Peak Detection KPI Strip */}
      <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x-0 sm:divide-x divide-slate-200/80 dark:divide-slate-800">
        {/* KPI 1: Latest Period IAAS & Delta */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
            {selectedSite || selectedService
              ? `Último ${unitPeriodNoun} (${scopeTitle})`
              : `IAAS en último ${unitPeriodNoun}`}
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {analysis.latestPoint?.focusedCases ?? 0}
            </span>
            {analysis.previousPoint && (
              <span
                className={`inline-flex items-center gap-0.5 font-mono text-xs font-semibold tabular-nums ${
                  analysis.deltaCasesVsPrev > 0
                    ? 'text-red-700 dark:text-red-400'
                    : analysis.deltaCasesVsPrev < 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {analysis.deltaCasesVsPrev > 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : analysis.deltaCasesVsPrev < 0 ? (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
                {analysis.deltaCasesVsPrev > 0
                  ? `+${analysis.deltaCasesVsPrev}`
                  : analysis.deltaCasesVsPrev}
                {analysis.deltaPctVsPrev != null
                  ? ` (${analysis.deltaPctVsPrev > 0 ? '+' : ''}${analysis.deltaPctVsPrev}%)`
                  : ''}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            Media: {analysis.historicalMean} · Móvil 3p: {analysis.latestPoint?.movingAvg3 ?? 0}
          </div>
        </div>

        {/* KPI 2: Peak Incidence Identifier in Active Period */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Pico máximo del periodo</span>
            {analysis.peakPoint && (
              <button
                type="button"
                onClick={() => {
                  if (analysis.peakPoint) onSelectPointId(analysis.peakPoint.id);
                }}
                className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline"
              >
                Enfocar
              </button>
            )}
          </div>
          {analysis.peakPoint ? (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-red-700 dark:text-red-400">
                  {analysis.peakPoint.focusedCases}
                </span>
                <span className="font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  en {analysis.peakPoint.axisLabel}
                </span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400 truncate tabular-nums">
                {analysis.peakPoint.excessOverMean > 0
                  ? `+${analysis.peakPoint.excessOverMean} vs media`
                  : 'Nivel basal'}{' '}
                {analysis.peakPoint.dominantSite
                  ? `· ${analysis.peakPoint.dominantSite.code}`
                  : ''}
              </div>
            </>
          ) : (
            <div className="text-sm text-slate-500 dark:text-slate-400">Sin datos en rango</div>
          )}
        </div>

        {/* KPI 3: RHOVE Capture Trend */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Cobertura de captura RHOVE
          </div>
          <div className="flex items-baseline gap-2.5">
            <span
              className={`font-mono text-2xl sm:text-3xl font-semibold tabular-nums ${
                (analysis.latestPoint?.rhovePct ?? 0) >= 85
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
            >
              {analysis.latestPoint?.rhovePct ?? 0}%
            </span>
            {analysis.previousPoint && (
              <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400">
                {analysis.deltaRhovePts > 0
                  ? `+${analysis.deltaRhovePts} pp`
                  : `${analysis.deltaRhovePts} pp`}{' '}
                vs previo
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            {analysis.latestPoint?.capturadasRhove ?? 0} de {analysis.latestPoint?.totalIaas ?? 0}{' '}
            capturadas · Meta ≥ 95%
          </div>
        </div>

        {/* KPI 4: Critical AMR & Clusters */}
        <div className="p-4 sm:p-5 flex flex-col justify-between gap-1.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Presión BLEE + Carbapenem-R
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-2xl sm:text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {analysis.latestPoint?.criticalAmrTotal ?? 0}
            </span>
            {analysis.previousPoint && (
              <span
                className={`font-mono text-xs font-semibold tabular-nums ${
                  analysis.deltaAmrVsPrev > 0
                    ? 'text-red-700 dark:text-red-400'
                    : analysis.deltaAmrVsPrev < 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {analysis.deltaAmrVsPrev > 0
                  ? `+${analysis.deltaAmrVsPrev} vs previo`
                  : analysis.deltaAmrVsPrev < 0
                    ? `${analysis.deltaAmrVsPrev} vs previo`
                    : 'Sin cambio'}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            {analysis.latestPoint?.bleeCount ?? 0} BLEE ·{' '}
            <span className="font-semibold text-red-700 dark:text-red-400">
              {analysis.latestPoint?.carbapenemResistantCount ?? 0} Carb-R
            </span>{' '}
            · {analysis.latestPoint?.brotesActivos ?? 0} clusters
          </div>
        </div>
      </div>

      {/* Primary Hero Chart: Longitudinal IAAS Curve + Highlighted Incidence Peaks + Selected Period Inspector */}
      <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Curva de incidencia IAAS y detección de picos epidémicos ({scopeTitle})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Los marcadores rojos señalan picos que rebasan el umbral histórico (+1 DE:{' '}
                {analysis.alertThreshold}). Haz clic en cualquier punto para auditar sus cortes
                CODECIN.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400 shrink-0">
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-xs"
                  style={{ backgroundColor: primaryColor }}
                />
                <span>{selectedSite || selectedService ? 'Casos filtrados' : 'Total IAAS'}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: alertLineColor }}
                />
                <span>Pico &gt; umbral</span>
              </span>
              {!selectedSite && !selectedService && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: rhoveColor }}
                  />
                  <span>Capturadas RHOVE</span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="w-3.5 h-0.5 border-t-2 border-dashed"
                  style={{ borderColor: movingAvgColor }}
                />
                <span>Móvil (3p)</span>
              </span>
            </div>
          </div>

          {analysis.points.length > 0 ? (
            <div className="h-[315px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={analysis.points}
                  margin={{ top: 16, right: 16, left: -12, bottom: 4 }}
                  onClick={(state) => {
                    const idx =
                      typeof state?.activeTooltipIndex === 'number'
                        ? state.activeTooltipIndex
                        : -1;
                    if (idx >= 0 && analysis.points[idx]) {
                      onSelectPointId(analysis.points[idx].id);
                    }
                  }}
                >
                  <defs>
                    <linearGradient id="iaasAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={primaryColor} stopOpacity={0.26} />
                      <stop offset="95%" stopColor={primaryColor} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="axisLabel"
                    tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: axisTickFill, fontSize: 12, fontFamily: 'IBM Plex Mono' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltipBox />} />
                  <ReferenceLine
                    y={analysis.historicalMean}
                    stroke={axisTickFill}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                  <ReferenceLine
                    y={analysis.alertThreshold}
                    stroke={alertLineColor}
                    strokeDasharray="4 4"
                    ifOverflow="extendDomain"
                  />
                  {!selectedSite && !selectedService && (
                    <Bar
                      dataKey="capturadasRhove"
                      name="Capturadas RHOVE"
                      barSize={analysis.points.length > 16 ? 10 : 18}
                      fill={rhoveColor}
                      fillOpacity={0.72}
                      radius={[3, 3, 0, 0]}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="focusedCases"
                    name={selectedSite || selectedService ? 'Casos en selección' : 'Total IAAS'}
                    stroke={primaryColor}
                    strokeWidth={2.5}
                    fill="url(#iaasAreaGrad)"
                    dot={(dotProps) => {
                      const { cx, cy, payload } = dotProps as {
                        cx?: number;
                        cy?: number;
                        payload?: IaasTrendPoint;
                      };
                      if (cx == null || cy == null || !payload) return null;
                      const isSelected = inspectedPoint?.id === payload.id;
                      if (payload.isMaxPeak || payload.isEpidemicPeak) {
                        return (
                          <circle
                            key={payload.id}
                            cx={cx}
                            cy={cy}
                            r={payload.isMaxPeak ? 6 : 5}
                            fill={alertLineColor}
                            stroke={peakDotStroke}
                            strokeWidth={isSelected ? 2.5 : 1.75}
                          />
                        );
                      }
                      return (
                        <circle
                          key={payload.id}
                          cx={cx}
                          cy={cy}
                          r={isSelected ? 5 : 3}
                          fill={primaryColor}
                          stroke={peakDotStroke}
                          strokeWidth={isSelected ? 2 : 1}
                        />
                      );
                    }}
                    activeDot={{ r: 6, strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="movingAvg3"
                    name="Promedio móvil (3 periodos)"
                    stroke={movingAvgColor}
                    strokeWidth={1.75}
                    strokeDasharray="5 4"
                    dot={false}
                  />
                  {analysis.peakPoint && (
                    <ReferenceDot
                      x={analysis.peakPoint.axisLabel}
                      y={analysis.peakPoint.focusedCases}
                      r={9}
                      fill="none"
                      stroke={alertLineColor}
                      strokeOpacity={0.45}
                      strokeWidth={2}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No existen cortes archivados dentro del periodo seleccionado. Ajusta el año, trimestre
              o rango de meses en el selector superior.
            </div>
          )}

          {/* Period Selector Buttons for Keyboard/Touch Inspection with Peak Highlighting */}
          {analysis.points.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 shrink-0">
                Inspeccionar periodo:
              </span>
              {analysis.points.map((pt) => {
                const isSelected = inspectedPoint?.id === pt.id;
                const isPeak = pt.isMaxPeak || pt.isEpidemicPeak;
                return (
                  <button
                    key={pt.id}
                    type="button"
                    onClick={() => onSelectPointId(pt.id)}
                    className={`min-h-[30px] px-2.5 py-1 rounded-md font-mono text-xs tabular-nums transition-colors whitespace-nowrap shrink-0 border inline-flex items-center gap-1 ${
                      isSelected
                        ? 'border-teal-700 dark:border-teal-400 bg-teal-50/80 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 font-semibold'
                        : isPeak
                          ? 'border-red-300 dark:border-red-800/80 bg-red-50/50 dark:bg-red-950/25 text-red-800 dark:text-red-300 font-medium'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {isPeak && <TrendingUp className="w-3 h-3 shrink-0" />}
                    <span>
                      {pt.axisLabel} ({pt.focusedCases})
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Connected Period Inspector Footer Strip (Links Directly to CODECIN Tables) */}
        {inspectedPoint && (
          <div className="px-5 py-3.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {inspectedPoint.etiqueta}
              </span>
              {inspectedPoint.isMaxPeak && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-semibold text-red-700 dark:text-red-400">
                    Pico máximo del rango
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {inspectedPoint.totalIaas} IAAS
                {inspectedPoint.cutsCount > 1
                  ? ` (prom. ${inspectedPoint.avgPerCutCases}/corte)`
                  : ''}
              </span>
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                RHOVE {inspectedPoint.capturadasRhove}/{inspectedPoint.totalIaas} (
                {inspectedPoint.rhovePct}%)
              </span>
              <span aria-hidden="true" className="text-slate-400">
                ·
              </span>
              <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300">
                {inspectedPoint.bleeCount} BLEE · {inspectedPoint.carbapenemResistantCount} Carb-R
              </span>
              {inspectedPrevPoint && (
                <>
                  <span aria-hidden="true" className="text-slate-400">
                    ·
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-400">
                    Δ vs {inspectedPrevPoint.axisLabel}:{' '}
                    {inspectedPoint.focusedCases - inspectedPrevPoint.focusedCases > 0
                      ? `+${inspectedPoint.focusedCases - inspectedPrevPoint.focusedCases}`
                      : inspectedPoint.focusedCases - inspectedPrevPoint.focusedCases}
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => onOpenCodecinTableForPoint(inspectedPoint)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline whitespace-nowrap shrink-0 self-start lg:self-auto"
            >
              <span>
                {inspectedPoint.cutsCount > 1
                  ? `Ver ${inspectedPoint.cutsCount} cortes en tablas CODECIN`
                  : 'Ver este corte en tablas CODECIN'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </section>

      {/* Middle 2-Column Analytical Split: By Site Over Time & AMR / RHOVE Trajectory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
        {/* Left: Evolution by NOM-045 Site */}
        <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Composición histórica por sitio diagnóstico (NOM-045)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Identifica qué síndrome nosocomial impulsa cada pico mensual, trimestral o anual.
              </p>
            </div>

            <div
              role="group"
              aria-label="Modo de barras por sitio"
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 shrink-0"
            >
              <button
                type="button"
                onClick={() => setSiteChartMode('stacked')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  siteChartMode === 'stacked'
                    ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Apilado
              </button>
              <button
                type="button"
                onClick={() => setSiteChartMode('grouped')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  siteChartMode === 'grouped'
                    ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Agrupado
              </button>
            </div>
          </div>

          {/* Interactive Site Legend Filter */}
          <div className="flex flex-wrap items-center gap-2">
            {SITE_SERIES_CONFIG.filter((cfg) => analysis.availableSites.includes(cfg.code)).map(
              (cfg) => {
                const isIsolated = selectedSite === cfg.code;
                const dimmed = Boolean(selectedSite && !isIsolated);
                const swatch = darkMode ? cfg.darkColor : cfg.lightColor;
                return (
                  <button
                    key={cfg.code}
                    type="button"
                    onClick={() => onChangeSelectedSite(isIsolated ? '' : cfg.code)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-opacity ${
                      isIsolated
                        ? 'border-teal-600 dark:border-teal-400 bg-teal-50/70 dark:bg-teal-950/30 text-slate-900 dark:text-slate-100 font-semibold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    } ${dimmed ? 'opacity-45 hover:opacity-85' : ''}`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-xs shrink-0"
                      style={{ backgroundColor: swatch }}
                    />
                    <span>{cfg.shortLabel}</span>
                  </button>
                );
              }
            )}
          </div>

          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={analysis.points}
                margin={{ top: 8, right: 10, left: -16, bottom: 2 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis
                  dataKey="axisLabel"
                  tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ChartTooltipBox />} />
                {SITE_SERIES_CONFIG.filter(
                  (cfg) =>
                    analysis.availableSites.includes(cfg.code) &&
                    (!selectedSite || selectedSite === cfg.code)
                ).map((cfg) => (
                  <Bar
                    key={cfg.code}
                    dataKey={cfg.dataKey}
                    name={cfg.shortLabel}
                    stackId={siteChartMode === 'stacked' ? 'sites' : undefined}
                    fill={darkMode ? cfg.darkColor : cfg.lightColor}
                    radius={siteChartMode === 'grouped' ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    maxBarSize={34}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Right: Antimicrobial Resistance & Clusters OR RHOVE Compliance Rate */}
        <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {rightPanelMetric === 'amr'
                  ? 'Tendencia de resistencia crítica y clusters activos'
                  : 'Evolución del porcentaje de captura RHOVE'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {rightPanelMetric === 'amr'
                  ? 'Correlación entre picos de incidencia, fenotipos BLEE / Carbapenem-R y brotes.'
                  : 'Comparativo de oportunidad de captura en plataforma RHOVE frente a la meta del 95%.'}
              </p>
            </div>

            <div
              role="group"
              aria-label="Indicador secundario de vigilancia"
              className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 shrink-0"
            >
              <button
                type="button"
                onClick={() => setRightPanelMetric('amr')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  rightPanelMetric === 'amr'
                    ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Resistencia / Brotes
              </button>
              <button
                type="button"
                onClick={() => setRightPanelMetric('rhove')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  rightPanelMetric === 'rhove'
                    ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                % RHOVE
              </button>
            </div>
          </div>

          {rightPanelMetric === 'amr' ? (
            <>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: carbColor }}
                  />
                  <span>Carbapenem-R</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: bleeColor }}
                  />
                  <span>Fenotipo BLEE</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-0.5 border-t-2"
                    style={{ borderColor: primaryColor }}
                  />
                  <span>Clusters activos</span>
                </span>
              </div>

              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={analysis.points}
                    margin={{ top: 8, right: 10, left: -16, bottom: 2 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="axisLabel"
                      tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltipBox />} />
                    <Bar
                      dataKey="bleeCount"
                      name="Fenotipo BLEE"
                      stackId="amr"
                      fill={bleeColor}
                      maxBarSize={28}
                    />
                    <Bar
                      dataKey="carbapenemResistantCount"
                      name="Carbapenem-R"
                      stackId="amr"
                      fill={carbColor}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={28}
                    />
                    <Line
                      type="monotone"
                      dataKey="brotesActivos"
                      name="Clusters activos"
                      stroke={primaryColor}
                      strokeWidth={2.25}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-xs"
                    style={{ backgroundColor: rhoveColor }}
                  />
                  <span>% Captura RHOVE</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-3.5 h-0.5 border-t-2 border-dashed"
                    style={{ borderColor: primaryColor }}
                  />
                  <span>Meta institucional (95%)</span>
                </span>
              </div>

              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={analysis.points}
                    margin={{ top: 8, right: 12, left: -12, bottom: 2 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="axisLabel"
                      tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltipBox unitSuffix="%" />} />
                    <ReferenceLine
                      y={95}
                      stroke={primaryColor}
                      strokeDasharray="4 4"
                      ifOverflow="extendDomain"
                    />
                    <Area
                      type="monotone"
                      dataKey="rhovePct"
                      name="Cobertura RHOVE"
                      stroke={rhoveColor}
                      strokeWidth={2.5}
                      fill={rhoveColor}
                      fillOpacity={0.14}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </section>
      </div>

      {/* Bottom 2-Column Decision Split: Hospital Service Trajectories & Priority Decision Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-5 items-stretch">
        {/* Left: Service Longitudinal Curves + Peak & Delta Table */}
        <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Trayectoria y pico de incidencia por servicio hospitalario
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Comparativo longitudinal de los servicios con mayor carga y fecha de su pico máximo.
              </p>
            </div>
            {selectedService && (
              <button
                type="button"
                onClick={() => onChangeSelectedService('')}
                className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
              >
                Ver todos los servicios
              </button>
            )}
          </div>

          {analysis.topServices.length > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                {analysis.topServices.map((svc, idx) => {
                  const palette = SERVICE_LINE_PALETTE[idx % SERVICE_LINE_PALETTE.length];
                  const color = darkMode ? palette.dark : palette.light;
                  const active = selectedService === svc;
                  return (
                    <button
                      key={svc}
                      type="button"
                      onClick={() => onChangeSelectedService(active ? '' : svc)}
                      className={`inline-flex items-center gap-1.5 transition-opacity ${
                        selectedService && !active ? 'opacity-45 hover:opacity-85' : ''
                      } ${active ? 'font-bold text-slate-900 dark:text-slate-100' : ''}`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span>{svc}</span>
                    </button>
                  );
                })}
              </div>

              <div className="h-[220px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={serviceLineData}
                    margin={{ top: 6, right: 12, left: -16, bottom: 2 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="axisLabel"
                      tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: axisTickFill, fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltipBox />} />
                    {analysis.topServices
                      .filter((svc) => !selectedService || selectedService === svc)
                      .map((svc) => {
                        const idx = analysis.topServices.indexOf(svc);
                        const palette = SERVICE_LINE_PALETTE[idx % SERVICE_LINE_PALETTE.length];
                        return (
                          <Line
                            key={svc}
                            type="monotone"
                            dataKey={svc}
                            name={svc}
                            stroke={darkMode ? palette.dark : palette.light}
                            strokeWidth={2}
                            dot={{ r: 2.5 }}
                          />
                        );
                      })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* High-Density Service Peak, Delta & Drill-Down Table */}
          {analysis.serviceComparisons.length > 0 && (
            <div className="overflow-x-auto pt-2 border-t border-slate-200/80 dark:border-slate-800">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Servicio</th>
                    <th className="py-2 px-2 font-semibold text-right">Pico (Periodo)</th>
                    <th className="py-2 px-2 font-semibold text-right">Reciente</th>
                    <th className="py-2 px-2 font-semibold text-right">Variación</th>
                    <th className="py-2 pl-2 font-semibold text-right">Censo vivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {analysis.serviceComparisons.slice(0, 6).map((item) => (
                    <tr
                      key={item.service}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                        <button
                          type="button"
                          onClick={() =>
                            onChangeSelectedService(
                              selectedService === item.service ? '' : item.service
                            )
                          }
                          className="text-left hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                        >
                          {item.service}
                        </button>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        <span className="font-semibold">{item.peakValue}</span>
                        {item.peakLabel && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">
                            ({item.peakLabel})
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                        {item.current}
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-semibold tabular-nums">
                        {item.deltaVsPrev > 0 ? (
                          <span className="text-red-700 dark:text-red-400">
                            +{item.deltaVsPrev}
                          </span>
                        ) : item.deltaVsPrev < 0 ? (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {item.deltaVsPrev}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          type="button"
                          onClick={() => onNavigateToService(item.service)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
                        >
                          <span>Auditar</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right: Data-Driven Epidemiological Decision Support + Active Census Detection Rhythm */}
        <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-5">
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Prioridades para toma de decisiones (CODECIN / UVEH)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Hallazgos automáticos sobre picos de incidencia, brecha RHOVE y resistencia en el
                periodo seleccionado.
              </p>
            </div>

            {analysis.findings.length > 0 ? (
              <div className="divide-y divide-slate-200/80 dark:divide-slate-800 border-t border-b border-slate-200/80 dark:border-slate-800">
                {analysis.findings.map((finding) => (
                  <div key={finding.id} className="py-3.5 flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span
                        className={`text-xs sm:text-sm font-semibold ${
                          finding.severity === 'alert'
                            ? 'text-red-700 dark:text-red-400'
                            : finding.severity === 'warn'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {finding.title}
                      </span>
                      <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                        {finding.metricBadge}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {finding.detail}
                    </p>
                    {finding.actionLabel && finding.actionTarget && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleFindingAction(finding)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline"
                        >
                          <span>{finding.actionLabel}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Ajusta el selector de periodo para analizar picos y desviaciones históricas.
              </p>
            )}
          </div>

          {/* Intra-Bulletin Episode Detection Curve */}
          {analysis.episodeBuckets.length > 0 && (
            <div className="flex flex-col gap-2.5 pt-1">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Fechas de detección en el boletín activo
                </h4>
                <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                  Activos vs. cerrados
                </span>
              </div>
              <div className="h-[135px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={analysis.episodeBuckets}
                    margin={{ top: 4, right: 6, left: -22, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: axisTickFill, fontSize: 10, fontFamily: 'IBM Plex Mono' }}
                      axisLine={{ stroke: gridStroke }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: axisTickFill, fontSize: 10, fontFamily: 'IBM Plex Mono' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltipBox />} />
                    <Bar
                      dataKey="detectedActive"
                      name="Episodios activos"
                      stackId="ep"
                      fill={primaryColor}
                      maxBarSize={22}
                    />
                    <Bar
                      dataKey="detectedClosed"
                      name="Episodios cerrados"
                      stackId="ep"
                      fill={axisTickFill}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={22}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
