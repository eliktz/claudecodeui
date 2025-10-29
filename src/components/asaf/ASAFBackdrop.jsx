/**
 * ASAFBackdrop Component
 * ======================
 *
 * Mobile backdrop overlay that dims content when ASAF panel is open.
 * Clicking the backdrop closes the panel.
 *
 * Features:
 * - Semi-transparent overlay
 * - Click to dismiss
 * - Smooth fade animation
 * - Mobile-only component
 */

import React from 'react';
import { cn } from '../../lib/utils';

/**
 * ASAFBackdrop Component
 * @param {Object} props - Component props
 * @param {Function} props.onClick - Callback when backdrop is clicked
 * @param {string} props.className - Additional CSS classes
 */
const ASAFBackdrop = ({ onClick, className = '' }) => {
  return (
    <div
      className={cn(
        'fixed inset-0 bg-black/50 z-30',
        'animate-in fade-in duration-200',
        className
      )}
      onClick={onClick}
      aria-label="Close panel"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick();
        }
      }}
    />
  );
};

export default ASAFBackdrop;