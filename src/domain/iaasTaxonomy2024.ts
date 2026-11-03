import {
  AntibiogramEntry,
  BulletinPayload,
  CodecinSnapshot,
  CultureAttachment,
  IaasGroup2024,
  IaasPatientOutcome,
  IaasType2024,
  InvasiveDeviceCode,
  OutbreakAuditFinding,
  OutbreakCaseMember,
  OutbreakCluster,
  OutbreakControlAction,
  OutbreakLifecycleStage,
  OutbreakStudyRecord,
  RadarEvent,
  SharedMark,
  SuiveAgeGroupKey,
  SuiveExposedSexPair,
} from '../types/clinical';
import { daysBetween, fmtFull, norm, todayISO, toISO } from './dates';
import {
  buildAntibiogramIndex,
  extractOrganisms,
  parseAntibiogramPattern,
  prettyOrganism,
} from './outbreaks';
import { getPatientKey, indexByPatient, lookupByPatient } from './services';

export interface IaasTypeCatalogEntry {
  code: IaasType2024;
  group: IaasGroup2024;
  label: string;
  shortLabel: string;
  defaultDevice: InvasiveDeviceCode;
  postRemovalWindowDays: number | null;
  validSpecimens: string[];
}

export const IAAS_GROUP_LABELS: Record<IaasGroup2024, string> = {
  NAAS: 'Neumonías Asociadas a la Atención de la Salud (NAAS)',
  'ITS-AAS': 'Infección del Torrente Sanguíneo (ITS-AAS)',
  'IVU-CU': 'Infección de Vías Urinarias Asociada a Catéter Urinario (IVU-CU)',
  ISQ: 'Infección de Sitio Quirúrgico (ISQ)',
  ICD: 'Infección por Clostridioides difficile (ICD)',
  OTRAS: 'Otras IAAS de relevancia epidemiológica (Manual 2024)',
};

export const IAAS_TYPES_2024: IaasTypeCatalogEntry[] = [
  {
    code: 'NAV',
    group: 'NAAS',
    label: 'Neumonía Asociada a Ventilador (NAV)',
    shortLabel: 'NAV',
    defaultDevice: 'VM',
    postRemovalWindowDays: 2,
    validSpecimens: [
      'Aspirado bronquial',
      'Aspirado traqueal',
      'Lavado broncoalveolar (LBA)',
      'Cepillado bronquial protegido',
      'Líquido pleural (toracocentesis)',
      'Biopsia pulmonar / transbronquial',
      'Hemocultivo periférico (sin otro foco)',
    ],
  },
  {
    code: 'NAAS-RP',
    group: 'NAAS',
    label: 'NAAS Relacionada a Procedimiento de vía aérea (NAAS-RP)',
    shortLabel: 'NAAS-RP',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 2,
    validSpecimens: [
      'Aspirado bronquial',
      'Aspirado traqueal',
      'Lavado broncoalveolar (LBA)',
      'Esputo inducido (<10 cél. epiteliales y >25 PMN)',
      'Esputo espontáneo (<10 cél. epiteliales y >25 PMN)',
      'Líquido pleural (toracocentesis)',
    ],
  },
  {
    code: 'NAAS-NRP',
    group: 'NAAS',
    label: 'NAAS No Relacionada a Procedimiento (NAAS-NRP)',
    shortLabel: 'NAAS-NRP',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: null,
    validSpecimens: [
      'Esputo espontáneo (<10 cél. epiteliales y >25 PMN)',
      'Esputo inducido (<10 cél. epiteliales y >25 PMN)',
      'Aspirado bronquial',
      'Lavado broncoalveolar (LBA)',
      'PCR / panel molecular respiratorio',
      'Hemocultivo periférico (sin otro foco)',
    ],
  },
  {
    code: 'ITS-CC',
    group: 'ITS-AAS',
    label: 'ITS Relacionada a Línea Vascular Central (ITS-CC)',
    shortLabel: 'ITS-CC',
    defaultDevice: 'CVC',
    postRemovalWindowDays: 3,
    validSpecimens: [
      'Hemocultivo central y periférico (pareados)',
      'Sangre de catéter central',
      'Sangre periférica (venopunción)',
      'Hemocultivo periférico + Punta de catéter central (Maki)',
    ],
  },
  {
    code: 'ITS-RP',
    group: 'ITS-AAS',
    label: 'ITS Relacionada a Procedimiento diferente a CVC (ITS-RP)',
    shortLabel: 'ITS-RP',
    defaultDevice: 'VP',
    postRemovalWindowDays: 3,
    validSpecimens: [
      'Sangre periférica (venopunción)',
      'Hemocultivo periférico seriado (2 tomas)',
    ],
  },
  {
    code: 'ITS-IV',
    group: 'ITS-AAS',
    label: 'ITS Relacionada a Contaminación de Soluciones/Infusiones IV (ITS-IV)',
    shortLabel: 'ITS-IV',
    defaultDevice: 'VP',
    postRemovalWindowDays: 3,
    validSpecimens: [
      'Sangre periférica + Cultivo de solución/medicamento IV',
      'Hemocultivo central y periférico + Solución IV',
    ],
  },
  {
    code: 'ITS-DBM',
    group: 'ITS-AAS',
    label: 'ITS Secundario a Daño de la Barrera Mucosa (ITS-DBM)',
    shortLabel: 'ITS-DBM',
    defaultDevice: 'CVC',
    postRemovalWindowDays: null,
    validSpecimens: [
      'Sangre periférica (venopunción)',
      'Hemocultivo central y periférico (pareados)',
    ],
  },
  {
    code: 'IVU-CU',
    group: 'IVU-CU',
    label: 'Infección de Vías Urinarias Asociada a Catéter Urinario (IVU-CU)',
    shortLabel: 'IVU-CU',
    defaultDevice: 'CU',
    postRemovalWindowDays: 2,
    validSpecimens: [
      'Orina por catéter urinario (punción de puerto previa antisepsia)',
      'Orina de chorro medio',
      'Orina por punción suprapúbica',
      'Orina por sonda de entrada por salida',
    ],
  },
  {
    code: 'IIS',
    group: 'ISQ',
    label: 'Infección Incisional Superficial (IIS)',
    shortLabel: 'ISQ-IIS',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 30,
    validSpecimens: [
      'Aspirado de absceso o secreción de herida (previa antisepsia)',
      'Hisopado de herida quirúrgica con score Q válido',
    ],
  },
  {
    code: 'IIP',
    group: 'ISQ',
    label: 'Infección Incisional Profunda (IIP)',
    shortLabel: 'ISQ-IIP',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 90,
    validSpecimens: [
      'Aspirado de absceso o secreción profunda (previa antisepsia)',
      'Biopsia de tejido profundo de la incisión',
    ],
  },
  {
    code: 'IOE',
    group: 'ISQ',
    label: 'Infección de Órganos y Espacios (IOE)',
    shortLabel: 'ISQ-IOE',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 90,
    validSpecimens: [
      'Líquido orgánico o drenaje de cavidad obtenido asépticamente',
      'Aspirado de absceso de órgano/espacio',
      'Biopsia de órgano/espacio quirúrgico',
    ],
  },
  {
    code: 'ICD',
    group: 'ICD',
    label: 'Infección por Clostridioides difficile (ICD)',
    shortLabel: 'ICD',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 28,
    validSpecimens: [
      'Materia fecal líquida (Bristol ≥5) para Toxina A/B o GDH',
      'Materia fecal líquida (Bristol ≥5) por PCR / cultivo',
    ],
  },
  {
    code: 'SITIO-CATETER',
    group: 'OTRAS',
    label: 'Infección del sitio de inserción de catéter, túnel o puerto',
    shortLabel: 'Sitio inserción CVC',
    defaultDevice: 'CVC',
    postRemovalWindowDays: null,
    validSpecimens: ['Exudado purulento de sitio de inserción / túnel (previa antisepsia)'],
  },
  {
    code: 'FLEBITIS',
    group: 'OTRAS',
    label: 'Flebitis infecciosa asociada a catéter periférico',
    shortLabel: 'Flebitis',
    defaultDevice: 'VP',
    postRemovalWindowDays: 3,
    validSpecimens: ['Secreción purulenta de acceso venoso periférico'],
  },
  {
    code: 'MEDIASTINITIS',
    group: 'OTRAS',
    label: 'Mediastinitis post-procedimiento',
    shortLabel: 'Mediastinitis',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 90,
    validSpecimens: ['Tejido o líquido mediastinal por punción/cirugía', 'Sangre periférica'],
  },
  {
    code: 'ENDOCARDITIS',
    group: 'OTRAS',
    label: 'Endocarditis asociada a atención de la salud',
    shortLabel: 'Endocarditis',
    defaultDevice: 'CVC',
    postRemovalWindowDays: 90,
    validSpecimens: ['Hemocultivo periférico seriado (≥2 tomas)', 'Tejido valvular / vegetación'],
  },
  {
    code: 'MENINGITIS-VENTRICULITIS',
    group: 'OTRAS',
    label: 'Meningitis o ventriculitis post-procedimiento SNC / anestésico',
    shortLabel: 'Meningitis/Ventriculitis',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 90,
    validSpecimens: ['Líquido cefalorraquídeo (LCR)'],
  },
  {
    code: 'INFECCION-INTRACRANEAL',
    group: 'OTRAS',
    label: 'Infección intracraneal (absceso / subdural / epidural)',
    shortLabel: 'Inf. Intracraneal',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 90,
    validSpecimens: ['Aspirado o biopsia de tejido cerebral / duramadre'],
  },
  {
    code: 'PIEL-TEJIDOS',
    group: 'OTRAS',
    label: 'Infección de piel, tejidos blandos, fascitis o quemaduras',
    shortLabel: 'Piel y tejidos blandos',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: null,
    validSpecimens: ['Aspirado o biopsia de lesión / tejido viable (previa antisepsia)'],
  },
  {
    code: 'TRAQUEOBRONQUITIS',
    group: 'OTRAS',
    label: 'Traqueobronquitis o traqueítis sin evidencia de neumonía',
    shortLabel: 'Traqueobronquitis',
    defaultDevice: 'VM',
    postRemovalWindowDays: null,
    validSpecimens: ['Aspirado traqueal', 'Aspirado bronquial'],
  },
  {
    code: 'EMPIEMA-PROC',
    group: 'OTRAS',
    label: 'Empiema secundario a procedimientos en espacio pleural',
    shortLabel: 'Empiema post-proc.',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 30,
    validSpecimens: ['Líquido pleural (toracocentesis)'],
  },
  {
    code: 'PERITONITIS-DP',
    group: 'OTRAS',
    label: 'Peritonitis asociada a catéter o diálisis peritoneal',
    shortLabel: 'Peritonitis DP',
    defaultDevice: 'CAT_DIALISIS',
    postRemovalWindowDays: 30,
    validSpecimens: ['Líquido peritoneal', 'Secreción de sitio de inserción DP (previa limpieza)'],
  },
  {
    code: 'ENDOMETRITIS',
    group: 'OTRAS',
    label: 'Endometritis asociada a la atención obstétrica',
    shortLabel: 'Endometritis',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: null,
    validSpecimens: ['Líquido amniótico o biopsia endometrial'],
  },
  {
    code: 'PROC-ENDOSCOPICO',
    group: 'OTRAS',
    label: 'Infección relacionada a procedimiento endoscópico / odontológico',
    shortLabel: 'Post-endoscopia',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: 3,
    validSpecimens: ['Muestra dirigida del sitio anatómico intervenido', 'Sangre periférica'],
  },
  {
    code: 'OTRA-IAAS',
    group: 'OTRAS',
    label: 'Otra IAAS / enfermedad transmisible intrahospitalaria',
    shortLabel: 'Otra IAAS',
    defaultDevice: 'NINGUNO',
    postRemovalWindowDays: null,
    validSpecimens: ['Exudado / muestra clínica específica del sitio primario'],
  },
];

