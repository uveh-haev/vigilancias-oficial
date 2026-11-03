import {
  AssistedCriteriaResult,
  ExtractedCultureReport,
  RadarEvent,
} from '../types/clinical';
import { CRITERIA_CATALOG } from '../domain/criteria';
import { getPatientKey, getServiceGroup } from '../domain/services';

function ensureOnlineForAssistant() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error(
      'Sin señal de red en este momento. Guarda el registro localmente y ejecuta la lectura asistida al recuperar conexión.'
    );
  }
}

export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] || '' : result;
      resolve({
        base64,
        mimeType:
          file.type ||
          (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      });
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] || '' : result);
    };
    reader.onerror = () => reject(new Error('No se pudo procesar el audio grabado.'));
    reader.readAsDataURL(blob);
  });
}

export async function extractCultureReportFromFile(
  file: File,
  censusRows: RadarEvent[]
): Promise<ExtractedCultureReport> {
  ensureOnlineForAssistant();
  const { base64, mimeType } = await fileToBase64(file);

  const seen = new Set<string>();
  const censusPatients = censusRows
    .map((r) => {
      const id = getPatientKey(r);
      if (seen.has(id) || !r.nombre) return null;
      seen.add(id);
      return {
        id,
        nombre: r.nombre,
        exp: r.exp || '',
        cama: r.cama || '',
        servicio: getServiceGroup(r),
      };
    })
    .filter(Boolean);

  const res = await fetch('/api/ai/extract-culture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mimeType,
      base64,
      censusPatients,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.error || 'No se pudo completar la lectura del reporte microbiológico.'
    );
  }
  return data as ExtractedCultureReport;
}

export async function transcribeClinicalAudio(
  audioBlob: Blob,
  mimeType: string
): Promise<string> {
  ensureOnlineForAssistant();
  const base64 = await blobToBase64(audioBlob);

  const res = await fetch('/api/ai/transcribe-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mimeType: mimeType || audioBlob.type || 'audio/webm',
      base64,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'No se pudo transcribir la nota de voz.');
  }
  return String(data?.text || '').trim();
}

export async function evaluateEventCriteria(
  event: RadarEvent,
  corte: string | null,
  categoryKey: string
): Promise<AssistedCriteriaResult> {
  ensureOnlineForAssistant();

  const categoriesCatalog = CRITERIA_CATALOG.map((c) => ({
    key: c.key,
    title: c.title,
    items: c.items.map((text, idx) => ({ index: idx, text })),
  }));

  const res = await fetch('/api/ai/evaluate-criteria', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event,
      corte,
      categoryKey,
      categoriesCatalog,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'No se pudo realizar la pre-validación de criterios.');
  }
  return data as AssistedCriteriaResult;
}
