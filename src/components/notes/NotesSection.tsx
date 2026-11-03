import { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { AsyncResourceState, NursingNote, RadarEvent } from '../../types/clinical';
import { formatDateTimeShort, normName } from '../../domain/dates';
import { getPatientKey, getServiceGroup } from '../../domain/services';
import { VoiceDictationButton } from './VoiceDictationButton';

interface NotesSectionProps {
  notes: NursingNote[];
  notesState: AsyncResourceState;
  rows: RadarEvent[];
  canWrite: boolean;
  searchQuery: string;
  lastSyncedSheetUrl?: string | null;
  onClearSearch: () => void;
  onRetry: () => void;
  onOpenGoogleSheets?: () => void;
  onCreateNote: (input: {
    patientId?: string;
    nombre: string;
    cama: string;
    servicio: string;
    texto: string;
  }) => Promise<boolean>;
  onEdit: (fila: number, texto: string) => Promise<boolean>;
  onDelete: (fila: number) => Promise<boolean>;
  onMarkApplied: (fila: number) => Promise<boolean>;
}

export function NotesSection({
  notes,
  notesState,
  rows,
  canWrite,
  searchQuery,
  lastSyncedSheetUrl = null,
  onClearSearch,
  onRetry,
  onOpenGoogleSheets,
  onCreateNote,
  onEdit,
  onDelete,
  onMarkApplied,
}: NotesSectionProps) {
  const [filterMode, setFilterMode] = useState<'pending' | 'applied' | 'all'>('pending');
  const [editingFila, setEditingFila] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<string>('');
  const [confirmDeleteFila, setConfirmDeleteFila] = useState<number | null>(null);
  const [busyFila, setBusyFila] = useState<number | null>(null);

  // Direct Note Composer State
  const [composerOpen, setComposerOpen] = useState(false);
  const [selectedCensusKey, setSelectedCensusKey] = useState<string>('');
  const [manualNombre, setManualNombre] = useState('');
  const [manualCama, setManualCama] = useState('');
  const [manualServicio, setManualServicio] = useState('');
  const [newNoteText, setNewNoteText] = useState('');
  const [submittingNew, setSubmittingNew] = useState(false);

  const censusOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ key: string; nombre: string; cama: string; servicio: string }> = [];
    rows.forEach((r) => {
      const k = getPatientKey(r);
      if (seen.has(k) || !r.nombre) return;
      seen.add(k);
      list.push({
        key: k,
        nombre: r.nombre,
        cama: String(r.cama || 's/c'),
        servicio: getServiceGroup(r),
      });
    });
    return list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [rows]);

  const q = normName(searchQuery);
  const filtered = notes.filter((n) => {
    if (filterMode === 'pending' && n.aplicada) return false;
    if (filterMode === 'applied' && !n.aplicada) return false;
    if (!q) return true;
    return normName([n.nombre, n.cama, n.servicio, n.texto, n.autor].join(' ')).includes(q);
  });

  const pendingCount = notes.filter((n) => !n.aplicada).length;
  const appliedCount = notes.filter((n) => n.aplicada).length;

  const handleSelectPatient = (val: string) => {
    setSelectedCensusKey(val);
    if (val && val !== '_manual') {
      const found = censusOptions.find((o) => o.key === val);
      if (found) {
        setManualNombre(found.nombre);
        setManualCama(found.cama);
        setManualServicio(found.servicio);
      }
    } else if (val === '_manual') {
      setManualNombre('');
      setManualCama('');
      setManualServicio('');
    }
  };

  const handleCreateSubmit = async () => {
    setSubmittingNew(true);
    const ok = await onCreateNote({
      patientId:
        selectedCensusKey && selectedCensusKey !== '_manual' ? selectedCensusKey : undefined,
      nombre: manualNombre,
      cama: manualCama,
      servicio: manualServicio,
      texto: newNoteText,
    });
    setSubmittingNew(false);
    if (ok) {
      setComposerOpen(false);
      setSelectedCensusKey('');
      setManualNombre('');
      setManualCama('');
      setManualServicio('');
      setNewNoteText('');
      setFilterMode('pending');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Notas operativas de enfermería
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Cambios clínicos reportados desde piso (retiro de catéteres, toma de muestras, altas o
            resultados preliminares) para actualizar el archivo RADAR del siguiente corte.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {canWrite && onOpenGoogleSheets && (
            <button
              type="button"
              onClick={onOpenGoogleSheets}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Enviar a Google Sheets</span>
            </button>
          )}

          {canWrite && lastSyncedSheetUrl && (
            <a
              href={lastSyncedSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-teal-700 dark:text-teal-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <span>Ver hoja</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {!composerOpen && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar nota de piso</span>
            </button>
          )}

          <div
            role="group"
            aria-label="Estado de notas"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-800"
          >
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                filterMode === 'pending'
                  ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Pendientes ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('applied')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                filterMode === 'applied'
                  ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Aplicadas ({appliedCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                filterMode === 'all'
                  ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Todas ({notes.length})
            </button>
          </div>
        </div>
      </div>

      {/* Direct Note Composer */}
      {composerOpen && (
        <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Nueva nota operativa para UVEH
            </h3>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              aria-label="Cerrar formulario de nota"
              className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label
                htmlFor="note-patient-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
              >
                Seleccionar paciente del censo activo
              </label>
              <select
                id="note-patient-select"
                value={selectedCensusKey}
                onChange={(e) => handleSelectPatient(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="">— Elegir paciente del censo —</option>
                <option value="_manual">Otro paciente (capturar datos manualmente)</option>
                {censusOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.nombre} · Cama {opt.cama} · {opt.servicio}
                  </option>
                ))}
              </select>
            </div>

            {selectedCensusKey === '_manual' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Nombre del paciente
                  </label>
                  <input
                    type="text"
                    value={manualNombre}
                    onChange={(e) => setManualNombre(e.target.value)}
                    placeholder="Apellidos y nombre"
                    className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Cama
                    </label>
                    <input
                      type="text"
                      value={manualCama}
                      onChange={(e) => setManualCama(e.target.value)}
                      placeholder="Ej. 304"
                      className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Servicio
                    </label>
                    <input
                      type="text"
                      value={manualServicio}
                      onChange={(e) => setManualServicio(e.target.value)}
                      placeholder="Ej. Medicina Interna"
                      className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="note-body-textarea"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Cambio clínico u observación
                </label>
                <VoiceDictationButton
                  compact
                  onTranscribed={(spoken) =>
                    setNewNoteText((prev) =>
                      prev.trim() ? `${prev.trim()} ${spoken}` : spoken
                    )
                  }
                />
              </div>
              <textarea
                id="note-body-textarea"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                rows={3}
                placeholder="Ej. Se retiró catéter venoso central hoy a las 09:00 h; se envió punta a cultivo…"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submittingNew || !manualNombre.trim() || !newNoteText.trim()}
              onClick={handleCreateSubmit}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-xs sm:text-sm font-semibold disabled:opacity-50"
            >
              {submittingNew ? 'Enviando…' : 'Guardar nota'}
            </button>
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              className="min-h-[40px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium"
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {/* Loading / Error / Populated / Empty States */}
      {notesState.loading && notes.length === 0 ? (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="p-5 flex flex-col gap-2.5">
              <div className="h-4 w-1/3 rounded bg-slate-200/80 dark:bg-slate-800 animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
            </div>
          ))}
        </div>
      ) : notesState.error ? (
        <div className="bg-white dark:bg-[#111726] border border-red-200 dark:border-red-900/60 rounded-xl p-10 text-center flex flex-col items-center gap-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            No se pudieron cargar las notas operativas
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
            {notesState.error}
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reintentar carga</span>
          </button>
        </div>
      ) : filtered.length > 0 ? (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {filtered.map((n) => {
            const isEditing = editingFila === n.fila;
            const isDeleting = confirmDeleteFila === n.fila;
            const isBusy = busyFila === n.fila;

            return (
              <div
                key={n.fila}
                className={`p-4 sm:p-5 flex flex-col gap-2.5 ${n.aplicada ? 'opacity-70' : ''}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {n.nombre || 'Paciente'}
                    </span>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                      ·
                    </span>
                    <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                      Cama {n.cama || 's/c'}
                    </span>
                    {n.servicio && (
                      <>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                          ·
                        </span>
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {n.servicio}
                        </span>
                      </>
                    )}
                  </div>

                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {n.autor}
                    {n.fecha ? ` · ${formatDateTimeShort(n.fecha)}` : ''}
                    {n.editada ? ' · editada' : ''}
                    {n.aplicada ? ' · aplicada al Excel' : ''}
                  </span>
                </div>

                {isEditing ? (
                  <div className="flex flex-col gap-2 mt-1">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm text-slate-900 dark:text-slate-100"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusyFila(n.fila);
                          const ok = await onEdit(n.fila, editDraft);
                          setBusyFila(null);
                          if (ok) setEditingFila(null);
                        }}
                        className="px-3.5 py-2 min-h-[40px] rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
                      >
                        {isBusy ? 'Guardando…' : 'Guardar cambios'}
                      </button>
                      <VoiceDictationButton
                        compact
                        onTranscribed={(spoken) =>
                          setEditDraft((prev) =>
                            prev.trim() ? `${prev.trim()} ${spoken}` : spoken
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setEditingFila(null)}
                        className="px-3 py-2 min-h-[40px] rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                    {n.texto}
                  </p>
                )}

                {!isEditing && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {canWrite && !n.aplicada && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={async () => {
                          setBusyFila(n.fila);
                          await onMarkApplied(n.fila);
                          setBusyFila(null);
                        }}
                        className="min-h-[38px] px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Ya lo pasé al Excel</span>
                      </button>
                    )}

                    {n.puede && !isDeleting && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditDraft(n.texto);
                            setEditingFila(n.fila);
                            setConfirmDeleteFila(null);
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteFila(n.fila);
                            setEditingFila(null);
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Eliminar</span>
                        </button>
                      </>
                    )}

                    {isDeleting && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-red-700 dark:text-red-400 font-medium">
                          ¿Confirmar eliminación?
                        </span>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={async () => {
                            setBusyFila(n.fila);
                            await onDelete(n.fila);
                            setBusyFila(null);
                            setConfirmDeleteFila(null);
                          }}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold"
                        >
                          {isBusy ? 'Borrando…' : 'Sí, eliminar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteFila(null)}
                          className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center flex flex-col items-center gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {q ? 'Sin notas que coincidan con tu búsqueda' : 'No hay notas en esta vista'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              {q
                ? 'Prueba con otro nombre de paciente, cama o servicio.'
                : 'Registra cualquier cambio clínico desde piso usando el botón superior o desde la ficha de cada paciente.'}
            </p>
          </div>
          {q ? (
            <button
              type="button"
              onClick={onClearSearch}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar búsqueda</span>
            </button>
          ) : (
            !composerOpen && (
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar primera nota</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
