import * as XLSX from 'xlsx';
import {
  AntibiogramEntry,
  BulletinState,
  CodecinSnapshot,
  OutbreakCluster,
  PriorityLevel,
  RadarEvent,
} from '../types/clinical';
import {
  getDischargeReason,
  isDiscarded,
  isIAAS,
  isRhoveCaptured,
} from './classification';
import { fmtFull, norm, todayISO } from './dates';
import { extractOrganisms, prettyOrganism } from './outbreaks';
import { getPriorityLevel, getServiceGroup } from './services';

const SNAPSHOTS_KEY = 'uveh_codecin_snapshots_v1';

export interface SiteBreakdownItem {
  site: string;
  shortCode: string;
  total: number;
  rhoveCaptured: number;
  pct: number;
}

export interface ServiceBreakdownItem {
  service: string;
  activeIaas: number;
  rhoveCaptured: number;
  urgentPending: number;
  outbreakLinked: number;
}

export interface OrganismResistanceItem {
  organism: string;
  isolates: number;
  blee: number;
  carbapenemR: number;
  services: string[];
}

export interface OutcomeSummaryItem {
  outcome: string;
  count: number;
  pct: number;
}

export interface CodecinAnalytics {
  totalActiveIaas: number;
  rhoveCapturedCount: number;
  rhoveCapturePct: number;
  urgentPendingCount: number;
  bleeCount: number;
  carbapenemResistantCount: number;
  activeClustersCount: number;
  identicalClustersCount: number;
  closedDeathsCount: number;
  bySite: SiteBreakdownItem[];
  byService: ServiceBreakdownItem[];
  byOrganism: OrganismResistanceItem[];
  outcomes: OutcomeSummaryItem[];
}

export function classifyIaasSite(row: RadarEvent): { site: string; shortCode: string } {
  const txt = norm([row.tipo, row.motivo, row.disp, row.muestra].join(' '));
  if (/neumon|\bnav\b|naas|ventilad|aspirado bronquial/.test(txt)) {
    return { site: 'Neumonía asociada a ventilación / nosocomial', shortCode: 'NAV / Neumonía' };
  }
  if (/cateter central|its.?cc|cvc|mahurkar|picc/.test(txt)) {
    return { site: 'Infección del torrente sanguíneo (catéter central)', shortCode: 'ITS-CC' };
  }
  if (/urinari|\bivu\b|sonda vesical|foley|urocultivo/.test(txt)) {
    return { site: 'Infección de vías urinarias asociada a sonda', shortCode: 'IVU-CA' };
  }
  if (/quirurg|herida|incisional|organos y espacios|\bisq\b/.test(txt)) {
    return { site: 'Infección de sitio quirúrgico', shortCode: 'ISQ' };
  }
  if (/bacteriemia|torrente|hemocultivo|\bits\b/.test(txt)) {
    return { site: 'Bacteriemia confirmada por laboratorio', shortCode: 'ITS-Lab' };
  }
  return { site: 'Otras infecciones bajo vigilancia UVEH', shortCode: 'Otras IAAS' };
}

function detectResistanceFlags(
  row: RadarEvent,
  abRows: AntibiogramEntry[]
): { blee: boolean; carbapenemR: boolean } {
  const text = norm([row.micro, row.atb, row.res, row.obs].join(' '));
  let blee =
    /\bblee\b|esbl|betalactamasa/.test(text) ||
    (/ceftriaxona\s*(?:[>=<\d.,\s]*)resistente/.test(text) &&
      /klebsiella|escherichia|proteus|enterobacter/.test(text));
  let carbapenemR =
    /(?:meropenem|imipenem|ertapenem|doripenem)\s*(?:[>=<\d.,\s]*)resistente/.test(text) ||
    /resistente\s+a\s+[^.;]*(?:meropenem|imipenem|ertapenem)/.test(text) ||
    /\bkpc\b|\bndm\b|\bvim\b|\boxa\b|carbapenemasa/.test(text);

  if (row.nombre) {
    const pacNorm = norm(row.nombre);
    const matchingAb = abRows.filter((ab) => norm(ab.pac) === pacNorm);
    if (
      matchingAb.some(
        (ab) =>
          ab.cat === 'R' &&
          ['MEM', 'IPM', 'ETP', 'DOR', 'MER'].includes(ab.cod.toUpperCase())
      )
    ) {
      carbapenemR = true;
    }
    if (
      matchingAb.some(
        (ab) => ab.cat === 'R' && ['CRO', 'CAZ', 'CTX', 'FEP'].includes(ab.cod.toUpperCase())
      ) &&
      !carbapenemR &&
      /klebsiella|escherichia/.test(norm(row.micro))
    ) {
      blee = true;
    }
  }

  return { blee, carbapenemR };
}

