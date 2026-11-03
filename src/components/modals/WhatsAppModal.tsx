import { useEffect, useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

interface WhatsAppModalProps {
  open: boolean;
  initialText: string;
  onClose: () => void;
  onCopied: () => void;
}

export function WhatsAppModal({
  open,
  initialText,
  onClose,
  onCopied,
}: WhatsAppModalProps) {
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  const lineCount = text ? text.split('\n').length : 0;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.getElementById('wa-report-textarea') as HTMLTextAreaElement | null;
      textarea?.select();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col max-h-[88vh] shadow-2xl"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2
              id="wa-modal-title"
              className="text-base font-bold text-slate-900 dark:text-slate-100"
            >
              Resumen de guardia para WhatsApp
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Generado según la lista y el servicio activos · Puedes editarlo antes de copiarlo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto">
          <textarea
            id="wa-report-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={13}
            aria-label="Texto del resumen para WhatsApp"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/90 p-3.5 font-mono text-xs sm:text-[13px] leading-relaxed text-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/40">
          <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {lineCount} líneas · {text.length} caracteres
          </span>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copiado al portapapeles' : 'Copiar mensaje'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
