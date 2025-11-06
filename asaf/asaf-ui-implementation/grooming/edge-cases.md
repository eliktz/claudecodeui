# Edge Cases: asaf-ui-implementation

## Input Validation & Data Integrity

### 1. Corrupted ASAF Structure
**Scenario**: `asaf/<sprint-name>/` exists but `.state.json` is missing or invalid JSON
**Handling**: Show error state: "ASAF structure corrupted - unable to load sprint data"
**Test Approach**:
- Delete `.state.json` from sprint folder
- Corrupt JSON syntax in `.state.json`
- Verify panel shows error message with refresh button
**Priority**: High

### 2. Missing SUMMARY.md
**Scenario**: Sprint folder exists with valid `.state.json` but `SUMMARY.md` is missing
**Handling**: Treat as corrupted structure - show error state
**Test Approach**: Delete `SUMMARY.md`, verify error shown
**Priority**: High

### 3. Invalid Phase Value
**Scenario**: `.state.json` contains phase value not in [grooming, planning, implementation, demo, retrospective]
**Handling**: Show "ASAF structure corrupted" error
**Test Approach**:
- Set phase to "invalid_phase" in `.state.json`
- Verify API validation catches this
- Panel shows error state
**Priority**: High

### 4. Empty SUMMARY.md
**Scenario**: `SUMMARY.md` exists but is empty (0 bytes)
**Handling**: Show empty state in summary section with message "No summary content yet"
**Test Approach**: Create empty SUMMARY.md, verify graceful handling
**Priority**: Medium

### 5. Multiple ASAF Sprints
**Scenario**: Project has multiple sprint folders: `asaf/sprint-1/`, `asaf/sprint-2/`, `asaf/sprint-3/`
**Handling**: Show most recently updated sprint (compare `.state.json` updated timestamps)
**Test Approach**:
- Create 3 sprint folders with different update times
- Verify panel shows most recent
- Update older sprint, verify panel switches
**Priority**: High

---

## State & Concurrency

### 6. Multiple Browser Tabs/Sessions
**Scenario**: User has 2 tabs open with same project, runs ASAF command in one tab
**Handling**:
- Both tabs receive WebSocket `asaf:updated` event
- Both tabs re-fetch sprint data
- UI updates in both tabs simultaneously
**Test Approach**:
- Open 2 tabs, same project
- Run `/asaf-groom-approve` in tab 1
- Verify both tabs update within 1-2 seconds
**Priority**: Medium

### 7. File Change During Read
**Scenario**: Backend starts reading `.state.json`, mid-read a command writes new data
**Handling**:
- No file locking (keep it simple)
- If read encounters error, return error to client
- Manual refresh button available
**Test Approach**: Simulate concurrent read/write (stress test)
**Priority**: Low

### 8. Rapid Project Switching
**Scenario**: User clicks Project A, then Project B before A's API response arrives
**Handling**:
- Cancel in-flight API request when project changes
- Use AbortController in fetch call
- Only display data for currently selected project
**Test Approach**:
- Click through projects rapidly
- Verify no stale data displayed
- Check browser DevTools for aborted requests
**Priority**: High

---

## External Dependencies

### 9. File System Permission Denied
**Scenario**: User doesn't have read permissions on `asaf/` folder
**Handling**: API returns 500 error, panel shows "Unable to load sprint data" with refresh button
**Test Approach**:
- Change folder permissions to remove read access
- Verify error handling
- Restore permissions, click refresh, verify recovery
**Priority**: Medium

### 10. Network Drive Disconnection
**Scenario**: Project is on network drive that temporarily disconnects
**Handling**: File read fails, show "Unable to load sprint data" error
**Test Approach**: Simulate network drive disconnect (or ENOENT error)
**Priority**: Low

### 11. WebSocket Connection Drop
**Scenario**: WebSocket disconnects during active session
**Handling**:
- App has existing reconnection logic (exponential backoff)
- On reconnect, panel auto re-fetches sprint data
- No missed updates
**Test Approach**:
- Disconnect network, modify ASAF files
- Reconnect, verify panel updates automatically
**Priority**: High

### 12. WebSocket Reconnection with Stale Data
**Scenario**: WebSocket disconnected for 5 minutes, multiple sprint updates occurred
**Handling**:
- On reconnect, panel immediately re-fetches
- No explicit "catch-up" notification
- User sees current state after reconnect
**Test Approach**: Long disconnect period with multiple file changes
**Priority**: Medium

---

## API & Backend Issues

### 13. API Timeout
**Scenario**: Backend is slow/unresponsive, API call takes >30 seconds
**Handling**:
- Show loading spinner (no timeout limit)
- If user gets impatient, manual refresh button available
- Browser may timeout naturally (90-120s)
**Test Approach**: Simulate slow backend response
**Priority**: Low

