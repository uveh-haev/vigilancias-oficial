import { useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import {
  AssistedCriteriaResult,
  CriteriaEvaluation,
  CumpleValue,
  RadarEvent,
  SharedMark,
} from '../../types/clinical';
import {
  CRITERIA_CATALOG,
  CUMPLE_LABELS,
  suggestCriteriaCategory,
} from '../../domain/criteria';
import { formatDateTimeShort, shortAuthor } from '../../domain/dates';
import { evaluateEventCriteria } from '../../services/aiClinicalService';

interface CriteriaChecklistProps {
  event: RadarEvent;
  corte?: string | null;
  savedMark?: SharedMark;
  onSave: (event: RadarEvent, evaluation: CriteriaEvaluation) => Promise<boolean>;
  onClose: () => void;
}

export function CriteriaChecklist({
  event,
  corte = null,
  savedMark,
  onSave,
  onClose,
}: CriteriaChecklistProps) {
  const existing = savedMark?.detalle;
  const [cat, setCat] = useState<string>(() => existing?.cat || suggestCriteriaCategory(event));
  const [marcados, setMarcados] = useState<number[]>(() =>
    existing?.marcados ? [...existing.marcados] : []
  );
  const [cumple, setCumple] = useState<CumpleValue | ''>(() => existing?.cumple || '');
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [assistedResult, setAssistedResult] = useState<AssistedCriteriaResult | null>(null);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const selectedDef = CRITERIA_CATALOG.find((c) => c.key === cat);

  const toggleItem = (index: number) => {
    setMarcados((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleAssistedEvaluation = async () => {
    setValidationMsg(null);
    setAnalyzing(true);
    try {
      const result = await evaluateEventCriteria(event, corte, cat);
      setAssistedResult(result);
      const validCat = CRITERIA_CATALOG.find((c) => c.key === result.suggestedCategoryKey);
      const nextCat = validCat ? validCat.key : cat;
      if (nextCat) {
        setCat(nextCat);
        const maxLen = validCat ? validCat.items.length : selectedDef?.items.length || 0;
        const cleanIndices = (result.metIndices || []).filter(
          (i) => Number.isInteger(i) && i >= 0 && i < maxLen
        );
        setMarcados(cleanIndices);
      }
      if (result.suggestedVerdict) {
        setCumple(result.suggestedVerdict);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo completar la pre-validación con los datos del corte.';
      setValidationMsg(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!cat) {
      setValidationMsg('Selecciona primero la categoría diagnóstica de IAAS.');
      return;
    }
    if (!cumple) {
      setValidationMsg('Indica el dictamen preliminar antes de guardar.');
      return;
    }
    setValidationMsg(null);
    setSaving(true);
    const ok = await onSave(event, { cat, marcados, cumple });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/80 dark:border-slate-800 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          htmlFor={`crit-cat-${event.id}`}
          className="text-xs font-semibold text-slate-700 dark:text-slate-300"
        >
          Tipo de IAAS (cédula de apoyo UVEH)
        </label>

        <button
          type="button"
          disabled={analyzing || saving}
          onClick={handleAssistedEvaluation}
          className="min-h-[34px] px-2.5 py-1 rounded-md border border-teal-200 dark:border-teal-800/80 bg-teal-50/70 dark:bg-teal-950/30 hover:bg-teal-100/70 dark:hover:bg-teal-950/50 text-xs font-semibold text-teal-800 dark:text-teal-300 inline-flex items-center gap-1.5 transition-colors disabled:opacity-60 whitespace-nowrap"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              <span>Analizando datos…</span>
            </>
          ) : (
            <>
              <ClipboardCheck className="w-3.5 h-3.5 shrink-0" />
              <span>Pre-validar con datos del corte</span>
            </>
          )}
        </button>
      </div>

      <select
        id={`crit-cat-${event.id}`}
        value={cat}
        onChange={(e) => {
          setCat(e.target.value);
          setMarcados([]);
          setValidationMsg(null);
        }}
        className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
      >
        <option value="">Selecciona categoría diagnóstica…</option>
        {CRITERIA_CATALOG.map((item) => (
          <option key={item.key} value={item.key}>
            {item.title}
          </option>
        ))}
      </select>

      {assistedResult && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 p-3 flex flex-col gap-2 text-xs">
          <div className="font-semibold text-slate-800 dark:text-slate-200">
            Revisión asistida NOM-045-SSA2 / NHSN
          </div>
          {assistedResult.fundamentoClinico && (
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
              {assistedResult.fundamentoClinico}
            </p>
          )}
          {assistedResult.datosFaltantes?.length > 0 && (
            <div>
              <span className="font-semibold text-amber-800 dark:text-amber-300">
                Verificar en expediente antes de capturar en RHOVE:
              </span>
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-slate-600 dark:text-slate-400">
                {assistedResult.datosFaltantes.map((missing, i) => (
                  <li key={i}>{missing}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {selectedDef && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Criterios clínicos y microbiológicos observados:
          </span>
          {selectedDef.items.map((text, idx) => {
            const checked = marcados.includes(idx);
            return (
              <label
                key={idx}
                className="flex items-start gap-3 min-h-[44px] px-2.5 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer text-sm text-slate-800 dark:text-slate-200"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleItem(idx)}
                  className="mt-0.5 w-5 h-5 rounded border-slate-300 dark:border-slate-600 accent-teal-700 shrink-0"
                />
                <span className="leading-snug">{text}</span>
              </label>
            );
          })}
        </div>
      )}

      <div>
        <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          Dictamen preliminar de criterios
        </span>
        <div className="flex flex-wrap gap-2">
          {(Object.entries(CUMPLE_LABELS) as Array<[CumpleValue, string]>).map(([val, label]) => (
            <label
              key={val}
              className={`inline-flex items-center gap-2 min-h-[42px] px-3.5 py-2 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                cumple === val
                  ? 'border-teal-700 bg-teal-700/10 text-teal-800 dark:border-teal-400 dark:bg-teal-400/15 dark:text-teal-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <input
                type="radio"
                name={`cumple_${event.id}`}
                value={val}
                checked={cumple === val}
                onChange={() => {
                  setCumple(val);
                  setValidationMsg(null);
                }}
                className="w-4 h-4 accent-teal-700"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {validationMsg && (
        <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-400">
          {validationMsg}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="px-4 py-2 min-h-[42px] rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold transition-colors disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar criterios'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-2 min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cerrar
        </button>
      </div>

      {savedMark?.autor && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Registrado por {shortAuthor(savedMark.autor)}
          {savedMark.fecha ? ` · ${formatDateTimeShort(savedMark.fecha)}` : ''}
        </p>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Apoyo operativo de revisión: la clasificación definitiva se realiza conforme a la
        NOM-045-SSA2, criterios NHSN y dictamen del CODECIN.
      </p>
    </div>
  );
}