export function computeCodecinAnalytics(params: {
  bulletin: BulletinState;
  outbreakIds: Set<string>;
  clusters: OutbreakCluster[];
  identicalClusters: OutbreakCluster[];
}): CodecinAnalytics {
  const { bulletin, outbreakIds, clusters, identicalClusters } = params;
  const activeIaasRows = bulletin.rows.filter(
    (r) => isIAAS(r, outbreakIds) && !isDiscarded(r)
  );

  const totalActiveIaas = activeIaasRows.length;
  const rhoveCapturedCount = activeIaasRows.filter(isRhoveCaptured).length;
  const rhoveCapturePct =
    totalActiveIaas > 0 ? Math.round((rhoveCapturedCount / totalActiveIaas) * 100) : 0;
  const urgentPendingCount = activeIaasRows.filter(
    (r) => getPriorityLevel(r) === PriorityLevel.Urgent && !isRhoveCaptured(r)
  ).length;

  let bleeCount = 0;
  let carbapenemResistantCount = 0;

  const siteMap = new Map<
    string,
    { site: string; shortCode: string; total: number; rhoveCaptured: number }
  >();
  const svcMap = new Map<string, ServiceBreakdownItem>();
  const orgMap = new Map<
    string,
    { isolates: number; blee: number; carbapenemR: number; services: Set<string> }
  >();

  activeIaasRows.forEach((row) => {
    const { site, shortCode } = classifyIaasSite(row);
    const curSite = siteMap.get(shortCode) || {
      site,
      shortCode,
      total: 0,
      rhoveCaptured: 0,
    };
    curSite.total += 1;
    if (isRhoveCaptured(row)) curSite.rhoveCaptured += 1;
    siteMap.set(shortCode, curSite);

    const svc = getServiceGroup(row);
    const curSvc = svcMap.get(svc) || {
      service: svc,
      activeIaas: 0,
      rhoveCaptured: 0,
      urgentPending: 0,
      outbreakLinked: 0,
    };
    curSvc.activeIaas += 1;
    if (isRhoveCaptured(row)) curSvc.rhoveCaptured += 1;
    if (getPriorityLevel(row) === PriorityLevel.Urgent && !isRhoveCaptured(row)) {
      curSvc.urgentPending += 1;
    }
    if (outbreakIds.has(row.id)) curSvc.outbreakLinked += 1;
    svcMap.set(svc, curSvc);

    const flags = detectResistanceFlags(row, bulletin.abRows || []);
    if (flags.blee) bleeCount += 1;
    if (flags.carbapenemR) carbapenemResistantCount += 1;

    extractOrganisms(row.micro).forEach((org) => {
      const label = prettyOrganism(org);
      const curOrg = orgMap.get(label) || {
        isolates: 0,
        blee: 0,
        carbapenemR: 0,
        services: new Set<string>(),
      };
      curOrg.isolates += 1;
      if (flags.blee) curOrg.blee += 1;
      if (flags.carbapenemR) curOrg.carbapenemR += 1;
      curOrg.services.add(svc);
      orgMap.set(label, curOrg);
    });
  });

  const bySite: SiteBreakdownItem[] = [...siteMap.values()]
    .sort((a, b) => b.total - a.total)
    .map((item) => ({
      ...item,
      pct: totalActiveIaas > 0 ? Math.round((item.total / totalActiveIaas) * 100) : 0,
    }));

  const byService: ServiceBreakdownItem[] = [...svcMap.values()].sort(
    (a, b) => b.activeIaas - a.activeIaas || b.urgentPending - a.urgentPending
  );

  const byOrganism: OrganismResistanceItem[] = [...orgMap.entries()]
    .map(([organism, val]) => ({
      organism,
      isolates: val.isolates,
      blee: val.blee,
      carbapenemR: val.carbapenemR,
      services: [...val.services],
    }))
    .sort((a, b) => b.isolates - a.isolates || b.carbapenemR - a.carbapenemR);

  const closedRows = bulletin.cerrados || [];
  const outcomeCounts: Record<string, number> = {};
  closedRows.forEach((r) => {
    const reason = getDischargeReason(r);
    outcomeCounts[reason] = (outcomeCounts[reason] || 0) + 1;
  });
  const totalClosed = closedRows.length;
  const outcomes: OutcomeSummaryItem[] = Object.entries(outcomeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([outcome, count]) => ({
      outcome,
      count,
      pct: totalClosed > 0 ? Math.round((count / totalClosed) * 100) : 0,
    }));

  return {
    totalActiveIaas,
    rhoveCapturedCount,
    rhoveCapturePct,
    urgentPendingCount,
    bleeCount,
    carbapenemResistantCount,
    activeClustersCount: clusters.length,
    identicalClustersCount: identicalClusters.length,
    closedDeathsCount: outcomeCounts['Defunción'] || 0,
    bySite,
    byService,
    byOrganism,
    outcomes,
  };
}

