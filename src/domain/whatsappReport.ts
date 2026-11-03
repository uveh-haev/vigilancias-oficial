import { PriorityLevel, QueueTabId, RadarEvent } from '../types/clinical';
import {
  hasPendingCulture,
  isFocusPending,
  isNewDetection,
  isRhoveCaptured,
  SurveillanceSlices,
} from './classification';
import { fmtFull } from './dates';
import { prettyOrganism } from './outbreaks';
import { getPriorityLevel, getServiceGroup, getSubservice } from './services';

const PRIORITY_EMOJI: Record<PriorityLevel, string> = {
  [PriorityLevel.Urgent]: '🔴',
  [PriorityLevel.Today]: '🟠',
  [PriorityLevel.NextCut]: '🔵',
  [PriorityLevel.Scheduled]: '⚪',
  [PriorityLevel.Unassigned]: '⚪',
};

export function buildWhatsAppReport(params: {
  tab: QueueTabId;
  corte: string | null;
  selectedService: string;
  selectedProgram: string;
  slices: SurveillanceSlices;
}): string {
  const { tab, corte, selectedService, selectedProgram, slices } = params;
  const lines: string[] = [];
  const corteLabel = fmtFull(corte) || 'Sin fecha';

  const appendByService = (list: RadarEvent[]) => {
    const byGroup: Record<string, RadarEvent[]> = {};
    list.forEach((r) => {
      const g = getServiceGroup(r);
      (byGroup[g] = byGroup[g] || []).push(r);
    });

    Object.keys(byGroup)
      .sort(
        (a, b) =>
          byGroup[b].filter((r) => getPriorityLevel(r) === PriorityLevel.Urgent).length -
            byGroup[a].filter((r) => getPriorityLevel(r) === PriorityLevel.Urgent).length ||
          byGroup[b].length - byGroup[a].length
      )
      .forEach((group) => {
        lines.push('');
        lines.push(`*${group.toUpperCase()} (${byGroup[group].length})*`);
        byGroup[group]
          .slice()
          .sort((a, b) => getPriorityLevel(a) - getPriorityLevel(b))
          .forEach((r) => {
            const pri = getPriorityLevel(r);
            const sg = getSubservice(r);
            const subTxt = sg && sg !== group ? ` (${sg})` : '';
            const flags = [
              isNewDetection(r, corte) ? ' 🆕' : '',
              isRhoveCaptured(r) ? ' ✅ RHOVE' : '',
              isRhoveCaptured(r) && hasPendingCulture(r) ? ' 🧪 cultivo pendiente' : '',
            ].join('');

            lines.push(`${PRIORITY_EMOJI[pri]} Cama ${r.cama || 's/c'}${subTxt} · ${r.nombre || ''}${flags}`);
            if (r.motivo) lines.push(`   ${r.motivo}`);
            if (r.accion && pri <= PriorityLevel.Today) {
              lines.push(`   → ${r.accion}`);
            }
          });
      });
  };

  if (tab === 'iaas') {
    const l = slices.iaasAll;
    const nPend = l.filter((r) => isFocusPending(r, slices.outbreakIds)).length;
    const nCap = l.filter(isRhoveCaptured).length;
    const nCultPend = l.filter((r) => isRhoveCaptured(r) && hasPendingCulture(r)).length;
    lines.push(`*RADAR UVEH · Todas las IAAS · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(
      `IAAS activas: *${l.length}* · Por revisar: *${nPend}* · En RHOVE: *${nCap}*${
        nCultPend ? ` (*${nCultPend}* con cultivo pendiente)` : ''
      }`
    );
    appendByService(l);
  } else if (tab === 'cultpend') {
    const l = slices.cultPendAll;
    lines.push(`*RADAR UVEH · Cultivos pendientes de resultados · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(`IAAS en RHOVE con cultivo pendiente: *${l.length}*`);
    appendByService(l);
  } else if (tab === 'sincult') {
    const l = slices.sinCultAll;
    lines.push(`*RADAR UVEH · Posibles IAAS sin cultivos · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(`IAAS activas sin ningún cultivo tomado: *${l.length}*`);
    appendByService(l);
  } else if (tab === 'sincapturar') {
    const l = slices.sinCapturarAll;
    lines.push(`*RADAR UVEH · Cultivo sin capturar en RHOVE · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(`IAAS en RHOVE con cultivo nuevo sin capturar: *${l.length}*`);
    appendByService(l);
  } else if (tab === 'revisados') {
    const l = slices.revisadosAll;
    lines.push(`*RADAR UVEH · Revisados · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(`Pacientes revisados en seguimiento: *${l.length}*`);
    appendByService(l);
  } else if (tab === 'descartados') {
    const l = slices.descartadosAll;
    lines.push(`*RADAR UVEH · Descartados · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(`Pacientes descartados como IAAS: *${l.length}*`);
    appendByService(l);
  } else if (tab === 'reingresos') {
    const l = slices.reingresosAll;
    lines.push(`*RADAR UVEH · Reingresos con IAAS previa · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(`Pacientes reingresados con IAAS ya capturada antes: *${l.length}*`);
    appendByService(l);
  } else if (tab === 'otros') {
    const l = slices.otrosAll.filter(
      (r) => !selectedProgram || (r.prog || 'Sin programa') === selectedProgram
    );
    lines.push(`*RADAR UVEH · ${selectedProgram || 'Otros programas'} · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(`Casos activos: *${l.length}*`);
    appendByService(l);
  } else {
    const f = slices.foco;
    lines.push(`*RADAR UVEH · Pacientes por revisar · ${corteLabel}*`);
    if (selectedService) lines.push(`Servicio: *${selectedService}*`);
    lines.push(
      `Posible IAAS por revisar: *${f.length}* · Posibles brotes: *${slices.filteredOutbreaks.length}*`
    );
    appendByService(f);
    if (slices.filteredOutbreaks.length) {
      lines.push('');
      lines.push('*⚠️ Posibles brotes*');
      slices.filteredOutbreaks.forEach((b) => {
        lines.push(
          `• _${prettyOrganism(b.org)}_ – ${b.members.length} pacientes (${b.shared[0]}): camas ${b.members
            .map((r) => r.cama || 's/c')
            .join(', ')}`
        );
      });
    }
  }

  lines.push('');
  lines.push('🔴 Urgente · 🟠 Hoy · 🔵 Siguiente corte · ⚪ Seguimiento');
  return lines.join('\n');
}
