import { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  ExternalLink,
  Info,
  LineChart as LineChartIcon,
  Minus,
  RotateCcw,
  Sliders,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CodecinSnapshot } from '../../types/clinical';
import { fmtFull } from '../../domain/dates';
import {
  buildMonthlyStatisticalDataset,
  CustomMonthDenominators,
  exportMonthlyRatesExcel,
  HospitalMonthlySummary,
  loadCustomDenominators,
  saveCustomDenominator,
  ServiceMonthlyRateMetric,
} from '../../domain/monthlyServiceRates';

interface MonthlyStatisticalSummaryProps {
  snapshots: CodecinSnapshot[];
  liveCut: CodecinSnapshot | null;
  includeLiveCut: boolean;
  darkMode: boolean;
  onNavigateToService?: (service: string) => void;
  onNotify?: (msg: string) => void;
}

export function MonthlyStatisticalSummary({
  snapshots,
  liveCut,
  includeLiveCut,
  darkMode,
  onNavigateToService,
  onNotify,
}: MonthlyStatisticalSummaryProps) {
  const [customDenoms, setCustomDenoms] = useState<Record<string, CustomMonthDenominators>>(() =>
    loadCustomDenominators()
  );

  const dataset = useMemo(
    () =>
      buildMonthlyStatisticalDataset({
        snapshots,
        liveCut,
        includeLiveCut,
        customDenominators: customDenoms,
      }),
    [snapshots, liveCut, includeLiveCut, customDenoms]
  );

  // Selected month ID (default to current/newest)
  const [selectedMonthId, setSelectedMonthId] = useState<string>(() => {
    return dataset.currentMonth?.id || (dataset.months[dataset.months.length - 1]?.id ?? '');
  });

  // Active chart view tab
  const [chartView, setChartView] = useState<'rates_bar' | 'history_lines' | 'endemic_channel'>(
    'rates_bar'
  );

  // Filtered service in table
  const [serviceFilter, setServiceFilter] = useState('');

  // Selected service for endemic channel inspection
  const [inspectedService, setInspectedService] = useState<string>('UCIA');

  // Selected services for historical comparison line chart
  const [comparedServices, setComparedServices] = useState<string[]>([
    'UCIA',
    'Medicina Interna',
    'UCIN',
    'Cirugía General',
  ]);

  // Calibration Drawer state
  const [calibrationService, setCalibrationService] = useState<string | null>(null);
  const [calibDiasPaciente, setCalibDiasPaciente] = useState<string>('');
  const [calibEgresos, setCalibEgresos] = useState<string>('');
  const [calibCamas, setCalibCamas] = useState<string>('');

  // Find active month summary
  const activeMonth: HospitalMonthlySummary = useMemo(() => {
    const found = dataset.months.find((m) => m.id === selectedMonthId);
    return found || dataset.currentMonth || dataset.months[dataset.months.length - 1];
  }, [dataset, selectedMonthId]);

  const activeMonthIndex = useMemo(() => {
    return dataset.months.findIndex((m) => m.id === activeMonth.id);
  }, [dataset.months, activeMonth.id]);

  const handlePrevMonth = () => {
    if (activeMonthIndex > 0) {
      setSelectedMonthId(dataset.months[activeMonthIndex - 1].id);
    }
  };

  const handleNextMonth = () => {
    if (activeMonthIndex < dataset.months.length - 1) {
      setSelectedMonthId(dataset.months[activeMonthIndex + 1].id);
    }
  };

  const handleExportExcel = () => {
    exportMonthlyRatesExcel(activeMonth);
    onNotify?.(`Informe estadístico mensual de tasas por servicio (${activeMonth.etiqueta}) exportado.`);
  };

  const handleOpenCalibration = (metric: ServiceMonthlyRateMetric) => {
    setCalibrationService(metric.service);
    setCalibDiasPaciente(String(metric.diasPaciente));
    setCalibEgresos(String(metric.egresos));
    setCalibCamas(String(metric.camas));
  };

  const handleSaveCalibration = () => {
    if (!calibrationService) return;
    const dp = Number(calibDiasPaciente);
    const eg = Number(calibEgresos);
    const cm = Number(calibCamas);

    const next = saveCustomDenominator(activeMonth.yearMonth, calibrationService, {
      diasPaciente: !isNaN(dp) && dp > 0 ? dp : undefined,
      egresos: !isNaN(eg) && eg > 0 ? eg : undefined,
      camas: !isNaN(cm) && cm > 0 ? cm : undefined,
    });
    setCustomDenoms(next);
    setCalibrationService(null);
    onNotify?.(`Denominadores de ${calibrationService} calibrados para ${activeMonth.etiqueta}.`);
  };

  const handleResetCalibration = () => {
    if (!calibrationService) return;
    const next = saveCustomDenominator(activeMonth.yearMonth, calibrationService, {
      diasPaciente: undefined,
      egresos: undefined,
      camas: undefined,
    });
    setCustomDenoms(next);
    setCalibrationService(null);
    onNotify?.(`Denominadores de ${calibrationService} restaurados al modelo estándar.`);
  };

  // Filtered services for the table
  const filteredServices = useMemo(() => {
    if (!serviceFilter.trim()) return activeMonth.services;
    const q = serviceFilter.toLowerCase().trim();
    return activeMonth.services.filter((s) => s.service.toLowerCase().includes(q));
  }, [activeMonth.services, serviceFilter]);

  // Data for the BarChart (rates per service in the active month)
  const barChartData = useMemo(() => {
    return activeMonth.services
      .filter((s) => s.casosIaas > 0 || s.densidadIncidencia > 0)
      .slice(0, 10)
      .map((s) => ({
        service: s.service,
        densidad: s.densidadIncidencia,
        tasaInc: s.tasaIncidenciaPct,
        casos: s.casosIaas,
        estadoCanal: s.estadoCanal,
        meanHist: s.historicoMeanDensidad,
      }));
  }, [activeMonth.services]);

  // Data for Historical Lines Chart across months
  const lineChartData = useMemo(() => {
    return dataset.months.map((m) => {
      const entry: Record<string, string | number> = {
        label: m.corte.slice(2, 7), // "24-01", "26-05"
        corte: m.corte,
        etiqueta: m.etiqueta,
        hospitalGlobal: m.densidadIncidenciaGlobal,
      };
      comparedServices.forEach((svc) => {
        const found = m.services.find((s) => s.service === svc);
        entry[svc] = found ? found.densidadIncidencia : 0;
      });
      return entry;
    });
  }, [dataset.months, comparedServices]);

  // Data for Endemic Channel of inspected service
  const endemicChannelData = useMemo(() => {
    const series = dataset.historicalSeriesByService[inspectedService] || [];
    const activeMetric = activeMonth.services.find((s) => s.service === inspectedService);
    const mean = activeMetric?.historicoMeanDensidad ?? 0;
    const alerta = activeMetric?.umbralAlertaDensidad ?? 0;
    const epidemia = activeMetric?.umbralEpidemiaDensidad ?? 0;

    return series.map((pt) => ({
      label: pt.corte.slice(2, 7),
      corte: pt.corte,
      casos: pt.casos,
      densidad: pt.densidadIncidencia,
      mean,
      alerta,
      epidemia,
      isCurrent: pt.corte === activeMonth.corte,
    }));
  }, [dataset.historicalSeriesByService, inspectedService, activeMonth]);

  const toggleComparedService = (svc: string) => {
    setComparedServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc]
    );
  };

  const getStatusBadge = (estado: 'control' | 'alarma' | 'epidemia') => {
    switch (estado) {
      case 'epidemia':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 dark:bg-red-950/70 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">
            <AlertCircle className="w-3 h-3 shrink-0" />
            Zona Epidémica
          </span>
        );
      case 'alarma':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            Zona de Alarma
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            Bajo Control
          </span>
        );
    }
  };

  const SERVICE_COLORS = ['#0F766E', '#2563EB', '#D97706', '#9333EA', '#DC2626', '#059669', '#4F46E5'];

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Header Toolbar & Month Stepper */}
      <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-900">
                <BarChart3 className="w-4 h-4" />
              </span>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
                Resumen Estadístico Mensual de Tasas de IAAS por Servicio
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Densidad de incidencia por 1,000 días-paciente y tasa de ataque por 100 egresos con base en {dataset.months.length} meses de datos históricos acumulados.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Stepper */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-0.5">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={activeMonthIndex <= 0}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Mes anterior"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                aria-label="Seleccionar mes para el resumen"
                value={activeMonth.id}
                onChange={(e) => setSelectedMonthId(e.target.value)}
                className="px-2 py-1 bg-transparent text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden"
              >
                {dataset.months.map((m) => (
                  <option key={m.id} value={m.id} className="dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {m.etiqueta} ({m.totalIaas} IAAS) {m.isLive ? ' · En vivo' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={activeMonthIndex >= dataset.months.length - 1}
                className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Mes siguiente"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Jump to current */}
            {activeMonthIndex < dataset.months.length - 1 && (
              <button
                type="button"
                onClick={() => setSelectedMonthId(dataset.months[dataset.months.length - 1].id)}
                className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-teal-700 dark:text-teal-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Último corte</span>
              </button>
            )}

            {/* Export Excel */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Download className="w-4 h-4" />
              <span>Exportar Tasas (.xlsx)</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI Cards of Selected Month */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Densidad Incidencia Global
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-teal-700 dark:text-teal-400 tabular-nums">
              {activeMonth.densidadIncidenciaGlobal}
            </span>
            <span className="text-[10px] text-slate-500 font-medium">x 1,000 D.P.</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            {activeMonth.totalDiasPaciente.toLocaleString()} días-paciente
          </div>
        </div>

        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Tasa Incidencia Acumulada
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {activeMonth.tasaIncidenciaGlobal}%
            </span>
            <span className="text-[10px] text-slate-500 font-medium">de egresos</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            {activeMonth.totalEgresos.toLocaleString()} egresos hospitalarios
          </div>
        </div>

        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Servicio con Mayor Tasa
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-lg sm:text-xl font-bold font-mono text-amber-700 dark:text-amber-400 truncate">
              {activeMonth.topServiceRate ? activeMonth.topServiceRate.service : 'Sin IAAS'}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {activeMonth.topServiceRate
              ? `${activeMonth.topServiceRate.densidadIncidencia} x 1,000 D.P. (${activeMonth.topServiceRate.casosIaas} casos)`
              : '0 casos registrados'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Servicios en Alerta / Epidemia
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className={`text-xl sm:text-2xl font-bold font-mono tabular-nums ${activeMonth.servicesInEpidemic.length > 0 ? 'text-red-700 dark:text-red-400' : activeMonth.servicesInAlert.length > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
              {activeMonth.servicesInAlert.length + activeMonth.servicesInEpidemic.length}
            </span>
            <span className="text-[11px] text-slate-500">servicios</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            {activeMonth.servicesInEpidemic.length > 0
              ? `${activeMonth.servicesInEpidemic.length} en zona epidémica`
              : activeMonth.servicesInAlert.length > 0
                ? `${activeMonth.servicesInAlert.length} en zona de alarma`
                : 'Todos en control'}
          </div>
        </div>

        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Casos Totales y RHOVE
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
              {activeMonth.totalIaas}
            </span>
            <span className="text-[11px] text-slate-500">IAAS</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {activeMonth.capturadasRhove} capturadas ({activeMonth.rhovePct}%)
          </div>
        </div>

        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Resistencia y Defunciones
          </div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl sm:text-2xl font-bold font-mono text-purple-700 dark:text-purple-400 tabular-nums">
              {activeMonth.bleeCount + activeMonth.carbapenemResistantCount}
            </span>
            <span className="text-[11px] text-slate-500">MDR</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            {activeMonth.carbapenemResistantCount} Carb-R · {activeMonth.defuncionesConIaas} defunciones
          </div>
        </div>
      </div>

      {/* 3. Visual Charts Section */}
      <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Visualización Epidemiológica:
            </span>
            <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setChartView('rates_bar')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  chartView === 'rates_bar'
                    ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Tasas por Servicio en el Mes
              </button>
              <button
                type="button"
                onClick={() => setChartView('history_lines')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  chartView === 'history_lines'
                    ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Comparativa Histórica Mensual
              </button>
              <button
                type="button"
                onClick={() => setChartView('endemic_channel')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  chartView === 'endemic_channel'
                    ? 'bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Canal Endémico del Servicio
              </button>
            </div>
          </div>

          {/* Sub-controls based on chartView */}
          {chartView === 'endemic_channel' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Servicio:</span>
              <select
                aria-label="Seleccionar servicio para canal endémico"
                value={inspectedService}
                onChange={(e) => setInspectedService(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100"
              >
                {dataset.allServices.map((svc) => (
                  <option key={svc} value={svc}>
                    {svc}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Chart View 1: Bar chart of current month rates */}
        {chartView === 'rates_bar' && (
          <div className="pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Densidad de incidencia de IAAS (casos por cada 1,000 días-paciente) en <strong>{activeMonth.etiqueta}</strong>. Línea punteada: Promedio hospitalario ({activeMonth.densidadIncidenciaGlobal} x 1,000 D.P.).
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <span className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-red-600 inline-block" /> Zona Epidémica
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" /> Alarma
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-xs bg-teal-600 inline-block" /> Control
                </span>
              </div>
            </div>

            {barChartData.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No hay casos de IAAS reportados en los servicios para este mes.
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barChartData} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1E293B' : '#E2E8F0'} />
                    <XAxis
                      dataKey="service"
                      stroke={darkMode ? '#94A3B8' : '#64748B'}
                      fontSize={11}
                      tickLine={false}
                      angle={-20}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      stroke={darkMode ? '#94A3B8' : '#64748B'}
                      fontSize={11}
                      tickLine={false}
                      unit=" ‰"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs">
                            <div className="font-bold text-slate-900 dark:text-slate-100">{data.service}</div>
                            <div className="mt-1 flex flex-col gap-1">
                              <div>Densidad Incidencia: <strong>{data.densidad}</strong> x 1,000 D.P.</div>
                              <div>Tasa Incidencia: <strong>{data.tasaInc}%</strong> de egresos</div>
                              <div>Casos IAAS observados: <strong>{data.casos}</strong></div>
                              <div>Promedio histórico: <strong>{data.meanHist}</strong> x 1,000 D.P.</div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine
                      y={activeMonth.densidadIncidenciaGlobal}
                      stroke="#0F766E"
                      strokeDasharray="4 4"
                      label={{
                        value: `Promedio Hospital: ${activeMonth.densidadIncidenciaGlobal}`,
                        position: 'top',
                        fill: darkMode ? '#2DD4BF' : '#0F766E',
                        fontSize: 10,
                      }}
                    />
                    <Bar dataKey="densidad" name="Densidad de Incidencia (x 1,000 D.P.)" radius={[4, 4, 0, 0]}>
                      {barChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={
                            entry.estadoCanal === 'epidemia'
                              ? '#DC2626'
                              : entry.estadoCanal === 'alarma'
                                ? '#D97706'
                                : '#0F766E'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Chart View 2: Multi-service historical comparison lines */}
        {chartView === 'history_lines' && (
          <div className="pt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Comparar servicios:</span>
              {dataset.allServices.slice(0, 8).map((svc, idx) => {
                const isChecked = comparedServices.includes(svc);
                const color = SERVICE_COLORS[idx % SERVICE_COLORS.length];
                return (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => toggleComparedService(svc)}
                    className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors inline-flex items-center gap-1.5 ${
                      isChecked
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-600'
                        : 'bg-transparent text-slate-400 border-transparent hover:text-slate-600'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                    <span>{svc}</span>
                  </button>
                );
              })}
            </div>

            <div className="h-72 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData} margin={{ top: 10, right: 20, left: 0, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1E293B' : '#E2E8F0'} />
                  <XAxis
                    dataKey="label"
                    stroke={darkMode ? '#94A3B8' : '#64748B'}
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={darkMode ? '#94A3B8' : '#64748B'}
                    fontSize={11}
                    tickLine={false}
                    unit=" ‰"
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs">
                          <div className="font-bold text-slate-900 dark:text-slate-100">{pt.etiqueta}</div>
                          <div className="mt-1 flex flex-col gap-1">
                            {payload.map((item) => (
                              <div key={item.name} className="flex justify-between gap-4">
                                <span style={{ color: item.color }}>{item.name}:</span>
                                <span className="font-mono font-bold">{item.value} ‰</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="hospitalGlobal"
                    name="Global Hospital"
                    stroke="#64748B"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  {comparedServices.map((svc, idx) => (
                    <Line
                      key={svc}
                      type="monotone"
                      dataKey={svc}
                      name={svc}
                      stroke={SERVICE_COLORS[idx % SERVICE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Chart View 3: Endemic Channel for Selected Service */}
        {chartView === 'endemic_channel' && (
          <div className="pt-4 flex flex-col gap-2">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Canal endémico y umbrales de alerta epidemiológica para <strong>{inspectedService}</strong> a lo largo del tiempo.
              Verde: Control ($\le \mu$). Amarillo: Alarma ($\mu + 1\sigma$). Rojo: Epidemia ($\mu + 2\sigma$).
            </div>

            <div className="h-72 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={endemicChannelData} margin={{ top: 10, right: 20, left: 0, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#1E293B' : '#E2E8F0'} />
                  <XAxis
                    dataKey="label"
                    stroke={darkMode ? '#94A3B8' : '#64748B'}
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke={darkMode ? '#94A3B8' : '#64748B'}
                    fontSize={11}
                    tickLine={false}
                    unit=" ‰"
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const pt = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs">
                          <div className="font-bold text-slate-900 dark:text-slate-100">
                            {inspectedService} · Corte {pt.corte}
                          </div>
                          <div className="mt-1 flex flex-col gap-1">
                            <div>Densidad observada: <strong>{pt.densidad}</strong> x 1,000 D.P.</div>
                            <div>Casos observados: <strong>{pt.casos}</strong></div>
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-1 mt-1 text-slate-500">
                              <div>Media histórica ($\mu$): {pt.mean} ‰</div>
                              <div>Umbral Alerta ($\mu + 1\sigma$): {pt.alerta} ‰</div>
                              <div>Umbral Epidemia ($\mu + 2\sigma$): {pt.epidemia} ‰</div>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Line
                    type="monotone"
                    dataKey="epidemia"
                    name="Umbral Epidemia (+2 DE)"
                    stroke="#DC2626"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="alerta"
                    name="Umbral Alerta (+1 DE)"
                    stroke="#D97706"
                    strokeDasharray="3 3"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="mean"
                    name="Media Histórica (µ)"
                    stroke="#059669"
                    strokeDasharray="2 2"
                    strokeWidth={1.5}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="densidad"
                    name="Densidad Observada"
                    stroke="#2563EB"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 4. Complete Service Rates Table */}
      <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Tabla Detallada de Tasas de IAAS por Servicio ({activeMonth.etiqueta})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Cálculo estandarizado de tasas de incidencia y densidad hospitalaria. Haz clic en Calibrar para ajustar Días-Paciente o Egresos reales.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              placeholder="Buscar servicio..."
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 min-w-[180px]"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-2.5 px-3">Servicio</th>
                <th className="py-2.5 px-3 text-right">Casos IAAS</th>
                <th className="py-2.5 px-3 text-right">Camas</th>
                <th className="py-2.5 px-3 text-right">Días-Paciente</th>
                <th className="py-2.5 px-3 text-right">Egresos</th>
                <th className="py-2.5 px-3 text-right bg-teal-50/50 dark:bg-teal-950/20 text-teal-900 dark:text-teal-200">
                  D.I. (x 1,000 D.P.)
                </th>
                <th className="py-2.5 px-3 text-right">Tasa Incidencia (%)</th>
                <th className="py-2.5 px-3 text-right">% Hospital</th>
                <th className="py-2.5 px-3 text-right">Media Histórica</th>
                <th className="py-2.5 px-3 text-center">Canal Endémico</th>
                <th className="py-2.5 px-3 text-center">Variación</th>
                <th className="py-2.5 px-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredServices.map((metric) => (
                <tr
                  key={metric.service}
                  className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                    metric.estadoCanal === 'epidemia'
                      ? 'bg-red-50/40 dark:bg-red-950/20'
                      : metric.estadoCanal === 'alarma'
                        ? 'bg-amber-50/30 dark:bg-amber-950/15'
                        : ''
                  }`}
                >
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-1.5">
                      <span>{metric.service}</span>
                      {metric.isCalibrated && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-teal-500"
                          title="Denominadores calibrados manualmente para este mes"
                        />
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {metric.casosIaas}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                    {metric.camas}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                    {metric.diasPaciente.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                    {metric.egresos.toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-teal-800 dark:text-teal-300 bg-teal-50/50 dark:bg-teal-950/20">
                    {metric.densidadIncidencia.toFixed(2)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-800 dark:text-slate-200">
                    {metric.tasaIncidenciaPct.toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400">
                    {metric.proporcionTotalIaas}%
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-500 dark:text-slate-400">
                    {metric.historicoMeanDensidad.toFixed(2)} ‰
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {getStatusBadge(metric.estadoCanal)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {metric.deltaDensidadVsAnterior !== null ? (
                      <span
                        className={`inline-flex items-center gap-0.5 font-mono text-[11px] font-semibold ${
                          metric.tendenciaSimbolo === 'sube'
                            ? 'text-red-600 dark:text-red-400'
                            : metric.tendenciaSimbolo === 'baja'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-500'
                        }`}
                      >
                        {metric.tendenciaSimbolo === 'sube' ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : metric.tendenciaSimbolo === 'baja' ? (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {metric.deltaDensidadVsAnterior > 0
                            ? `+${metric.deltaDensidadVsAnterior}`
                            : `${metric.deltaDensidadVsAnterior}`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setInspectedService(metric.service);
                          setChartView('endemic_channel');
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                        title="Ver canal endémico"
                      >
                        Canal
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenCalibration(metric)}
                        className="p-1 rounded text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
                        title="Calibrar Días-Paciente y Egresos"
                        aria-label={`Calibrar denominadores de ${metric.service}`}
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                      {onNavigateToService && (
                        <button
                          type="button"
                          onClick={() => onNavigateToService(metric.service)}
                          className="p-1 rounded text-slate-500 hover:text-teal-700 dark:hover:text-teal-400 transition-colors"
                          title="Ir a pacientes del servicio"
                          aria-label={`Ver pacientes de ${metric.service}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Drawer / Modal for Denominator Calibration */}
      {calibrationService && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        >
          <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xl w-full max-w-md flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Calibrar Denominadores: {calibrationService}
                </h4>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Periodo: {activeMonth.etiqueta} ({activeMonth.corte})
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCalibrationService(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400">
              Si cuentas con los datos oficiales de Bioestadística o Archivo Clínico para este mes, puedes ingresar los días-paciente y egresos reales para que las tasas de incidencia se calculen de manera exacta.
            </p>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Días-Paciente del mes (Días-estancia):
                </label>
                <input
                  type="number"
                  value={calibDiasPaciente}
                  onChange={(e) => setCalibDiasPaciente(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Egresos / Altas del servicio en el mes:
                </label>
                <input
                  type="number"
                  value={calibEgresos}
                  onChange={(e) => setCalibEgresos(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Camas censables activas:
                </label>
                <input
                  type="number"
                  value={calibCamas}
                  onChange={(e) => setCalibCamas(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleResetCalibration}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 transition-colors"
              >
                Restaurar estándar
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalibrationService(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveCalibration}
                  className="px-4 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-2xs"
                >
                  Guardar Denominadores
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
