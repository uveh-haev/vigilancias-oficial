import * as XLSX from 'xlsx';
import {
  OutbreakStudyRecord,
  SuiveAgeGroupKey,
  SuiveTemplateMappingSummary,
} from '../types/clinical';
import { fmtFull, norm } from './dates';
import {
  INVASIVE_DEVICE_LABELS,
  OUTCOME_LABELS,
  STAGE_LABELS,
  SUIVE_AGE_GROUPS,
  computeEpidemicCurveByFis,
  computeSpatialCroquis,
  computeSuivePersonDistribution,
  computeSymptomFrequency,
} from './iaasTaxonomy2024';
import { prettyOrganism } from './outbreaks';

const TEMPLATE_META_KEY = 'uveh_suive3_template_meta_v1';
const TEMPLATE_B64_KEY = 'uveh_suive3_template_b64_v1';

let inMemoryTemplateBase64: string | null = null;

export interface SuiveFieldDefinition {
  key: string;
  label: string;
  patterns: RegExp[];
}

export const SUIVE_TEMPLATE_FIELDS: SuiveFieldDefinition[] = [
  {
    key: 'unidadNotificante',
    label: 'Unidad notificante',
    patterns: [/unidad\s+notificante/, /nombre\s+de\s+la\s+unidad/],
  },
  {
    key: 'claveSuave',
    label: 'Clave SUAVE de la unidad',
    patterns: [/clave\s+suave/, /clave\s+de\s+la\s+unidad/],
  },
  {
    key: 'claveClues',
    label: 'Clave CLUES',
    patterns: [/clave\s+clues/, /\bclues\b/],
  },
  {
    key: 'localidad',
    label: 'Localidad',
    patterns: [/^localidad:?$/],
  },
  {
    key: 'municipio',
    label: 'Municipio o Delegación',
    patterns: [/^municipio/, /municipio\s+o\s+delegacion/],
  },
  {
    key: 'jurisdiccion',
    label: 'Jurisdicción o equivalente',
    patterns: [/jurisdiccion/],
  },
  {
    key: 'entidad',
    label: 'Entidad federativa',
    patterns: [/entidad\s+federativa/, /entidad\s+o\s+delegacion/, /^estado\s+notificante/],
  },
  {
    key: 'institucion',
    label: 'Institución',
    patterns: [/^institucion:?$/],
  },
  {
    key: 'servicioMedico',
    label: 'Servicio médico',
    patterns: [/servicio\s+medico/, /^servicio:?$/],
  },
  {
    key: 'folioNotinmed',
    label: 'Folio NOTINMED / RHOVE',
    patterns: [/folio\s+notinmed/, /folios?\s+rhove/, /folios?\s+de\s+plataforma/],
  },
  {
    key: 'dxProbable',
    label: 'DX. Probable',
    patterns: [/dx\.?\s*probable/, /diagnostico\s+probable/],
  },
  {
    key: 'dxFinal',
    label: 'DX. Final',
    patterns: [/dx\.?\s*final/, /diagnostico\s+final/],
  },
  {
    key: 'fechaInicioBrote',
    label: 'Fecha de inicio del brote',
    patterns: [/fecha\s+de\s+inicio\s+del\s+brote/],
  },
  {
    key: 'fechaDeteccion',
    label: 'Fecha de detección',
    patterns: [/fecha\s+de\s+deteccion/],
  },
  {
    key: 'fechaNotificacion',
    label: 'Fecha de notificación',
    patterns: [/fecha\s+de\s+notificacion/],
  },
  {
    key: 'casosProbables',
    label: 'Casos probables',
    patterns: [/casos\s+probables/],
  },
  {
    key: 'casosConfirmados',
    label: 'Casos confirmados',
    patterns: [/casos\s+confirmados/],
  },
  {
    key: 'hospitalizados',
    label: 'Hospitalizados',
    patterns: [/^hospitalizados:?$/],
  },
  {
    key: 'defunciones',
    label: 'Defunciones',
    patterns: [/^defunciones:?$/, /no\.?\s*de\s+defunciones/],
  },
  {
    key: 'antecedentesPanorama',
    label: 'VI.1 Antecedentes epidemiológicos',
    patterns: [
      /antecedentes\s+epidemiologicos/,
      /vi\.?\s*iii\s*antecedentes/,
      /1\.\s*antecedentes\s+epidemiologicos/,
    ],
  },
  {
    key: 'probablesFuentes',
    label: 'VI.2 Probables fuentes del brote',
    patterns: [/probables?\s+fuentes?\s+del\s+brote/],
  },
  {
    key: 'probablesMecanismos',
    label: 'VI.3 Probables mecanismos de transmisión',
    patterns: [/probables?\s+mecanismos?\s+de\s+transmision/],
  },
  {
    key: 'accionesControl',
    label: 'VII. Acciones de prevención y control',
    patterns: [/acciones\s+de\s+prevencion\s+y\s+control/, /anotar\s+de\s+forma\s+detallada\s+las\s+principales\s+acciones/],
  },
];

