import {
  BulletinPayload,
  CultureAttachment,
  NursingNote,
  SharedMark,
} from '../types/clinical';
import { todayISO } from '../domain/dates';

export function createInitialDemoDataset(): {
  bulletin: BulletinPayload;
  marks: SharedMark[];
  notes: NursingNote[];
  cultures: CultureAttachment[];
} {
  const hoy = todayISO();

  const bulletin: BulletinPayload = {
    corte: hoy,
    publicado: new Date().toISOString(),
    nota: 'Corte matutino UVEH: cotejar resultados definitivos de bacteriología en UCIA (camas 02 y 05) y verificar captura de hemocultivos de Nefrología en plataforma RHOVE antes de las 14:00 h.',
    notasEnf: {},
    file: 'RADAR_UVEH_HAEV.xlsx',
    rows: [
      {
        id: '20260412|ramirez soto ernesto|iaas|aspirado traqueal positivo',
        exp: '20260412',
        nombre: 'RAMIREZ SOTO ERNESTO',
        edad: '58',
        cama: 'UCIA-02',
        svc: 'UCIA',
        prev: 'Urgencias Adultos / Quirófano',
        ing: '2026-10-19',
        det: hoy,
        prog: 'IAAS',
        motivo:
          'Deterioro ventilatorio, FiO2 al 70%, secreciones purulentas abundantes e infiltrado basal bilateral nuevo al día 9 de ventilación mecánica.',
        accion:
          'Aplicar cédula de NAV y cotejar reporte definitivo de sensibilidad con Infectología para captura en RHOVE.',
        pri: 'Inmediata',
        rhove: 'No capturada',
        tipo: 'Neumonía asociada a ventilación mecánica',
        micro: 'Acinetobacter baumannii (pendiente)',
        muestra: 'Aspirado endotraqueal cuantitativo',
        res: 'Positivo >10^5 UFC/mL',
        disp: 'Ventilación mecánica invasiva (9 días)',
        fres: hoy,
        atb: 'Meropenem >=16 Resistente; Imipenem >=16 Resistente; Ciprofloxacino >=4 Resistente; Colistina <=0.5 Sensible; Tigeciclina <=1 Sensible',
        obs: 'Diagnóstico censal: TCE severo postquirúrgico.',
      },
      {
        id: '20260418|morales vega leticia|iaas|secrecion bronquial acinetobacter',
        exp: '20260418',
        nombre: 'MORALES VEGA LETICIA',
        edad: '64',
        cama: 'UCIA-05',
        svc: 'UCIA',
        prev: 'Medicina Interna',
        ing: '2026-10-21',
        det: hoy,
        prog: 'IAAS',
        motivo:
          'Fiebre de 38.9 °C, leucocitosis de 16,400/µL y desarrollo en aspirado bronquial con perfil carbapenem-resistente coincidente en UCIA.',
        accion:
          'Valorar criterios clínicos de NAV en cédula UVEH y revisar perfil de resistencia compartido en UCIA.',
        pri: 'Inmediata',
        rhove: 'No capturada',
        tipo: 'Neumonía asociada a ventilación mecánica',
        micro: 'Acinetobacter baumannii (pendiente)',
        muestra: 'Aspirado bronquial',
        res: 'Positivo',
        disp: 'Ventilación mecánica invasiva (7 días)',
        fres: hoy,
        atb: 'Meropenem >=16 Resistente; Imipenem >=16 Resistente; Ciprofloxacino >=4 Resistente; Colistina <=0.5 Sensible; Tigeciclina <=1 Sensible',
        obs: 'Diagnóstico censal: Choque séptico abdominal resuelto.',
      },
      {
        id: '20260104|garcia lopez maria|iaas|hemocultivo positivo',
        exp: '20260104',
        nombre: 'GARCIA LOPEZ MARIA',
        edad: '62',
        cama: '304',
        svc: 'Medicina Interna / Nefrología',
        ing: '2026-10-20',
        det: hoy,
        prog: 'IAAS',
        motivo:
          'Fiebre 38.7 °C y escalofríos durante sesión de hemodiálisis con catéter central (>5 días) y hemocultivo positivo.',
        accion:
          'Valorar criterios de ITS-CC en cédula UVEH y dar de alta evento en plataforma RHOVE.',
        pri: 'Inmediata',
        rhove: 'No capturada',
        tipo: 'ITS relacionada a catéter central',
        micro: 'Klebsiella pneumoniae (pendiente)',
        muestra: 'Hemocultivo central y periférico',
        res: 'Positivo',
        disp: 'Catéter venoso central Mahurkar',
        fres: hoy,
        atb: 'Meropenem <=0.25 Sensible; Ceftriaxona >=64 Resistente; Cefepime >=32 Resistente; Amikacina <=2 Sensible',
        obs: 'Diagnóstico censal: ERC estadio 5 en HD.',
      },
      {
        id: '20260119|hernandez perez juan|iaas|urocultivo klebsiella',
        exp: '20260119',
        nombre: 'HERNANDEZ PEREZ JUAN',
        edad: '54',
        cama: '308',
        svc: 'Medicina Interna / Nefrología',
        ing: '2026-10-18',
        det: hoy,
        prog: 'IAAS',
        motivo:
          'Disuria, fiebre vespertina de 38.3 °C tras 6 días de sonda vesical Foley y urocultivo positivo >100,000 UFC/mL.',
        accion:
          'Confirmar recambio de sonda urinaria y evaluar patrón BLEE compartido en piso 3.',
        pri: 'Hoy',
        rhove: 'No capturada',
        tipo: 'IVU asociada a catéter urinario',
        micro: 'Klebsiella pneumoniae (pendiente)',
        muestra: 'Urocultivo por punción de puerto',
        res: 'Positivo',
        disp: 'Sonda vesical Foley (6 días)',
        fres: hoy,
        atb: 'Meropenem <=0.25 Sensible; Ceftriaxona >=64 Resistente; Cefepime >=32 Resistente; Amikacina <=2 Sensible',
        obs: 'Diagnóstico censal: Nefropatía diabética agudizada.',
      },
      {
        id: '20260305|sanchez diaz carlos|iaas|herida quirurgica',
        exp: '20260305',
        nombre: 'SANCHEZ DIAZ CARLOS',
        edad: '47',
        cama: '215',
        svc: 'Cirugía General',
        ing: '2026-10-24',
        det: hoy,
        prog: 'IAAS',
        motivo:
          'Eritema perilesional y salida de material purulento en herida media supra-infraumbilical al sexto día post-laparotomía.',
        accion:
          'Solicitar toma de cultivo aséptico de secreción previo a curación quirúrgica.',
        pri: 'Inmediata',
        rhove: 'No capturada',
        tipo: 'Infección de sitio quirúrgico incisional profunda',
        disp: 'Laparotomía exploradora hace 6 días',
        obs: 'Sin muestra microbiológica registrada en sistema de laboratorio al corte.',
      },
      {
        id: '20260211|martinez ruiz rn|iaas|sospecha sepsis neonatal',
        exp: '20260211',
        nombre: 'MARTINEZ RUIZ RN',
        edad: '12 días',
        cama: 'UCIN-04',
        svc: 'UCIN',
        ing: '2026-10-20',
        det: '2026-10-29',
        prog: 'IAAS',
        motivo:
          'Inestabilidad térmica, apnea y proteína C reactiva en ascenso; hemocultivo periférico en incubación.',
        accion:
          'Cotejar reporte definitivo de microbiología para cerrar agente causal en RHOVE.',
        pri: 'Hoy',
        rhove: 'Capturada',
        tipo: 'ITS confirmada por laboratorio',
        fcap: '2026-10-30',
        muestra: 'Hemocultivo periférico',
        res: 'Pendiente en incubación (48 h)',
        disp: 'Catéter percutáneo PICC',
      },
      {
        id: '20260509|castillo gomez valeria|iaas|microorganismo pendiente rhove',
        exp: '20260509',
        nombre: 'CASTILLO GOMEZ VALERIA',
        edad: '4',
        cama: 'LAC-07',
        svc: 'Pediatría / Lactantes',
        ing: '2026-10-16',
        det: '2026-10-28',
        prog: 'IAAS',
        motivo:
          'IAAS ya abierta en RHOVE; laboratorio reportó hoy desarrollo de Pseudomonas aeruginosa en hemocultivo central.',
        accion:
          'Capturar microorganismo y antibiograma definitivo en el folio RHOVE existente.',
        pri: 'Hoy',
        rhove: 'Capturada',
        tipo: 'ITS relacionada a catéter central',
        fcap: '2026-10-29',
        micro: 'Pseudomonas aeruginosa (pendiente)',
        muestra: 'Hemocultivo central',
        res: 'Positivo',
        fres: hoy,
        disp: 'Catéter venoso central subclavio',
        atb: 'Ceftazidima <=4 Sensible; Piperacilina/Tazobactam <=8 Sensible; Meropenem <=1 Sensible',
      },
      {
        id: '20260622|flores mendoza roberto|iaas|reingreso isq ortopedia',
        exp: '20260622',
        nombre: 'FLORES MENDOZA ROBERTO',
        edad: '39',
        cama: '412',
        svc: 'Traumatología / TYO',
        ing: '2026-10-30',
        det: hoy,
        prog: 'IAAS',
        motivo:
          'Reingreso a los 18 días de osteosíntesis tibial con dehiscencia de herida; tenía IAAS previa capturada en RHOVE.',
        accion:
          'Revisar si corresponde a extensión del evento previo con implante o apertura de nuevo episodio.',
        pri: 'Hoy',
        rhove: 'Capturada',
        tipo: 'Infección de sitio quirúrgico de órganos y espacios',
        fcap: '2026-10-14',
        micro: 'Staphylococcus aureus',
        muestra: 'Biopsia de tejido profundo',
        res: 'Positivo',
        disp: 'Material de osteosíntesis tibial',
        obs: 'Reingreso por Urgencias Adultos, localizado en Traumatología cama 412.',
      },
      {
        id: '20260714|ortiz navarro elena|iaas|endometritis postcesarea',
        exp: '20260714',
        nombre: 'ORTIZ NAVARRO ELENA',
        edad: '26',
        cama: 'GYO-11',
        svc: 'Ginecología y Obstetricia',
        ing: '2026-10-26',
        det: '2026-10-29',
        prog: 'IAAS',
        motivo:
          'Infección de sitio quirúrgico postcesárea en día 5 de esquema con clindamicina + gentamicina, afebril 48 h.',
        accion: 'Vigilancia de evolución clínica hasta alta hospitalaria.',
        pri: 'Seguimiento programado',
        rhove: 'Capturada',
        tipo: 'Infección de sitio quirúrgico de órganos y espacios',
        fcap: '2026-10-29',
        micro: 'Escherichia coli',
        muestra: 'Secreción endometrial',
        res: 'Positivo',
      },
      {
        id: '20260801|jimenez cruz arturo|tuberculosis|sospecha tb pulmonar',
        exp: '20260801',
        nombre: 'JIMENEZ CRUZ ARTURO',
        edad: '51',
        cama: '319',
        svc: 'Neumología',
        ing: '2026-10-29',
        det: hoy,
        prog: 'Tuberculosis',
        motivo:
          'Tos productiva de 6 semanas, pérdida ponderal y cavitación apical derecha; GeneXpert MTB/RIF positivo.',
        accion:
          'Completar estudio epidemiológico de caso y notificación en plataforma SINAVE.',
        pri: 'Hoy',
        notif: 'Pendiente',
        muestra: 'Expectoración seriada / GeneXpert',
        res: 'MTB detectado sin resistencia a rifampicina',
      },
      {
        id: '20260815|lopez rios daniela|arbovirosis|dengue con signos de alarma',
        exp: '20260815',
        nombre: 'LOPEZ RIOS DANIELA',
        edad: '19',
        cama: 'URG-08',
        svc: 'Urgencias Adultos',
        ing: '2026-10-31',
        det: hoy,
        prog: 'Vectoriales / Dengue',
        motivo:
          'Fiebre de 4 días, dolor abdominal intenso, plaquetopenia de 38,000/µL y NS1 reactivo.',
        accion: 'Verificar toma de muestra para PCR/serología estatal y llenado de estudio.',
        pri: 'Próximo corte',
        notif: 'Pendiente',
        muestra: 'Suero fase aguda (NS1)',
        res: 'Reactivo',
      },
    ],
    cerrados: [
      {
        id: '20260088|vega torres miguel|iaas|alta mejoria itscc',
        exp: '20260088',
        nombre: 'VEGA TORRES MIGUEL',
        edad: '68',
        cama: '302',
        svc: 'Medicina Interna',
        ing: '2026-10-08',
        det: '2026-10-15',
        egreso: '2026-10-30',
        oper: 'Egreso por mejoría',
        prog: 'IAAS',
        tipo: 'ITS relacionada a catéter central',
        rhove: 'Capturada',
        fcap: '2026-10-16',
        micro: 'Staphylococcus epidermidis',
        muestra: 'Hemocultivo pareado',
        res: 'Positivo',
        motivo: 'Completó 14 días de vancomicina con hemocultivos de control negativos.',
      },
      {
        id: '20260095|ruiz alcantara teresa|iaas|defuncion choque septico',
        exp: '20260095',
        nombre: 'RUIZ ALCANTARA TERESA',
        edad: '73',
        cama: 'UCIA-01',
        svc: 'UCIA',
        ing: '2026-10-10',
        det: '2026-10-19',
        egreso: '2026-10-29',
        oper: 'Defunción',
        prog: 'IAAS',
        tipo: 'Neumonía asociada a ventilación mecánica',
        rhove: 'Capturada',
        fcap: '2026-10-20',
        micro: 'Pseudomonas aeruginosa',
        muestra: 'Lavado broncoalveolar',
        res: 'Positivo',
        motivo: 'Defunción por choque séptico refractario; requiere cierre de desenlace en RHOVE.',
      },
    ],
    abRows: [],
  };

  const marks: SharedMark[] = [
    {
      key: 'c|20260104|garcia lopez maria|iaas|its relacionada a cateter central',
      tipo: 'criterios',
      activa: true,
      autor: 'dra.salazar@hospital.gob.mx',
      fecha: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
      nombre: 'GARCIA LOPEZ MARIA',
      cama: '304',
      servicio: 'Medicina Interna',
      detalle: {
        cat: 'itscc',
        marcados: [0, 1, 3],
        cumple: 'si',
      },
    },
  ];

  const notes: NursingNote[] = [
    {
      fila: 101,
      id: 'exp:20260104',
      nombre: 'GARCIA LOPEZ MARIA',
      cama: '304',
      servicio: 'Medicina Interna',
      texto:
        'Se tomó segundo juego de hemocultivos periféricos a las 08:20 h previo a primera dosis de meropenem.',
      autor: 'enf.nefrologia@hospital.gob.mx',
      fecha: new Date(Date.now() - 3600 * 1000 * 3).toISOString(),
      aplicada: false,
      puede: true,
    },
    {
      fila: 102,
      id: 'exp:20260305',
      nombre: 'SANCHEZ DIAZ CARLOS',
      cama: '215',
      servicio: 'Cirugía General',
      texto:
        'Residente de cirugía tomó hisopado profundo con jeringa estéril en curación de las 09:40 h; ya ingresó a bacteriología.',
      autor: 'enf.cirugia@hospital.gob.mx',
      fecha: new Date(Date.now() - 3600 * 1000 * 1.5).toISOString(),
      aplicada: false,
      puede: true,
    },
    {
      fila: 103,
      id: 'exp:20260714',
      nombre: 'ORTIZ NAVARRO ELENA',
      cama: 'GYO-11',
      servicio: 'Ginecología y Obstetricia',
      texto: 'Paciente programada para pre-alta mañana al concluir esquema IV.',
      autor: 'enf.gyo@hospital.gob.mx',
      fecha: new Date(Date.now() - 3600 * 1000 * 18).toISOString(),
      aplicada: true,
      puede: true,
    },
  ];

  const makeLabReportSvgDataUri = (params: {
    folio: string;
    paciente: string;
    expediente: string;
    cama: string;
    servicio: string;
    fecha: string;
    muestra: string;
    aislamiento: string;
    recuento: string;
    rows: Array<[string, string, 'Sensible' | 'Resistente']>;
  }) => {
    const tableRows = params.rows
      .map(([ab, mic, interp], idx) => {
        const y = 390 + idx * 34;
        const color = interp === 'Resistente' ? '#B91C1C' : '#047857';
        return `
          <line x1="56" y1="${y - 22}" x2="744" y2="${y - 22}" stroke="#E2E8F0" stroke-width="1"/>
          <text x="68" y="${y}" font-family="sans-serif" font-size="13" fill="#0F172A">${ab}</text>
          <text x="390" y="${y}" font-family="monospace" font-size="13" fill="#334155">${mic}</text>
          <text x="580" y="${y}" font-family="sans-serif" font-weight="700" font-size="13" fill="${color}">${interp}</text>
        `;
      })
      .join('');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="620" viewBox="0 0 800 620">
      <rect width="800" height="620" fill="#FFFFFF"/>
      <rect x="28" y="28" width="744" height="564" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
      <rect x="28" y="28" width="744" height="76" rx="8" fill="#0F766E"/>
      <text x="56" y="62" font-family="sans-serif" font-weight="700" font-size="18" fill="#FFFFFF">LABORATORIO DE MICROBIOLOGÍA CLÍNICA · HAEV</text>
      <text x="56" y="84" font-family="sans-serif" font-size="12" fill="#CCFBF1">Informe definitivo de cultivo y susceptibilidad antimicrobiana · Folio ${params.folio}</text>
      <text x="56" y="138" font-family="sans-serif" font-size="11" fill="#64748B">PACIENTE</text>
      <text x="56" y="158" font-family="sans-serif" font-weight="700" font-size="15" fill="#0F172A">${params.paciente}</text>
      <text x="420" y="138" font-family="sans-serif" font-size="11" fill="#64748B">EXPEDIENTE / CAMA / SERVICIO</text>
      <text x="420" y="158" font-family="monospace" font-weight="600" font-size="14" fill="#0F172A">Exp. ${params.expediente} · ${params.cama} · ${params.servicio}</text>
      <line x1="56" y1="178" x2="744" y2="178" stroke="#E2E8F0" stroke-width="1"/>
      <text x="56" y="206" font-family="sans-serif" font-size="11" fill="#64748B">TIPO DE MUESTRA</text>
      <text x="56" y="226" font-family="sans-serif" font-weight="600" font-size="14" fill="#0F172A">${params.muestra}</text>
      <text x="420" y="206" font-family="sans-serif" font-size="11" fill="#64748B">FECHA DE REPORTE</text>
      <text x="420" y="226" font-family="monospace" font-weight="600" font-size="14" fill="#0F172A">${params.fecha}</text>
      <rect x="56" y="248" width="688" height="64" rx="6" fill="#F8FAFC" stroke="#E2E8F0"/>
      <text x="72" y="272" font-family="sans-serif" font-size="11" fill="#64748B">MICROORGANISMO IDENTIFICADO</text>
      <text x="72" y="295" font-family="sans-serif" font-style="italic" font-weight="700" font-size="16" fill="#0F172A">${params.aislamiento}</text>
      <text x="430" y="295" font-family="monospace" font-size="13" fill="#334155">${params.recuento}</text>
      <text x="68" y="352" font-family="sans-serif" font-weight="700" font-size="12" fill="#475569">ANTIMICROBIANO</text>
      <text x="390" y="352" font-family="sans-serif" font-weight="700" font-size="12" fill="#475569">CMI (µg/mL)</text>
      <text x="580" y="352" font-family="sans-serif" font-weight="700" font-size="12" fill="#475569">INTERPRETACIÓN</text>
      ${tableRows}
      <text x="56" y="572" font-family="sans-serif" font-size="11" fill="#64748B">Validado por Q.F.B. Adscrito a Bacteriología · Copia electrónica para Vigilancia Epidemiológica UVEH</text>
    </svg>`;

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  };

  const cultures: CultureAttachment[] = [
    {
      id: 'exp:20260412',
      nombre: 'RAMIREZ SOTO ERNESTO',
      cama: 'UCIA-02',
      servicio: 'UCIA',
      archivo: `Cultivo ${hoy} - RAMIREZ SOTO ERNESTO (Aspirado endotraqueal).svg`,
      url: makeLabReportSvgDataUri({
        folio: 'BAC-2026-4809',
        paciente: 'RAMIREZ SOTO ERNESTO',
        expediente: '20260412',
        cama: 'UCIA-02',
        servicio: 'UCIA',
        fecha: hoy,
        muestra: 'Aspirado endotraqueal cuantitativo',
        aislamiento: 'Acinetobacter baumannii',
        recuento: 'Desarrollo > 100,000 UFC/mL',
        rows: [
          ['Meropenem', '>= 16', 'Resistente'],
          ['Imipenem', '>= 16', 'Resistente'],
          ['Ciprofloxacino', '>= 4', 'Resistente'],
          ['Colistina', '<= 0.5', 'Sensible'],
          ['Tigeciclina', '<= 1.0', 'Sensible'],
        ],
      }),
      autor: 'lab.bacteriologia@hospital.gob.mx',
      fecha: new Date(Date.now() - 3600 * 1000 * 4).toISOString(),
    },
    {
      id: 'exp:20260104',
      nombre: 'GARCIA LOPEZ MARIA',
      cama: '304',
      servicio: 'Medicina Interna',
      archivo: `Cultivo ${hoy} - GARCIA LOPEZ MARIA (Hemocultivo).svg`,
      url: makeLabReportSvgDataUri({
        folio: 'BAC-2026-4812',
        paciente: 'GARCIA LOPEZ MARIA',
        expediente: '20260104',
        cama: '304',
        servicio: 'Medicina Interna / Nefrología',
        fecha: hoy,
        muestra: 'Hemocultivo central y periférico',
        aislamiento: 'Klebsiella pneumoniae (Fenotipo BLEE)',
        recuento: 'Positivo a las 14 h de incubación',
        rows: [
          ['Ceftriaxona', '>= 64', 'Resistente'],
          ['Cefepime', '>= 32', 'Resistente'],
          ['Meropenem', '<= 0.25', 'Sensible'],
          ['Ertapenem', '<= 0.5', 'Sensible'],
          ['Amikacina', '<= 2.0', 'Sensible'],
        ],
      }),
      autor: 'lab.bacteriologia@hospital.gob.mx',
      fecha: new Date(Date.now() - 3600 * 1000 * 2.5).toISOString(),
    },
  ];

  return { bulletin, marks, notes, cultures };
}
