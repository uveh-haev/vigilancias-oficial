import { CumpleValue, RadarEvent } from '../types/clinical';
import { norm } from './dates';

export interface CriteriaDefinition {
  key: string;
  title: string;
  regex: RegExp;
  items: string[];
}

/**
 * Criterios operacionales actualizados conforme al Manual de Procedimientos
 * Estandarizados para la Vigilancia Epidemiológica de las IAAS (RHOVE - Junio 2024).
 */
export const CRITERIA_CATALOG: CriteriaDefinition[] = [
  {
    key: 'nav',
    title: 'Neumonía asociada a ventilador (NAV · Manual 2024)',
    regex: /ventilador|ventilacion|\bnav\b|\bnavm\b/,
    items: [
      'Asistencia mecánica ventilatoria (tubo endotraqueal o traqueostomía) ≥48 h antes del inicio de síntomas, o retiro ≤48 h previas',
      'Imagenología: infiltrado nuevo o progresivo, consolidación o cavitación (≥2 hallazgos en ≥1 estudio)',
      'Sistémico: fiebre ≥38 °C, leucopenia ≤4,000/µL, leucocitosis ≥12,000/µL o alteración del estado de conciencia (>70 años)',
      'Respiratorio (≥2): esputo purulento nuevo/aumento de secreciones, tos/disnea/taquipnea, estertores o empeoramiento PaO₂/FiO₂ ≤240',
      'Muestra respiratoria válida mínimamente contaminada (aspirado bronquial/traqueal, LBA o cepillado protegido)',
    ],
  },
  {
    key: 'naas_rp',
    title: 'NAAS relacionada a procedimiento (NAAS-RP · Manual 2024)',
    regex: /naas.?rp|broncoscop|intubacion sin|videolaringoscop/,
    items: [
      'Inicio de signos y síntomas ≤48 h posteriores a broncoscopia, videolaringoscopia o intubación sin asistencia ventilatoria',
      'Imagenología: infiltrado nuevo o progresivo, consolidación o cavitación',
      'Criterios clínicos sistémicos y respiratorios de acuerdo con el grupo etario',
      'Toma de muestra respiratoria para confirmación microbiológica (exigida al 100% de IAAS)',
    ],
  },
  {
    key: 'neumo',
    title: 'NAAS no relacionada a procedimiento (NAAS-NRP · Manual 2024)',
    regex: /neumon|naas/,
    items: [
      'Inicio >48 h posteriores al ingreso hospitalario, sin procedimiento de vía aérea ni ventilación mecánica en las últimas 48 h',
      'Imagen de tórax con infiltrado nuevo o progresivo, consolidación o cavitación',
      'Fiebre (≥38 °C), leucopenia (≤4,000) o leucocitosis (≥12,000)',
      'Esputo purulento nuevo o cambio en las secreciones (<10 células epiteliales y >25 PMN/campo si es esputo)',
      'Tos, disnea, taquipnea, estertores o empeoramiento del intercambio gaseoso',
    ],
  },
  {
    key: 'itscc',
    title: 'ITS relacionada a catéter central (ITS-CC · Manual 2024)',
    regex: /cateter central|its.?cc|mahurkar|picc|umbilical/,
    items: [
      'Línea vascular central (temporal, permanente, PICC o umbilical) ≥48 h antes del inicio de síntomas, o hasta ≤72 h posterior a su retiro',
      'Al menos 2 signos/síntomas: fiebre/distermia/hipotermia, calosfríos, hipotensión, taquicardia, leucocitosis/leucopenia o bandas >10%',
      'Hemocultivo central + periférico con positividad diferencial >2 h (o ≥10³ UFC), o hemocultivo + punta de catéter Maki ≥15 UFC',
      'Si es microorganismo comensal de piel: ≥2 hemocultivos de sitios distintos con ≤24 h de diferencia',
      'El aislamiento no está relacionado a otro sitio primario de infección',
    ],
  },
  {
    key: 'itslab',
    title: 'ITS relacionada a procedimiento o infusión IV (ITS-RP / ITS-IV · Manual 2024)',
    regex: /\bits\b|torrente|bacteriemia|sanguinea|infusion/,
    items: [
      'Inicio dentro de las primeras 72 h posteriores a procedimiento invasivo distinto a CVC (vía periférica, línea arterial, HD) o terapia IV',
      'Al menos 2 criterios clínicos sistémicos de acuerdo con la edad (<1 año o ≥1 año)',
      'Uno o más hemocultivos periféricos positivos a patógeno reconocido no atribuible a otro foco primario',
      'Si se sospecha contaminación de solución/medicamento (ITS-IV): mismo agente aislado en la solución e inmovilización/aviso <24 h',
    ],
  },
  {
    key: 'ivu_cu',
    title: 'IVU asociada a catéter urinario (IVU-CU · Manual 2024)',
    regex: /\bivu\b|urinari|urocultivo|sonda vesical|foley/,
    items: [
      'Inicio >48 h tras colocación de catéter urinario (Foley simple, intermitente o permanente) o hasta ≤48 h posterior a su retiro',
      'Al menos 1 signo/síntoma sin otra causa: fiebre/distermia, escalofríos, dolor suprapúbico/costovertebral, disuria o alteración mental',
      'Urocultivo válido (punción de puerto, chorro medio o suprapúbica; NO bolsa colectora ni punta) con ≤2 especies',
      'Recuento ≥10⁵ UFC/mL (o ≥10³ y <10⁵ UFC/mL acompañado de esterasa/nitritos positivos o piuria >10 leucos/mL)',
    ],
  },
  {
    key: 'isq',
    title: 'Infección de sitio quirúrgico (IIS / IIP / IOE · Manual 2024)',
    regex: /incisional|organos y espacios|quirurg|herida|\bisq\b/,
    items: [
      'Inicio dentro de 30 días post-cirugía para IIS, o 30–90 días (hasta 1 año con implante) para IIP e IOE (día de cirugía = día 1)',
      'Secreción purulenta de incisión superficial/profunda o drenaje de órgano/espacio',
      'Dolor, eritema, calor, dehiscencia/apertura deliberada por cirujano, absceso por imagen/histopatología o diagnóstico médico de ISQ',
      'Muestra válida con limpieza y antisepsia previa: aspirado/secreción, biopsia o líquido orgánico (o hisopado + score Q en IIS)',
    ],
  },
  {
    key: 'icd',
    title: 'Infección por Clostridioides difficile (ICD · Manual 2024)',
    regex: /clostrid|difficile|\bicd\b|diarrea|pseudomembran/,
    items: [
      'Inicio >72 h de hospitalización o reingreso dentro de las 4 semanas posteriores al egreso tras uso de antimicrobianos',
      'Tres o más evacuaciones líquidas (Bristol ≥5) en 24 h sin otra etiología (laxantes, nutrición enteral), megacolon tóxico o colitis pseudomembranosa',
      'Confirmación en muestra Bristol ≥5: GDH positiva, Toxinas A y/o B positivas, PCR positiva o aislamiento por cultivo',
    ],
  },
  {
    key: 'sitio',
    title: 'Infección del sitio de inserción del catéter, túnel o puerto',
    regex: /sitio de insercion|tunel|puerto subcutaneo/,
    items: [
      'Dos o más signos locales: calor, edema, rubor, dolor o drenaje purulento en sitio de entrada o túnel subcutáneo',
      'Cultivo positivo del sitio de inserción/trayecto o tinción de Gram positiva del material purulento',
      'Sin bacteriemia concomitante (si hay bacteriemia asociada se notifican dos episodios independientes)',
    ],
  },
  {
    key: 'flebitis',
    title: 'Flebitis asociada a vía periférica',
    regex: /flebitis/,
    items: [
      'Antecedente de vena con catéter periférico actual o invadida en las 72 h previas',
      'Dolor, calor, eritema, salida de material purulento o persistencia de síntomas >48 h tras retirar el acceso vascular',
      'No atribuible a fármacos con potencial reconocido para ocasionar flebitis química',
    ],
  },
];

export const CUMPLE_LABELS: Record<CumpleValue, string> = {
  si: 'Sí cumple',
  no: 'No cumple',
  falta: 'Falta información',
};

export function suggestCriteriaCategory(row: RadarEvent): string {
  const text = norm([row.tipo, row.motivo, row.muestra, row.disp].join(' '));
  const match = CRITERIA_CATALOG.find((item) => item.regex.test(text));
  return match ? match.key : '';
}

export function mkDescartado(row: RadarEvent): string {
  return `d|${[row.exp, row.nombre, row.prog].map(norm).join('|')}`;
}

export function mkRevisado(row: RadarEvent): string {
  return `r|${row.id}`;
}

export function mkCriterios(row: RadarEvent): string {
  return `c|${[row.exp, row.nombre, row.prog, row.tipo].map(norm).join('|')}`;
}