const AGE_GROUP_PATTERNS: Array<{ key: SuiveAgeGroupKey; regex: RegExp }> = [
  { key: '<1', regex: /^<\s*1(\s*ano)?$/ },
  { key: '1-4', regex: /^1\s*[-a]\s*4(\s*anos?)?$/ },
  { key: '5-9', regex: /^5\s*[-a]\s*9(\s*anos?)?$/ },
  { key: '10-14', regex: /^10\s*[-a]\s*14(\s*anos?)?$/ },
  { key: '15-19', regex: /^15\s*[-a]\s*19(\s*anos?)?$/ },
  { key: '20-24', regex: /^20\s*[-a]\s*24(\s*anos?)?$/ },
  { key: '25-44', regex: /^25\s*[-a]\s*44(\s*anos?)?$/ },
  { key: '45-49', regex: /^45\s*[-a]\s*49(\s*anos?)?$/ },
  { key: '50-59', regex: /^50\s*[-a]\s*59(\s*anos?)?$/ },
  { key: '60-64', regex: /^60\s*[-a]\s*64(\s*anos?)?$/ },
  { key: '65+', regex: /^65\s*(y\s*mas|\+)/ },
  { key: 'ignora', regex: /se\s+ignora/ },
];

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function findWritableTargetCell(
  ws: XLSX.WorkSheet,
  r: number,
  c: number,
  preferBelow: boolean
): string {
  const merges = ws['!merges'] || [];
  let endCol = c;
  let endRow = r;
  for (const m of merges) {
    if (r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c) {
      endCol = Math.max(endCol, m.e.c);
      endRow = Math.max(endRow, m.e.r);
    }
  }

  if (preferBelow) {
    return XLSX.utils.encode_cell({ r: endRow + 1, c });
  }

  // Scan up to 4 cells to the right for an empty cell or value slot
  for (let step = 1; step <= 4; step += 1) {
    const addr = XLSX.utils.encode_cell({ r, c: endCol + step });
    const existing = ws[addr];
    const txt = existing?.v != null ? String(existing.v).trim() : '';
    if (!txt || /^_+$/.test(txt)) {
      return addr;
    }
  }
  return XLSX.utils.encode_cell({ r, c: endCol + 1 });
}

export function getSavedSuiveTemplateMeta(): SuiveTemplateMappingSummary | null {
  try {
    const raw = localStorage.getItem(TEMPLATE_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SuiveTemplateMappingSummary;
  } catch {
    return null;
  }
}

export function hasActiveTemplateBytes(): boolean {
  if (inMemoryTemplateBase64) return true;
  try {
    return Boolean(localStorage.getItem(TEMPLATE_B64_KEY));
  } catch {
    return false;
  }
}

export function updateSuiveTemplateOverrides(
  overrides: Record<string, string>
): SuiveTemplateMappingSummary | null {
  const meta = getSavedSuiveTemplateMeta();
  if (!meta) return null;
  const updated: SuiveTemplateMappingSummary = {
    ...meta,
    customOverrides: overrides,
  };
  try {
    localStorage.setItem(TEMPLATE_META_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }
  return updated;
}

export function clearSavedSuiveTemplate(): void {
  inMemoryTemplateBase64 = null;
  try {
    localStorage.removeItem(TEMPLATE_META_KEY);
    localStorage.removeItem(TEMPLATE_B64_KEY);
  } catch {
    // Ignore
  }
}

export async function inspectAndSaveSuiveTemplate(
  file: File
): Promise<SuiveTemplateMappingSummary> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, {
    type: 'array',
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
  });

  const sheetNames = wb.SheetNames || [];
  let suiveSheetName: string | null = null;
  let censusSheetName: string | null = null;
  let censusHeaderRowIndex: number | null = null;
  const detectedFieldAnchors: Record<string, string> = {};
  const detectedAgeGroupRows: Record<string, number> = {};

  for (const sName of sheetNames) {
    const ws = wb.Sheets[sName];
    if (!ws || !ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const maxR = Math.min(range.e.r, 180);
    const maxC = Math.min(range.e.c, 45);

    let suiveHitsInSheet = 0;

    for (let r = range.s.r; r <= maxR; r += 1) {
      const rowTexts: string[] = [];
      for (let c = range.s.c; c <= maxC; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell || cell.v == null) continue;
        const clean = norm(cell.v).replace(/\s+/g, ' ');
        if (!clean) continue;
        rowTexts.push(clean);

        // Match SUIVE-3 fields
        for (const field of SUIVE_TEMPLATE_FIELDS) {
          if (detectedFieldAnchors[field.key]) continue;
          if (field.patterns.some((re) => re.test(clean))) {
            const isNarrativeBlock =
              field.key === 'antecedentesPanorama' ||
              field.key === 'probablesFuentes' ||
              field.key === 'probablesMecanismos' ||
              field.key === 'accionesControl';
            const targetCell = findWritableTargetCell(ws, r, c, isNarrativeBlock);
            detectedFieldAnchors[field.key] = `${sName}!${targetCell}`;
            suiveHitsInSheet += 1;
          }
        }

        // Match SUIVE-3 age group rows (only first occurrence = cases/deaths/exposed table, not the rates formula table below)
        for (const ag of AGE_GROUP_PATTERNS) {
          if (detectedAgeGroupRows[ag.key] != null) continue;
          if (ag.regex.test(clean)) {
            detectedAgeGroupRows[ag.key] = r + 1; // 1-indexed row number
            suiveHitsInSheet += 1;
          }
        }
      }

      // Check if this row looks like a Nominal Census header row
      if (!censusSheetName && rowTexts.length >= 4) {
        const joined = rowTexts.join(' | ');
        const hasNameOrExp = /nombre|paciente|expediente|iniciales/.test(joined);
        const hasClinicalCols =
          (/edad|sexo|cama/.test(joined) && /inicio|muestra|microorganismo|iaas/.test(joined));
        if (hasNameOrExp && hasClinicalCols) {
          censusSheetName = sName;
          censusHeaderRowIndex = r + 1; // 1-indexed
        }
      }
    }

    if (suiveHitsInSheet >= 3 && !suiveSheetName) {
      suiveSheetName = sName;
    }
  }

  if (!suiveSheetName && sheetNames.length > 0) {
    suiveSheetName = sheetNames[0];
  }

  const b64 = arrayBufferToBase64(buffer);
  inMemoryTemplateBase64 = b64;
  let persistedInBrowser = false;
  try {
    if (b64.length <= 1_800_000) {
      localStorage.setItem(TEMPLATE_B64_KEY, b64);
      persistedInBrowser = true;
    }
  } catch {
    persistedInBrowser = false;
  }

  const prevMeta = getSavedSuiveTemplateMeta();
  const summary: SuiveTemplateMappingSummary = {
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    sizeBytes: buffer.byteLength,
    sheetNames,
    suiveSheetName,
    censusSheetName,
    censusHeaderRowIndex,
    detectedFieldAnchors,
    detectedAgeGroupRows,
    customOverrides: prevMeta?.fileName === file.name ? prevMeta.customOverrides || {} : {},
    persistedInBrowser,
  };

  try {
    localStorage.setItem(TEMPLATE_META_KEY, JSON.stringify(summary));
  } catch {
    // Ignore
  }

  return summary;
}