export const IAAS_SITE_CODES = [
  'NAV / Neumonía',
  'ITS-CC',
  'IVU-CA',
  'ISQ',
  'ITS-Lab',
  'Otras IAAS',
] as const;

const SEED_MONTH_NAMES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function createSeededSnapshots(): CodecinSnapshot[] {
  const specs: Array<{
    ym: string;
    lastDay: string;
    nav: number;
    itscc: number;
    ivuca: number;
    isq: number;
    itslab?: number;
    rhoveGap: number;
    urg: number;
    brotes: number;
    ident: number;
    blee: number;
    carbR: number;
    deaths: number;
    porServicio: Record<string, number>;
  }> = [
    // 2024
    {
      ym: '2024-01',
      lastDay: '31',
      nav: 6,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 2,
      porServicio: { UCIA: 6, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2024-02',
      lastDay: '29',
      nav: 5,
      itscc: 4,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 1,
      blee: 3,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 5, 'Medicina Interna': 3, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2024-03',
      lastDay: '31',
      nav: 4,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2024-04',
      lastDay: '30',
      nav: 3,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 0,
      urg: 1,
      brotes: 0,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 0,
      porServicio: { UCIA: 3, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2024-05',
      lastDay: '31',
      nav: 3,
      itscc: 3,
      ivuca: 2,
      isq: 1,
      rhoveGap: 0,
      urg: 0,
      brotes: 0,
      ident: 0,
      blee: 1,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 3, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 1 },
    },
    {
      ym: '2024-06',
      lastDay: '30',
      nav: 4,
      itscc: 3,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 4, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2024-07',
      lastDay: '31',
      nav: 5,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 5, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2024-08',
      lastDay: '31',
      nav: 6,
      itscc: 5,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 3,
      brotes: 2,
      ident: 1,
      blee: 4,
      carbR: 2,
      deaths: 2,
      porServicio: { UCIA: 6, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2, Pediatría: 1 },
    },
    {
      ym: '2024-09',
      lastDay: '30',
      nav: 4,
      itscc: 3,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 4, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2024-10',
      lastDay: '31',
      nav: 4,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2024-11',
      lastDay: '30',
      nav: 5,
      itscc: 4,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 2,
      brotes: 1,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 5, 'Medicina Interna': 3, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2024-12',
      lastDay: '31',
      nav: 6,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 2,
      porServicio: { UCIA: 6, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    // 2025
    {
      ym: '2025-01',
      lastDay: '31',
      nav: 7,
      itscc: 5,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 3,
      brotes: 3,
      ident: 2,
      blee: 4,
      carbR: 3,
      deaths: 2,
      porServicio: {
        UCIA: 7,
        'Medicina Interna': 4,
        UCIN: 3,
        'Cirugía General': 2,
        Neurocirugía: 1,
      },
    },
    {
      ym: '2025-02',
      lastDay: '28',
      nav: 6,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 6, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2025-03',
      lastDay: '31',
      nav: 4,
      itscc: 4,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 1,
      blee: 3,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 4, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2025-04',
      lastDay: '30',
      nav: 4,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2025-05',
      lastDay: '31',
      nav: 3,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 0,
      urg: 1,
      brotes: 0,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 0,
      porServicio: { UCIA: 3, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2025-06',
      lastDay: '30',
      nav: 4,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2025-07',
      lastDay: '31',
      nav: 5,
      itscc: 4,
      ivuca: 3,
      isq: 3,
      rhoveGap: 2,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 4,
      carbR: 2,
      deaths: 2,
      porServicio: {
        UCIA: 5,
        'Medicina Interna': 4,
        'Cirugía General': 3,
        UCIN: 2,
        Traumatología: 1,
      },
    },
    {
      ym: '2025-08',
      lastDay: '31',
      nav: 6,
      itscc: 5,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 4,
      carbR: 3,
      deaths: 2,
      porServicio: { UCIA: 6, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2, Pediatría: 1 },
    },
    {
      ym: '2025-09',
      lastDay: '30',
      nav: 4,
      itscc: 4,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 4, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2025-10',
      lastDay: '31',
      nav: 4,
      itscc: 3,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 4, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2025-11',
      lastDay: '30',
      nav: 5,
      itscc: 4,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 5, 'Medicina Interna': 4, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2025-12',
      lastDay: '31',
      nav: 6,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 2,
      porServicio: { UCIA: 6, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    // 2026
    {
      ym: '2026-01',
      lastDay: '31',
      nav: 6,
      itscc: 5,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 3,
      brotes: 2,
      ident: 1,
      blee: 4,
      carbR: 3,
      deaths: 2,
      porServicio: {
        UCIA: 6,
        'Medicina Interna': 4,
        UCIN: 3,
        'Cirugía General': 2,
        Neurocirugía: 1,
      },
    },
    {
      ym: '2026-02',
      lastDay: '28',
      nav: 5,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 5, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2026-03',
      lastDay: '31',
      nav: 4,
      itscc: 4,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 4, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2026-04',
      lastDay: '30',
      nav: 4,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2026-05',
      lastDay: '31',
      nav: 3,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 0,
      blee: 2,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 3, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2026-06',
      lastDay: '30',
      nav: 4,
      itscc: 3,
      ivuca: 3,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 1,
      blee: 3,
      carbR: 1,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2, Pediatría: 1 },
    },
    {
      ym: '2026-07',
      lastDay: '31',
      nav: 6,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 3,
      brotes: 2,
      ident: 1,
      blee: 4,
      carbR: 2,
      deaths: 2,
      porServicio: {
        UCIA: 6,
        'Medicina Interna': 4,
        UCIN: 2,
        'Cirugía General': 2,
        Traumatología: 1,
      },
    },
    {
      ym: '2026-08',
      lastDay: '31',
      nav: 5,
      itscc: 4,
      ivuca: 3,
      isq: 2,
      rhoveGap: 2,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 5, 'Medicina Interna': 4, UCIN: 3, 'Cirugía General': 2 },
    },
    {
      ym: '2026-09',
      lastDay: '30',
      nav: 4,
      itscc: 3,
      ivuca: 2,
      isq: 2,
      rhoveGap: 1,
      urg: 1,
      brotes: 1,
      ident: 1,
      blee: 2,
      carbR: 2,
      deaths: 1,
      porServicio: { UCIA: 4, 'Medicina Interna': 3, UCIN: 2, 'Cirugía General': 2 },
    },
    {
      ym: '2026-10',
      lastDay: '31',
      nav: 5,
      itscc: 4,
      ivuca: 2,
      isq: 2,
      rhoveGap: 2,
      urg: 2,
      brotes: 2,
      ident: 1,
      blee: 3,
      carbR: 3,
      deaths: 1,
      porServicio: { UCIA: 5, UCIN: 3, 'Medicina Interna': 3, Neurocirugía: 2 },
    },
  ];

  return specs.map((sp) => {
    const year = sp.ym.slice(0, 4);
    const monthNum = Number(sp.ym.slice(5, 7));
    const monthName = SEED_MONTH_NAMES[monthNum - 1] || sp.ym;
    const totalIaas = sp.nav + sp.itscc + sp.ivuca + sp.isq + (sp.itslab || 0);
    const corte = `${sp.ym}-${sp.lastDay}`;
    return {
      id: `seed-${sp.ym}`,
      corte,
      etiqueta: `Cierre mensual ${monthName} ${year}`,
      creadoEn: `${corte}T18:00:00.000Z`,
      totalIaas,
      capturadasRhove: Math.max(0, totalIaas - sp.rhoveGap),
      urgentes: sp.urg,
      brotesActivos: sp.brotes,
      clustersIdenticos: sp.ident,
      bleeCount: sp.blee,
      carbapenemResistantCount: sp.carbR,
      defuncionesConIaas: sp.deaths,
      porSitio: {
        'NAV / Neumonía': sp.nav,
        'ITS-CC': sp.itscc,
        'IVU-CA': sp.ivuca,
        ISQ: sp.isq,
        ...(sp.itslab ? { 'ITS-Lab': sp.itslab } : {}),
      },
      porServicio: sp.porServicio,
    };
  });
}

export function ensureFullHistoricalBaseline(list: CodecinSnapshot[]): CodecinSnapshot[] {
  const defaults = createSeededSnapshots();
  if (!Array.isArray(list) || list.length === 0) return defaults;

  const existingIds = new Set(list.map((s) => s.id));
  const existingCortes = new Set(list.map((s) => s.corte));
  const missingSeeds = defaults.filter(
    (seed) => !existingIds.has(seed.id) && !existingCortes.has(seed.corte)
  );
  if (missingSeeds.length === 0) {
    return [...list].sort((a, b) => a.corte.localeCompare(b.corte));
  }
  return [...missingSeeds, ...list].sort((a, b) => a.corte.localeCompare(b.corte));
}

export function loadCodecinSnapshots(): CodecinSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) {
      const seeded = createSeededSnapshots();
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createSeededSnapshots();
    const enriched = ensureFullHistoricalBaseline(parsed as CodecinSnapshot[]);
    if (enriched.length !== parsed.length) {
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(enriched));
    }
    return enriched;
  } catch {
    return createSeededSnapshots();
  }
}

export function saveCodecinSnapshotFromAnalytics(
  corte: string | null,
  etiqueta: string,
  analytics: CodecinAnalytics
): CodecinSnapshot[] {
  const effectiveCorte = corte || todayISO();
  const porSitio: Record<string, number> = {};
  analytics.bySite.forEach((s) => {
    porSitio[s.shortCode] = s.total;
  });
  const porServicio: Record<string, number> = {};
  analytics.byService.forEach((s) => {
    porServicio[s.service] = s.activeIaas;
  });

  const snap: CodecinSnapshot = {
    id: `cut-${effectiveCorte}-${Date.now()}`,
    corte: effectiveCorte,
    etiqueta: etiqueta.trim() || `Corte operativo ${fmtFull(effectiveCorte)}`,
    creadoEn: new Date().toISOString(),
    totalIaas: analytics.totalActiveIaas,
    capturadasRhove: analytics.rhoveCapturedCount,
    urgentes: analytics.urgentPendingCount,
    brotesActivos: analytics.activeClustersCount,
    clustersIdenticos: analytics.identicalClustersCount,
    bleeCount: analytics.bleeCount,
    carbapenemResistantCount: analytics.carbapenemResistantCount,
    defuncionesConIaas: analytics.closedDeathsCount,
    porSitio,
    porServicio,
  };

  const existing = loadCodecinSnapshots().filter(
    (s) => s.corte !== effectiveCorte || s.id.startsWith('seed-')
  );
  const next = [...existing, snap].sort((a, b) => a.corte.localeCompare(b.corte));
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors
  }
  return next;
}

