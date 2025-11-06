# Acceptance Criteria: asaf-ui-implementation

## AC1: Sprint Detection and Display

**User Story**: As a developer, I want to see my current ASAF sprint status automatically when I open a session, so I maintain constant awareness of sprint state.

**Acceptance Test**:
```gherkin
Given I have a project with folder "asaf/my-feature-sprint/"
And the sprint has valid .state.json and SUMMARY.md
When I select the project from the sidebar
Then the ASAF panel appears on the right side
And displays the sprint name "my-feature-sprint"
And shows current phase and status
And renders the SUMMARY.md content
```

**Edge Cases Covered**:
- ✅ Edge case #1: Corrupted ASAF structure
- ✅ Edge case #2: Missing SUMMARY.md
- ✅ Edge case #3: Invalid phase value
- ✅ Edge case #5: Multiple ASAF sprints (shows most recent)
- ✅ Edge case #25: No sprint exists (panel hidden)

**Definition of Done**:
- [ ] API endpoint `/api/asaf/:projectPath` implemented
- [ ] API validates sprint structure (state.json + SUMMARY.md)
- [ ] API returns most recently updated sprint if multiple exist
- [ ] ASAFPanel component renders conditionally based on `exists: true`
- [ ] Sprint metadata displayed: name, phase, status, dates
- [ ] Progress indicators show all 5 phases with current highlighted
- [ ] SUMMARY.md rendered with react-markdown
- [ ] Tests pass for valid, invalid, and missing sprint scenarios
- [ ] Error state shown for corrupted structure

---

## AC2: Real-Time Sprint Updates

**User Story**: As a developer, I want the sprint view to update in real-time when I run ASAF commands, so I don't need to manually refresh.

**Acceptance Test**:
```gherkin
Given I have an open session with ASAF sprint in "grooming" phase
When I run "/asaf-groom-approve" command
And the backend updates .state.json to phase "planning"
Then the ASAF panel automatically updates within 2 seconds
And shows phase changed from "grooming" to "planning"
And shows updated progress indicators
And displays new SUMMARY.md content
```

**Edge Cases Covered**:
- ✅ Edge case #6: Multiple browser tabs (all update)
- ✅ Edge case #11: WebSocket reconnection (auto re-fetch)
- ✅ Edge case #12: WebSocket reconnection with stale data
- ✅ Edge case #23: Content update during reading (notification)

**Definition of Done**:
- [ ] Chokidar file watcher monitors `asaf/**` in project directories
- [ ] Dynamic watcher: added when user opens project, removed on disconnect
- [ ] WebSocket emits `{ type: 'asaf:updated', projectPath: '...' }` on file changes
- [ ] ASAFPanel subscribes to WebSocket events via WebSocketContext
- [ ] Panel re-fetches data automatically on `asaf:updated` event
- [ ] UI updates: progress indicators, status, summary content
- [ ] Non-disruptive notification shown when user is reading content
- [ ] "Sprint updated" banner with "Reload" button
- [ ] Manual reload preserves implementation
- [ ] WebSocket reconnection triggers auto re-fetch
- [ ] Tests pass for file changes, WebSocket events, reconnection

---

## AC3: Mobile Responsive Behavior

**User Story**: As a developer using mobile, I want the ASAF panel to adapt to small screens, so I can view sprint info without losing chat context.

**Acceptance Test**:
```gherkin
Given I open a session with ASAF sprint on mobile device (viewport < 768px)
When the panel loads
Then it appears collapsed by default (overlay mode)
And the chat interface takes full width
When I tap the panel toggle button
Then the panel slides over chat content (80% width overlay)
And I can see all sprint information
When I tap outside the panel or close button
Then the panel slides back to collapsed state
And my panel preference is saved to localStorage
```

**Edge Cases Covered**:
- ✅ Edge case #21: Viewport resize (desktop to mobile)
- ✅ Edge case #24: Panel state persistence across sessions

**Definition of Done**:
- [ ] CSS media queries handle mobile breakpoints (<768px)
- [ ] Panel uses overlay mode on mobile (slides over content)
- [ ] Panel collapses by default on mobile
- [ ] Toggle button works with touch events
- [ ] Backdrop dismisses panel when tapped
- [ ] Panel width: 80% on mobile, 300px on desktop
- [ ] State persists via `useLocalStorage('asafPanelOpen')`
- [ ] Smooth slide animations (CSS transitions)
- [ ] Tests pass on mobile viewport sizes (320px, 375px, 768px)
- [ ] Tests pass for desktop to mobile resize

---

## AC4: Error Handling and Recovery

**User Story**: As a developer, I want clear error messages when sprint data can't be loaded, so I know what went wrong and how to fix it.

**Acceptance Test**:
```gherkin
Given I have a session with ASAF sprint
When the .state.json file is corrupted (invalid JSON)
Then the panel shows "ASAF structure corrupted - unable to load sprint data"
And displays a refresh button
When I fix the corrupted file
And click the refresh button
Then the panel loads successfully with valid sprint data

Given I have a session with ASAF sprint
When the WebSocket connection drops
And sprint files are updated while disconnected
When the WebSocket reconnects
Then the panel automatically re-fetches sprint data
And displays the current state

Given I have a session with ASAF sprint
When the API returns a 500 error
Then the panel shows "Unable to load sprint data"
And displays a refresh button
```

