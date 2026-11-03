import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AntibiogramEntry,
  AsyncResourceState,
  BulletinPayload,
  BulletinState,
  CodecinSnapshot,
  CriteriaEvaluation,
  CultureAttachment,
  DoneRecord,
  NursingNote,
  OfflineQueuedAction,
  OutbreakStudyRecord,
  PatientGroup,
  QueueTabId,
  RadarEvent,
  SharedMark,
  StandaloneRole,
  ViewDensity,
  WorkspaceSection,
} from '../types/clinical';
import { computeSurveillanceSlices, groupEventsByPatient } from '../domain/classification';
import { loadCodecinSnapshots } from '../domain/codecinMetrics';
import { loadLocalOutbreakStudies, saveLocalOutbreakStudies } from '../domain/iaasTaxonomy2024';
import { mkCriterios, mkDescartado, mkRevisado } from '../domain/criteria';
import { normName, todayISO } from '../domain/dates';
import { parseRadarArrayBuffer, parseRadarWorkbook } from '../domain/excelParser';
import { getPatientKey, getServiceGroup, indexByPatient } from '../domain/services';
import {
  createNursingNote,
  deleteNursingNote,
  fetchBulletin,
  fetchCultureAttachments,
  fetchNursingNotes,
  fetchSharedMarks,
  isAppsScriptEnvironment,
  markNursingNoteApplied,
  ReadBulletinResponse,
  resetStandaloneDataset,
  saveBulletin,
  saveSharedMarks,
  updateNursingNote,
  uploadCultureAttachment,
} from '../services/appsScriptBridge';
import { fileToBase64 } from '../services/aiClinicalService';
import {
  CloudSessionState,
  authorizeWorkspaceAccess,
  ensureHospitalSession,
  getWorkspaceAccessToken,
  isBootstrappedAdminUser,
  observeAuthUser,
  publishBulletinToCloud,
  saveCodecinBoardInCloud,
  saveCulturesBoardInCloud,
  saveNotesBoardInCloud,
  saveOutbreaksBoardInCloud,
  setStaffRoleInCloud,
  signInHospitalUser,
  signOutHospitalUser,
  subscribeToHospitalRealtime,
  toggleStaffRevocationInCloud,
  updateOwnStaffProfileInCloud,
  upsertMarksInCloud,
} from '../services/firebaseService';
import {
  UVEH_DRIVE_FOLDER_NAME,
  UVEH_NOTES_SHEET_TITLE,
  exportBulletinToNewGoogleSheet,
  importBulletinFromGoogleSheet,
  syncNotesToGoogleSheet,
  uploadCultureFileToDrive,
} from '../services/googleWorkspaceService';
import {
  enqueueOfflineAction,
  readOfflineQueue,
  removeOfflineAction,
} from '../services/offlineQueue';
import { useOnlineStatus } from './useOnlineStatus';
import type { SmartCultureIntegrationPayload } from '../components/cultures/SmartCultureModal';
import type { WorkspaceConfirmRequest } from '../components/modals/WorkspaceConfirmModal';

function getStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

const EMPTY_BULLETIN: BulletinState = {
  corte: null,
  nota: '',
  notasEnf: {},
  file: '',
  rows: [],
  cerrados: [],
  abRows: [],
  publicado: null,
  preview: false,
  empty: true,
  loading: true,
};

export interface InspectedPatientContext {
  patientKey: string;
  orderedKeys: string[];
}

