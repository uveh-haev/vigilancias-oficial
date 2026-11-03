import {
  BulletinPayload,
  CultureAttachment,
  NursingNote,
  SharedMark,
} from '../types/clinical';
import { createInitialDemoDataset } from './demoDataset';

interface AppsScriptRunner {
  withSuccessHandler: (cb: (res: any) => void) => AppsScriptRunner;
  withFailureHandler: (cb: (err: Error) => void) => AppsScriptRunner;
  leerBoletin: () => void;
  guardarBoletin: (json: string) => void;
  listarMarcas: () => void;
  guardarMarcas: (json: string) => void;
  listarNotasCambio: () => void;
  guardarNotaCambio: (json: string) => void;
  editarNotaCambio: (fila: number | string, texto: string) => void;
  eliminarNotaCambio: (fila: number | string) => void;
  marcarNotaAplicada: (fila: number | string) => void;
  listarCultivos: () => void;
  subirCultivo: (json: string) => void;
}

declare global {
  interface Window {
    google?: {
      script?: {
        run?: AppsScriptRunner;
      };
    };
    UVEH_LIBS?: Partial<{
      pdfjs: string;
      pdfjsw: string;
      pdflib: string;
      tess: string;
    }>;
    UVEH_TESS?: Record<string, unknown>;
    UVEH_parse?: unknown;
  }
}

const STORAGE_KEYS = {
  bulletin: 'uveh_standalone_bulletin_v4',
  marks: 'uveh_standalone_marks_v4',
  notes: 'uveh_standalone_notes_v4',
  cultures: 'uveh_standalone_cultures_v4',
};

export function isAppsScriptEnvironment(): boolean {
  return Boolean(window.google?.script?.run);
}

function readLocal<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      const initial = fallback();
      localStorage.setItem(key, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback();
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export function resetStandaloneDataset(): void {
  const seed = createInitialDemoDataset();
  writeLocal(STORAGE_KEYS.bulletin, seed.bulletin);
  writeLocal(STORAGE_KEYS.marks, seed.marks);
  writeLocal(STORAGE_KEYS.notes, seed.notes);
  writeLocal(STORAGE_KEYS.cultures, seed.cultures);
}

function callGas<T>(invoke: (runner: AppsScriptRunner) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const runner = window.google?.script?.run;
    if (!runner) {
      reject(new Error('Google Apps Script no disponible.'));
      return;
    }
    const wired = runner
      .withSuccessHandler((res: T) => resolve(res))
      .withFailureHandler((err: Error) => reject(err));
    invoke(wired);
  });
}

export interface ReadBulletinResponse {
  puedeEditar: boolean;
  data: string | null;
}

export async function fetchBulletin(): Promise<ReadBulletinResponse> {
  if (isAppsScriptEnvironment()) {
    return callGas<ReadBulletinResponse>((r) => r.leerBoletin());
  }
  const bulletin = readLocal<BulletinPayload>(
    STORAGE_KEYS.bulletin,
    () => createInitialDemoDataset().bulletin
  );
  return {
    puedeEditar: true,
    data: JSON.stringify(bulletin),
  };
}

export async function saveBulletin(payload: BulletinPayload): Promise<ReadBulletinResponse> {
  const serialized = JSON.stringify(payload);
  if (isAppsScriptEnvironment()) {
    return callGas<ReadBulletinResponse>((r) => r.guardarBoletin(serialized));
  }
  writeLocal(STORAGE_KEYS.bulletin, payload);
  return {
    puedeEditar: true,
    data: serialized,
  };
}

export async function fetchSharedMarks(): Promise<SharedMark[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<SharedMark[]>((r) => r.listarMarcas());
  }
  return readLocal<SharedMark[]>(STORAGE_KEYS.marks, () => createInitialDemoDataset().marks);
}

export async function saveSharedMarks(items: SharedMark[]): Promise<SharedMark[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<SharedMark[]>((r) => r.guardarMarcas(JSON.stringify(items)));
  }
  let current = readLocal<SharedMark[]>(STORAGE_KEYS.marks, () => createInitialDemoDataset().marks);
  items.forEach((item) => {
    current = current.filter((m) => m.key !== item.key);
    if (item.activa !== false) {
      current.push({
        ...item,
        autor: item.autor || 'uveh@hospital.gob.mx',
        fecha: item.fecha || new Date().toISOString(),
      });
    }
  });
  writeLocal(STORAGE_KEYS.marks, current);
  return current;
}