**Edge Cases Covered**:
- ✅ Edge case #1: Corrupted ASAF structure
- ✅ Edge case #2: Missing SUMMARY.md
- ✅ Edge case #3: Invalid phase value
- ✅ Edge case #4: Empty SUMMARY.md
- ✅ Edge case #9: File system permission denied
- ✅ Edge case #10: Network drive disconnection
- ✅ Edge case #11: WebSocket connection drop
- ✅ Edge case #13: API timeout
- ✅ Edge case #14: API returns 500 error
- ✅ Edge case #15: Invalid project path

**Definition of Done**:
- [ ] Backend validates sprint structure on API call
- [ ] Returns clear error messages for each failure type
- [ ] ASAFPanel displays error states with appropriate messages
- [ ] Refresh button triggers `fetchSprintData()` re-fetch
- [ ] Loading state shown during refresh
- [ ] WebSocket reconnection handler calls `fetchSprintData()`
- [ ] API errors caught and displayed (500, 403, 404)
- [ ] Empty SUMMARY.md shows "No summary content yet"
- [ ] Tests pass for all error scenarios
- [ ] Tests verify recovery after error fixed

---

## AC5: Project Switching and State Management

**User Story**: As a developer, I want the panel to always show the correct sprint for my currently selected project, even when switching quickly between projects.

**Acceptance Test**:
```gherkin
Given I have Project A with sprint "feature-auth"
And Project B with sprint "feature-ui"
When I select Project A
Then the panel shows "feature-auth" sprint data
When I quickly switch to Project B before Project A finishes loading
Then any in-flight API request for Project A is cancelled
And the panel shows loading state
And then displays "feature-ui" sprint data
And no stale data from Project A is shown

Given I have the ASAF panel open
And I select a project with no ASAF sprint
Then the panel disappears completely
And the chat interface takes full width
When I switch back to a project with ASAF sprint
Then the panel reappears with correct data
```

**Edge Cases Covered**:
- ✅ Edge case #8: Rapid project switching
- ✅ Edge case #25: No sprint exists (clean state)

**Definition of Done**:
- [ ] useEffect tracks selectedProject changes
- [ ] AbortController cancels in-flight fetch on project change
- [ ] Panel state resets when project changes
- [ ] Loading state displayed during fetch
- [ ] Panel conditionally renders: `{sprintData?.exists && <ASAFPanel />}`
- [ ] Chat layout adapts: flex container with panel taking fixed width
- [ ] Chat expands to full width when panel hidden
- [ ] Tests pass for rapid switching scenarios
- [ ] Tests verify no stale data displayed
- [ ] Tests verify clean no-sprint state

---

## AC6: Collapsible Panel and User Preferences

**User Story**: As a developer, I want to control the panel visibility to maximize chat space, but still be notified of important sprint changes.

**Acceptance Test**:
```gherkin
Given I have a session with ASAF sprint
When the panel is open
And I click the collapse button
Then the panel slides closed
And the chat interface expands to fill the space
And my preference is saved to localStorage

Given I have the panel collapsed
And I close and reopen the browser
Then the panel remains collapsed (preference persisted)

Given I have the panel collapsed
When the sprint status changes to "blocked" (critical state)
Then the panel automatically expands
And shows the updated status prominently

Given I am reading the SUMMARY.md content (scrolled down)
When sprint files are updated
Then a "Sprint updated" notification appears at the top
And provides a "Reload" button
And does NOT auto-reload (preserves my reading position)
When I click "Reload"
Then the content updates with new data
```

**Edge Cases Covered**:
- ✅ Edge case #22: Sprint status change to "blocked"
- ✅ Edge case #23: Content update during reading
- ✅ Edge case #24: Panel state persistence across sessions

**Definition of Done**:
- [ ] Toggle button collapses/expands panel
- [ ] `useLocalStorage('asafPanelOpen', true)` persists state
- [ ] CSS transitions for smooth collapse/expand
- [ ] Chat interface flex layout adapts to panel width
- [ ] Auto-expand logic: if `status === 'blocked'`, set `isOpen = true`
- [ ] Update notification component: banner with "Reload" button
- [ ] Notification shows when WebSocket update received while panel visible
- [ ] Notification dismissible (X button)
- [ ] Reload button triggers re-fetch and dismisses notification
- [ ] Scroll position preserved until manual reload
- [ ] Tests pass for collapse/expand behavior
- [ ] Tests verify localStorage persistence
- [ ] Tests verify auto-expand on critical status
- [ ] Tests verify non-disruptive notifications

---

## Summary

**Total Acceptance Criteria**: 6 criteria covering all major capabilities
**Estimated Tests**: ~40-50 tests (unit + integration)
- Unit tests: Component rendering, state management, API calls
- Integration tests: WebSocket events, file watching, error handling
- E2E tests: User flows, mobile responsive, project switching

All criteria must be met before sprint is considered complete.

**Test Coverage by Edge Case Priority**:
- **High Priority** (10 cases): All covered across AC1, AC2, AC4, AC5
- **Medium Priority** (9 cases): All covered across AC3, AC4, AC6
- **Low Priority** (6 cases): Covered in AC4 or noted as low risk

---

_Generated from grooming session on 2025-10-29_
