import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { DoneRecord, QueueDefinition, QueueTabId, RadarEvent } from '../../types/clinical';
import { isFocusPending, ServiceSummary } from '../../domain/classification';
import { getServiceGroup, getSubArea, SERVICE_SUBAREAS } from '../../domain/services';

interface SidebarNavProps {
  services: ServiceSummary[];
  totalPendingFocus: number;
  totalUrgentFocus: number;
  selectedService: string;
  onSelectService: (service: string) => void;
  selectedSubArea: string;
  onSelectSubArea: (subArea: string) => void;
  queues: QueueDefinition[];
  activeTab: QueueTabId;
  onSelectTab: (tab: QueueTabId) => void;
  rows: RadarEvent[];
  outbreakIds: Set<string>;
  doneMap: Record<string, DoneRecord>;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function SidebarNav({
  services,
  totalPendingFocus,
  totalUrgentFocus,
  selectedService,
  onSelectService,
  selectedSubArea,
  onSelectSubArea,
  queues,
  activeTab,
  onSelectTab,
  rows,
  outbreakIds,
  doneMap,
  mobileOpen,
  onCloseMobile,
}: SidebarNavProps) {
  const [showSecondaryQueues, setShowSecondaryQueues] = useState<boolean>(true);

  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseMobile();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  const primaryQueues = queues.filter((q) => q.primary);
  const secondaryQueues = queues.filter((q) => !q.primary);

  const subAreaConfig = selectedService ? SERVICE_SUBAREAS[selectedService] : undefined;

  const subAreaCounts = (() => {
    if (!subAreaConfig || !selectedService) return null;
    const svcRows = rows.filter((r) => getServiceGroup(r) === selectedService);
    const countArea = (areaKey: string) =>
      svcRows
        .filter((r) => {
          if (areaKey === '_all') return true;
          const area = getSubArea(r);
          return areaKey === '_sin' ? !area : area === areaKey;
        })
        .filter((r) => isFocusPending(r, outbreakIds) && !doneMap[r.id]).length;

    const unspecifiedTotal = subAreaConfig.includeUnspecified
      ? svcRows.filter((r) => !getSubArea(r)).length
      : 0;

    return { countArea, unspecifiedTotal };
  })();

  const content = (
    <div className="flex flex-col gap-6">
      {/* Queues Section */}
      <section aria-label="Listas operativas">
        <div className="px-2.5 mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Listas de vigilancia
          </h2>
        </div>
        <div className="flex flex-col gap-0.5">
          {primaryQueues.map((q) => {
            const active = activeTab === q.id;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  onSelectTab(q.id);
                  onCloseMobile();
                }}
                aria-current={active ? 'true' : undefined}
                className={`w-full min-h-[42px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-teal-700 text-white dark:bg-teal-600 dark:text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 font-medium'
                }`}
              >
                <span className="truncate">{q.shortLabel}</span>
                <span
                  className={`font-mono text-xs tabular-nums shrink-0 ${
                    active
                      ? 'text-teal-50 font-semibold'
                      : q.tone === 'crit' && q.count > 0
                        ? 'text-red-600 dark:text-red-400 font-semibold'
                        : q.tone === 'warn' && q.count > 0
                          ? 'text-amber-700 dark:text-amber-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {q.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Secondary Queues */}
        <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800">
          <button
            type="button"
            aria-expanded={showSecondaryQueues}
            onClick={() => setShowSecondaryQueues((v) => !v)}
            className="w-full min-h-[36px] px-2.5 py-1.5 flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            <span>Seguimiento y archivo</span>
            {showSecondaryQueues ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>

          {showSecondaryQueues && (
            <div className="mt-1 flex flex-col gap-0.5">
              {secondaryQueues.map((q) => {
                const active = activeTab === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(q.id);
                      onCloseMobile();
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full min-h-[40px] px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left text-[13px] transition-colors ${
                      active
                        ? 'bg-teal-700 text-white dark:bg-teal-600 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{q.shortLabel}</span>
                    <span
                      className={`font-mono text-xs tabular-nums shrink-0 ${
                        active
                          ? 'text-teal-50 font-semibold'
                          : q.tone === 'warn' && q.count > 0
                            ? 'text-amber-700 dark:text-amber-400 font-medium'
                            : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {q.count}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Hospital Services Section */}
      <section
        aria-label="Servicios hospitalarios"
        className="pt-4 border-t border-slate-200/80 dark:border-slate-800"
      >
        <div className="px-2.5 mb-2 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Servicios hospitalarios
          </h2>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Por revisar</span>
        </div>

        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => {
              onSelectService('');
              onCloseMobile();
            }}
            className={`w-full min-h-[42px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-left text-sm transition-colors ${
              !selectedService
                ? 'bg-teal-700/10 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300 font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 font-medium'
            }`}
          >
            <span className="truncate">Todos los servicios</span>
            <span
              className={`font-mono text-xs tabular-nums shrink-0 ${
                totalUrgentFocus > 0
                  ? 'text-red-600 dark:text-red-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {totalPendingFocus}
            </span>
          </button>

          {services.map((svc) => {
            const active = selectedService === svc.name;
            return (
              <button
                key={svc.name}
                type="button"
                onClick={() => {
                  onSelectService(svc.name);
                  onCloseMobile();
                }}
                className={`w-full min-h-[40px] px-3 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left text-[13.5px] transition-colors ${
                  active
                    ? 'bg-teal-700/10 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <span className="truncate">{svc.name}</span>
                <span
                  className={`font-mono text-xs tabular-nums shrink-0 ${
                    svc.urgentFocus > 0
                      ? 'text-red-600 dark:text-red-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                  title={
                    svc.urgentFocus > 0
                      ? `${svc.pendingFocus} por revisar (${svc.urgentFocus} urgentes)`
                      : `${svc.pendingFocus} por revisar`
                  }
                >
                  {svc.pendingFocus}
                </span>
              </button>
            );
          })}
        </div>

        {/* Sub-area selector when Pediatría, Medicina Interna, or Urgencias Adultos is active */}
        {subAreaConfig && subAreaCounts && (
          <div className="mt-3 px-2.5">
            <label
              htmlFor="subarea-select"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
            >
              Subárea de {selectedService}
            </label>
            <select
              id="subarea-select"
              value={selectedSubArea}
              onChange={(e) => onSelectSubArea(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 font-medium"
            >
              <option value="">Todas ({subAreaCounts.countArea('_all')})</option>
              {subAreaConfig.areas.map(([label]) => (
                <option key={label} value={label}>
                  {label} ({subAreaCounts.countArea(label)})
                </option>
              ))}
              {subAreaCounts.unspecifiedTotal > 0 && (
                <option value="_sin">
                  Sin especificar ({subAreaCounts.countArea('_sin')})
                </option>
              )}
            </select>
          </div>
        )}
      </section>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block w-[264px] shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-2 pb-8">
          {content}
        </div>
      </aside>

      {/* Mobile Accessible Drawer */}
      {mobileOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Filtros y servicios hospitalarios"
          className="fixed inset-0 z-40 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-slate-950/55 backdrop-blur-xs"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-[min(86vw,320px)] max-w-full bg-white dark:bg-[#111726] border-r border-slate-200 dark:border-slate-800 h-full overflow-y-auto p-4 flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <span className="font-display font-bold text-base text-slate-900 dark:text-slate-100">
                Listas y servicios
              </span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Cerrar menú de filtros"
                className="w-11 h-11 rounded-lg inline-flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {content}
          </div>
        </div>
      )}
    </>
  );
}
