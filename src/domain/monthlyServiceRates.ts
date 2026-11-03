import * as XLSX from 'xlsx';
import { BulletinState, CodecinSnapshot } from '../types/clinical';
import { fmtFull, norm } from './dates';

export interface ServiceDenominatorProfile {
  camasCensables: number;
  estanciaMediaDias: number;
  porcentajeOcupacion: number;
}

export const DEFAULT_SERVICE_PROFILES: Record<string, ServiceDenominatorProfile> = {
  UCIA: { camasCensables: 12, estanciaMediaDias: 4.8, porcentajeOcupacion: 85 },
  UCIN: { camasCensables: 15, estanciaMediaDias: 7.5, porcentajeOcupacion: 80 },
  'Medicina Interna': { camasCensables: 36, estanciaMediaDias: 6.8, porcentajeOcupacion: 90 },
  'Cirugía General': { camasCensables: 28, estanciaMediaDias: 4.5, porcentajeOcupacion: 82 },
  Pediatría: { camasCensables: 24, estanciaMediaDias: 5.2, porcentajeOcupacion: 75 },
  TYO: { camasCensables: 20, estanciaMediaDias: 5.8, porcentajeOcupacion: 85 },
  Traumatología: { camasCensables: 20, estanciaMediaDias: 5.8, porcentajeOcupacion: 85 },
  Neurocirugía: { camasCensables: 16, estanciaMediaDias: 6.2, porcentajeOcupacion: 85 },
  'Ginecología y Obstetricia': { camasCensables: 24, estanciaMediaDias: 3.2, porcentajeOcupacion: 72 },
  'Urgencias Adultos': { camasCensables: 22, estanciaMediaDias: 2.1, porcentajeOcupacion: 95 },
  'Unidad de Quemados': { camasCensables: 8, estanciaMediaDias: 12.0, porcentajeOcupacion: 70 },
  Infectología: { camasCensables: 12, estanciaMediaDias: 7.0, porcentajeOcupacion: 80 },
  Diálisis: { camasCensables: 10, estanciaMediaDias: 3.5, porcentajeOcupacion: 75 },
};

const GENERIC_PROFILE: ServiceDenominatorProfile = {
  camasCensables: 16,
  estanciaMediaDias: 5.0,
  porcentajeOcupacion: 80,
};

export interface CustomMonthDenominators {
  diasPaciente?: number;
  egresos?: number;
  camas?: number;
}

// Storage key for custom user-calibrated denominators: Record<`ym_service`, CustomMonthDenominators>
const DENOMINATORS_STORAGE_KEY = 'uveh_monthly_denominators_v1';