export const ALL_NORMALIZED_SPECIMENS: string[] = Array.from(
  new Set(IAAS_TYPES_2024.flatMap((t) => t.validSpecimens))
);

export const INVASIVE_DEVICE_LABELS: Record<InvasiveDeviceCode, string> = {
  VM: 'Ventilación mecánica invasiva (TET / Traqueostomía)',
  CVC: 'Catéter venoso central (temporal / permanente / PICC / umbilical)',
  CU: 'Catéter urinario (Sonda Foley)',
  VP: 'Vía venosa periférica / línea arterial',
  CAT_DIALISIS: 'Catéter de diálisis peritoneal',
  NINGUNO: 'Sin dispositivo invasivo contabilizable',
};

export const OUTCOME_LABELS: Record<IaasPatientOutcome, string> = {
  hospitalizado: 'Hospitalizado activo',
  egreso_mejoria: 'Egreso por mejoría',
  traslado: 'Traslado a otra unidad',
  defuncion_por_iaas: 'Defunción POR IAAS (asociada causalmente)',
  defuncion_con_iaas: 'Defunción CON IAAS (activa no causal)',
  defuncion_otra_causa: 'Defunción por otra causa (IAAS remitida)',
};

export const STAGE_LABELS: Record<OutbreakLifecycleStage, string> = {
  borrador: 'Borrador en integración',
  notificado_inicial: 'Notificación Inicial enviada (-0)',
  en_seguimiento: 'En seguimiento semanal',
  cerrado: 'Cerrado por control (-1)',
};

export const COMMON_CLINICAL_SIGNS: string[] = [
  'Fiebre (≥38 °C)',
  'Distermia / Hipotermia',
  'Expectoración purulenta / aumento de secreciones',
  'Desaturación (PaO₂/FiO₂ ≤240) / mayor demanda ventilatoria',
  'Infiltrado nuevo o consolidación radiográfica',
  'Leucocitosis (≥12,000/µL)',
  'Leucopenia (≤4,000/µL) o Bandemia >10%',
  'Escalofríos / Calosfríos',
  'Hipotensión / Choque séptico',
  'Taquicardia / Taquipnea',
  'Disuria / Dolor suprapúbico',
  'Secreción purulenta en herida o sitio de inserción',
  'Eritema, calor o dolor localizado',
  'Apnea / Bradicardia (pediátrico/neonatal)',
];

export const CARE_BUNDLE_TEMPLATES: Array<{
  categoria: OutbreakControlAction['categoria'];
  label: string;
  descripcion: string;
}> = [
  {
    categoria: 'aislamiento',
    label: 'Aislamiento por contacto / cohorte',
    descripcion:
      'Instalación inmediata de tarjeta amarilla de precauciones por contacto estricto, cohorte física y de personal de enfermería exclusivo para los casos confirmados.',
  },
  {
    categoria: 'higiene_manos',
    label: 'Supervisión sombra de 5 momentos OMS',
    descripcion:
      'Estudio de sombra extraordinario y capacitación en servicio en los 3 turnos sobre los 5 momentos de higiene de manos y uso racional de guantes.',
  },
  {
    categoria: 'limpieza_desinfeccion',
    label: 'Limpieza exhaustiva con triple cubeta (cloro)',
    descripcion:
      'Desinfección exhaustiva y terminal de unidades, monitores, bombas de infusión y superficies de alto contacto mediante técnica de triple cubeta con hipoclorito de sodio al 6% (10 mL/L) y verificación de cloro residual.',
  },
  {
    categoria: 'paquetes_invasivos',
    label: 'Auditoría de paquetes preventivos (NAV / ITS-CC / IVU-CU)',
    descripcion:
      'Verificación diaria de paquetes de prevención: elevación de cabecera 30–45°, aseo oral con clorhexidina 0.12%, presión de neumotaponamiento, antisepsia con clorhexidina alcohólica 2% en puertos de CVC y retiro temprano de invasivos.',
  },
  {
    categoria: 'inhaloterapia_ceye',
    label: 'Revisión de procesos de Inhaloterapia y CEyE',
    descripcion:
      'Recorrido conjunto con Inhaloterapia y CEyE para auditar recambio, lavado y esterilización/desinfección de alto nivel de circuitos ventilatorios, humidificadores, sistemas cerrados de aspiración y trazabilidad de lotes.',
  },
  {
    categoria: 'codeciaas',
    label: 'Sesión extraordinaria del CODECIAAS',
    descripcion:
      'Convocatoria y levantamiento de minuta extraordinaria del CODECIAAS con Dirección, Jefatura del servicio afectado, Infectología, Microbiología y Enfermería para dictaminar casos y acuerdos de contención.',
  },
];

export const SUIVE_AGE_GROUPS: Array<{ key: SuiveAgeGroupKey; label: string }> = [
  { key: '<1', label: '< 1 año' },
  { key: '1-4', label: '1 - 4' },
  { key: '5-9', label: '5 - 9' },
  { key: '10-14', label: '10 - 14' },
  { key: '15-19', label: '15 - 19' },
  { key: '20-24', label: '20 - 24' },
  { key: '25-44', label: '25 - 44' },
  { key: '45-49', label: '45 - 49' },
  { key: '50-59', label: '50 - 59' },
  { key: '60-64', label: '60 - 64' },
  { key: '65+', label: '65 y más' },
  { key: 'ignora', label: 'Se ignora' },
];

export function createEmptyExposedByAge(): Record<SuiveAgeGroupKey, SuiveExposedSexPair> {
  return {
    '<1': { m: 0, f: 0 },
    '1-4': { m: 0, f: 0 },
    '5-9': { m: 0, f: 0 },
    '10-14': { m: 0, f: 0 },
    '15-19': { m: 0, f: 0 },
    '20-24': { m: 0, f: 0 },
    '25-44': { m: 0, f: 0 },
    '45-49': { m: 0, f: 0 },
    '50-59': { m: 0, f: 0 },
    '60-64': { m: 0, f: 0 },
    '65+': { m: 0, f: 0 },
    ignora: { m: 0, f: 0 },
  };
}

export function getIaasCatalogEntry(code: IaasType2024): IaasTypeCatalogEntry {
  return IAAS_TYPES_2024.find((t) => t.code === code) || IAAS_TYPES_2024[0];
}

export function inferIaasType2024(row: RadarEvent, savedCat?: string): IaasType2024 {
  if (savedCat === 'nav') return 'NAV';
  if (savedCat === 'naas_rp') return 'NAAS-RP';
  if (savedCat === 'neumo') return 'NAAS-NRP';
  if (savedCat === 'itscc') return 'ITS-CC';
  if (savedCat === 'itslab') return 'ITS-RP';
  if (savedCat === 'ivu_cu') return 'IVU-CU';
  if (savedCat === 'icd') return 'ICD';
  if (savedCat === 'sitio') return 'SITIO-CATETER';
  if (savedCat === 'flebitis') return 'FLEBITIS';

  const t = norm([row.tipo, row.motivo, row.disp, row.muestra].join(' '));
  if (/ventilador|ventilacion|\bnav\b|\bnavm\b/.test(t)) return 'NAV';
  if (/naas.?rp|broncoscop|videolaringoscop/.test(t)) return 'NAAS-RP';
  if (/neumon|naas/.test(t)) return 'NAAS-NRP';
  if (/contaminacion.*solucion|infusion.*contamin|its.?iv/.test(t)) return 'ITS-IV';
  if (/barrera mucosa|its.?dbm|neutropeni/.test(t)) return 'ITS-DBM';
  if (/cateter central|its.?cc|mahurkar|picc|umbilical|hemocultivo central/.test(t)) {
    return 'ITS-CC';
  }
  if (/\bits\b|torrente|bacteriemia|hemocultivo/.test(t)) return 'ITS-RP';
  if (/\bivu\b|urinari|urocultivo|sonda vesical|foley/.test(t)) return 'IVU-CU';
  if (/organos y espacios|\bioe\b/.test(t)) return 'IOE';
  if (/incisional profunda|\biip\b/.test(t)) return 'IIP';
  if (/incisional|quirurg|herida|\bisq\b|\biis\b/.test(t)) return 'IIS';
  if (/clostrid|difficile|\bicd\b/.test(t)) return 'ICD';
  if (/sitio de insercion|tunel/.test(t)) return 'SITIO-CATETER';
  if (/flebitis/.test(t)) return 'FLEBITIS';
  if (/meningitis|ventriculitis|lcr/.test(t)) return 'MENINGITIS-VENTRICULITIS';
  if (/peritonitis|dialisis peritoneal/.test(t)) return 'PERITONITIS-DP';
  if (/empiema|pleural/.test(t)) return 'EMPIEMA-PROC';
  return 'NAV';
}

