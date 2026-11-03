import { BulletinState, CodecinSnapshot, QueueTabId } from '../types/clinical';
import { isDiscarded, isIAAS, isRhoveCaptured } from './classification';
import {
  classifyIaasSite,
  CodecinAnalytics,
  ensureFullHistoricalBaseline,
  IAAS_SITE_CODES,
} from './codecinMetrics';
import { fmtFull, fmtShort, todayISO, toISO } from './dates';
import { getServiceGroup } from './services';

export type TimeGranularity = 'month' | 'quarter' | 'year';
export type QuarterFilter = 'all' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type QuickWindowPreset = '6m' | '12m' | 'all' | 'custom';

export interface CodecinPeriodFilter {
  granularity: TimeGranularity;
  year: string; // 'all' or 'YYYY'
  quarter: QuarterFilter;
  preset: QuickWindowPreset;
  startMonth: string; // '' or 'YYYY-MM'
  endMonth: string; // '' or 'YYYY-MM'
}

export const DEFAULT_CODECIN_PERIOD_FILTER: CodecinPeriodFilter = {
  granularity: 'month',
  year: 'all',
  quarter: 'all',
  preset: '12m',
  startMonth: '',
  endMonth: '',
};

const MESES_CORTOS = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

const MESES_LARGOS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export interface MonthOption {
  ym: string;
  label: string;
}

export interface PeriodCatalog {
  availableYears: string[];
  availableMonths: MonthOption[];
  minMonth: string;
  maxMonth: string;
}

export interface IaasTrendPoint {
  id: string;
  bucketKey: string;
  representativeCutId: string;
  memberCutIds: string[];
  cutsCount: number;
  isPartialPeriod: boolean;
  corte: string;
  axisLabel: string;
  etiqueta: string;
  isLive: boolean;
  totalIaas: number;
  focusedCases: number;
  avgPerCutCases: number;
  maxSingleCutCases: number;
  movingAvg3: number;
  excessOverMean: number;
  isEpidemicPeak: boolean;
  isMaxPeak: boolean;
  dominantSite: { code: string; count: number } | null;
  dominantService: { service: string; count: number } | null;
  capturadasRhove: number;
  sinCapturarRhove: number;
  rhovePct: number;
  urgentes: number;
  brotesActivos: number;
  clustersIdenticos: number;
  bleeCount: number;
  carbapenemResistantCount: number;
  criticalAmrTotal: number;
  defuncionesConIaas: number;
  porSitio: Record<string, number>;
  porServicio: Record<string, number>;
  site_nav: number;
  site_itscc: number;
  site_ivuca: number;
  site_isq: number;
  site_itslab: number;
  site_otras: number;
}

export interface ServiceTrendComparison {
  service: string;
  current: number;
  previous: number;
  historicalMean: number;
  peakValue: number;
  peakLabel: string;
  deltaVsPrev: number;
  consecutiveRise: boolean;
  liveRhoveCaptured: number;
  liveUrgentPending: number;
  liveOutbreakLinked: number;
  series: number[];
}

export interface EpisodeDetectionBucket {
  periodKey: string;
  label: string;
  detectedActive: number;
  detectedClosed: number;
  rhoveCaptured: number;
}

export interface DecisionFinding {
  id: string;
  severity: 'alert' | 'warn' | 'nominal';
  title: string;
  detail: string;
  metricBadge: string;
  actionLabel?: string;
  actionTarget?:
    | { kind: 'service'; service: string }
    | { kind: 'queue'; tab: QueueTabId }
    | { kind: 'outbreaks' }
    | { kind: 'codecin-table'; cutId?: string }
    | { kind: 'focus-period'; pointId: string };
}

export interface IaasTrendAnalysis {
  points: IaasTrendPoint[];
  availableSites: string[];
  availableServices: string[];
  topServices: string[];
  latestPoint: IaasTrendPoint | null;
  previousPoint: IaasTrendPoint | null;
  peakPoint: IaasTrendPoint | null;
  peaksAboveThreshold: IaasTrendPoint[];
  historicalMean: number;
  alertThreshold: number;
  deltaCasesVsPrev: number;
  deltaPctVsPrev: number | null;
  deltaVsMean: number;
  deltaRhovePts: number;
  deltaAmrVsPrev: number;
  isAboveAlertThreshold: boolean;
  serviceComparisons: ServiceTrendComparison[];
  episodeBuckets: EpisodeDetectionBucket[];
  findings: DecisionFinding[];
}

