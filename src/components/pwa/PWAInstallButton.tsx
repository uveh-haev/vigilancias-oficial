import { useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  onInstalled?: () => void;
}

export function PWAInstallButton({ onInstalled }: PWAInstallButtonProps) {
  const { isInstallable, canDirectPrompt, isIOS, isInstalled, promptInstall } = usePWAInstall();
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  if (isInstalled || !isInstallable) return null;

  const handleClick = async () => {
    if (canDirectPrompt) {
      const accepted = await promptInstall();
      if (accepted && onInstalled) onInstalled();
      return;
    }
    if (isIOS) {
      setIosGuideOpen(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Instalar RADAR UVEH en este dispositivo para uso rápido y sin señal en piso"
        className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-teal-200 dark:border-teal-800/80 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/70 dark:hover:bg-teal-950/50 text-xs sm:text-sm font-semibold text-teal-800 dark:text-teal-300 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">Instalar app</span>
      </button>

      {iosGuideOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIosGuideOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-pwa-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 p-5 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="ios-pwa-title"
                  className="font-display text-base font-bold text-slate-900 dark:text-slate-100"
                >
                  Instalar RADAR UVEH en iPhone o iPad
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                  Abre la app a pantalla completa y consulta el censo en servicios sin recepción Wi-Fi.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIosGuideOpen(false)}
                aria-label="Cerrar instrucciones"
                className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <ol className="flex flex-col gap-3 text-sm text-slate-800 dark:text-slate-200">
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold tabular-nums w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <span>
                  Toca el botón <strong className="font-semibold">Compartir</strong>{' '}
                  <Share className="w-3.5 h-3.5 inline-block text-teal-700 dark:text-teal-400 mx-0.5" />{' '}
                  en la barra de Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold tabular-nums w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 inline-flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <span>
                  Selecciona <strong className="font-semibold">Agregar a inicio</strong>{' '}
                  <PlusSquare className="w-3.5 h-3.5 inline-block text-teal-700 dark:text-teal-400 mx-0.5" />{' '}
                  y confirma en la esquina superior derecha.
                </span>
              </li>
            </ol>

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setIosGuideOpen(false)}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