export function normalizeSpecimenForIaas(rawSample: string | undefined, iaasType: IaasType2024): string {
  const s = norm(rawSample);
  if (!s) return '';
  // Leave forbidden ambiguous terms raw so the anti-observation validator highlights them for conscious selection,
  // UNLESS the raw string already clearly specifies the valid subtype:
  if (s === 'cateter' || s === 'punta de cateter' || s === 'sonda' || s.includes('bolsa colectora')) {
    return String(rawSample || '').trim();
  }
  if (/central.*periferic|ambos hemocultivos|paread/.test(s)) {
    return 'Hemocultivo central y periférico (pareados)';
  }
  if (/hemocultivo central|sangre.*cateter central/.test(s)) {
    return 'Sangre de catéter central';
  }
  if (/hemocultivo periferic|sangre periferic|venopuncion/.test(s)) {
    return 'Sangre periférica (venopunción)';
  }
  if (/aspirado endotraqueal|aspirado traqueal/.test(s)) {
    return 'Aspirado traqueal';
  }
  if (/aspirado bronquial|secrecion bronquial/.test(s)) {
    return 'Aspirado bronquial';
  }
  if (/lavado broncoalveolar|\blba\b/.test(s)) {
    return 'Lavado broncoalveolar (LBA)';
  }
  if (/urocultivo.*puerto|puncion.*puerto|cateter urinario/.test(s)) {
    return 'Orina por catéter urinario (punción de puerto previa antisepsia)';
  }
  if (/chorro medio/.test(s)) {
    return 'Orina de chorro medio';
  }
  const entry = getIaasCatalogEntry(iaasType);
  const exact = entry.validSpecimens.find((v) => norm(v) === s);
  return exact || String(rawSample || '').trim();
}

export function isAmbiguousOrInvalidSpecimen(specimen: string, iaasType: IaasType2024): string | null {
  const s = norm(specimen);
  if (!s) {
    return 'Falta especificar el tipo de muestra microbiológica (Manual RHOVE 2024 exige toma al 100% de IAAS).';
  }
  if (s === 'cateter' || s === 'cateter venoso' || s === 'hemocultivo') {
    return 'Observación estatal recurrente: no registrar “Catéter” ni “Hemocultivo” genérico; especifique “Sangre de catéter central”, “Sangre periférica (venopunción)” o “Hemocultivo central y periférico (pareados)”.';
  }
  if (s === 'punta de cateter' || s === 'punta cateter') {
    return 'Manual RHOVE 2024 (pág. 49): el cultivo aislado de punta de catéter no confirma ITS-CC por sí solo; debe acompañarse de hemocultivo positivo.';
  }
  if (s.includes('bolsa colectora') || s.includes('punta de sonda')) {
    return 'Manual RHOVE 2024 (pág. 53): muestras de bolsa colectora o punta de catéter urinario NO son válidas para diagnóstico de IVU-CU.';
  }
  if ((iaasType === 'NAV' || iaasType === 'NAAS-RP' || iaasType === 'NAAS-NRP') && s === 'secrecion') {
    return 'Especifique el tipo anatómico de muestra respiratoria (Aspirado bronquial, Aspirado traqueal, LBA o Esputo con criterio de calidad).';
  }
  return null;
}

export function toPatientInitials(fullName?: string): string {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'S.D.';
  return `${parts.map((p) => p[0].toUpperCase()).join('.')}.`;
}

export function parsePatientAge(rawAge?: string | number): {
  years: number | null;
  text: string;
  group: SuiveAgeGroupKey;
} {
  if (rawAge == null || String(rawAge).trim() === '') {
    return { years: null, text: '', group: 'ignora' };
  }
  const str = String(rawAge).trim();
  const n = norm(str);
  if (/\bdia|\bmes|\brn\b|recien nacido|horas/.test(n)) {
    return { years: 0, text: str, group: '<1' };
  }
  const numMatch = n.match(/(\d+)/);
  if (!numMatch) return { years: null, text: str, group: 'ignora' };
  const yrs = Number.parseInt(numMatch[1], 10);
  if (Number.isNaN(yrs)) return { years: null, text: str, group: 'ignora' };

  let group: SuiveAgeGroupKey = 'ignora';
  if (yrs < 1) group = '<1';
  else if (yrs <= 4) group = '1-4';
  else if (yrs <= 9) group = '5-9';
  else if (yrs <= 14) group = '10-14';
  else if (yrs <= 19) group = '15-19';
  else if (yrs <= 24) group = '20-24';
  else if (yrs <= 44) group = '25-44';
  else if (yrs <= 49) group = '45-49';
  else if (yrs <= 59) group = '50-59';
  else if (yrs <= 64) group = '60-64';
  else group = '65+';

  return { years: yrs, text: `${yrs}`, group };
}

export function inferPatientSex(row: RadarEvent): 'M' | 'F' {
  const s = norm(row.sexo);
  if (s.startsWith('f') || s.startsWith('m') && s.includes('mujer')) return 'F';
  if (s.startsWith('m') || s.startsWith('h')) return 'M';
  // Heuristic on last given name in Spanish clinical records when sex column wasn't exported
  const tokens = norm(row.nombre).split(/\s+/).filter(Boolean);
  const given = tokens[tokens.length - 1] || '';
  if (
    /^(maria|leticia|valeria|ana|carmen|guadalupe|rosa|laura|patricia|elena|sofia|claudia|alejandra|lucia|fernanda|gabriela|martha|silvia|veronica|adriana|teresa|irene|beatriz|juana|francisca|paula|diana)$/.test(
      given
    ) ||
    given.endsWith('a')
  ) {
    return 'F';
  }
  return 'M';
}

export function extractClinicalSignsFromText(motivo?: string): string[] {
  const t = norm(motivo);
  if (!t) return [];
  const found: string[] = [];
  if (/fiebre|38\.|39\.|febril/.test(t)) found.push('Fiebre (≥38 °C)');
  if (/hipotermia|distermia|inestabilidad termica/.test(t)) found.push('Distermia / Hipotermia');
  if (/purulent|esputo|secrecion/.test(t)) {
    found.push('Expectoración purulenta / aumento de secreciones');
  }
  if (/deterioro ventilatorio|fio2|desaturacion|oxigen/.test(t)) {
    found.push('Desaturación (PaO₂/FiO₂ ≤240) / mayor demanda ventilatoria');
  }
  if (/infiltrado|consolidacion|cavitacion/.test(t)) {
    found.push('Infiltrado nuevo o consolidación radiográfica');
  }
  if (/leucocitosis/.test(t)) found.push('Leucocitosis (≥12,000/µL)');
  if (/leucopenia|bandemia|bandas/.test(t)) found.push('Leucopenia (≤4,000/µL) o Bandemia >10%');
  if (/escalofrio|calosfrio/.test(t)) found.push('Escalofríos / Calosfríos');
  if (/hipotension|choque/.test(t)) found.push('Hipotensión / Choque séptico');
  if (/disuria|suprapubic/.test(t)) found.push('Disuria / Dolor suprapúbico');
  if (/eritema|calor|rubor/.test(t)) found.push('Eritema, calor o dolor localizado');
  if (/apnea|bradicardia/.test(t)) found.push('Apnea / Bradicardia (pediátrico/neonatal)');
  return found;
}

export function inferResistanceMechanism(atb?: string, res?: string): string {
  const t = norm(`${atb || ''} ${res || ''}`);
  if (/meropenem[^;]*resistente|imipenem[^;]*resistente|ertapenem[^;]*resistente|carbapenem/.test(t)) {
    return 'Resistencia a carbapenémicos (MDR / probable carbapenemasa)';
  }
  if (/blee|ceftriaxona[^;]*resistente|cefotaxima[^;]*resistente|ceftazidima[^;]*resistente/.test(t)) {
    return 'Productor probable de BLEE (resistente a cefalosporinas 3ª gen.)';
  }
  if (/oxacilina[^;]*resistente|cefoxitina[^;]*resistente|meticilin|\bsamr\b/.test(t)) {
    return 'Resistencia a meticilina (SAMR)';
  }
  if (/vancomicina[^;]*resistente|\bvre\b/.test(t)) {
    return 'Resistencia a vancomicina (VRE)';
  }
  if (/resistente/.test(t)) return 'Con resistencia antimicrobiana';
  return 'Susceptible / En caracterización';
}

export function inferDeviceAndInstallDate(
  row: RadarEvent,
  iaasType: IaasType2024,
  refDateIso: string
): { device: InvasiveDeviceCode; installIso: string } {
  const entry = getIaasCatalogEntry(iaasType);
  const dText = norm(row.disp);
  let device: InvasiveDeviceCode = entry.defaultDevice;
  if (/ventilacion|ventilador|intubacion|traqueostom/.test(dText)) device = 'VM';
  else if (/cateter.*central|mahurkar|picc|umbilical|subclavi|yugular|femoral/.test(dText)) {
    device = 'CVC';
  } else if (/sonda vesical|foley|cateter urinario/.test(dText)) device = 'CU';
  else if (/dialisis peritoneal|tenckhoff/.test(dText)) device = 'CAT_DIALISIS';
  else if (/periferic|arterial/.test(dText)) device = 'VP';

  const daysMatch = dText.match(/(\d+)\s*dias?/);
  let installIso = '';
  if (daysMatch && refDateIso) {
    const days = Number.parseInt(daysMatch[1], 10);
    if (!Number.isNaN(days) && days > 0) {
      const dt = new Date(`${refDateIso}T12:00:00`);
      if (!Number.isNaN(dt.getTime())) {
        dt.setDate(dt.getDate() - days);
        installIso = toISO(dt) || '';
      }
    }
  } else if (device !== 'NINGUNO' && row.ing) {
    installIso = toISO(row.ing) || '';
  }

  return { device, installIso };
}

export function buildClusterKey(cluster: OutbreakCluster): string {
  const svcKey = cluster.shared
    .map((s) => norm(s).replace(/[^a-z0-9]+/g, '-'))
    .sort()
    .join('_');
  const orgKey = norm(cluster.org).replace(/[^a-z0-9]+/g, '-');
  return `${orgKey}__${svcKey || 'hosp'}`;
}