export function loadCustomDenominators(): Record<string, CustomMonthDenominators> {
  try {
    const raw = localStorage.getItem(DENOMINATORS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveCustomDenominator(
  ym: string,
  service: string,
  values: CustomMonthDenominators
): Record<string, CustomMonthDenominators> {
  const current = loadCustomDenominators();
  const key = `${ym}__${norm(service)}`;
  const updated = {
    ...current,
    [key]: { ...current[key], ...values },
  };
  try {
    localStorage.setItem(DENOMINATORS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // ignore quota
  }
  return updated;
}

export function getDaysInMonthFromCorte(corte: string): number {
  if (!corte) return 30;
  const parts = corte.slice(0, 10).split('-');
  if (parts.length >= 2) {
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    if (year > 2000 && month >= 1 && month <= 12) {
      return new Date(year, month, 0).getDate();
    }
  }
  return 30;
}

export function getYearMonthKey(corte: string): string {
  if (!corte) return 'corte-actual';
  return corte.slice(0, 7);
}

export interface ServiceMonthlyRateMetric {
  service: string;
  casosIaas: number;
  camas: number;
  diasPaciente: number;
  egresos: number;
  isCalibrated: boolean;
  // Rates
  tasaIncidenciaPct: number; // (casos / egresos) * 100
  densidadIncidencia: number; // (casos / diasPaciente) * 1000
  proporcionTotalIaas: number; // (casos / totalIaasMes) * 100
  // Historical context
  historicoMeanCasos: number;
  historicoMeanDensidad: number;
  historicoStdDevDensidad: number;
  umbralAlertaDensidad: number; // mean + 1 stdDev
  umbralEpidemiaDensidad: number; // mean + 2 stdDev
  // Endemic status: control | alarma | epidemia
  estadoCanal: 'control' | 'alarma' | 'epidemia';
  // Comparison vs previous month
  casosMesAnterior: number | null;
  densidadMesAnterior: number | null;
  deltaDensidadVsAnterior: number | null;
  tendenciaSimbolo: 'sube' | 'baja' | 'igual';
}

export interface HospitalMonthlySummary {
  id: string;
  corte: string;
  etiqueta: string;
  yearMonth: string;
  diasEnMes: number;
  isLive: boolean;
  totalIaas: number;
  capturadasRhove: number;
  rhovePct: number;
  urgentes: number;
  brotesActivos: number;
  clustersIdenticos: number;
  bleeCount: number;
  carbapenemResistantCount: number;
  defuncionesConIaas: number;
  // Global denominators
  totalCamas: number;
  totalDiasPaciente: number;
  totalEgresos: number;
  // Global rates
  tasaIncidenciaGlobal: number; // per 100 discharges
  densidadIncidenciaGlobal: number; // per 1000 patient-days
  // Services
  services: ServiceMonthlyRateMetric[];
  // Key highlights
  topServiceRate: ServiceMonthlyRateMetric | null;
  topServiceCases: ServiceMonthlyRateMetric | null;
  servicesInAlert: ServiceMonthlyRateMetric[];
  servicesInEpidemic: ServiceMonthlyRateMetric[];
}

export interface HistoricalServicePoint {
  corte: string;
  yearMonth: string;
  etiqueta: string;
  casos: number;
  diasPaciente: number;
  egresos: number;
  densidadIncidencia: number;
  tasaIncidenciaPct: number;
  hospitalDensidadGlobal: number;
}

export interface MonthlyStatisticalDataset {
  months: HospitalMonthlySummary[];
  allServices: string[];
  historicalSeriesByService: Record<string, HistoricalServicePoint[]>;
  currentMonth: HospitalMonthlySummary | null;
}

export function buildMonthlyStatisticalDataset(params: {
  snapshots: CodecinSnapshot[];
  liveCut: CodecinSnapshot | null;
  includeLiveCut: boolean;
  customDenominators?: Record<string, CustomMonthDenominators>;
}): MonthlyStatisticalDataset {
  const { snapshots, liveCut, includeLiveCut } = params;
  const customDenoms = params.customDenominators || loadCustomDenominators();

  // Combine and sort snapshots chronologically
  const rawList: CodecinSnapshot[] = [...snapshots];
  if (includeLiveCut && liveCut && !rawList.some((s) => s.id === liveCut.id)) {
    rawList.push(liveCut);
  }
  const sortedSnapshots = [...rawList].sort((a, b) => a.corte.localeCompare(b.corte));

  // Collect all known services across all snapshots
  const serviceSet = new Set<string>();
  Object.keys(DEFAULT_SERVICE_PROFILES).forEach((s) => serviceSet.add(s));
  sortedSnapshots.forEach((snap) => {
    Object.keys(snap.porServicio || {}).forEach((s) => {
      if (s) serviceSet.add(s);
    });
  });
  const allServices = Array.from(serviceSet).sort();

  // Step 1: Pre-calculate raw service cases and denominators for every snapshot
  interface RawMonthEntry {
    snap: CodecinSnapshot;
    ym: string;
    diasEnMes: number;
    serviceData: Record<
      string,
      {
        casos: number;
        camas: number;
        diasPaciente: number;
        egresos: number;
        isCalibrated: boolean;
      }
    >;
    totalIaas: number;
    totalCamas: number;
    totalDiasPaciente: number;
    totalEgresos: number;
  }

  const rawMonths: RawMonthEntry[] = sortedSnapshots.map((snap) => {
    const ym = getYearMonthKey(snap.corte);
    const diasEnMes = getDaysInMonthFromCorte(snap.corte);
    const serviceData: RawMonthEntry['serviceData'] = {};

    let totalCamas = 0;
    let totalDiasPaciente = 0;
    let totalEgresos = 0;

    allServices.forEach((svc) => {
      const profile = DEFAULT_SERVICE_PROFILES[svc] || GENERIC_PROFILE;
      const customKey = `${ym}__${norm(svc)}`;
      const custom = customDenoms[customKey];

      const camas = custom?.camas ?? profile.camasCensables;
      const calcDiasPaciente = Math.round(
        camas * diasEnMes * (profile.porcentajeOcupacion / 100)
      );
      const diasPaciente = custom?.diasPaciente ?? Math.max(10, calcDiasPaciente);
      const calcEgresos = Math.max(
        1,
        Math.round(diasPaciente / (profile.estanciaMediaDias || 5.0))
      );
      const egresos = custom?.egresos ?? calcEgresos;
      const isCalibrated = Boolean(
        custom?.diasPaciente !== undefined ||
          custom?.egresos !== undefined ||
          custom?.camas !== undefined
      );

      const casos = Number(snap.porServicio?.[svc] || 0);

      serviceData[svc] = {
        casos,
        camas,
        diasPaciente,
        egresos,
        isCalibrated,
      };

      totalCamas += camas;
      totalDiasPaciente += diasPaciente;
      totalEgresos += egresos;
    });

    return {
      snap,
      ym,
      diasEnMes,
      serviceData,
      totalIaas: snap.totalIaas || Object.values(snap.porServicio || {}).reduce((a, b) => a + b, 0),
      totalCamas,
      totalDiasPaciente,
      totalEgresos,
    };
  });

  // Step 2: Compute historical baseline distributions per service across all accumulated snapshots
  const serviceHistoricalStats: Record<
    string,
    {
      meanCasos: number;
      meanDensidad: number;
      stdDevDensidad: number;
      densidades: number[];
    }
  > = {};

  allServices.forEach((svc) => {
    const densidades: number[] = [];
    const casosArr: number[] = [];

    rawMonths.forEach((m) => {
      const data = m.serviceData[svc];
      if (data) {
        casosArr.push(data.casos);
        const dens = data.diasPaciente > 0 ? (data.casos / data.diasPaciente) * 1000 : 0;
        densidades.push(dens);
      }
    });

    const count = densidades.length || 1;
    const meanCasos =
      Math.round((casosArr.reduce((acc, v) => acc + v, 0) / count) * 10) / 10;
    const meanDensidad =
      Math.round((densidades.reduce((acc, v) => acc + v, 0) / count) * 100) / 100;

    const variance =
      densidades.reduce((acc, v) => acc + Math.pow(v - meanDensidad, 2), 0) / count;
    const stdDevDensidad = Math.round(Math.sqrt(variance) * 100) / 100;

    serviceHistoricalStats[svc] = {
      meanCasos,
      meanDensidad,
      stdDevDensidad,
      densidades,
    };
  });

  // Step 3: Build HospitalMonthlySummary for each month
  const historicalSeriesByService: Record<string, HistoricalServicePoint[]> = {};
  allServices.forEach((s) => {
    historicalSeriesByService[s] = [];
  });

  const months: HospitalMonthlySummary[] = rawMonths.map((m, idx) => {
    const prevMonth = idx > 0 ? rawMonths[idx - 1] : null;
    const totalIaas = m.totalIaas || 0;

    const densidadIncidenciaGlobal =
      m.totalDiasPaciente > 0
        ? Math.round(((totalIaas / m.totalDiasPaciente) * 1000) * 100) / 100
        : 0;

    const tasaIncidenciaGlobal =
      m.totalEgresos > 0
        ? Math.round(((totalIaas / m.totalEgresos) * 100) * 100) / 100
        : 0;

    const serviceMetrics: ServiceMonthlyRateMetric[] = allServices
      .map((svc) => {
        const d = m.serviceData[svc]!;
        const prevData = prevMonth ? prevMonth.serviceData[svc] : null;

        const tasaIncidenciaPct =
          d.egresos > 0 ? Math.round(((d.casos / d.egresos) * 100) * 100) / 100 : 0;
        const densidadIncidencia =
          d.diasPaciente > 0
            ? Math.round(((d.casos / d.diasPaciente) * 1000) * 100) / 100
            : 0;

        const proporcionTotalIaas =
          totalIaas > 0 ? Math.round(((d.casos / totalIaas) * 100) * 10) / 10 : 0;

        const hist = serviceHistoricalStats[svc] || {
          meanCasos: 0,
          meanDensidad: 0,
          stdDevDensidad: 0,
        };

        const umbralAlertaDensidad =
          Math.round((hist.meanDensidad + Math.max(0.5, hist.stdDevDensidad)) * 100) / 100;
        const umbralEpidemiaDensidad =
          Math.round((hist.meanDensidad + 2 * Math.max(0.5, hist.stdDevDensidad)) * 100) / 100;

        let estadoCanal: 'control' | 'alarma' | 'epidemia' = 'control';
        if (d.casos > 0) {
          if (densidadIncidencia > umbralAlertaDensidad) {
            estadoCanal = densidadIncidencia >= umbralEpidemiaDensidad ? 'epidemia' : 'alarma';
          }
        }

        const casosMesAnterior = prevData ? prevData.casos : null;
        const densidadMesAnterior =
          prevData && prevData.diasPaciente > 0
            ? Math.round(((prevData.casos / prevData.diasPaciente) * 1000) * 100) / 100
            : null;

        let deltaDensidadVsAnterior: number | null = null;
        let tendenciaSimbolo: 'sube' | 'baja' | 'igual' = 'igual';

        if (densidadMesAnterior !== null) {
          deltaDensidadVsAnterior =
            Math.round((densidadIncidencia - densidadMesAnterior) * 100) / 100;
          if (deltaDensidadVsAnterior > 0.1) tendenciaSimbolo = 'sube';
          else if (deltaDensidadVsAnterior < -0.1) tendenciaSimbolo = 'baja';
        }

        // Push to historical time series
        historicalSeriesByService[svc].push({
          corte: m.snap.corte,
          yearMonth: m.ym,
          etiqueta: m.snap.etiqueta,
          casos: d.casos,
          diasPaciente: d.diasPaciente,
          egresos: d.egresos,
          densidadIncidencia,
          tasaIncidenciaPct,
          hospitalDensidadGlobal: densidadIncidenciaGlobal,
        });

        return {
          service: svc,
          casosIaas: d.casos,
          camas: d.camas,
          diasPaciente: d.diasPaciente,
          egresos: d.egresos,
          isCalibrated: d.isCalibrated,
          tasaIncidenciaPct,
          densidadIncidencia,
          proporcionTotalIaas,
          historicoMeanCasos: hist.meanCasos,
          historicoMeanDensidad: hist.meanDensidad,
          historicoStdDevDensidad: hist.stdDevDensidad,
          umbralAlertaDensidad,
          umbralEpidemiaDensidad,
          estadoCanal,
          casosMesAnterior,
          densidadMesAnterior,
          deltaDensidadVsAnterior,
          tendenciaSimbolo,
        };
      })
      .sort((a, b) => b.densidadIncidencia - a.densidadIncidencia || b.casosIaas - a.casosIaas);

    const activeServicesWithCases = serviceMetrics.filter((s) => s.casosIaas > 0);
    const topServiceRate = activeServicesWithCases[0] || null;
    const topServiceCases =
      [...serviceMetrics].sort((a, b) => b.casosIaas - a.casosIaas)[0] || null;
    const servicesInAlert = serviceMetrics.filter((s) => s.estadoCanal === 'alarma');
    const servicesInEpidemic = serviceMetrics.filter((s) => s.estadoCanal === 'epidemia');

    const rhovePct =
      totalIaas > 0 ? Math.round(((m.snap.capturadasRhove || 0) / totalIaas) * 100) : 0;

    return {
      id: m.snap.id,
      corte: m.snap.corte,
      etiqueta: m.snap.etiqueta,
      yearMonth: m.ym,
      diasEnMes: m.diasEnMes,
      isLive: m.snap.id === liveCut?.id,
      totalIaas,
      capturadasRhove: m.snap.capturadasRhove || 0,
      rhovePct,
      urgentes: m.snap.urgentes || 0,
      brotesActivos: m.snap.brotesActivos || 0,
      clustersIdenticos: m.snap.clustersIdenticos || 0,
      bleeCount: m.snap.bleeCount || 0,
      carbapenemResistantCount: m.snap.carbapenemResistantCount || 0,
      defuncionesConIaas: m.snap.defuncionesConIaas || 0,
      totalCamas: m.totalCamas,
      totalDiasPaciente: m.totalDiasPaciente,
      totalEgresos: m.totalEgresos,
      tasaIncidenciaGlobal,
      densidadIncidenciaGlobal,
      services: serviceMetrics,
      topServiceRate,
      topServiceCases,
      servicesInAlert,
      servicesInEpidemic,
    };
  });

  const currentMonth = months[months.length - 1] || null;

  return {
    months,
    allServices,
    historicalSeriesByService,
    currentMonth,
  };
}

export function exportMonthlyRatesExcel(summary: HospitalMonthlySummary): void {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen General del Mes
  const summaryAoa = [
    ['REPORTE ESTADÍSTICO MENSUAL DE IAAS Y TASAS POR SERVICIO - UVEH / CODECIN'],
    ['Hospital de Alta Especialidad de Veracruz (HAEV)'],
    ['Mes / Periodo de corte:', summary.etiqueta, 'Fecha de corte:', summary.corte],
    ['Días del mes analizado:', summary.diasEnMes, 'Tipo de corte:', summary.isLive ? 'Corte en vivo' : 'Cierre mensual consolidado'],
    [],
    ['INDICADOR HOSPITALARIO GLOBAL', 'VALOR', 'UNIDAD DE MEDIDA', 'INTERPRETACIÓN EPIDEMIOLÓGICA'],
    ['Total de IAAS bajo vigilancia', summary.totalIaas, 'Casos', 'Casos activos confirmados en el mes'],
    ['Capturadas en plataforma RHOVE', summary.capturadasRhove, 'Casos', `${summary.rhovePct}% de cobertura oficial`],
    ['Pendientes urgentes de captura', summary.urgentes, 'Casos', 'Falta captura antes de 48h'],
    ['Días-Paciente del Hospital', summary.totalDiasPaciente, 'Días-estancia', 'Denominador global acumulado'],
    ['Egresos Hospitalarios del Mes', summary.totalEgresos, 'Altas / egresos', 'Denominador de egresos'],
    ['Densidad de Incidencia Global', summary.densidadIncidenciaGlobal, 'Por 1,000 Días-Paciente', 'Casos IAAS por cada 1,000 días de estancia'],
    ['Tasa de Incidencia Acumulada', summary.tasaIncidenciaGlobal, '% por 100 egresos', 'Porcentaje de pacientes hospitalizados que desarrollaron IAAS'],
    ['Aislamientos con fenotipo BLEE', summary.bleeCount, 'Aislamientos', 'Vigilancia de multirresistencia'],
    ['Resistencia a Carbapenémicos', summary.carbapenemResistantCount, 'Aislamientos', 'Vigilancia prioritaria COFEPRIS/RHOVE'],
    ['Brotes / Clusters activos', summary.brotesActivos, 'Clusters', `${summary.clustersIdenticos} con cepa idéntica`],
    ['Defunciones asociadas a IAAS', summary.defuncionesConIaas, 'Defunciones', 'En seguimiento del comité'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), 'Resumen Hospitalario');

  // Sheet 2: Tabla de Tasas por Servicio
  const tableHeaders = [
    'Servicio Hospitalario',
    'Casos IAAS',
    'Camas Censables',
    'Días-Paciente (Mes)',
    'Egresos (Mes)',
    'Tasa Incidencia (% Egresos)',
    'Densidad Incidencia (x 1,000 D.P.)',
    '% Contribución IAAS Hospital',
    'Media Histórica (x 1,000 D.P.)',
    'Umbral Alerta (+1 DE)',
    'Umbral Epidemia (+2 DE)',
    'Estado Canal Endémico',
    'Casos Mes Anterior',
    'D.I. Mes Anterior',
    'Variación D.I.',
    'Tendencia',
  ];

  const tableRows = summary.services.map((s) => [
    s.service,
    s.casosIaas,
    s.camas,
    s.diasPaciente,
    s.egresos,
    s.tasaIncidenciaPct,
    s.densidadIncidencia,
    s.proporcionTotalIaas,
    s.historicoMeanDensidad,
    s.umbralAlertaDensidad,
    s.umbralEpidemiaDensidad,
    s.estadoCanal === 'epidemia'
      ? 'ZONA EPIDÉMICA (BROTE)'
      : s.estadoCanal === 'alarma'
        ? 'ZONA DE ALARMA'
        : 'BAJO CONTROL',
    s.casosMesAnterior ?? 'N/D',
    s.densidadMesAnterior ?? 'N/D',
    s.deltaDensidadVsAnterior !== null ? (s.deltaDensidadVsAnterior > 0 ? `+${s.deltaDensidadVsAnterior}` : `${s.deltaDensidadVsAnterior}`) : 'N/D',
    s.tendenciaSimbolo === 'sube' ? 'INCREMENTO' : s.tendenciaSimbolo === 'baja' ? 'DESCENSO' : 'ESTABLE',
  ]);

  const sheetData = [
    ['TASAS DE INCIDENCIA Y DENSIDAD DE IAAS POR SERVICIO HOSPITALARIO'],
    [`Corte epidemiológico: ${summary.etiqueta} (${summary.corte})`],
    [],
    tableHeaders,
    ...tableRows,
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetData), 'Tasas por Servicio');

  const safeName = summary.yearMonth || summary.corte.slice(0, 7) || 'mensual';
  XLSX.writeFile(wb, `Tasas_IAAS_Servicio_${safeName}_HAEV.xlsx`);
}
