import { useEffect } from 'react';
import { FileCheck2, Loader2, X } from 'lucide-react';

export interface WorkspaceConfirmRequest {
  title: string;
  description: string;
  targetLabel: string;
  itemsPreview?: string[];
  confirmLabel: string;
  cancelLabel?: string;
}

interface WorkspaceConfirmModalProps {
  request: WorkspaceConfirmRequest | null;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WorkspaceConfirmModal({
  request,
  busy = false,
  onConfirm,
  onCancel,
}: WorkspaceConfirmModalProps) {
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [request, busy, onCancel]);

  if (!request) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-confirm-title"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-lg bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileCheck2 className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" />
            <h2
              id="workspace-confirm-title"
              className="font-display text-base font-bold text-slate-900 dark:text-slate-100 truncate"
            >
              {request.title}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Cancelar y cerrar"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {request.description}
          </p>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3.5 flex flex-col gap-2">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Destino en Google Workspace:{' '}
              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                {request.targetLabel}
              </strong>
            </div>

            {request.itemsPreview && request.itemsPreview.length > 0 && (
              <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1 max-h-36 overflow-y-auto pt-1 border-t border-slate-200/80 dark:border-slate-800">
                {request.itemsPreview.map((item, idx) => (
                  <li key={idx} className="truncate font-mono">
                    • {item}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors disabled:opacity-50"
            >
              {request.cancelLabel || 'Cancelar'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{busy ? 'Procesando…' : request.confirmLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