export function composeOutbreakDiagnoses(
  organismo: string,
  fenotipo: string,
  casos: OutbreakCaseMember[]
): { dxProbable: string; dxFinal: string } {
  const included = casos.filter((c) => c.incluidoEnEstudio);
  const typeCodes = Array.from(new Set(included.map((c) => c.iaasType)));
  const typesLabel = typeCodes.length > 0 ? typeCodes.join(', ') : 'IAAS en estudio';
  const orgPretty = prettyOrganism(organismo) || organismo;
  const shortPhenotype = /carbapenem/i.test(fenotipo)
    ? 'resistente a carbapenémicos (MDR)'
    : /blee/i.test(fenotipo)
      ? 'productor probable de BLEE'
      : '';
  const agentFull = [orgPretty, shortPhenotype].filter(Boolean).join(' ');

  const dxProbable = `Brote intrahospitalario de IAAS (${typesLabel}) probable por ${agentFull}`;
  const confirmedCases = included.filter((c) => c.nivelDiagnostico === 'confirmada_lab');
  const confirmedTypes = Array.from(new Set(confirmedCases.map((c) => c.iaasType)));
  const dxFinal =
    confirmedCases.length > 0
      ? `Brote intrahospitalario de IAAS (${confirmedTypes.join(', ')}) confirmado por ${agentFull}`
      : '';

  return { dxProbable, dxFinal };
}

export function generateCodecinPanoramaNarrative(params: {
  organismo: string;
  servicioPrincipal: string;
  snapshots: CodecinSnapshot[];
  bulletin: BulletinPayload;
  existingStudies: OutbreakStudyRecord[];
  currentStudyId?: string;
}): string {
  const { organismo, servicioPrincipal, snapshots, bulletin, existingStudies, currentStudyId } =
    params;
  const orgNorm = norm(organismo);
  const orgPretty = prettyOrganism(organismo) || organismo;
  const svcNorm = norm(servicioPrincipal);

  // 1. Historical CODECIN metrics for the affected service (last 6 cuts)
  const sortedSnaps = [...(snapshots || [])].sort((a, b) => a.corte.localeCompare(b.corte));
  const recent6 = sortedSnaps.slice(-6);
  const svcCounts = recent6.map((s) => {
    const matchEntry = Object.entries(s.porServicio || {}).find(
      ([k]) => norm(k).includes(svcNorm) || svcNorm.includes(norm(k))
    );
    return matchEntry ? matchEntry[1] : 0;
  });
  const totalRecentSvc = svcCounts.reduce((acc, v) => acc + v, 0);
  const avgRecentSvc =
    recent6.length > 0 ? (totalRecentSvc / recent6.length).toFixed(1) : '0.0';
  const totalHospitalRecent = recent6.reduce((acc, s) => acc + s.totalIaas, 0);
  const totalDeathsRecent = recent6.reduce((acc, s) => acc + s.defuncionesConIaas, 0);
  const lethalityRecent =
    totalHospitalRecent > 0
      ? ((totalDeathsRecent / totalHospitalRecent) * 100).toFixed(1)
      : '0.0';
  const carbRecent = recent6.reduce((acc, s) => acc + s.carbapenemResistantCount, 0);
  const bleeRecent = recent6.reduce((acc, s) => acc + s.bleeCount, 0);

  // Top infection sites in historical series
  const siteTotals: Record<string, number> = {};
  recent6.forEach((s) => {
    Object.entries(s.porSitio || {}).forEach(([site, n]) => {
      siteTotals[site] = (siteTotals[site] || 0) + n;
    });
  });
  const topSites = Object.entries(siteTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([site, n]) => `${site} (${n})`)
    .join(', ');

  // 2. Prior outbreaks in the same service or by the same agent
  const priorStudies = existingStudies.filter(
    (st) =>
      st.id !== currentStudyId &&
      (norm(st.organismo) === orgNorm ||
        st.serviciosInvolucrados.some((sv) => norm(sv).includes(svcNorm)))
  );
  const priorText =
    priorStudies.length > 0
      ? `Como antecedente en el registro UVEH se identifican ${priorStudies.length} estudio(s) previo(s) relacionados: ${priorStudies
          .map(
            (p) =>
              `${prettyOrganism(p.organismo)} en ${p.servicioMedico} (inicio ${fmtFull(
                p.fechaInicioBrote
              )}${p.folioNotinmedBase ? `, folio ${p.folioNotinmedBase}` : ''}, estatus: ${
                STAGE_LABELS[p.stage]
              })`
          )
          .join('; ')}, por lo que se investiga si existe reservorio ambiental persistente o reintroducción.`
      : `En los registros recientes del tablero UVEH no se documentan brotes activos previos no resueltos por ${orgPretty} en ${servicioPrincipal}, manteniéndose vigilancia sobre reservorios ambientales e invasivos.`;

  // 3. Simultaneous circulation in OTHER hospital services in active bulletin
  const otherServicesSet = new Set<string>();
  let otherServiceCasesCount = 0;
  (bulletin.rows || []).forEach((row) => {
    const rowOrgs = extractOrganisms(row.micro);
    if (!rowOrgs.includes(orgNorm)) return;
    const rSvc = String(row.svc || '').trim();
    if (rSvc && !norm(rSvc).includes(svcNorm)) {
      otherServicesSet.add(rSvc);
      otherServiceCasesCount += 1;
    }
  });

  const simultaneousText =
    otherServiceCasesCount > 0
      ? `Al corte epidemiológico actual (${fmtFull(
          bulletin.corte
        )}), se identifican simultáneamente ${otherServiceCasesCount} aislamiento(s) de ${orgPretty} en otros servicios del hospital (${Array.from(
          otherServicesSet
        ).join(', ')}), verificándose trazabilidad de traslados e interconsultas.`
      : `Al corte epidemiológico actual (${fmtFull(
          bulletin.corte
        )}), NO se identifican casos simultáneos de IAAS por ${orgPretty} en otros servicios hospitalarios fuera de ${servicioPrincipal}.`;

  const periodRangeLabel =
    recent6.length >= 2
      ? `${recent6[0].etiqueta} a ${recent6[recent6.length - 1].etiqueta}`
      : 'los cortes recientes';

  return [
    `Panorama epidemiológico del servicio (${servicioPrincipal}): De acuerdo con los registros históricos del CODECIN durante ${periodRangeLabel}, el servicio de ${servicioPrincipal} registró un acumulado de ${totalRecentSvc} eventos de IAAS (promedio endémico de ${avgRecentSvc} casos por corte mensual). A nivel hospitalario, los principales sitios de infección vigilados en el periodo fueron ${
      topSites || 'NAV, ITS-CC e IVU-CU'
    }, con una letalidad acumulada asociada de ${lethalityRecent}% y vigilancia activa de resistencia antimicrobiana (${carbRecent} aislamientos resistentes a carbapenémicos y ${bleeRecent} productores de BLEE).`,
    priorText,
    simultaneousText,
  ].join('\n\n');
}

export function findDischargedClusterCandidates(
  cluster: OutbreakCluster,
  cerrados: RadarEvent[],
  abRows: AntibiogramEntry[],
  alreadyIncludedIds: Set<string>
): RadarEvent[] {
  const orgNorm = norm(cluster.org);
  const atbIndex = buildAntibiogramIndex(abRows || []);
  const targetSvcNorms = cluster.shared.map((s) => norm(s));

  return (cerrados || []).filter((row) => {
    if (alreadyIncludedIds.has(row.id)) return false;
    const orgs = extractOrganisms(row.micro);
    const svcText = norm(`${row.svc || ''} ${row.prev || ''}`);
    const sharesSvc = targetSvcNorms.some((ts) => ts && svcText.includes(ts));
    if (orgs.includes(orgNorm) && sharesSvc) return true;
    // Also surface deceased/discharged IAAS in the exact target service so epidemiologist can verify
    const nk = norm(row.nombre).split(/\s+/).filter(Boolean).sort().join(' ');
    const hasAtb = Boolean(atbIndex[`${nk}||${orgNorm}`] || parseAntibiogramPattern(row.atb));
    return sharesSvc && (orgs.includes(orgNorm) || hasAtb);
  });
}

