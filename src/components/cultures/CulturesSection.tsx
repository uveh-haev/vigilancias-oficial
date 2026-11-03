import { useEffect, useState } from 'react';
import {
  CloudUpload,
  Eye,
  FileScan,
  FileUp,
  FolderCheck,
  RefreshCw,
  RotateCcw,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  AsyncResourceState,
  CultureAttachment,
  PdfBatchState,
  RadarEvent,
} from '../../types/clinical';
import { formatDateTimeShort, normName, shortAuthor } from '../../domain/dates';
import {
  analyzeLabPdfBatch,
  buildBatchPatientOptions,
  uploadLabPdfBatch,
} from '../../services/pdfBatchService';
import { UVEH_DRIVE_FOLDER_NAME } from '../../services/googleWorkspaceService';

interface CulturesSectionProps {
  cultures: CultureAttachment[];
  culturesState: AsyncResourceState;
  rows: RadarEvent[];
  searchQuery: string;
  hasWorkspaceToken: boolean;
  workspaceAccessToken: string | null;
  authorizingWorkspace: boolean;
  onAuthorizeWorkspace: () => Promise<boolean>;
  onClearSearch: () => void;
  onRetry: () => void;
  onCulturesUpdated: (next: CultureAttachment[]) => void;
  onSyncBatchToCloud: (added: CultureAttachment[]) => Promise<void>;
  onOpenCulture: (culture: CultureAttachment) => void;
  onOpenSmartCulture: () => void;
}

