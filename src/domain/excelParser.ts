import * as XLSX from 'xlsx';
import { AntibiogramEntry, BulletinPayload, RadarEvent } from '../types/clinical';
import { norm, toISO } from './dates';

const COLUMN_PREFIXES: Record<keyof Omit<RadarEvent, 'id'>, string> = {
  det: 'fecha de deteccion',
  nombre: 'nombre completo',
  exp: 'expediente',
  edad: 'edad',
  sexo: 'sexo',
  cama: 'cama actual',
  svc: 'servicio actual',
  prev: 'servicios/ubicaciones previas',
  ing: 'fecha de ingreso',
  prog: 'programa de vigilancia',
  motivo: 'motivo de alerta',
  muestra: 'tipo/sitio de muestra',
  res: 'resultado',
  micro: 'microorganismo',
  disp: 'dispositivo',
  atb: 'tratamiento',
  epi: 'estado epidemiologico',
  notif: 'estado de notificacion',
  oper: 'estado operativo',
  pri: 'prioridad',
  accion: 'accion pendiente',
  resp: 'responsable',
  obs: 'observaciones',
  tipo: 'tipo de iaas',
  rhove: 'estado rhove',
  fcap: 'fecha de captura rhove',
  fres: 'fecha del resultado microbiologico',
  egreso: 'fecha de egreso',
};

const DATE_KEYS: Array<keyof RadarEvent> = ['det', 'ing', 'fcap', 'fres', 'egreso'];

function mapSheetRow(headers: string[], rawRow: unknown[]): RadarEvent {
  const out: Record<string, unknown> = {};

  for (const [key, prefix] of Object.entries(COLUMN_PREFIXES)) {
    const colIndex = headers.findIndex((h) => norm(h).startsWith(prefix));
    const val = colIndex >= 0 ? rawRow[colIndex] : null;
    if (val != null && val !== '') {
      out[key] = val;
    }
  }

  for (const dateKey of DATE_KEYS) {
    if (dateKey in out) {
      const parsed = toISO(out[dateKey]);
      if (parsed) out[dateKey] = parsed;
      else delete out[dateKey];
    }
  }

  for (const key of Object.keys(out)) {
    if (typeof out[key] === 'string') {
      out[key] = (out[key] as string).trim();
    }
    if (out[key] == null || out[key] === '') {
      delete out[key];
    }
  }

  const id = [out.exp, out.nombre, out.prog, out.motivo]
    .map(norm)
    .join('|')
    .slice(0, 160);

  return { ...(out as Omit<RadarEvent, 'id'>), id };
}

function parseCerradosSheet(wb: XLSX.WorkBook, activeRows: RadarEvent[]): RadarEvent[] {
  const sheetName = wb.SheetNames.find((n) => norm(n).includes('historial'));
  if (!sheetName) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });
  const headerIdx = aoa.findIndex((r) => r && r.some((c) => norm(c) === 'fecha de deteccion'));
  if (headerIdx < 0) return [];
  const headers = aoa[headerIdx].map((c) => String(c ?? ''));
  const activeIds = new Set(activeRows.map((r) => r.id));

  return aoa
    .slice(headerIdx + 1)
    .filter((r) => r && r.some((c) => c != null && String(c).trim() !== ''))
    .map((r) => mapSheetRow(headers, r))
    .filter((o) => (o.nombre || o.cama) && !activeIds.has(o.id))
    .map((o) => {
      if (o.obs && o.obs.length > 500) {
        return { ...o, obs: `…${o.obs.slice(-500)}` };
      }
      return o;
    });
}

function parseAntibiogramasSheet(wb: XLSX.WorkBook): AntibiogramEntry[] {
  const sheetName = wb.SheetNames.find((n) => norm(n).includes('antibiograma'));
  if (!sheetName) return [];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: null,
  });
  const headerIdx = aoa.findIndex((r) => r && r.some((c) => norm(c).startsWith('paciente')));
  if (headerIdx < 0) return [];

  const headers = aoa[headerIdx].map((c) => norm(c));
  const findCol = (prefix: string) => headers.findIndex((h) => h.startsWith(prefix));

  const iPac = findCol('paciente');
  const iMic = findCol('microorganismo');
  const iCod = findCol('codigo');
  const iCat = findCol('categoria');
  const iFecha = findCol('fecha de estudio');
  const iFolio = findCol('folio');

  if (iPac < 0 || iMic < 0 || iCod < 0 || iCat < 0) return [];

  const entries: AntibiogramEntry[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i];
    if (!row) continue;
    const pac = row[iPac];
    if (!pac) continue;
    const cat = String(row[iCat] ?? '')
      .trim()
      .toUpperCase();
    if (!cat) continue;

    entries.push({
      pac: String(pac).trim(),
      mic: row[iMic] != null ? String(row[iMic]) : undefined,
      cod: String(row[iCod] ?? '')
        .trim()
        .toUpperCase(),
      cat: cat[0],
      fecha: (iFecha >= 0 ? toISO(row[iFecha]) : null) || '',
      folio: iFolio >= 0 && row[iFolio] != null ? String(row[iFolio]).trim() : '',
    });
  }
  return entries;
}

export function parseRadarWorkbook(wb: XLSX.WorkBook): Omit<
  BulletinPayload,
  'notasEnf' | 'file' | 'publicado'