export async function fetchNursingNotes(): Promise<NursingNote[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<NursingNote[]>((r) => r.listarNotasCambio());
  }
  return readLocal<NursingNote[]>(STORAGE_KEYS.notes, () => createInitialDemoDataset().notes);
}

export async function createNursingNote(input: {
  id: string;
  nombre: string;
  cama: string;
  servicio: string;
  texto: string;
}): Promise<NursingNote[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<NursingNote[]>((r) => r.guardarNotaCambio(JSON.stringify(input)));
  }
  const current = readLocal<NursingNote[]>(
    STORAGE_KEYS.notes,
    () => createInitialDemoDataset().notes
  );
  const next: NursingNote[] = [
    {
      fila: Date.now(),
      ...input,
      autor: 'enfermeria.piso@hospital.gob.mx',
      fecha: new Date().toISOString(),
      aplicada: false,
      puede: true,
    },
    ...current,
  ];
  writeLocal(STORAGE_KEYS.notes, next);
  return next;
}

export async function updateNursingNote(
  fila: number | string,
  texto: string
): Promise<NursingNote[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<NursingNote[]>((r) => r.editarNotaCambio(fila, texto));
  }
  const current = readLocal<NursingNote[]>(
    STORAGE_KEYS.notes,
    () => createInitialDemoDataset().notes
  );
  const next = current.map((n) =>
    String(n.fila) === String(fila) ? { ...n, texto, editada: true } : n
  );
  writeLocal(STORAGE_KEYS.notes, next);
  return next;
}

export async function deleteNursingNote(fila: number | string): Promise<NursingNote[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<NursingNote[]>((r) => r.eliminarNotaCambio(fila));
  }
  const current = readLocal<NursingNote[]>(
    STORAGE_KEYS.notes,
    () => createInitialDemoDataset().notes
  );
  const next = current.filter((n) => String(n.fila) !== String(fila));
  writeLocal(STORAGE_KEYS.notes, next);
  return next;
}

export async function markNursingNoteApplied(fila: number | string): Promise<NursingNote[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<NursingNote[]>((r) => r.marcarNotaAplicada(fila));
  }
  const current = readLocal<NursingNote[]>(
    STORAGE_KEYS.notes,
    () => createInitialDemoDataset().notes
  );
  const next = current.map((n) =>
    String(n.fila) === String(fila) ? { ...n, aplicada: true } : n
  );
  writeLocal(STORAGE_KEYS.notes, next);
  return next;
}

export async function fetchCultureAttachments(): Promise<CultureAttachment[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<CultureAttachment[]>((r) => r.listarCultivos());
  }
  return readLocal<CultureAttachment[]>(
    STORAGE_KEYS.cultures,
    () => createInitialDemoDataset().cultures
  );
}

export async function uploadCultureAttachment(payload: {
  id: string;
  nombre: string;
  cama: string;
  servicio: string;
  filename: string;
  mimeType: string;
  base64: string;
  microorganismo?: string;
  muestra?: string;
}): Promise<CultureAttachment[]> {
  if (isAppsScriptEnvironment()) {
    return callGas<CultureAttachment[]>((r) => r.subirCultivo(JSON.stringify(payload)));
  }
  const current = readLocal<CultureAttachment[]>(
    STORAGE_KEYS.cultures,
    () => createInitialDemoDataset().cultures
  );
  const dataUrl = `data:${payload.mimeType || 'application/pdf'};base64,${payload.base64}`;
  const next: CultureAttachment[] = [
    {
      id: payload.id,
      nombre: payload.nombre,
      cama: payload.cama,
      servicio: payload.servicio,
      archivo: payload.filename,
      url: dataUrl,
      autor: 'uveh@hospital.gob.mx',
      fecha: new Date().toISOString(),
      microorganismo: payload.microorganismo,
      muestra: payload.muestra,
    },
    ...current,
  ];
  writeLocal(STORAGE_KEYS.cultures, next);
  return next;
}
