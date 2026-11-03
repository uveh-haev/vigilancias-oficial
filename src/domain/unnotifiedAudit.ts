/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as XLSX from 'xlsx';
import {
  DoneRecord,
  MicroChip,
  NursingNote,
  PriorityLevel,
  RadarEvent,
} from '../types/clinical';
import { daysBetween, fmtFull, norm, todayISO } from './dates';
import {
  extractOrganisms,
  isDischargedRow,
} from './outbreaks';
import {
  getPriorityLevel,
  getServiceGroup,
  getSubArea,
  getSubservice,
} from './services';
import {
  hasUncapturedMicroorganism,
  isDiscarded,
  isIAAS,
  isRhoveCaptured,
  parseMicroChips,
} from './classification';

export type UnnotifiedCategory =
  | 'iaas_activa'
  | 'cultivo_positivo'
  | 'egreso_defuncion'
  | 'micro_pendiente'
  | 'otros_programas';

export type UnnotifiedDelayLevel = 'normal' | 'alerta' | 'critico';

export interface UnnotifiedItem {
  id: string;
  event: RadarEvent;
  category: UnnotifiedCategory;
  categoryLabel: string;
  diasRetraso: number;
  delayLevel: UnnotifiedDelayLevel;
  causaSugerida: string;
  tieneCultivo: boolean;
  microChips: MicroChip[];
  esEgreso: boolean;
  esDefuncion: boolean;
  servicio: string;
  subArea: string;
  subservicio: string;
  tipoIaas: string;
  dispositivo: string;
  prioridad: PriorityLevel;
  justificacionExistente?: string;
  marcadoCapturado?: boolean;
}

export interface ServiceUnnotifiedStat {
  servicio: string;
  total: number;
  criticos: number;
  iaas: number;
  cultivos: number;
}

export interface TypeUnnotifiedStat {
  tipo: string;
  count: number;
}

export interface UnnotifiedAuditSummary {
  totalCenso: number;
  totalCapturadas: number;
  totalNoNotificados: number;
  tasaCaptura: number;
  tasaBrecha: number;
  iaasActivasSinRhove: number;
  cultivosPositivosSinRhove: number;
  egresosSinRhove: number;
  microPendientesEnRhove: number;
  otrosProgramasSinRhove: number;
  rezagoCriticoCount: number;
  rezagoAlertaCount: number;
  promedioDiasRetraso: number;
  porServicio: ServiceUnnotifiedStat[];
  porTipoIaas: TypeUnnotifiedStat[];
}

export interface UnnotifiedAuditResult {
  items: UnnotifiedItem[];
  summary: UnnotifiedAuditSummary;
}

