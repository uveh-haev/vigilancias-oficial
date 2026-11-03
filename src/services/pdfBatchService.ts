import { CultureAttachment, PdfBatchPage, PdfBatchState, RadarEvent } from '../types/clinical';
import { norm } from '../domain/dates';
import { getPatientKey, getServiceGroup } from '../domain/services';
import { uploadCultureAttachment } from './appsScriptBridge';
import { uploadCultureFileToDrive } from './googleWorkspaceService';

const DEFAULT_LIBS = {
  pdfjs: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfjsw: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  pdflib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  tess: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
};

const STOP_WORDS = new Set(['de', 'la', 'del', 'ho', 'hijo', 'hija', 'los', 'las', 'el', 'y']);

export interface BatchPatientOption {
  pid: string;
  nombre: string;
  cama: string;
  servicio: string;
  tokens: string[];
}

function freeCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function loadExternalScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`No se pudo cargar ${url}`));
    document.head.appendChild(script);
  });
}

async function ensurePdfLibraries(): Promise<{ pdfjsLib: any; PDFLib: any; libs: typeof DEFAULT_LIBS }> {
  const libs = { ...DEFAULT_LIBS, ...(window.UVEH_LIBS || {}) };
  const win = window as any;
  if (!win.pdfjsLib) await loadExternalScript(libs.pdfjs);
  if (!win.PDFLib) await loadExternalScript(libs.pdflib);
  win.pdfjsLib.GlobalWorkerOptions.workerSrc = libs.pdfjsw;
  return { pdfjsLib: win.pdfjsLib, PDFLib: win.PDFLib, libs };
}

