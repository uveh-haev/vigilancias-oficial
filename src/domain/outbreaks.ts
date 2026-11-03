import { AntibiogramEntry, OutbreakCluster, RadarEvent } from '../types/clinical';
import { norm } from './dates';

const GENUS_ABBREV: Record<string, string> = {
  k: 'klebsiella',
  a: 'acinetobacter',
  p: 'pseudomonas',
  s: 'staphylococcus',
  c: 'candida',
};

const SERVICE_ALIASES: Array<[string, string?]> = [
  ['ucia'],
  ['ucin'],
  ['utip'],
  ['ucim'],
  ['terapia intermedia pediatrica', 'utip'],
  ['medicina interna'],
  ['cirugia general'],
  ['traumatologia', 'tyo'],
  ['tyo'],
  ['neurocirugia'],
  ['neumologia'],
  ['nefrologia'],
  ['dialisis', 'nefrologia'],
  ['infectologia'],
  ['hematologia'],
  ['oncologia'],
  ['quemados'],
  ['urgencias adultos'],
  ['urgencias pediatricas'],
  ['ginecologia', 'gyo'],
  ['lactantes'],
  ['escolares'],
  ['preescolares'],
  ['neurologia'],
  ['urologia'],
  ['cardiologia'],
  ['gastroenterologia'],
  ['observacion pediatrica'],
];

const SERVICE_KEY_LABELS: Record<string, string> = {
  ucia: 'UCIA',
  ucin: 'UCIN',
  utip: 'UTIP',
  ucim: 'UCIM',
  tyo: 'TYO',
  gyo: 'Ginecología y Obstetricia',
  'cirugia general': 'Cirugía General',
  neurocirugia: 'Neurocirugía',
  neumologia: 'Neumología',
  nefrologia: 'Nefrología',
  infectologia: 'Infectología',
  hematologia: 'Hematología',
  oncologia: 'Oncología',
  'urgencias pediatricas': 'Urgencias Pediátricas',
  neurologia: 'Neurología',
  urologia: 'Urología',
  cardiologia: 'Cardiología',
  gastroenterologia: 'Gastroenterología',
  'observacion pediatrica': 'Observación Pediátrica',
};

export function isDischargedRow(row: RadarEvent): boolean {
  return Boolean(row.egreso) || /egres|defunc|traslad|cerrad/.test(norm(row.oper));
}