> {
  const activeSheet =
    wb.SheetNames.find((n) => norm(n).includes('radar activo')) || wb.SheetNames[0];
  if (!activeSheet) {
    throw new Error('El archivo Excel no contiene hojas válidas.');
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[activeSheet], {
    header: 1,
    raw: true,
    defval: null,
  });
  const headerIdx = aoa.findIndex((r) => r && r.some((c) => norm(c) === 'fecha de deteccion'));
  if (headerIdx < 0) {
    throw new Error(
      'No se encontró la fila de encabezados (“Fecha de detección”) en la hoja RADAR ACTIVO.'
    );
  }

  const headers = aoa[headerIdx].map((c) => String(c ?? ''));
  const rows = aoa
    .slice(headerIdx + 1)
    .filter((r) => r && r.some((c) => c != null && String(c).trim() !== ''))
    .map((r) => mapSheetRow(headers, r))
    .filter((o) => o.nombre || o.cama);

  let corte: string | null = null;
  const preambleText = aoa
    .slice(0, headerIdx)
    .flat()
    .filter(Boolean)
    .join(' ');
  const corteMatch = preambleText.match(/corte\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (corteMatch) corte = toISO(corteMatch[1]);

  let nota = '';
  const summarySheet = wb.SheetNames.find((n) => norm(n).includes('resumen'));
  if (summarySheet) {
    const summaryRows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[summarySheet], {
      header: 1,
      raw: true,
      defval: null,
    });
    for (const r of summaryRows) {
      if (!r) continue;
      const key = norm(r[0]);
      if (key === 'nota' && r[1]) nota = String(r[1]);
      if (key.includes('fecha de corte') && !corte) corte = toISO(r[1]);
    }
  }

  if (!corte) {
    const dates = rows
      .map((r) => r.det)
      .filter((d): d is string => Boolean(d))
      .sort();
    corte = dates[dates.length - 1] || null;
  }

  const abRows = parseAntibiogramasSheet(wb);
  const cerrados = parseCerradosSheet(wb, rows);

  return { rows, cerrados, corte, nota, abRows };
}

export function parseRadarArrayBuffer(buffer: ArrayBuffer) {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  return parseRadarWorkbook(workbook);
}

export function exportBulletinToExcel(bulletin: BulletinPayload): void {
  const wb = XLSX.utils.book_new();

  const headerLabels = [
    'Fecha de detección',
    'Nombre completo',
    'Expediente',
    'Edad',
    'Cama actual',
    'Servicio actual',
    'Servicios/ubicaciones previas',
    'Fecha de ingreso',
    'Programa de vigilancia',
    'Motivo de alerta',
    'Tipo/sitio de muestra',
    'Resultado',
    'Microorganismo',
    'Dispositivo',
    'Tratamiento',
    'Estado epidemiológico',
    'Estado de notificación',
    'Estado operativo',
    'Prioridad',
    'Acción pendiente',
    'Observaciones',
    'Tipo de IAAS',
    'Estado RHOVE',
    'Fecha de captura RHOVE',
    'Fecha del resultado microbiológico',
    'Fecha de egreso',
  ];

  const toRowArray = (r: RadarEvent) => [
    r.det || '',
    r.nombre || '',
    r.exp || '',
    r.edad ?? '',
    r.cama || '',
    r.svc || '',
    r.prev || '',
    r.ing || '',
    r.prog || '',
    r.motivo || '',
    r.muestra || '',
    r.res || '',
    r.micro || '',
    r.disp || '',
    r.atb || '',
    r.epi || '',
    r.notif || '',
    r.oper || '',
    r.pri || '',
    r.accion || '',
    r.obs || '',
    r.tipo || '',
    r.rhove || '',
    r.fcap || '',
    r.fres || '',
    r.egreso || '',
  ];

  const activeAoa = [
    [`RADAR ACTIVO UVEH`],
    headerLabels,
    ...(bulletin.rows || []).map(toRowArray),
  ];
  const wsActive = XLSX.utils.aoa_to_sheet(activeAoa);
  XLSX.utils.book_append_sheet(wb, wsActive, 'RADAR ACTIVO');

  const wsSummary = XLSX.utils.aoa_to_sheet([
    ['Fecha de corte', bulletin.corte || ''],
    ['Nota', bulletin.nota || ''],
  ]);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'RESUMEN');

  if (bulletin.cerrados?.length) {
    const wsClosed = XLSX.utils.aoa_to_sheet([
      headerLabels,
      ...bulletin.cerrados.map(toRowArray),
    ]);
    XLSX.utils.book_append_sheet(wb, wsClosed, 'HISTORIAL - CERRADOS');
  }

  if (bulletin.abRows?.length) {
    const wsAb = XLSX.utils.aoa_to_sheet([
      ['Paciente', 'Microorganismo', 'Código', 'Categoría', 'Fecha de estudio', 'Folio'],
      ...bulletin.abRows.map((a) => [a.pac, a.mic || '', a.cod, a.cat, a.fecha, a.folio]),
    ]);
    XLSX.utils.book_append_sheet(wb, wsAb, 'ANTIBIOGRAMAS');
  }

  const filename = `RADAR_UVEH_${bulletin.corte || 'corte'}.xlsx`;
  XLSX.writeFile(wb, filename);
}