export function computeUnnotifiedAudit(params: {
  rows: RadarEvent[];
  cerrados: RadarEvent[];
  outbreakIds: Set<string>;
  doneMap: Record<string, DoneRecord>;
  corte: string | null;
  notes?: NursingNote[];
}): UnnotifiedAuditResult {
  const { rows, cerrados, outbreakIds, doneMap, corte, notes = [] } = params;
  const hoy = corte || todayISO();

  // Index nursing notes by patient ID / row ID to find any documented justification
  const notesByRowId: Record<string, string> = {};
  notes.forEach((n) => {
    if (n.id && n.texto) {
      notesByRowId[n.id] = (notesByRowId[n.id] ? `${notesByRowId[n.id]} · ` : '') + n.texto;
    }
  });

  const activeIds = new Set(rows.map((r) => r.id));
  const combinedRows = [
    ...rows,
    ...(cerrados || []).filter((r) => !activeIds.has(r.id)),
  ];

  let totalCapturadas = 0;
  const rawItems: UnnotifiedItem[] = [];

  combinedRows.forEach((row) => {
    const isCaptured = isRhoveCaptured(row);
    const isDiscard = isDiscarded(row) || doneMap[row.id]?.cls === 'sin_iaas';
    const isDone = Boolean(doneMap[row.id]);
    const isIaas = isIAAS(row, outbreakIds);
    const operNorm = norm(row.oper);
    const isDischarged = isDischargedRow(row) || Boolean(row.egreso) || /egres|defunc|traslad/.test(operNorm);
    const isDefunction = /defunc/.test(operNorm);
    const microChips = parseMicroChips(row);
    const hasOrg = extractOrganisms(String(row.micro || '')).length > 0 || microChips.length > 0;
    const hasPendingMicroInRhove = isCaptured && hasUncapturedMicroorganism(row, outbreakIds);

    if (isCaptured && !hasPendingMicroInRhove) {
      totalCapturadas += 1;
      return;
    }

    // Exclude discarded non-IAAS events
    if (isDiscard) {
      return;
    }

    // Determine delay since detection or admission
    const refDate = row.det || row.ing || corte || hoy;
    const dias = Math.max(0, daysBetween(refDate, hoy));
    const delayLevel: UnnotifiedDelayLevel =
      dias > 5 ? 'critico' : dias >= 3 ? 'alerta' : 'normal';

    // Check if team marked it locally or in cloud as verified/captured
    const markedCapturado = Boolean(
      isDone ||
      (notesByRowId[row.id] && /rhove|captura|notificad/i.test(notesByRowId[row.id]))
    );

    let category: UnnotifiedCategory;
    let categoryLabel: string;
    let causaSugerida: string;

    if (hasPendingMicroInRhove) {
      category = 'micro_pendiente';
      categoryLabel = 'Microorganismo no subido';
      causaSugerida = 'Caso ya abierto en RHOVE pero el aislamiento bacteriológico no se ha capturado';
    } else if (isDischarged) {
      category = 'egreso_defuncion';
      categoryLabel = isDefunction ? 'Defunción sin RHOVE' : 'Egreso sin RHOVE';
      causaSugerida = isDefunction
        ? 'Paciente con IAAS documentada fallecido sin notificación oportuna en RHOVE'
        : 'Paciente con IAAS egresado o trasladado sin captura previa al alta';
    } else if (hasOrg) {
      category = 'cultivo_positivo';
      categoryLabel = 'Cultivo positivo sin RHOVE';
      causaSugerida = 'Microorganismo patógeno identificado en laboratorio sin ficha RHOVE iniciada';
    } else if (isIaas) {
      category = 'iaas_activa';
      categoryLabel = 'IAAS activa sin RHOVE';
      causaSugerida = 'Sospecha o evento clínico de IAAS en piso sin notificación en plataforma';
    } else {
      category = 'otros_programas';
      categoryLabel = 'Vigilancia especial';
      causaSugerida = `Programa especial (${row.prog || 'Sin especificar'}) no capturado en RHOVE`;
    }

    rawItems.push({
      id: row.id,
      event: row,
      category,
      categoryLabel,
      diasRetraso: dias,
      delayLevel,
      causaSugerida,
      tieneCultivo: Boolean(row.muestra || hasOrg || row.res),
      microChips,
      esEgreso: isDischarged && !isDefunction,
      esDefuncion: isDefunction,
      servicio: getServiceGroup(row),
      subArea: getSubArea(row),
      subservicio: getSubservice(row),
      tipoIaas: row.tipo || (isIaas ? 'IAAS sin clasificar' : row.prog || 'Vigilancia'),
      dispositivo: row.disp || 'Sin dispositivo documentado',
      prioridad: getPriorityLevel(row),
      justificacionExistente: notesByRowId[row.id] || undefined,
      marcadoCapturado,
    });
  });

  // Sort items: critical delay first, then urgency, then date descending
  rawItems.sort((a, b) => {
    // Uncompleted first
    if (a.marcadoCapturado !== b.marcadoCapturado) {
      return a.marcadoCapturado ? 1 : -1;
    }
    // Critical delay first
    const levelOrder: Record<UnnotifiedDelayLevel, number> = { critico: 0, alerta: 1, normal: 2 };
    if (levelOrder[a.delayLevel] !== levelOrder[b.delayLevel]) {
      return levelOrder[a.delayLevel] - levelOrder[b.delayLevel];
    }
    // Priority level next
    if (a.prioridad !== b.prioridad) {
      return a.prioridad - b.prioridad;
    }
    // Then days of delay descending
    return b.diasRetraso - a.diasRetraso;
  });

  // Compute aggregated summary metrics
  const totalCenso = combinedRows.length;
  const totalNoNotificados = rawItems.length;
  const tasaCaptura = totalCenso > 0 ? Math.round((totalCapturadas / totalCenso) * 100) : 0;
  const tasaBrecha = totalCenso > 0 ? Math.round((totalNoNotificados / totalCenso) * 100) : 0;

  const iaasActivasSinRhove = rawItems.filter((i) => i.category === 'iaas_activa').length;
  const cultivosPositivosSinRhove = rawItems.filter((i) => i.category === 'cultivo_positivo').length;
  const egresosSinRhove = rawItems.filter((i) => i.category === 'egreso_defuncion').length;
  const microPendientesEnRhove = rawItems.filter((i) => i.category === 'micro_pendiente').length;
  const otrosProgramasSinRhove = rawItems.filter((i) => i.category === 'otros_programas').length;
  const rezagoCriticoCount = rawItems.filter((i) => i.delayLevel === 'critico').length;
  const rezagoAlertaCount = rawItems.filter((i) => i.delayLevel === 'alerta').length;

  const sumDias = rawItems.reduce((acc, i) => acc + i.diasRetraso, 0);
  const promedioDiasRetraso = totalNoNotificados > 0 ? Math.round((sumDias / totalNoNotificados) * 10) / 10 : 0;

  // Breakdown by service
  const svcMap: Record<string, { total: number; criticos: number; iaas: number; cultivos: number }> = {};
  rawItems.forEach((i) => {
    const s = i.servicio || 'Sin servicio';
    if (!svcMap[s]) {
      svcMap[s] = { total: 0, criticos: 0, iaas: 0, cultivos: 0 };
    }
    svcMap[s].total += 1;
    if (i.delayLevel === 'critico') svcMap[s].criticos += 1;
    if (i.category === 'iaas_activa' || i.category === 'egreso_defuncion') svcMap[s].iaas += 1;
    if (i.category === 'cultivo_positivo' || i.category === 'micro_pendiente') svcMap[s].cultivos += 1;
  });

  const porServicio: ServiceUnnotifiedStat[] = Object.entries(svcMap)
    .map(([servicio, stats]) => ({
      servicio,
      ...stats,
    }))
    .sort((a, b) => b.total - a.total || b.criticos - a.criticos);

  // Breakdown by IAAS type
  const typeMap: Record<string, number> = {};
  rawItems.forEach((i) => {
    const t = i.tipoIaas || 'Sin especificar';
    typeMap[t] = (typeMap[t] || 0) + 1;
  });
  const porTipoIaas: TypeUnnotifiedStat[] = Object.entries(typeMap)
    .map(([tipo, count]) => ({ tipo, count }))
    .sort((a, b) => b.count - a.count);

  return {
    items: rawItems,
    summary: {
      totalCenso,
      totalCapturadas,
      totalNoNotificados,
      tasaCaptura,
      tasaBrecha,
      iaasActivasSinRhove,
      cultivosPositivosSinRhove,
      egresosSinRhove,
      microPendientesEnRhove,
      otrosProgramasSinRhove,
      rezagoCriticoCount,
      rezagoAlertaCount,
      promedioDiasRetraso,
      porServicio,
      porTipoIaas,
    },
  };
}