function writeCellSafe(
  wb: XLSX.WorkBook,
  qualifiedAddress: string,
  value: string | number
): boolean {
  const parts = qualifiedAddress.split('!');
  if (parts.length !== 2) return false;
  const [sheetName, cellAddr] = parts;
  const ws = wb.Sheets[sheetName];
  if (!ws) return false;
  if (!/^[A-Z]+\d+$/i.test(cellAddr.trim())) return false;

  const upperAddr = cellAddr.trim().toUpperCase();
  const existing = ws[upperAddr];
  // Never overwrite an official template formula!
  if (existing && existing.f) return false;

  const decoded = XLSX.utils.decode_cell(upperAddr);
  const currentRef = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : { s: decoded, e: decoded };
  currentRef.s.r = Math.min(currentRef.s.r, decoded.r);
  currentRef.s.c = Math.min(currentRef.s.c, decoded.c);
  currentRef.e.r = Math.max(currentRef.e.r, decoded.r);
  currentRef.e.c = Math.max(currentRef.e.c, decoded.c);
  ws['!ref'] = XLSX.utils.encode_range(currentRef);

  if (typeof value === 'number') {
    ws[upperAddr] = { ...(existing || {}), t: 'n', v: value };
  } else {
    ws[upperAddr] = { ...(existing || {}), t: 's', v: value };
  }
  return true;
}

