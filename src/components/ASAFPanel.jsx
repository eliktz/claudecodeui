/**
 * ASAFPanel Component
 * ===================
 *
 * Main container component for ASAF sprint visualization.
 * Provides persistent, real-time visibility into the current sprint status.
 * Renders as a collapsible right sidebar on desktop and overlay on mobile.
 *
 * Key Features:
 * - Conditional rendering based on sprint existence
 * - Real-time updates via WebSocket
 * - Persistent panel state (open/collapsed)
 * - Responsive design (sidebar vs overlay)
 * - Loading, error, and success states
 * - Auto-expand on critical status changes
 *
 * Edge Cases Handled:
 * - Rapid project switching (AbortController)
 * - WebSocket reconnection (auto re-fetch)
 * - API timeout and errors
 * - Viewport resize (responsive behavior)
 * - Panel state persistence (localStorage)
 * - No sprint exists (return null)
 * - Status change to "blocked" (auto-expand)
 * - Content updates during reading (notification)
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import useLocalStorage from '../hooks/useLocalStorage';
import { useASAFData } from '../hooks/useASAFData';
import ASAFPanelHeader from './asaf/ASAFPanelHeader';
import ASAFProgressIndicator from './asaf/ASAFProgressIndicator';
import ASAFStatusCard from './asaf/ASAFStatusCard';
import ASAFSummaryContent from './asaf/ASAFSummaryContent';
import ASAFUpdateNotification from './asaf/ASAFUpdateNotification';
import ASAFErrorState from './asaf/ASAFErrorState';
import ASAFBackdrop from './asaf/ASAFBackdrop';

/**
 * ASAFPanel Component
 * @param {Object} props - Component props
 * @param {Object} props.selectedProject - Currently selected project
 * @param {string} props.className - Additional CSS classes
 */
