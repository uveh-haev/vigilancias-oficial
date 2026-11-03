export type IaasGroup2024 =
  | 'NAAS'
  | 'ITS-AAS'
  | 'IVU-CU'
  | 'ISQ'
  | 'ICD'
  | 'OTRAS';

export type IaasType2024 =
  | 'NAV'
  | 'NAAS-RP'
  | 'NAAS-NRP'
  | 'ITS-CC'
  | 'ITS-RP'
  | 'ITS-IV'
  | 'ITS-DBM'
  | 'IVU-CU'
  | 'IIS'
  | 'IIP'
  | 'IOE'
  | 'ICD'
  | 'SITIO-CATETER'
  | 'FLEBITIS'
  | 'MEDIASTINITIS'
  | 'ENDOCARDITIS'
  | 'MENINGITIS-VENTRICULITIS'
  | 'INFECCION-INTRACRANEAL'
  | 'PIEL-TEJIDOS'
  | 'TRAQUEOBRONQUITIS'
  | 'EMPIEMA-PROC'
  | 'PERITONITIS-DP'
  | 'ENDOMETRITIS'
  | 'PROC-ENDOSCOPICO'
  | 'OTRA-IAAS';

export type IaasDiagnosticLevel = 'confirmada_lab' | 'definida_clinica';

export type IaasPatientOutcome =
  | 'hospitalizado'
  | 'egreso_mejoria'
  | 'traslado'
  | 'defuncion_por_iaas'
  | 'defuncion_con_iaas'
  | 'defuncion_otra_causa';

export type InvasiveDeviceCode =
  | 'VM'
  | 'CVC'
  | 'CU'
  | 'VP'
  | 'CAT_DIALISIS'
  | 'NINGUNO';

export type OutbreakLifecycleStage =
  | 'borrador'
  | 'notificado_inicial'
  | 'en_seguimiento'
  | 'cerrado';

export type SuiveAgeGroupKey =
  | '<1'
  | '1-4'
  | '5-9'
  | '10-14'
  | '15-19'
  | '20-24'
  | '25-44'
  | '45-49'
  | '50-59'
  | '60-64'
  | '65+'
  | 'ignora';

export interface SuiveExposedSexPair {
  m: number;
  f: number;
}

export interface OutbreakCaseMember {
  patientId: string;
  expediente: string;
  nombre: string;
  iniciales: string;
  edadAnios: number | null;
  edadTexto: string;
  grupoEdad: SuiveAgeGroupKey;
  sexo: 'M' | 'F';
  cama: string;
  fechaIngresoHospital: string;
  servicioPrevio: string;
  servicioBrote: string;
  fechaIngresoServicio: string;
  iaasGroup: IaasGroup2024;
  iaasType: IaasType2024;
  nivelDiagnostico: IaasDiagnosticLevel;
  folioRhove: string;
  asociadoBroteSeveiaas: boolean;
  fechaInicioSintomas: string;
  fechaInicioSeveiaas: string;
  signosSintomas: string[];
  cuadroClinicoDetalle: string;
  dispositivoPrincipal: InvasiveDeviceCode;
  fechaInstalacionDisp: string;
  fechaRetiroDisp: string;
  procedimientosAsociados: string;
  fechaProcedimiento: string;
  tipoMuestra: string;
  fechaTomaMuestra: string;
  fechaResultadoLab: string;
  microorganismo: string;
  mecanismoResistencia: string;
  perfilResistencia: string;
  tratamientoAntimicrobiano: string;
  fechaInicioTratamiento: string;
  desenlace: IaasPatientOutcome;
  fechaEgresoDefuncion: string;
  folioCertificadoDefuncion: string;
  evidenciaCultivoArchivo: string;
  incluidoEnEstudio: boolean;
}

export interface OutbreakControlAction {
  id: string;
  fecha: string;
  categoria:
    | 'aislamiento'
    | 'higiene_manos'
    | 'limpieza_desinfeccion'
    | 'paquetes_invasivos'
    | 'inhaloterapia_ceye'
    | 'codeciaas'
    | 'otra';
  descripcion: string;
  responsable: string;
}

export interface OutbreakFollowUpLog {
  id: string;
  fecha: string;
  tipo: 'inicial_0' | 'nota_semanal' | 'actualizacion_casos' | 'cierre_1';
  folioNotinmed: string;
  resumen: string;
  autor: string;
}

export interface OutbreakEvidenceChecklist {
  minutaCodeciaas: boolean;
  fechaMinutaCodeciaas: string;
  minutaRecorridoCampo: boolean;
  fechaRecorridoCampo: string;
  reportesSusceptibilidadLab: boolean;
  listasCapacitacionEppHigiene: boolean;
  evidenciaPaquetesPreventivos: boolean;
  notasDocumentales: string;
}

export interface OutbreakStudyRecord {
  id: string;
  clusterKey: string;
  organismo: string;
  fenotipoResistencia: string;
  serviciosInvolucrados: string[];
  stage: OutbreakLifecycleStage;
  folioNotinmedBase: string;
  folioSufijoActual: string;
  unidadNotificante: string;
  claveSuave: string;
  claveClues: string;
  localidad: string;
  municipio: string;
  jurisdiccion: string;
  entidad: string;
  institucion: string;
  servicioMedico: string;
  dxProbable: string;
  dxFinal: string;
  fechaInicioBrote: string;
  fechaDeteccion: string;
  fechaNotificacion: string;
  fechaCierre: string;
  poblacionExpuestaPorEdad: Record<SuiveAgeGroupKey, SuiveExposedSexPair>;
  poblacionExpuestaModo: 'global_servicio' | 'por_edad';
  expuestosGlobalM: number;
  expuestosGlobalF: number;
  casos: OutbreakCaseMember[];
  antecedentesPanorama: string;
  probablesFuentes: string;
  probablesMecanismos: string;
  accionesControl: OutbreakControlAction[];
  bitacoraSeguimiento: OutbreakFollowUpLog[];
  checklistCodeciaas: OutbreakEvidenceChecklist;
  elaboroNombreCargo: string;
  directorNombre: string;
  epidemiologoNombre: string;
  creadoEn: string;
  actualizadoEn: string;
  actualizadoPor: string;
}

export interface OutbreakAuditFinding {
  id: string;
  severity: 'error' | 'warning';
  section: 'caratula' | 'censo' | 'curva' | 'analisis' | 'seguimiento';
  patientLabel?: string;
  title: string;
  detail: string;
}

export interface SuiveTemplateMappingSummary {
  fileName: string;
  uploadedAt: string;
  sizeBytes: number;
  sheetNames: string[];
  suiveSheetName: string | null;
  censusSheetName: string | null;
  censusHeaderRowIndex: number | null;
  detectedFieldAnchors: Record<string, string>;
  detectedAgeGroupRows: Record<string, number>;
  customOverrides: Record<string, string>;
  persistedInBrowser: boolean;
}
