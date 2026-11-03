import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Filter,
  LayoutGrid,
  MessageSquareShare,
  Moon,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Sun,
  Table2,
  Users,
  X,
} from 'lucide-react';
import { BulletinState, ViewDensity, WorkspaceSection } from '../../types/clinical';
import { fmtFull, formatLongSpanishDate, formatTime, todayISO } from '../../domain/dates';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { OfflineBanner } from '../pwa/OfflineBanner';

interface WorkspaceToolbarProps {
  section: WorkspaceSection;
  bulletin: BulletinState;
  canWrite: boolean;
  publishing: boolean;
  refreshing: boolean;
  darkMode: boolean;
  viewDensity: ViewDensity;
  searchQuery: string;
  selectedService: string;
  selectedSubArea: string;
  hasActiveFilters: boolean;
  activeQueueLabel: string;
  onSearchChange: (q: string) => void;
  onClearFilters: () => void;
  onViewDensityChange: (v: ViewDensity) => void;
  onToggleDarkMode: () => void;
  onRefresh: () => void;
  onPublishPreview: () => void;
  onCancelPreview: () => void;
  onOpenWhatsApp: () => void;
  onOpenMobileFilters: () => void;
  onSelectGuide: () => void;
  isOnline: boolean;
  offlineQueueCount: number;
  flushingOffline: boolean;
  onFlushOffline: () => void;
  onInstalledPWA?: () => void;
  cloudConnected: boolean;
  cloudUserLabel: string | null;
  onOpenTeamModal: () => void;
}

function ClinicalRadarMark() {
  return (
    <div
      aria-hidden="true"
      className="w-10 h-10 rounded-xl bg-teal-700 dark:bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-2xs"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-5 h-5"
      >
        <circle cx="12" cy="12" r="9" strokeOpacity="0.35" />
        <path d="M12 3a9 9 0 0 1 9 9" />
        <path d="M12 8v8" />
        <path d="M8 12h8" />
      </svg>
    </div>
  );
}

