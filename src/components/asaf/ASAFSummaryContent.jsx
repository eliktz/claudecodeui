/**
 * ASAFSummaryContent Component
 * =============================
 *
 * Renders markdown content from SUMMARY.md with syntax highlighting and proper styling.
 *
 * Features:
 * - Markdown rendering with react-markdown
 * - Syntax highlighting for code blocks
 * - Tailwind typography styling
 * - Scrollable content area
 * - Empty state handling
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '../../lib/utils';

/**
 * ASAFSummaryContent Component
 * @param {Object} props - Component props
 * @param {string} props.content - Markdown content from SUMMARY.md
 * @param {string} props.className - Additional CSS classes
 */
const ASAFSummaryContent = ({ content, className = '' }) => {
  // Handle empty content
  if (!content || content.trim() === '' || content === '*No summary content yet*') {
    return (
      <div className={cn(
        'text-sm text-gray-500 dark:text-gray-400 italic text-center py-4',
        className
      )}>
        No summary content yet
      </div>
    );
  }

  return (
    <div className={cn(
      'prose prose-sm dark:prose-invert max-w-none',
      // Tailwind typography overrides for compact display
      'prose-headings:text-base prose-headings:font-semibold',
      'prose-h1:text-lg prose-h1:mb-3 prose-h1:mt-4',
      'prose-h2:text-base prose-h2:mb-2 prose-h2:mt-3',
      'prose-h3:text-sm prose-h3:mb-2 prose-h3:mt-3',
      'prose-p:text-sm prose-p:leading-relaxed prose-p:mb-2',
      'prose-ul:text-sm prose-ul:my-2 prose-ul:pl-4',
      'prose-ol:text-sm prose-ol:my-2 prose-ol:pl-4',
      'prose-li:text-sm prose-li:my-0.5',
      'prose-blockquote:text-sm prose-blockquote:border-l-4 prose-blockquote:border-gray-300 dark:prose-blockquote:border-gray-600',
      'prose-code:text-xs prose-code:px-1 prose-code:py-0.5 prose-code:rounded',
      'prose-pre:text-xs prose-pre:p-2 prose-pre:rounded-md',
      'prose-strong:font-semibold',
      'prose-a:text-blue-600 dark:prose-a:text-blue-400 prose-a:underline',
      className
    )}>
      <ReactMarkdown
        components={{
          // Custom code block rendering
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';

            if (!inline && language) {
              return (
                <pre className={cn(
                  'bg-gray-100 dark:bg-gray-900 rounded-md p-2 overflow-x-auto',
                  className
                )}>
                  <code className={`language-${language}`} {...props}>
                    {children}
                  </code>
                </pre>
              );
            }

            return (
              <code
                className={cn(
                  'bg-gray-100 dark:bg-gray-800 text-red-600 dark:text-red-400 px-1 py-0.5 rounded text-xs',
                  className
                )}
                {...props}
              >
                {children}
              </code>
            );
          },

          // Custom link rendering (open external links in new tab)
          a({ node, children, href, ...props }) {
            const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
            return (
              <a
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                {...props}
              >
                {children}
              </a>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default ASAFSummaryContent;