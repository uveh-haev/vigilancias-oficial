export enum PriorityLevel {
  Urgent = 0,
  Today = 1,
  NextCut = 2,
  Scheduled = 3,
  Unassigned = 4,
}

export enum WorkspaceSection {
  Surveillance = 'vigilancia',
  Unnotified = 'no-notificados',
  Outbreaks = 'brotes',
  Notes = 'notas',
  Cultures = 'cultivos',
  Indicators = 'indicadores',
  Guide = 'guia',
}

export type QueueTabId =
  | 'foco'
  | 'iaas'
  | 'cultpend'
  | 'sincult'
  | 'sincapturar'
  | 'reingresos'
  | 'brotes'
  | 'rhove'
  | 'egresos'
  | 'revisados'
  | 'descartados'
  | 'otros';

export type ViewDensity = 'cards' | 'table';

export interface RadarEvent {
  id: string;
  det?: string;
  nombre?: string;
  exp?: string;
  edad?: string | number;
  sexo?: string;
  cama?: string;
  svc?: string;
  prev?: string;
  ing?: string;
  prog?: string;
  motivo?: string;
  muestra?: string;
  res?: string;
  micro?: string;
  disp?: string;
  atb?: string;
  epi?: string;
  notif?: string;
  oper?: string;
  pri?: string;
  accion?: string;
  resp?: string;
  obs?: string;
  tipo?: string;
  rhove?: string;
  fcap?: string;
  fres?: string;
  egreso?: string;
}

export interface AntibiogramEntry {
  pac: string;
  mic?: string;
  cod: string;
  cat: string;
  fecha: string;
  folio: string;
}

export interface BulletinPayload {
  corte: string | null;
  nota: string;
  notasEnf: Record<string, string>;
  file: string;
  rows: RadarEvent[];
  cerrados: RadarEvent[];
  abRows: AntibiogramEntry[];
  publicado: string | null;
}

export interface BulletinState extends BulletinPayload {
  preview: boolean;
  empty: boolean;
  loading: boolean;
  error?: string;
}

export type CumpleValue = 'si' | 'no' | 'falta';

export interface CriteriaEvaluation {
  cat: string;
  marcados: number[];
  cumple: CumpleValue | '';
}

export interface SharedMark {
  key: string;
  tipo: 'revisado' | 'descartado' | 'criterios';
  activa?: boolean;
  autor?: string;
  fecha?: string;
  nombre?: string;
  cama?: string;
  servicio?: string;
  detalle?: CriteriaEvaluation;
}

export interface DoneRecord {
  at?: string | boolean;
  cls: 'revisado' | 'sin_iaas';
  autor?: string;
  fecha?: string;
}

export interface NursingNote {
  fila: number;
  id: string;
  nombre: string;
  cama: string;
  servicio: string;
  texto: string;
  autor: string;
  fecha: string;
  aplicada: boolean;
  editada?: boolean;
  puede?: boolean;
}

export interface CultureAttachment {
  id: string;
  nombre: string;
  cama: string;
  servicio: string;
  archivo: string;
  url: string;
  autor?: string;
  fecha?: string;
  microorganismo?: string;
  muestra?: string;
}

export interface OutbreakCluster {
  org: string;
  shared: string[];
  members: RadarEvent[];
  ab: boolean;
  identicalAtb?: boolean;
}

export interface MicroChip {
  label: string;
  captured: boolean;
}

export interface PatientGroup {
  patientKey: string;
  primary: RadarEvent;
  events: RadarEvent[];
  serviceGroup: string;
  subservice: string;
  subArea: string;
}

export type StandaloneRole = 'uveh' | 'enfermeria';

export interface AsyncResourceState {
  loading: boolean;
  error: string | null;
}

export interface QueueDefinition {
  id: QueueTabId;
  label: string;
  shortLabel: string;
  description: string;
  count: number;
  tone: 'crit' | 'warn' | 'brand' | 'ok' | 'info' | 'muted';
  primary?: boolean;
}

export interface PdfBatchPage {
  n: number;
  thumb: string;
  ocr: string;
  texto: string;
  sel: string;
  estado: 'ok' | 'rev' | 'om' | 'man' | '';
}

export interface PdfBatchState {
  nombre: string;
  pages: PdfBatchPage[];
  fase: 'elegir' | 'leyendo' | 'revisar' | 'subiendo' | 'listo' | 'error';
  msg: string;
  prog: number;
  ocrOk?: boolean;
  resumen?: string;
  bytes: ArrayBuffer | null;
}

export type AntibiogramInterpretation = 'Sensible' | 'Intermedio' | 'Resistente';

export interface ExtractedAntibiogramItem {
  antimicrobiano: string;
  codigo: string;
  cmi: string;
  interpretacion: AntibiogramInterpretation;
}

export interface ExtractedCultureReport {
  pacienteDetectado: string;
  expediente: string;
  cama: string;
  servicio: string;
  muestra: string;
  fechaReporte: string;
  folio: string;
  microorganismo: string;
  recuento: string;
  fenotipoResistencia: string;
  matchedPatientId: string;
  resumenClinico: string;
  antibiograma: ExtractedAntibiogramItem[];
}

export interface AssistedCriteriaResult {
  suggestedCategoryKey: string;
  metIndices: number[];
  suggestedVerdict: CumpleValue;
  fundamentoClinico: string;
  datosFaltantes: string[];
}

export interface CodecinSnapshot {
  id: string;
  corte: string;
  etiqueta: string;
  creadoEn: string;
  totalIaas: number;
  capturadasRhove: number;
  urgentes: number;
  brotesActivos: number;
  clustersIdenticos: number;
  bleeCount: number;
  carbapenemResistantCount: number;
  defuncionesConIaas: number;
  porSitio: Record<string, number>;
  porServicio: Record<string, number>;
}

export interface OfflineQueuedAction {
  id: string;
  createdAt: string;
  label: string;
  kind: 'mark' | 'note';
  marks?: SharedMark[];
  noteInput?: {
    id: string;
    nombre: string;
    cama: string;
    servicio: string;
    texto: string;
  };
}

export * from './outbreakStudy';