export function extractOrganisms(text?: string): string[] {
  if (!text) return [];
  const t = norm(text);
  if (/no se aisl|sin desarrollo|^vih$|negativ/.test(t)) return [];

  return t
    .replace(/\([^)]*\)/g, '')
    .split(/;|\/|\+|,|\by\b/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((raw) => {
      const cleaned = raw
        .replace(/\b(complex|complejo|subs?p?\.?\s+\w+|spp?\.?)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const words = cleaned.split(' ');
      if (words.length < 2) return null;
      let genus = words[0].replace('.', '');
      const species = words[1];
      if (genus.length <= 2) {
        if (genus === 'e') {
          genus =
            species === 'coli'
              ? 'escherichia'
              : species === 'cloacae' || species === 'aerogenes'
                ? 'enterobacter'
                : 'e';
        } else {
          genus = GENUS_ABBREV[genus] || genus;
        }
      }
      return `${genus} ${species}`;
    })
    .filter((v): v is string => Boolean(v));
}

export function prettyOrganism(binomial: string): string {
  const [genus, species] = binomial.split(' ');
  if (!genus) return binomial;
  return `${genus[0].toUpperCase()}${genus.slice(1)} ${species || ''}`.trim();
}

export function extractServiceKeys(row: RadarEvent): Set<string> {
  const text = norm([row.svc, row.prev].filter(Boolean).join(' / '));
  const out = new Set<string>();
  for (const [alias, canonical] of SERVICE_ALIASES) {
    if (text.includes(alias)) out.add(canonical || alias);
  }
  if (
    !out.has('urgencias adultos') &&
    !out.has('urgencias pediatricas') &&
    text.includes('urgencias')
  ) {
    out.add('urgencias');
  }
  return out;
}

function formatServiceKey(key: string): string {
  return SERVICE_KEY_LABELS[key] || key.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function detectOutbreaks(rows: RadarEvent[]): OutbreakCluster[] {
  const byOrg: Record<string, RadarEvent[]> = {};
  rows
    .filter((r) => !isDischargedRow(r))
    .forEach((row) => {
      extractOrganisms(row.micro).forEach((org) => {
        (byOrg[org] = byOrg[org] || []).push(row);
      });
    });

  const clusters: OutbreakCluster[] = [];
  for (const org of Object.keys(byOrg)) {
    const uniquePatients = [
      ...new Map(byOrg[org].map((r) => [r.exp || r.nombre || r.id, r])).values(),
    ];
    if (uniquePatients.length < 2) continue;

    const counts: Record<string, number> = {};
    uniquePatients.forEach((r) => {
      extractServiceKeys(r).forEach((svc) => {
        counts[svc] = (counts[svc] || 0) + 1;
      });
    });

    const shared = Object.entries(counts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);
    if (!shared.length) continue;

    const topService = shared[0][0];
    clusters.push({
      org,
      shared: shared.map(([s]) => formatServiceKey(s)),
      members: uniquePatients.filter((r) => extractServiceKeys(r).has(topService)),
      ab: org.startsWith('acinetobacter'),
    });
  }

  return clusters.sort((a, b) => Number(b.ab) - Number(a.ab) || b.members.length - a.members.length);
}

function sortedNameKey(name?: string): string {
  return norm(name)
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function parseAntibiogramPattern(atb?: string): string | null {
  if (!atb) return null;
  const text = norm(atb);
  const combos: string[] = [];

  const reTabular =
    /([a-z]+(?:\/[a-z]+)?)\s*(?:[<>=]{1,2}\s*)?\d+(?:[.,]\d+)?\s*(resistente|sensible|intermedio)/g;
  let match: RegExpExecArray | null;
  while ((match = reTabular.exec(text))) {
    combos.push(`${match[1]}:${match[2][0].toUpperCase()}`);
  }

  const grabList = (label: string): string[] => {
    const re = new RegExp(`${label}\\s+a\\s+([^;.]+)`, 'g');
    let m: RegExpExecArray | null;
    const out: string[] = [];
    while ((m = re.exec(text))) {
      m[1].split(/,|\by\b/).forEach((drug) => {
        const clean = drug.trim().replace(/\.$/, '');
        if (clean) out.push(clean);
      });
    }
    return out;
  };

  grabList('resistente').forEach((d) => combos.push(`${d}:R`));
  grabList('sensible').forEach((d) => combos.push(`${d}:S`));
  grabList('intermedio').forEach((d) => combos.push(`${d}:I`));

  const reInterm = /\b([a-zñ/]{4,})\s+intermedio\b/g;
  let m2: RegExpExecArray | null;
  while ((m2 = reInterm.exec(text))) {
    const drug = m2[1].trim();
    if (drug) combos.push(`${drug}:I`);
  }

  if (!combos.length) return null;
  return [...new Set(combos)].sort().join('|');
}

export function buildAntibiogramIndex(abRows: AntibiogramEntry[]): Record<string, string> {
  const byKey: Record<string, Record<string, AntibiogramEntry[]>> = {};
  (abRows || []).forEach((row) => {
    if (!row.pac || !row.cod || !row.cat) return;
    const nk = sortedNameKey(row.pac);
    extractOrganisms(row.mic).forEach((org) => {
      const gk = `${nk}||${org}`;
      const fk = `${row.fecha || ''}|${row.folio || ''}`;
      byKey[gk] = byKey[gk] || {};
      (byKey[gk][fk] = byKey[gk][fk] || []).push(row);
    });
  });

  const index: Record<string, string> = {};
  for (const gk of Object.keys(byKey)) {
    const keys = Object.keys(byKey[gk]).sort();
    const chosen = byKey[gk][keys[keys.length - 1]];
    const combos = [...new Set(chosen.map((r) => `${r.cod}:${r.cat}`))].sort();
    if (combos.length) index[gk] = combos.join('|');
  }
  return index;
}

export function detectIdenticalOutbreaks(
  clusters: OutbreakCluster[],
  atbIndex: Record<string, string>
): OutbreakCluster[] {
  return clusters
    .flatMap((cluster) => {
      const byPattern: Record<string, RadarEvent[]> = {};
      cluster.members.forEach((member) => {
        const nk = sortedNameKey(member.nombre);
        const pattern = atbIndex[`${nk}||${cluster.org}`] || parseAntibiogramPattern(member.atb);
        if (!pattern) return;
        (byPattern[pattern] = byPattern[pattern] || []).push(member);
      });

      return Object.values(byPattern)
        .filter((list) => list.length >= 2)
        .map((members) => ({
          org: cluster.org,
          members,
          shared: cluster.shared,
          ab: cluster.ab,
          identicalAtb: true,
        }));
    })
    .sort((a, b) => Number(b.ab) - Number(a.ab) || b.members.length - a.members.length);
}
