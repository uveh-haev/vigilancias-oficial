/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { PriorityLevel, WorkspaceSection } from './types/clinical';
import { buildWhatsAppReport } from './domain/whatsappReport';
import { getPriorityLevel } from './domain/services';
import { useSurveillanceController } from './hooks/useSurveillanceController';
import { TopBar } from './components/layout/TopBar';
import { SidebarNav } from './components/layout/SidebarNav';
import { WorkspaceToolbar } from './components/workspace/WorkspaceToolbar';
import { TriageOverviewStrip } from './components/workspace/TriageOverviewStrip';
import { SurveillanceQueueView } from './components/workspace/SurveillanceQueueView';
import { OutbreaksSection } from './components/outbreaks/OutbreaksSection';
import { NotesSection } from './components/notes/NotesSection';
import { CulturesSection } from './components/cultures/CulturesSection';
import { GuideSection } from './components/guide/GuideSection';
import { CodecinSection } from './components/analytics/CodecinSection';
import { SmartCultureModal } from './components/cultures/SmartCultureModal';
import { PatientDetailDrawer } from './components/patients/PatientDetailDrawer';
import { CultureViewerModal } from './components/modals/CultureViewerModal';
import { GoogleSheetsModal } from './components/modals/GoogleSheetsModal';
import { TeamAccessModal } from './components/modals/TeamAccessModal';
import { WhatsAppModal } from './components/modals/WhatsAppModal';
import { WorkspaceConfirmModal } from './components/modals/WorkspaceConfirmModal';