export function radarRowToOutbreakCase(
  row: RadarEvent,
  options: {
    servicioBrote: string;
    sharedMarks: Record<string, SharedMark> | null;
    culturesIndex: ReturnType<typeof indexByPatient<CultureAttachment>>;
  }
): OutbreakCaseMember {
  const { servicioBrote, sharedMarks, culturesIndex } = options;
  const pKey = getPatientKey(row);
  const patientCultures = lookupByPatient(culturesIndex, pKey, row.nombre);

  // Look up saved RHOVE criteria evaluation if any
  const savedCriteriaMark = sharedMarks
    ? Object.values(sharedMarks).find(
        (m) =>
          m.tipo === 'criterios' &&
          m.activa !== false &&
          norm(m.nombre) === norm(row.nombre)
      )
    : undefined;

  const iaasType = inferIaasType2024(row, savedCriteriaMark?.detalle?.cat);
  const catalogEntry = getIaasCatalogEntry(iaasType);
  const ageInfo = parsePatientAge(row.edad);
  const refDate = toISO(row.det) || toISO(row.fres) || todayISO();
  const { device, installIso } = inferDeviceAndInstallDate(row, iaasType, refDate);

  // Suggest FIS as detection date if distinct from culture report, else leave slightly earlier or equal for explicit UVEH confirmation
  const detIso = toISO(row.det) || '';
  const fresIso = toISO(row.fres) || '';
  const suggestedFis = detIso && detIso !== fresIso ? detIso : detIso || '';

  const isDead = /defunc|finad|fallec/.test(norm(`${row.egreso || ''} ${row.oper || ''}`));
  const isDischarged = Boolean(row.egreso) && !isDead;
  const outcome: IaasPatientOutcome = isDead
    ? 'defuncion_por_iaas'
    : isDischarged
      ? 'egreso_mejoria'
      : 'hospitalizado';

  const cleanOrg =
    prettyOrganism(extractOrganisms(row.micro)[0] || '') ||
    String(row.micro || '').replace(/\(pendiente\)/gi, '').trim();

  return {
    patientId: row.id,
    expediente: String(row.exp || '').trim(),
    nombre: String(row.nombre || '').trim(),
    iniciales: toPatientInitials(row.nombre),
    edadAnios: ageInfo.years,
    edadTexto: ageInfo.text,
    grupoEdad: ageInfo.group,
    sexo: inferPatientSex(row),
    cama: String(row.cama || '').trim(),
    fechaIngresoHospital: toISO(row.ing) || '',
    servicioPrevio: String(row.prev || '').trim(),
    servicioBrote: String(row.svc || servicioBrote).trim(),
    fechaIngresoServicio: toISO(row.ing) || '',
    iaasGroup: catalogEntry.group,
    iaasType,
    nivelDiagnostico: cleanOrg ? 'confirmada_lab' : 'definida_clinica',
    folioRhove: /capturad/i.test(String(row.rhove || '')) ? String(row.rhove || '').trim() : '',
    asociadoBroteSeveiaas: false,
    fechaInicioSintomas: suggestedFis,
    fechaInicioSeveiaas: suggestedFis,
    signosSintomas: extractClinicalSignsFromText(row.motivo),
    cuadroClinicoDetalle: String(row.motivo || '').trim(),
    dispositivoPrincipal: device,
    fechaInstalacionDisp: installIso,
    fechaRetiroDisp: '',
    procedimientosAsociados: String(row.obs || '').trim(),
    fechaProcedimiento: '',
    tipoMuestra: normalizeSpecimenForIaas(row.muestra, iaasType),
    fechaTomaMuestra: fresIso || detIso,
    fechaResultadoLab: fresIso,
    microorganismo: cleanOrg,
    mecanismoResistencia: inferResistanceMechanism(row.atb, row.res),
    perfilResistencia: String(row.atb || '').trim(),
    tratamientoAntimicrobiano: '',
    fechaInicioTratamiento: '',
    desenlace: outcome,
    fechaEgresoDefuncion: isDead || isDischarged ? toISO(row.egreso) || todayISO() : '',
    folioCertificadoDefuncion: '',
    evidenciaCultivoArchivo: patientCultures[0]?.archivo || '',
    incluidoEnEstudio: true,
  };
}

export function buildOutbreakStudyFromCluster(params: {
  cluster: OutbreakCluster;
  bulletin: BulletinPayload;
  sharedMarks: Record<string, SharedMark> | null;
  cultures: CultureAttachment[];
  codecinSnapshots: CodecinSnapshot[];
  existingStudies: OutbreakStudyRecord[];
  authorName: string;
}): OutbreakStudyRecord {
  const {
    cluster,
    bulletin,
    sharedMarks,
    cultures,
    codecinSnapshots,
    existingStudies,
    authorName,
  } = params;

  const servicioPrincipal = cluster.shared[0] || 'Hospitalización';
  const culturesIndex = indexByPatient(cultures || []);
  const casos = cluster.members.map((m) =>
    radarRowToOutbreakCase(m, {
      servicioBrote: servicioPrincipal,
      sharedMarks,
      culturesIndex,
    })
  );

  const fenotipo =
    casos.find((c) => c.mecanismoResistencia)?.mecanismoResistencia ||
    'Perfil S/I/R idéntico en estudio';
  const { dxProbable, dxFinal } = composeOutbreakDiagnoses(cluster.org, fenotipo, casos);

  const validFisDates = casos
    .map((c) => c.fechaInicioSintomas)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const hoy = todayISO();
  const fechaInicioBrote = validFisDates[0] || toISO(bulletin.corte) || hoy;

  // Estimate exposed patients in that service from active + closed bulletin rows (minimum >= cases + realistic ward census)
  const svcNorm = norm(servicioPrincipal);
  const serviceRows = [...(bulletin.rows || []), ...(bulletin.cerrados || [])].filter((r) =>
    norm(`${r.svc || ''} ${r.prev || ''}`).includes(svcNorm)
  );
  const casesM = casos.filter((c) => c.sexo === 'M').length;
  const casesF = casos.filter((c) => c.sexo === 'F').length;
  const exposedM = Math.max(casesM + 3, Math.ceil(serviceRows.length * 0.55), 6);
  const exposedF = Math.max(casesF + 3, Math.ceil(serviceRows.length * 0.45), 6);

  const exposedByAge = createEmptyExposedByAge();
  casos.forEach((c) => {
    if (c.sexo === 'M') {
      exposedByAge[c.grupoEdad].m = Math.max(exposedByAge[c.grupoEdad].m, 0) + 2;
    } else {
      exposedByAge[c.grupoEdad].f = Math.max(exposedByAge[c.grupoEdad].f, 0) + 2;
    }
  });

  const hasRespiratory = casos.some((c) => c.iaasGroup === 'NAAS');
  const hasVascular = casos.some((c) => c.iaasGroup === 'ITS-AAS');

  const probablesFuentes = hasRespiratory
    ? 'Fuente común intermitente en investigación: circuitos/accesorios de terapia respiratoria e inhaloterapia, superficies ambientales de alto contacto en el entorno inmediato de las camas afectadas o colonización cruzada.'
    : hasVascular
      ? 'Fuente en investigación asociada a manipulación de líneas vasculares centrales, puertos de infusión, preparación de terapia intravenosa o superficies de alto contacto en el servicio.'
      : 'Fuente intrahospitalaria en investigación: entorno inanimado cercano al paciente, equipo médico compartido entre camas y dispositivos invasivos.';

  const probablesMecanismos =
    'Transmisión por contacto directo e indirecto a través de las manos del personal de atención en salud, equipo biomédico compartido o manipulación de dispositivos invasivos.';

  const defaultActions: OutbreakControlAction[] = [
    {
      id: `act-${Date.now()}-1`,
      fecha: hoy,
      categoria: 'aislamiento',
      descripcion: CARE_BUNDLE_TEMPLATES[0].descripcion,
      responsable: 'UVEH / Jefatura de Enfermería',
    },
    {
      id: `act-${Date.now()}-2`,
      fecha: hoy,
      categoria: 'limpieza_desinfeccion',
      descripcion: CARE_BUNDLE_TEMPLATES[2].descripcion,
      responsable: 'Servicios Generales / Supervisión UVEH',
    },
    {
      id: `act-${Date.now()}-3`,
      fecha: hoy,
      categoria: hasRespiratory ? 'inhaloterapia_ceye' : 'paquetes_invasivos',
      descripcion: hasRespiratory
        ? CARE_BUNDLE_TEMPLATES[4].descripcion
        : CARE_BUNDLE_TEMPLATES[3].descripcion,
      responsable: hasRespiratory
        ? 'UVEH / Inhaloterapia / CEyE'
        : 'UVEH / Clínica de Catéteres',
    },
  ];

  const allHaveCultureFiles =
    casos.length > 0 && casos.every((c) => Boolean(c.evidenciaCultivoArchivo || c.perfilResistencia));

  return {
    id: `brote-${Date.now().toString(36)}`,
    clusterKey: buildClusterKey(cluster),
    organismo: cluster.org,
    fenotipoResistencia: fenotipo,
    serviciosInvolucrados: cluster.shared.length ? cluster.shared : [servicioPrincipal],
    stage: 'borrador',
    folioNotinmedBase: '',
    folioSufijoActual: '0',
    unidadNotificante: 'Hospital Regional de Alta Especialidad de Veracruz',
    claveSuave: '',
    claveClues: 'VZIMB002495',
    localidad: 'Veracruz',
    municipio: 'Veracruz',
    jurisdiccion: 'Jurisdicción Sanitaria No. VIII Veracruz',
    entidad: 'Veracruz de Ignacio de la Llave',
    institucion: 'IMSS-Bienestar',
    servicioMedico: servicioPrincipal,
    dxProbable,
    dxFinal,
    fechaInicioBrote,
    fechaDeteccion: toISO(bulletin.corte) || hoy,
    fechaNotificacion: hoy,
    fechaCierre: '',
    poblacionExpuestaPorEdad: exposedByAge,
    poblacionExpuestaModo: 'global_servicio',
    expuestosGlobalM: exposedM,
    expuestosGlobalF: exposedF,
    casos,
    antecedentesPanorama: generateCodecinPanoramaNarrative({
      organismo: cluster.org,
      servicioPrincipal,
      snapshots: codecinSnapshots,
      bulletin,
      existingStudies,
    }),
    probablesFuentes,
    probablesMecanismos,
    accionesControl: defaultActions,
    bitacoraSeguimiento: [],
    checklistCodeciaas: {
      minutaCodeciaas: false,
      fechaMinutaCodeciaas: '',
      minutaRecorridoCampo: false,
      fechaRecorridoCampo: '',
      reportesSusceptibilidadLab: allHaveCultureFiles,
      listasCapacitacionEppHigiene: false,
      evidenciaPaquetesPreventivos: false,
      notasDocumentales: '',
    },
    elaboroNombreCargo: authorName ? `${authorName} · Vigilancia Epidemiológica UVEH` : 'Coordinación UVEH',
    directorNombre: '',
    epidemiologoNombre: authorName || 'Responsable UVEH',
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    actualizadoPor: authorName || 'UVEH',
  };
}

export interface SuivePersonDistributionRow {
  key: SuiveAgeGroupKey | 'TOTAL';
  label: string;
  casosM: number;
  casosF: number;
  casosT: number;
  defM: number;
  defF: number;
  defT: number;
  expM: number;
  expF: number;
  expT: number;
  ataqueM: number | null;
  ataqueF: number | null;
  ataqueT: number | null;
  letalidadM: number | null;
  letalidadF: number | null;
  letalidadT: number | null;
}

function safeRate(num: number, den: number): number | null {
  if (den <= 0) return num === 0 ? 0 : null;
  return Number(((num / den) * 100).toFixed(2));
}