export function exportCodecinWorkbook(
  corte: string | null,
  analytics: CodecinAnalytics,
  snapshots: CodecinSnapshot[]
): void {
  const wb = XLSX.utils.book_new();
  const sortedSnapshots = ensureFullHistoricalBaseline(snapshots);

  const summaryRows = [
    ['Indicador CODECIN / UVEH', 'Valor', 'Corte de referencia'],
    ['IAAS activas bajo vigilancia', analytics.totalActiveIaas, corte || todayISO()],
    ['Capturadas en plataforma RHOVE', analytics.rhoveCapturedCount, `${analytics.rhoveCapturePct}%`],
    ['Pendientes prioritarias / urgentes', analytics.urgentPendingCount, ''],
    ['Aislamientos con fenotipo BLEE', analytics.bleeCount, ''],
    ['Resistencia a carbapenémicos', analytics.carbapenemResistantCount, ''],
    ['Clusters activos de posible brote', analytics.activeClustersCount, ''],
    ['Clusters con antibiograma idéntico', analytics.identicalClustersCount, ''],
    ['Defunciones en episodios cerrados', analytics.closedDeathsCount, ''],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Resumen Ejecutivo');

  const siteRows = [
    ['Código', 'Tipo / Sitio de IAAS', 'Casos activos', 'Capturados RHOVE', 'Proporción (%)'],
    ...analytics.bySite.map((s) => [s.shortCode, s.site, s.total, s.rhoveCaptured, s.pct]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(siteRows), 'Por Sitio IAAS');

  const svcRows = [
    ['Servicio Hospitalario', 'IAAS activas', 'Capturadas RHOVE', 'Urgentes sin captura', 'En cluster'],
    ...analytics.byService.map((s) => [
      s.service,
      s.activeIaas,
      s.rhoveCaptured,
      s.urgentPending,
      s.outbreakLinked,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(svcRows), 'Por Servicio');

  const microRows = [
    ['Microorganismo', 'Aislamientos', 'BLEE', 'Carbapenem-R', 'Servicios involucrados'],
    ...analytics.byOrganism.map((o) => [
      o.organism,
      o.isolates,
      o.blee,
      o.carbapenemR,
      o.services.join(', '),
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(microRows), 'Resistencia Micro');

  const histRows = [
    [
      'Fecha Corte',
      'Etiqueta',
      'Total IAAS',
      'Variación vs previo',
      'Promedio móvil (3 cortes)',
      'Capturadas RHOVE',
      '% Captura RHOVE',
      'Clusters Activos',
      'Antibiograma Idéntico',
      'BLEE',
      'Carbapenem-R',
      'Defunciones',
      ...IAAS_SITE_CODES,
    ],
    ...sortedSnapshots.map((h, idx) => {
      const prev = idx > 0 ? sortedSnapshots[idx - 1] : null;
      const windowSlice = sortedSnapshots.slice(Math.max(0, idx - 2), idx + 1);
      const movingAvg =
        Math.round(
          (windowSlice.reduce((acc, item) => acc + item.totalIaas, 0) / windowSlice.length) * 10
        ) / 10;
      const rhovePct = h.totalIaas > 0 ? Math.round((h.capturadasRhove / h.totalIaas) * 100) : 0;
      return [
        h.corte,
        h.etiqueta,
        h.totalIaas,
        prev ? h.totalIaas - prev.totalIaas : 0,
        movingAvg,
        h.capturadasRhove,
        `${rhovePct}%`,
        h.brotesActivos,
        h.clustersIdenticos,
        h.bleeCount,
        h.carbapenemResistantCount,
        h.defuncionesConIaas,
        ...IAAS_SITE_CODES.map((code) => h.porSitio?.[code] || 0),
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(histRows), 'Serie Historica');

  const safeDate = (corte || todayISO()).replace(/[^0-9-]/g, '');
  XLSX.writeFile(wb, `Informe_CODECIN_UVEH_${safeDate}.xlsx`);
}