function buildCensusSheet(study: OutbreakStudyRecord, useInitials: boolean): XLSX.WorkSheet {
  const included = [...study.casos.filter((c) => c.incluidoEnEstudio)].sort((a, b) =>
    (a.fechaInicioSintomas || '9999').localeCompare(b.fechaInicioSintomas || '9999')
  );

  const headers = [
    'No.',
    'Cama',
    'Expediente',
    useInitials ? 'Iniciales del Paciente' : 'Nombre del Paciente',
    'Edad',
    'Grupo Edad SUIVE-3',
    'Sexo',
    'Fecha Ingreso Hospital',
    'Servicio Previo',
    'Servicio del Brote',
    'Fecha Ingreso al Servicio',
    'Grupo IAAS (2024)',
    'Tipo Específico IAAS (2024)',
    'Nivel Diagnóstico',
    'Fecha Inicio Síntomas (FIS)',
    'FIS en SEVEIAAS (Congruencia)',
    'Signos y Síntomas (Cuadro Clínico)',
    'Dispositivo Invasivo Principal',
    'Fecha Instalación Dispositivo',
    'Fecha Retiro Dispositivo',
    'Procedimientos Quirúrgicos / Invasivos Asociados',
    'Fecha Procedimiento',
    'Tipo de Muestra Normalizada (RHOVE 2024)',
    'Fecha Toma Muestra',
    'Fecha Resultado Laboratorio',
    'Microorganismo Aislado',
    'Mecanismo / Fenotipo Resistencia',
    'Perfil de Susceptibilidad (S/I/R)',
    'Tratamiento Antimicrobiano Instaurado',
    'Fecha Inicio Tratamiento',
    'Desenlace (Clasificación Manual 2024)',
    'Fecha Egreso / Defunción',
    'Folio RHOVE / SEVEIAAS',
    'Asociado a Brote en SEVEIAAS',
    'Folio NOTINMED',
  ];

  const folioCompleto = study.folioNotinmedBase
    ? `${study.folioNotinmedBase}-${study.folioSufijoActual || '0'}`
    : 'En trámite';

  const rows = included.map((c, idx) => [
    idx + 1,
    c.cama || 'S/C',
    c.expediente,
    useInitials ? c.iniciales : c.nombre,
    c.edadTexto || (c.edadAnios != null ? String(c.edadAnios) : 'Se ignora'),
    c.grupoEdad,
    c.sexo,
    fmtFull(c.fechaIngresoHospital),
    c.servicioPrevio || 'Ingreso directo',
    c.servicioBrote || study.servicioMedico,
    fmtFull(c.fechaIngresoServicio),
    c.iaasGroup,
    c.iaasType,
    c.nivelDiagnostico === 'confirmada_lab'
      ? 'Confirmada por laboratorio'
      : 'Definida clínicamente',
    fmtFull(c.fechaInicioSintomas),
    fmtFull(c.fechaInicioSeveiaas || c.fechaInicioSintomas),
    [c.signosSintomas.join(', '), c.cuadroClinicoDetalle].filter(Boolean).join(' — '),
    INVASIVE_DEVICE_LABELS[c.dispositivoPrincipal],
    fmtFull(c.fechaInstalacionDisp),
    fmtFull(c.fechaRetiroDisp) || 'Permanente / Activo',
    c.procedimientosAsociados || 'Ninguno registrado',
    fmtFull(c.fechaProcedimiento),
    c.tipoMuestra,
    fmtFull(c.fechaTomaMuestra),
    fmtFull(c.fechaResultadoLab),
    c.microorganismo,
    c.mecanismoResistencia,
    c.perfilResistencia,
    c.tratamientoAntimicrobiano,
    fmtFull(c.fechaInicioTratamiento),
    OUTCOME_LABELS[c.desenlace],
    fmtFull(c.fechaEgresoDefuncion),
    c.folioRhove || 'Pendiente',
    c.asociadoBroteSeveiaas ? 'SÍ' : 'PENDIENTE',
    folioCompleto,
  ]);

  const ws = XLSX.utils.aoa_to_sheet([
    [
      `CENSO NOMINAL DE BROTE DE IAAS — ${study.unidadNotificante.toUpperCase()} (${study.servicioMedico})`,
    ],
    [
      `Agente: ${prettyOrganism(study.organismo)} | DX Probable: ${study.dxProbable} | Folio NOTINMED: ${folioCompleto}`,
    ],
    [],
    headers,
    ...rows,
  ]);

  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 16) }));
  return ws;
}

