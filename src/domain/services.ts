import { PriorityLevel, RadarEvent } from '../types/clinical';
import { norm, normName } from './dates';

const PRIORITY_MAP: Record<string, PriorityLevel> = {
  inmediata: PriorityLevel.Urgent,
  hoy: PriorityLevel.Today,
  'proximo corte': PriorityLevel.NextCut,
  'seguimiento programado': PriorityLevel.Scheduled,
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  [PriorityLevel.Urgent]: 'Urgente · revisar primero',
  [PriorityLevel.Today]: 'Revisar hoy',
  [PriorityLevel.NextCut]: 'Siguiente corte',
  [PriorityLevel.Scheduled]: 'Solo seguimiento',
  [PriorityLevel.Unassigned]: 'Sin prioridad asignada',
};

const SERVICE_GROUPS: Array<[RegExp, string]> = [
  [
    /^(ucim|ucin|utip|uti pediatrica|unidad de terapia intermedia pediatrica|terapia intermedia pediatrica|lactantes|escolares|preescolares|pediatria|nefrologia pediatrica|oncologia pediatrica|urgencias pediatricas|observacion pediatrica|neonatologia|cunero)/,
    'Pediatría',
  ],
  [/^(ginecologia|obstetricia|tococirugia)/, 'Ginecología y Obstetricia'],
  [/^hemodialisis/, 'Medicina Interna'],
  [/^dialisis/, 'Diálisis'],
  [/^(cirugia oncologica|urologia|cirugia general)/, 'Cirugía General'],
  [/^(medicina interna|nefrologia|oncologia)/, 'Medicina Interna'],
  [/^(traumatologia|tyo)/, 'TYO'],
  [/^(unidad de quemados|quemados)/, 'Unidad de Quemados'],
  [/^urgencias/, 'Urgencias Adultos'],
  [/^ucia/, 'UCIA'],
];

const CANONICAL_SERVICES: Record<string, string> = {
  infectologia: 'Infectología',
  neumologia: 'Neumología',
  neurologia: 'Neurología',
  neurocirugia: 'Neurocirugía',
  cardiologia: 'Cardiología',
  'cirugia reconstructiva': 'Cirugía Reconstructiva',
  coloproctologia: 'Coloproctología',
  otorrinolaringologia: 'Otorrinolaringología',
  hematologia: 'Hematología',
  oncohematologia: 'Oncohematología',
  gastroenterologia: 'Gastroenterología',
  'consulta externa': 'Consulta Externa',
};

const SUBSERVICE_RULES: Record<string, Array<[RegExp, string]>> = {
  'Medicina Interna': [
    [/^hemodialisis/, 'Hemodiálisis'],
    [/^nefrologia/, 'Nefrología'],
    [/^oncologia/, 'Oncología'],
  ],
  'Cirugía General': [
    [/^cirugia oncologica/, 'Cirugía Oncológica'],
    [/^urologia/, 'Urología'],
  ],
  Pediatría: [
    [/^ucim/, 'UCIM'],
    [/^ucin/, 'UCIN'],
    [/^(utip|uti pediatrica|unidad de terapia intermedia pediatrica|terapia intermedia pediatrica)/, 'UTIP'],
  ],
};

const PEDIATRIC_AREAS: Array<[string, RegExp, RegExp?]> = [
  ['Lactantes', /\blactantes?\b/],
  ['Escolares', /\bescolares?\b/],
  ['Oncohematología', /onco\s*-?\s*hemato|\bhematooncolog|\boncopediatri/],
  ['UCIM', /\bucim\b/],
  ['UCIN', /\bucin\b/],
  ['UTIP', /\butip\b/],
  ['Terapia Intermedia', /terapia intermedia/],
  ['Nefrología pediátrica', /\bnefro/],
  ['Urgencias', /\burgencias\b/],
  ['Observación', /\bobservacion\b/],
];

const RENAL_AREAS: Array<[string, RegExp, RegExp?]> = [
  [
    'Hemodiálisis',
    /\bhemodialisis\b/,
    /\bhemodialisis\b|\b(erc|enfermedad renal cronica)\b[^.;/\n]{0,60}?\b(hd|tsfr)\b/,
  ],
  [
    'Diálisis peritoneal',
    /dialisis peritoneal|\bdp\b|cateter\s+(?:de|para)\s+dialisis/,
    /dialisis peritoneal|\bdp\b|cateter\s+(?:de|para)\s+dialisis/,
  ],
];

export interface SubAreaConfig {
  areas: Array<[string, RegExp, RegExp?]>;
  includeUnspecified: boolean;
  inspectDiagnosis?: boolean;
}

export const SERVICE_SUBAREAS: Record<string, SubAreaConfig> = {
  Pediatría: { areas: PEDIATRIC_AREAS, includeUnspecified: true },
  'Medicina Interna': { areas: RENAL_AREAS, includeUnspecified: false, inspectDiagnosis: true },
  'Urgencias Adultos': { areas: RENAL_AREAS, includeUnspecified: false, inspectDiagnosis: true },
};

export interface RowMetadata {
  grupo: string;
  subgrupo: string;
  subPed: string;
  priN: PriorityLevel;
  pacKey: string;
  searchText: string;
  outbreakSearchText: string;
}

