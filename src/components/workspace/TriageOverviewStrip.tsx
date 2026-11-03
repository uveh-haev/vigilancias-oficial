import { ArrowRight, BarChart3 } from 'lucide-react';
import { QueueTabId, WorkspaceSection } from '../../types/clinical';

interface TriageOverviewStripProps {
  activeSection: WorkspaceSection;
  activeTab: QueueTabId;
  pendingFocusCount: number;
  urgentFocusCount: number;
  totalIaasCount: number;
  rhoveCapturedCount: number;
  pendingMicroCount: number;
  uncapturedMicroCount: number;
  outbreaksCount: number;
  identicalOutbreaksCount: number;
  selectedService: string;
  unnotifiedCount?: number;
  onSelectQueue: (tab: QueueTabId) => void;
  onSelectOutbreaks: () => void;
  onSelectIndicators: () => void;
  onSelectUnnotified?: () => void;
}

export function TriageOverviewStrip({
  activeSection,
  activeTab,
  pendingFocusCount,
  urgentFocusCount,
  totalIaasCount,
  rhoveCapturedCount,
  pendingMicroCount,
  uncapturedMicroCount,
  outbreaksCount,
  identicalOutbreaksCount,
  selectedService,
  unnotifiedCount = 0,
  onSelectQueue,
  onSelectOutbreaks,
  onSelectIndicators,
  onSelectUnnotified,
}: TriageOverviewStripProps) {
  const microTotal = pendingMicroCount + uncapturedMicroCount;
  const rhovePct =
    totalIaasCount > 0 ? Math.round((rhoveCapturedCount / totalIaasCount) * 100) : 0;

  const isFocusActive =
    activeSection === WorkspaceSection.Surveillance && activeTab === 'foco';
  const isIaasActive =
    activeSection === WorkspaceSection.Surveillance && activeTab === 'iaas';
  const isMicroActive =
    activeSection === WorkspaceSection.Surveillance &&
    (activeTab === 'cultpend' || activeTab === 'sincapturar');
  const isOutbreaksActive = activeSection === WorkspaceSection.Outbreaks;

  return (
    <section
      aria-label={
        selectedService
          ? `Panorama epidemiológico de ${selectedService}`
          : 'Panorama epidemiológico hospitalario'
      }
      className="bg-white dark:bg-[#111726] border border-slate-200/90 dark:border-slate-800 rounded-xl overflow-hidden"
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200/80 dark:divide-slate-800">
        {/* 1. Por revisar */}
        <button
          type="button"
          onClick={() => onSelectQueue('foco')}
          className={`p-4 sm:px-5 sm:py-4 text-left flex flex-col justify-between gap-1.5 transition-colors ${
            isFocusActive
              ? 'bg-teal-50/60 dark:bg-teal-950/25'
              : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
          }`}
        >
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Por revisar hoy
          </span>
          <div className="flex items-baseline gap-2.5">
            <span
              className={`font-mono text-2xl sm:text-[26px] font-semibold tabular-nums leading-none ${
                pendingFocusCount > 0
                  ? 'text-slate-900 dark:text-slate-100'
                  : 'text-emerald-700 dark:text-emerald-400'
              }`}
            >
              {pendingFocusCount}
            </span>
            {urgentFocusCount > 0 ? (
              <span className="text-xs font-semibold text-red-700 dark:text-red-400 tabular-nums">
                {urgentFocusCount} urgente{urgentFocusCount === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {pendingFocusCount === 0 ? 'Al día' : 'En cola activa'}
              </span>
            )}
          </div>
        </button>

        {/* 2. IAAS Activas */}
        <button
          type="button"
          onClick={() => onSelectQueue('iaas')}
          className={`p-4 sm:px-5 sm:py-4 text-left flex flex-col justify-between gap-1.5 transition-colors ${
            isIaasActive
              ? 'bg-teal-50/60 dark:bg-teal-950/25'
              : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
          }`}
        >
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            IAAS activas en censo
          </span>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-2xl sm:text-[26px] font-semibold tabular-nums leading-none text-slate-900 dark:text-slate-100">
              {totalIaasCount}
            </span>
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium tabular-nums">
              {rhoveCapturedCount} en RHOVE ({rhovePct}%)
            </span>
          </div>
        </button>

        {/* 3. Seguimiento Microbiológico */}
        <button
          type="button"
          onClick={() =>
            onSelectQueue(
              uncapturedMicroCount > 0 && pendingMicroCount === 0 ? 'sincapturar' : 'cultpend'
            )
          }
          className={`p-4 sm:px-5 sm:py-4 text-left flex flex-col justify-between gap-1.5 transition-colors ${
            isMicroActive
              ? 'bg-teal-50/60 dark:bg-teal-950/25'
              : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
          }`}
        >
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Seguimiento de cultivos
          </span>
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-2xl sm:text-[26px] font-semibold tabular-nums leading-none text-slate-900 dark:text-slate-100">
              {microTotal}
            </span>
            <span
              className={`text-xs tabular-nums ${
                microTotal > 0
                  ? 'font-medium text-amber-700 dark:text-amber-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {pendingMicroCount} pend. · {uncapturedMicroCount} sin RHOVE
            </span>
          </div>
        </button>

        {/* 4. Clusters y Posibles Brotes */}
        <button
          type="button"
          onClick={onSelectOutbreaks}
          className={`p-4 sm:px-5 sm:py-4 text-left flex flex-col justify-between gap-1.5 transition-colors ${
            isOutbreaksActive
              ? 'bg-teal-50/60 dark:bg-teal-950/25'
              : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
          }`}
        >
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Clusters en vigilancia
          </span>
          <div className="flex items-baseline gap-2.5">
            <span
              className={`font-mono text-2xl sm:text-[26px] font-semibold tabular-nums leading-none ${
                outbreaksCount > 0
                  ? 'text-red-700 dark:text-red-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {outbreaksCount}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {identicalOutbreaksCount > 0
                ? `${identicalOutbreaksCount} ATB idéntico`
                : 'Sin ATB idéntico'}
            </span>
          </div>
        </button>
      </div>

      {/* Connected Historical Trends, Brecha RHOVE & CODECIN Shortcut Bar */}
      <div className="px-4 sm:px-5 py-2.5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/35 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-slate-600 dark:text-slate-400 inline-flex items-center gap-1.5">
            <BarChart3 className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400 shrink-0" />
            <span>Serie longitudinal NOM-045-SSA2 · Tendencias CODECIN</span>
          </span>
          {onSelectUnnotified && unnotifiedCount > 0 && (
            <button
              type="button"
              onClick={onSelectUnnotified}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 hover:bg-amber-200 transition-colors"
            >
              <span>{unnotifiedCount} casos sin capturar en RHOVE</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onSelectIndicators}
          className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-300 hover:underline whitespace-nowrap"
        >
          <span>Abrir dashboard CODECIN</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </section>
  );
}
