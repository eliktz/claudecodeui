/**
 * ASAFUpdateNotification Component
 * =================================
 *
 * Non-disruptive notification banner shown when sprint files are updated while user is reading.
 * Preserves scroll position and reading context until manual reload.
 *
 * Features:
 * - "Sprint updated" notification
 * - Manual reload button
 * - Dismissible notification
 * - Non-blocking UI
 */

import React from 'react';
import { RefreshCw, X, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * ASAFUpdateNotification Component
 * @param {Object} props - Component props
 * @param {Function} props.onReload - Callback when reload button is clicked
 * @param {Function} props.onDismiss - Callback when dismiss button is clicked
 * @param {string} props.className - Additional CSS classes
 */
const ASAFUpdateNotification = ({ onReload, onDismiss, className = '' }) => {
  return (
    <div className={cn(
      'bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-3 py-2',
      'animate-in slide-in-from-top-2 duration-300',
      className
    )}>
      <div className="flex items-center justify-between">
        {/* Notification message */}
        <div className="flex items-center gap-2 flex-1">
          <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
          <span className="text-xs text-blue-700 dark:text-blue-300">
            Sprint updated
          </span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {/* Reload button */}
          <button
            onClick={onReload}
            className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded transition-colors"
            title="Reload sprint data"
          >
            <RefreshCw className="w-3 h-3" />
            Reload
          </button>

          {/* Dismiss button */}
          <button
            onClick={onDismiss}
            className="p-0.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:bg-blue-100 dark:hover:bg-blue-800/50 rounded transition-colors"
            title="Dismiss notification"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ASAFUpdateNotification;