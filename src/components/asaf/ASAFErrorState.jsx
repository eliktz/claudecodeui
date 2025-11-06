/**
 * ASAFErrorState Component
 * ========================
 *
 * Error state display for ASAF panel with different messages for different error types.
 * Includes manual refresh button for recovery.
 *
 * Features:
 * - User-friendly error messages
 * - Error type-specific messaging
 * - Manual refresh button
 * - Clean error UI
 */

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Map error messages to user-friendly text
 */
const getErrorMessage = (error) => {
  if (!error) {
    return 'Unable to load sprint data';
  }

  const errorLower = error.toLowerCase();

  if (errorLower.includes('permission')) {
    return 'Permission denied accessing ASAF files';
  }

  if (errorLower.includes('corrupted') || errorLower.includes('invalid')) {
    return 'ASAF structure corrupted - unable to load sprint data';
  }

  if (errorLower.includes('missing summary')) {
    return 'Sprint files incomplete - missing SUMMARY.md';
  }

  if (errorLower.includes('missing .state.json')) {
    return 'Sprint files incomplete - missing state file';
  }

  if (errorLower.includes('server error')) {
    return 'Server error while loading sprint data';
  }

  if (errorLower.includes('timeout')) {
    return 'Request timed out - please try again';
  }

  if (errorLower.includes('access denied')) {
    return 'Access denied to ASAF data';
  }

  // Default to the original error if no specific mapping
  return error;
};

/**
 * ASAFErrorState Component
 * @param {Object} props - Component props
 * @param {string} props.error - Error message or type
 * @param {Function} props.onRefresh - Callback when refresh button is clicked
 * @param {string} props.className - Additional CSS classes
 */
const ASAFErrorState = ({ error, onRefresh, className = '' }) => {
  const errorMessage = getErrorMessage(error);

  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-8 px-4 text-center',
      className
    )}>
      {/* Error icon */}
      <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-3">
        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
      </div>

      {/* Error message */}
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
        Unable to Load Sprint
      </h3>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 max-w-[200px]">
        {errorMessage}
      </p>

      {/* Refresh button */}
      <button
        onClick={onRefresh}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
      >
        <RefreshCw className="w-3 h-3" />
        Try Again
      </button>

      {/* Additional help text for specific errors */}
      {errorMessage.includes('Permission') && (
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-3 max-w-[200px]">
          Check that you have read access to the project's ASAF folder
        </p>
      )}

      {errorMessage.includes('corrupted') && (
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-3 max-w-[200px]">
          The sprint structure may be damaged. Try running an ASAF command to repair it
        </p>
      )}
    </div>
  );
};

export default ASAFErrorState;