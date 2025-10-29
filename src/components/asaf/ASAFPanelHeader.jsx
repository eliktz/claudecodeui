/**
 * ASAFPanelHeader Component
 * =========================
 *
 * Header component for the ASAF panel showing sprint name, current phase badge,
 * and collapse/expand toggle button.
 *
 * Features:
 * - Sprint name display (truncated on mobile)
 * - Phase badge with color coding
 * - Toggle button for panel collapse/expand
 * - Mobile-aware layout
 */

import React from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Phase color mapping for badges
 */
const PHASE_COLORS = {
  grooming: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  planning: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-700',
  implementation: 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 border-green-200 dark:border-green-700',
  demo: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  retrospective: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
};

/**
 * Format phase name for display
 */
const formatPhase = (phase) => {
  if (!phase) return '';
  return phase.charAt(0).toUpperCase() + phase.slice(1);
};

/**
 * ASAFPanelHeader Component
 * @param {Object} props - Component props
 * @param {string} props.sprintName - Name of the sprint
 * @param {string} props.phase - Current phase of the sprint
 * @param {Function} props.onToggle - Callback for toggle button click
 * @param {boolean} props.isMobile - Whether in mobile view
 * @param {string} props.className - Additional CSS classes
 */
const ASAFPanelHeader = ({ sprintName, phase, onToggle, isMobile, className = '' }) => {
  return (
    <div className={cn(
      'flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700',
      className
    )}>
      {/* Sprint info */}
      <div className="flex-1 min-w-0 mr-2">
        {/* ASAF label and Phase badge */}
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-green-500 to-blue-500 text-white shadow-sm">
            ASAF
          </span>
          {/* Phase badge */}
          {phase && (
            <span className={cn(
              'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
              PHASE_COLORS[phase] || PHASE_COLORS.grooming
            )}>
              {formatPhase(phase)}
            </span>
          )}
        </div>

        {/* Sprint name */}
        <h2
          className="text-sm font-semibold text-gray-900 dark:text-white truncate"
          title={sprintName}
        >
          {sprintName || 'ASAF Sprint'}
        </h2>
      </div>

      {/* Toggle button */}
      <button
        onClick={onToggle}
        className="flex-shrink-0 p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
        title={isMobile ? 'Close panel' : 'Collapse panel'}
      >
        {isMobile ? (
          <X className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
    </div>
  );
};

export default ASAFPanelHeader;