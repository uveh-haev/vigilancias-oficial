import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  DownloadCloud,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { UVEH_NOTES_SHEET_TITLE, extractSpreadsheetId } from '../../services/googleWorkspaceService';

interface GoogleSheetsModalProps {
  open: boolean;
  hasWorkspaceToken: boolean;
  isSignedIn: boolean;
  authorizingWorkspace: boolean;
  savedSpreadsheetInput: string;
  corte: string | null;
  activeEventsCount: number;
  pendingNotesCount: number;
  totalNotesCount: number;
  busyAction: 'import' | 'sync-notes' | 'export-new' | null;
  lastSyncedSheetUrl: string | null;
  onClose: () => void;
  onAuthorizeWorkspace: () => Promise<boolean>;
  onSaveSpreadsheetInput: (val: string) => void;
  onImportFromSheet: (spreadsheetInput: string) => Promise<boolean>;
  onRequestSyncNotes: (spreadsheetInput: string, onlyPending: boolean) => void;
  onRequestExportNewSheet: () => void;
}

export function GoogleSheetsModal({
  open,
  hasWorkspaceToken,
  isSignedIn,
  authorizingWorkspace,
  savedSpreadsheetInput,
  corte,
  activeEventsCount,
  pendingNotesCount,
  totalNotesCount,
  busyAction,
  lastSyncedSheetUrl,
  onClose,
  onAuthorizeWorkspace,
  onSaveSpreadsheetInput,
  onImportFromSheet,
  onRequestSyncNotes,
  onRequestExportNewSheet,
}: GoogleSheetsModalProps) {
  const [sheetInput, setSheetInput] = useState(savedSpreadsheetInput);
  const [onlyPendingNotes, setOnlyPendingNotes] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSheetInput(savedSpreadsheetInput);
      setLocalError(null);
    }
  }, [open, savedSpreadsheetInput]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyAction) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busyAction, onClose]);

  if (!open) return null;

  const validSheetId = extractSpreadsheetId(sheetInput);
  const notesTargetCount = onlyPendingNotes ? pendingNotesCount : totalNotesCount;

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    if (!validSheetId) {
      setLocalError('Pega el enlace completo de Google Sheets o el ID del documento.');
      return;
    }
    onSaveSpreadsheetInput(sheetInput.trim());
    const ok = await onImportFromSheet(sheetInput.trim());
    if (ok) {
      onClose();
    }
  };

  const handleSyncNotesClick = () => {
    setLocalError(null);
    if (!validSheetId) {
      setLocalError(
        'Indica primero el enlace o ID de la hoja de Google Sheets donde deseas registrar las notas.'
      );
      return;
    }
    onSaveSpreadsheetInput(sheetInput.trim());
    onRequestSyncNotes(sheetInput.trim(), onlyPendingNotes);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-sheets-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      onClick={() => {
        if (!busyAction) onClose();
      }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileSpreadsheet className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" />
            <h2
              id="google-sheets-modal-title"
              className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
            >
              Integración directa con Google Sheets
            </h2>
          </div>
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={onClose}
            aria-label="Cerrar ventana de Google Sheets"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Workspace Token Connection Gate */}
          {!hasWorkspaceToken ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-5 flex flex-col gap-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {isSignedIn
                    ? 'Renueva el permiso temporal de Google Sheets y Drive'
                    : 'Conecta tu cuenta de Google para usar Google Sheets'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Con tu autorización, RADAR UVEH puede leer directamente tu hoja institucional{' '}
                  <strong className="font-semibold text-slate-800 dark:text-slate-200">
                    RADAR ACTIVO
                  </strong>{' '}
                  sin descargar archivos Excel intermedios, o exportar las notas de piso y respaldos
                  de corte.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <GoogleSignInButton
                  onClick={() => void onAuthorizeWorkspace()}
                  loading={authorizingWorkspace}
                  label={
                    isSignedIn
                      ? 'Autorizar Google Sheets y Drive'
                      : 'Iniciar sesión con Google'
                  }
                />
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-900 dark:text-emerald-300">
              <span className="inline-flex items-center gap-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Conexión activa con Google Sheets y Google Drive en esta sesión.</span>
              </span>
              {lastSyncedSheetUrl && (
                <a
                  href={lastSyncedSheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-semibold underline hover:no-underline shrink-0"
                >
                  <span>Abrir hoja</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}

          {/* Institutional Sheet URL / ID Input */}
          <form onSubmit={handleImport} className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="uveh-gsheet-url"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Enlace o ID de la hoja de cálculo RADAR UVEH (Google Sheets)
              </label>
              <input
                id="uveh-gsheet-url"
                type="text"
                value={sheetInput}
                onChange={(e) => {
                  setSheetInput(e.target.value);
                  if (localError) setLocalError(null);
                }}
                placeholder="https://docs.google.com/spreadsheets/d/1AbC.../edit"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Lee automáticamente las pestañas <span className="font-mono">RADAR ACTIVO</span>,{' '}
                <span className="font-mono">HISTORIAL</span> y{' '}
                <span className="font-mono">ANTIBIOGRAMAS</span> igual que un archivo Excel.
              </p>
            </div>

            {localError && (
              <p className="text-xs font-medium text-red-700 dark:text-red-400">{localError}</p>
            )}

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="submit"
                disabled={!hasWorkspaceToken || Boolean(busyAction) || !sheetInput.trim()}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {busyAction === 'import' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <DownloadCloud className="w-4 h-4" />
                )}
                <span>
                  {busyAction === 'import'
                    ? 'Importando corte…'
                    : 'Leer corte en vista previa'}
                </span>
              </button>
            </div>
          </form>

          {/* Sync Floor Notes to Sheet */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Sincronizar notas operativas de piso hacia Google Sheets
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                Registra las notas capturadas por enfermería en la pestaña{' '}
                <span className="font-mono">{UVEH_NOTES_SHEET_TITLE}</span> de la hoja indicada
                arriba (evita duplicados automáticamente y solicita confirmación antes de escribir).
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyPendingNotes}
                  onChange={(e) => setOnlyPendingNotes(e.target.checked)}
                  className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                />
                <span>
                  Enviar solo notas pendientes ({pendingNotesCount} de {totalNotesCount})
                </span>
              </label>

              <button
                type="button"
                disabled={
                  !hasWorkspaceToken ||
                  Boolean(busyAction) ||
                  notesTargetCount === 0 ||
                  !sheetInput.trim()
                }
                onClick={handleSyncNotesClick}
                className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                <UploadCloud className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <span>
                  Enviar {notesTargetCount} nota{notesTargetCount === 1 ? '' : 's'} a Google Sheets
                </span>
              </button>
            </div>
          </div>

          {/* Export Full Backup to a New Google Sheet */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Generar nueva hoja de respaldo en Google Sheets
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Crea un documento nuevo en tu Google Drive con los {activeEventsCount} eventos del
                corte {corte || 'actual'}, cerrados, antibiogramas y notas.
              </p>
            </div>

            <button
              type="button"
              disabled={!hasWorkspaceToken || Boolean(busyAction) || activeEventsCount === 0}
              onClick={onRequestExportNewSheet}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 shrink-0 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Exportar corte a hoja nueva</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