const ROW_META_CACHE = new WeakMap<RadarEvent, RowMetadata>();

function extractUbicacionObs(row: RadarEvent): string {
  const match = String(row.obs || '').match(
    /(?:localizado en|→)\s*(?:Pediatr[ií]a|Medicina Interna|Urgencias),\s*([^,\n]+?)\s*,\s*cama/i
  );
  return match ? match[1] : '';
}

function extractCensusDiagnosis(row: RadarEvent): string {
  const match = String(row.obs || '').match(/diagn[oó]stico censal[^:\n]*:\s*([^\n]*)/i);
  return norm(`${match ? match[1] : ''} ${row.motivo || ''}`);
}

function computeServiceGroup(row: RadarEvent): string {
  const first = String(row.svc || '').split('/')[0].trim();
  if (!first) return 'Sin servicio';
  const normalized = norm(first);
  for (const [regex, label] of SERVICE_GROUPS) {
    if (regex.test(normalized)) return label;
  }
  return (
    CANONICAL_SERVICES[normalized] ||
    first.toLowerCase().replace(/(^|\s)(\S)/g, (_, a: string, b: string) => a + b.toUpperCase())
  );
}

function computeSubservice(row: RadarEvent, group: string): string {
  const rules = SUBSERVICE_RULES[group];
  if (!rules) return '';
  const normalized = norm(String(row.svc || '').split('/')[0]);
  for (const [regex, label] of rules) {
    if (regex.test(normalized)) return label;
  }
  return group;
}

function computeSubArea(row: RadarEvent, group: string): string {
  const config = SERVICE_SUBAREAS[group];
  if (!config) return '';
  const locationText = norm([row.svc, row.cama, extractUbicacionObs(row)].join(' '));
  const dxText = config.inspectDiagnosis ? extractCensusDiagnosis(row) : '';
  for (const [label, locRe, dxRe] of config.areas) {
    if (locRe.test(locationText) || (dxRe && dxRe.test(dxText))) {
      return label;
    }
  }
  return '';
}

function computePatientKey(row: RadarEvent): string {
  const exp = norm(row.exp);
  return exp ? `exp:${exp}` : `nc:${norm(row.nombre)}|${norm(row.cama)}`;
}

export function getRowMeta(row: RadarEvent): RowMetadata {
  let cached = ROW_META_CACHE.get(row);
  if (!cached) {
    const grupo = computeServiceGroup(row);
    cached = {
      grupo,
      subgrupo: computeSubservice(row, grupo),
      subPed: computeSubArea(row, grupo),
      priN: PRIORITY_MAP[norm(row.pri)] ?? PriorityLevel.Unassigned,
      pacKey: computePatientKey(row),
      searchText: norm(
        [row.nombre, row.cama, row.exp, row.micro, row.motivo, row.svc, row.tipo].join(' ')
      ),
      outbreakSearchText: norm([row.nombre, row.cama, row.exp, row.micro, row.svc].join(' ')),
    };
    ROW_META_CACHE.set(row, cached);
  }
  return cached;
}

export function getPriorityLevel(row: RadarEvent): PriorityLevel {
  return getRowMeta(row).priN;
}

export function getServiceGroup(row: RadarEvent): string {
  return getRowMeta(row).grupo;
}

export function getSubservice(row: RadarEvent): string {
  return getRowMeta(row).subgrupo;
}

export function getSubArea(row: RadarEvent): string {
  return getRowMeta(row).subPed;
}

export function getPatientKey(row: RadarEvent): string {
  return getRowMeta(row).pacKey;
}

export interface PatientIndexedList<T> {
  byKey: Map<string, Array<{ item: T; idx: number }>>;
  byName: Map<string, Array<{ item: T; idx: number }>>;
}

export function indexByPatient<T extends { id?: string; nombre?: string }>(
  list: T[]
): PatientIndexedList<T> {
  const byKey = new Map<string, Array<{ item: T; idx: number }>>();
  const byName = new Map<string, Array<{ item: T; idx: number }>>();
  (list || []).forEach((item, idx) => {
    const entry = { item, idx };
    if (item?.id) {
      const arr = byKey.get(item.id) || [];
      arr.push(entry);
      byKey.set(item.id, arr);
    }
    const normalizedName = normName(item?.nombre);
    if (normalizedName) {
      const arr = byName.get(normalizedName) || [];
      arr.push(entry);
      byName.set(normalizedName, arr);
    }
  });
  return { byKey, byName };
}

export function lookupByPatient<T>(
  index: PatientIndexedList<T>,
  patientKey: string,
  nombre?: string
): T[] {
  const byId = patientKey ? index.byKey.get(patientKey) : undefined;
  const normalizedName = normName(nombre);
  const byNom = normalizedName ? index.byName.get(normalizedName) : undefined;

  if (!byId && !byNom) return [];
  if (byId && !byNom) return byId.map((e) => e.item);
  if (!byId && byNom) return byNom.map((e) => e.item);

  const merged = new Map<number, T>();
  byId!.forEach((e) => merged.set(e.idx, e.item));
  byNom!.forEach((e) => merged.set(e.idx, e.item));
  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}
