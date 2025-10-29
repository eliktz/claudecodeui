# Task Breakdown: asaf-ui-implementation

Generated: 2025-10-29T00:10:00.000Z
Total Tasks: 8

---

## Task 1: Backend API Endpoint for ASAF Data

**Complexity**: Medium

**Description**:
Create REST API endpoint `GET /api/asaf/:projectPath` that reads ASAF sprint data from the file system, validates structure, and returns sprint metadata including state.json and SUMMARY.md content. Handle multiple sprints by returning most recently updated.

**Execution Pattern**: executor → test → reviewer → executor

**Max Iterations**: 3

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `server/routes/asaf.js` (create) - API route handler
- `server/index.js` (modify) - Mount ASAF routes
- `server/utils/asaf-reader.js` (create) - File reading and validation logic

**Edge Cases to Handle**:
- Edge case #1: Corrupted ASAF structure (missing/invalid .state.json)
- Edge case #2: Missing SUMMARY.md
- Edge case #3: Invalid phase value
- Edge case #4: Empty SUMMARY.md
- Edge case #5: Multiple ASAF sprints (return most recent)
- Edge case #9: File system permission denied
- Edge case #15: Invalid project path (not in user's list)
- Edge case #16-17: Path traversal attacks

**Acceptance Criteria Link**:
- Contributes to AC1: Sprint Detection and Display
- Contributes to AC4: Error Handling and Recovery

**Definition of Done**:
- [ ] `GET /api/asaf/:projectPath` endpoint implemented
- [ ] Validates project path against user's project list
- [ ] Reads .state.json and SUMMARY.md
- [ ] Returns structured response with exists flag
- [ ] Handles corrupted structure with clear error messages
- [ ] Returns most recent sprint when multiple exist
- [ ] Security: prevents path traversal
- [ ] Error responses for permission/file system issues
- [ ] All tests passing

**Special Considerations**:
- Use existing JWT middleware for authentication
- Follow existing API patterns in server/routes/
- Validate all file paths before reading
- Handle ENOENT, EACCES errors gracefully

---

## Task 2: File Watching for Real-Time Updates

**Complexity**: Medium

**Description**:
Implement dynamic chokidar file watchers that monitor `asaf/**` directories in active projects. Add watchers when users open projects, remove when disconnected. Emit WebSocket events when ASAF files change.

**Execution Pattern**: executor → test → reviewer → executor

**Max Iterations**: 3

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `server/utils/asaf-watcher.js` (create) - Watcher lifecycle management
- `server/index.js` (modify) - Integrate watcher with WebSocket connections

**Edge Cases to Handle**:
- Edge case #7: File change during read (acceptable with manual refresh)
- Edge case #11: WebSocket connection drop (cleanup watchers)
- Edge case #12: WebSocket reconnection (re-establish watchers)

**Acceptance Criteria Link**:
- Contributes to AC2: Real-Time Sprint Updates

**Definition of Done**:
- [ ] Dynamic watcher creation per project
- [ ] Watches `asaf/**` pattern only
- [ ] Emits `{ type: 'asaf:updated', projectPath }` on changes
- [ ] Watcher cleanup on client disconnect
- [ ] Re-establish watchers on WebSocket reconnect
- [ ] No memory leaks (proper cleanup)
- [ ] All tests passing

**Special Considerations**:
- Follow existing chokidar pattern in server/index.js
- Track watchers per project (Map structure)
- Clean up watchers when last client disconnects from project
- Debounce rapid file changes (e.g., 300ms)

---

## Task 3: ASAFPanel Main Component

**Complexity**: High

**Description**:
Create main ASAFPanel component with component-local state management, API fetching, WebSocket subscriptions, and conditional rendering. Handles loading states, errors, and responsive layout (desktop sidebar vs mobile overlay).

**Execution Pattern**: executor → test → reviewer → executor

**Max Iterations**: 3

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `src/components/ASAFPanel.jsx` (create) - Main panel component
- `src/hooks/useASAFData.js` (create) - Custom hook for data fetching and WS subscription

**Edge Cases to Handle**:
- Edge case #8: Rapid project switching (AbortController)
- Edge case #11: WebSocket reconnection (auto re-fetch)
- Edge case #13-14: API timeout and 500 errors
- Edge case #21: Viewport resize (responsive behavior)
- Edge case #24: Panel state persistence (localStorage)
- Edge case #25: No sprint exists (return null)

**Acceptance Criteria Link**:
- Contributes to AC1: Sprint Detection and Display
- Contributes to AC2: Real-Time Sprint Updates
- Contributes to AC4: Error Handling and Recovery
- Contributes to AC5: Project Switching and State Management

