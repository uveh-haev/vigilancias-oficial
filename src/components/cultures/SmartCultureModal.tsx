import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  FileScan,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AntibiogramInterpretation,
  ExtractedAntibiogramItem,
  ExtractedCultureReport,
  RadarEvent,
} from '../../types/clinical';
import { extractCultureReportFromFile } from '../../services/aiClinicalService';
import { getPatientKey, getServiceGroup } from '../../domain/services';
import { todayISO } from '../../domain/dates';

export interface SmartCultureIntegrationPayload {
  file: File;
  patientKey: string;
  nombre: string;
  cama: string;
  servicio: string;
  report: ExtractedCultureReport;
  updateActiveRadar: boolean;
}

interface SmartCultureModalProps {
  open: boolean;
  rows: RadarEvent[];
  initialPatient?: RadarEvent | null;
  initialFile?: File | null;
  onClose: () => void;
  onConfirm: (payload: SmartCultureIntegrationPayload) => Promise<boolean>;
}

export function SmartCultureModal({
  open,
  rows,
  initialPatient = null,
  initialFile = null,
  onClose,
  onConfirm,
}: SmartCultureModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [report, setReport] = useState<ExtractedCultureReport | null>(null);
  const [selectedPatientKey, setSelectedPatientKey] = useState<string>('');
  const [manualNombre, setManualNombre] = useState('');
  const [manualCama, setManualCama] = useState('');
  const [manualServicio, setManualServicio] = useState('');
  const [updateActiveRadar, setUpdateActiveRadar] = useState(true);

  const censusOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{
      key: string;
      nombre: string;
      cama: string;
      servicio: string;
      exp: string;
    }> = [];
    rows.forEach((r) => {
      const k = getPatientKey(r);
      if (seen.has(k) || !r.nombre) return;
      seen.add(k);
      list.push({
        key: k,
        nombre: r.nombre,
        cama: String(r.cama || 's/c'),
        servicio: getServiceGroup(r),
        exp: String(r.exp || ''),
      });
    });
    return list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [rows]);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setReport(null);
      setErrorMsg(null);
      setAnalyzing(false);
      setSaving(false);
      return;
    }

    if (initialPatient) {
      const pk = getPatientKey(initialPatient);
      setSelectedPatientKey(pk);
      setManualNombre(initialPatient.nombre || '');
      setManualCama(String(initialPatient.cama || 's/c'));
      setManualServicio(getServiceGroup(initialPatient));
      setUpdateActiveRadar(true);
    } else {
      setSelectedPatientKey('');
      setManualNombre('');
      setManualCama('');
      setManualServicio('');
    }

    if (initialFile) {
      void handleSelectFile(initialFile, initialPatient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPatient, initialFile]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  const handleSelectFile = async (chosen: File, fixedPatient?: RadarEvent | null) => {
    if (chosen.size > 18 * 1024 * 1024) {
      setErrorMsg('El archivo supera el límite de 18 MB.');
      return;
    }
    setFile(chosen);
    setErrorMsg(null);
    setAnalyzing(true);
    try {
      const extracted = await extractCultureReportFromFile(chosen, rows);
      setReport({
        ...extracted,
        fechaReporte: extracted.fechaReporte || todayISO(),
        antibiograma: Array.isArray(extracted.antibiograma) ? extracted.antibiograma : [],
      });

      const targetPatient = fixedPatient || initialPatient;
      if (targetPatient) {
        const pk = getPatientKey(targetPatient);
        setSelectedPatientKey(pk);
        setManualNombre(targetPatient.nombre || extracted.pacienteDetectado || '');
        setManualCama(String(targetPatient.cama || extracted.cama || 's/c'));
        setManualServicio(getServiceGroup(targetPatient));
        setUpdateActiveRadar(true);
      } else if (
        extracted.matchedPatientId &&
        censusOptions.some((o) => o.key === extracted.matchedPatientId)
      ) {
        const matched = censusOptions.find((o) => o.key === extracted.matchedPatientId)!;
        setSelectedPatientKey(matched.key);
        setManualNombre(matched.nombre);
        setManualCama(matched.cama);
        setManualServicio(matched.servicio);
        setUpdateActiveRadar(true);
      } else {
        setSelectedPatientKey('_manual');
        setManualNombre(extracted.pacienteDetectado || '');
        setManualCama(extracted.cama || 's/c');
        setManualServicio(extracted.servicio || 'Sin servicio');
        setUpdateActiveRadar(false);
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'No se pudo analizar el archivo microbiológico.';
      setErrorMsg(msg);
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePatientSelectChange = (val: string) => {
    setSelectedPatientKey(val);
    if (val && val !== '_manual') {
      const found = censusOptions.find((o) => o.key === val);
      if (found) {
        setManualNombre(found.nombre);
        setManualCama(found.cama);
        setManualServicio(found.servicio);
        setUpdateActiveRadar(true);
      }
    } else {
      setUpdateActiveRadar(false);
      if (report) {
        setManualNombre(report.pacienteDetectado || '');
        setManualCama(report.cama || 's/c');
        setManualServicio(report.servicio || 'Sin servicio');
      }
    }
  };

  const updateAtbRow = (
    idx: number,
    patch: Partial<ExtractedAntibiogramItem>
  ) => {
    if (!report) return;
    const next = report.antibiograma.map((item, i) =>
      i === idx ? { ...item, ...patch } : item
    );
    setReport({ ...report, antibiograma: next });
  };

  const addAtbRow = () => {
    if (!report) return;
    setReport({
      ...report,
      antibiograma: [
        ...report.antibiograma,
        {
          antimicrobiano: '',
          codigo: '',
          cmi: '',
          interpretacion: 'Sensible',
        },
      ],
    });
  };

  const removeAtbRow = (idx: number) => {
    if (!report) return;
    setReport({
      ...report,
      antibiograma: report.antibiograma.filter((_, i) => i !== idx),
    });
  };

  const handleConfirm = async () => {
    if (!file || !report) return;
    const finalName = manualNombre.trim() || report.pacienteDetectado.trim();
    if (!finalName) {
      setErrorMsg('Indica el nombre o selecciona al paciente antes de guardar.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    const cleanedAtb = report.antibiograma.filter((a) => a.antimicrobiano.trim());
    const effectiveKey =
      selectedPatientKey && selectedPatientKey !== '_manual'
        ? selectedPatientKey
        : `n:${finalName.toLowerCase()}`;

    const ok = await onConfirm({
      file,
      patientKey: effectiveKey,
      nombre: finalName,
      cama: manualCama.trim() || 's/c',
      servicio: manualServicio.trim() || 'Sin servicio',
      report: {
        ...report,
        antibiograma: cleanedAtb,
      },
      updateActiveRadar: Boolean(
        updateActiveRadar && selectedPatientKey && selectedPatientKey !== '_manual'
      ),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-culture-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[92vh] bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <FileScan className="w-5 h-5 text-teal-700 dark:text-teal-400 shrink-0" />
            <div className="min-w-0">
              <h2
                id="smart-culture-title"
                className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 truncate"
              >
                Lectura estructurada de cultivo y antibiograma
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Extrae microorganismo, CMI y perfil S/I/R desde PDF o fotografía de hoja impresa
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            aria-label="Cerrar asistente"
            className="w-9 h-9 rounded-lg inline-flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {!file && !analyzing && (
            <div className="rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-8 sm:p-10 text-center flex flex-col items-center gap-3">
              <Upload className="w-8 h-8 text-teal-700 dark:text-teal-400" />
              <div className="max-w-md">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Selecciona o toma fotografía del reporte de bacteriología
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  Acepta reportes individuales en PDF o fotografías de hojas impresas en piso. Los
                  datos extraídos se muestran abajo para tu verificación antes de integrarlos.
                </p>
              </div>
              <label className="mt-1 min-h-[44px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors">
                <Upload className="w-4 h-4" />
                <span>Elegir PDF o imagen de cultivo</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSelectFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}

          {analyzing && (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="w-8 h-8 text-teal-700 dark:text-teal-400 animate-spin" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Analizando reporte microbiológico y tabla S/I/R…
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Identificando paciente del censo, microorganismo aislado y concentraciones mínimas
                  inhibitorias.
                </p>
              </div>
            </div>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-red-800 dark:text-red-300"
            >
              <span>{errorMsg}</span>
              <label className="min-h-[36px] px-3 py-1.5 rounded-md bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 font-semibold cursor-pointer">
                <span>Probar otro archivo</span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSelectFile(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}

          {report && !analyzing && (
            <div className="flex flex-col gap-5">
              {/* Patient Binding & Preview File Info */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4 items-start">
                <div className="flex flex-col gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Paciente vinculado en censo RADAR
                    </label>
                    <select
                      value={selectedPatientKey}
                      onChange={(e) => handlePatientSelectChange(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                    >
                      <option value="_manual">
                        Paciente fuera del censo activo (solo guardar en repositorio)
                      </option>
                      {censusOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.nombre} · Cama {opt.cama} · {opt.servicio}
                          {opt.exp ? ` · Exp. ${opt.exp}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedPatientKey === '_manual' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Nombre detectado
                        </label>
                        <input
                          type="text"
                          value={manualNombre}
                          onChange={(e) => setManualNombre(e.target.value)}
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Cama
                        </label>
                        <input
                          type="text"
                          value={manualCama}
                          onChange={(e) => setManualCama(e.target.value)}
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                          Servicio
                        </label>
                        <input
                          type="text"
                          value={manualServicio}
                          onChange={(e) => setManualServicio(e.target.value)}
                          className="w-full min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Core Microbiological Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Microorganismo aislado
                      </label>
                      <input
                        type="text"
                        value={report.microorganismo}
                        onChange={(e) =>
                          setReport({ ...report, microorganismo: e.target.value })
                        }
                        placeholder="Ej. Klebsiella pneumoniae"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm italic font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Tipo de muestra
                      </label>
                      <input
                        type="text"
                        value={report.muestra}
                        onChange={(e) => setReport({ ...report, muestra: e.target.value })}
                        placeholder="Ej. Hemocultivo central"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Fecha de resultado
                      </label>
                      <input
                        type="date"
                        value={report.fechaReporte}
                        onChange={(e) =>
                          setReport({ ...report, fechaReporte: e.target.value })
                        }
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Recuento colonial / Cuantificación
                      </label>
                      <input
                        type="text"
                        value={report.recuento}
                        onChange={(e) => setReport({ ...report, recuento: e.target.value })}
                        placeholder="Ej. >100,000 UFC/mL"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                        Fenotipo de resistencia detectado
                      </label>
                      <input
                        type="text"
                        value={report.fenotipoResistencia}
                        onChange={(e) =>
                          setReport({ ...report, fenotipoResistencia: e.target.value })
                        }
                        placeholder="Ej. BLEE positivo / Resistente a carbapenémicos"
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Compact Document Preview Box */}
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-3 flex flex-col gap-2">
                  <div className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                    {file?.name}
                  </div>
                  {previewUrl && file?.type.startsWith('image/') ? (
                    <img
                      src={previewUrl}
                      alt="Vista previa de cultivo"
                      referrerPolicy="no-referrer"
                      className="w-full h-36 object-contain rounded bg-white"
                    />
                  ) : (
                    <div className="h-28 rounded bg-white dark:bg-slate-950 border border-slate-200/70 dark:border-slate-800 flex items-center justify-center text-xs font-mono text-slate-500">
                      Documento PDF listo
                    </div>
                  )}
                  <label className="text-xs font-semibold text-teal-700 dark:text-teal-300 hover:underline cursor-pointer text-center py-1">
                    Cambiar archivo
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleSelectFile(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Antibiogram S/I/R Editable Table */}
              <div className="border-t border-slate-200/80 dark:border-slate-800 pt-4 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      Perfil de antibiograma extraído ({report.antibiograma.length} antimicrobianos)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Alimenta automáticamente el comparador de posibles brotes con antibiograma
                      idéntico.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={addAtbRow}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar antibiótico</span>
                  </button>
                </div>

                {report.antibiograma.length > 0 ? (
                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 text-xs text-slate-600 dark:text-slate-400">
                          <th className="py-2 px-3 font-semibold">Antimicrobiano</th>
                          <th className="py-2 px-2 font-semibold w-24">Código</th>
                          <th className="py-2 px-2 font-semibold w-28">CMI</th>
                          <th className="py-2 px-3 font-semibold w-40">Interpretación</th>
                          <th className="py-2 px-2 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {report.antibiograma.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={item.antimicrobiano}
                                onChange={(e) =>
                                  updateAtbRow(idx, { antimicrobiano: e.target.value })
                                }
                                placeholder="Meropenem"
                                className="w-full min-h-[36px] px-2 py-1 rounded border border-transparent focus:border-slate-300 dark:focus:border-slate-700 bg-transparent text-slate-900 dark:text-slate-100"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={item.codigo}
                                onChange={(e) =>
                                  updateAtbRow(idx, {
                                    codigo: e.target.value.toUpperCase().slice(0, 5),
                                  })
                                }
                                placeholder="MEM"
                                className="w-full min-h-[36px] px-2 py-1 rounded border border-transparent focus:border-slate-300 dark:focus:border-slate-700 bg-transparent font-mono uppercase text-xs"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <input
                                type="text"
                                value={item.cmi}
                                onChange={(e) => updateAtbRow(idx, { cmi: e.target.value })}
                                placeholder="<=0.25"
                                className="w-full min-h-[36px] px-2 py-1 rounded border border-transparent focus:border-slate-300 dark:focus:border-slate-700 bg-transparent font-mono tabular-nums text-xs"
                              />
                            </td>
                            <td className="py-1.5 px-2">
                              <select
                                value={item.interpretacion}
                                onChange={(e) =>
                                  updateAtbRow(idx, {
                                    interpretacion: e.target.value as AntibiogramInterpretation,
                                  })
                                }
                                className={`w-full min-h-[36px] px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold ${
                                  item.interpretacion === 'Resistente'
                                    ? 'text-red-700 dark:text-red-400'
                                    : item.interpretacion === 'Intermedio'
                                      ? 'text-amber-700 dark:text-amber-400'
                                      : 'text-emerald-700 dark:text-emerald-400'
                                }`}
                              >
                                <option value="Sensible">Sensible (S)</option>
                                <option value="Intermedio">Intermedio (I)</option>
                                <option value="Resistente">Resistente (R)</option>
                              </select>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeAtbRow(idx)}
                                aria-label="Quitar fila"
                                className="w-8 h-8 rounded inline-flex items-center justify-center text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No se detectaron filas de antibiograma en este reporte (ej. cultivo negativo o
                    preliminar).
                  </p>
                )}
              </div>

              {selectedPatientKey && selectedPatientKey !== '_manual' && (
                <label className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-800 dark:text-slate-200 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={updateActiveRadar}
                    onChange={(e) => setUpdateActiveRadar(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-teal-700 rounded shrink-0"
                  />
                  <span>
                    Integrar microorganismo y perfil S/I/R directamente al paciente en el corte
                    activo (actualiza al instante el detector de{' '}
                    <strong className="font-semibold">Brotes · Antibiograma idéntico</strong>).
                  </span>
                </label>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5 bg-slate-50/70 dark:bg-slate-900/40 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!file || !report || analyzing || saving}
            onClick={handleConfirm}
            className="min-h-[42px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{saving ? 'Guardando…' : 'Confirmar y guardar cultivo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