export default function App() {
  const ctrl = useSurveillanceController();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);

  const activeQueue =
    ctrl.slices.queues.find((q) => q.id === ctrl.activeTab) || ctrl.slices.queues[0];

  const handleSectionSelect = (next: WorkspaceSection) => {
    ctrl.setSection(next);
    if (next === WorkspaceSection.Outbreaks) {
      ctrl.setActiveTab('brotes');
    } else if (next === WorkspaceSection.Surveillance && ctrl.activeTab === 'brotes') {
      ctrl.setActiveTab('foco');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const whatsAppText = whatsAppOpen
    ? buildWhatsAppReport({
        tab: ctrl.activeTab,
        corte: ctrl.bulletin.corte,
        selectedService: ctrl.selectedService,
        selectedProgram: ctrl.selectedProgram,
        slices: ctrl.slices,
      })
    : '';

  const pendingFocusFiltered = ctrl.slices.foco.filter((r) => !ctrl.doneMap[r.id]).length;
  const urgentFocusFiltered = ctrl.slices.foco.filter(
    (r) => !ctrl.doneMap[r.id] && getPriorityLevel(r) === PriorityLevel.Urgent
  ).length;
  const pendingMicroFiltered = ctrl.slices.cultPendAll.filter((r) => !ctrl.doneMap[r.id]).length;
  const uncapturedMicroFiltered = ctrl.slices.sinCapturarAll.filter(
    (r) => !ctrl.doneMap[r.id]
  ).length;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      {/* Drag-and-Drop Excel Overlay */}
      {ctrl.isDraggingFile && ctrl.canWrite && (
        <div className="fixed inset-3 z-50 rounded-2xl border-2 border-dashed border-teal-700 dark:border-teal-400 bg-white/92 dark:bg-slate-950/92 backdrop-blur-xs flex flex-col items-center justify-center gap-3 pointer-events-none">
          <Upload className="w-10 h-10 text-teal-700 dark:text-teal-400" />
          <p className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Suelta aquí el archivo Excel RADAR (.xlsx)
          </p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Se abrirá en modo de vista previa antes de publicarlo para enfermería.
          </p>
        </div>
      )}

      {/* Strict 3-Zone Top Bar */}
      <TopBar
        activeSection={ctrl.section}
        onSelectSection={handleSectionSelect}
        outbreaksCount={ctrl.slices.filteredOutbreaks.length}
        pendingNotesCount={ctrl.pendingNotesCount}
        culturesCount={ctrl.cultures.length}
        canWrite={ctrl.canWrite}
        refreshing={ctrl.refreshing}
        parsingExcel={ctrl.parsingExcel}
        onUploadExcel={ctrl.loadExcelFile}
        onOpenGoogleSheets={() => ctrl.setGoogleSheetsModalOpen(true)}
        onRefresh={() => ctrl.refreshAll(false)}
      />

      {/* Main Workspace Container */}
      <div className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 pt-5 pb-12 flex flex-col gap-5">
        <WorkspaceToolbar
          section={ctrl.section}
          bulletin={ctrl.bulletin}
          canWrite={ctrl.canWrite}
          publishing={ctrl.publishing}
          refreshing={ctrl.refreshing}
          darkMode={ctrl.darkMode}
          viewDensity={ctrl.viewDensity}
          searchQuery={ctrl.searchQuery}
          selectedService={ctrl.selectedService}
          selectedSubArea={ctrl.selectedSubArea}
          hasActiveFilters={ctrl.hasActiveFilters}
          activeQueueLabel={activeQueue?.shortLabel || 'Vigilancia'}
          onSearchChange={ctrl.setSearchQuery}
          onClearFilters={ctrl.clearAllFilters}
          onViewDensityChange={ctrl.setViewDensity}
          onToggleDarkMode={ctrl.toggleDarkMode}
          onRefresh={() => ctrl.refreshAll(false)}
          onPublishPreview={() => ctrl.publishPreview()}
          onCancelPreview={ctrl.cancelPreview}
          onOpenWhatsApp={() => setWhatsAppOpen(true)}
          onOpenMobileFilters={() => setMobileFiltersOpen(true)}
          onSelectGuide={() => handleSectionSelect(WorkspaceSection.Guide)}
          isOnline={ctrl.isOnline}
          offlineQueueCount={ctrl.offlineQueueCount}
          flushingOffline={ctrl.flushingOffline}
          onFlushOffline={ctrl.flushOfflineQueue}
          onInstalledPWA={() => ctrl.showToast('RADAR UVEH instalada en tu dispositivo')}
          cloudConnected={ctrl.isCloudConnected}
          cloudUserLabel={ctrl.cloudSession.displayName || null}
          onOpenTeamModal={() => ctrl.setTeamModalOpen(true)}
        />

        {/* Situational Triage Overview Strip on Surveillance & Outbreaks */}
        {!ctrl.bulletin.loading &&
          !ctrl.bulletin.error &&
          !ctrl.bulletin.empty &&
          (ctrl.section === WorkspaceSection.Surveillance ||
            ctrl.section === WorkspaceSection.Outbreaks) && (
            <TriageOverviewStrip
              activeSection={ctrl.section}
              activeTab={ctrl.activeTab}
              pendingFocusCount={pendingFocusFiltered}
              urgentFocusCount={urgentFocusFiltered}
              totalIaasCount={ctrl.slices.iaasAll.length}
              rhoveCapturedCount={ctrl.slices.capturadosRhove.length}
              pendingMicroCount={pendingMicroFiltered}
              uncapturedMicroCount={uncapturedMicroFiltered}
              outbreaksCount={ctrl.slices.filteredOutbreaks.length}
              identicalOutbreaksCount={ctrl.slices.identicalOutbreaks.length}
              selectedService={ctrl.selectedService}
              onSelectQueue={(tab) => ctrl.setActiveTab(tab)}
              onSelectOutbreaks={() => handleSectionSelect(WorkspaceSection.Outbreaks)}
              onSelectIndicators={() => handleSectionSelect(WorkspaceSection.Indicators)}
            />
          )}

        {/* Loading Skeleton / Error / Empty / Populated States */}
        {ctrl.bulletin.loading ? (
          <div className="flex flex-col gap-5">
            <div className="h-20 rounded-xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-[264px_1fr] gap-8">
              <div className="hidden lg:flex flex-col gap-2">
                {Array.from({ length: 7 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-10 rounded-lg bg-slate-200/70 dark:bg-slate-800/60 animate-pulse"
                  />
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-64 rounded-xl bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-3"
                  >
                    <div className="h-5 w-2/3 rounded bg-slate-200/70 dark:bg-slate-800 animate-pulse" />
                    <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
                    <div className="h-20 w-full rounded bg-slate-100 dark:bg-slate-800/60 animate-pulse mt-2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : ctrl.bulletin.error ? (
          <div className="bg-white dark:bg-[#111726] border border-red-200 dark:border-red-900/60 rounded-xl p-10 text-center max-w-xl mx-auto my-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              No se pudo abrir el boletín
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              {ctrl.bulletin.error}
            </p>
            <button
              type="button"
              onClick={() => ctrl.refreshAll(false)}
              className="mt-4 min-h-[42px] px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors"
            >
              Intentar nuevamente
            </button>
          </div>
        ) : ctrl.bulletin.empty &&
          ctrl.section !== WorkspaceSection.Guide &&
          ctrl.section !== WorkspaceSection.Notes &&
          ctrl.section !== WorkspaceSection.Cultures &&
          ctrl.section !== WorkspaceSection.Indicators ? (
          <div className="bg-white dark:bg-[#111726] border border-slate-200 dark:border-slate-800 rounded-xl p-12 text-center max-w-xl mx-auto my-8">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Todavía no hay boletín publicado
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
              {ctrl.canWrite
                ? 'Usa el botón “Cargar corte” en la barra superior o arrastra el archivo Excel RADAR (.xlsx) sobre esta ventana.'
                : 'Cuando la Unidad de Vigilancia Epidemiológica publique el corte del día aparecerá aquí.'}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-8">
            {(ctrl.section === WorkspaceSection.Surveillance ||
              ctrl.section === WorkspaceSection.Outbreaks) && (
              <SidebarNav
                services={ctrl.slices.services}
                totalPendingFocus={ctrl.slices.totalPendingFocus}
                totalUrgentFocus={ctrl.slices.totalUrgentFocus}
                selectedService={ctrl.selectedService}
                onSelectService={ctrl.setSelectedService}
                selectedSubArea={ctrl.selectedSubArea}
                onSelectSubArea={ctrl.setSelectedSubArea}
                queues={ctrl.slices.queues}
                activeTab={ctrl.activeTab}
                onSelectTab={ctrl.setActiveTab}
                rows={ctrl.bulletin.rows}
                outbreakIds={ctrl.slices.outbreakIds}
                doneMap={ctrl.doneMap}
                mobileOpen={mobileFiltersOpen}
                onCloseMobile={() => setMobileFiltersOpen(false)}
              />
            )}

            <main className="flex-1 min-w-0">
              {ctrl.section === WorkspaceSection.Surveillance && (
                <SurveillanceQueueView
                  activeTab={ctrl.activeTab}
                  slices={ctrl.slices}
                  corte={ctrl.bulletin.corte}
                  canWrite={ctrl.canWrite}
                  doneMap={ctrl.doneMap}
                  markingIds={ctrl.markingIds}
                  sharedMarks={ctrl.sharedMarks}
                  corteNote={ctrl.bulletin.nota}
                  notesIndex={ctrl.notesIndex}
                  culturesIndex={ctrl.culturesIndex}
                  selectedService={ctrl.selectedService}
                  selectedProgram={ctrl.selectedProgram}
                  onSelectProgram={ctrl.setSelectedProgram}
                  selectedDischargeReason={ctrl.selectedDischargeReason}
                  onSelectDischargeReason={ctrl.setSelectedDischargeReason}
                  searchQuery={ctrl.searchQuery}
                  hasActiveFilters={ctrl.hasActiveFilters}
                  onClearFilters={ctrl.clearAllFilters}
                  viewDensity={ctrl.viewDensity}
                  onMark={ctrl.markEvent}
                  onUnmark={ctrl.unmarkEvent}
                  onSaveCriteria={ctrl.saveCriteria}
                  onSubmitNursingNote={ctrl.submitNursingChangeNote}
                  onUploadCulture={ctrl.uploadSingleCultureFile}
                  onOpenSmartCulture={ctrl.openSmartCultureModal}
                  onOpenInspector={ctrl.openPatientInspector}
                  onOpenCulture={ctrl.setViewingCulture}
                />
              )}

              {ctrl.section === WorkspaceSection.Outbreaks && (
                <OutbreaksSection
                  bulletin={ctrl.bulletin}
                  clusters={ctrl.slices.filteredOutbreaks}
                  identicalClusters={ctrl.slices.identicalOutbreaks}
                  recentCultures={ctrl.slices.recentCultures}
                  atbMode={ctrl.outbreakAtbFilter}
                  onChangeAtbMode={ctrl.setOutbreakAtbFilter}
                  searchQuery={ctrl.searchQuery}
                  selectedService={ctrl.selectedService}
                  hasActiveFilters={ctrl.hasActiveFilters}
                  onClearFilters={ctrl.clearAllFilters}
                  corte={ctrl.bulletin.corte}
                  canWrite={ctrl.canWrite}
                  darkMode={ctrl.darkMode}
                  authorName={ctrl.cloudSession.displayName || 'Coordinación UVEH'}
                  outbreakIds={ctrl.slices.outbreakIds}
                  doneMap={ctrl.doneMap}
                  markingIds={ctrl.markingIds}
                  sharedMarks={ctrl.sharedMarks}
                  notesIndex={ctrl.notesIndex}
                  cultures={ctrl.cultures}
                  culturesIndex={ctrl.culturesIndex}
                  externalCodecinSnapshots={ctrl.cloudCodecinSnapshots}
                  outbreakStudies={ctrl.outbreakStudies}
                  onSaveOutbreakStudy={ctrl.upsertOutbreakStudy}
                  onDeleteOutbreakStudy={ctrl.removeOutbreakStudy}
                  onNotify={ctrl.showToast}
                  onMark={ctrl.markEvent}
                  onUnmark={ctrl.unmarkEvent}
                  onSaveCriteria={ctrl.saveCriteria}
                  onSubmitNursingNote={ctrl.submitNursingChangeNote}
                  onUploadCulture={ctrl.uploadSingleCultureFile}
                  onOpenSmartCulture={ctrl.openSmartCultureModal}
                  onOpenInspector={ctrl.openPatientInspector}
                  onOpenCulture={ctrl.setViewingCulture}
                />
              )}

              {ctrl.section === WorkspaceSection.Notes && (
                <NotesSection
                  notes={ctrl.notes}
                  notesState={ctrl.notesState}
                  rows={ctrl.bulletin.rows}
                  canWrite={ctrl.canWrite}
                  searchQuery={ctrl.searchQuery}
                  lastSyncedSheetUrl={ctrl.lastSyncedSheetUrl}
                  onClearSearch={() => ctrl.setSearchQuery('')}
                  onRetry={ctrl.refreshNotes}
                  onOpenGoogleSheets={() => ctrl.setGoogleSheetsModalOpen(true)}
                  onCreateNote={ctrl.createDirectNursingNote}
                  onEdit={ctrl.editNursingChangeNote}
                  onDelete={ctrl.removeNursingChangeNote}
                  onMarkApplied={ctrl.applyNursingChangeNote}
                />
              )}

              {ctrl.section === WorkspaceSection.Cultures && (
                <CulturesSection
                  cultures={ctrl.cultures}
                  culturesState={ctrl.culturesState}
                  rows={ctrl.bulletin.rows}
                  searchQuery={ctrl.searchQuery}
                  hasWorkspaceToken={ctrl.cloudSession.hasWorkspaceToken}
                  workspaceAccessToken={ctrl.workspaceAccessToken}
                  authorizingWorkspace={ctrl.authorizingWorkspace}
                  onAuthorizeWorkspace={ctrl.authorizeWorkspace}
                  onClearSearch={() => ctrl.setSearchQuery('')}
                  onRetry={ctrl.refreshCultures}
                  onCulturesUpdated={ctrl.setCultures}
                  onSyncBatchToCloud={ctrl.syncBatchCulturesToCloud}
                  onOpenCulture={ctrl.setViewingCulture}
                  onOpenSmartCulture={() => ctrl.openSmartCultureModal(null, null)}
                />
              )}

              {ctrl.section === WorkspaceSection.Indicators && (
                <CodecinSection
                  bulletin={ctrl.bulletin}
                  outbreakIds={ctrl.slices.outbreakIds}
                  clusters={ctrl.slices.filteredOutbreaks}
                  identicalClusters={ctrl.slices.identicalOutbreaks}
                  canWrite={ctrl.canWrite}
                  darkMode={ctrl.darkMode}
                  externalSnapshots={ctrl.cloudCodecinSnapshots}
                  onSyncSnapshots={ctrl.syncCodecinSnapshotsToCloud}
                  onNavigateToService={(service) => {
                    ctrl.setSelectedService(service);
                    ctrl.setActiveTab('iaas');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onNavigateToQueue={(tab) => {
                    ctrl.setActiveTab(tab);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onNavigateToOutbreaks={() => handleSectionSelect(WorkspaceSection.Outbreaks)}
                  onNotify={ctrl.showToast}
                />
              )}

              {ctrl.section === WorkspaceSection.Guide && (
                <GuideSection
                  bulletin={ctrl.bulletin}
                  isStandaloneDemo={ctrl.isStandaloneDemo}
                  standaloneRole={ctrl.standaloneRole}
                  onChangeStandaloneRole={ctrl.setStandaloneRole}
                  onResetDemo={ctrl.handleResetDemo}
                />
              )}
            </main>
          </div>
        )}
      </div>

      {/* Quiet Clinical Disclaimer Footer */}
      <footer className="mt-auto border-t border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-[#0D1320]/70">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
          <span>
            Registro operativo de la Unidad de Vigilancia Epidemiológica Hospitalaria (HAEV) · No
            sustituye el expediente clínico oficial.
          </span>
          <span>NOM-045-SSA2 · RHOVE</span>
        </div>
      </footer>

      {/* Slide-Over Patient Clinical Dossier */}
      <PatientDetailDrawer
        inspected={ctrl.inspectedPatient}
        corte={ctrl.bulletin.corte}
        outbreakIds={ctrl.slices.outbreakIds}
        doneMap={ctrl.doneMap}
        markingIds={ctrl.markingIds}
        sharedMarks={ctrl.sharedMarks}
        notesIndex={ctrl.notesIndex}
        culturesIndex={ctrl.culturesIndex}
        onClose={ctrl.closePatientInspector}
        onNavigate={ctrl.navigateInspectedPatient}
        onMark={ctrl.markEvent}
        onUnmark={ctrl.unmarkEvent}
        onSaveCriteria={ctrl.saveCriteria}
        onSubmitNursingNote={ctrl.submitNursingChangeNote}
        onUploadCulture={ctrl.uploadSingleCultureFile}
        onOpenSmartCulture={ctrl.openSmartCultureModal}
        onOpenCulture={ctrl.setViewingCulture}
      />

      {/* Smart Culture & S/I/R Antibiogram Extraction Modal */}
      <SmartCultureModal
        open={ctrl.smartCultureModal.open}
        rows={ctrl.bulletin.rows}
        initialPatient={ctrl.smartCultureModal.patient}
        initialFile={ctrl.smartCultureModal.file}
        onClose={ctrl.closeSmartCultureModal}
        onConfirm={ctrl.integrateExtractedCulture}
      />

      {/* In-App Culture PDF & Image Viewer Modal */}
      <CultureViewerModal
        culture={ctrl.viewingCulture}
        onClose={() => ctrl.setViewingCulture(null)}
      />

      {/* WhatsApp Shift Report Modal */}
      <WhatsAppModal
        open={whatsAppOpen}
        initialText={whatsAppText}
        onClose={() => setWhatsAppOpen(false)}
        onCopied={() => ctrl.showToast('Resumen copiado al portapapeles')}
      />

      {/* Real-Time Hospital Sync & RBAC Modal */}
      <TeamAccessModal
        open={ctrl.teamModalOpen}
        cloudSession={ctrl.cloudSession}
        signingIn={ctrl.signingIn}
        authorizingWorkspace={ctrl.authorizingWorkspace}
        onClose={() => ctrl.setTeamModalOpen(false)}
        onSignIn={ctrl.signInWithGoogle}
        onAuthorizeWorkspace={ctrl.authorizeWorkspace}
        onSignOut={ctrl.signOutCloud}
        onUpdateOwnProfile={ctrl.updateOwnCloudProfile}
        onChangeStaffRole={ctrl.changeStaffMemberRole}
        onToggleStaffRevocation={ctrl.toggleStaffMemberRevocation}
      />

      {/* Direct Google Sheets Cutoff Import, Notes Sync & Backup Modal */}
      <GoogleSheetsModal
        open={ctrl.googleSheetsModalOpen}
        hasWorkspaceToken={ctrl.cloudSession.hasWorkspaceToken}
        isSignedIn={Boolean(ctrl.cloudSession.user)}
        authorizingWorkspace={ctrl.authorizingWorkspace}
        savedSpreadsheetInput={ctrl.savedSpreadsheetInput}
        corte={ctrl.bulletin.corte}
        activeEventsCount={ctrl.bulletin.rows.length}
        pendingNotesCount={ctrl.pendingNotesCount}
        totalNotesCount={ctrl.notes.length}
        busyAction={ctrl.workspaceBusyAction}
        lastSyncedSheetUrl={ctrl.lastSyncedSheetUrl}
        onClose={() => ctrl.setGoogleSheetsModalOpen(false)}
        onAuthorizeWorkspace={ctrl.authorizeWorkspace}
        onSaveSpreadsheetInput={ctrl.setSavedSpreadsheetInput}
        onImportFromSheet={ctrl.importFromGoogleSheet}
        onRequestSyncNotes={ctrl.requestSyncNotesToGoogleSheet}
        onRequestExportNewSheet={ctrl.requestExportNewGoogleSheet}
      />

      {/* Mandatory Confirmation Dialog for Mutating Google Workspace Calls */}
      <WorkspaceConfirmModal
        request={ctrl.workspaceConfirm}
        busy={ctrl.workspaceConfirmBusy}
        onConfirm={ctrl.handleConfirmWorkspaceModal}
        onCancel={ctrl.handleCancelWorkspaceModal}
      />

      {/* Accessible Live Status Toast */}
      {ctrl.toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-sm font-semibold shadow-lg max-w-[calc(100vw-2rem)] text-center"
        >
          {ctrl.toastMessage}
        </div>
      )}
    </div>
  );
}