**Definition of Done**:
- [ ] Component renders conditionally based on sprint existence
- [ ] Fetches sprint data on mount and project change
- [ ] Subscribes to WebSocket 'asaf:updated' events
- [ ] Cancels in-flight requests on project change (AbortController)
- [ ] Auto re-fetches on WebSocket reconnect
- [ ] useLocalStorage for isOpen state persistence
- [ ] Loading, error, and success states
- [ ] Responsive: sidebar on desktop, overlay on mobile
- [ ] All tests passing

**Special Considerations**:
- Use existing WebSocketContext for subscriptions
- Clean up subscriptions in useEffect cleanup
- Handle race conditions (multiple rapid fetches)
- Proper TypeScript-style JSDoc comments for props

---

## Task 4: ASAFPanel Sub-Components (Header, Progress, Status, Summary)

**Complexity**: Medium

**Description**:
Create specialized sub-components for panel sections: ASAFPanelHeader (sprint name, phase badge, toggle), ASAFProgressIndicator (vertical checklist), ASAFStatusCard (status details), ASAFSummaryContent (markdown rendering).

**Execution Pattern**: executor → test → reviewer → executor

**Max Iterations**: 2

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `src/components/asaf/ASAFPanelHeader.jsx` (create)
- `src/components/asaf/ASAFProgressIndicator.jsx` (create)
- `src/components/asaf/ASAFStatusCard.jsx` (create)
- `src/components/asaf/ASAFSummaryContent.jsx` (create)

**Edge Cases to Handle**:
- Edge case #19: Very long sprint names (truncate with tooltip)
- Edge case #20: Very large SUMMARY.md (scrollable)

**Acceptance Criteria Link**:
- Contributes to AC1: Sprint Detection and Display
- Contributes to AC6: Collapsible Panel and User Preferences

**Definition of Done**:
- [ ] ASAFPanelHeader: sprint name, phase badge, toggle button
- [ ] ASAFProgressIndicator: vertical checklist (5 phases)
- [ ] ASAFStatusCard: status badge, timestamps, metadata
- [ ] ASAFSummaryContent: react-markdown with prose styling
- [ ] Icons from lucide-react (CheckCircle, Circle, etc.)
- [ ] Tailwind styling matching existing patterns
- [ ] Mobile responsive (text truncation, spacing)
- [ ] All tests passing

**Special Considerations**:
- Phase colors: grooming=blue, planning=purple, implementation=green, demo=orange, retrospective=gray
- Status colors: ready=gray, in-progress=blue, complete=green, blocked=red
- Use @tailwindcss/typography for markdown prose
- Truncate long names with CSS ellipsis + title tooltip

---

## Task 5: ChatInterface Integration

**Complexity**: Medium

**Description**:
Integrate ASAFPanel into ChatInterface.jsx as a flex container with collapsible right sidebar. Handle panel visibility, responsive layout, and pass necessary props (selectedProject, sprintData state).

**Execution Pattern**: executor → test → reviewer → executor

**Max Iterations**: 3

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `src/components/ChatInterface.jsx` (modify) - Add ASAFPanel integration

**Edge Cases to Handle**:
- Edge case #21: Viewport resize (layout adapts)
- Edge case #25: No sprint exists (panel hidden, chat full width)

**Acceptance Criteria Link**:
- Contributes to AC1: Sprint Detection and Display
- Contributes to AC3: Mobile Responsive Behavior
- Contributes to AC5: Project Switching and State Management

**Definition of Done**:
- [ ] ChatInterface uses flex container layout
- [ ] Chat content takes flex-1 (remaining space)
- [ ] ASAFPanel takes fixed 300px (desktop) or overlay (mobile)
- [ ] Panel conditionally rendered based on sprint existence
- [ ] Chat expands to full width when panel hidden
- [ ] Responsive breakpoint at 768px
- [ ] All tests passing

**Special Considerations**:
- ChatInterface is already 3484 lines - add integration cleanly
- Don't refactor ChatInterface in this task (out of scope)
- Use CSS media queries for responsive behavior
- Test on various viewport sizes (320px, 768px, 1024px, 1920px)

---

## Task 6: Auto-Expand and Update Notifications

**Complexity**: Medium

**Description**:
Implement auto-expand logic when sprint status changes to "blocked" and non-disruptive update notifications when sprint files change while user is reading content. Provide manual reload option.

**Execution Pattern**: executor → test → reviewer → executor

**Max Iterations**: 2

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `src/components/asaf/ASAFUpdateNotification.jsx` (create) - Update banner component
- `src/components/ASAFPanel.jsx` (modify) - Add auto-expand and notification logic

**Edge Cases to Handle**:
- Edge case #22: Sprint status change to "blocked" (auto-expand)
- Edge case #23: Content update during reading (show notification, preserve scroll)

**Acceptance Criteria Link**:
- Contributes to AC2: Real-Time Sprint Updates
- Contributes to AC6: Collapsible Panel and User Preferences