/**
 * Generates an operational standardized clinical clipboard block
 * perfectly tuned for quick copy-pasting or side-by-side reference
 * while typing into the governmental RHOVE website.
 */
export function formatRhoveClipboardPayload(
  item: UnnotifiedItem | RadarEvent,
  options?: { note?: string }
): string {
  const row: RadarEvent = 'event' in item ? item.event : item;
  const lines: string[] = [
    '=====================================================',
    'FICHA DE CAPTURA RHOVE — UVEH HAEV (NOM-045-SSA2)',
    '=====================================================',
    `PACIENTE:        ${row.nombre || 'No especificado'}`,
    `EXPEDIENTE:      ${row.exp || 'Sin expediente'}`,
    `EDAD / SEXO:     ${row.edad || '-'} años / ${row.sexo || '-'}`,
    `CAMA ACTUAL:     ${row.cama || 'No asignada'}`,
    `SERVICIO:        ${getServiceGroup(row)} ${getSubservice(row) ? `(${getSubservice(row)})` : ''}`,
    `SERVICIOS PREV.: ${row.prev || 'Ninguno registrado'}`,
    `FECHA INGRESO:   ${row.ing || 'No registrada'}`,
    `FECHA DETECCIÓN: ${row.det || 'No registrada'}`,
    '-----------------------------------------------------',
    `TIPO DE IAAS:    ${row.tipo || row.prog || 'IAAS en estudio'}`,
    `DISPOSITIVO:     ${row.disp || 'Ninguno registrado'}`,
    `MUESTRA TOMA:    ${row.muestra || 'No tomada / No registrada'}`,
    `RESULTADO LAB:   ${row.res || 'Pendiente'}`,
    `MICROORGANISMO:  ${row.micro || 'Sin aislamiento formal'}`,
    `FECHA RESULTADO: ${row.fres || 'No registrada'}`,
    `ANTIBIOGRAMA:    ${row.atb || 'Sin antibiograma disponible'}`,
    '-----------------------------------------------------',
    `MOTIVO / ALERTA: ${row.motivo || 'Sin descripción'}`,
    `ACCIÓN SUGERIDA: ${row.accion || 'Captura en plataforma RHOVE'}`,
    `OBSERVACIONES:   ${row.obs || 'Ninguna'}`,
  ];

  if (options?.note) {
    lines.push('-----------------------------------------------------');
    lines.push(`NOTA CLÍNICA:    ${options.note}`);
  }

  lines.push('=====================================================');
  return lines.join('\n');
}

