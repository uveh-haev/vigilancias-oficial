import { initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Unsubscribe,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  BulletinPayload,
  CodecinSnapshot,
  CultureAttachment,
  NursingNote,
  OutbreakStudyRecord,
  SharedMark,
  StandaloneRole,
} from '../types/clinical';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

const HOSPITAL_ID = 'haev';
const BOOTSTRAPPED_ADMIN_EMAILS = ['zoraah@gmail.com', 'uvehaev@gmail.com'];

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

// Strictly in-memory OAuth access token cache (never stored in localStorage/sessionStorage)
let isSigningInFlow = false;
let cachedWorkspaceAccessToken: string | null = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export interface StaffDirectoryEntry {
  uid: string;
  displayName: string;
  role: StandaloneRole;
  serviceArea: string;
  revoked?: boolean;
}

export interface CloudSessionState {
  authReady: boolean;
  user: User | null;
  role: StandaloneRole;
  serviceArea: string;
  displayName: string;
  isRevoked: boolean;
  isBootstrappedAdmin: boolean;
  hasWorkspaceToken: boolean;
  staffList: StaffDirectoryEntry[];
  syncError: string | null;
}

function truncate(val: string | null | undefined, max: number): string {
  const clean = String(val ?? '').trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function sanitizeId(raw: string): string {
  const cleaned = String(raw || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || 'user_unknown';
}

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    });
    return out as T;
  }
  return value;
}

export function isBootstrappedAdminUser(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      BOOTSTRAPPED_ADMIN_EMAILS.includes(user.email.toLowerCase())
  );
}

function createGoogleWorkspaceProvider(forceConsent = false): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters(
    forceConsent
      ? { prompt: 'consent select_account' }
      : { prompt: 'select_account' }
  );
  return provider;
}

export function getWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export async function signInHospitalUser(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    isSigningInFlow = true;
    const provider = createGoogleWorkspaceProvider(false);
    const cred = await signInWithPopup(auth, provider);
    const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
    cachedWorkspaceAccessToken = oauthCred?.accessToken || null;
    return { user: cred.user, accessToken: cachedWorkspaceAccessToken };
  } finally {
    isSigningInFlow = false;
  }
}

export async function authorizeWorkspaceAccess(): Promise<string> {
  try {
    isSigningInFlow = true;
    const provider = createGoogleWorkspaceProvider(true);
    const cred = await signInWithPopup(auth, provider);
    const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
    if (!oauthCred?.accessToken) {
      throw new Error('No se recibió autorización de Google Workspace.');
    }
    cachedWorkspaceAccessToken = oauthCred.accessToken;
    return cachedWorkspaceAccessToken;
  } finally {
    isSigningInFlow = false;
  }
}

export async function signOutHospitalUser(): Promise<void> {
  cachedWorkspaceAccessToken = null;
  await signOut(auth);
}

export function observeAuthUser(callback: (user: User | null) => void): Unsubscribe {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedWorkspaceAccessToken = null;
    } else if (!cachedWorkspaceAccessToken && !isSigningInFlow) {
      cachedWorkspaceAccessToken = null;
    }
    callback(user);
  });
}

export interface InitialCloudSeed {
  bulletin: BulletinPayload | null;
  marks: SharedMark[];
  notes: NursingNote[];
  cultures: CultureAttachment[];
  codecinSnapshots: CodecinSnapshot[];
  outbreakStudies?: OutbreakStudyRecord[];
}