### 14. API Returns 500 Error
**Scenario**: Backend crashes or throws unhandled exception
**Handling**: Panel shows "Unable to load sprint data" with refresh button
**Test Approach**: Force backend error, verify graceful handling
**Priority**: Medium

### 15. Invalid Project Path
**Scenario**: API called with project path not in user's project list
**Handling**:
- Backend validates against project list
- Returns 403 Forbidden
- Panel shows error state
**Test Approach**: Call API with fake project path
**Priority**: High

---

## Security

### 16. Path Traversal Attack
**Scenario**: Malicious user tries `GET /api/asaf/../../etc/passwd`
**Handling**:
- Backend validates project path against user's project list
- Returns 403 Forbidden for invalid paths
- No arbitrary file system access
**Test Approach**: Attempt various path traversal patterns
**Priority**: High

### 17. URL-Encoded Path Traversal
**Scenario**: `GET /api/asaf/%2e%2e%2f%2e%2e%2f` (encoded `../../`)
**Handling**: Express decodes URL, backend validation catches it
**Test Approach**: Send URL-encoded traversal attempts
**Priority**: High

### 18. Malicious Markdown Content
**Scenario**: `SUMMARY.md` contains `<script>alert('xss')</script>` or `![](javascript:alert('xss'))`
**Handling**:
- `react-markdown` escapes HTML by default
- No additional sanitization needed (out of scope)
**Test Approach**: Create SUMMARY.md with XSS attempts, verify safe rendering
**Priority**: Low (rely on library)

---

## Performance & Scale

### 19. Very Long Sprint Name
**Scenario**: Sprint name is 200+ characters: `asaf/this-is-an-extremely-long-sprint-name-that-keeps-going-and-going-and-going.../`
**Handling**:
- Truncate in header with CSS `text-overflow: ellipsis`
- Show tooltip on hover with full name
- No error or validation (allow any length)
**Test Approach**: Create sprint with 200+ character name
**Priority**: Low

### 20. Very Large SUMMARY.md
**Scenario**: `SUMMARY.md` is 100+ KB with thousands of lines
**Handling**:
- Scrollable area handles large content
- react-markdown renders full content (no lazy loading)
- Initial render may be slow (acceptable)
**Test Approach**: Create large SUMMARY.md, verify rendering
**Priority**: Low (no concerns for now)

---

## User Experience

### 21. Viewport Resize (Desktop to Mobile)
**Scenario**: User has panel open at 300px on desktop, resizes browser to mobile width
**Handling**:
- CSS media query detects mobile viewport
- Panel switches to overlay mode (collapses by default)
- User's `isOpen` preference preserved for when they return to desktop
**Test Approach**: Resize browser, verify responsive behavior
**Priority**: Medium

### 22. Sprint Status Change to "Blocked"
**Scenario**: User collapses panel, sprint status changes to "blocked" (critical state)
**Handling**:
- Auto-expand panel to show critical status
- Override user's collapsed preference
**Test Approach**:
- Collapse panel
- Change status to "blocked" in `.state.json`
- Verify panel auto-expands
**Priority**: Medium

### 23. Content Update During Reading
**Scenario**: User scrolled halfway through SUMMARY.md, content updates (phase change)
**Handling**:
- Show non-disruptive notification: "Sprint updated" banner at top of panel
- Provide "Reload" button in notification
- Don't auto-reload (preserves scroll position and reading context)
- Notification dismissible
**Test Approach**:
- Scroll in summary, trigger update
- Verify notification appears
- Click reload, verify content updates
**Priority**: High

### 24. Panel State Persistence Across Sessions
**Scenario**: User collapses panel, closes browser, returns later
**Handling**:
- `useLocalStorage('asafPanelOpen')` persists state
- Panel opens in same state as last session
**Test Approach**: Toggle panel, refresh page, verify state persists
**Priority**: Medium

### 25. No Sprint Exists (Clean State)
**Scenario**: User selects project with no `asaf/` folder
**Handling**:
- API returns `{ exists: false }`
- Panel component returns `null` (not rendered)
- Chat interface takes full width
**Test Approach**: Open project without ASAF sprint, verify clean UI
**Priority**: High

---

## Summary

**Total Edge Cases**: 25 identified across 6 categories
**Critical (High Priority)**: 10 cases requiring careful handling
**Coverage**: All categories addressed (data integrity, concurrency, external deps, API, security, UX)

### Top Priority for Testing
1. Corrupted ASAF structure detection (cases #1-3)
2. Multiple sprints handling (#5)
3. Rapid project switching (#8)
4. WebSocket reconnection (#11)
5. Security validation (#15-17)
6. Sprint update notifications (#23)

---

_Generated from grooming session on 2025-10-29_