/**
 * Builds a WhatsApp summary message for shift epidemiologists or data clerks.
 */
export function buildUnnotifiedWhatsAppReport(params: {
  items: UnnotifiedItem[];
  summary: UnnotifiedAuditSummary;
  corte: string | null;
  selectedService?: string;
}): string {
  const { items, summary, corte, selectedService } = params;
  const lines: string[] = [];
  const corteLabel = fmtFull(corte) || todayISO();

  lines.push(`🚨 *REPORTE DE CASOS PENDIENTES DE RHOVE — UVEH HAEV*`);
  lines.push(`📅 Corte: ${corteLabel}`);
  if (selectedService) {
    lines.push(`🏥 Servicio filtrado: *${selectedService.toUpperCase()}*`);
  }
  lines.push(`📊 Brecha de notificación: *${summary.tasaBrecha}%* (${summary.totalNoNotificados} casos sin capturar)`);
  lines.push(`⚠️ Casos con rezago crítico (>5 días): *${summary.rezagoCriticoCount}*`);
  lines.push(`🧪 Cultivos positivos sin RHOVE: *${summary.cultivosPositivosSinRhove + summary.microPendientesEnRhove}*`);
  lines.push(`🚪 Egresos/Defunciones sin capturar: *${summary.egresosSinRhove}*`);
  lines.push('');

  // Group by service
  const byService: Record<string, UnnotifiedItem[]> = {};
  items.forEach((item) => {
    const s = item.servicio || 'GENERAL';
    (byService[s] = byService[s] || []).push(item);
  });

  Object.entries(byService)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([svc, svcItems]) => {
      lines.push(`*${svc.toUpperCase()} (${svcItems.length})*`);
      svcItems.slice(0, 8).forEach((item) => {
        const r = item.event;
        const alertEmoji = item.delayLevel === 'critico' ? '🔴' : item.delayLevel === 'alerta' ? '🟠' : '🟡';
        const micro = r.micro ? ` [${r.micro}]` : '';
        const egresoTag = item.esDefuncion ? ' ✝️ Defunción' : item.esEgreso ? ' 🚪 Egreso' : '';
        lines.push(
          ` ${alertEmoji} Cama ${r.cama || 'S/C'}: *${r.nombre || 'PACIENTE'}* (Exp: ${r.exp || '-'}) · ${item.tipoIaas}${micro}${egresoTag} (${item.diasRetraso}d sin captura)`
        );
      });
      if (svcItems.length > 8) {
        lines.push(`   _... y ${svcItems.length - 8} pacientes más en este servicio_`);
      }
      lines.push('');
    });

  lines.push('⚡ _Favor de coordinar la captura en plataforma RHOVE antes del cierre del turno._');
  return lines.join('\n');
}

/**
 * Generates an Excel workbook (.xlsx) containing all unnotified records
 * and an executive audit sheet ready for committee review.
 */