**Definition of Done**:
- [ ] Detect status change to "blocked" → set isOpen=true
- [ ] Show "Sprint updated" notification banner when WS update received
- [ ] Notification includes "Reload" button
- [ ] Notification dismissible (X button)
- [ ] Reload button re-fetches data and dismisses notification
- [ ] Scroll position preserved until manual reload
- [ ] All tests passing

**Special Considerations**:
- Only auto-expand on "blocked" status (not other changes)
- Notification should be subtle (top of panel, not blocking)
- Use Tailwind animation classes for smooth appearance
- Compare previous status with new status to detect changes

---

## Task 7: Error States and Manual Refresh

**Complexity**: Low

**Description**:
Implement comprehensive error state UI for all failure scenarios (corrupted structure, API errors, permission denied, etc.). Add manual refresh button to retry failed operations.

**Execution Pattern**: executor → test → reviewer

**Max Iterations**: 2

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `src/components/asaf/ASAFErrorState.jsx` (create) - Error display component
- `src/components/ASAFPanel.jsx` (modify) - Integrate error states

**Edge Cases to Handle**:
- Edge case #1-3: Corrupted structure errors
- Edge case #9: Permission denied
- Edge case #10: Network drive disconnection
- Edge case #13-15: API timeout, 500 error, invalid path

**Acceptance Criteria Link**:
- Contributes to AC4: Error Handling and Recovery

**Definition of Done**:
- [ ] Error state component with icon and message
- [ ] Different messages for different error types
- [ ] Refresh button triggers re-fetch
- [ ] Loading state during refresh
- [ ] Graceful error recovery (error → refresh → success)
- [ ] All tests passing

**Special Considerations**:
- Error messages should be user-friendly (not technical jargon)
- Use lucide-react AlertCircle icon
- Match existing error patterns in codebase
- Test all error scenarios (mock API errors)

---

## Task 8: Mobile Responsive Patterns and Final Polish

**Complexity**: Medium

**Description**:
Implement mobile-specific behaviors (overlay mode, touch events, backdrop dismiss), polish animations and transitions, ensure accessibility (ARIA labels, keyboard navigation), and verify all acceptance criteria.

**Execution Pattern**: executor → test → reviewer → executor

**Max Iterations**: 3

**Executor Profile**: javascript-pro

**Files to Create/Modify**:
- `src/components/ASAFPanel.jsx` (modify) - Add mobile overlay patterns
- `src/components/asaf/ASAFBackdrop.jsx` (create) - Mobile backdrop component

**Edge Cases to Handle**:
- Edge case #21: Viewport resize (smooth transition)
- Edge case #24: State persistence on mobile

**Acceptance Criteria Link**:
- Contributes to AC3: Mobile Responsive Behavior
- Contributes to AC6: Collapsible Panel and User Preferences

**Definition of Done**:
- [ ] Mobile (<768px): Panel as overlay (80% width)
- [ ] Backdrop dims content when panel open
- [ ] Tap backdrop to dismiss
- [ ] Touch-friendly toggle button (larger hit area)
- [ ] Smooth slide animations (CSS transitions)
- [ ] ARIA labels for accessibility
- [ ] Keyboard navigation (Escape to close)
- [ ] All 6 acceptance criteria verified
- [ ] All tests passing
- [ ] Cross-browser testing (Chrome, Safari, Firefox)

**Special Considerations**:
- Use CSS transforms for smooth animations
- Test on real mobile devices if possible
- Ensure no layout shift during transitions
- Follow existing mobile patterns (see MobileNav.jsx)
- Safe area insets for iOS (pwa-mode handling)

---

## Task Dependencies

```
Task 1 (API Backend) ─────┬─→ Task 3 (ASAFPanel Main)
                          │
Task 2 (File Watching) ───┤
                          │
Task 4 (Sub-Components) ──┴─→ Task 5 (ChatInterface Integration)
                              │
                              ├─→ Task 6 (Auto-Expand & Notifications)
                              │
                              ├─→ Task 7 (Error States)
                              │
                              └─→ Task 8 (Mobile & Polish)
```

**Critical Path**: Task 1 → Task 3 → Task 5 → Task 8

**Parallel Work Possible**:
- Task 1 and Task 2 can run in parallel
- Task 4 can run while Task 3 is in review
- Tasks 6 and 7 can run in parallel after Task 5

---

## Estimated Timeline

- **Total Tasks**: 8
- **Estimated Time**: 7-9 hours
  - Task 1: 1.5 hours
  - Task 2: 1 hour
  - Task 3: 1.5 hours
  - Task 4: 1 hour
  - Task 5: 1 hour
  - Task 6: 0.5 hours
  - Task 7: 0.5 hours
  - Task 8: 1 hour
- **Expected Iterations**: ~15-20 total (average 2 per task)

**Complexity Breakdown**:
- High: 1 task (Task 3)
- Medium: 5 tasks (Tasks 1, 2, 5, 6, 8)
- Low: 2 tasks (Tasks 4, 7)

---

_Task breakdown generated by Task Planner Agent on 2025-10-29_