export function WorkspaceToolbar({
  section,
  bulletin,
  canWrite,
  publishing,
  refreshing,
  darkMode,
  viewDensity,
  searchQuery,
  selectedService,
  selectedSubArea,
  hasActiveFilters,
  activeQueueLabel,
  onSearchChange,
  onClearFilters,
  onViewDensityChange,
  onToggleDarkMode,
  onRefresh,
  onPublishPreview,
  onCancelPreview,
  onOpenWhatsApp,
  onOpenMobileFilters,
  onSelectGuide,
  isOnline,
  offlineQueueCount,
  flushingOffline,
  onFlushOffline,
  onInstalledPWA,
  cloudConnected,
  cloudUserLabel,
  onOpenTeamModal,
}: WorkspaceToolbarProps) {
  const [localInput, setLocalInput] = useState(searchQuery);
  const composingRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalInput(searchQuery);
  }, [searchQuery]);

  // Global '/' or Cmd/Ctrl+K shortcut to focus search bar
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
        return;
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const isEditable =
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable);
        if (!isEditable && searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const scheduleUpdate = (val: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      onSearchChange(val);
    }, 120);
  };

  const isStale = Boolean(
    !bulletin.empty && !bulletin.preview && bulletin.corte && bulletin.corte < todayISO()
  );

  const hasSidebarInSection =
    section === WorkspaceSection.Surveillance || section === WorkspaceSection.Outbreaks;
  const showSearchRow =
    !bulletin.empty &&
    section !== WorkspaceSection.Guide &&
    section !== WorkspaceSection.Indicators &&
    section !== WorkspaceSection.Unnotified;
  const showViewToggle = section === WorkspaceSection.Surveillance;

  const searchPlaceholder =
    section === WorkspaceSection.Notes
      ? 'Buscar en notas por paciente, cama, servicio o autor…'
      : section === WorkspaceSection.Cultures
        ? 'Buscar cultivo por paciente, cama, servicio o nombre de archivo…'
        : section === WorkspaceSection.Outbreaks
          ? 'Filtrar clusters por microorganismo, paciente, cama o servicio…'
          : 'Buscar paciente, cama, expediente o microorganismo…';

  return (
    <div className="flex flex-col gap-4">
      {/* Institutional & Cut-off Context Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center gap-3.5 min-w-0">
          <ClinicalRadarMark />

          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
              Vigilancia Epidemiológica Hospitalaria
            </h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">HAEV</span>
              {bulletin.corte && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{formatLongSpanishDate(bulletin.corte)}</span>
                </>
              )}
              {!bulletin.empty && (
                <>
                  <span aria-hidden="true">·</span>
                  {bulletin.preview ? (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Vista previa sin publicar
                    </span>
                  ) : isStale ? (
                    <span className="font-medium text-amber-700 dark:text-amber-400">
                      Corte anterior ({fmtFull(bulletin.corte)})
                    </span>
                  ) : (
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      Corte al día
                      {bulletin.publicado ? ` · ${formatTime(bulletin.publicado)}` : ''}
                    </span>
                  )}
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>{canWrite ? 'Coordinación UVEH' : 'Consulta de piso'}</span>
            </div>
          </div>
        </div>

        {/* Workspace Secondary Utilities */}
        <div className="flex items-center gap-2">
          <PWAInstallButton onInstalled={onInstalledPWA} />

          <button
            type="button"
            onClick={onOpenTeamModal}
            title={
              cloudConnected
                ? `Sincronización multiusuario activa (${cloudUserLabel || 'equipo'})`
                : 'Iniciar sesión hospitalaria y control de roles'
            }
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              cloudConnected
                ? 'border-teal-600/60 dark:border-teal-500/60 bg-teal-50/60 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span className="hidden md:inline max-w-[120px] truncate">
              {cloudConnected ? cloudUserLabel || 'Equipo' : 'Equipo'}
            </span>
          </button>

          {canWrite && !bulletin.empty && (
            <button
              type="button"
              onClick={onOpenWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <MessageSquareShare className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span className="hidden md:inline">Resumen de guardia</span>
              <span className="md:hidden">Guardia</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSelectGuide}
            title="Guía operativa y criterios de uso"
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border text-xs sm:text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
              section === WorkspaceSection.Guide
                ? 'border-teal-600 dark:border-teal-500 bg-teal-50/70 dark:bg-teal-950/30 text-teal-800 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <span className="hidden sm:inline">Guía</span>
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Sincronizar datos con servidor"
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sincronizar</span>
          </button>

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={darkMode ? 'Modo claro' : 'Modo oscuro'}
            className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center justify-center text-slate-600 dark:text-slate-300 transition-colors shrink-0"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Offline Ward Signal & Sync Queue Banner */}
      <OfflineBanner
        isOnline={isOnline}
        pendingCount={offlineQueueCount}
        flushing={flushingOffline}
        onFlushNow={onFlushOffline}
      />

      {/* Preview Publish Alert */}
      {bulletin.preview && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/30 p-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <ShieldAlert className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-800 dark:text-slate-200">
              <p className="font-semibold">Vista previa cargada · pendiente de publicación</p>
              <p className="text-slate-600 dark:text-slate-400 mt-0.5 font-mono text-xs tabular-nums">
                {bulletin.file} · {bulletin.rows.length} eventos activos · Corte{' '}
                {fmtFull(bulletin.corte)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={publishing}
              onClick={onPublishPreview}
              className="px-4 py-2 min-h-[42px] rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {publishing ? 'Publicando…' : 'Publicar para enfermería'}
            </button>
            <button
              type="button"
              disabled={publishing}
              onClick={onCancelPreview}
              className="px-3.5 py-2 min-h-[42px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              Descartar
            </button>
          </div>
        </div>
      )}

      {/* Stale Bulletin Notice */}
      {isStale && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/25 px-3.5 py-2.5 flex items-center gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>
            Este boletín corresponde al{' '}
            <strong className="font-semibold">{formatLongSpanishDate(bulletin.corte)}</strong>. El
            corte de hoy aún no se ha publicado.
          </span>
        </div>
      )}

      {/* Mobile Filter Trigger + Contextual Search + View Switcher */}
      {showSearchRow && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            {/* Mobile service/queue selector button — ONLY rendered when SidebarNav exists */}
            {hasSidebarInSection && (
              <button
                type="button"
                onClick={onOpenMobileFilters}
                className="lg:hidden min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] flex items-center justify-between gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100"
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Filter className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                  <span className="truncate">
                    {selectedService || 'Todos los servicios'}
                    {selectedSubArea
                      ? ` (${selectedSubArea === '_sin' ? 'Sin subárea' : selectedSubArea})`
                      : ''}{' '}
                    · {section === WorkspaceSection.Outbreaks ? 'Brotes' : activeQueueLabel}
                  </span>
                </span>
                <span className="text-xs font-medium text-teal-700 dark:text-teal-400 shrink-0">
                  Cambiar
                </span>
              </button>
            )}

            {/* Persistent Search Input with IME composition & '/' shortcut */}
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="search"
                value={localInput}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={(e) => {
                  composingRef.current = false;
                  const val = e.currentTarget.value;
                  setLocalInput(val);
                  scheduleUpdate(val);
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocalInput(val);
                  if (!composingRef.current) {
                    scheduleUpdate(val);
                  }
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                autoComplete="off"
                className="w-full min-h-[44px] pl-10 pr-16 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors"
              />
              {localInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setLocalInput('');
                    onSearchChange('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-md inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <kbd
                  aria-hidden="true"
                  className="hidden sm:inline-flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[11px] font-mono text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 rounded border border-slate-200/70 dark:border-slate-700 pointer-events-none"
                >
                  /
                </kbd>
              )}
            </div>

            {/* Segmented View Density Toggle — Accessible on ALL viewports so users never get stuck */}
            {showViewToggle && (
              <div
                role="group"
                aria-label="Modo de visualización"
                className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-800 self-start sm:self-auto shrink-0"
              >
                <button
                  type="button"
                  onClick={() => onViewDensityChange('cards')}
                  className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    viewDensity === 'cards'
                      ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Tarjetas</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewDensityChange('table')}
                  className={`inline-flex items-center gap-1.5 min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    viewDensity === 'table'
                      ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  <Table2 className="w-3.5 h-3.5" />
                  <span>Tabla</span>
                </button>
              </div>
            )}
          </div>

          {/* Active Filter Context Escape Hatch */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 px-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span>Filtros activos:</span>
                {selectedService && (
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedService}
                  </strong>
                )}
                {selectedSubArea && (
                  <>
                    <span aria-hidden="true">·</span>
                    <strong className="font-semibold text-slate-800 dark:text-slate-200">
                      {selectedSubArea === '_sin' ? 'Sin subárea' : selectedSubArea}
                    </strong>
                  </>
                )}
                {searchQuery.trim() && (
                  <>
                    {selectedService && <span aria-hidden="true">·</span>}
                    <span>
                      Búsqueda:{' '}
                      <strong className="font-semibold text-slate-800 dark:text-slate-200">
                        “{searchQuery.trim()}”
                      </strong>
                    </span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={onClearFilters}
                className="inline-flex items-center gap-1 font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restablecer filtros</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