export function exportUnnotifiedExcel(params: {
  items: UnnotifiedItem[];
  summary: UnnotifiedAuditSummary;
  corte: string | null;
  hospitalName?: string;
}): void {
  const { items, summary, corte, hospitalName = 'HAEV' } = params;

  // Sheet 1: Detailed Patient List
  const detailRows = items.map((i) => {
    const r = i.event;
    return {
      'Expediente': r.exp || '',
      'Nombre del Paciente': r.nombre || '',
      'Cama': r.cama || '',
      'Servicio': i.servicio,
      'Subservicio / Área': i.subservicio || i.subArea || '',
      'Fecha Ingreso': r.ing || '',
      'Fecha Detección': r.det || '',
      'Días sin Capturar': i.diasRetraso,
      'Nivel de Rezago': i.delayLevel === 'critico' ? 'Crítico (>5 días)' : i.delayLevel === 'alerta' ? 'Alerta (3-5 días)' : 'Normal (<=2 días)',
      'Categoría de Brecha': i.categoryLabel,
      'Tipo de IAAS': i.tipoIaas,
      'Dispositivo Asociado': i.dispositivo,
      'Muestra': r.muestra || '',
      'Microorganismo Identificado': r.micro || '',
      'Resultado Microbiológico': r.res || '',
      'Fecha Resultado Lab': r.fres || '',
      'Antibiograma / Resistencia': r.atb || '',
      'Estado Operativo': r.oper || (i.esDefuncion ? 'Defunción' : i.esEgreso ? 'Egreso' : 'Activo'),
      'Estado RHOVE en RADAR': r.rhove || 'No capturada',
      'Motivo de Alerta': r.motivo || '',
      'Acción Sugerida': r.accion || '',
      'Justificación / Nota Registrada': i.justificacionExistente || '',
      'Validado por Personal': i.marcadoCapturado ? 'Sí (En proceso / Validado)' : 'Pendiente',
    };
  });

  const wsDetail = XLSX.utils.json_to_sheet(detailRows);

  // Sheet 2: Executive Summary & Service Breakdown
  const summaryRows = [
    { 'Métrica / Indicador': 'Fecha de Corte Evaluado', 'Valor': corte || todayISO() },
    { 'Métrica / Indicador': 'Total Pacientes en Censo Evaluados', 'Valor': summary.totalCenso },
    { 'Métrica / Indicador': 'Total Capturados en RHOVE', 'Valor': summary.totalCapturadas },
    { 'Métrica / Indicador': 'Total No Notificados (Brecha RHOVE)', 'Valor': summary.totalNoNotificados },
    { 'Métrica / Indicador': 'Tasa de Notificación Efectiva', 'Valor': `${summary.tasaCaptura}%` },
    { 'Métrica / Indicador': 'Tasa de Subregistro / Brecha', 'Valor': `${summary.tasaBrecha}%` },
    { 'Métrica / Indicador': 'Casos con Rezago Crítico (>5 días)', 'Valor': summary.rezagoCriticoCount },
    { 'Métrica / Indicador': 'Casos con Rezago en Alerta (3-5 días)', 'Valor': summary.rezagoAlertaCount },
    { 'Métrica / Indicador': 'Promedio de Días de Rezago', 'Valor': `${summary.promedioDiasRetraso} días` },
    { 'Métrica / Indicador': 'IAAS Activas en Piso sin RHOVE', 'Valor': summary.iaasActivasSinRhove },
    { 'Métrica / Indicador': 'Cultivos Positivos sin Ficha RHOVE', 'Valor': summary.cultivosPositivosSinRhove },
    { 'Métrica / Indicador': 'Egresos / Defunciones sin Notificar', 'Valor': summary.egresosSinRhove },
    { 'Métrica / Indicador': 'Microorganismos Aislados no Subidos', 'Valor': summary.microPendientesEnRhove },
    { 'Métrica / Indicador': '', 'Valor': '' },
    { 'Métrica / Indicador': '--- REZAGO POR SERVICIO HOSPITALARIO ---', 'Valor': '---' },
    ...summary.porServicio.map((s) => ({
      'Métrica / Indicador': `Servicio: ${s.servicio}`,
      'Valor': `${s.total} pendientes (${s.criticos} críticos)`,
    })),
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Pacientes_Sin_RHOVE');
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen_Brecha_RHOVE');

  const fileName = `Brecha_RHOVE_${hospitalName}_${corte || todayISO()}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
