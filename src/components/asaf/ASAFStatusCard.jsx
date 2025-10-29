/**
 * ASAFStatusCard Component
 * ========================
 *
 * Status card showing current sprint status with badge, timestamps, and metadata.
 *
 * Features:
 * - Status badge with color coding
 * - Created and updated timestamps
 * - Relative time display ("2 hours ago")
 * - Quick sprint metadata
 */

import React from 'react';
import { Clock, Calendar, AlertCircle, CheckCircle, Pause, Play } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Status color mapping
 */
const STATUS_COLORS = {
  ready: {
    bg: 'bg-gray-100 dark:bg-gray-800',
    text: 'text-gray-700 dark:text-gray-300',
    border: 'border-gray-200 dark:border-gray-700',
    icon: Pause
  },
  'in-progress': {
    bg: 'bg-blue-100 dark:bg-blue-900/50',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-700',
    icon: Play
  },
  complete: {
    bg: 'bg-green-100 dark:bg-green-900/50',
    text: 'text-green-700 dark:text-green-300',
    border: 'border-green-200 dark:border-green-700',
    icon: CheckCircle
  },
  blocked: {
    bg: 'bg-red-100 dark:bg-red-900/50',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-200 dark:border-red-700',
    icon: AlertCircle
  }
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
 * Format relative time (e.g., "2 hours ago", "Just now")
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
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  } else {
    // Format as date for older timestamps
    return date.toLocaleDateString();
  }
};

/**
 * Format full date for tooltip
 */
const formatFullDate = (timestamp) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleString();
};

/**
 * ASAFStatusCard Component
 * @param {Object} props - Component props
 * @param {string} props.status - Current status
 * @param {string} props.created - Created timestamp
 * @param {string} props.updated - Updated timestamp
 * @param {string} props.className - Additional CSS classes
 */
const ASAFStatusCard = ({ status, created, updated, className = '' }) => {
  const statusConfig = STATUS_COLORS[status] || STATUS_COLORS.ready;
  const StatusIcon = statusConfig.icon;

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-3',
      'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700',
      className
    )}>
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('w-4 h-4', statusConfig.text)} />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider">
            Status
          </span>
        </div>
        <span className={cn(
          'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
          statusConfig.bg,
          statusConfig.text,
          statusConfig.border
        )}>
          {formatStatus(status)}
        </span>
      </div>

      {/* Timestamps */}
      <div className="space-y-2 text-xs">
        {/* Last updated */}
        {updated && (
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span title={formatFullDate(updated)}>
              Updated {formatRelativeTime(updated)}
            </span>
          </div>
        )}

        {/* Created date */}
        {created && (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-500">
            <Calendar className="w-3 h-3 flex-shrink-0" />
            <span title={formatFullDate(created)}>
              Created {new Date(created).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default ASAFStatusCard;