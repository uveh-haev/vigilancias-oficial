import {
  DoneRecord,
  MicroChip,
  OutbreakCluster,
  PatientGroup,
  PriorityLevel,
  QueueDefinition,
  RadarEvent,
} from '../types/clinical';
import { daysBetween, norm } from './dates';
import {
  buildAntibiogramIndex,
  detectIdenticalOutbreaks,
  detectOutbreaks,
  extractOrganisms,
  isDischargedRow,
} from './outbreaks';
import {
  getPatientKey,
  getPriorityLevel,
  getRowMeta,
  getServiceGroup,
  getSubArea,
  getSubservice,
  SERVICE_SUBAREAS,
} from './services';

export function isRhoveCaptured(row: RadarEvent): boolean {
  return norm(row.rhove).startsWith('capturada');
}

export function isDiscarded(row: RadarEvent): boolean {
  return norm(row.epi).startsWith('descartad') || norm(row.rhove).startsWith('descartad');
}

export function isIAAS(row: RadarEvent, outbreakIds: Set<string>): boolean {
  return norm(row.prog).includes('iaas') || outbreakIds.has(row.id);
}

export function isFocusPending(row: RadarEvent, outbreakIds: Set<string>): boolean {
  return isIAAS(row, outbreakIds) && !isRhoveCaptured(row) && !isDiscarded(row);
}

export const isDischarged = isDischargedRow;

export function getDischargeReason(row: RadarEvent): string {
  const oper = norm(row.oper);
  if (/defunc/.test(oper)) return 'Defunción';
  if (/traslad/.test(oper)) return 'Traslado';
  if (/ambulator|consulta externa/.test(oper)) return 'Ambulatorio';
  if (/egres/.test(oper) || row.egreso) return 'Egreso';
  if (/no localizad|sin localiz/.test(oper)) return 'No localizado en censo';
  return 'Cerrado';
}

export function isNewDetection(row: RadarEvent, corte?: string | null): boolean {
  return Boolean(corte && row.det && daysBetween(row.det, corte) <= 1);
}

export function hasRecentCulture(row: RadarEvent, corte?: string | null): boolean {
  if (!row.fres || !corte) return false;
  const diff = daysBetween(row.fres, corte);
  return diff >= 0 && diff <= 2;
}

export function hasPendingCulture(row: RadarEvent): boolean {
  if (row.muestra && !row.res) return true;
  if (row.res && norm(row.res).includes('pendient')) return true;
  if (isRhoveCaptured(row) && !row.muestra && !row.micro && !row.res) return true;
  return false;
}

export function hasNoCultureTaken(row: RadarEvent, outbreakIds: Set<string>): boolean {
  if (!isIAAS(row, outbreakIds) || isDiscarded(row) || isRhoveCaptured(row)) return false;
  return !row.muestra && !row.micro && !row.res;
}

export function parseMicroChips(row: RadarEvent): MicroChip[] {
  const raw = String(row.micro || '');
  if (!raw || !extractOrganisms(raw).length) return [];
  const holders: string[] = [];
  const safe = raw.replace(/\([^)]*\)/g, (m) => {
    holders.push(m);
    return `\u0000${holders.length - 1}\u0000`;
  });

  return safe
    .split(/;|\/|\+|,|\by\b/i)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((tok) => {
      const restored = tok.replace(/\u0000(\d+)\u0000/g, (_, idx) => holders[Number(idx)]);
      const pendingMark = /\(\s*pendiente[^)]*\)/i.test(restored);
      const label = restored
        .replace(/\(\s*pendiente[^)]*\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        label,
        captured: isRhoveCaptured(row) && !pendingMark,
      };
    });
}

export function hasUncapturedMicroorganism(row: RadarEvent, outbreakIds: Set<string>): boolean {
  if (!isIAAS(row, outbreakIds) || !isRhoveCaptured(row)) return false;
  return parseMicroChips(row).some((chip) => !chip.captured);
}

export function isReadmission(row: RadarEvent): boolean {
  return /reingres/.test(norm([row.motivo, row.obs].join(' ')));
}

export function matchesServiceFilter(
  row: RadarEvent,
  selectedService: string,
  selectedSubArea: string
): boolean {
  if (selectedService && getServiceGroup(row) !== selectedService) return false;
  if (SERVICE_SUBAREAS[selectedService] && selectedSubArea) {
    const area = getSubArea(row);
    if (selectedSubArea === '_sin') return !area;
    return area === selectedSubArea;
  }
  return true;
}

export function filterRowsByQuery(rows: RadarEvent[], query: string): RadarEvent[] {
  const q = norm(query);
  if (!q) return rows;
  return rows.filter((r) => getRowMeta(r).searchText.includes(q));
}

