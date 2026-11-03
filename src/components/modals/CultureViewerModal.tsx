import { useEffect, useMemo } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';
import { CultureAttachment } from '../../types/clinical';
import { formatDateTimeShort, shortAuthor } from '../../domain/dates';

interface CultureViewerModalProps {
  culture: CultureAttachment | null;
  onClose: () => void;
}

function dataUriToBlobUrl(dataUri: string): { blobUrl: string; mime: string } | null {
  if (!dataUri.startsWith('data:')) return null;
  try {
    const commaIdx = dataUri.indexOf(',');
    if (commaIdx < 0) return null;
    const header = dataUri.slice(5, commaIdx);
    const isBase64 = header.includes(';base64');
    const mime = header.split(';')[0] || 'application/octet-stream';
    const rawPayload = dataUri.slice(commaIdx + 1);

    if (isBase64) {
      const bin = atob(rawPayload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) {
        bytes[i] = bin.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mime });
      return { blobUrl: URL.createObjectURL(blob), mime };
    }

    const decoded = decodeURIComponent(rawPayload);
    const blob = new Blob([decoded], { type: mime });
    return { blobUrl: URL.createObjectURL(blob), mime };
  } catch {
    return null;
  }
}

export function CultureViewerModal({ culture, onClose }: CultureViewerModalProps) {
  const converted = useMemo(() => {
    if (!culture?.url) return null;
    return dataUriToBlobUrl(culture.url);
  }, [culture?.url]);

  useEffect(() => {
    return () => {
      if (converted?.blobUrl) {
        URL.revokeObjectURL(converted.blobUrl);
      }
    };
  }, [converted]);

  useEffect(() => {
    if (!culture) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [culture, onClose]);

  if (!culture) return null;

  const hasInlineBlob = Boolean(converted?.blobUrl);
  const lowerFile = (culture.archivo || '').toLowerCase();
  const isImage =
    hasInlineBlob &&
    (converted?.mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(lowerFile));
  const isPdf =
    hasInlineBlob && (converted?.mime === 'application/pdf' || lowerFile.endsWith('.pdf'));
  const isExternalHttp = /^https?:\/\//i.test(culture.url);
  const resourceUrl = converted?.blobUrl || culture.url;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="culture-viewer-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[min(88vh,860px)] bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2
              id="culture-viewer-title"
              className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate"
            >
              {culture.archivo || 'Reporte microbiológico'}
            </h2>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {culture.nombre || 'Paciente'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Cama {culture.cama || 's/c'}</span>
              {culture.servicio && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{culture.servicio}</span>
                </>
              )}
              {culture.autor && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    Subido por {shortAuthor(culture.autor)}
                    {culture.fecha ? ` (${formatDateTimeShort(culture.fecha)})` : ''}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar visor de cultivo"
            className="w-10 h-10 rounded-lg inline-flex items-center justify-center text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Document Preview Surface */}
        <div className="flex-1 bg-slate-100 dark:bg-[#0B0F1A] overflow-auto flex items-center justify-center p-3 sm:p-5">
          {isImage && !isExternalHttp ? (
            <img
              src={resourceUrl}
              alt={culture.archivo || 'Cultivo adjunto'}
              referrerPolicy="no-referrer"
              className="max-w-full max-h-full object-contain rounded-lg bg-white shadow-xs"
            />
          ) : isPdf && !isExternalHttp ? (
            <iframe
              src={resourceUrl}
              title={culture.archivo || 'Visor de PDF microbiológico'}
              className="w-full h-full rounded-lg bg-white border border-slate-200 dark:border-slate-800"
            />
          ) : (
            <div className="max-w-md text-center bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-8 flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-700/10 dark:bg-teal-400/15 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Documento alojado en repositorio externo
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Este reporte microbiológico se encuentra almacenado en la carpeta compartida de
                Google Drive de la UVEH.
              </p>
              {isExternalHttp && (
                <a
                  href={culture.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 min-h-[42px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <span>Abrir en Google Drive</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111726] flex flex-wrap items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Presiona <kbd className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">Esc</kbd> para volver a la lista
          </span>
          <div className="flex items-center gap-2">
            {hasInlineBlob && (
              <a
                href={resourceUrl}
                download={culture.archivo || 'cultivo-uveh'}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Descargar archivo</span>
              </a>
            )}
            {isExternalHttp && (
              <a
                href={culture.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                <span>Abrir enlace</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