export async function ensureHospitalSession(
  user: User,
  seed?: InitialCloudSeed
): Promise<{
  role: StandaloneRole;
  serviceArea: string;
  displayName: string;
  isRevoked: boolean;
}> {
  const uid = sanitizeId(user.uid);
  const adminEmail = isBootstrappedAdminUser(user);
  const fallbackName =
    truncate(user.displayName || user.email?.split('@')[0] || 'Personal HAEV', 120) ||
    'Personal HAEV';

  // 1. Ensure /users/{uid}
  const userPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);
  let role: StandaloneRole = adminEmail ? 'uveh' : 'enfermeria';
  let serviceArea = adminEmail ? 'Coordinación UVEH' : 'Hospitalización';
  let displayName = fallbackName;
  let isRevoked = false;

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        uid,
        displayName,
        role,
        serviceArea,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = snap.data();
      displayName = truncate(data.displayName || fallbackName, 120) || fallbackName;
      serviceArea = truncate(data.serviceArea || serviceArea, 80);
      isRevoked = data.status === 'revoked' && !adminEmail;
      role = adminEmail ? 'uveh' : data.role === 'uveh' ? 'uveh' : 'enfermeria';

      if (adminEmail && (data.role !== 'uveh' || data.status !== 'active')) {
        await updateDoc(userRef, {
          role: 'uveh',
          status: 'active',
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }

  // 2. Ensure isolated PII contact doc /users/{uid}/private/contact
  if (user.email) {
    const contactPath = `users/${uid}/private/contact`;
    const contactRef = doc(db, 'users', uid, 'private', 'contact');
    try {
      const cSnap = await getDoc(contactRef);
      if (!cSnap.exists()) {
        await setDoc(contactRef, {
          uid,
          email: truncate(user.email, 254),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, contactPath);
    }
  }

  // 3. Ensure Master Gate /hospitals/haev enrollment
  const hospPath = `hospitals/${HOSPITAL_ID}`;
  const hospRef = doc(db, 'hospitals', HOSPITAL_ID);
  try {
    const hSnap = await getDoc(hospRef);
    if (!hSnap.exists()) {
      await setDoc(hospRef, {
        hospitalId: HOSPITAL_ID,
        name: 'Hospital Regional de Alta Especialidad de Veracruz',
        createdByUid: uid,
        updatedByUid: uid,
        coordinatorUids: adminEmail ? [uid] : [],
        memberUids: [uid],
        revokedUids: [],
        staffDirectory: {
          [uid]: {
            displayName,
            role,
            serviceArea,
          },
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const hData = hSnap.data();
      const memberUids: string[] = Array.isArray(hData.memberUids) ? hData.memberUids : [];
      const coordinatorUids: string[] = Array.isArray(hData.coordinatorUids)
        ? hData.coordinatorUids
        : [];
      const revokedUids: string[] = Array.isArray(hData.revokedUids) ? hData.revokedUids : [];
      const staffDirectory: Record<string, { displayName: string; role: StandaloneRole; serviceArea: string }> =
        hData.staffDirectory && typeof hData.staffDirectory === 'object'
          ? { ...(hData.staffDirectory as Record<string, { displayName: string; role: StandaloneRole; serviceArea: string }>) }
          : {};

      if (revokedUids.includes(uid) && !adminEmail) {
        return { role: 'enfermeria', serviceArea, displayName, isRevoked: true };
      }

      if (adminEmail) {
        role = 'uveh';
        const nextMembers = memberUids.includes(uid) ? memberUids : [...memberUids, uid].slice(0, 200);
        const nextCoords = coordinatorUids.includes(uid)
          ? coordinatorUids
          : [...coordinatorUids, uid].slice(0, 25);
        const nextRevoked = revokedUids.filter((id) => id !== uid);
        const needsUpdate =
          !memberUids.includes(uid) ||
          !coordinatorUids.includes(uid) ||
          revokedUids.includes(uid) ||
          !staffDirectory[uid] ||
          staffDirectory[uid].role !== 'uveh';
        if (needsUpdate) {
          staffDirectory[uid] = { displayName, role: 'uveh', serviceArea };
          await updateDoc(hospRef, {
            memberUids: nextMembers,
            coordinatorUids: nextCoords,
            revokedUids: nextRevoked,
            staffDirectory,
            updatedByUid: uid,
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        role = coordinatorUids.includes(uid) ? 'uveh' : 'enfermeria';
        if (!memberUids.includes(uid) && memberUids.length < 200) {
          staffDirectory[uid] = { displayName, role, serviceArea };
          await updateDoc(hospRef, {
            memberUids: [...memberUids, uid],
            staffDirectory,
            updatedByUid: uid,
            updatedAt: serverTimestamp(),
          });
        }
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, hospPath);
  }

  // 4. Seed initial boards / active bulletin if coordinator logs into an empty workspace
  if (!isRevoked && seed) {
    await seedWorkspaceIfEmpty(uid, role === 'uveh' || adminEmail, seed);
  }

  return { role, serviceArea, displayName, isRevoked };
}

async function seedWorkspaceIfEmpty(
  uid: string,
  isCoordinator: boolean,
  seed: InitialCloudSeed
): Promise<void> {
  if (isCoordinator && seed.bulletin && seed.bulletin.rows.length > 0) {
    const bulPath = `hospitals/${HOSPITAL_ID}/bulletins/active`;
    const bulRef = doc(db, 'hospitals', HOSPITAL_ID, 'bulletins', 'active');
    try {
      const bSnap = await getDoc(bulRef);
      if (!bSnap.exists()) {
        await setDoc(
          bulRef,
          stripUndefinedDeep({
            bulletinId: 'active',
            hospitalId: HOSPITAL_ID,
            corte: truncate(seed.bulletin.corte || '', 40),
            nota: truncate(seed.bulletin.nota || '', 2000),
            file: truncate(seed.bulletin.file || '', 240),
            publicadoIso: truncate(seed.bulletin.publicado || new Date().toISOString(), 64),
            notasEnf: seed.bulletin.notasEnf || {},
            rows: (seed.bulletin.rows || []).slice(0, 500),
            cerrados: (seed.bulletin.cerrados || []).slice(0, 300),
            abRows: (seed.bulletin.abRows || []).slice(0, 1000),
            state: 'published',
            createdByUid: uid,
            updatedByUid: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, bulPath);
    }
  }

  const boardsToSeed: Array<{
    boardId: 'marks' | 'notes' | 'cultures' | 'codecin' | 'outbreaks';
    items: unknown[];
    requiresCoord: boolean;
  }> = [
    { boardId: 'marks', items: seed.marks, requiresCoord: false },
    { boardId: 'notes', items: seed.notes, requiresCoord: false },
    {
      boardId: 'cultures',
      items: seed.cultures.map((c) => ({
        ...c,
        url: c.url?.startsWith('data:') ? '' : c.url,
      })),
      requiresCoord: false,
    },
    { boardId: 'codecin', items: seed.codecinSnapshots, requiresCoord: true },
    { boardId: 'outbreaks', items: seed.outbreakStudies || [], requiresCoord: true },
  ];

  for (const b of boardsToSeed) {
    if (b.requiresCoord && !isCoordinator) continue;
    const bPath = `hospitals/${HOSPITAL_ID}/boards/${b.boardId}`;
    const bRef = doc(db, 'hospitals', HOSPITAL_ID, 'boards', b.boardId);
    try {
      const snap = await getDoc(bRef);
      if (!snap.exists()) {
        await setDoc(
          bRef,
          stripUndefinedDeep({
            boardId: b.boardId,
            hospitalId: HOSPITAL_ID,
            items: b.items.slice(0, 500),
            createdByUid: uid,
            updatedByUid: uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, bPath);
    }
  }
}

export interface RealtimeListenersCallbacks {
  onHospitalRoleState: (info: {
    role: StandaloneRole;
    isRevoked: boolean;
    staffList: StaffDirectoryEntry[];
  }) => void;
  onBulletin: (payload: BulletinPayload) => void;
  onMarks: (marks: Record<string, SharedMark>) => void;
  onNotes: (notes: NursingNote[]) => void;
  onCultures: (cultures: CultureAttachment[]) => void;
  onCodecin: (snapshots: CodecinSnapshot[]) => void;
  onOutbreaks?: (studies: OutbreakStudyRecord[]) => void;
  onListenerError?: (humanMessage: string) => void;
}

export function subscribeToHospitalRealtime(
  user: User,
  callbacks: RealtimeListenersCallbacks
): Unsubscribe {
  const uid = sanitizeId(user.uid);
  const adminEmail = isBootstrappedAdminUser(user);
  const unsubs: Unsubscribe[] = [];

  const handleListenerFailure = (err: unknown, path: string) => {
    try {
      handleFirestoreError(err, OperationType.GET, path);
    } catch (formatted) {
      const msg = formatted instanceof Error ? formatted.message : String(formatted);
      if (msg.includes('Quota exceeded')) {
        callbacks.onListenerError?.(
          'Se alcanzó la cuota diaria gratuita de lecturas en Firestore. Se restablecerá mañana.'
        );
      } else {
        callbacks.onListenerError?.('Permisos actualizados o sesión sin acceso al tablero.');
      }
    }
  };

  // 1. Hospital Master Gate listener
  const hospPath = `hospitals/${HOSPITAL_ID}`;
  unsubs.push(
    onSnapshot(
      doc(db, 'hospitals', HOSPITAL_ID),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const coordinatorUids: string[] = Array.isArray(data.coordinatorUids)
          ? data.coordinatorUids
          : [];
        const memberUids: string[] = Array.isArray(data.memberUids) ? data.memberUids : [];
        const revokedUids: string[] = Array.isArray(data.revokedUids) ? data.revokedUids : [];
        const dir =
          data.staffDirectory && typeof data.staffDirectory === 'object'
            ? (data.staffDirectory as Record<
                string,
                { displayName?: string; role?: string; serviceArea?: string }
              >)
            : {};

        const isRevoked =
          !adminEmail && (revokedUids.includes(uid) || !memberUids.includes(uid));
        const role: StandaloneRole =
          adminEmail || coordinatorUids.includes(uid) ? 'uveh' : 'enfermeria';

        const allKnownUids = Array.from(new Set([...memberUids, ...revokedUids]));
        const staffList: StaffDirectoryEntry[] = allKnownUids.map((staffUid) => {
          const entry = dir[staffUid] || {};
          const entryRole: StandaloneRole = coordinatorUids.includes(staffUid)
            ? 'uveh'
            : entry.role === 'uveh'
              ? 'uveh'
              : 'enfermeria';
          return {
            uid: staffUid,
            displayName: entry.displayName || staffUid.slice(0, 10),
            role: entryRole,
            serviceArea: entry.serviceArea || 'Hospitalización',
            revoked: revokedUids.includes(staffUid),
          };
        });

        callbacks.onHospitalRoleState({ role, isRevoked, staffList });
      },
      (err) => handleListenerFailure(err, hospPath)
    )
  );

  // 2. Active Bulletin listener
  const bulPath = `hospitals/${HOSPITAL_ID}/bulletins/active`;
  unsubs.push(
    onSnapshot(
      doc(db, 'hospitals', HOSPITAL_ID, 'bulletins', 'active'),
      (snap) => {
        if (!snap.exists()) return;
        const d = snap.data();
        callbacks.onBulletin({
          corte: d.corte || null,
          nota: d.nota || '',
          notasEnf: (d.notasEnf as Record<string, string>) || {},
          file: d.file || '',
          rows: Array.isArray(d.rows) ? d.rows : [],
          cerrados: Array.isArray(d.cerrados) ? d.cerrados : [],
          abRows: Array.isArray(d.abRows) ? d.abRows : [],
          publicado: d.publicadoIso || null,
        });
      },
      (err) => handleListenerFailure(err, bulPath)
    )
  );

  // 3. Marks board listener
  const marksPath = `hospitals/${HOSPITAL_ID}/boards/marks`;
  unsubs.push(
    onSnapshot(
      doc(db, 'hospitals', HOSPITAL_ID, 'boards', 'marks'),
      (snap) => {
        if (!snap.exists()) return;
        const items: SharedMark[] = Array.isArray(snap.data().items) ? snap.data().items : [];
        const indexed: Record<string, SharedMark> = {};
        items.forEach((m) => {
          if (m?.key && m.activa !== false) indexed[m.key] = m;
        });
        callbacks.onMarks(indexed);
      },
      (err) => handleListenerFailure(err, marksPath)
    )
  );

  // 4. Notes board listener
  const notesPath = `hospitals/${HOSPITAL_ID}/boards/notes`;
  unsubs.push(
    onSnapshot(
      doc(db, 'hospitals', HOSPITAL_ID, 'boards', 'notes'),
      (snap) => {
        if (!snap.exists()) return;
        const items: NursingNote[] = Array.isArray(snap.data().items) ? snap.data().items : [];
        callbacks.onNotes(items);
      },
      (err) => handleListenerFailure(err, notesPath)
    )
  );

  // 5. Cultures board listener
  const culturesPath = `hospitals/${HOSPITAL_ID}/boards/cultures`;
  unsubs.push(
    onSnapshot(
      doc(db, 'hospitals', HOSPITAL_ID, 'boards', 'cultures'),
      (snap) => {
        if (!snap.exists()) return;
        const items: CultureAttachment[] = Array.isArray(snap.data().items)
          ? snap.data().items
          : [];
        callbacks.onCultures(items);
      },
      (err) => handleListenerFailure(err, culturesPath)
    )
  );

  // 6. CODECIN snapshots board listener
  const codecinPath = `hospitals/${HOSPITAL_ID}/boards/codecin`;
  unsubs.push(
    onSnapshot(
      doc(db, 'hospitals', HOSPITAL_ID, 'boards', 'codecin'),
      (snap) => {
        if (!snap.exists()) return;
        const items: CodecinSnapshot[] = Array.isArray(snap.data().items)
          ? snap.data().items
          : [];
        callbacks.onCodecin(items);
      },
      (err) => handleListenerFailure(err, codecinPath)
    )
  );

  // 7. Outbreak SUIVE-3 studies board listener
  const outbreaksPath = `hospitals/${HOSPITAL_ID}/boards/outbreaks`;
  unsubs.push(
    onSnapshot(
      doc(db, 'hospitals', HOSPITAL_ID, 'boards', 'outbreaks'),
      (snap) => {
        if (!snap.exists()) return;
        const items: OutbreakStudyRecord[] = Array.isArray(snap.data().items)
          ? snap.data().items
          : [];
        callbacks.onOutbreaks?.(items);
      },
      (err) => handleListenerFailure(err, outbreaksPath)
    )
  );

  return () => {
    unsubs.forEach((u) => u());
  };
}

export async function publishBulletinToCloud(payload: BulletinPayload): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión no iniciada');
  const uid = sanitizeId(user.uid);
  const bulPath = `hospitals/${HOSPITAL_ID}/bulletins/active`;
  const bulRef = doc(db, 'hospitals', HOSPITAL_ID, 'bulletins', 'active');

  try {
    const snap = await getDoc(bulRef);
    const cleanBody = stripUndefinedDeep({
      corte: truncate(payload.corte || '', 40),
      nota: truncate(payload.nota || '', 2000),
      file: truncate(payload.file || '', 240),
      publicadoIso: truncate(payload.publicado || new Date().toISOString(), 64),
      notasEnf: payload.notasEnf || {},
      rows: (payload.rows || []).slice(0, 500),
      cerrados: (payload.cerrados || []).slice(0, 300),
      abRows: (payload.abRows || []).slice(0, 1000),
      state: 'published',
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });

    if (!snap.exists()) {
      await setDoc(bulRef, {
        bulletinId: 'active',
        hospitalId: HOSPITAL_ID,
        ...cleanBody,
        createdByUid: uid,
        createdAt: serverTimestamp(),
      });
    } else {
      await updateDoc(bulRef, cleanBody);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, bulPath);
  }
}

async function writeBoardItemsAtomic<T>(
  boardId: 'marks' | 'notes' | 'cultures' | 'codecin' | 'outbreaks',
  mutator: (current: T[]) => T[]
): Promise<T[]> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión no iniciada');
  const uid = sanitizeId(user.uid);
  const bPath = `hospitals/${HOSPITAL_ID}/boards/${boardId}`;
  const bRef = doc(db, 'hospitals', HOSPITAL_ID, 'boards', boardId);

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(bRef);
      const existingItems: T[] =
        snap.exists() && Array.isArray(snap.data().items) ? (snap.data().items as T[]) : [];
      const nextItems = stripUndefinedDeep(mutator(existingItems)).slice(0, 500);

      if (!snap.exists()) {
        tx.set(bRef, {
          boardId,
          hospitalId: HOSPITAL_ID,
          items: nextItems,
          createdByUid: uid,
          updatedByUid: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        tx.update(bRef, {
          items: nextItems,
          updatedByUid: uid,
          updatedAt: serverTimestamp(),
        });
      }
      return nextItems;
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, bPath);
  }
}

export async function upsertMarksInCloud(marksToApply: SharedMark[]): Promise<SharedMark[]> {
  const authorLabel =
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'personal';
  return writeBoardItemsAtomic<SharedMark>('marks', (current) => {
    const map = new Map<string, SharedMark>();
    current.forEach((m) => {
      if (m?.key && m.activa !== false) map.set(m.key, m);
    });
    marksToApply.forEach((m) => {
      if (!m?.key) return;
      if (m.activa === false) {
        map.delete(m.key);
      } else {
        map.set(m.key, {
          ...m,
          autor: truncate(authorLabel, 80),
          fecha: new Date().toISOString(),
        });
      }
    });
    return Array.from(map.values());
  });
}

export async function saveNotesBoardInCloud(
  mutator: (current: NursingNote[], authorLabel: string) => NursingNote[]
): Promise<NursingNote[]> {
  const authorLabel =
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'enfermeria';
  return writeBoardItemsAtomic<NursingNote>('notes', (current) =>
    mutator(current, truncate(authorLabel, 80))
  );
}

export async function saveCulturesBoardInCloud(
  mutator: (current: CultureAttachment[], authorLabel: string) => CultureAttachment[]
): Promise<CultureAttachment[]> {
  const authorLabel =
    auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0] || 'personal';
  return writeBoardItemsAtomic<CultureAttachment>('cultures', (current) =>
    mutator(current, truncate(authorLabel, 80)).map((c) => ({
      ...c,
      url: c.url?.startsWith('data:') ? '' : c.url,
    }))
  );
}

export async function saveCodecinBoardInCloud(
  snapshots: CodecinSnapshot[]
): Promise<CodecinSnapshot[]> {
  return writeBoardItemsAtomic<CodecinSnapshot>('codecin', () => snapshots.slice(0, 120));
}

export async function saveOutbreaksBoardInCloud(
  studies: OutbreakStudyRecord[]
): Promise<OutbreakStudyRecord[]> {
  return writeBoardItemsAtomic<OutbreakStudyRecord>('outbreaks', () => studies.slice(0, 100));
}

export async function updateOwnStaffProfileInCloud(
  displayName: string,
  serviceArea: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión no iniciada');
  const uid = sanitizeId(user.uid);
  const cleanName = truncate(displayName, 120) || 'Personal HAEV';
  const cleanService = truncate(serviceArea, 80);

  const userPath = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: cleanName,
      serviceArea: cleanService,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userPath);
  }

  const hospPath = `hospitals/${HOSPITAL_ID}`;
  const hospRef = doc(db, 'hospitals', HOSPITAL_ID);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(hospRef);
      if (!snap.exists()) return;
      const dir = { ...(snap.data().staffDirectory || {}) };
      const existingEntry = dir[uid] || {};
      dir[uid] = {
        displayName: cleanName,
        role: existingEntry.role || 'enfermeria',
        serviceArea: cleanService,
      };
      tx.update(hospRef, {
        staffDirectory: dir,
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, hospPath);
  }
}

export async function setStaffRoleInCloud(
  targetUid: string,
  nextRole: StandaloneRole
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión no iniciada');
  const callerUid = sanitizeId(user.uid);
  const cleanTarget = sanitizeId(targetUid);

  const targetUserPath = `users/${cleanTarget}`;
  try {
    const tRef = doc(db, 'users', cleanTarget);
    const tSnap = await getDoc(tRef);
    if (tSnap.exists()) {
      await updateDoc(tRef, {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, targetUserPath);
  }

  const hospPath = `hospitals/${HOSPITAL_ID}`;
  const hospRef = doc(db, 'hospitals', HOSPITAL_ID);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(hospRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const coords: string[] = Array.isArray(data.coordinatorUids)
        ? [...data.coordinatorUids]
        : [];
      const dir = { ...(data.staffDirectory || {}) };

      const nextCoords =
        nextRole === 'uveh'
          ? Array.from(new Set([...coords, cleanTarget])).slice(0, 25)
          : coords.filter((id) => id !== cleanTarget);

      dir[cleanTarget] = {
        displayName: dir[cleanTarget]?.displayName || cleanTarget.slice(0, 10),
        serviceArea: dir[cleanTarget]?.serviceArea || 'Hospitalización',
        role: nextRole,
      };

      tx.update(hospRef, {
        coordinatorUids: nextCoords,
        staffDirectory: dir,
        updatedByUid: callerUid,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, hospPath);
  }
}

export async function toggleStaffRevocationInCloud(
  targetUid: string,
  revoke: boolean
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión no iniciada');
  const callerUid = sanitizeId(user.uid);
  const cleanTarget = sanitizeId(targetUid);

  const targetUserPath = `users/${cleanTarget}`;
  try {
    const tRef = doc(db, 'users', cleanTarget);
    const tSnap = await getDoc(tRef);
    if (tSnap.exists()) {
      await updateDoc(tRef, {
        status: revoke ? 'revoked' : 'active',
        ...(revoke ? { role: 'enfermeria' } : {}),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, targetUserPath);
  }

  const hospPath = `hospitals/${HOSPITAL_ID}`;
  const hospRef = doc(db, 'hospitals', HOSPITAL_ID);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(hospRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const members: string[] = Array.isArray(data.memberUids) ? [...data.memberUids] : [];
      const coords: string[] = Array.isArray(data.coordinatorUids)
        ? [...data.coordinatorUids]
        : [];
      const revoked: string[] = Array.isArray(data.revokedUids) ? [...data.revokedUids] : [];

      const nextMembers = revoke
        ? members.filter((id) => id !== cleanTarget)
        : Array.from(new Set([...members, cleanTarget])).slice(0, 200);
      const nextCoords = revoke ? coords.filter((id) => id !== cleanTarget) : coords;
      const nextRevoked = revoke
        ? Array.from(new Set([...revoked, cleanTarget])).slice(0, 200)
        : revoked.filter((id) => id !== cleanTarget);

      tx.update(hospRef, {
        memberUids: nextMembers.length > 0 ? nextMembers : [callerUid],
        coordinatorUids: nextCoords,
        revokedUids: nextRevoked,
        updatedByUid: callerUid,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, hospPath);
  }
}