export function groupEventsByPatient(events: RadarEvent[]): PatientGroup[] {
  const order: string[] = [];
  const byKey: Record<string, RadarEvent[]> = {};

  events.forEach((row) => {
    const key = getPatientKey(row);
    if (!byKey[key]) {
      byKey[key] = [];
      order.push(key);
    }
    byKey[key].push(row);
  });

  return order.map((key) => {
    const sorted = byKey[key]
      .slice()
      .sort(
        (a, b) =>
          getPriorityLevel(a) - getPriorityLevel(b) ||
          String(b.det || '').localeCompare(String(a.det || ''))
      );
    const primary = sorted[0];
    return {
      patientKey: key,
      primary,
      events: sorted,
      serviceGroup: getServiceGroup(primary),
      subservice: getSubservice(primary),
      subArea: getSubArea(primary),
    };
  });
}

export interface ServiceSummary {
  name: string;
  pendingFocus: number;
  urgentFocus: number;
  totalEvents: number;
}

export interface SurveillanceSlices {
  allOutbreaks: OutbreakCluster[];
  outbreakIds: Set<string>;
  atbIndex: Record<string, string>;
  services: ServiceSummary[];
  totalPendingFocus: number;
  totalUrgentFocus: number;
  svcRows: RadarEvent[];
  foco: RadarEvent[];
  iaasAll: RadarEvent[];
  capturadosRhove: RadarEvent[];
  cultPendAll: RadarEvent[];
  sinCultAll: RadarEvent[];
  sinCapturarAll: RadarEvent[];
  reingresosAll: RadarEvent[];
  egresosAll: RadarEvent[];
  descartadosAll: RadarEvent[];
  revisadosAll: RadarEvent[];
  otrosAll: RadarEvent[];
  filteredOutbreaks: OutbreakCluster[];
  identicalOutbreaks: OutbreakCluster[];
  recentCultures: RadarEvent[];
  queues: QueueDefinition[];
}