function tokenizeName(text: string): string[] {
  return norm(text)
    .replace(/[^a-z ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 6) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

function tokenMatchesSet(word: string, candidates: Set<string>): boolean {
  for (const candidate of candidates) {
    if (editDistanceAtMostOne(word, candidate)) return true;
  }
  return false;
}

export function buildBatchPatientOptions(rows: RadarEvent[]): BatchPatientOption[] {
  const map = new Map<string, BatchPatientOption>();
  (rows || []).forEach((r) => {
    const pid = getPatientKey(r);
    if (!map.has(pid)) {
      map.set(pid, {
        pid,
        nombre: r.nombre || '',
        cama: r.cama || '',
        servicio: getServiceGroup(r) || '',
        tokens: tokenizeName(r.nombre || ''),
      });
    }
  });
  return [...map.values()].sort(
    (a, b) =>
      a.servicio.localeCompare(b.servicio, 'es') || a.nombre.localeCompare(b.nombre, 'es')
  );
}

function matchPatientFromOcr(
  ocrName: string,
  patients: BatchPatientOption[]
): BatchPatientOption | null {
  const words = tokenizeName(String(ocrName).replace(',', ' '));
  if (words.length < 2) return null;

  const hits: BatchPatientOption[] = [];
  for (const p of patients) {
    const tokenSet = new Set(p.tokens);
    if (tokenSet.size < 2) continue;
    for (let i = 0; i < p.tokens.length - 1; i++) {
      tokenSet.add(p.tokens[i] + p.tokens[i + 1]);
    }
    const [smaller, larger] =
      words.length <= tokenSet.size ? [words, tokenSet] : [[...tokenSet], new Set(words)];
    if (Math.min(words.length, p.tokens.length) < 3) continue;
    if (smaller.every((w) => tokenMatchesSet(w, larger))) {
      hits.push(p);
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

function extractNameFromOcrText(rawText: string): string {
  const cleaned = String(rawText || '').replace(/\r/g, '');
  let match = cleaned.match(
    /Paciente:?[ \t]*([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ .'-]+,[ \t]*[A-ZÑÁÉÍÓÚ .'-]+)/
  );
  if (!match) {
    match = cleaned.match(
      /^[ \t]*([A-ZÑÁÉÍÓÚ][A-ZÑÁÉÍÓÚ .'-]+,[ \t]*[A-ZÑÁÉÍÓÚ .'-]+)[ \t]*$/m
    );
  }
  if (!match) return '';
  return match[1]
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\s+[^A-ZÑÁÉÍÓÚ ]*[A-ZÑ]{0,2}[^A-ZÑÁÉÍÓÚ ]*)+$/, (x) => (/,/.test(x) ? x : ''))
    .replace(/\s+\S{1,2}$/, '')
    .replace(/[\s-]+$/, '')
    .trim();
}

function uint8ToBase64(bytes: Uint8Array): string {
  let str = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(str);
}

export async function analyzeLabPdfBatch(
  file: File,
  rows: RadarEvent[],
  onProgress: (partial: PdfBatchState) => void
): Promise<void> {
  const state: PdfBatchState = {
    nombre: file.name,
    pages: [],
    fase: 'leyendo',
    msg: 'Abriendo documento PDF…',
    prog: 0,
    bytes: null,
  };
  onProgress({ ...state });

  let pdf: any = null;
  let worker: any = null;

  try {
    const { pdfjsLib, libs } = await ensurePdfLibraries();
    const bytes = await file.arrayBuffer();
    state.bytes = bytes;
    pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const totalPages: number = pdf.numPages;

    let ocrOk = true;
    try {
      await loadExternalScript(libs.tess);
      const Tesseract = (window as any).Tesseract;
      worker = await Tesseract.createWorker('eng', 1, window.UVEH_TESS || {});
    } catch {
      ocrOk = false;
    }
    state.ocrOk = ocrOk;

    const patients = buildBatchPatientOptions(rows);

    for (let i = 1; i <= totalPages; i++) {
      state.msg = `Analizando hoja ${i} de ${totalPages}…`;
      state.prog = (i - 1) / totalPages;
      onProgress({ ...state, pages: [...state.pages] });

      let pg: any = null;
      let fullCanvas: HTMLCanvasElement | null = null;
      let thumbCanvas: HTMLCanvasElement | null = null;
      let cropCanvas: HTMLCanvasElement | null = null;

      try {
        pg = await pdf.getPage(i);
        const viewport = pg.getViewport({ scale: 2 });
        fullCanvas = document.createElement('canvas');
        fullCanvas.width = viewport.width;
        fullCanvas.height = viewport.height;
        await pg.render({
          canvasContext: fullCanvas.getContext('2d'),
          viewport,
        }).promise;

        thumbCanvas = document.createElement('canvas');
        const scale = 360 / fullCanvas.width;
        thumbCanvas.width = 360;
        thumbCanvas.height = Math.round(fullCanvas.height * scale);
        thumbCanvas
          .getContext('2d')!
          .drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

        const page: PdfBatchPage = {
          n: i,
          thumb: thumbCanvas.toDataURL('image/jpeg', 0.65),
          ocr: '',
          texto: '',
          sel: '',
          estado: '',
        };
        freeCanvas(thumbCanvas);
        thumbCanvas = null;

        if (worker) {
          try {
            const cropHeight = Math.round(fullCanvas.height * 0.3);
            cropCanvas = document.createElement('canvas');
            cropCanvas.width = fullCanvas.width;
            cropCanvas.height = cropHeight;
            cropCanvas
              .getContext('2d')!
              .drawImage(fullCanvas, 0, 0, fullCanvas.width, cropHeight, 0, 0, fullCanvas.width, cropHeight);
            const r1 = await worker.recognize(cropCanvas);
            page.texto = r1.data?.text || '';
            freeCanvas(cropCanvas);
            cropCanvas = null;

            page.ocr = extractNameFromOcrText(page.texto);
            if (!page.ocr) {
              const r2 = await worker.recognize(fullCanvas);
              page.texto = r2.data?.text || '';
              page.ocr = extractNameFromOcrText(page.texto);
            }

            const hit = page.ocr ? matchPatientFromOcr(page.ocr, patients) : null;
            if (hit) {
              page.sel = hit.pid;
              page.estado = 'ok';
            } else if (/consulta\s*ext/i.test(page.texto)) {
              page.sel = '_omitir';
              page.estado = 'om';
            } else {
              page.estado = 'rev';
            }
          } catch {
            page.estado = 'rev';
          }
        } else {
          page.estado = 'rev';
        }

        state.pages.push(page);
      } finally {
        freeCanvas(cropCanvas);
        freeCanvas(thumbCanvas);
        freeCanvas(fullCanvas);
        if (pg?.cleanup) {
          try {
            pg.cleanup();
          } catch {
            // Ignore cleanup errors
          }
        }
      }
    }

    state.fase = 'revisar';
    state.msg = '';
    state.prog = 1;
  } catch (err: any) {
    state.fase = 'error';
    state.msg = `No se pudo procesar el PDF: ${err?.message || String(err)}`;
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // Ignore worker termination errors
      }
    }
    if (pdf?.destroy) {
      try {
        await pdf.destroy();
      } catch {
        // Ignore PDF destroy errors
      }
    }
  }

  onProgress({ ...state, pages: [...state.pages] });
}

async function compressPdfPages(bytes: ArrayBuffer, pageNumbers: number[]): Promise<Uint8Array> {
  const { pdfjsLib, PDFLib } = await ensurePdfLibraries();
  let pdf: any = null;
  try {
    pdf = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    const outDoc = await PDFLib.PDFDocument.create();

    for (const num of pageNumbers) {
      let pg: any = null;
      let cv: HTMLCanvasElement | null = null;
      try {
        pg = await pdf.getPage(num);
        const vp = pg.getViewport({ scale: 1.5 });
        cv = document.createElement('canvas');
        cv.width = Math.round(vp.width);
        cv.height = Math.round(vp.height);
        await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        const w = cv.width;
        const h = cv.height;
        const jpegBlob: Blob = await new Promise((res) =>
          cv!.toBlob((b) => res(b!), 'image/jpeg', 0.65)
        );
        freeCanvas(cv);
        cv = null;
        const img = await outDoc.embedJpg(new Uint8Array(await jpegBlob.arrayBuffer()));
        const page = outDoc.addPage([w, h]);
        page.drawImage(img, { x: 0, y: 0, width: w, height: h });
      } finally {
        freeCanvas(cv);
        if (pg?.cleanup) {
          try {
            pg.cleanup();
          } catch {
            // Ignore
          }
        }
      }
    }
    return await outDoc.save();
  } finally {
    if (pdf?.destroy) {
      try {
        await pdf.destroy();
      } catch {
        // Ignore
      }
    }
  }
}

export async function uploadLabPdfBatch(params: {
  batch: PdfBatchState;
  rows: RadarEvent[];
  existingAttachments: CultureAttachment[];
  driveAccessToken?: string | null;
  onProgress: (next: PdfBatchState) => void;
  onAttachmentsUpdated: (list: CultureAttachment[]) => void;
  onCloudBatchUploaded?: (newCloudItems: CultureAttachment[]) => Promise<void> | void;
}): Promise<void> {
  const {
    batch,
    rows,
    existingAttachments,
    driveAccessToken,
    onProgress,
    onAttachmentsUpdated,
    onCloudBatchUploaded,
  } = params;
  if (!batch.bytes) return;

  const { PDFLib } = await ensurePdfLibraries();
  const patients = buildBatchPatientOptions(rows);
  const pagesByPatient = new Map<string, number[]>();

  batch.pages.forEach((p, idx) => {
    if (p.sel && p.sel !== '_omitir') {
      const list = pagesByPatient.get(p.sel) || [];
      list.push(idx);
      pagesByPatient.set(p.sel, list);
    }
  });

  const hoy = new Date()
    .toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '-');

  const total = pagesByPatient.size;
  let currentIdx = 0;
  let uploadedCount = 0;
  let duplicateCount = 0;
  const failures: string[] = [];
  const cloudUploadedItems: CultureAttachment[] = [];

  const working: PdfBatchState = { ...batch, fase: 'subiendo', prog: 0 };
  onProgress({ ...working });

  const srcDoc = await PDFLib.PDFDocument.load(batch.bytes);
  let latestAttachments = existingAttachments;

  for (const [pid, pageIndices] of pagesByPatient) {
    currentIdx += 1;
    const pac = patients.find((x) => x.pid === pid) || {
      pid,
      nombre: 'Paciente',
      cama: '',
      servicio: '',
      tokens: [],
    };
    working.msg = driveAccessToken
      ? `Subiendo a Google Drive ${currentIdx} de ${total}: ${pac.nombre}…`
      : `Adjuntando ${currentIdx} de ${total}: ${pac.nombre}…`;
    working.prog = (currentIdx - 1) / total;
    onProgress({ ...working });

    const filename = `Cultivo ${hoy} - ${pac.nombre || 'paciente'}.pdf`;
    const isDuplicate = latestAttachments.some(
      (a) => a.id === pid && a.archivo === filename
    );
    if (isDuplicate) {
      duplicateCount += 1;
      continue;
    }

    try {
      const outDoc = await PDFLib.PDFDocument.create();
      const copiedPages = await outDoc.copyPages(
        srcDoc,
        pageIndices.map((i) => batch.pages[i].n - 1)
      );
      copiedPages.forEach((cp: any) => outDoc.addPage(cp));
      let pdfBytes: Uint8Array = await outDoc.save();

      if (pdfBytes.length * 1.34 > 15 * 1024 * 1024) {
        throw new Error('pesa más de 15 MB');
      }

      const payload = {
        id: pid,
        nombre: pac.nombre,
        cama: pac.cama,
        servicio: pac.servicio,
        filename,
        mimeType: 'application/pdf',
        base64: uint8ToBase64(pdfBytes),
      };

      let updated: CultureAttachment[];
      try {
        updated = await uploadCultureAttachment(payload);
      } catch (err1: any) {
        if (/SIN_ACCESO/.test(String(err1?.message || ''))) throw err1;
        working.msg = `Adjuntando ${currentIdx} de ${total}: ${pac.nombre} (comprimiendo)…`;
        onProgress({ ...working });
        pdfBytes = await compressPdfPages(
          batch.bytes,
          pageIndices.map((i) => batch.pages[i].n)
        );
        updated = await uploadCultureAttachment({
          ...payload,
          base64: uint8ToBase64(pdfBytes),
        });
      }

      if (driveAccessToken) {
        const driveUploaded = await uploadCultureFileToDrive({
          fileOrBytes: pdfBytes,
          filename,
          mimeType: 'application/pdf',
          patientName: pac.nombre,
          cama: pac.cama,
          servicio: pac.servicio,
          accessToken: driveAccessToken,
        });
        updated = updated.map((att) =>
          att.id === pid && att.archivo === filename
            ? { ...att, url: driveUploaded.webViewLink }
            : att
        );
      }

      const addedAtt = updated.find((a) => a.id === pid && a.archivo === filename);
      if (addedAtt) {
        cloudUploadedItems.push(addedAtt);
      }

      latestAttachments = updated;
      onAttachmentsUpdated(updated);
      uploadedCount += 1;
    } catch (err: any) {
      const msg = String(err?.message || err || '')
        .replace(/^Error:\s*/, '')
        .slice(0, 160);
      failures.push(
        `${pac.nombre}: ${
          msg.includes('SIN_ACCESO_CULTIVOS')
            ? 'tu cuenta no tiene permiso para adjuntar'
            : `no se pudo subir${msg ? ` (${msg})` : ''}`
        }`
      );
    }
  }

  if (cloudUploadedItems.length > 0 && onCloudBatchUploaded) {
    try {
      await onCloudBatchUploaded(cloudUploadedItems);
    } catch {
      // Local attachments already persisted
    }
  }

  working.fase = 'listo';
  working.prog = 1;
  working.msg = `Proceso completado: ${uploadedCount} adjunto${uploadedCount === 1 ? '' : 's'}${
    driveAccessToken ? ' en Google Drive' : ''
  }${
    duplicateCount ? ` · ${duplicateCount} ya existía${duplicateCount === 1 ? '' : 'n'}` : ''
  }${failures.length ? ` · ${failures.length} con error` : ''}.`;
  working.resumen = failures.join('\n');
  onProgress({ ...working });
}
