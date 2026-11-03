import { useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import { UVEH_LOGO_DATA_URI } from '../../assets/uvehLogo';
import { BulletinPayload, StandaloneRole } from '../../types/clinical';
import { exportBulletinToExcel } from '../../domain/excelParser';

interface GuideSectionProps {
  bulletin: BulletinPayload;
  isStandaloneDemo: boolean;
  standaloneRole: StandaloneRole;
  onChangeStandaloneRole: (role: StandaloneRole) => void;
  onResetDemo: () => void;
}

export function GuideSection({
  bulletin,
  isStandaloneDemo,
  standaloneRole,
  onChangeStandaloneRole,
  onResetDemo,
}: GuideSectionProps) {
  const [logoError, setLogoError] = useState(false);

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Institutional Reference Header */}
      <div className="flex items-start gap-4">
        {!logoError ? (
          <img
            src={UVEH_LOGO_DATA_URI}
            alt="Emblema institucional UVEH · HAEV"
            referrerPolicy="no-referrer"
            onError={() => setLogoError(true)}
            className="w-12 h-12 rounded-xl object-cover bg-white ring-1 ring-slate-200 dark:ring-slate-700 shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-teal-700 text-white font-display font-bold text-sm flex items-center justify-center shrink-0">
            UVEH
          </div>
        )}
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Guía operativa del sistema RADAR UVEH
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
            Hospital Regional de Alta Especialidad de Veracruz · Flujo estandarizado para el pase de
            visita epidemiológico, seguimiento de cultivos y coordinación con enfermería de piso.
          </p>
        </div>
      </div>

      {/* 4-Step Workflow */}
      <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
        <div className="p-5 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-5">
          <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0 w-24">
            01. Servicio
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Filtra tu piso o subárea clínica
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              Selecciona tu servicio en la barra lateral (por ejemplo, Medicina Interna, UCIA o
              Pediatría). La plataforma recuerda tu elección entre turnos y habilita subfiltros para
              Pediatría, Nefrología/Hemodiálisis y Urgencias Adultos.
            </p>
          </div>
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-5">
          <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0 w-24">
            02. Prioridad
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Inicia por “Pacientes por revisar”
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              Atiende primero los eventos señalados como{' '}
              <strong className="text-red-700 dark:text-red-400 font-semibold">
                Urgente · revisar primero
              </strong>{' '}
              y enseguida los de{' '}
              <strong className="text-amber-700 dark:text-amber-400 font-semibold">
                Revisar hoy
              </strong>
              . Alterna entre tarjetas para rondas móviles o tabla para revisión rápida de
              escritorio con expediente deslizable.
            </p>
          </div>
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-5">
          <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0 w-24">
            03. Criterios
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Evalúa criterios UVEH y coteja microbiología
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              Despliega “Criterios UVEH” en cualquier sospecha de IAAS para documentar hallazgos
              clínicos conforme a NOM-045-SSA2 y NHSN, y visualiza o adjunta reportes de
              bacteriología sin salir de la plataforma.
            </p>
          </div>
        </div>

        <div className="p-5 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-5">
          <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-300 shrink-0 w-24">
            04. Cierre
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Registra resolución compartida con todo el equipo
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
              Marca “Ya lo revisé” para pasarlo a seguimiento activo o “Descartar IAAS” si no cumple
              definición operacional. El personal de piso puede enviar notas de cambio desde la
              ficha del paciente o en la pestaña Notas.
            </p>
          </div>
        </div>
      </section>

      {/* Keyboard Shortcuts Reference */}
      <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-3">
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Atajos rápidos de teclado
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-2.5">
            <kbd className="font-mono text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shrink-0">
              /
            </kbd>
            <span>Enfocar barra de búsqueda</span>
          </div>
          <div className="flex items-center gap-2.5">
            <kbd className="font-mono text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shrink-0">
              ← / →
            </kbd>
            <span>Paciente anterior / siguiente en expediente</span>
          </div>
          <div className="flex items-center gap-2.5">
            <kbd className="font-mono text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 shrink-0">
              Esc
            </kbd>
            <span>Cerrar expediente o visores</span>
          </div>
        </div>
      </section>

      {/* Standalone Role Switcher + Excel Export & Demo Utilities */}
      <section className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col gap-5">
        {isStandaloneDemo && (
          <div className="pb-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Simulación de perfil operativo
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                Comprueba cómo visualiza la plataforma el equipo coordinador de UVEH frente al
                personal de enfermería de piso.
              </p>
            </div>
            <div
              role="group"
              aria-label="Perfil operativo"
              className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-800 self-start shrink-0"
            >
              <button
                type="button"
                onClick={() => onChangeStandaloneRole('uveh')}
                className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  standaloneRole === 'uveh'
                    ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Coordinación UVEH
              </button>
              <button
                type="button"
                onClick={() => onChangeStandaloneRole('enfermeria')}
                className={`min-h-[34px] px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  standaloneRole === 'enfermeria'
                    ? 'bg-white dark:bg-[#111726] text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Enfermería de piso
              </button>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Herramientas de archivo Excel RADAR
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
            Con perfil UVEH puedes arrastrar cualquier archivo{' '}
            <code className="font-mono text-xs">.xlsx</code> con la hoja{' '}
            <code className="font-mono text-xs">RADAR ACTIVO</code> sobre la ventana para
            previsualizar y publicar un nuevo corte, o descargar el corte actual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {bulletin.rows.length > 0 && (
            <button
              type="button"
              onClick={() => exportBulletinToExcel(bulletin)}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-semibold text-slate-800 dark:text-slate-200 inline-flex items-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Descargar corte actual (.xlsx)</span>
            </button>
          )}

          {isStandaloneDemo && (
            <button
              type="button"
              onClick={onResetDemo}
              className="min-h-[42px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restablecer datos de demostración</span>
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