export function computeSurveillanceSlices(params: {
  rows: RadarEvent[];
  cerrados: RadarEvent[];
  abRows: Parameters<typeof buildAntibiogramIndex>[0];
  doneMap: Record<string, DoneRecord>;
  selectedService: string;
  selectedSubArea: string;
  corte: string | null;
}): SurveillanceSlices {
  const { rows, cerrados, abRows, doneMap, selectedService, selectedSubArea, corte } = params;

  const atbIndex = buildAntibiogramIndex(abRows || []);
  const allOutbreaks = detectOutbreaks(rows);
  const outbreakIds = new Set<string>();
  allOutbreaks.forEach((b) => b.members.forEach((m) => outbreakIds.add(m.id)));

  const svcMap: Record<string, ServiceSummary> = {};
  rows.forEach((row) => {
    const g = getServiceGroup(row);
    if (!svcMap[g]) {
      svcMap[g] = { name: g, pendingFocus: 0, urgentFocus: 0, totalEvents: 0 };
    }
    svcMap[g].totalEvents += 1;
    if (isFocusPending(row, outbreakIds) && !doneMap[row.id]) {
      svcMap[g].pendingFocus += 1;
      if (getPriorityLevel(row) === PriorityLevel.Urgent) {
        svcMap[g].urgentFocus += 1;
      }
    }
  });

  const services = Object.values(svcMap).sort(
    (a, b) =>
      b.pendingFocus - a.pendingFocus ||
      b.totalEvents - a.totalEvents ||
      a.name.localeCompare(b.name, 'es')
  );

  const totalPendingFocus = services.reduce((acc, s) => acc + s.pendingFocus, 0);
  const totalUrgentFocus = services.reduce((acc, s) => acc + s.urgentFocus, 0);

  const bySvc = (r: RadarEvent) => matchesServiceFilter(r, selectedService, selectedSubArea);
  const svcRows = rows.filter(bySvc);

  const sortByPriorityAndDate = (a: RadarEvent, b: RadarEvent) =>
    getPriorityLevel(a) - getPriorityLevel(b) ||
    String(b.det || '').localeCompare(String(a.det || ''));

  const foco = svcRows.filter((r) => isFocusPending(r, outbreakIds)).sort(sortByPriorityAndDate);
  const filteredOutbreaks = allOutbreaks.filter(
    (b) => !selectedService || b.members.some(bySvc)
  );
  const baseForIdentical =
    !selectedService && !selectedSubArea ? allOutbreaks : detectOutbreaks(svcRows);
  const identicalOutbreaks = detectIdenticalOutbreaks(baseForIdentical, atbIndex);

  const otrosAll = svcRows.filter((r) => !isIAAS(r, outbreakIds));
  const capturadosRhove = svcRows.filter((r) => isIAAS(r, outbreakIds) && isRhoveCaptured(r));
  const iaasAll = svcRows.filter((r) => isIAAS(r, outbreakIds) && !isDiscarded(r));
  const cultPendAll = capturadosRhove.filter(hasPendingCulture);
  const sinCultAll = iaasAll.filter((r) => hasNoCultureTaken(r, outbreakIds));
  const sinCapturarAll = capturadosRhove.filter((r) =>
    hasUncapturedMicroorganism(r, outbreakIds)
  );
  const reingresosAll = svcRows.filter(isReadmission);

  const activeIds = new Set(rows.map((r) => r.id));
  const egresosAll = [
    ...(cerrados || []).filter((r) => !activeIds.has(r.id)),
    ...rows.filter(isDischarged),
  ]
    .filter((r) => norm(r.prog).includes('iaas'))
    .filter(bySvc);

  const descartadosAll = svcRows.filter((r) => doneMap[r.id]?.cls === 'sin_iaas');
  const revisadosAll = svcRows.filter((r) => doneMap[r.id] && doneMap[r.id].cls !== 'sin_iaas');
  const recentCultures = svcRows
    .filter((r) => hasRecentCulture(r, corte))
    .sort((a, b) => String(b.fres || '').localeCompare(String(a.fres || '')));

  const queues: QueueDefinition[] = [
    {
      id: 'foco',
      label: 'Pacientes por revisar',
      shortLabel: 'Por revisar',
      description: 'Sospechas activas pendientes de valoración clínica o captura en RHOVE.',
      count: foco.filter((r) => !doneMap[r.id]).length,
      tone: 'crit',
      primary: true,
    },
    {
      id: 'iaas',
      label: 'Todas las IAAS activas',
      shortLabel: 'Todas las IAAS',
      description: 'Total de infecciones asociadas a la atención activas (pendientes y en RHOVE).',
      count: iaasAll.length,
      tone: 'brand',
      primary: true,
    },
    {
      id: 'cultpend',
      label: 'Cultivos pendientes de resultado',
      shortLabel: 'Cultivos pendientes',
      description: 'IAAS ya capturadas en RHOVE que esperan reporte definitivo de laboratorio.',
      count: cultPendAll.filter((r) => !doneMap[r.id]).length,
      tone: 'warn',
      primary: true,
    },
    {
      id: 'sincapturar',
      label: 'Cultivo sin capturar en RHOVE',
      shortLabel: 'Sin capturar RHOVE',
      description: 'Microorganismo identificado en censo o laboratorio aún pendiente de alta en RHOVE.',
      count: sinCapturarAll.filter((r) => !doneMap[r.id]).length,
      tone: 'warn',
      primary: true,
    },
    {
      id: 'sincult',
      label: 'Posibles IAAS sin cultivo',
      shortLabel: 'Sin cultivo tomado',
      description: 'Sospechas de IAAS sin muestra, microorganismo ni resultado registrado.',
      count: sinCultAll.filter((r) => !doneMap[r.id]).length,
      tone: 'warn',
    },
    {
      id: 'reingresos',
      label: 'Reingresos con IAAS previa',
      shortLabel: 'Reingresos',
      description: 'Pacientes reingresados con antecedente de IAAS en hospitalización previa.',
      count: reingresosAll.filter((r) => !doneMap[r.id]).length,
      tone: 'warn',
    },
    {
      id: 'brotes',
      label: 'Posibles brotes',
      shortLabel: 'Posibles brotes',
      description: 'Coincidencias de microorganismo y servicio actual o previo.',
      count: filteredOutbreaks.length,
      tone: 'warn',
    },
    {
      id: 'rhove',
      label: 'Capturadas en RHOVE',
      shortLabel: 'Ya en RHOVE',
      description: 'Infecciones dadas de alta en plataforma RHOVE en seguimiento evolutivo.',
      count: capturadosRhove.length,
      tone: 'ok',
    },
    {
      id: 'revisados',
      label: 'Revisados en seguimiento',
      shortLabel: 'Revisados',
      description: 'Pacientes ya valorados por el equipo que permanecen bajo vigilancia.',
      count: revisadosAll.length,
      tone: 'ok',
    },
    {
      id: 'egresos',
      label: 'Egresos y defunciones',
      shortLabel: 'Egresos',
      description: 'Pacientes con IAAS que salieron del censo activo (alta, traslado o defunción).',
      count: egresosAll.length,
      tone: 'muted',
    },
    {
      id: 'descartados',
      label: 'Descartados como IAAS',
      shortLabel: 'Descartados',
      description: 'Eventos valorados y descartados como infección asociada a la atención.',
      count: descartadosAll.length,
      tone: 'muted',
    },
    {
      id: 'otros',
      label: 'Otros programas de vigilancia',
      shortLabel: 'Otros programas',
      description: 'Padecimientos sujetos a vigilancia epidemiológica especial (TB, VIH, arbovirosis).',
      count: otrosAll.length,
      tone: 'info',
    },
  ];

  return {
    allOutbreaks,
    outbreakIds,
    atbIndex,
    services,
    totalPendingFocus,
    totalUrgentFocus,
    svcRows,
    foco,
    iaasAll,
    capturadosRhove,
    cultPendAll,
    sinCultAll,
    sinCapturarAll,
    reingresosAll,
    egresosAll,
    descartadosAll,
    revisadosAll,
    otrosAll,
    filteredOutbreaks,
    identicalOutbreaks,
    recentCultures,
    queues,
  };
}