function buildCurveAndCroquisSheet(study: OutbreakStudyRecord): XLSX.WorkSheet {
  const curve = computeEpidemicCurveByFis(study);
  const croquis = computeSpatialCroquis(study);

  const aoa: Array<Array<string | number>> = [
    ['APARTADO IV. CURVA EPIDÉMICA (ESTRICTO POR FECHA DE INICIO DE SÍNTOMAS — FIS)'],
    [
      'Nota normativa: Ningún caso se grafica por fecha de toma de muestra. Serie lista para insertar gráfico de columnas apiladas en Excel.',
    ],
    [],
    [
      'Fecha Inicio Síntomas (FIS)',
      'Día/Mes',
      'Casos Vivos / En seguimiento',
      'Defunciones POR IAAS',
      'Total Casos (FIS)',
      'Inicio Acción de Control',
      'Pacientes (Iniciales · Cama · Tipo IAAS)',
    ],
    ...curve.map((pt) => [
      fmtFull(pt.dateIso),
      pt.shortLabel,
      pt.casosVivos,
      pt.defuncionesIaas,
      pt.totalDia,
      pt.accionControl ? 'SÍ' : '',
      pt.pacientes.join('; '),
    ]),
    [],
    ['APARTADO V. DISTRIBUCIÓN ESPACIAL / CROQUIS POR CAMA Y ORDEN CONSECUTIVO DE FIS'],
    [
      'No. Caso (Orden FIS)',
      'Cama',
      'Servicio del Brote',
      'Servicio Previo (Traslado)',
      'Iniciales',
      'Expediente',
      'Fecha Inicio Síntomas (FIS)',
      'Tipo IAAS (2024)',
      'Desenlace',
    ],
    ...croquis.map((n) => [
      n.orderNumber,
      n.cama,
      n.servicioBrote,
      n.servicioPrevio || 'Sin traslado previo',
      n.iniciales,
      n.expediente,
      fmtFull(n.fis),
      n.iaasType,
      OUTCOME_LABELS[n.desenlace],
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 26 },
    { wch: 22 },
    { wch: 18 },
    { wch: 22 },
    { wch: 44 },
    { wch: 18 },
    { wch: 28 },
  ];
  return ws;
}

function buildFollowUpAndCodeciaasSheet(study: OutbreakStudyRecord): XLSX.WorkSheet {
  const chk = study.checklistCodeciaas;
  const aoa: Array<Array<string | number>> = [
    ['SEGUIMIENTO NOTINMED / SEVEIAAS Y CARPETA DOCUMENTAL CODECIAAS'],
    [
      'Estatus actual del estudio:',
      STAGE_LABELS[study.stage],
      'Folio NOTINMED:',
      study.folioNotinmedBase
        ? `${study.folioNotinmedBase}-${study.folioSufijoActual || '0'}`
        : 'Sin asignar',
    ],
    [],
    ['1. LISTA DE COTEJO DE EVIDENCIA COMPLEMENTARIA EXIGIDA POR NIVEL ESTATAL'],
    ['Entregable Documental', 'Cumplimiento', 'Fecha / Referencia'],
    [
      'a) Minuta de sesión extraordinaria del CODECIAAS / CODECIN',
      chk.minutaCodeciaas ? 'COMPLETO' : 'PENDIENTE',
      fmtFull(chk.fechaMinutaCodeciaas),
    ],
    [
      'b) Minuta de recorrido de campo para identificación de riesgos en el servicio',
      chk.minutaRecorridoCampo ? 'COMPLETO' : 'PENDIENTE',
      fmtFull(chk.fechaRecorridoCampo),
    ],
    [
      'c) Informes de laboratorio con identificación y susceptibilidad antimicrobiana (100% casos)',
      chk.reportesSusceptibilidadLab ? 'COMPLETO' : 'PENDIENTE',
      `${study.casos.filter((c) => c.incluidoEnEstudio && c.perfilResistencia).length}/${
        study.casos.filter((c) => c.incluidoEnEstudio).length
      } con antibiograma`,
    ],
    [
      'd) Listas de asistencia de capacitación (EPP, aislamiento contacto, higiene de manos y triple cubeta)',
      chk.listasCapacitacionEppHigiene ? 'COMPLETO' : 'PENDIENTE',
      '',
    ],
    [
      'e) Evidencia de reforzamiento de paquetes preventivos (VM, CVC, sonda vesical)',
      chk.evidenciaPaquetesPreventivos ? 'COMPLETO' : 'PENDIENTE',
      chk.notasDocumentales || '',
    ],
    [],
    ['2. BITÁCORA DE NOTIFICACIONES (INICIAL -0 / NOTAS SEMANALES / CIERRE -1)'],
    ['Fecha', 'Tipo de Envío', 'Folio NOTINMED', 'Resumen Técnico', 'Responsable'],
    ...(study.bitacoraSeguimiento || []).map((log) => [
      fmtFull(log.fecha),
      log.tipo === 'inicial_0'
        ? 'Notificación Inicial (-0)'
        : log.tipo === 'cierre_1'
          ? 'Informe de Cierre (-1)'
          : log.tipo === 'actualizacion_casos'
            ? 'Actualización SUIVE-3 (casos/defunciones)'
            : 'Nota informativa semanal (sin cambios)',
      log.folioNotinmed,
      log.resumen,
      log.autor,
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 56 }, { wch: 24 }, { wch: 24 }, { wch: 52 }, { wch: 24 }];
  return ws;
}

function buildOfficialSuive3Sheet(study: OutbreakStudyRecord): XLSX.WorkSheet {
  const distRows = computeSuivePersonDistribution(study);
  const symRows = computeSymptomFrequency(study);
  const included = study.casos.filter((c) => c.incluidoEnEstudio);
  const confirmados = included.filter((c) => c.nivelDiagnostico === 'confirmada_lab').length;
  const hospitalizados = included.filter((c) => c.desenlace === 'hospitalizado').length;
  const defuncionesPorIaas = included.filter((c) => c.desenlace === 'defuncion_por_iaas').length;
  const foliosRhove = included
    .map((c) => c.folioRhove)
    .filter(Boolean)
    .join(', ');
  const folioNotinmed = study.folioNotinmedBase
    ? `${study.folioNotinmedBase}-${study.folioSufijoActual || '0'}`
    : 'Pendiente';

  const accionesFormatted = (study.accionesControl || [])
    .map((a) => `• [${fmtFull(a.fecha)}] ${a.descripcion} (Resp: ${a.responsable})`)
    .join('\n');

  // Group cases by service for Section V Geographic Distribution
  const bySvc: Record<string, { casos: number; def: number }> = {};
  included.forEach((c) => {
    const k = c.servicioBrote || study.servicioMedico;
    bySvc[k] = bySvc[k] || { casos: 0, def: 0 };
    bySvc[k].casos += 1;
    if (c.desenlace === 'defuncion_por_iaas') bySvc[k].def += 1;
  });

  const aoa: Array<Array<string | number>> = [
    ['SISTEMA NACIONAL DE SALUD — NOTIFICACIÓN DE BROTE (SUIVE-3-2020 · MANUAL RHOVE JUNIO 2024)'],
    [
      'ESTATUS:',
      STAGE_LABELS[study.stage],
      '',
      'FOLIO NOTINMED:',
      folioNotinmed,
      '',
      'FOLIOS RHOVE:',
      foliosRhove || 'En captura',
    ],
    [],
    ['I. IDENTIFICACIÓN DE LA UNIDAD'],
    [
      'UNIDAD NOTIFICANTE:',
      study.unidadNotificante,
      '',
      'CLAVE CLUES:',
      study.claveClues,
      '',
      'LOCALIDAD:',
      study.localidad,
    ],
    [
      'MUNICIPIO:',
      study.municipio,
      '',
      'JURISDICCIÓN O EQUIVALENTE:',
      study.jurisdiccion,
      '',
      'ENTIDAD O DELEGACIÓN:',
      study.entidad,
    ],
    [
      'INSTITUCIÓN:',
      study.institucion,
      '',
      'CLAVE SUAVE:',
      study.claveSuave || '—',
      '',
      'SERVICIO MÉDICO:',
      study.servicioMedico,
    ],
    [],
    ['II. ANTECEDENTES'],
    ['DX. PROBABLE:', study.dxProbable, '', '', '', 'DX. FINAL:', study.dxFinal || 'En estudio'],
    [
      'FECHA DE NOTIFICACIÓN:',
      fmtFull(study.fechaNotificacion),
      '',
      'FECHA DE INICIO DEL BROTE (1ª FIS):',
      fmtFull(study.fechaInicioBrote),
      '',
      'FECHA DE DETECCIÓN:',
      fmtFull(study.fechaDeteccion),
    ],
    [
      'CASOS PROBABLES:',
      included.length,
      'CASOS CONFIRMADOS:',
      confirmados,
      'HOSPITALIZADOS:',
      hospitalizados,
      'DEFUNCIONES POR IAAS:',
      defuncionesPorIaas,
    ],
    [],
    ['III. DISTRIBUCIÓN POR PERSONA (GRUPOS DE EDAD SUIVE-3-2020)'],
    [
      'GRUPO DE EDAD',
      'CASOS MASC (A)',
      'CASOS FEM (B)',
      'CASOS TOTAL (C)',
      'DEFUNCIONES MASC (D)',
      'DEFUNCIONES FEM (E)',
      'DEFUNCIONES TOTAL (F)',
      'EXPUESTOS MASC (G)',
      'EXPUESTOS FEM (H)',
      'EXPUESTOS TOTAL (I)',
    ],
  ];

  // Rows 16..28 (1-indexed) will hold the 12 age groups + TOTAL!
  const firstAgeRow1Indexed = aoa.length + 1;
  distRows.forEach((r) => {
    aoa.push([
      r.label,
      r.casosM,
      r.casosF,
      r.casosT,
      r.defM,
      r.defF,
      r.defT,
      r.expM,
      r.expF,
      r.expT,
    ]);
  });

  aoa.push([]);
  aoa.push([
    'TASAS DE ATAQUE Y LETALIDAD POR 100 (CON FÓRMULAS PROTEGIDAS CONTRA #¡DIV/0!)',
    '',
    '',
    '',
    '',
    '',
    '',
    'FRECUENCIA DE SIGNOS Y SÍNTOMAS',
  ]);
  aoa.push([
    'GRUPO DE EDAD',
    'ATAQUE MASC (A/G)',
    'ATAQUE FEM (B/H)',
    'ATAQUE TOTAL (C/I)',
    'LETALIDAD MASC (D/A)',
    'LETALIDAD FEM (E/B)',
    'LETALIDAD TOTAL (F/C)',
    'SIGNOS Y SÍNTOMAS',
    'CASOS No.',
    '%',
  ]);

  const firstRatesRow1Indexed = aoa.length + 1;
  distRows.forEach((r, idx) => {
    const sym = symRows[idx];
    aoa.push([
      r.label,
      r.ataqueM ?? 0,
      r.ataqueF ?? 0,
      r.ataqueT ?? 0,
      r.letalidadM ?? 0,
      r.letalidadF ?? 0,
      r.letalidadT ?? 0,
      sym ? sym.symptom : '',
      sym ? sym.count : '',
      sym ? sym.pct : '',
    ]);
  });

  aoa.push([]);
  aoa.push(['V. DISTRIBUCIÓN GEOGRÁFICA (POR SERVICIO / SALA HOSPITALARIA)']);
  aoa.push(['ÁREA / SERVICIO / SALA', 'CASOS Núm.', '% DEL BROTE', 'DEFUNCIONES POR IAAS', 'LETALIDAD %']);
  Object.entries(bySvc).forEach(([svcName, counts]) => {
    aoa.push([
      svcName,
      counts.casos,
      included.length > 0 ? Number(((counts.casos / included.length) * 100).toFixed(1)) : 0,
      counts.def,
      counts.casos > 0 ? Number(((counts.def / counts.casos) * 100).toFixed(1)) : 0,
    ]);
  });

  aoa.push([]);
  aoa.push(['VI. ANÁLISIS EPIDEMIOLÓGICO']);
  aoa.push(['1. Antecedentes epidemiológicos del brote (Panorama del servicio y brotes previos):']);
  aoa.push([study.antecedentesPanorama]);
  aoa.push(['2. Probables fuentes del brote:']);
  aoa.push([study.probablesFuentes]);
  aoa.push(['3. Probables mecanismos de transmisión:']);
  aoa.push([study.probablesMecanismos]);
  aoa.push([]);
  aoa.push(['VII. ACCIONES DE PREVENCIÓN Y CONTROL (CON FECHAS DE INICIO)']);
  aoa.push([accionesFormatted]);
  aoa.push([]);
  aoa.push([
    'Nombre y cargo de quien elaboró:',
    study.elaboroNombreCargo,
    '',
    'Vo.Bo. Director del Hospital:',
    study.directorNombre || '______________________',
    '',
    'Vo.Bo. Epidemiólogo UVEH:',
    study.epidemiologoNombre,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Inject real Excel IFERROR formulas into the Attack & Lethality rate table so opening in Excel recalculates live without #DIV/0!
  distRows.forEach((r, idx) => {
    const srcRow = firstAgeRow1Indexed + idx;
    const dstRow = firstRatesRow1Indexed + idx;
    ws[`B${dstRow}`] = { t: 'n', f: `IFERROR(ROUND((B${srcRow}/H${srcRow})*100,2),0)`, v: r.ataqueM ?? 0 };
    ws[`C${dstRow}`] = { t: 'n', f: `IFERROR(ROUND((C${srcRow}/I${srcRow})*100,2),0)`, v: r.ataqueF ?? 0 };
    ws[`D${dstRow}`] = { t: 'n', f: `IFERROR(ROUND((D${srcRow}/J${srcRow})*100,2),0)`, v: r.ataqueT ?? 0 };
    ws[`E${dstRow}`] = { t: 'n', f: `IFERROR(ROUND((E${srcRow}/B${srcRow})*100,2),0)`, v: r.letalidadM ?? 0 };
    ws[`F${dstRow}`] = { t: 'n', f: `IFERROR(ROUND((F${srcRow}/C${srcRow})*100,2),0)`, v: r.letalidadF ?? 0 };
    ws[`G${dstRow}`] = { t: 'n', f: `IFERROR(ROUND((G${srcRow}/D${srcRow})*100,2),0)`, v: r.letalidadT ?? 0 };
  });

  ws['!cols'] = [
    { wch: 24 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 30 },
    { wch: 14 },
    { wch: 14 },
  ];

  return ws;
}

function injectIntoUploadedTemplate(
  wb: XLSX.WorkBook,
  meta: SuiveTemplateMappingSummary,
  study: OutbreakStudyRecord,
  useInitials: boolean
): void {
  const included = study.casos.filter((c) => c.incluidoEnEstudio);
  const confirmados = included.filter((c) => c.nivelDiagnostico === 'confirmada_lab').length;
  const hospitalizados = included.filter((c) => c.desenlace === 'hospitalizado').length;
  const defuncionesPorIaas = included.filter((c) => c.desenlace === 'defuncion_por_iaas').length;
  const folioNotinmed = study.folioNotinmedBase
    ? `${study.folioNotinmedBase}-${study.folioSufijoActual || '0'}`
    : '';
  const accionesFormatted = (study.accionesControl || [])
    .map((a) => `[${fmtFull(a.fecha)}] ${a.descripcion} (${a.responsable})`)
    .join(' | ');

  const fieldValues: Record<string, string | number> = {
    unidadNotificante: study.unidadNotificante,
    claveSuave: study.claveSuave,
    claveClues: study.claveClues,
    localidad: study.localidad,
    municipio: study.municipio,
    jurisdiccion: study.jurisdiccion,
    entidad: study.entidad,
    institucion: study.institucion,
    servicioMedico: study.servicioMedico,
    folioNotinmed,
    dxProbable: study.dxProbable,
    dxFinal: study.dxFinal,
    fechaInicioBrote: fmtFull(study.fechaInicioBrote),
    fechaDeteccion: fmtFull(study.fechaDeteccion),
    fechaNotificacion: fmtFull(study.fechaNotificacion),
    casosProbables: included.length,
    casosConfirmados: confirmados,
    hospitalizados,
    defunciones: defuncionesPorIaas,
    antecedentesPanorama: study.antecedentesPanorama,
    probablesFuentes: study.probablesFuentes,
    probablesMecanismos: study.probablesMecanismos,
    accionesControl: accionesFormatted,
  };

  Object.entries(fieldValues).forEach(([key, val]) => {
    const addr = meta.customOverrides?.[key] || meta.detectedFieldAnchors?.[key];
    if (addr && val !== '') {
      writeCellSafe(wb, addr, val);
    }
  });

  // Inject Person Distribution rows if age group anchors were detected on suiveSheetName
  if (meta.suiveSheetName && wb.Sheets[meta.suiveSheetName]) {
    const ws = wb.Sheets[meta.suiveSheetName];
    const distByKey = new Map(computeSuivePersonDistribution(study).map((d) => [d.key, d]));

    // Find column indices for MASCULINO (A), FEMENINO (B), etc. near the first detected age row
    const ageRowNums = Object.values(meta.detectedAgeGroupRows || {});
    if (ageRowNums.length > 0) {
      const minAgeRow0 = Math.min(...ageRowNums) - 1;
      let colCasosM: number | null = null;
      for (let r = Math.max(0, minAgeRow0 - 4); r <= minAgeRow0; r += 1) {
        for (let c = 0; c <= 16; c += 1) {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          const txt = norm(cell?.v);
          if (colCasosM == null && (txt === 'masculino' || txt === '(a)' || txt.includes('masculino (a)'))) {
            colCasosM = c;
          }
        }
      }
      if (colCasosM != null) {
        SUIVE_AGE_GROUPS.forEach(({ key }) => {
          const row1 = meta.detectedAgeGroupRows[key];
          const d = distByKey.get(key);
          if (!row1 || !d) return;
          const r0 = row1 - 1;
          const pairs: Array<[number, number]> = [
            [colCasosM!, d.casosM],
            [colCasosM! + 1, d.casosF],
            [colCasosM! + 2, d.casosT],
            [colCasosM! + 3, d.defM],
            [colCasosM! + 4, d.defF],
            [colCasosM! + 5, d.defT],
            [colCasosM! + 6, d.expM],
            [colCasosM! + 7, d.expF],
            [colCasosM! + 8, d.expT],
          ];
          pairs.forEach(([colIdx, numVal]) => {
            const addr = `${meta.suiveSheetName}!${XLSX.utils.encode_cell({ r: r0, c: colIdx })}`;
            writeCellSafe(wb, addr, numVal);
          });
        });
      }
    }
  }

  // Always attach/update clean companion sheets if not already present so the exported file carries 100% of Nominal Census + FIS Curve + CODECIAAS Checklist
  const companionSheets: Array<[string, XLSX.WorkSheet]> = [
    ['Censo_Nominal_SUIVE3', buildCensusSheet(study, useInitials)],
    ['Curva_Epidemica_FIS', buildCurveAndCroquisSheet(study)],
    ['Seguimiento_CODECIAAS', buildFollowUpAndCodeciaasSheet(study)],
  ];

  companionSheets.forEach(([name, sheet]) => {
    if (wb.Sheets[name]) {
      wb.Sheets[name] = sheet;
    } else {
      XLSX.utils.book_append_sheet(wb, sheet, name);
    }
  });
}

export function exportOutbreakStudyToExcel(
  study: OutbreakStudyRecord,
  options?: { useInitials?: boolean; forceBuiltInFormat?: boolean }
): { fileName: string; usedUploadedTemplate: boolean } {
  const useInitials = options?.useInitials ?? false;
  const meta = getSavedSuiveTemplateMeta();
  const savedB64 =
    inMemoryTemplateBase64 ||
    (() => {
      try {
        return localStorage.getItem(TEMPLATE_B64_KEY);
      } catch {
        return null;
      }
    })();

  let wb: XLSX.WorkBook;
  let usedUploadedTemplate = false;

  if (!options?.forceBuiltInFormat && meta && savedB64) {
    const buf = base64ToArrayBuffer(savedB64);
    wb = XLSX.read(buf, {
      type: 'array',
      cellFormula: true,
      cellNF: true,
      cellStyles: true,
    });
    injectIntoUploadedTemplate(wb, meta, study, useInitials);
    usedUploadedTemplate = true;
  } else {
    wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildOfficialSuive3Sheet(study), 'SUIVE-3_Notificacion');
    XLSX.utils.book_append_sheet(
      wb,
      buildCensusSheet(study, useInitials),
      'Censo_Nominal_SUIVE3'
    );
    XLSX.utils.book_append_sheet(wb, buildCurveAndCroquisSheet(study), 'Curva_Epidemica_FIS');
    XLSX.utils.book_append_sheet(
      wb,
      buildFollowUpAndCodeciaasSheet(study),
      'Seguimiento_CODECIAAS'
    );
  }

  const folioSlug = study.folioNotinmedBase
    ? `${study.folioNotinmedBase}-${study.folioSufijoActual || '0'}`
    : 'BORRADOR';
  const stageSlug =
    study.stage === 'cerrado'
      ? 'CIERRE'
      : study.stage === 'notificado_inicial'
        ? 'INICIAL'
        : 'SEGUIMIENTO';
  const orgSlug = prettyOrganism(study.organismo).replace(/[^a-zA-Z0-9]+/g, '_');
  const svcSlug = study.servicioMedico.replace(/[^a-zA-Z0-9]+/g, '_');
  const fileName = `${folioSlug}_${stageSlug}_SUIVE3_${svcSlug}_${orgSlug}.xlsx`;

  XLSX.writeFile(wb, fileName);
  return { fileName, usedUploadedTemplate };
}
