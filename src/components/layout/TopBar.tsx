import { useRef } from 'react';
import { FileSpreadsheet, Loader2, RefreshCw, Upload } from 'lucide-react';
import { WorkspaceSection } from '../../types/clinical';

interface TopBarProps {
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  unnotifiedCount: number;
  outbreaksCount: number;
  pendingNotesCount: number;
  culturesCount: number;
  canWrite: boolean;
  refreshing: boolean;
  parsingExcel: boolean;
  onUploadExcel: (file: File) => void;
  onOpenGoogleSheets: () => void;
  onRefresh: () => void;
}

const NAV_ITEMS: Array<{ id: WorkspaceSection; label: string }> = [
  { id: WorkspaceSection.Surveillance, label: 'Vigilancia' },
  { id: WorkspaceSection.Unnotified, label: 'Sin RHOVE' },
  { id: WorkspaceSection.Outbreaks, label: 'Brotes' },
  { id: WorkspaceSection.Notes, label: 'Notas' },
  { id: WorkspaceSection.Cultures, label: 'Cultivos' },
  { id: WorkspaceSection.Indicators, label: 'CODECIN' },
];

export function TopBar({
  activeSection,
  onSelectSection,
  unnotifiedCount,
  outbreaksCount,
  pendingNotesCount,
  culturesCount,
  canWrite,
  refreshing,
  parsingExcel,
  onUploadExcel,
  onOpenGoogleSheets,
  onRefresh,
}: TopBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const countForSection = (id: WorkspaceSection): number => {
    if (id === WorkspaceSection.Unnotified) return unnotifiedCount;
    if (id === WorkspaceSection.Outbreaks) return outbreaksCount;
    if (id === WorkspaceSection.Notes) return pendingNotesCount;
    if (id === WorkspaceSection.Cultures) return culturesCount;
    return 0;
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/90 dark:border-slate-800/90 bg-white/95 dark:bg-[#0D1320]/95 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3 sm:gap-6 lg:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#vigilancia"
          onClick={(e) => {
            e.preventDefault();
            onSelectSection(WorkspaceSection.Surveillance);
          }}
          className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          RADAR UVEH
        </a>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav
          aria-label="Navegación principal"
          className="flex items-center gap-3.5 sm:gap-6 lg:gap-7 overflow-x-auto scrollbar-none h-full min-w-0"
        >
          {NAV_ITEMS.map((item) => {
            const active = activeSection === item.id;
            const count = countForSection(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative h-14 inline-flex items-center gap-1.5 text-sm transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'text-teal-700 dark:text-teal-300 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-medium'
                }`}
              >
                <span>{item.label}</span>
                {count > 0 && (
                  <span
                    className={`font-mono text-xs tabular-nums ${
                      active
                        ? 'text-teal-700 dark:text-teal-300'
                        : item.id === WorkspaceSection.Unnotified
                          ? 'text-amber-700 dark:text-amber-400 font-bold'
                          : item.id === WorkspaceSection.Outbreaks
                            ? 'text-red-600 dark:text-red-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    ({count})
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 inset-x-0 h-0.5 bg-teal-700 dark:bg-teal-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Cutoff Load Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {canWrite ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadExcel(file);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={onOpenGoogleSheets}
                title="Importar corte o sincronizar notas con Google Sheets"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
                <span className="hidden md:inline">Google Sheets</span>
              </button>
              <button
                type="button"
                disabled={parsingExcel}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 min-h-[40px] rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {parsingExcel ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 shrink-0" />
                )}
                <span>{parsingExcel ? 'Leyendo…' : 'Cargar corte'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 min-h-[40px] rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold transition-colors disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Sincronizando…' : 'Sincronizar'}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