export function computeSuivePersonDistribution(
  study: OutbreakStudyRecord
): SuivePersonDistributionRow[] {
  const included = study.casos.filter((c) => c.incluidoEnEstudio);

  const rows: SuivePersonDistributionRow[] = SUIVE_AGE_GROUPS.map(({ key, label }) => {
    const groupCases = included.filter((c) => c.grupoEdad === key);
    const casosM = groupCases.filter((c) => c.sexo === 'M').length;
    const casosF = groupCases.filter((c) => c.sexo === 'F').length;
    const casosT = casosM + casosF;

    // Manual RHOVE Junio 2024 (pág. 33 y 75): Letalidad por IAAS contabiliza Defunciones POR IAAS
    const defM = groupCases.filter(
      (c) => c.sexo === 'M' && c.desenlace === 'defuncion_por_iaas'
    ).length;
    const defF = groupCases.filter(
      (c) => c.sexo === 'F' && c.desenlace === 'defuncion_por_iaas'
    ).length;
    const defT = defM + defF;

    const rawExp = study.poblacionExpuestaPorEdad?.[key] || { m: 0, f: 0 };
    const expM =
      study.poblacionExpuestaModo === 'por_edad'
        ? Math.max(rawExp.m, 0)
        : Math.max(rawExp.m, casosM);
    const expF =
      study.poblacionExpuestaModo === 'por_edad'
        ? Math.max(rawExp.f, 0)
        : Math.max(rawExp.f, casosF);
    const expT = expM + expF;

    return {
      key,
      label,
      casosM,
      casosF,
      casosT,
      defM,
      defF,
      defT,
      expM,
      expF,
      expT,
      ataqueM: safeRate(casosM, expM),
      ataqueF: safeRate(casosF, expF),
      ataqueT: safeRate(casosT, expT),
      letalidadM: safeRate(defM, casosM),
      letalidadF: safeRate(defF, casosF),
      letalidadT: safeRate(defT, casosT),
    };
  });

  const totCasosM = rows.reduce((s, r) => s + r.casosM, 0);
  const totCasosF = rows.reduce((s, r) => s + r.casosF, 0);
  const totCasosT = totCasosM + totCasosF;
  const totDefM = rows.reduce((s, r) => s + r.defM, 0);
  const totDefF = rows.reduce((s, r) => s + r.defF, 0);
  const totDefT = totDefM + totDefF;

  const sumAgeExpM = rows.reduce((s, r) => s + r.expM, 0);
  const sumAgeExpF = rows.reduce((s, r) => s + r.expF, 0);
  const totExpM =
    study.poblacionExpuestaModo === 'por_edad'
      ? sumAgeExpM
      : Math.max(study.expuestosGlobalM || 0, totCasosM);
  const totExpF =
    study.poblacionExpuestaModo === 'por_edad'
      ? sumAgeExpF
      : Math.max(study.expuestosGlobalF || 0, totCasosF);
  const totExpT = totExpM + totExpF;

  rows.push({
    key: 'TOTAL',
    label: 'TOTAL',
    casosM: totCasosM,
    casosF: totCasosF,
    casosT: totCasosT,
    defM: totDefM,
    defF: totDefF,
    defT: totDefT,
    expM: totExpM,
    expF: totExpF,
    expT: totExpT,
    ataqueM: safeRate(totCasosM, totExpM),
    ataqueF: safeRate(totCasosF, totExpF),
    ataqueT: safeRate(totCasosT, totExpT),
    letalidadM: safeRate(totDefM, totCasosM),
    letalidadF: safeRate(totDefF, totCasosF),
    letalidadT: safeRate(totDefT, totCasosT),
  });

  return rows;
}

export interface SymptomFrequencyRow {
  symptom: string;
  count: number;
  pct: number;
}

