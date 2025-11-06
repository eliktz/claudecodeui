/**
 * ASAFSprintSelector Component
 * =============================
 *
 * Dropdown component for selecting ASAF sprints.
 * Shows list of all available sprints with metadata and allows switching between them.
 *
 * Features:
 * - Button showing sprint count that opens dropdown
 * - Dropdown lists all sprints with: name, phase badge, status, updated date
 * - Current sprint highlighted with star icon
 * - Click to select sprint
 * - Auto-hide if only 1 sprint or 0 sprints
 * - Responsive mobile support
 * - Tailwind CSS styling matching existing components
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Star, Check } from 'lucide-react';
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
 * Status color mapping
 */
const STATUS_COLORS = {
  ready: 'text-gray-600 dark:text-gray-400',
  'in-progress': 'text-blue-600 dark:text-blue-400',
  complete: 'text-green-600 dark:text-green-400',
  blocked: 'text-red-600 dark:text-red-400'
};

/**
 * Format phase name for display
 */
const formatPhase = (phase) => {
  if (!phase) return '';
  return phase.charAt(0).toUpperCase() + phase.slice(1);
};

/**
 * Format status for display
 */
const formatStatus = (status) => {
  if (!status) return '';
  return status.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

/**
 * Format relative time (e.g., "2 hours ago")
 */
const formatRelativeTime = (timestamp) => {
  if (!timestamp) return '';

  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'Just now';
  } else if (diffMin < 60) {
    return `${diffMin}m ago`;
  } else if (diffHour < 24) {
    return `${diffHour}h ago`;
  } else if (diffDay < 7) {
    return `${diffDay}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

/**
 * ASAFSprintSelector Component
 * @param {Object} props - Component props
 * @param {Array} props.sprints - List of all available sprints
 * @param {Object} props.currentSelection - Current sprint selection info
 * @param {Function} props.onSelectSprint - Callback when sprint is selected (sprintName)
 * @param {boolean} props.isLoading - Whether data is loading
 * @param {string} props.className - Additional CSS classes
 */
const ASAFSprintSelector = ({
  sprints = [],
  currentSelection,
  onSelectSprint,
  isLoading = false,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Hide component if only 1 sprint or 0 sprints
  if (sprints.length <= 1) {
    return null;
  }

  const handleSelectSprint = (sprintName) => {
    setIsOpen(false);
    if (onSelectSprint) {
      onSelectSprint(sprintName);
    }
  };

  const currentSprintName = currentSelection?.sprintName;

  return (
    <div className={cn('relative', className)} ref={dropdownRef}>
      {/* Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
          'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700',
          'border border-gray-200 dark:border-gray-700',
          'text-gray-700 dark:text-gray-300',
          'transition-colors',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
        title="Select sprint"
      >
        <span className="font-medium">{sprints.length} sprints</span>
        <ChevronDown className={cn(
          'w-3 h-3 transition-transform',
          isOpen && 'transform rotate-180'
        )} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className={cn(
          'absolute top-full right-0 mt-1 w-72 z-50',
          'bg-white dark:bg-gray-800 rounded-lg shadow-lg',
          'border border-gray-200 dark:border-gray-700',
          'max-h-96 overflow-y-auto'
        )}>
          <div className="py-1">
            {sprints.map((sprint) => {
              const isCurrent = sprint.name === currentSprintName;

              return (
                <button
                  key={sprint.name}
                  onClick={() => handleSelectSprint(sprint.name)}
                  className={cn(
                    'w-full px-3 py-2 text-left',
                    'hover:bg-gray-50 dark:hover:bg-gray-700',
                    'transition-colors',
                    isCurrent && 'bg-blue-50 dark:bg-blue-900/20'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {/* Current indicator */}
                    <div className="flex-shrink-0 w-4 h-4 mt-0.5">
                      {isCurrent && (
                        <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      )}
                    </div>

                    {/* Sprint info */}
                    <div className="flex-1 min-w-0">
                      {/* Sprint name */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          'text-sm font-medium truncate',
                          'text-gray-900 dark:text-white'
                        )}>
                          {sprint.name}
                        </span>
                        {isCurrent && (
                          <span className="flex-shrink-0 text-[10px] font-medium text-blue-600 dark:text-blue-400 uppercase">
                            Current
                          </span>
                        )}
                      </div>

                      {/* Phase and status badges */}
                      <div className="flex items-center gap-2 mb-1">
                        {/* Phase badge */}
                        {sprint.phase && (
                          <span className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                            PHASE_COLORS[sprint.phase] || PHASE_COLORS.grooming
                          )}>
                            {formatPhase(sprint.phase)}
                          </span>
                        )}

                        {/* Status */}
                        {sprint.status && (
                          <span className={cn(
                            'text-[10px] font-medium',
                            STATUS_COLORS[sprint.status] || STATUS_COLORS.ready
                          )}>
                            {formatStatus(sprint.status)}
                          </span>
                        )}
                      </div>

                      {/* Updated time */}
                      {sprint.updated && (
                        <div className="text-[10px] text-gray-500 dark:text-gray-400">
                          Updated {formatRelativeTime(sprint.updated)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ASAFSprintSelector;