export function useSurveillanceController() {
  const isStandaloneDemo = !isAppsScriptEnvironment();

  const [bulletin, setBulletin] = useState<BulletinState>(EMPTY_BULLETIN);
  const publishedRef = useRef<BulletinPayload | null>(null);
  const previewRef = useRef<boolean>(false);

  const [serverCanWrite, setServerCanWrite] = useState<boolean>(false);
  const [standaloneRole, setStandaloneRoleState] = useState<StandaloneRole>(() =>
    getStored<StandaloneRole>('uveh_standalone_role', 'uveh')
  );

  const [cloudSession, setCloudSession] = useState<CloudSessionState>({
    authReady: false,
    user: null,
    role: 'enfermeria',
    serviceArea: '',
    displayName: '',
    isRevoked: false,
    isBootstrappedAdmin: false,
    hasWorkspaceToken: false,
    staffList: [],
    syncError: null,
  });
  const [signingIn, setSigningIn] = useState(false);
  const [authorizingWorkspace, setAuthorizingWorkspace] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [googleSheetsModalOpen, setGoogleSheetsModalOpen] = useState(false);
  const [savedSpreadsheetInput, setSavedSpreadsheetInputState] = useState<string>(() =>
    getStored<string>('uveh_gsheet_url', '')
  );
  const [lastSyncedSheetUrl, setLastSyncedSheetUrl] = useState<string | null>(null);
  const [workspaceBusyAction, setWorkspaceBusyAction] = useState<
    'import' | 'sync-notes' | 'export-new' | null
  >(null);
  const [workspaceConfirm, setWorkspaceConfirm] = useState<WorkspaceConfirmRequest | null>(null);
  const [workspaceConfirmBusy, setWorkspaceConfirmBusy] = useState(false);
  const workspaceConfirmActionsRef = useRef<{
    onConfirm: () => Promise<void> | void;
    onCancel: () => void;
  } | null>(null);
  const [cloudCodecinSnapshots, setCloudCodecinSnapshots] = useState<CodecinSnapshot[] | null>(
    null
  );
  const [outbreakStudies, setOutbreakStudies] = useState<OutbreakStudyRecord[]>(() =>
    loadLocalOutbreakStudies()
  );

  const isCloudConnected = Boolean(cloudSession.user && !cloudSession.isRevoked);
  const canWrite = isCloudConnected
    ? cloudSession.role === 'uveh'
    : isStandaloneDemo
      ? standaloneRole === 'uveh'
      : serverCanWrite;

  const [sharedMarks, setSharedMarks] = useState<Record<string, SharedMark> | null>(null);
  const [localDone, setLocalDone] = useState<Record<string, DoneRecord | string | boolean>>(() =>
    getStored('uveh_done', {})
  );
  const migratingRef = useRef(false);
  const seedSnapshotRef = useRef<{
    marks: Record<string, SharedMark> | null;
    notes: NursingNote[];
    cultures: CultureAttachment[];
  }>({ marks: null, notes: [], cultures: [] });

  const [notes, setNotes] = useState<NursingNote[]>([]);
  const [notesState, setNotesState] = useState<AsyncResourceState>({
    loading: true,
    error: null,
  });

  const [cultures, setCultures] = useState<CultureAttachment[]>([]);
  const [culturesState, setCulturesState] = useState<AsyncResourceState>({
    loading: true,
    error: null,
  });

  const [section, setSection] = useState<WorkspaceSection>(WorkspaceSection.Surveillance);
  const [activeTab, setActiveTabState] = useState<QueueTabId>(() =>
    getStored<QueueTabId>('uveh_tab', 'foco')
  );
  const [selectedService, setSelectedServiceState] = useState<string>(() =>
    getStored<string>('uveh_svc', '')
  );
  const [selectedSubArea, setSelectedSubArea] = useState<string>('');
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedDischargeReason, setSelectedDischargeReason] = useState<string>('');
  const [outbreakAtbFilter, setOutbreakAtbFilter] = useState<'all' | 'identico'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [viewDensity, setViewDensityState] = useState<ViewDensity>(() =>
    getStored<ViewDensity>('uveh_view_density', 'cards')
  );
  const [darkMode, setDarkModeState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('uveh_theme');
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
    } catch {
      // Ignore
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [parsingExcel, setParsingExcel] = useState<boolean>(false);
  const [markingIds, setMarkingIds] = useState<Record<string, boolean>>({});
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // Slide-over Patient Dossier, Culture Document Viewer & Smart Culture Extractor
  const [inspectorCtx, setInspectorCtx] = useState<InspectedPatientContext | null>(null);
  const [viewingCulture, setViewingCulture] = useState<CultureAttachment | null>(null);
  const [smartCultureModal, setSmartCultureModal] = useState<{
    open: boolean;
    patient: RadarEvent | null;
    file: File | null;
  }>({ open: false, patient: null, file: null });

  // Offline connectivity & queued floor actions
  const isOnline = useOnlineStatus();
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueuedAction[]>(() =>
    readOfflineQueue()
  );
  const [flushingOffline, setFlushingOffline] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  useEffect(() => {
    window.UVEH_parse = parseRadarWorkbook;
  }, []);

  useEffect(() => {
    previewRef.current = bulletin.preview;
  }, [bulletin.preview]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    try {
      localStorage.setItem('uveh_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore
    }
  }, [darkMode]);

  useEffect(() => {
    seedSnapshotRef.current = { marks: sharedMarks, notes, cultures };
  }, [sharedMarks, notes, cultures]);

  // Firebase Auth & Real-Time Hospital Subscriptions
  useEffect(() => {
    let detachRealtime: (() => void) | null = null;
    let cancelled = false;

    const unsubAuth = observeAuthUser(async (user) => {
      if (detachRealtime) {
        detachRealtime();
        detachRealtime = null;
      }

      if (!user) {
        if (!cancelled) {
          setCloudSession({
            authReady: true,
            user: null,
            role: 'enfermeria',
            serviceArea: '',
            displayName: '',
            isRevoked: false,
            isBootstrappedAdmin: false,
            hasWorkspaceToken: false,
            staffList: [],
            syncError: null,
          });
          setCloudCodecinSnapshots(null);
        }
        return;
      }

      try {
        const enrolled = await ensureHospitalSession(user, {
          bulletin: publishedRef.current,
          marks: Object.values(seedSnapshotRef.current.marks || {}),
          notes: seedSnapshotRef.current.notes,
          cultures: seedSnapshotRef.current.cultures,
          codecinSnapshots: loadCodecinSnapshots(),
          outbreakStudies: loadLocalOutbreakStudies(),
        });

        if (cancelled) return;

        setCloudSession({
          authReady: true,
          user,
          role: enrolled.role,
          serviceArea: enrolled.serviceArea,
          displayName: enrolled.displayName,
          isRevoked: enrolled.isRevoked,
          isBootstrappedAdmin: isBootstrappedAdminUser(user),
          hasWorkspaceToken: Boolean(getWorkspaceAccessToken()),
          staffList: [],
          syncError: null,
        });

        if (!enrolled.isRevoked) {
          detachRealtime = subscribeToHospitalRealtime(user, {
            onHospitalRoleState: ({ role, isRevoked, staffList }) => {
              setCloudSession((prev) => ({
                ...prev,
                role,
                isRevoked,
                staffList,
              }));
            },
            onBulletin: (cloudBul) => {
              if (previewRef.current) return;
              publishedRef.current = cloudBul;
              setBulletin({
                ...cloudBul,
                preview: false,
                empty: cloudBul.rows.length === 0 && (cloudBul.cerrados || []).length === 0,
                loading: false,
                error: undefined,
              });
            },
            onMarks: (cloudMarks) => {
              setSharedMarks(cloudMarks);
            },
            onNotes: (cloudNotes) => {
              setNotes(cloudNotes);
              setNotesState({ loading: false, error: null });
            },
            onCultures: (cloudCultures) => {
              setCultures((prev) => {
                const localPreviewByKey = new Map<string, string>();
                prev.forEach((c) => {
                  if (c.url?.startsWith('data:')) {
                    localPreviewByKey.set(`${c.id}|${c.archivo}`, c.url);
                  }
                });
                return cloudCultures.map((c) => {
                  const cachedUrl = localPreviewByKey.get(`${c.id}|${c.archivo}`);
                  return !c.url && cachedUrl ? { ...c, url: cachedUrl } : c;
                });
              });
              setCulturesState({ loading: false, error: null });
            },
            onCodecin: (snapshots) => {
              setCloudCodecinSnapshots(snapshots);
            },
            onOutbreaks: (studies) => {
              if (Array.isArray(studies) && studies.length > 0) {
                setOutbreakStudies(studies);
                saveLocalOutbreakStudies(studies);
              }
            },
            onListenerError: (humanMessage) => {
              setCloudSession((prev) => ({ ...prev, syncError: humanMessage }));
            },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setCloudSession({
            authReady: true,
            user,
            role: isBootstrappedAdminUser(user) ? 'uveh' : 'enfermeria',
            serviceArea: '',
            displayName: user.displayName || user.email || 'Personal HAEV',
            isRevoked: false,
            isBootstrappedAdmin: isBootstrappedAdminUser(user),
            hasWorkspaceToken: Boolean(getWorkspaceAccessToken()),
            staffList: [],
            syncError: 'No se pudo completar la vinculación con el servidor en tiempo real.',
          });
          console.error(err);
        }
      }
    });

    return () => {
      cancelled = true;
      if (detachRealtime) detachRealtime();
      unsubAuth();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setSigningIn(true);
    try {
      const res = await signInHospitalUser();
      setCloudSession((prev) => ({
        ...prev,
        hasWorkspaceToken: Boolean(res.accessToken),
      }));
      showToast('Sesión hospitalaria iniciada · sincronización y Google Workspace activos');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code !== 'auth/popup-closed-by-user') {
        showToast('No se pudo iniciar sesión con Google. Verifica ventanas emergentes.');
      }
    } finally {
      setSigningIn(false);
    }
  }, [showToast]);

  const authorizeWorkspace = useCallback(async (): Promise<boolean> => {
    setAuthorizingWorkspace(true);
    try {
      const token = await authorizeWorkspaceAccess();
      setCloudSession((prev) => ({
        ...prev,
        hasWorkspaceToken: Boolean(token),
      }));
      showToast('Google Sheets y Google Drive conectados en esta sesión');
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code !== 'auth/popup-closed-by-user') {
        showToast('No se pudo autorizar Google Workspace. Verifica ventanas emergentes.');
      }
      return false;
    } finally {
      setAuthorizingWorkspace(false);
    }
  }, [showToast]);

  const signOutCloud = useCallback(async () => {
    await signOutHospitalUser();
    setLastSyncedSheetUrl(null);
    showToast('Sesión cerrada · operando en modo local');
  }, [showToast]);

  const setSavedSpreadsheetInput = useCallback((val: string) => {
    setSavedSpreadsheetInputState(val);
    setStored('uveh_gsheet_url', val);
  }, []);

  const promptWorkspaceConfirmation = useCallback(
    (request: WorkspaceConfirmRequest, onConfirmedExec?: () => Promise<void> | void) => {
      return new Promise<boolean>((resolve) => {
        workspaceConfirmActionsRef.current = {
          onConfirm: async () => {
            if (onConfirmedExec) {
              setWorkspaceConfirmBusy(true);
              try {
                await onConfirmedExec();
              } finally {
                setWorkspaceConfirmBusy(false);
              }
            }
            setWorkspaceConfirm(null);
            workspaceConfirmActionsRef.current = null;
            resolve(true);
          },
          onCancel: () => {
            setWorkspaceConfirm(null);
            workspaceConfirmActionsRef.current = null;
            resolve(false);
          },
        };
        setWorkspaceConfirm(request);
      });
    },
    []
  );

  const handleConfirmWorkspaceModal = useCallback(() => {
    void workspaceConfirmActionsRef.current?.onConfirm();
  }, []);

  const handleCancelWorkspaceModal = useCallback(() => {
    workspaceConfirmActionsRef.current?.onCancel();
  }, []);

  const updateOwnCloudProfile = useCallback(
    async (displayName: string, serviceArea: string) => {
      try {
        await updateOwnStaffProfileInCloud(displayName, serviceArea);
        setCloudSession((prev) => ({
          ...prev,
          displayName: displayName.trim() || prev.displayName,
          serviceArea: serviceArea.trim(),
        }));
        showToast('Perfil clínico actualizado');
      } catch {
        showToast('No se pudo actualizar tu perfil clínico');
      }
    },
    [showToast]
  );

  const changeStaffMemberRole = useCallback(
    async (targetUid: string, nextRole: StandaloneRole) => {
      try {
        await setStaffRoleInCloud(targetUid, nextRole);
        showToast(
          nextRole === 'uveh'
            ? 'Integrante promovido a Coordinación UVEH'
            : 'Integrante asignado a Enfermería de piso'
        );
      } catch {
        showToast('No se pudo cambiar el rol del integrante');
      }
    },
    [showToast]
  );

  const toggleStaffMemberRevocation = useCallback(
    async (targetUid: string, revoke: boolean) => {
      try {
        await toggleStaffRevocationInCloud(targetUid, revoke);
        showToast(revoke ? 'Acceso hospitalario suspendido' : 'Acceso hospitalario restaurado');
      } catch {
        showToast('No se pudo actualizar el estado de acceso');
      }
    },
    [showToast]
  );

  const syncCodecinSnapshotsToCloud = useCallback(
    async (snapshots: CodecinSnapshot[]) => {
      setCloudCodecinSnapshots(snapshots);
      if (isCloudConnected && canWrite && navigator.onLine) {
        try {
          await saveCodecinBoardInCloud(snapshots);
        } catch {
          // Local copy already persisted
        }
      }
    },
    [isCloudConnected, canWrite]
  );

  const upsertOutbreakStudy = useCallback(
    async (record: OutbreakStudyRecord) => {
      let nextList: OutbreakStudyRecord[] = [];
      setOutbreakStudies((prev) => {
        const exists = prev.some((s) => s.id === record.id);
        nextList = exists
          ? prev.map((s) => (s.id === record.id ? record : s))
          : [record, ...prev];
        saveLocalOutbreakStudies(nextList);
        return nextList;
      });
      if (isCloudConnected && canWrite && navigator.onLine) {
        try {
          await saveOutbreaksBoardInCloud(nextList);
        } catch {
          // Local copy already persisted
        }
      }
      showToast('Estudio de brote SUIVE-3 guardado');
    },
    [isCloudConnected, canWrite, showToast]
  );

  const removeOutbreakStudy = useCallback(
    async (studyId: string) => {
      let nextList: OutbreakStudyRecord[] = [];
      setOutbreakStudies((prev) => {
        nextList = prev.filter((s) => s.id !== studyId);
        saveLocalOutbreakStudies(nextList);
        return nextList;
      });
      if (isCloudConnected && canWrite && navigator.onLine) {
        try {
          await saveOutbreaksBoardInCloud(nextList);
        } catch {
          // Local copy already persisted
        }
      }
      showToast('Expediente de brote eliminado');
    },
    [isCloudConnected, canWrite, showToast]
  );

  const setStandaloneRole = useCallback(
    (role: StandaloneRole) => {
      setStandaloneRoleState(role);
      setStored('uveh_standalone_role', role);
      showToast(
        role === 'uveh'
          ? 'Vista activa: Coordinación UVEH (edición completa)'
          : 'Vista activa: Enfermería de piso (consulta y reporte)'
      );
    },
    [showToast]
  );

  const setActiveTab = useCallback((tab: QueueTabId) => {
    setActiveTabState(tab);
    setStored('uveh_tab', tab);
    if (tab === 'brotes') {
      setSection(WorkspaceSection.Outbreaks);
    } else {
      setSection(WorkspaceSection.Surveillance);
    }
  }, []);

  const setSelectedService = useCallback(
    (svc: string) => {
      setSelectedServiceState(svc);
      setSelectedSubArea('');
      setStored('uveh_svc', svc);
      showToast(svc ? `Servicio filtrado: ${svc}` : 'Mostrando todos los servicios');
    },
    [showToast]
  );

  const clearAllFilters = useCallback(() => {
    setSelectedServiceState('');
    setSelectedSubArea('');
    setSelectedProgram('');
    setSelectedDischargeReason('');
    setSearchQuery('');
    setStored('uveh_svc', '');
    showToast('Filtros y búsqueda restablecidos');
  }, [showToast]);

  const hasActiveFilters = Boolean(
    selectedService ||
      selectedSubArea ||
      selectedProgram ||
      selectedDischargeReason ||
      searchQuery.trim()
  );

  const setViewDensity = useCallback((density: ViewDensity) => {
    setViewDensityState(density);
    setStored('uveh_view_density', density);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkModeState((prev) => !prev);
  }, []);

  const applyReadBulletin = useCallback((res: ReadBulletinResponse) => {
    const editable = Boolean(res?.puedeEditar);
    setServerCanWrite(editable);
    let parsed: BulletinPayload | null = null;
    try {
      parsed = res?.data ? (JSON.parse(res.data) as BulletinPayload) : null;
    } catch {
      parsed = null;
    }

    if (parsed && Array.isArray(parsed.rows)) {
      const normalized: BulletinPayload = {
        corte: parsed.corte || null,
        nota: parsed.nota || '',
        notasEnf: parsed.notasEnf || {},
        file: parsed.file || '',
        rows: parsed.rows,
        cerrados: parsed.cerrados || [],
        abRows: parsed.abRows || [],
        publicado: parsed.publicado || null,
      };
      publishedRef.current = normalized;
      previewRef.current = false;
      setBulletin({
        ...normalized,
        preview: false,
        empty: normalized.rows.length === 0 && normalized.cerrados.length === 0,
        loading: false,
        error: undefined,
      });
    } else {
      publishedRef.current = null;
      previewRef.current = false;
      setBulletin({
        ...EMPTY_BULLETIN,
        loading: false,
        empty: true,
        error: undefined,
      });
    }
  }, []);

  const refreshNotes = useCallback(async () => {
    setNotesState({ loading: true, error: null });
    try {
      const data = await fetchNursingNotes();
      setNotes(Array.isArray(data) ? data : []);
      setNotesState({ loading: false, error: null });
    } catch (err: any) {
      const msg = String(err?.message || '');
      setNotesState({
        loading: false,
        error: msg.includes('SIN_ACCESO_NOTAS')
          ? 'Tu cuenta no tiene permiso para consultar la hoja de notas de enfermería. Solicita acceso a UVEH.'
          : 'No se pudieron cargar las notas de enfermería. Verifica tu conexión e inténtalo de nuevo.',
      });
    }
  }, []);

  const refreshCultures = useCallback(async () => {
    setCulturesState({ loading: true, error: null });
    try {
      const data = await fetchCultureAttachments();
      setCultures(Array.isArray(data) ? data : []);
      setCulturesState({ loading: false, error: null });
    } catch (err: any) {
      const msg = String(err?.message || '');
      setCulturesState({
        loading: false,
        error: msg.includes('SIN_ACCESO_CULTIVOS')
          ? 'Tu cuenta no tiene acceso al repositorio de cultivos. Solicita permisos a UVEH.'
          : 'No se pudieron cargar los cultivos adjuntos. Verifica tu conexión e inténtalo de nuevo.',
      });
    }
  }, []);

  const refreshAll = useCallback(
    async (silent = false) => {
      if (!silent) {
        setRefreshing(true);
        setNotesState((prev) => ({ ...prev, error: null }));
        setCulturesState((prev) => ({ ...prev, error: null }));
      }
      try {
        const [bulRes, marksRes, notesRes, cultRes] = await Promise.allSettled([
          fetchBulletin(),
          fetchSharedMarks(),
          fetchNursingNotes(),
          fetchCultureAttachments(),
        ]);

        if (bulRes.status === 'fulfilled') {
          if (!(previewRef.current && silent)) {
            applyReadBulletin(bulRes.value);
          }
          if (!silent) showToast('Datos sincronizados');
        } else if (!silent) {
          const errMsg = String(bulRes.reason?.message || '');
          const noAccess = errMsg.includes('SIN_ACCESO');
          setBulletin((prev) =>
            prev.rows.length > 0 && silent
              ? prev
              : {
                  ...EMPTY_BULLETIN,
                  loading: false,
                  empty: true,
                  error: noAccess
                    ? 'Tu cuenta de Google aún no tiene acceso al boletín. Solicita a UVEH compartir el archivo con tu correo.'
                    : 'No se pudo cargar el boletín. Verifica tu conexión e inténtalo de nuevo.',
                }
          );
        }

        if (marksRes.status === 'fulfilled' && Array.isArray(marksRes.value)) {
          const indexed: Record<string, SharedMark> = {};
          marksRes.value.forEach((m) => {
            if (m?.key) indexed[m.key] = m;
          });
          setSharedMarks(indexed);
        }

        if (notesRes.status === 'fulfilled' && Array.isArray(notesRes.value)) {
          setNotes(notesRes.value);
          setNotesState({ loading: false, error: null });
        } else if (notesRes.status === 'rejected') {
          const msg = String(notesRes.reason?.message || '');
          setNotesState({
            loading: false,
            error: msg.includes('SIN_ACCESO_NOTAS')
              ? 'Tu cuenta no tiene permiso para consultar la hoja de notas de enfermería.'
              : 'No se pudieron sincronizar las notas operativas.',
          });
        }

        if (cultRes.status === 'fulfilled' && Array.isArray(cultRes.value)) {
          setCultures(cultRes.value);
          setCulturesState({ loading: false, error: null });
        } else if (cultRes.status === 'rejected') {
          const msg = String(cultRes.reason?.message || '');
          setCulturesState({
            loading: false,
            error: msg.includes('SIN_ACCESO_CULTIVOS')
              ? 'Tu cuenta no tiene permiso para consultar la carpeta de cultivos.'
              : 'No se pudieron sincronizar los cultivos microbiológicos.',
          });
        }
      } finally {
        if (!silent) setRefreshing(false);
      }
    },
    [applyReadBulletin, showToast]
  );

  useEffect(() => {
    refreshAll(true);
    const interval = window.setInterval(() => {
      if (!document.hidden) refreshAll(true);
    }, 10 * 60 * 1000);
    const onVisibility = () => {
      if (!document.hidden) refreshAll(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refreshAll]);

  // Migrate local marks to shared marks if shared marks become available
  useEffect(() => {
    if (!sharedMarks || migratingRef.current || !bulletin.rows.length) return;
    const localKeys = Object.keys(localDone);
    if (!localKeys.length) return;

    const toUpload: SharedMark[] = [];
    const matchedIds: string[] = [];

    bulletin.rows.forEach((row) => {
      const localVal = localDone[row.id];
      if (!localVal) return;
      matchedIds.push(row.id);
      const existing = sharedMarks[mkDescartado(row)] || sharedMarks[mkRevisado(row)];
      if (existing) return;
      const isDesc = typeof localVal === 'object' && localVal.cls === 'sin_iaas';
      toUpload.push({
        key: isDesc ? mkDescartado(row) : mkRevisado(row),
        tipo: isDesc ? 'descartado' : 'revisado',
        activa: true,
        nombre: row.nombre || '',
        cama: row.cama || '',
        servicio: getServiceGroup(row),
      });
    });

    if (toUpload.length || matchedIds.length) {
      migratingRef.current = true;
      const finalize = () => {
        setLocalDone((prev) => {
          const next = { ...prev };
          matchedIds.forEach((id) => delete next[id]);
          setStored('uveh_done', next);
          return next;
        });
        migratingRef.current = false;
      };
      if (toUpload.length) {
        saveSharedMarks(toUpload)
          .then((updated) => {
            const indexed: Record<string, SharedMark> = {};
            updated.forEach((m) => {
              indexed[m.key] = m;
            });
            setSharedMarks(indexed);
            finalize();
          })
          .catch(() => {
            migratingRef.current = false;
          });
      } else {
        finalize();
      }
    }
  }, [sharedMarks, localDone, bulletin.rows]);

  // Effective DONE map
  const doneMap = useMemo<Record<string, DoneRecord>>(() => {
    const out: Record<string, DoneRecord> = {};
    if (sharedMarks) {
      bulletin.rows.forEach((row) => {
        const mark = sharedMarks[mkDescartado(row)] || sharedMarks[mkRevisado(row)];
        if (mark) {
          out[row.id] = {
            at: mark.fecha,
            cls: mark.tipo === 'descartado' ? 'sin_iaas' : 'revisado',
            autor: mark.autor,
            fecha: mark.fecha,
          };
        }
      });
      return out;
    }

    Object.entries(localDone).forEach(([id, val]) => {
      if (!val) return;
      if (typeof val === 'object') {
        out[id] = val;
      } else {
        out[id] = { at: val, cls: 'revisado' };
      }
    });
    return out;
  }, [sharedMarks, localDone, bulletin.rows]);

  const slices = useMemo(
    () =>
      computeSurveillanceSlices({
        rows: bulletin.rows,
        cerrados: bulletin.cerrados,
        abRows: bulletin.abRows,
        doneMap,
        selectedService,
        selectedSubArea,
        corte: bulletin.corte,
      }),
    [
      bulletin.rows,
      bulletin.cerrados,
      bulletin.abRows,
      bulletin.corte,
      doneMap,
      selectedService,
      selectedSubArea,
    ]
  );

  // All grouped patients lookup for slide-over dossier
  const allGroupsByKey = useMemo<Record<string, PatientGroup>>(() => {
    const combined = [...bulletin.rows, ...(bulletin.cerrados || [])];
    const groups = groupEventsByPatient(combined);
    const map: Record<string, PatientGroup> = {};
    groups.forEach((g) => {
      map[g.patientKey] = g;
    });
    return map;
  }, [bulletin.rows, bulletin.cerrados]);

  const inspectedPatient = useMemo<{
    group: PatientGroup;
    index: number;
    total: number;
  } | null>(() => {
    if (!inspectorCtx) return null;
    const group = allGroupsByKey[inspectorCtx.patientKey];
    if (!group) return null;
    const validKeys = inspectorCtx.orderedKeys.filter((k) => Boolean(allGroupsByKey[k]));
    const idx = validKeys.indexOf(inspectorCtx.patientKey);
    return {
      group,
      index: idx >= 0 ? idx : 0,
      total: validKeys.length || 1,
    };
  }, [inspectorCtx, allGroupsByKey]);

  const openPatientInspector = useCallback((patientKey: string, orderedKeys?: string[]) => {
    setInspectorCtx({
      patientKey,
      orderedKeys: orderedKeys && orderedKeys.length > 0 ? orderedKeys : [patientKey],
    });
  }, []);

  const closePatientInspector = useCallback(() => {
    setInspectorCtx(null);
  }, []);

  const navigateInspectedPatient = useCallback(
    (delta: -1 | 1) => {
      setInspectorCtx((prev) => {
        if (!prev) return null;
        const validKeys = prev.orderedKeys.filter((k) => Boolean(allGroupsByKey[k]));
        if (validKeys.length <= 1) return prev;
        const idx = validKeys.indexOf(prev.patientKey);
        const nextIdx = (idx + delta + validKeys.length) % validKeys.length;
        return {
          patientKey: validKeys[nextIdx],
          orderedKeys: validKeys,
        };
      });
    },
    [allGroupsByKey]
  );

  // Reset selectedService if it no longer exists in loaded rows
  useEffect(() => {
    if (
      selectedService &&
      slices.services.length > 0 &&
      !slices.services.some((s) => s.name === selectedService)
    ) {
      setSelectedServiceState('');
    }
  }, [selectedService, slices.services]);

  const notesIndex = useMemo(() => indexByPatient(notes), [notes]);
  const culturesIndex = useMemo(() => indexByPatient(cultures), [cultures]);

  // Excel file drag-and-drop & picker
  const loadExcelFile = useCallback(
    async (file: File) => {
      if (!canWrite) return;
      setParsingExcel(true);
      try {
        const buffer = await file.arrayBuffer();
        const parsed = parseRadarArrayBuffer(buffer);
        previewRef.current = true;
        setBulletin((prev) => ({
          ...parsed,
          file: file.name,
          notasEnf: prev.notasEnf || {},
          publicado: null,
          preview: true,
          empty: parsed.rows.length === 0 && parsed.cerrados.length === 0,
          loading: false,
          error: undefined,
        }));
        setSection(WorkspaceSection.Surveillance);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast(`Vista previa lista: ${parsed.rows.length} eventos leídos`);
      } catch (err: any) {
        showToast(
          `No se pudo leer el archivo Excel: ${err?.message || 'verifica la hoja RADAR ACTIVO'}`
        );
      } finally {
        setParsingExcel(false);
      }
    },
    [canWrite, showToast]
  );

  useEffect(() => {
    let dragCounter = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!canWrite) return;
      if (!e.dataTransfer?.types?.includes('Files')) return;
      e.preventDefault();
      dragCounter += 1;
      setIsDraggingFile(true);
    };
    const onDragLeave = () => {
      dragCounter -= 1;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDraggingFile(false);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (!canWrite) return;
      e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!canWrite) return;
      e.preventDefault();
      dragCounter = 0;
      setIsDraggingFile(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        loadExcelFile(file);
      } else {
        showToast('Selecciona un archivo Excel válido (.xlsx o .xls)');
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [canWrite, loadExcelFile, showToast]);

  const publishPreview = useCallback(
    async (overrideNotasEnf?: Record<string, string>) => {
      setPublishing(true);
      try {
        const payload: BulletinPayload = {
          corte: bulletin.corte,
          nota: bulletin.nota,
          notasEnf: overrideNotasEnf ?? bulletin.notasEnf,
          file: bulletin.file,
          rows: bulletin.rows,
          cerrados: bulletin.cerrados || [],
          abRows: bulletin.abRows || [],
          publicado: new Date().toISOString(),
        };
        const res = await saveBulletin(payload);
        if (isCloudConnected && canWrite && navigator.onLine) {
          await publishBulletinToCloud(payload);
        }
        applyReadBulletin(res);
        showToast('Corte publicado y sincronizado para todo el hospital');
      } catch (err: any) {
        showToast(`Error al publicar: ${err?.message || 'intenta de nuevo'}`);
      } finally {
        setPublishing(false);
      }
    },
    [bulletin, isCloudConnected, canWrite, applyReadBulletin, showToast]
  );

  const cancelPreview = useCallback(() => {
    const pub = publishedRef.current;
    previewRef.current = false;
    if (pub) {
      setBulletin({
        ...pub,
        preview: false,
        empty: pub.rows.length === 0 && pub.cerrados.length === 0,
        loading: false,
      });
    } else {
      setBulletin({ ...EMPTY_BULLETIN, loading: false });
    }
    showToast('Vista previa descartada');
  }, [showToast]);

  const markEvent = useCallback(
    async (row: RadarEvent, tipo: 'revisado' | 'descartado') => {
      if (markingIds[row.id]) return;
      setMarkingIds((prev) => ({ ...prev, [row.id]: true }));
      const key = tipo === 'descartado' ? mkDescartado(row) : mkRevisado(row);
      try {
        if (sharedMarks) {
          const optimistic: SharedMark = {
            key,
            tipo,
            activa: true,
            autor: 'tú',
            fecha: new Date().toISOString(),
            nombre: row.nombre || '',
            cama: row.cama || '',
            servicio: getServiceGroup(row),
          };
          setSharedMarks((prev) => ({ ...(prev || {}), [key]: optimistic }));
          if (!navigator.onLine) {
            setOfflineQueue(
              enqueueOfflineAction({
                kind: 'mark',
                label: `${tipo === 'descartado' ? 'Descartado' : 'Revisado'}: ${row.nombre || ''}`,
                marks: [optimistic],
              })
            );
            showToast('Guardado sin señal · se sincronizará al recuperar red');
          } else {
            showToast(
              tipo === 'descartado' ? 'Caso marcado como descartado' : 'Paciente marcado como revisado'
            );
            try {
              const updated = isCloudConnected
                ? await upsertMarksInCloud([optimistic])
                : await saveSharedMarks([optimistic]);
              if (isCloudConnected) {
                void saveSharedMarks([optimistic]).catch(() => undefined);
              }
              const indexed: Record<string, SharedMark> = {};
              updated.forEach((m) => {
                indexed[m.key] = m;
              });
              setSharedMarks(indexed);
            } catch (err: any) {
              const noAccess = String(err?.message || '').includes('SIN_ACCESO_NOTAS');
              if (noAccess) {
                showToast('Sin permiso en la hoja de marcas compartidas. Solicita acceso a UVEH.');
              } else {
                setOfflineQueue(
                  enqueueOfflineAction({
                    kind: 'mark',
                    label: `${tipo === 'descartado' ? 'Descartado' : 'Revisado'}: ${row.nombre || ''}`,
                    marks: [optimistic],
                  })
                );
                showToast('Guardado en cola local para reintentar sincronización');
              }
            }
          }
        } else {
          setLocalDone((prev) => {
            const next = {
              ...prev,
              [row.id]:
                tipo === 'descartado'
                  ? { at: bulletin.corte || true, cls: 'sin_iaas' as const }
                  : { at: bulletin.corte || true, cls: 'revisado' as const },
            };
            setStored('uveh_done', next);
            return next;
          });
          showToast(
            tipo === 'descartado' ? 'Caso marcado como descartado' : 'Paciente marcado como revisado'
          );
        }
      } finally {
        setMarkingIds((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }
    },
    [markingIds, sharedMarks, isCloudConnected, bulletin.corte, showToast]
  );

  const unmarkEvent = useCallback(
    async (row: RadarEvent) => {
      if (markingIds[row.id]) return;
      setMarkingIds((prev) => ({ ...prev, [row.id]: true }));
      try {
        if (sharedMarks) {
          const keysToClear = [mkDescartado(row), mkRevisado(row)].filter((k) => sharedMarks[k]);
          setSharedMarks((prev) => {
            const next = { ...(prev || {}) };
            keysToClear.forEach((k) => delete next[k]);
            return next;
          });
          showToast('Regresado a pendientes por revisar');
          if (keysToClear.length) {
            const payload: SharedMark[] = keysToClear.map((k) => ({
              key: k,
              tipo: k.startsWith('d|') ? 'descartado' : 'revisado',
              activa: false,
              nombre: row.nombre || '',
              cama: row.cama || '',
              servicio: getServiceGroup(row),
            }));
            if (!navigator.onLine) {
              setOfflineQueue(
                enqueueOfflineAction({
                  kind: 'mark',
                  label: `Deshacer marca: ${row.nombre || ''}`,
                  marks: payload,
                })
              );
            } else {
              try {
                const updated = isCloudConnected
                  ? await upsertMarksInCloud(payload)
                  : await saveSharedMarks(payload);
                if (isCloudConnected) {
                  void saveSharedMarks(payload).catch(() => undefined);
                }
                const indexed: Record<string, SharedMark> = {};
                updated.forEach((m) => {
                  indexed[m.key] = m;
                });
                setSharedMarks(indexed);
              } catch {
                setOfflineQueue(
                  enqueueOfflineAction({
                    kind: 'mark',
                    label: `Deshacer marca: ${row.nombre || ''}`,
                    marks: payload,
                  })
                );
              }
            }
          }
        } else {
          setLocalDone((prev) => {
            const next = { ...prev };
            delete next[row.id];
            setStored('uveh_done', next);
            return next;
          });
          showToast('Regresado a pendientes por revisar');
        }
      } finally {
        setMarkingIds((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      }
    },
    [markingIds, sharedMarks, isCloudConnected, showToast]
  );

  const saveCriteria = useCallback(
    async (row: RadarEvent, detalle: CriteriaEvaluation) => {
      if (!detalle.cat || !detalle.cumple) {
        showToast('Selecciona el tipo de IAAS y el dictamen preliminar');
        return false;
      }
      if (!sharedMarks) {
        showToast('Se requiere acceso a la hoja compartida para guardar criterios');
        return false;
      }
      const key = mkCriterios(row);
      const item: SharedMark = {
        key,
        tipo: 'criterios',
        activa: true,
        autor: 'tú',
        fecha: new Date().toISOString(),
        nombre: row.nombre || '',
        cama: row.cama || '',
        servicio: getServiceGroup(row),
        detalle,
      };
      setSharedMarks((prev) => ({ ...(prev || {}), [key]: item }));
      if (!navigator.onLine) {
        setOfflineQueue(
          enqueueOfflineAction({
            kind: 'mark',
            label: `Criterios UVEH: ${row.nombre || ''}`,
            marks: [item],
          })
        );
        showToast('Criterios guardados sin señal · pendientes de sincronizar');
        return true;
      }
      showToast('Criterios UVEH guardados');
      try {
        const updated = isCloudConnected
          ? await upsertMarksInCloud([item])
          : await saveSharedMarks([item]);
        if (isCloudConnected) {
          void saveSharedMarks([item]).catch(() => undefined);
        }
        const indexed: Record<string, SharedMark> = {};
        updated.forEach((m) => {
          indexed[m.key] = m;
        });
        setSharedMarks(indexed);
      } catch {
        setOfflineQueue(
          enqueueOfflineAction({
            kind: 'mark',
            label: `Criterios UVEH: ${row.nombre || ''}`,
            marks: [item],
          })
        );
        showToast('Criterios guardados en cola local para sincronizar');
      }
      return true;
    },
    [sharedMarks, isCloudConnected, showToast]
  );

  const submitNursingChangeNote = useCallback(
    async (patientRow: RadarEvent, texto: string) => {
      const clean = texto.trim();
      if (!clean) {
        showToast('Escribe la nota antes de enviar');
        return false;
      }
      const noteInput = {
        id: getPatientKey(patientRow),
        nombre: patientRow.nombre || '',
        cama: patientRow.cama || '',
        servicio: getServiceGroup(patientRow),
        texto: clean,
      };
      if (!navigator.onLine) {
        const localNote: NursingNote = {
          fila: Date.now(),
          ...noteInput,
          autor: 'enfermeria (sin señal)',
          fecha: new Date().toISOString(),
          aplicada: false,
          puede: true,
        };
        setNotes((prev) => [localNote, ...prev]);
        setOfflineQueue(
          enqueueOfflineAction({
            kind: 'note',
            label: `Nota de piso: ${noteInput.nombre}`,
            noteInput,
          })
        );
        showToast('Nota guardada sin señal · se enviará al recuperar conexión');
        return true;
      }
      try {
        const updated = isCloudConnected
          ? await saveNotesBoardInCloud((curr, authorLabel) => {
              const nextFila = curr.reduce((max, n) => Math.max(max, n.fila || 0), 1) + 1;
              const created: NursingNote = {
                fila: nextFila,
                ...noteInput,
                autor: authorLabel,
                fecha: new Date().toISOString(),
                aplicada: false,
                puede: true,
              };
              return [created, ...curr];
            })
          : await createNursingNote(noteInput);
        if (isCloudConnected) {
          void createNursingNote(noteInput).catch(() => undefined);
        }
        setNotes(updated);
        setNotesState({ loading: false, error: null });
        showToast('Nota enviada a UVEH');
        return true;
      } catch (err: any) {
        const noAccess = String(err?.message || '').includes('SIN_ACCESO_NOTAS');
        showToast(
          noAccess
            ? 'Tu cuenta no tiene permiso en la hoja de notas. Solicita acceso a UVEH.'
            : 'No se pudo enviar la nota.'
        );
        return false;
      }
    },
    [isCloudConnected, showToast]
  );

  const createDirectNursingNote = useCallback(
    async (input: {
      patientId?: string;
      nombre: string;
      cama: string;
      servicio: string;
      texto: string;
    }) => {
      const cleanText = input.texto.trim();
      const cleanName = input.nombre.trim();
      if (!cleanName || !cleanText) {
        showToast('Indica el paciente y el contenido de la nota');
        return false;
      }
      const noteInput = {
        id: input.patientId || `n:${normName(cleanName)}`,
        nombre: cleanName,
        cama: input.cama.trim() || 's/c',
        servicio: input.servicio.trim() || 'Sin servicio',
        texto: cleanText,
      };
      if (!navigator.onLine) {
        const localNote: NursingNote = {
          fila: Date.now(),
          ...noteInput,
          autor: 'enfermeria (sin señal)',
          fecha: new Date().toISOString(),
          aplicada: false,
          puede: true,
        };
        setNotes((prev) => [localNote, ...prev]);
        setOfflineQueue(
          enqueueOfflineAction({
            kind: 'note',
            label: `Nota operativa: ${cleanName}`,
            noteInput,
          })
        );
        showToast('Nota registrada sin señal · en cola de sincronización');
        return true;
      }
      try {
        const updated = isCloudConnected
          ? await saveNotesBoardInCloud((curr, authorLabel) => {
              const nextFila = curr.reduce((max, n) => Math.max(max, n.fila || 0), 1) + 1;
              const created: NursingNote = {
                fila: nextFila,
                ...noteInput,
                autor: authorLabel,
                fecha: new Date().toISOString(),
                aplicada: false,
                puede: true,
              };
              return [created, ...curr];
            })
          : await createNursingNote(noteInput);
        if (isCloudConnected) {
          void createNursingNote(noteInput).catch(() => undefined);
        }
        setNotes(updated);
        setNotesState({ loading: false, error: null });
        showToast('Nota operativa registrada');
        return true;
      } catch (err: any) {
        const noAccess = String(err?.message || '').includes('SIN_ACCESO_NOTAS');
        showToast(
          noAccess
            ? 'Sin permiso en la hoja de notas. Solicita acceso a UVEH.'
            : 'No se pudo guardar la nota.'
        );
        return false;
      }
    },
    [isCloudConnected, showToast]
  );

  const editNursingChangeNote = useCallback(
    async (fila: number, texto: string) => {
      const clean = texto.trim();
      if (!clean) {
        showToast('La nota no puede quedar vacía');
        return false;
      }
      try {
        const updated = isCloudConnected
          ? await saveNotesBoardInCloud((curr) =>
              curr.map((n) =>
                n.fila === fila ? { ...n, texto: clean, fecha: new Date().toISOString() } : n
              )
            )
          : await updateNursingNote(fila, clean);
        if (isCloudConnected) {
          void updateNursingNote(fila, clean).catch(() => undefined);
        }
        setNotes(updated);
        showToast('Nota actualizada');
        return true;
      } catch (err: any) {
        showToast(`No se pudo actualizar: ${err?.message || 'intenta de nuevo'}`);
        return false;
      }
    },
    [isCloudConnected, showToast]
  );

  const removeNursingChangeNote = useCallback(
    async (fila: number) => {
      try {
        const updated = isCloudConnected
          ? await saveNotesBoardInCloud((curr) => curr.filter((n) => n.fila !== fila))
          : await deleteNursingNote(fila);
        if (isCloudConnected) {
          void deleteNursingNote(fila).catch(() => undefined);
        }
        setNotes(updated);
        showToast('Nota eliminada');
        return true;
      } catch (err: any) {
        showToast(`No se pudo eliminar: ${err?.message || 'intenta de nuevo'}`);
        return false;
      }
    },
    [isCloudConnected, showToast]
  );

  const applyNursingChangeNote = useCallback(
    async (fila: number) => {
      try {
        const updated = isCloudConnected
          ? await saveNotesBoardInCloud((curr) =>
              curr.map((n) => (n.fila === fila ? { ...n, aplicada: true } : n))
            )
          : await markNursingNoteApplied(fila);
        if (isCloudConnected) {
          void markNursingNoteApplied(fila).catch(() => undefined);
        }
        setNotes(updated);
        showToast('Nota marcada como aplicada al Excel');
        return true;
      } catch (err: any) {
        showToast(`No se pudo marcar: ${err?.message || 'intenta de nuevo'}`);
        return false;
      }
    },
    [isCloudConnected, showToast]
  );

  const importFromGoogleSheet = useCallback(
    async (spreadsheetInput: string): Promise<boolean> => {
      if (!canWrite) return false;
      const accessToken = getWorkspaceAccessToken();
      if (!accessToken) {
        setCloudSession((prev) => ({ ...prev, hasWorkspaceToken: false }));
        showToast('Autoriza Google Sheets primero para leer el documento');
        return false;
      }

      setWorkspaceBusyAction('import');
      try {
        const res = await importBulletinFromGoogleSheet(spreadsheetInput, accessToken);
        setLastSyncedSheetUrl(res.spreadsheetUrl);
        previewRef.current = true;
        setBulletin((prev) => ({
          ...res.parsed,
          file: `Google Sheets: ${res.spreadsheetTitle}`,
          notasEnf: prev.notasEnf || {},
          publicado: null,
          preview: true,
          empty: res.parsed.rows.length === 0 && res.parsed.cerrados.length === 0,
          loading: false,
          error: undefined,
        }));
        setSection(WorkspaceSection.Surveillance);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast(
          `Vista previa lista desde Google Sheets: ${res.parsed.rows.length} eventos leídos`
        );
        return true;
      } catch (err: any) {
        const msg = String(err?.message || 'verifica el enlace de Google Sheets');
        if (msg.includes('401')) {
          setCloudSession((prev) => ({ ...prev, hasWorkspaceToken: false }));
        }
        showToast(`Error al importar Google Sheet: ${msg}`);
        return false;
      } finally {
        setWorkspaceBusyAction(null);
      }
    },
    [canWrite, showToast]
  );

  const requestSyncNotesToGoogleSheet = useCallback(
    (spreadsheetInput: string, onlyPending: boolean) => {
      const accessToken = getWorkspaceAccessToken();
      if (!accessToken) {
        setCloudSession((prev) => ({ ...prev, hasWorkspaceToken: false }));
        showToast('Autoriza Google Sheets primero');
        return;
      }

      const targetNotes = onlyPending ? notes.filter((n) => !n.aplicada) : notes;
      if (targetNotes.length === 0) {
        showToast('No hay notas para sincronizar con el filtro seleccionado');
        return;
      }

      void promptWorkspaceConfirmation(
        {
          title: `¿Registrar ${targetNotes.length} nota${
            targetNotes.length === 1 ? '' : 's'
          } en Google Sheets?`,
          description: `Se agregarán las notas operativas seleccionadas en la pestaña "${UVEH_NOTES_SHEET_TITLE}" del documento vinculado (las notas previamente exportadas se omitirán automáticamente).`,
          targetLabel: `Google Sheets · Pestaña ${UVEH_NOTES_SHEET_TITLE}`,
          itemsPreview: targetNotes.slice(0, 6).map(
            (n) =>
              `${n.nombre || 'Paciente'} (Cama ${n.cama || 's/c'}): ${n.texto.slice(0, 56)}`
          ),
          confirmLabel: 'Confirmar y escribir en Sheets',
        },
        async () => {
          setWorkspaceBusyAction('sync-notes');
          try {
            const res = await syncNotesToGoogleSheet({
              spreadsheetIdOrUrl: spreadsheetInput,
              notes: targetNotes,
              corte: bulletin.corte,
              accessToken,
            });
            setLastSyncedSheetUrl(res.spreadsheetUrl);
            showToast(
              res.appendedCount > 0
                ? `${res.appendedCount} nota${res.appendedCount === 1 ? '' : 's'} registrada${
                    res.appendedCount === 1 ? '' : 's'
                  } en "${res.spreadsheetTitle}"`
                : `Las notas ya estaban registradas en "${res.spreadsheetTitle}"`
            );
          } catch (err: any) {
            showToast(err?.message || 'No se pudieron sincronizar las notas a Google Sheets');
          } finally {
            setWorkspaceBusyAction(null);
          }
        }
      );
    },
    [notes, bulletin.corte, promptWorkspaceConfirmation, showToast]
  );

  const requestExportNewGoogleSheet = useCallback(() => {
    const accessToken = getWorkspaceAccessToken();
    if (!accessToken) {
      setCloudSession((prev) => ({ ...prev, hasWorkspaceToken: false }));
      showToast('Autoriza Google Sheets primero');
      return;
    }

    const corteLabel = bulletin.corte || todayISO();
    const targetTitle = `RADAR UVEH HAEV — Corte ${corteLabel}`;

    void promptWorkspaceConfirmation(
      {
        title: '¿Crear nueva hoja de respaldo en Google Sheets?',
        description:
          'Se creará un archivo nuevo en tu cuenta de Google con el corte epidemiológico activo, casos cerrados, antibiogramas y notas operativas de piso.',
        targetLabel: targetTitle,
        itemsPreview: [
          `RADAR ACTIVO: ${bulletin.rows.length} eventos`,
          `HISTORIAL - CERRADOS: ${(bulletin.cerrados || []).length} casos`,
          `ANTIBIOGRAMAS: ${(bulletin.abRows || []).length} registros`,
          `${UVEH_NOTES_SHEET_TITLE}: ${notes.length} notas operativas`,
        ],
        confirmLabel: 'Confirmar creación en Sheets',
      },
      async () => {
        setWorkspaceBusyAction('export-new');
        try {
          const res = await exportBulletinToNewGoogleSheet({
            bulletin: {
              corte: bulletin.corte,
              nota: bulletin.nota,
              notasEnf: bulletin.notasEnf,
              file: bulletin.file,
              rows: bulletin.rows,
              cerrados: bulletin.cerrados || [],
              abRows: bulletin.abRows || [],
              publicado: bulletin.publicado,
            },
            notes,
            accessToken,
          });
          setLastSyncedSheetUrl(res.spreadsheetUrl);
          setSavedSpreadsheetInput(res.spreadsheetUrl);
          showToast(`Respaldo creado en Google Sheets: ${res.spreadsheetTitle}`);
        } catch (err: any) {
          showToast(err?.message || 'No se pudo exportar la hoja de respaldo');
        } finally {
          setWorkspaceBusyAction(null);
        }
      }
    );
  }, [bulletin, notes, promptWorkspaceConfirmation, setSavedSpreadsheetInput, showToast]);

  const syncBatchCulturesToCloud = useCallback(
    async (added: CultureAttachment[]) => {
      if (!isCloudConnected || !navigator.onLine || added.length === 0) return;
      try {
        await saveCulturesBoardInCloud((curr, authorLabel) => [
          ...added.map((item) => ({ ...item, autor: authorLabel })),
          ...curr,
        ]);
      } catch {
        // Local attachments already updated
      }
    },
    [isCloudConnected]
  );

  const uploadSingleCultureFile = useCallback(
    async (patientRow: RadarEvent, file: File) => {
      if (file.size > 15 * 1024 * 1024) {
        showToast('El archivo supera el límite de 15 MB');
        return false;
      }

      const activeDriveToken = getWorkspaceAccessToken();
      let confirmedDriveUpload = false;
      if (activeDriveToken && navigator.onLine) {
        confirmedDriveUpload = await promptWorkspaceConfirmation({
          title: '¿Subir reporte microbiológico a Google Drive?',
          description: `El archivo "${file.name}" se guardará en tu carpeta institucional de Google Drive para que el equipo hospitalario pueda abrirlo desde cualquier servicio.`,
          targetLabel: `Google Drive / ${UVEH_DRIVE_FOLDER_NAME}`,
          itemsPreview: [
            `${file.name} · ${patientRow.nombre || 'Paciente'} (Cama ${
              patientRow.cama || 's/c'
            })`,
          ],
          confirmLabel: 'Subir a Google Drive',
          cancelLabel: 'Solo guardar local',
        });
      }

      return new Promise<boolean>((resolve) => {
        const reader = new FileReader();
        reader.onload = async (ev) => {
          try {
            const base64 = String(ev.target?.result || '').split(',')[1] || '';
            const patientKey = getPatientKey(patientRow);
            const patientName = patientRow.nombre || '';
            const cama = patientRow.cama || '';
            const servicio = getServiceGroup(patientRow);

            let updated = await uploadCultureAttachment({
              id: patientKey,
              nombre: patientName,
              cama,
              servicio,
              filename: file.name,
              mimeType: file.type || 'application/octet-stream',
              base64,
            });

            if (confirmedDriveUpload && activeDriveToken) {
              try {
                const driveRes = await uploadCultureFileToDrive({
                  fileOrBytes: file,
                  filename: file.name,
                  mimeType: file.type || 'application/pdf',
                  patientName,
                  cama,
                  servicio,
                  accessToken: activeDriveToken,
                });
                updated = updated.map((att, idx) =>
                  idx === 0 ? { ...att, url: driveRes.webViewLink } : att
                );
              } catch (driveErr: any) {
                showToast(
                  `Guardado local (error en Google Drive: ${
                    driveErr?.message || 'verifica permisos'
                  })`
                );
              }
            }

            if (isCloudConnected && navigator.onLine && updated[0]) {
              const latest = updated[0];
              void saveCulturesBoardInCloud((curr, authorLabel) => [
                { ...latest, autor: authorLabel },
                ...curr,
              ]).catch(() => undefined);
            }
            setCultures(updated);
            setCulturesState({ loading: false, error: null });
            if (!confirmedDriveUpload) {
              showToast('Cultivo adjuntado al expediente operativo');
            } else {
              showToast('Cultivo guardado en Google Drive y vinculado al expediente');
            }
            resolve(true);
          } catch (err: any) {
            const noAccess = String(err?.message || '').includes('SIN_ACCESO_CULTIVOS');
            showToast(
              noAccess
                ? 'Sin permiso para subir cultivos. Solicita acceso a la carpeta de UVEH.'
                : 'No se pudo adjuntar el archivo.'
            );
            resolve(false);
          }
        };
        reader.onerror = () => {
          showToast('No se pudo leer el archivo seleccionado');
          resolve(false);
        };
        reader.readAsDataURL(file);
      });
    },
    [isCloudConnected, promptWorkspaceConfirmation, showToast]
  );

  const openSmartCultureModal = useCallback(
    (patient: RadarEvent | null = null, file: File | null = null) => {
      setSmartCultureModal({ open: true, patient, file });
    },
    []
  );

  const closeSmartCultureModal = useCallback(() => {
    setSmartCultureModal({ open: false, patient: null, file: null });
  }, []);

  const integrateExtractedCulture = useCallback(
    async (payload: SmartCultureIntegrationPayload) => {
      try {
        const { base64, mimeType } = await fileToBase64(payload.file);
        const { report } = payload;

        const activeDriveToken = getWorkspaceAccessToken();
        let confirmedDriveUpload = false;
        if (activeDriveToken && navigator.onLine) {
          confirmedDriveUpload = await promptWorkspaceConfirmation({
            title: '¿Alojar el cultivo leído en Google Drive?',
            description: `Además de integrar el antibiograma, el archivo "${payload.file.name}" se guardará en tu carpeta institucional de Google Drive para consulta multiusuario.`,
            targetLabel: `Google Drive / ${UVEH_DRIVE_FOLDER_NAME}`,
            itemsPreview: [
              `${payload.file.name} · ${payload.nombre} (${
                report.microorganismo || 'Cultivo microbiológico'
              })`,
            ],
            confirmLabel: 'Confirmar en Google Drive',
            cancelLabel: 'Solo integrar local',
          });
        }

        let updatedCultures = await uploadCultureAttachment({
          id: payload.patientKey,
          nombre: payload.nombre,
          cama: payload.cama,
          servicio: payload.servicio,
          filename: payload.file.name,
          mimeType,
          base64,
          microorganismo: report.microorganismo || undefined,
          muestra: report.muestra || undefined,
        });

        if (confirmedDriveUpload && activeDriveToken) {
          try {
            const driveRes = await uploadCultureFileToDrive({
              fileOrBytes: payload.file,
              filename: payload.file.name,
              mimeType,
              patientName: payload.nombre,
              cama: payload.cama,
              servicio: payload.servicio,
              accessToken: activeDriveToken,
            });
            updatedCultures = updatedCultures.map((att, idx) =>
              idx === 0 ? { ...att, url: driveRes.webViewLink } : att
            );
          } catch {
            // Keep local copy if Drive upload fails
          }
        }

        if (isCloudConnected && navigator.onLine && updatedCultures[0]) {
          const latest = updatedCultures[0];
          void saveCulturesBoardInCloud((curr, authorLabel) => [
            { ...latest, autor: authorLabel },
            ...curr,
          ]).catch(() => undefined);
        }
        setCultures(updatedCultures);
        setCulturesState({ loading: false, error: null });

        if (payload.updateActiveRadar) {
          const atbTextLines = report.antibiograma.map(
            (a) =>
              `${a.antimicrobiano}${a.cmi ? ` ${a.cmi}` : ''} ${a.interpretacion}`
          );
          const atbText = atbTextLines.join('\n');
          const reportDate = report.fechaReporte || todayISO();

          const newAbEntries: AntibiogramEntry[] = report.antibiograma
            .filter((a) => a.antimicrobiano.trim())
            .map((a) => ({
              pac: payload.nombre,
              mic: report.microorganismo || undefined,
              cod:
                (a.codigo || a.antimicrobiano.slice(0, 3))
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, '') || 'ATB',
              cat:
                a.interpretacion === 'Resistente'
                  ? 'R'
                  : a.interpretacion === 'Intermedio'
                    ? 'I'
                    : 'S',
              fecha: reportDate,
              folio: report.folio || `OCR-${Date.now()}`,
            }));

          const nextRows = bulletin.rows.map((r) => {
            if (getPatientKey(r) !== payload.patientKey) return r;
            return {
              ...r,
              micro: report.microorganismo || r.micro,
              muestra: report.muestra || r.muestra,
              fres: reportDate || r.fres,
              res:
                report.recuento ||
                report.fenotipoResistencia ||
                r.res ||
                'Cultivo positivo',
              atb: atbText || r.atb,
            };
          });

          const nextAbRows = [...(bulletin.abRows || []), ...newAbEntries];

          if (bulletin.preview || (isCloudConnected && !canWrite)) {
            setBulletin((prev) => ({
              ...prev,
              rows: nextRows,
              abRows: nextAbRows,
            }));
          } else {
            const savePayload: BulletinPayload = {
              corte: bulletin.corte,
              nota: bulletin.nota,
              notasEnf: bulletin.notasEnf,
              file: bulletin.file,
              rows: nextRows,
              cerrados: bulletin.cerrados || [],
              abRows: nextAbRows,
              publicado: bulletin.publicado || new Date().toISOString(),
            };
            const res = await saveBulletin(savePayload);
            if (isCloudConnected && canWrite && navigator.onLine) {
              await publishBulletinToCloud(savePayload);
            }
            applyReadBulletin(res);
          }

          showToast(
            confirmedDriveUpload
              ? 'Cultivo guardado en Google Drive y antibiograma integrado al radar'
              : 'Cultivo y antibiograma integrados al radar epidemiológico'
          );
        } else {
          showToast(
            confirmedDriveUpload
              ? 'Reporte de cultivo guardado en Google Drive'
              : 'Reporte de cultivo guardado en el repositorio'
          );
        }
        return true;
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'No se pudo integrar el cultivo extraído.';
        showToast(msg);
        return false;
      }
    },
    [bulletin, isCloudConnected, canWrite, applyReadBulletin, promptWorkspaceConfirmation, showToast]
  );

  const flushOfflineQueue = useCallback(async () => {
    const queue = readOfflineQueue();
    if (!queue.length || !navigator.onLine || flushingOffline) return;
    setFlushingOffline(true);
    let syncedCount = 0;

    try {
      for (const item of queue) {
        try {
          if (item.kind === 'mark' && item.marks?.length) {
            const updated = isCloudConnected
              ? await upsertMarksInCloud(item.marks)
              : await saveSharedMarks(item.marks);
            if (isCloudConnected) {
              void saveSharedMarks(item.marks).catch(() => undefined);
            }
            const indexed: Record<string, SharedMark> = {};
            updated.forEach((m) => {
              indexed[m.key] = m;
            });
            setSharedMarks(indexed);
          } else if (item.kind === 'note' && item.noteInput) {
            const noteIn = item.noteInput;
            const updatedNotes = isCloudConnected
              ? await saveNotesBoardInCloud((curr, authorLabel) => {
                  const nextFila = curr.reduce((max, n) => Math.max(max, n.fila || 0), 1) + 1;
                  return [
                    {
                      fila: nextFila,
                      ...noteIn,
                      autor: authorLabel,
                      fecha: new Date().toISOString(),
                      aplicada: false,
                      puede: true,
                    },
                    ...curr,
                  ];
                })
              : await createNursingNote(noteIn);
            if (isCloudConnected) {
              void createNursingNote(noteIn).catch(() => undefined);
            }
            setNotes(updatedNotes);
          }
          setOfflineQueue(removeOfflineAction(item.id));
          syncedCount += 1;
        } catch {
          // Keep failed item in queue for next retry
        }
      }
      if (syncedCount > 0) {
        showToast(
          `${syncedCount} cambio${syncedCount === 1 ? '' : 's'} sincronizado${
            syncedCount === 1 ? '' : 's'
          } tras recuperar señal`
        );
      }
    } finally {
      setFlushingOffline(false);
    }
  }, [flushingOffline, isCloudConnected, showToast]);

  useEffect(() => {
    if (isOnline && offlineQueue.length > 0 && !flushingOffline) {
      void flushOfflineQueue();
    }
  }, [isOnline, offlineQueue.length, flushingOffline, flushOfflineQueue]);

  const handleResetDemo = useCallback(async () => {
    if (!isStandaloneDemo) return;
    resetStandaloneDataset();
    setLocalDone({});
    setStored('uveh_done', {});
    setInspectorCtx(null);
    await refreshAll(false);
    showToast('Datos hospitalarios de demostración restablecidos');
  }, [isStandaloneDemo, refreshAll, showToast]);

  const pendingNotesCount = useMemo(
    () => notes.filter((n) => !n.aplicada).length,
    [notes]
  );

  return {
    bulletin,
    canWrite,
    standaloneRole,
    setStandaloneRole,
    sharedMarks,
    doneMap,
    markingIds,
    notes,
    notesState,
    refreshNotes,
    notesIndex,
    pendingNotesCount,
    cultures,
    culturesState,
    refreshCultures,
    culturesIndex,
    setCultures,
    slices,
    section,
    setSection,
    activeTab,
    setActiveTab,
    selectedService,
    setSelectedService,
    selectedSubArea,
    setSelectedSubArea,
    selectedProgram,
    setSelectedProgram,
    selectedDischargeReason,
    setSelectedDischargeReason,
    outbreakAtbFilter,
    setOutbreakAtbFilter,
    searchQuery,
    setSearchQuery,
    hasActiveFilters,
    clearAllFilters,
    viewDensity,
    setViewDensity,
    darkMode,
    toggleDarkMode,
    refreshing,
    publishing,
    parsingExcel,
    isDraggingFile,
    toastMessage,
    showToast,
    inspectedPatient,
    openPatientInspector,
    closePatientInspector,
    navigateInspectedPatient,
    viewingCulture,
    setViewingCulture,
    smartCultureModal,
    openSmartCultureModal,
    closeSmartCultureModal,
    integrateExtractedCulture,
    isOnline,
    offlineQueueCount: offlineQueue.length,
    flushingOffline,
    flushOfflineQueue,
    refreshAll,
    loadExcelFile,
    publishPreview,
    cancelPreview,
    markEvent,
    unmarkEvent,
    saveCriteria,
    submitNursingChangeNote,
    createDirectNursingNote,
    editNursingChangeNote,
    removeNursingChangeNote,
    applyNursingChangeNote,
    uploadSingleCultureFile,
    handleResetDemo,
    isStandaloneDemo,
    cloudSession,
    isCloudConnected,
    signingIn,
    authorizingWorkspace,
    teamModalOpen,
    setTeamModalOpen,
    googleSheetsModalOpen,
    setGoogleSheetsModalOpen,
    savedSpreadsheetInput,
    setSavedSpreadsheetInput,
    lastSyncedSheetUrl,
    workspaceBusyAction,
    workspaceAccessToken: cloudSession.hasWorkspaceToken ? getWorkspaceAccessToken() : null,
    workspaceConfirm,
    workspaceConfirmBusy,
    handleConfirmWorkspaceModal,
    handleCancelWorkspaceModal,
    importFromGoogleSheet,
    requestSyncNotesToGoogleSheet,
    requestExportNewGoogleSheet,
    syncBatchCulturesToCloud,
    signInWithGoogle,
    authorizeWorkspace,
    signOutCloud,
    updateOwnCloudProfile,
    changeStaffMemberRole,
    toggleStaffMemberRevocation,
    cloudCodecinSnapshots,
    syncCodecinSnapshotsToCloud,
    outbreakStudies,
    upsertOutbreakStudy,
    removeOutbreakStudy,
  };
}