export function computeSymptomFrequency(study: OutbreakStudyRecord): SymptomFrequencyRow[] {
  const included = study.casos.filter((c) => c.incluidoEnEstudio);
  const total = included.length;
  if (!total) return [];

  const counts: Record<string, number> = {};
  included.forEach((c) => {
    const uniqueSigns = new Set((c.signosSintomas || []).map((s) => s.trim()).filter(Boolean));
    uniqueSigns.forEach((s) => {
      counts[s] = (counts[s] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([symptom, count]) => ({
      symptom,
      count,
      pct: Number(((count / total) * 100).toFixed(1)),
    }));
}

export interface EpidemicCurveDayPoint {
  dateIso: string;
  shortLabel: string;
  casosVivos: number;
  defuncionesIaas: number;
  totalDia: number;
  accionControl: boolean;
  pacientes: string[];
}

export function computeEpidemicCurveByFis(study: OutbreakStudyRecord): EpidemicCurveDayPoint[] {
  const included = study.casos.filter(
    (c) => c.incluidoEnEstudio && /^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicioSintomas)
  );
  if (!included.length) return [];

  const fisDates = included.map((c) => c.fechaInicioSintomas).sort();
  const minDt = new Date(`${fisDates[0]}T12:00:00`);
  const maxFisIso = fisDates[fisDates.length - 1];
  const endAnchorIso =
    study.fechaCierre && study.fechaCierre > maxFisIso ? study.fechaCierre : maxFisIso;
  const maxDt = new Date(`${endAnchorIso}T12:00:00`);

  // Add 1 day pre-outbreak baseline and 2 days post-last-case for classic epidemic curve legibility
  minDt.setDate(minDt.getDate() - 1);
  maxDt.setDate(maxDt.getDate() + 2);

  // Cap span to 60 days so chart remains crisp even if a user mistypes a year
  const maxSpanDays = Math.min(daysBetween(toISO(minDt)!, toISO(maxDt)!), 60);
  const actionDates = new Set((study.accionesControl || []).map((a) => a.fecha));

  const points: EpidemicCurveDayPoint[] = [];
  for (let i = 0; i <= Math.max(0, maxSpanDays); i += 1) {
    const cur = new Date(minDt.getTime());
    cur.setDate(minDt.getDate() + i);
    const iso = toISO(cur)!;
    const dayCases = included.filter((c) => c.fechaInicioSintomas === iso);
    const defuncionesIaas = dayCases.filter((c) => c.desenlace === 'defuncion_por_iaas').length;
    const casosVivos = dayCases.length - defuncionesIaas;

    points.push({
      dateIso: iso,
      shortLabel: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`,
      casosVivos,
      defuncionesIaas,
      totalDia: dayCases.length,
      accionControl: actionDates.has(iso),
      pacientes: dayCases.map(
        (c) => `${c.iniciales} (${c.cama || 's/c'} · ${c.iaasType})`
      ),
    });
  }

  return points;
}

export interface SpatialCroquisNode {
  orderNumber: number;
  patientId: string;
  cama: string;
  servicioBrote: string;
  servicioPrevio: string;
  iniciales: string;
  nombre: string;
  expediente: string;
  fis: string;
  iaasType: IaasType2024;
  isDeathByIaas: boolean;
  desenlace: IaasPatientOutcome;
}

export function computeSpatialCroquis(study: OutbreakStudyRecord): SpatialCroquisNode[] {
  const included = [...study.casos.filter((c) => c.incluidoEnEstudio)].sort((a, b) => {
    const fa = a.fechaInicioSintomas || '9999-99-99';
    const fb = b.fechaInicioSintomas || '9999-99-99';
    return fa.localeCompare(fb) || a.cama.localeCompare(b.cama);
  });

  return included.map((c, idx) => ({
    orderNumber: idx + 1,
    patientId: c.patientId,
    cama: c.cama || 'S/C',
    servicioBrote: c.servicioBrote || study.servicioMedico,
    servicioPrevio: c.servicioPrevio,
    iniciales: c.iniciales || toPatientInitials(c.nombre),
    nombre: c.nombre,
    expediente: c.expediente,
    fis: c.fechaInicioSintomas,
    iaasType: c.iaasType,
    isDeathByIaas: c.desenlace === 'defuncion_por_iaas',
    desenlace: c.desenlace,
  }));
}

export function computeDaysSinceLastCase(study: OutbreakStudyRecord, refIso?: string): number | null {
  const validFis = study.casos
    .filter((c) => c.incluidoEnEstudio && /^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicioSintomas))
    .map((c) => c.fechaInicioSintomas)
    .sort();
  if (!validFis.length) return null;
  const lastFis = validFis[validFis.length - 1];
  const anchor = refIso || todayISO();
  return Math.max(0, daysBetween(lastFis, anchor));
}

/**
 * Motor de Auditoría Preventiva ("Cero Observaciones") basado en el Oficio Estatal
 * CE-IBVER/JSAS/JDEPI/COM/0015/2026 y el Manual IAAS RHOVE Junio 2024.
 */
export function validateOutbreakStudy(
  study: OutbreakStudyRecord,
  activeCluster?: OutbreakCluster | null
): OutbreakAuditFinding[] {
  const findings: OutbreakAuditFinding[] = [];
  const included = study.casos.filter((c) => c.incluidoEnEstudio);

  if (included.length < 2) {
    findings.push({
      id: 'min-cases',
      severity: 'warning',
      section: 'censo',
      title: 'Menos de 2 casos incluidos en el censo nominal',
      detail:
        'Un brote hospitalario requiere 2 o más casos asociados epidemiológicamente (salvo agentes de incidencia cero).',
    });
  }

  // 1. Apartado II: DX Probable y DX Final deben listar todos los tipos de IAAS del censo
  const censusTypes = Array.from(new Set(included.map((c) => c.iaasType)));
  const missingInDxProb = censusTypes.filter(
    (code) => !norm(study.dxProbable).includes(norm(code))
  );
  if (missingInDxProb.length > 0) {
    findings.push({
      id: 'dx-probable-types',
      severity: 'error',
      section: 'caratula',
      title: 'DX Probable no incluye todos los tipos de IAAS del censo',
      detail: `Observación estatal Apartado II: el censo incluye [${censusTypes.join(
        ', '
      )}], pero falta mencionar [${missingInDxProb.join(
        ', '
      )}] en DX Probable. Usa el botón “Sincronizar DX con censo”.`,
    });
  }

  const confirmedTypes = Array.from(
    new Set(included.filter((c) => c.nivelDiagnostico === 'confirmada_lab').map((c) => c.iaasType))
  );
  if (confirmedTypes.length > 0) {
    const missingInDxFinal = confirmedTypes.filter(
      (code) => !norm(study.dxFinal).includes(norm(code))
    );
    if (!study.dxFinal.trim() || missingInDxFinal.length > 0) {
      findings.push({
        id: 'dx-final-types',
        severity: 'warning',
        section: 'caratula',
        title: 'Actualizar DX Final conforme a casos confirmados',
        detail: `Observación estatal Apartado II: existen casos confirmados por laboratorio (${confirmedTypes.join(
          ', '
        )}); actualiza el DX Final para guardar congruencia con el censo nominal.`,
      });
    }
  }

  // 2. Notification timeliness (>24h check per Manual 2024 pág. 69)
  if (study.fechaDeteccion && study.fechaNotificacion) {
    const diffNotif = daysBetween(study.fechaDeteccion, study.fechaNotificacion);
    if (diffNotif > 1) {
      findings.push({
        id: 'notif-delay',
        severity: 'warning',
        section: 'caratula',
        title: 'Oportunidad en la notificación (>24 horas)',
        detail: `Entre la detección (${fmtFull(study.fechaDeteccion)}) y la notificación (${fmtFull(
          study.fechaNotificacion
        )}) transcurrieron ${diffNotif} días. El indicador RHOVE evalúa notificación dentro de las primeras 24 h.`,
      });
    }
  }

  // 3. Per-case validations (FIS, congruence with SEVEIAAS, RHOVE 2024 device windows, normalized sample, treatment)
  let sameAsSampleCount = 0;
  included.forEach((c) => {
    const pLabel = `${c.iniciales || c.nombre} (${c.cama || 's/c'})`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicioSintomas)) {
      findings.push({
        id: `fis-missing-${c.patientId}`,
        severity: 'error',
        section: 'censo',
        patientLabel: pLabel,
        title: 'Falta Fecha de Inicio de Síntomas (FIS) válida',
        detail:
          'Observación crítica SUIVE-3: la columna Fecha de Inicio solo admite fecha exacta (nunca signos clínicos) y es obligatoria para graficar la Curva Epidémica.',
      });
    } else {
      if (c.fechaTomaMuestra && c.fechaInicioSintomas === c.fechaTomaMuestra) {
        sameAsSampleCount += 1;
      }
      if (
        c.fechaInicioSeveiaas &&
        /^\d{4}-\d{2}-\d{2}$/.test(c.fechaInicioSeveiaas) &&
        c.fechaInicioSintomas !== c.fechaInicioSeveiaas
      ) {
        findings.push({
          id: `fis-seveiaas-${c.patientId}`,
          severity: 'error',
          section: 'censo',
          patientLabel: pLabel,
          title: 'Incongruencia de FIS entre SUIVE-3 y SEVEIAAS/RHOVE',
          detail: `En SUIVE-3 tiene FIS ${fmtFull(
            c.fechaInicioSintomas
          )} y en SEVEIAAS ${fmtFull(
            c.fechaInicioSeveiaas
          )}. Deben coincidir exactamente para evitar observaciones estatales.`,
        });
      }
      if (c.fechaIngresoHospital && c.fechaInicioSintomas < c.fechaIngresoHospital) {
        findings.push({
          id: `fis-before-adm-${c.patientId}`,
          severity: 'error',
          section: 'censo',
          patientLabel: pLabel,
          title: 'FIS anterior al ingreso hospitalario',
          detail: `La FIS (${fmtFull(c.fechaInicioSintomas)}) es previa al ingreso (${fmtFull(
            c.fechaIngresoHospital
          )}).`,
        });
      }
    }

    // Specimen validation
    const specimenIssue = isAmbiguousOrInvalidSpecimen(c.tipoMuestra, c.iaasType);
    if (specimenIssue) {
      findings.push({
        id: `specimen-${c.patientId}`,
        severity: 'error',
        section: 'censo',
        patientLabel: pLabel,
        title: 'Tipo de muestra ambiguo o no válido para RHOVE 2024',
        detail: specimenIssue,
      });
    }

    // Invasive device timeline window validation (Manual 2024 + State PDF observation #2)
    const entry = getIaasCatalogEntry(c.iaasType);
    if (
      entry.postRemovalWindowDays != null &&
      c.fechaRetiroDisp &&
      c.fechaInicioSintomas &&
      (c.iaasType === 'NAV' || c.iaasType === 'ITS-CC' || c.iaasType === 'IVU-CU')
    ) {
      const daysAfterRemoval = daysBetween(c.fechaRetiroDisp, c.fechaInicioSintomas);
      if (daysAfterRemoval > entry.postRemovalWindowDays) {
        findings.push({
          id: `window-post-removal-${c.patientId}`,
          severity: 'error',
          section: 'censo',
          patientLabel: pLabel,
          title: `Inicio de síntomas fuera de ventana post-retiro para ${c.iaasType}`,
          detail: `La FIS (${fmtFull(
            c.fechaInicioSintomas
          )}) ocurrió ${daysAfterRemoval} días después del retiro del dispositivo (${fmtFull(
            c.fechaRetiroDisp
          )}), superando el límite de ${
            entry.postRemovalWindowDays * 24
          } h del Manual RHOVE 2024. Revalora si corresponde a NAAS-RP / NAAS-NRP o ISQ post-procedimiento.`,
        });
      }
    }

    if (
      (c.iaasType === 'NAV' || c.iaasType === 'ITS-CC' || c.iaasType === 'IVU-CU') &&
      !c.fechaInstalacionDisp
    ) {
      findings.push({
        id: `install-date-${c.patientId}`,
        severity: 'warning',
        section: 'censo',
        patientLabel: pLabel,
        title: 'Falta fecha de instalación del dispositivo invasivo',
        detail: `Para ${c.iaasType}, el oficio estatal solicita registrar fecha exacta de instalación (y retiro si aplica) para comprobar ≥48 h previas a la FIS.`,
      });
    } else if (
      c.fechaInstalacionDisp &&
      c.fechaInicioSintomas &&
      (c.iaasType === 'NAV' || c.iaasType === 'ITS-CC' || c.iaasType === 'IVU-CU')
    ) {
      const daysInstalled = daysBetween(c.fechaInstalacionDisp, c.fechaInicioSintomas);
      if (daysInstalled < 2) {
        findings.push({
          id: `under-48h-${c.patientId}`,
          severity: 'warning',
          section: 'censo',
          patientLabel: pLabel,
          title: `Menos de 2 días calendario entre instalación e inicio de síntomas (${c.iaasType})`,
          detail: `Verifica horas exactas: el Manual RHOVE 2024 requiere ≥48 horas posteriores a la colocación del dispositivo.`,
        });
      }
    }

    if (c.iaasType === 'ITS-IV') {
      findings.push({
        id: `cofepris-${c.patientId}`,
        severity: 'warning',
        section: 'seguimiento',
        patientLabel: pLabel,
        title: 'Protocolo obligatorio COFEPRIS (<24 h) por sospecha de ITS-IV',
        detail:
          'Manual RHOVE 2024 (pág. 51 y 70): suspender e inmovilizar lote sospechoso de inmediato y notificar en <24 h a RHOVE estatal y regulación sanitaria (COFEPRIS).',
      });
    }

    if (!c.tratamientoAntimicrobiano.trim()) {
      findings.push({
        id: `tx-missing-${c.patientId}`,
        severity: 'warning',
        section: 'censo',
        patientLabel: pLabel,
        title: 'Falta registrar esquema antimicrobiano instaurado',
        detail:
          'Observación estatal Censo Nominal: incluir el tratamiento antimicrobiano iniciado para la IAAS.',
      });
    }

    if (study.stage !== 'borrador' && !c.asociadoBroteSeveiaas) {
      findings.push({
        id: `seveiaas-flag-${c.patientId}`,
        severity: 'warning',
        section: 'seguimiento',
        patientLabel: pLabel,
        title: 'Pendiente marcar “Es parte de un brote = SÍ” en SEVEIAAS',
        detail:
          'Verifica que el caso ya tenga marcado asociación a brote y el folio NOTINMED en plataforma SEVEIAAS.',
      });
    }
  });

  if (included.length >= 2 && sameAsSampleCount === included.length) {
    findings.push({
      id: 'fis-equals-sample-all',
      severity: 'warning',
      section: 'curva',
      title: 'Verifica que la FIS no sea la Fecha de Toma de Muestra',
      detail:
        'En todos los casos la FIS coincide con la fecha de toma de cultivo. Confirma en expediente clínico el día exacto de inicio de signos/síntomas (Observación estatal Apartado IV).',
    });
  }

  // 4.Fecha de inicio del brote debe coincidir con la mínima FIS del censo
  const validFis = included
    .map((c) => c.fechaInicioSintomas)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  if (validFis.length > 0 && study.fechaInicioBrote !== validFis[0]) {
    findings.push({
      id: 'outbreak-start-mismatch',
      severity: 'warning',
      section: 'caratula',
      title: 'Fecha de inicio del brote distinta al caso índice (primera FIS)',
      detail: `El primer caso inició síntomas el ${fmtFull(
        validFis[0]
      )}, mientras que la carátula indica ${fmtFull(study.fechaInicioBrote)}.`,
    });
  }

  // 5. Exposed population check (avoid Attack Rate > 100% or #DIV/0!)
  const personRows = computeSuivePersonDistribution(study);
  const totalRow = personRows[personRows.length - 1];
  if (totalRow && (totalRow.expM < totalRow.casosM || totalRow.expF < totalRow.casosF)) {
    findings.push({
      id: 'exposed-less-than-cases',
      severity: 'error',
      section: 'curva',
      title: 'Población expuesta menor que el número de casos',
      detail:
        'Ajusta los pacientes expuestos del servicio para que ninguna tasa de ataque supere 100% ni genere errores de división.',
    });
  }

  // 6. Control actions with exact dates
  if (!study.accionesControl.length || study.accionesControl.some((a) => !a.fecha)) {
    findings.push({
      id: 'control-actions-dates',
      severity: 'error',
      section: 'analisis',
      title: 'Acciones de control sin fecha exacta de implementación',
      detail:
        'Observación estatal Apartado VII: todas las acciones de prevención y control deben precisar su fecha exacta de inicio.',
    });
  }

  // 7. Active cluster new-case detection for open studies
  if (activeCluster && study.stage !== 'cerrado') {
    const knownIds = new Set(study.casos.map((c) => c.patientId));
    const newMembers = activeCluster.members.filter((m) => !knownIds.has(m.id));
    if (newMembers.length > 0) {
      findings.push({
        id: 'new-cluster-members',
        severity: 'error',
        section: 'seguimiento',
        title: `${newMembers.length} paciente(s) nuevo(s) detectado(s) con la misma cepa idéntica`,
        detail: `Corresponde enviar ACTUALIZACIÓN de SUIVE-3 en NOTINMED (no solo nota informativa) e incorporar a: ${newMembers
          .map((m) => `${m.nombre} (${m.cama || 's/c'})`)
          .join(', ')}.`,
      });
    }
  }

  return findings;
}

const LOCAL_STUDIES_KEY = 'uveh_outbreak_studies_v1';

function createInitialHistoricalOutbreakSeed(): OutbreakStudyRecord[] {
  const emptyExp = createEmptyExposedByAge();
  emptyExp['45-49'] = { m: 1, f: 0 };
  emptyExp['60-64'] = { m: 1, f: 1 };

  return [
    {
      id: 'brote-hist-mayo-2026',
      clusterKey: 'acinetobacter-baumannii__ucia-hist-202605',
      organismo: 'acinetobacter baumannii',
      fenotipoResistencia: 'Resistencia a carbapenémicos (MDR)',
      serviciosInvolucrados: ['UCIA'],
      stage: 'cerrado',
      folioNotinmedBase: 'NM00341820',
      folioSufijoActual: '1',
      unidadNotificante: 'Hospital Regional de Alta Especialidad de Veracruz',
      claveSuave: '',
      claveClues: 'VZIMB002495',
      localidad: 'Veracruz',
      municipio: 'Veracruz',
      jurisdiccion: 'Jurisdicción Sanitaria No. VIII Veracruz',
      entidad: 'Veracruz de Ignacio de la Llave',
      institucion: 'IMSS-Bienestar',
      servicioMedico: 'UCIA',
      dxProbable:
        'Brote intrahospitalario de IAAS (NAV) probable por Acinetobacter baumannii resistente a carbapenémicos (MDR)',
      dxFinal:
        'Brote intrahospitalario de IAAS (NAV) confirmado por Acinetobacter baumannii resistente a carbapenémicos (MDR)',
      fechaInicioBrote: '2026-05-09',
      fechaDeteccion: '2026-05-12',
      fechaNotificacion: '2026-05-12',
      fechaCierre: '2026-06-02',
      poblacionExpuestaPorEdad: emptyExp,
      poblacionExpuestaModo: 'global_servicio',
      expuestosGlobalM: 11,
      expuestosGlobalF: 9,
      casos: [
        {
          patientId: 'hist-202605-1',
          expediente: '20260188',
          nombre: 'MENDEZ LARA JORGE',
          iniciales: 'M.L.J.',
          edadAnios: 48,
          edadTexto: '48',
          grupoEdad: '45-49',
          sexo: 'M',
          cama: 'UCIA-03',
          fechaIngresoHospital: '2026-05-01',
          servicioPrevio: 'Urgencias Adultos',
          servicioBrote: 'UCIA',
          fechaIngresoServicio: '2026-05-02',
          iaasGroup: 'NAAS',
          iaasType: 'NAV',
          nivelDiagnostico: 'confirmada_lab',
          folioRhove: 'RH-2026-084',
          asociadoBroteSeveiaas: true,
          fechaInicioSintomas: '2026-05-09',
          fechaInicioSeveiaas: '2026-05-09',
          signosSintomas: [
            'Fiebre (≥38 °C)',
            'Expectoración purulenta / aumento de secreciones',
            'Infiltrado nuevo o consolidación radiográfica',
          ],
          cuadroClinicoDetalle: 'Fiebre 38.8 °C, secreción bronquial purulenta al día 7 de VM.',
          dispositivoPrincipal: 'VM',
          fechaInstalacionDisp: '2026-05-02',
          fechaRetiroDisp: '2026-05-18',
          procedimientosAsociados: 'Intubación orotraqueal en Urgencias',
          fechaProcedimiento: '2026-05-02',
          tipoMuestra: 'Aspirado bronquial',
          fechaTomaMuestra: '2026-05-10',
          fechaResultadoLab: '2026-05-12',
          microorganismo: 'Acinetobacter baumannii',
          mecanismoResistencia: 'Resistencia a carbapenémicos (MDR)',
          perfilResistencia:
            'Meropenem >=16 R; Imipenem >=16 R; Ciprofloxacino >=4 R; Colistina <=0.5 S',
          tratamientoAntimicrobiano: 'Colistina + Tigeciclina IV',
          fechaInicioTratamiento: '2026-05-12',
          desenlace: 'egreso_mejoria',
          fechaEgresoDefuncion: '2026-05-25',
          folioCertificadoDefuncion: '',
          evidenciaCultivoArchivo: 'Antibiograma_UCIA03_Mayo2026.pdf',
          incluidoEnEstudio: true,
        },
        {
          patientId: 'hist-202605-2',
          expediente: '20260195',
          nombre: 'ORTIZ VAZQUEZ ELENA',
          iniciales: 'O.V.E.',
          edadAnios: 62,
          edadTexto: '62',
          grupoEdad: '60-64',
          sexo: 'F',
          cama: 'UCIA-04',
          fechaIngresoHospital: '2026-05-04',
          servicioPrevio: 'Cirugía General',
          servicioBrote: 'UCIA',
          fechaIngresoServicio: '2026-05-05',
          iaasGroup: 'NAAS',
          iaasType: 'NAV',
          nivelDiagnostico: 'confirmada_lab',
          folioRhove: 'RH-2026-089',
          asociadoBroteSeveiaas: true,
          fechaInicioSintomas: '2026-05-11',
          fechaInicioSeveiaas: '2026-05-11',
          signosSintomas: [
            'Fiebre (≥38 °C)',
            'Expectoración purulenta / aumento de secreciones',
            'Desaturación (PaO₂/FiO₂ ≤240) / mayor demanda ventilatoria',
            'Leucocitosis (≥12,000/µL)',
          ],
          cuadroClinicoDetalle: 'Deterioro ventilatorio y fiebre al día 6 de VM.',
          dispositivoPrincipal: 'VM',
          fechaInstalacionDisp: '2026-05-05',
          fechaRetiroDisp: '2026-05-20',
          procedimientosAsociados: 'Laparotomía previa',
          fechaProcedimiento: '2026-05-04',
          tipoMuestra: 'Aspirado traqueal',
          fechaTomaMuestra: '2026-05-11',
          fechaResultadoLab: '2026-05-13',
          microorganismo: 'Acinetobacter baumannii',
          mecanismoResistencia: 'Resistencia a carbapenémicos (MDR)',
          perfilResistencia:
            'Meropenem >=16 R; Imipenem >=16 R; Ciprofloxacino >=4 R; Colistina <=0.5 S',
          tratamientoAntimicrobiano: 'Colistina IV + Ampicilina/Sulbactam altas dosis',
          fechaInicioTratamiento: '2026-05-13',
          desenlace: 'egreso_mejoria',
          fechaEgresoDefuncion: '2026-05-29',
          folioCertificadoDefuncion: '',
          evidenciaCultivoArchivo: 'Antibiograma_UCIA04_Mayo2026.pdf',
          incluidoEnEstudio: true,
        },
      ],
      antecedentesPanorama:
        'Brote previo controlado en mayo 2026 en UCIA tras desinfección exhaustiva con triple cubeta, recambio de circuitos de inhaloterapia y supervisión de paquetes NAV.',
      probablesFuentes:
        'Contaminación cruzada en circuitos de terapia respiratoria y superficies de alto contacto entre camas contiguas UCIA-03 y UCIA-04.',
      probablesMecanismos: 'Contacto indirecto por manipulación de vía aérea artificial.',
      accionesControl: [
        {
          id: 'act-hist-1',
          fecha: '2026-05-12',
          categoria: 'aislamiento',
          descripcion: 'Cohorte estricta en UCIA y tarjeta amarilla de contacto.',
          responsable: 'UVEH / Jefatura UCIA',
        },
        {
          id: 'act-hist-2',
          fecha: '2026-05-13',
          categoria: 'inhaloterapia_ceye',
          descripcion: 'Esterilización de circuitos y auditoría de proceso de inhaloterapia.',
          responsable: 'UVEH / Inhaloterapia / CEyE',
        },
      ],
      bitacoraSeguimiento: [
        {
          id: 'log-hist-0',
          fecha: '2026-05-12',
          tipo: 'inicial_0',
          folioNotinmed: 'NM00341820-0',
          resumen: 'Notificación inicial de 2 casos de NAV por A. baumannii MDR en UCIA.',
          autor: 'Coordinación UVEH',
        },
        {
          id: 'log-hist-1',
          fecha: '2026-06-02',
          tipo: 'cierre_1',
          folioNotinmed: 'NM00341820-1',
          resumen:
            'Alta sanitaria y cierre tras 21 días sin casos nuevos posteriores a la última FIS (11/05/2026).',
          autor: 'Coordinación UVEH',
        },
      ],
      checklistCodeciaas: {
        minutaCodeciaas: true,
        fechaMinutaCodeciaas: '2026-05-13',
        minutaRecorridoCampo: true,
        fechaRecorridoCampo: '2026-05-12',
        reportesSusceptibilidadLab: true,
        listasCapacitacionEppHigiene: true,
        evidenciaPaquetesPreventivos: true,
        notasDocumentales: 'Carpeta digital completa enviada a Jurisdicción VIII.',
      },
      elaboroNombreCargo: 'Coordinación UVEH HAEV',
      directorNombre: 'Dirección Médica HAEV',
      epidemiologoNombre: 'Encargada UVEH',
      creadoEn: '2026-05-12T14:00:00.000Z',
      actualizadoEn: '2026-06-02T16:30:00.000Z',
      actualizadoPor: 'UVEH',
    },
  ];
}

export function loadLocalOutbreakStudies(): OutbreakStudyRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STUDIES_KEY);
    if (!raw) {
      const seed = createInitialHistoricalOutbreakSeed();
      localStorage.setItem(LOCAL_STUDIES_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as OutbreakStudyRecord[];
    return Array.isArray(parsed) ? parsed : createInitialHistoricalOutbreakSeed();
  } catch {
    return createInitialHistoricalOutbreakSeed();
  }
}

export function saveLocalOutbreakStudies(studies: OutbreakStudyRecord[]): void {
  try {
    localStorage.setItem(LOCAL_STUDIES_KEY, JSON.stringify(studies));
  } catch {
    // Ignore storage quota errors
  }
}
