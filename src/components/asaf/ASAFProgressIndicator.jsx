/**
 * ASAFProgressIndicator Component
 * ================================
 *
 * Vertical checklist showing progress through the 5 ASAF sprint phases.
 * Displays initialization (always complete), and the current status of each phase.
 *
 * Features:
 * - Visual progress through sprint phases
 * - Current phase highlighting
 * - Completed phase checkmarks
 * - Folder existence indicators
 */

import React from 'react';
import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Phase definitions in order
 */
const PHASES = [
  { key: 'initialization', label: 'Initialization', alwaysComplete: true },
  { key: 'grooming', label: 'Grooming' },
  { key: 'planning', label: 'Planning' },
  { key: 'implementation', label: 'Implementation' },
  { key: 'demo', label: 'Demo' },
  { key: 'retrospective', label: 'Retrospective' }
];

/**
 * ASAFProgressIndicator Component
 * @param {Object} props - Component props
 * @param {string} props.currentPhase - Current active phase
 * @param {Object} props.phaseStates - Completion states for each phase
 * @param {boolean} props.hasGrooming - Whether grooming folder exists
 * @param {boolean} props.hasPlanning - Whether planning folder exists
 * @param {boolean} props.hasImplementation - Whether implementation folder exists
 * @param {boolean} props.hasDemo - Whether demo folder exists
 * @param {boolean} props.hasRetrospective - Whether retrospective folder exists
 * @param {string} props.className - Additional CSS classes
 */
const ASAFProgressIndicator = ({
  currentPhase,
  phaseStates = {},
  hasGrooming,
  hasPlanning,
  hasImplementation,
  hasDemo,
  hasRetrospective,
  className = ''
}) => {
  // Map folder existence to phase keys
  const folderExists = {
    grooming: hasGrooming,
    planning: hasPlanning,
    implementation: hasImplementation,
    demo: hasDemo,
    retrospective: hasRetrospective
  };

  /**
   * Determine if a phase is complete
   */
  const isPhaseComplete = (phase) => {
    if (phase.alwaysComplete) return true;

    // Check phase-specific completion flags
    switch (phase.key) {
      case 'grooming':
        return phaseStates.grooming_approved === true;
      case 'planning':
        return phaseStates.planning_complete === true;
      case 'implementation':
        return phaseStates.implementation_complete === true;
      case 'demo':
        return phaseStates.demo_complete === true;
      case 'retrospective':
        return phaseStates.retrospective_complete === true;
      default:
        return false;
    }
  };

  /**
   * Determine if a phase is the current active phase
   */
  const isCurrentPhase = (phase) => {
    return phase.key === currentPhase;
  };

  return (
    <div className={cn('space-y-2', className)}>
      <h3 className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
        Progress
      </h3>

      <div className="space-y-1.5">
        {PHASES.map((phase) => {
          const complete = isPhaseComplete(phase);
          const current = isCurrentPhase(phase);
          const hasFolder = folderExists[phase.key];

          return (
            <div
              key={phase.key}
              className={cn(
                'flex items-center gap-2 py-1',
                current && 'font-medium'
              )}
            >
              {/* Phase icon */}
              {complete ? (
                <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
              ) : current ? (
                <Circle className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 fill-current" />
              ) : (
                <Circle className="w-4 h-4 text-gray-400 dark:text-gray-600 flex-shrink-0" />
              )}

              {/* Phase label */}
              <span className={cn(
                'text-sm flex-1',
                complete
                  ? 'text-green-700 dark:text-green-300'
                  : current
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400'
              )}>
                {phase.label}
              </span>

              {/* Folder indicator (for non-initialization phases) */}
              {!phase.alwaysComplete && hasFolder && (
                <span className="text-xs text-gray-500 dark:text-gray-500" title="Folder exists">
                  📁
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ASAFProgressIndicator;