export function getQuarterFromIso(iso: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const month = Number(iso.slice(5, 7));
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

export function formatQuarterSpanish(q: 'Q1' | 'Q2' | 'Q3' | 'Q4'): string {
  if (q === 'Q1') return 'T1 (Ene–Mar)';
  if (q === 'Q2') return 'T2 (Abr–Jun)';
  if (q === 'Q3') return 'T3 (Jul–Sep)';
  return 'T4 (Oct–Dic)';
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const year = Number(ym.slice(0, 4));
  const monthIdx = Number(ym.slice(5, 7)) - 1;
  const totalMonths = year * 12 + monthIdx + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
}

export function extractPeriodCatalog(
  snapshots: CodecinSnapshot[],
  corte: string | null,
  includeLiveCut = true
): PeriodCatalog {
  const base = ensureFullHistoricalBaseline(snapshots);
  const ymSet = new Set<string>();
  const yearSet = new Set<string>();

  base.forEach((s) => {
    if (s.corte && s.corte.length >= 7) {
      ymSet.add(s.corte.slice(0, 7));
      yearSet.add(s.corte.slice(0, 4));
    }
  });

  if (includeLiveCut) {
    const liveIso = corte || todayISO();
    if (liveIso.length >= 7) {
      ymSet.add(liveIso.slice(0, 7));
      yearSet.add(liveIso.slice(0, 4));
    }
  }

  const sortedYms = [...ymSet].sort();
  const availableMonths: MonthOption[] = sortedYms.map((ym) => {
    const y = ym.slice(0, 4);
    const mIdx = Number(ym.slice(5, 7)) - 1;
    return {
      ym,
      label: `${MESES_CORTOS[mIdx] || ym.slice(5, 7)} ${y}`,
    };
  });

  const availableYears = [...yearSet].sort((a, b) => b.localeCompare(a));

  return {
    availableYears,
    availableMonths,
    minMonth: sortedYms[0] || '',
    maxMonth: sortedYms[sortedYms.length - 1] || '',
  };
}

export function matchesCodecinPeriodFilter(
  isoDate: string | null | undefined,
  filter: CodecinPeriodFilter,
  referenceMaxMonth: string
): boolean {
  if (!isoDate || isoDate.length < 7) return false;
  const ym = isoDate.slice(0, 7);
  const year = isoDate.slice(0, 4);
  const quarter = getQuarterFromIso(isoDate);

  if (filter.year !== 'all' && year !== filter.year) {
    return false;
  }
  if (filter.quarter !== 'all' && quarter !== filter.quarter) {
    return false;
  }

  if (filter.preset === 'custom') {
    if (filter.startMonth && ym < filter.startMonth) return false;
    if (filter.endMonth && ym > filter.endMonth) return false;
    return true;
  }

  // Only apply rolling window (6m / 12m) when user hasn't explicitly narrowed to a specific year or quarter
  if (filter.year === 'all' && filter.quarter === 'all' && referenceMaxMonth) {
    if (filter.preset === '6m') {
      const minYm = shiftYearMonth(referenceMaxMonth, -5);
      if (ym < minYm) return false;
    } else if (filter.preset === '12m') {
      const minYm = shiftYearMonth(referenceMaxMonth, -11);
      if (ym < minYm) return false;
    }
  }

  return true;
}

export function describeActivePeriodFilter(filter: CodecinPeriodFilter): string {
  const granLabel =
    filter.granularity === 'month'
      ? 'Vista mensual'
      : filter.granularity === 'quarter'
        ? 'Vista trimestral'
        : 'Vista anual';

  const parts: string[] = [granLabel];
  if (filter.year !== 'all') parts.push(`Año ${filter.year}`);
  if (filter.quarter !== 'all') parts.push(formatQuarterSpanish(filter.quarter));

  if (filter.preset === 'custom' && (filter.startMonth || filter.endMonth)) {
    parts.push(`${filter.startMonth || 'inicio'} a ${filter.endMonth || 'actual'}`);
  } else if (filter.year === 'all' && filter.quarter === 'all') {
    if (filter.preset === '6m') parts.push('Últimos 6 meses');
    else if (filter.preset === '12m') parts.push('Últimos 12 meses');
    else parts.push('Serie histórica completa');
  }

  return parts.join(' · ');
}

function computeFocusedValue(
  snap: {
    totalIaas: number;
    porSitio: Record<string, number>;
    porServicio: Record<string, number>;
  },
  selectedSite: string,
  selectedService: string,
  liveMatchingCount: number | null
): number {
  if (liveMatchingCount != null) return liveMatchingCount;
  if (!selectedSite && !selectedService) return snap.totalIaas;
  if (selectedSite && !selectedService) {
    return snap.porSitio?.[selectedSite] || 0;
  }
  if (!selectedSite && selectedService) {
    return snap.porServicio?.[selectedService] || 0;
  }
  const svcVal = snap.porServicio?.[selectedService] || 0;
  const siteVal = snap.porSitio?.[selectedSite] || 0;
  if (svcVal === 0 || siteVal === 0 || snap.totalIaas === 0) return 0;
  return Math.min(svcVal, siteVal, Math.max(1, Math.round((svcVal * siteVal) / snap.totalIaas)));
}

function getBucketDescriptor(
  iso: string,
  granularity: TimeGranularity,
  isLive: boolean,
  cutsCount: number
): { bucketKey: string; axisLabel: string; etiqueta: string; isPartialPeriod: boolean } {
  const year = iso.slice(0, 4);
  const yearShort = iso.slice(2, 4);
  const mIdx = Number(iso.slice(5, 7)) - 1;
  const day = iso.slice(8, 10);

  if (granularity === 'year') {
    const isPartial = cutsCount < 12;
    return {
      bucketKey: year,
      axisLabel: isPartial && isLive ? `${year}*` : year,
      etiqueta: isPartial
        ? `Consolidado anual ${year} (${cutsCount} ${cutsCount === 1 ? 'corte' : 'cortes'})`
        : `Consolidado anual ${year} (12 meses)`,
      isPartialPeriod: isPartial,
    };
  }

  if (granularity === 'quarter') {
    const q = getQuarterFromIso(iso);
    const tLabel = q.replace('Q', 'T');
    const isPartial = cutsCount < 3;
    return {
      bucketKey: `${year}-${q}`,
      axisLabel: `${tLabel} ${yearShort}`,
      etiqueta: isPartial
        ? `${formatQuarterSpanish(q)} ${year} (${cutsCount} ${cutsCount === 1 ? 'corte' : 'cortes'})`
        : `${formatQuarterSpanish(q)} ${year}`,
      isPartialPeriod: isPartial,
    };
  }

  // Monthly / Individual Cut granularity
  const monthShort = MESES_CORTOS[mIdx] || iso.slice(5, 7);
  const monthLong = MESES_LARGOS[mIdx] || iso.slice(5, 7);
  if (isLive) {
    return {
      bucketKey: `${iso.slice(0, 7)}-live`,
      axisLabel: `${monthShort} ${yearShort} (Vivo)`,
      etiqueta: `Corte activo ${fmtFull(iso)}`,
      isPartialPeriod: false,
    };
  }

  return {
    bucketKey: cutsCount === 1 ? iso.slice(0, 7) : iso,
    axisLabel: Number(day) >= 27 ? `${monthShort} ${yearShort}` : `${day} ${monthShort}`,
    etiqueta: `Cierre mensual ${monthLong} ${year}`,
    isPartialPeriod: false,
  };
}

function getDominantEntry(record: Record<string, number>): { key: string; count: number } | null {
  let bestKey = '';
  let bestVal = 0;
  Object.entries(record).forEach(([k, val]) => {
    if (val > bestVal) {
      bestVal = val;
      bestKey = k;
    }
  });
  return bestVal > 0 ? { key: bestKey, count: bestVal } : null;
}

export function buildIaasTrendAnalysis(params: {
  snapshots: CodecinSnapshot[];
  corte: string | null;
  liveAnalytics: CodecinAnalytics;
  bulletin: BulletinState;
  outbreakIds: Set<string>;
  periodFilter: CodecinPeriodFilter;
  selectedSite: string;
  selectedService: string;
  includeLiveCut: boolean;
}): IaasTrendAnalysis {
  const {
    snapshots,
    corte,
    liveAnalytics,
    bulletin,
    outbreakIds,
    periodFilter,
    selectedSite,
    selectedService,
    includeLiveCut,
  } = params;

  const baseSnapshots = ensureFullHistoricalBaseline(snapshots);
  const effectiveLiveCorte = corte || todayISO();

  const activeIaasRows = bulletin.rows.filter((r) => isIAAS(r, outbreakIds) && !isDiscarded(r));
  const exactLiveFocusedCount =
    selectedSite || selectedService
      ? activeIaasRows.filter((row) => {
          const siteOk = !selectedSite || classifyIaasSite(row).shortCode === selectedSite;
          const svcOk = !selectedService || getServiceGroup(row) === selectedService;
          return siteOk && svcOk;
        }).length
      : liveAnalytics.totalActiveIaas;

  const livePorSitio: Record<string, number> = {};
  liveAnalytics.bySite.forEach((s) => {
    livePorSitio[s.shortCode] = s.total;
  });
  const livePorServicio: Record<string, number> = {};
  liveAnalytics.byService.forEach((s) => {
    livePorServicio[s.service] = s.activeIaas;
  });

  // Merge archived cuts + optional live cut
  const rawAllCuts: Array<{ snap: CodecinSnapshot; isLive: boolean; focusedCases: number }> =
    baseSnapshots
      .filter(
        (s) =>
          !(
            includeLiveCut &&
            !bulletin.empty &&
            s.corte === effectiveLiveCorte &&
            !s.id.startsWith('seed-')
          )
      )
      .map((snap) => ({
        snap,
        isLive: false,
        focusedCases: computeFocusedValue(snap, selectedSite, selectedService, null),
      }));

  if (includeLiveCut && !bulletin.empty) {
    const liveSnap: CodecinSnapshot = {
      id: 'live-current-cut',
      corte: effectiveLiveCorte,
      etiqueta: `Corte activo (${fmtFull(effectiveLiveCorte)})`,
      creadoEn: bulletin.publicado || new Date().toISOString(),
      totalIaas: liveAnalytics.totalActiveIaas,
      capturadasRhove: liveAnalytics.rhoveCapturedCount,
      urgentes: liveAnalytics.urgentPendingCount,
      brotesActivos: liveAnalytics.activeClustersCount,
      clustersIdenticos: liveAnalytics.identicalClustersCount,
      bleeCount: liveAnalytics.bleeCount,
      carbapenemResistantCount: liveAnalytics.carbapenemResistantCount,
      defuncionesConIaas: liveAnalytics.closedDeathsCount,
      porSitio: livePorSitio,
      porServicio: livePorServicio,
    };
    rawAllCuts.push({
      snap: liveSnap,
      isLive: true,
      focusedCases: exactLiveFocusedCount,
    });
  }

  rawAllCuts.sort((a, b) => {
    const cmp = a.snap.corte.localeCompare(b.snap.corte);
    if (cmp !== 0) return cmp;
    if (a.isLive !== b.isLive) return a.isLive ? 1 : -1;
    return 0;
  });

  // Collect global available sites & services across all cuts so filter dropdowns remain stable
  const globalServiceTotals = new Map<string, number>();
  rawAllCuts.forEach(({ snap }) => {
    Object.entries(snap.porServicio || {}).forEach(([svc, count]) => {
      globalServiceTotals.set(svc, (globalServiceTotals.get(svc) || 0) + count);
    });
  });
  const availableServices = [...globalServiceTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([svc]) => svc);

  const availableSites = IAAS_SITE_CODES.filter((code) =>
    rawAllCuts.some(({ snap }) => (snap.porSitio?.[code] || 0) > 0)
  );

  const referenceMaxMonth =
    rawAllCuts.length > 0 ? rawAllCuts[rawAllCuts.length - 1].snap.corte.slice(0, 7) : '';

  // Filter raw cuts according to CodecinPeriodFilter
  const filteredRawCuts = rawAllCuts.filter(({ snap }) =>
    matchesCodecinPeriodFilter(snap.corte, periodFilter, referenceMaxMonth)
  );

  // Group filtered cuts into Month, Quarter, or Year buckets
  const groupedMap = new Map<
    string,
    Array<{ snap: CodecinSnapshot; isLive: boolean; focusedCases: number }>
  >();

  filteredRawCuts.forEach((entry) => {
    const iso = entry.snap.corte;
    let key = iso;
    if (periodFilter.granularity === 'year') {
      key = iso.slice(0, 4);
    } else if (periodFilter.granularity === 'quarter') {
      key = `${iso.slice(0, 4)}-${getQuarterFromIso(iso)}`;
    } else {
      // Monthly granularity: keep live cut distinct if same month already has an archived closure,
      // otherwise group by YYYY-MM taking the latest cut of that month
      key = entry.isLive ? `${iso.slice(0, 7)}-live` : iso.slice(0, 7);
    }
    const list = groupedMap.get(key) || [];
    list.push(entry);
    groupedMap.set(key, list);
  });

  const bucketEntries = [...groupedMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const preliminaryPoints = bucketEntries.map(([rawKey, members]) => {
    // In 'month' mode, if multiple snapshots share the same YYYY-MM, use the latest cut of that month;
    // in 'quarter' or 'year' mode, aggregate episodes across the constituent monthly cuts.
    const effectiveMembers =
      periodFilter.granularity === 'month' ? [members[members.length - 1]] : members;

    const latestMember = effectiveMembers[effectiveMembers.length - 1];
    const hasLive = effectiveMembers.some((m) => m.isLive);

    let totalIaas = 0;
    let focusedCases = 0;
    let maxSingleCutCases = 0;
    let capturadasRhove = 0;
    let urgentes = 0;
    let brotesActivos = 0;
    let clustersIdenticos = 0;
    let bleeCount = 0;
    let carbapenemResistantCount = 0;
    let defuncionesConIaas = 0;
    const porSitio: Record<string, number> = {};
    const porServicio: Record<string, number> = {};

    let peakMemberCut = effectiveMembers[0];

    effectiveMembers.forEach((m) => {
      totalIaas += m.snap.totalIaas;
      focusedCases += m.focusedCases;
      if (m.focusedCases >= maxSingleCutCases) {
        maxSingleCutCases = m.focusedCases;
        peakMemberCut = m;
      }
      capturadasRhove += m.snap.capturadasRhove;
      urgentes += m.snap.urgentes;
      brotesActivos += m.snap.brotesActivos;
      clustersIdenticos += m.snap.clustersIdenticos;
      bleeCount += m.snap.bleeCount;
      carbapenemResistantCount += m.snap.carbapenemResistantCount;
      defuncionesConIaas += m.snap.defuncionesConIaas;

      Object.entries(m.snap.porSitio || {}).forEach(([k, v]) => {
        porSitio[k] = (porSitio[k] || 0) + v;
      });
      Object.entries(m.snap.porServicio || {}).forEach(([k, v]) => {
        porServicio[k] = (porServicio[k] || 0) + v;
      });
    });

    const cutsCount = effectiveMembers.length;
    const avgPerCutCases = cutsCount > 0 ? Math.round((focusedCases / cutsCount) * 10) / 10 : 0;
    const rhovePct = totalIaas > 0 ? Math.round((capturadasRhove / totalIaas) * 100) : 0;

    const descriptor = getBucketDescriptor(
      latestMember.snap.corte,
      periodFilter.granularity,
      hasLive && periodFilter.granularity === 'month',
      cutsCount
    );

    const etiqueta =
      periodFilter.granularity === 'month' && effectiveMembers.length === 1
        ? latestMember.snap.etiqueta
        : descriptor.etiqueta;

    const domSite = getDominantEntry(porSitio);
    const domSvc = getDominantEntry(porServicio);

    return {
      id: periodFilter.granularity === 'month' ? latestMember.snap.id : `bucket-${rawKey}`,
      bucketKey: descriptor.bucketKey,
      representativeCutId: peakMemberCut.snap.id,
      memberCutIds: effectiveMembers.map((m) => m.snap.id),
      cutsCount,
      isPartialPeriod: descriptor.isPartialPeriod,
      corte: latestMember.snap.corte,
      axisLabel: descriptor.axisLabel,
      etiqueta,
      isLive: hasLive,
      totalIaas,
      focusedCases,
      avgPerCutCases,
      maxSingleCutCases,
      movingAvg3: focusedCases,
      excessOverMean: 0,
      isEpidemicPeak: false,
      isMaxPeak: false,
      dominantSite: domSite ? { code: domSite.key, count: domSite.count } : null,
      dominantService: domSvc ? { service: domSvc.key, count: domSvc.count } : null,
      capturadasRhove,
      sinCapturarRhove: Math.max(0, totalIaas - capturadasRhove),
      rhovePct,
      urgentes,
      brotesActivos,
      clustersIdenticos,
      bleeCount,
      carbapenemResistantCount,
      criticalAmrTotal: bleeCount + carbapenemResistantCount,
      defuncionesConIaas,
      porSitio,
      porServicio,
      site_nav: porSitio['NAV / Neumonía'] || 0,
      site_itscc: porSitio['ITS-CC'] || 0,
      site_ivuca: porSitio['IVU-CA'] || 0,
      site_isq: porSitio['ISQ'] || 0,
      site_itslab: porSitio['ITS-Lab'] || 0,
      site_otras: porSitio['Otras IAAS'] || 0,
    };
  });

  // Compute historical mean & epidemic alert threshold (+1 SD)
  // Exclude incomplete trailing quarter/year from baseline calculation if complete buckets exist
  const completeBuckets = preliminaryPoints.filter((p) => !p.isPartialPeriod);
  const baselinePool =
    completeBuckets.length >= 2
      ? completeBuckets.length >= 4
        ? completeBuckets.slice(0, completeBuckets.length - 1)
        : completeBuckets
      : preliminaryPoints;

  const historicalMeanRaw =
    baselinePool.length > 0
      ? baselinePool.reduce((acc, p) => acc + p.focusedCases, 0) / baselinePool.length
      : 0;
  const historicalMean = Math.round(historicalMeanRaw * 10) / 10;

  const variance =
    baselinePool.length > 1
      ? baselinePool.reduce((acc, p) => acc + Math.pow(p.focusedCases - historicalMeanRaw, 2), 0) /
        baselinePool.length
      : 0;
  const stdDev = Math.sqrt(variance);
  const minMargin =
    periodFilter.granularity === 'year'
      ? 4
      : periodFilter.granularity === 'quarter'
        ? 2.5
        : 1.2;
  const alertThreshold = Math.round((historicalMeanRaw + Math.max(stdDev, minMargin)) * 10) / 10;

  // Identify absolute peak in the selected period
  let maxVal = -1;
  let maxPeakId = '';
  preliminaryPoints.forEach((pt) => {
    if (pt.focusedCases > 0 && pt.focusedCases >= maxVal) {
      maxVal = pt.focusedCases;
      maxPeakId = pt.id;
    }
  });

  const points: IaasTrendPoint[] = preliminaryPoints.map((pt, idx) => {
    const windowSlice = preliminaryPoints.slice(Math.max(0, idx - 2), idx + 1);
    const movingAvg3 =
      Math.round(
        (windowSlice.reduce((sum, item) => sum + item.focusedCases, 0) / windowSlice.length) * 10
      ) / 10;
    const excessOverMean = Math.round((pt.focusedCases - historicalMean) * 10) / 10;
    const isEpidemicPeak = baselinePool.length >= 2 && pt.focusedCases > alertThreshold;
    const isMaxPeak = pt.id === maxPeakId && pt.focusedCases > 0;

    return {
      ...pt,
      movingAvg3,
      excessOverMean,
      isEpidemicPeak,
      isMaxPeak,
    };
  });

  const peakPoint = points.find((p) => p.isMaxPeak) || null;
  const peaksAboveThreshold = [...points]
    .filter((p) => p.isEpidemicPeak)
    .sort((a, b) => b.focusedCases - a.focusedCases || b.corte.localeCompare(a.corte));

  const latestPoint = points.length > 0 ? points[points.length - 1] : null;
  const previousPoint = points.length > 1 ? points[points.length - 2] : null;

  const deltaCasesVsPrev =
    latestPoint && previousPoint ? latestPoint.focusedCases - previousPoint.focusedCases : 0;
  const deltaPctVsPrev =
    latestPoint && previousPoint && previousPoint.focusedCases > 0
      ? Math.round(
          ((latestPoint.focusedCases - previousPoint.focusedCases) / previousPoint.focusedCases) *
            100
        )
      : null;
  const deltaVsMean = latestPoint
    ? Math.round((latestPoint.focusedCases - historicalMean) * 10) / 10
    : 0;
  const deltaRhovePts =
    latestPoint && previousPoint ? latestPoint.rhovePct - previousPoint.rhovePct : 0;
  const deltaAmrVsPrev =
    latestPoint && previousPoint
      ? latestPoint.criticalAmrTotal - previousPoint.criticalAmrTotal
      : 0;

  const isAboveAlertThreshold = Boolean(latestPoint?.isEpidemicPeak);

  // Top services within the filtered period
  const filteredSvcTotals = new Map<string, number>();
  points.forEach((pt) => {
    Object.entries(pt.porServicio).forEach(([svc, count]) => {
      filteredSvcTotals.set(svc, (filteredSvcTotals.get(svc) || 0) + count);
    });
  });
  const topServices = (
    filteredSvcTotals.size > 0
      ? [...filteredSvcTotals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s)
      : availableServices
  ).slice(0, 5);

  const liveSvcLookup = new Map(liveAnalytics.byService.map((s) => [s.service, s]));
  const serviceComparisons: ServiceTrendComparison[] = availableServices
    .map((service) => {
      const series = points.map((p) => p.porServicio[service] || 0);
      const current = series.length > 0 ? series[series.length - 1] : 0;
      const previous = series.length > 1 ? series[series.length - 2] : 0;
      const thirdBack = series.length > 2 ? series[series.length - 3] : null;
      const histValues = baselinePool.map((p) => p.porServicio[service] || 0);
      const svcMean =
        histValues.length > 0
          ? Math.round((histValues.reduce((a, b) => a + b, 0) / histValues.length) * 10) / 10
          : current;

      let peakValue = 0;
      let peakLabel = '';
      points.forEach((pt) => {
        const val = pt.porServicio[service] || 0;
        if (val >= peakValue && val > 0) {
          peakValue = val;
          peakLabel = pt.axisLabel;
        }
      });

      const consecutiveRise =
        thirdBack != null ? current > previous && previous > thirdBack : current > previous;
      const liveMeta = liveSvcLookup.get(service);

      return {
        service,
        current,
        previous,
        historicalMean: svcMean,
        peakValue,
        peakLabel,
        deltaVsPrev: current - previous,
        consecutiveRise,
        liveRhoveCaptured: liveMeta?.rhoveCaptured ?? 0,
        liveUrgentPending: liveMeta?.urgentPending ?? 0,
        liveOutbreakLinked: liveMeta?.outbreakLinked ?? 0,
        series,
      };
    })
    .filter((item) => item.peakValue > 0 || item.current > 0 || item.historicalMean > 0)
    .sort((a, b) => b.current - a.current || b.peakValue - a.peakValue);

  // Episode-level detection buckets from active + closed bulletin rows
  const bucketMap = new Map<
    string,
    {
      periodKey: string;
      label: string;
      detectedActive: number;
      detectedClosed: number;
      rhoveCaptured: number;
    }
  >();

  activeIaasRows.forEach((row) => {
    if (selectedSite && classifyIaasSite(row).shortCode !== selectedSite) return;
    if (selectedService && getServiceGroup(row) !== selectedService) return;
    const iso = toISO(row.det) || toISO(row.fres) || toISO(row.ing) || effectiveLiveCorte;
    const cur = bucketMap.get(iso) || {
      periodKey: iso,
      label: fmtShort(iso),
      detectedActive: 0,
      detectedClosed: 0,
      rhoveCaptured: 0,
    };
    cur.detectedActive += 1;
    if (isRhoveCaptured(row)) cur.rhoveCaptured += 1;
    bucketMap.set(iso, cur);
  });

  (bulletin.cerrados || []).forEach((row) => {
    if (!isIAAS(row, outbreakIds)) return;
    if (selectedSite && classifyIaasSite(row).shortCode !== selectedSite) return;
    if (selectedService && getServiceGroup(row) !== selectedService) return;
    const iso = toISO(row.det) || toISO(row.egreso) || toISO(row.ing);
    if (!iso) return;
    const cur = bucketMap.get(iso) || {
      periodKey: iso,
      label: fmtShort(iso),
      detectedActive: 0,
      detectedClosed: 0,
      rhoveCaptured: 0,
    };
    cur.detectedClosed += 1;
    if (isRhoveCaptured(row)) cur.rhoveCaptured += 1;
    bucketMap.set(iso, cur);
  });

  const episodeBuckets = [...bucketMap.values()].sort((a, b) =>
    a.periodKey.localeCompare(b.periodKey)
  );

  // Decision-support findings including Precision Incidence Peak Insight
  const findings: DecisionFinding[] = [];

  if (peakPoint && points.length >= 2) {
    const pctOverMean =
      historicalMean > 0
        ? Math.round(((peakPoint.focusedCases - historicalMean) / historicalMean) * 100)
        : 0;
    const siteText = peakPoint.dominantSite
      ? ` con predominio de ${peakPoint.dominantSite.code} (${peakPoint.dominantSite.count})`
      : '';
    const svcText = peakPoint.dominantService
      ? ` y mayor concentración en ${peakPoint.dominantService.service} (${peakPoint.dominantService.count})`
      : '';

    findings.push({
      id: `peak-${peakPoint.id}`,
      severity: peakPoint.isEpidemicPeak ? 'alert' : 'warn',
      title: `Pico máximo de incidencia identificado en ${peakPoint.axisLabel}`,
      detail: `Registró ${peakPoint.focusedCases} casos${
        pctOverMean > 0 ? ` (+${pctOverMean}% frente a la media de ${historicalMean})` : ''
      }${siteText}${svcText}. ${
        peaksAboveThreshold.length > 1
          ? `Se detectaron ${peaksAboveThreshold.length} periodos por encima del umbral epidémico (${alertThreshold}).`
          : ''
      }`,
      metricBadge: `Pico: ${peakPoint.focusedCases}`,
      actionLabel: `Inspeccionar ${peakPoint.axisLabel} en la curva`,
      actionTarget: { kind: 'focus-period', pointId: peakPoint.id },
    });
  }

  if (latestPoint) {
    const risingService = serviceComparisons.find(
      (s) =>
        s.current >= 2 &&
        (s.deltaVsPrev > 0 || s.current > s.historicalMean + 0.8 || s.liveOutbreakLinked > 0)
    );
    if (risingService) {
      findings.push({
        id: `svc-${risingService.service}`,
        severity:
          risingService.liveOutbreakLinked > 0 || risingService.deltaVsPrev >= 2 ? 'alert' : 'warn',
        title: `Vigilancia focalizada en ${risingService.service}`,
        detail: `Presenta ${risingService.current} IAAS en el periodo reciente (pico de ${risingService.peakValue} en ${risingService.peakLabel})${
          risingService.liveOutbreakLinked > 0
            ? `, con ${risingService.liveOutbreakLinked} evento(s) activos en cluster`
            : ''
        }.`,
        metricBadge: `${risingService.current} recientes`,
        actionLabel: `Auditar ${risingService.service} en Vigilancia`,
        actionTarget: { kind: 'service', service: risingService.service },
      });
    }

    if (latestPoint.rhovePct < 95 && latestPoint.sinCapturarRhove > 0) {
      findings.push({
        id: 'rhove-gap',
        severity: latestPoint.rhovePct < 75 ? 'alert' : 'warn',
        title: 'Brecha de captura en plataforma RHOVE frente a meta institucional (95%)',
        detail: `Cobertura del periodo reciente en ${latestPoint.rhovePct}% (${latestPoint.capturadasRhove}/${latestPoint.totalIaas} capturadas; ${latestPoint.sinCapturarRhove} pendientes de folio).`,
        metricBadge: `${latestPoint.rhovePct}% RHOVE`,
        actionLabel: 'Abrir cola Sin capturar RHOVE',
        actionTarget: { kind: 'queue', tab: 'sincapturar' },
      });
    }

    if (latestPoint.carbapenemResistantCount > 0 || latestPoint.clustersIdenticos > 0) {
      findings.push({
        id: 'amr-clusters',
        severity: latestPoint.clustersIdenticos > 0 ? 'alert' : 'warn',
        title: 'Presión de resistencia a carbapenémicos y transmisión clonal',
        detail: `El último periodo concentra ${latestPoint.carbapenemResistantCount} aislamiento(s) Carbapenem-R, ${latestPoint.bleeCount} BLEE y ${latestPoint.brotesActivos} cluster(s) microbiológicos.`,
        metricBadge: `${latestPoint.carbapenemResistantCount} Carb-R`,
        actionLabel: 'Revisar clusters en Brotes',
        actionTarget: { kind: 'outbreaks' },
      });
    }
  }

  return {
    points,
    availableSites,
    availableServices,
    topServices,
    latestPoint,
    previousPoint,
    peakPoint,
    peaksAboveThreshold,
    historicalMean,
    alertThreshold,
    deltaCasesVsPrev,
    deltaPctVsPrev,
    deltaVsMean,
    deltaRhovePts,
    deltaAmrVsPrev,
    isAboveAlertThreshold,
    serviceComparisons,
    episodeBuckets,
    findings,
  };
}
