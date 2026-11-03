import { CloudUpload, Loader2, WifiOff } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingCount: number;
  flushing: boolean;
  onFlushNow: () => void;
}

export function OfflineBanner({
  isOnline,
  pendingCount,
  flushing,
  onFlushNow,
}: OfflineBannerProps) {
  if (isOnline && pendingCount === 0) return null;

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-950/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <WifiOff className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
          <span>
            <strong className="font-semibold">Modo sin señal en piso</strong> · Puedes consultar el
            censo, marcar pacientes y registrar notas localmente.
          </span>
        </div>
        {pendingCount > 0 && (
          <span className="font-mono text-xs font-semibold tabular-nums text-amber-800 dark:text-amber-300 shrink-0">
            {pendingCount} cambio{pendingCount === 1 ? '' : 's'} en cola para sincronizar
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-lg border border-teal-200 dark:border-teal-800/70 bg-teal-50/70 dark:bg-teal-950/30 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200"
    >
      <div className="flex items-center gap-2.5">
        {flushing ? (
          <Loader2 className="w-4 h-4 text-teal-700 dark:text-teal-400 animate-spin shrink-0" />
        ) : (
          <CloudUpload className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
        )}
        <span className="tabular-nums">
          Conexión restablecida ·{' '}
          <strong className="font-semibold">{pendingCount}</strong> registro
          {pendingCount === 1 ? '' : 's'} capturado{pendingCount === 1 ? '' : 's'} sin señal.
        </span>
      </div>
      <button
        type="button"
        disabled={flushing}
        onClick={onFlushNow}
        className="min-h-[34px] px-3 py-1 rounded-md bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
      >
        {flushing ? 'Sincronizando…' : 'Sincronizar ahora'}
      </button>
    </div>
  );
}
