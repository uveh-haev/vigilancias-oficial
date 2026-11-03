import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FolderSync,
  LogOut,
  ShieldCheck,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { CloudSessionState } from '../../services/firebaseService';
import { StandaloneRole } from '../../types/clinical';
import { GoogleSignInButton } from './GoogleSignInButton';

interface TeamAccessModalProps {
  open: boolean;
  cloudSession: CloudSessionState;
  signingIn: boolean;
  authorizingWorkspace: boolean;
  onClose: () => void;
  onSignIn: () => Promise<void>;
  onAuthorizeWorkspace: () => Promise<boolean>;
  onSignOut: () => Promise<void>;
  onUpdateOwnProfile: (displayName: string, serviceArea: string) => Promise<void>;
  onChangeStaffRole: (targetUid: string, nextRole: StandaloneRole) => Promise<void>;
  onToggleStaffRevocation: (targetUid: string, revoke: boolean) => Promise<void>;
}

export function TeamAccessModal({
  open,
  cloudSession,
  signingIn,
  authorizingWorkspace,
  onClose,
  onSignIn,
  onAuthorizeWorkspace,
  onSignOut,
  onUpdateOwnProfile,
  onChangeStaffRole,
  onToggleStaffRevocation,
}: TeamAccessModalProps) {
  const [nameDraft, setNameDraft] = useState(cloudSession.displayName);
  const [serviceDraft, setServiceDraft] = useState(cloudSession.serviceArea);
  const [savingProfile, setSavingProfile] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    setNameDraft(cloudSession.displayName);
    setServiceDraft(cloudSession.serviceArea);
  }, [cloudSession.displayName, cloudSession.serviceArea, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isCoordinator = cloudSession.user != null && cloudSession.role === 'uveh';

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await onUpdateOwnProfile(nameDraft, serviceDraft);
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-access-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" />
            <h2
              id="team-access-title"
              className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
            >
              Sincronización hospitalaria y Google Workspace
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {!cloudSession.user ? (
            <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Conecta tu sesión institucional para trabajar en tiempo real
                </h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Al iniciar sesión con Google, las marcas de revisión, criterios NOM-045, notas de
                  piso, cultivos en Google Drive, cortes de Google Sheets e informes CODECIN se
                  sincronizan al instante entre UVEH y los servicios clínicos del HAEV.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <GoogleSignInButton
                  onClick={() => void onSignIn()}
                  loading={signingIn}
                  label="Iniciar sesión con Google"
                />
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Sin sesión activa, la app opera en modo local en este dispositivo.
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* Active Session Card */}
              <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {cloudSession.displayName}
                    </span>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-md border ${
                        cloudSession.isRevoked
                          ? 'border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
                          : cloudSession.role === 'uveh'
                            ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                            : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {cloudSession.isRevoked
                        ? 'Acceso suspendido'
                        : cloudSession.role === 'uveh'
                          ? 'Coordinación UVEH'
                          : 'Enfermería de piso'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 truncate">
                    {cloudSession.user.email} · Sincronización multiusuario activa
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void onSignOut()}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 self-start sm:self-center shrink-0 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Cerrar sesión</span>
                </button>
              </div>

              {/* Google Workspace (Sheets + Drive) Token Status */}
              {!cloudSession.isRevoked && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {cloudSession.hasWorkspaceToken ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <FolderSync className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                    )}
                    <div className="text-xs">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        {cloudSession.hasWorkspaceToken
                          ? 'Google Sheets y Google Drive conectados en esta sesión'
                          : 'Permiso de Google Sheets y Google Drive pendiente de renovar'}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                        {cloudSession.hasWorkspaceToken
                          ? 'Puedes importar cortes desde Sheets, respaldar notas y alojar PDFs de cultivos en tu carpeta RADAR UVEH de Drive.'
                          : 'Por seguridad el acceso a Workspace se conserva solo en memoria. Autorízalo cuando desees subir cultivos a Drive o leer Google Sheets.'}
                      </p>
                    </div>
                  </div>
                  {!cloudSession.hasWorkspaceToken && (
                    <div className="shrink-0">
                      <GoogleSignInButton
                        onClick={() => void onAuthorizeWorkspace()}
                        loading={authorizingWorkspace}
                        label="Conectar Sheets y Drive"
                      />
                    </div>
                  )}
                </div>
              )}

              {cloudSession.syncError && (
                <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-300">
                  {cloudSession.syncError}
                </div>
              )}

              {/* Own Clinical Profile Form */}
              {!cloudSession.isRevoked && (
                <form
                  onSubmit={handleSaveProfile}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Nombre visible en notas y revisiones
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      required
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Servicio o piso asignado
                    </label>
                    <input
                      type="text"
                      maxLength={80}
                      value={serviceDraft}
                      onChange={(e) => setServiceDraft(e.target.value)}
                      placeholder="Ej. UCIA, Medicina Interna, Pediatría"
                      className="w-full min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 transition-colors disabled:opacity-60 whitespace-nowrap"
                  >
                    {savingProfile ? 'Guardando…' : 'Guardar perfil'}
                  </button>
                </form>
              )}

              {/* Coordinator Staff & RBAC Directory */}
              {isCoordinator && (
                <div className="flex flex-col gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        Personal registrado en el hospital ({cloudSession.staffList.length})
                      </h3>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      Control de acceso UVEH
                    </span>
                  </div>

                  {cloudSession.staffList.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                      Aún no se han conectado otros integrantes del equipo.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      {cloudSession.staffList.map((member) => {
                        const isSelf = member.uid === cloudSession.user?.uid;
                        const isBusy = busyUid === member.uid;
                        return (
                          <div
                            key={member.uid}
                            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#111726]"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                  {member.displayName}
                                  {isSelf ? ' (tú)' : ''}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {member.serviceArea || 'Hospitalización'} ·{' '}
                                {member.revoked
                                  ? 'Acceso revocado'
                                  : member.role === 'uveh'
                                    ? 'Coordinación UVEH'
                                    : 'Enfermería de piso'}
                              </p>
                            </div>

                            {!isSelf && (
                              <div className="flex items-center gap-2 shrink-0">
                                {!member.revoked && (
                                  <select
                                    aria-label={`Rol de ${member.displayName}`}
                                    disabled={isBusy}
                                    value={member.role}
                                    onChange={async (e) => {
                                      const nextRole = e.target.value as StandaloneRole;
                                      setBusyUid(member.uid);
                                      try {
                                        await onChangeStaffRole(member.uid, nextRole);
                                      } finally {
                                        setBusyUid(null);
                                      }
                                    }}
                                    className="min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
                                  >
                                    <option value="enfermeria">Enfermería de piso</option>
                                    <option value="uveh">Coordinación UVEH</option>
                                  </select>
                                )}

                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={async () => {
                                    setBusyUid(member.uid);
                                    try {
                                      await onToggleStaffRevocation(member.uid, !member.revoked);
                                    } finally {
                                      setBusyUid(null);
                                    }
                                  }}
                                  className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors ${
                                    member.revoked
                                      ? 'border-teal-300 dark:border-teal-700 text-teal-800 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30'
                                      : 'border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                                  }`}
                                >
                                  {member.revoked ? 'Restaurar' : 'Suspender'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