const ASAFPanel = ({ selectedProject, className = '' }) => {
  // Panel open/collapsed state (persisted in localStorage)
  const [isOpen, setIsOpen] = useLocalStorage('asafPanelOpen', true);

  // Track if we're on mobile viewport
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  // Track previous status for auto-expand detection
  const prevStatusRef = useRef(null);

  // Track if there's an update notification showing
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);

  // Previous sprint data for comparison (to detect updates)
  const prevSprintDataRef = useRef(null);

  // Fetch sprint data and subscribe to WebSocket updates
  const {
    sprintData,
    allSprints,
    currentSelection,
    isLoading,
    error,
    refreshData,
    selectSprint
  } = useASAFData(selectedProject);

  // Track component mount/unmount
  useEffect(() => {
    console.log('[ASAFPanel] Component MOUNTED');
    return () => {
      console.log('[ASAFPanel] Component UNMOUNTING');
    };
  }, []);

  // Handle viewport resize
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      // Close panel on mobile by default (if transitioning from desktop to mobile)
      if (mobile && !isMobile && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isMobile, isOpen, setIsOpen]);

  // Auto-expand panel when status changes to "blocked"
  useEffect(() => {
    if (!sprintData?.state?.status) {
      return;
    }

    const currentStatus = sprintData.state.status;
    const previousStatus = prevStatusRef.current;

    // Check if status changed to "blocked"
    if (previousStatus && previousStatus !== 'blocked' && currentStatus === 'blocked') {
      console.log('Sprint status changed to blocked, auto-expanding panel');
      setIsOpen(true);
    }

    // Update previous status
    prevStatusRef.current = currentStatus;
  }, [sprintData?.state?.status, setIsOpen]);

  // Detect content updates and show notification
  useEffect(() => {
    if (!sprintData || !prevSprintDataRef.current) {
      // First load, no notification needed
      prevSprintDataRef.current = sprintData;
      return;
    }

    // Compare sprint data to detect updates
    const prevData = prevSprintDataRef.current;
    const hasUpdate =
      prevData.state?.updated !== sprintData.state?.updated ||
      prevData.state?.phase !== sprintData.state?.phase ||
      prevData.state?.status !== sprintData.state?.status;

    if (hasUpdate && isOpen) {
      // Show update notification if panel is open
      setShowUpdateNotification(true);
    }

    // Update previous data reference
    prevSprintDataRef.current = sprintData;
  }, [sprintData, isOpen]);

  // Handle panel toggle
  const togglePanel = () => {
    setIsOpen(!isOpen);
  };

  // Handle manual refresh
  const handleRefresh = () => {
    setShowUpdateNotification(false);
    refreshData();
  };

  // Handle sprint selection
  const handleSelectSprint = async (sprintName) => {
    try {
      await selectSprint(selectedProject, sprintName);
      console.log('[ASAFPanel] Sprint selected:', sprintName);
    } catch (err) {
      console.error('[ASAFPanel] Failed to select sprint:', err);
      // Could show error notification here if needed
    }
  };

  // Handle backdrop click (mobile only)
  const handleBackdropClick = () => {
    if (isMobile && isOpen) {
      setIsOpen(false);
    }
  };

  // Don't render if no sprint exists
  if (!isLoading && !error && !sprintData?.exists) {
    return null;
  }

  // Don't render during initial load if we don't have data yet
  if (isLoading && !sprintData && !error) {
    return null;
  }

  // Panel width classes
  const panelWidth = isMobile ? 'w-[80%] max-w-sm' : 'w-[300px]';

  // Panel position classes
  const panelPosition = isMobile
    ? cn(
        'fixed top-0 right-0 h-full z-40 transform transition-transform duration-300',
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )
    : cn(
        'relative h-full transition-all duration-300',
        isOpen ? panelWidth : 'w-12'
      );

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && isOpen && (
        <ASAFBackdrop onClick={handleBackdropClick} />
      )}

      {/* Main panel */}
      <div
        className={cn(
          'bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 flex flex-col',
          panelPosition,
          className
        )}
      >
        {/* Collapsed state (desktop only) */}
        {!isMobile && !isOpen && (
          <div className="flex flex-col items-center py-4">
            <button
              onClick={togglePanel}
              className="flex flex-col items-center justify-center gap-2 px-2 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors group"
              title="Expand ASAF panel"
            >
              <div className="w-8 h-8 rounded-md bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                A
              </div>
              <ChevronLeft className="w-3 h-3 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
            </button>
          </div>
        )}

        {/* Expanded state */}
        {isOpen && (
          <>
            {/* Loading state */}
            {isLoading && (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center">
                  <div className="animate-spin w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full mx-auto mb-3"></div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Loading sprint data...</p>
                </div>
              </div>
            )}

            {/* Error state */}
            {!isLoading && error && (
              <div className="flex-1 p-4">
                <ASAFErrorState
                  error={error}
                  onRefresh={handleRefresh}
                />
              </div>
            )}

            {/* Sprint data */}
            {!isLoading && !error && sprintData?.exists && (
              <>
                {/* Update notification */}
                {showUpdateNotification && (
                  <ASAFUpdateNotification
                    onReload={handleRefresh}
                    onDismiss={() => setShowUpdateNotification(false)}
                  />
                )}

                {/* Header */}
                <ASAFPanelHeader
                  sprintName={sprintData.sprintName}
                  phase={sprintData.state?.phase}
                  onToggle={togglePanel}
                  isMobile={isMobile}
                  allSprints={allSprints}
                  currentSelection={currentSelection}
                  onSelectSprint={handleSelectSprint}
                  isLoading={isLoading}
                />

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 space-y-4">
                    {/* Progress indicator */}
                    <ASAFProgressIndicator
                      currentPhase={sprintData.state?.phase}
                      phaseStates={{
                        grooming_approved: sprintData.state?.grooming_approved,
                        planning_complete: sprintData.state?.planning_complete,
                        implementation_complete: sprintData.state?.implementation_complete,
                        demo_complete: sprintData.state?.demo_complete,
                        retrospective_complete: sprintData.state?.retrospective_complete
                      }}
                      hasGrooming={sprintData.hasGrooming}
                      hasPlanning={sprintData.hasPlanning}
                      hasImplementation={sprintData.hasImplementation}
                      hasDemo={sprintData.hasDemo}
                      hasRetrospective={sprintData.hasRetrospective}
                    />

                    {/* Status card */}
                    <ASAFStatusCard
                      status={sprintData.state?.status}
                      created={sprintData.state?.created}
                      updated={sprintData.state?.updated}
                    />

                    {/* Summary content */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                        Summary
                      </h3>
                      <ASAFSummaryContent
                        content={sprintData.summary}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer with refresh button */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-3">
                  <button
                    onClick={handleRefresh}
                    className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default ASAFPanel;