export function CulturesSection({
  cultures,
  culturesState,
  rows,
  searchQuery,
  hasWorkspaceToken,
  workspaceAccessToken,
  authorizingWorkspace,
  onAuthorizeWorkspace,
  onClearSearch,
  onRetry,
  onCulturesUpdated,
  onSyncBatchToCloud,
  onOpenCulture,
  onOpenSmartCulture,
}: CulturesSectionProps) {
  const [batch, setBatch] = useState<PdfBatchState | null>(null);
  const [confirmingDriveBatch, setConfirmingDriveBatch] = useState(false);
  const [zoomThumb, setZoomThumb] = useState<{ src: string; pageNumber: number } | null>(null);

  useEffect(() => {
    if (!zoomThumb) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setZoomThumb(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomThumb]);

  const patientOptions = buildBatchPatientOptions(rows);
  const q = normName(searchQuery);
  const filteredCultures = cultures.filter(
    (a) => !q || normName([a.nombre, a.cama, a.servicio, a.archivo, a.autor].join(' ')).includes(q)
  );

  const batchCounts = (() => {
    const counts = { linked: 0, pending: 0, omitted: 0 };
    (batch?.pages || []).forEach((p) => {
      if (p.sel === '_omitir') counts.omitted += 1;
      else if (p.sel) counts.linked += 1;
      else counts.pending += 1;
    });
    return counts;
  })();

  const handlePageSelectChange = (pageIdx: number, value: string) => {
    if (!batch) return;
    const nextPages = batch.pages.map((p, i) => {
      if (i !== pageIdx) return p;
      return {
        ...p,
        sel: value,
        estado: value && p.estado !== 'ok' ? ('man' as const) : p.estado,
      };
    });
    setBatch({ ...batch, pages: nextPages });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Repositorio de cultivos microbiológicos
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Consulta todos los reportes PDF y fotografías de laboratorio adjuntados, incluidos los
            pacientes egresados del censo activo, o separa automáticamente el PDF multipágina del
            día.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start shrink-0">
          {hasWorkspaceToken ? (
            <span className="min-h-[42px] px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/25 text-emerald-800 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap">
              <FolderCheck className="w-4 h-4 shrink-0" />
              <span>Google Drive activo</span>
            </span>
          ) : (
            <button
              type="button"
              disabled={authorizingWorkspace}
              onClick={() => void onAuthorizeWorkspace()}
              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap disabled:opacity-60"
            >
              <CloudUpload className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>{authorizingWorkspace ? 'Conectando…' : 'Conectar Google Drive'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSmartCulture}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <FileScan className="w-4 h-4" />
            <span>Leer cultivo y antibiograma</span>
          </button>

          {!batch && (
            <button
              type="button"
              onClick={() => {
                setConfirmingDriveBatch(false);
                setBatch({
                  nombre: '',
                  pages: [],
                  fase: 'elegir',
                  msg: '',
                  prog: 0,
                  bytes: null,
                });
              }}
              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111726] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <FileUp className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <span>Separar PDF multipágina</span>
            </button>
          )}
        </div>
      </div>

      {/* Multi-page Lab PDF Batch Splitter & OCR Matcher */}
      {batch && (
        <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Carga por lote de cultivos del día (PDF multipágina)
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Selecciona el PDF consolidado de bacteriología. El sistema separa cada hoja, lee el
                nombre mediante OCR y sugiere el paciente correspondiente del censo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBatch(null)}
              aria-label="Cerrar asistente de PDF"
              className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {batch.fase === 'elegir' && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="min-h-[42px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                <span>Elegir archivo PDF</span>
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      analyzeLabPdfBatch(file, rows, setBatch);
                    }
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => setBatch(null)}
                className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium"
              >
                Cancelar
              </button>
            </div>
          )}

          {(batch.fase === 'leyendo' || batch.fase === 'subiendo' || batch.fase === 'listo') && (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {batch.msg}
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-teal-600 transition-all duration-200"
                  style={{ width: `${Math.round((batch.prog || 0) * 100)}%` }}
                />
              </div>
              {batch.resumen && (
                <p className="text-xs text-red-700 dark:text-red-400 whitespace-pre-wrap">
                  {batch.resumen}
                </p>
              )}
              {batch.fase === 'listo' && (
                <div>
                  <button
                    type="button"
                    onClick={() => setBatch(null)}
                    className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold"
                  >
                    Cerrar asistente
                  </button>
                </div>
              )}
            </div>
          )}

          {batch.fase === 'error' && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-red-700 dark:text-red-400">{batch.msg}</p>
              <div className="flex items-center gap-2">
                <label className="min-h-[40px] px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                  <span>Intentar con otro PDF</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) analyzeLabPdfBatch(file, rows, setBatch);
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setBatch(null)}
                  className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium"
                >
                  Cerrar
                </button>
              </div>
            </div>
          )}

          {batch.fase === 'revisar' && (
            <div className="flex flex-col gap-4">
              {batch.ocrOk === false && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  No se pudo iniciar el motor de lectura automática en este navegador. Asigna el
                  paciente manualmente en cada hoja.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 py-2.5 px-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200 tabular-nums">
                  <strong className="font-semibold">{batchCounts.linked}</strong> para adjuntar ·{' '}
                  <strong className="font-semibold">{batchCounts.pending}</strong> sin asignar ·{' '}
                  <strong className="font-semibold">{batchCounts.omitted}</strong> omitidas
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={batchCounts.linked === 0}
                    onClick={() => {
                      if (hasWorkspaceToken && workspaceAccessToken) {
                        setConfirmingDriveBatch(true);
                      } else {
                        void uploadLabPdfBatch({
                          batch,
                          rows,
                          existingAttachments: cultures,
                          driveAccessToken: null,
                          onProgress: setBatch,
                          onAttachmentsUpdated: onCulturesUpdated,
                          onCloudBatchUploaded: onSyncBatchToCloud,
                        });
                      }
                    }}
                    className="min-h-[40px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs sm:text-sm font-semibold disabled:opacity-50"
                  >
                    Adjuntar {batchCounts.linked} cultivo{batchCounts.linked === 1 ? '' : 's'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDriveBatch(false);
                      setBatch(null);
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              </div>

              {confirmingDriveBatch && hasWorkspaceToken && (
                <div className="rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/70 dark:bg-teal-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                    <p className="font-bold">
                      ¿Confirmas guardar estos cultivos en tu carpeta de Google Drive?
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 mt-0.5">
                      Se crearán PDFs individuales para los pacientes vinculados dentro de la
                      carpeta <strong className="font-semibold">{UVEH_DRIVE_FOLDER_NAME}</strong> en
                      Google Drive y se compartirá su enlace con el equipo hospitalario.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingDriveBatch(false);
                        void uploadLabPdfBatch({
                          batch,
                          rows,
                          existingAttachments: cultures,
                          driveAccessToken: workspaceAccessToken,
                          onProgress: setBatch,
                          onAttachmentsUpdated: onCulturesUpdated,
                          onCloudBatchUploaded: onSyncBatchToCloud,
                        });
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
                    >
                      Confirmar en Google Drive
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingDriveBatch(false);
                        void uploadLabPdfBatch({
                          batch,
                          rows,
                          existingAttachments: cultures,
                          driveAccessToken: null,
                          onProgress: setBatch,
                          onAttachmentsUpdated: onCulturesUpdated,
                          onCloudBatchUploaded: onSyncBatchToCloud,
                        });
                      }}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                    >
                      Solo guardar local
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDriveBatch(false)}
                      className="min-h-[38px] px-2.5 py-1.5 rounded-lg text-xs text-slate-600 dark:text-slate-400 hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {batch.pages.map((p, idx) => (
                  <div
                    key={p.n}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => setZoomThumb({ src: p.thumb, pageNumber: p.n })}
                      className="relative group shrink-0 w-24 rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 bg-white"
                      aria-label={`Ampliar hoja ${p.n}`}
                    >
                      <img
                        src={p.thumb}
                        alt={`Hoja ${p.n}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-auto object-contain"
                      />
                      <span className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/35 transition-colors flex items-center justify-center">
                        <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </button>

                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                      <div className="text-xs text-slate-600 dark:text-slate-400">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          Hoja {p.n}
                        </span>
                        {p.ocr ? (
                          <span>
                            {' '}
                            · Detectado:{' '}
                            <strong className="text-slate-900 dark:text-slate-100">{p.ocr}</strong>
                          </span>
                        ) : (
                          <span> · Nombre no detectado</span>
                        )}
                      </div>

                      <select
                        value={p.sel}
                        onChange={(e) => handlePageSelectChange(idx, e.target.value)}
                        className="w-full min-h-[42px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-slate-100"
                      >
                        <option value="">— Seleccionar paciente —</option>
                        <option value="_omitir">
                          Omitir (consulta externa / no hospitalizado)
                        </option>
                        {patientOptions.map((opt) => (
                          <option key={opt.pid} value={opt.pid}>
                            {opt.nombre} · Cama {opt.cama || 's/c'} · {opt.servicio}
                          </option>
                        ))}
                      </select>

                      <span
                        className={`text-xs font-medium ${
                          p.sel === '_omitir'
                            ? 'text-slate-500'
                            : p.sel
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {p.sel === '_omitir'
                          ? 'Hoja omitida'
                          : p.sel
                            ? p.estado === 'ok'
                              ? 'Vinculada automáticamente'
                              : 'Asignada manualmente'
                            : 'Pendiente de asignar'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Repository List: Loading / Error / Populated / Empty */}
      {culturesState.loading && cultures.length === 0 ? (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="p-4 sm:p-5 flex items-center justify-between gap-4">
              <div className="flex flex-col gap-2 w-2/3">
                <div className="h-4 w-1/2 rounded bg-slate-200/80 dark:bg-slate-800 animate-pulse" />
                <div className="h-3.5 w-1/3 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
              </div>
              <div className="h-5 w-20 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />
            </div>
          ))}
        </div>
      ) : culturesState.error ? (
        <div className="bg-white dark:bg-[#111726] border border-red-200 dark:border-red-900/60 rounded-xl p-10 text-center flex flex-col items-center gap-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            No se pudo consultar el repositorio de cultivos
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
            {culturesState.error}
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
      ) : filteredCultures.length > 0 ? (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
          {filteredCultures.map((att, idx) => (
            <button
              key={`${att.id}-${att.archivo}-${idx}`}
              type="button"
              onClick={() => onOpenCulture(att)}
              className="w-full min-h-[58px] px-4 sm:px-5 py-3 flex items-center justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {att.nombre || 'Paciente'}
                  </span>
                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                    ·
                  </span>
                  <span className="font-mono text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                    Cama {att.cama || 's/c'}
                  </span>
                  {att.servicio && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">
                        {att.servicio}
                      </span>
                    </>
                  )}
                  {att.microorganismo && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
                        ·
                      </span>
                      <span className="italic font-semibold text-xs text-teal-800 dark:text-teal-300">
                        {att.microorganismo}
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {att.archivo}
                  {att.muestra ? ` · ${att.muestra}` : ''}
                  {att.autor ? ` · ${shortAuthor(att.autor)}` : ''}
                  {att.fecha ? ` (${formatDateTimeShort(att.fecha)})` : ''}
                  {/^https?:\/\/drive\.google\.com/i.test(att.url || '') ? ' · Google Drive' : ''}
                </p>
              </div>

              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0">
                <Eye className="w-4 h-4" />
                <span>Ver reporte</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center flex flex-col items-center gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {q ? 'Sin cultivos que coincidan con la búsqueda' : 'Aún no hay cultivos adjuntos'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Adjunta reportes individuales desde la ficha de cada paciente o usa el separador de
              PDF multipágina arriba.
            </p>
          </div>
          {q && (
            <button
              type="button"
              onClick={onClearSearch}
              className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-semibold text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar búsqueda</span>
            </button>
          )}
        </div>
      )}

      {/* Zoom Modal for PDF Thumbnail */}
      {zoomThumb && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setZoomThumb(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Hoja ${zoomThumb.pageNumber} ampliada`}
            className="relative max-w-3xl max-h-[90vh] bg-white rounded-xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 bg-slate-900 text-white flex items-center justify-between text-xs font-semibold">
              <span>Vista ampliada · Hoja {zoomThumb.pageNumber}</span>
              <button
                type="button"
                onClick={() => setZoomThumb(null)}
                className="px-2 py-1 rounded hover:bg-slate-800"
              >
                Cerrar (Esc)
              </button>
            </div>
            <img
              src={zoomThumb.src}
              alt={`Hoja ${zoomThumb.pageNumber} ampliada`}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] w-auto object-contain mx-auto"
            />
          </div>
        </div>
      )}
    </div>
  );
}
