# Acceptance Criteria: ASAF Sprint Selection Support

**Sprint**: asaf-sprint-selection-ui
**Phase**: Grooming
**Created**: November 3, 2025
**Status**: Testable Criteria Defined

---

## Table of Contents

1. [Overview](#overview)
2. [Feature: Sprint Selection Management](#feature-sprint-selection-management)
3. [Feature: Panel Visibility Fix](#feature-panel-visibility-fix)
4. [Feature: Real-Time Synchronization](#feature-real-time-synchronization)
5. [Edge Case Handling](#edge-case-handling)
6. [Performance Criteria](#performance-criteria)
7. [User Experience Criteria](#user-experience-criteria)
8. [Test Scenarios](#test-scenarios)
9. [Definition of Done](#definition-of-done)

---

## Overview

### Success Criteria Summary

1. Sprint selector works correctly for projects with 2+ sprints
2. ASAF panel appears for ALL valid ASAF projects (including `asaf-for-claude-code`)
3. Terminal and UI sprint selections stay synchronized within 2 seconds
4. Edge cases handled gracefully (no crashes, clear error messages)
5. Performance meets targets (API < 500ms, UI responsive)

### Acceptance Testing Approach

- **Manual Testing**: User scenarios executed in real environment
- **API Testing**: Postman/curl for endpoint validation
- **Integration Testing**: Terminal + UI sync validation
- **Edge Case Testing**: Specific scenarios from edge-cases.md

---

## Feature: Sprint Selection Management

### AC-1: Auto-Selection on First Load

**Given**: Project has 3 sprints, no `.current-sprint.json` exists
**When**: User opens Claude Code UI
**Then**:
- Backend auto-selects most recently updated sprint (by `.state.json` mtime)
- `.current-sprint.json` file is created automatically
- UI displays the auto-selected sprint
- Sprint selector shows "3 sprints" button
- Dropdown lists all 3 sprints with the auto-selected one highlighted (star icon)

**Test Steps**:
1. Create project with 3 sprints: `feature-a`, `feature-b`, `feature-c`
2. Delete `.current-sprint.json` if exists
3. Touch `feature-c/.state.json` to make it most recent: `touch asaf/feature-c/.state.json`
4. Open Claude Code UI
5. Verify panel shows `feature-c`
6. Verify `.current-sprint.json` exists with `sprint: "feature-c"`

**Pass Criteria**: Panel shows `feature-c`, file created with correct content

---

### AC-2: Sprint Selection via UI Dropdown

**Given**: Project has 3 sprints, currently showing `feature-a`
**When**: User clicks sprint selector, selects `feature-b`
**Then**:
- Dropdown closes immediately
- Loading state shown during API call
- `.current-sprint.json` updated to `feature-b`
- Panel refreshes to show `feature-b` data
- No page reload required
- Operation completes within 1 second

**Test Steps**:
1. Open project with 3 sprints
2. Verify current sprint is `feature-a`
3. Click sprint selector button ("3 sprints")
4. Verify dropdown opens with all 3 sprints
5. Click `feature-b` in dropdown
6. Verify dropdown closes
7. Verify panel updates to show `feature-b`
8. Verify `.current-sprint.json` content: `{"sprint": "feature-b", ...}`

**Pass Criteria**: Sprint switches successfully, UI updates, file written

---

### AC-3: Sprint Selector Hidden for Single Sprint

**Given**: Project has exactly 1 sprint
**When**: User opens Claude Code UI
**Then**:
- Panel displays sprint data normally
- Sprint selector button is NOT rendered
- Panel header shows sprint name without selector

**Test Steps**:
1. Create project with 1 sprint: `feature-only`
2. Open Claude Code UI
3. Inspect panel header DOM
4. Verify sprint selector component not present
5. Verify sprint name still displayed in header

**Pass Criteria**: No sprint selector rendered, panel works normally

---

### AC-4: Sprint Selector Hidden for No Sprints

**Given**: Project has `/asaf/` directory but no valid sprints
**When**: User opens Claude Code UI
**Then**:
- Panel does NOT appear (entire component hidden)
- No error messages in console
- No visual artifacts

**Test Steps**:
1. Create project with `asaf/` directory
2. Create invalid sprint (missing `.state.json`)
3. Open Claude Code UI
4. Verify panel is not rendered
5. Check console for errors (should be none)

**Pass Criteria**: Panel completely hidden, no errors

---

### AC-5: Sprint List Ordering

**Given**: Project has 5 sprints with different update times
**When**: User opens sprint selector dropdown
**Then**:
- Sprints listed in order of most recent update (top to bottom)
- Currently selected sprint highlighted with star icon
- Each sprint shows: name, phase badge, status, last updated date

**Test Steps**:
1. Create 5 sprints with different `.state.json` mtime values
2. Touch files in specific order: `sprint-e` (newest), `sprint-c`, `sprint-a`, `sprint-d`, `sprint-b` (oldest)
3. Open sprint selector
4. Verify order: `sprint-e`, `sprint-c`, `sprint-a`, `sprint-d`, `sprint-b`
5. Verify each entry shows phase and date

**Pass Criteria**: Correct ordering, metadata displayed

---

### AC-6: API Endpoint - GET /current

**Given**: Project has selected sprint `feature-auth`
**When**: API called: `GET /api/asaf/:projectPath/current`
**Then**:
- Response status: 200
- Response body:
  ```json
  {
    "exists": true,
    "sprint": "feature-auth",
    "selected_at": "<ISO timestamp>",
    "type": "full"
  }
  ```

**Test Steps**:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/asaf/-Users-elik.k-git-project/current
```

**Pass Criteria**: 200 status, correct JSON structure

---

### AC-7: API Endpoint - GET /list

**Given**: Project has 3 sprints
**When**: API called: `GET /api/asaf/:projectPath/list`
**Then**:
- Response status: 200
- Response body includes:
  - `sprints` array with 3 elements
  - `current` field with selected sprint name
  - `total: 3`
  - Each sprint has: name, phase, status, type, created, updated

**Test Steps**:
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/asaf/-Users-elik.k-git-project/list
```

**Pass Criteria**: 200 status, array length matches sprint count

---

### AC-8: API Endpoint - POST /select

**Given**: Project has sprint `bug-fix-login`
**When**: API called: `POST /api/asaf/:projectPath/select` with body `{"sprint": "bug-fix-login"}`
**Then**:
- Response status: 200
- Response body:
  ```json
  {
    "success": true,
    "sprint": "bug-fix-login",
    "selected_at": "<ISO timestamp>"
  }
  ```
- `.current-sprint.json` updated
- WebSocket event `asaf:sprint-selected` emitted

**Test Steps**:
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sprint": "bug-fix-login"}' \
  http://localhost:3001/api/asaf/-Users-elik.k-git-project/select
```

**Pass Criteria**: 200 status, file updated, WebSocket event sent

---

### AC-9: API Endpoint - POST /select (Sprint Not Found)

**Given**: Project does NOT have sprint `non-existent`
**When**: API called: `POST /api/asaf/:projectPath/select` with body `{"sprint": "non-existent"}`
**Then**:
- Response status: 404
- Response body:
  ```json
  {
    "error": "Sprint 'non-existent' not found",
    "available": ["feature-a", "feature-b", "feature-c"]
  }
  ```
- `.current-sprint.json` NOT updated

**Test Steps**:
```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sprint": "non-existent"}' \
  http://localhost:3001/api/asaf/-Users-elik.k-git-project/select
```

**Pass Criteria**: 404 status, helpful error with available sprints

---

## Feature: Panel Visibility Fix

### AC-10: Panel Appears for Project with Hyphens in Path

**Given**: Project path is `/Users/elik.k/git/asaf-for-claude-code`
**When**: Project has valid ASAF sprint
**Then**:
- ASAF panel appears in UI
- Panel displays sprint data correctly
- Sprint selector works (if multiple sprints)

**Test Steps**:
1. Open project `asaf-for-claude-code`
2. Verify panel is visible in right sidebar
3. Verify panel shows sprint name and phase
4. Verify sprint selector appears (if 2+ sprints)

**Pass Criteria**: Panel visible and functional

---

### AC-11: Path Decoding Uses extractProjectDirectory()

**Given**: Any project with ASAF structure
**When**: Frontend makes API call to `/api/asaf/:encodedPath`
**Then**:
- Backend calls `extractProjectDirectory(encodedPath)`
- Backend does NOT use manual `.replace(/-/g, '/')`
- Correct absolute path resolved
- API call succeeds

**Test Steps**:
1. Add logging to `asaf.js` backend route
2. Make API call for project `asaf-for-claude-code`
3. Check logs for `extractProjectDirectory()` call
4. Verify no manual string replacement

**Pass Criteria**: `extractProjectDirectory()` used, correct path logged

---

### AC-12: Panel Hidden for Invalid Project Path

**Given**: User navigates to unknown project (not in `.claude/projects/`)
**When**: Frontend requests ASAF data
**Then**:
- API returns 403 Forbidden
- Panel does NOT appear
- No error spam in console
- Graceful handling

**Test Steps**:
1. Manually navigate to unknown project URL
2. Observe ASAF panel area
3. Check console for errors
4. Verify 403 response in network tab

**Pass Criteria**: Panel hidden, 403 response, no console errors

---

## Feature: Real-Time Synchronization

### AC-13: Terminal Selection Syncs to UI

**Given**: UI is open, showing `feature-a`
**When**: User runs `/asaf-select feature-b` in terminal
**Then**:
- File watcher detects `.current-sprint.json` change
- WebSocket event `asaf:sprint-selection-changed` emitted
- UI receives event within 500ms
- UI refreshes sprint data automatically
- Panel updates to show `feature-b` within 2 seconds

**Test Steps**:
1. Open Claude Code UI with project showing `feature-a`
2. Open terminal in same project
3. Run: `/asaf-select feature-b`
4. Start timer
5. Observe UI panel
6. Stop timer when panel shows `feature-b`

**Pass Criteria**: UI updates within 2 seconds (ideally < 1 second)

---

### AC-14: UI Selection Syncs to Other UI Tabs

**Given**: 2 browser tabs open, both showing same project
**When**: User selects `feature-c` in tab 1
**Then**:
- Tab 1: Immediate update
- Backend: Emit `asaf:sprint-selected` WebSocket event
- Tab 2: Receive event within 500ms
- Tab 2: Refresh and show `feature-c` within 1 second

**Test Steps**:
1. Open 2 browser tabs with same project
2. Tab 1: Select `feature-c` from dropdown
3. Tab 2: Observe panel (do NOT interact)
4. Verify tab 2 updates automatically

**Pass Criteria**: Both tabs show same sprint within 1 second

---

### AC-15: WebSocket Reconnection Triggers Refresh

**Given**: UI is open, WebSocket disconnects
**When**: WebSocket reconnects
**Then**:
- `useASAFData` hook detects reconnection
- Hook triggers `fetchSprintData()` automatically
- Sprint data refreshed from server
- UI shows latest state

**Test Steps**:
1. Open Claude Code UI
2. Simulate WebSocket disconnect (DevTools or network throttle)
3. Terminal: Select different sprint
4. Reconnect WebSocket
5. Verify UI refreshes to show terminal selection

**Pass Criteria**: UI syncs after reconnection

---

## Edge Case Handling

### AC-16: Corrupted .current-sprint.json Handled Gracefully

**Given**: `.current-sprint.json` contains invalid JSON
**When**: User opens UI
**Then**:
- Backend catches parse error
- Backend logs warning (not error)
- Backend auto-selects most recent sprint
- Backend overwrites corrupted file with valid one
- UI shows auto-selected sprint

**Test Steps**:
1. Write corrupted file: `echo "{invalid}" > asaf/.current-sprint.json`
2. Open Claude Code UI
3. Verify panel appears with auto-selected sprint
4. Verify `.current-sprint.json` now valid

**Pass Criteria**: No crash, file auto-repaired, UI works

---

### AC-17: Selected Sprint Deleted - Auto-Reselect

**Given**: `.current-sprint.json` points to `feature-deleted`
**When**: `asaf/feature-deleted/` directory is deleted, UI refreshes
**Then**:
- Backend detects sprint is invalid
- Backend logs warning: "Selected sprint 'feature-deleted' is invalid or deleted"
- Backend auto-selects from remaining sprints
- Backend updates `.current-sprint.json`
- UI shows newly selected sprint

**Test Steps**:
1. Select `feature-a`
2. Delete `asaf/feature-a/` directory: `rm -rf asaf/feature-a`
3. Refresh UI or trigger file watcher event
4. Verify panel shows different sprint (auto-selected)
5. Verify `.current-sprint.json` updated

**Pass Criteria**: Auto-reselection works, no crash

---

### AC-18: Rapid Sprint Switching Handled Correctly

**Given**: User clicks sprint selector rapidly
**When**: User clicks `sprint-a`, then `sprint-b`, then `sprint-c` within 1 second
**Then**:
- Button disabled during first request
- Subsequent clicks queue or are ignored
- Last selection wins (`sprint-c`)
- UI shows `sprint-c` after all requests complete
- No race condition or stale data

**Test Steps**:
1. Open sprint selector
2. Rapidly click 3 different sprints
3. Observe button state (should disable)
4. Wait for completion
5. Verify final sprint matches last click

**Pass Criteria**: Last click wins, no stale state

---

### AC-19: Permission Denied Error Displayed

**Given**: `/asaf/` directory exists but user lacks read permission
**When**: User opens UI
**Then**:
- API returns 500 with message: "Permission denied accessing ASAF files"
- UI displays error state in panel
- Error message shown to user
- Refresh button available

**Test Steps**:
1. Remove read permission: `chmod 000 asaf/`
2. Open Claude Code UI
3. Verify error state shown in panel
4. Verify error message includes "Permission denied"

**Pass Criteria**: Clear error message, no crash

---

## Performance Criteria

### AC-20: API Response Time < 500ms

**Given**: Project with up to 10 sprints
**When**: Any ASAF API endpoint called
**Then**:
- Response time < 500ms (p95)
- No blocking operations
- File reads sequential but fast

**Test Steps**:
1. Create project with 10 sprints
2. Use network tab to measure API response times
3. Test each endpoint 10 times
4. Calculate p95 latency

**Pass Criteria**: 95% of requests < 500ms

---

### AC-21: UI Remains Responsive During Sprint Switch

**Given**: User selects new sprint
**When**: API call in progress
**Then**:
- UI does NOT freeze
- Other UI elements remain clickable
- Loading indicator shown
- Sprint selector disabled during request

**Test Steps**:
1. Click sprint selector
2. Select different sprint
3. During API call, try clicking other UI elements (file tree, git panel)
4. Verify other elements still work

**Pass Criteria**: No UI freeze, loading state shown

---

## User Experience Criteria

### AC-22: Sprint Selector Visually Intuitive

**Given**: User sees sprint selector for first time
**When**: User looks at panel header
**Then**:
- Sprint selector button clearly visible
- Button text indicates number of sprints ("3 sprints")
- ChevronDown icon suggests dropdown behavior
- Hover state changes background color

**Test Steps**:
1. Open project with 3 sprints
2. Locate sprint selector button
3. Hover over button
4. Verify hover effect

**Pass Criteria**: Button discoverable, hover effect present

---

### AC-23: Sprint Dropdown Shows Rich Metadata

**Given**: Sprint selector dropdown is open
**When**: User views sprint list
**Then**:
- Each sprint shows:
  - Name (bold, truncated if long)
  - Phase badge (colored: grooming, planning, implementation, demo, retrospective)
  - Last updated date (relative: "Nov 3" or absolute)
  - Current sprint has star icon and checkmark
  - Current sprint has blue background tint

**Test Steps**:
1. Open sprint selector dropdown
2. Verify each sprint entry format
3. Verify current sprint highlighted
4. Verify phase badges color-coded

**Pass Criteria**: Rich metadata displayed, current sprint clear

---

### AC-24: Sprint Selector Mobile Responsive

**Given**: User on mobile device (viewport < 768px)
**When**: Panel is open (as overlay)
**Then**:
- Sprint selector button still visible in header
- Dropdown positioned correctly (not off-screen)
- Touch targets large enough (44px min)
- Dropdown scrollable if many sprints

**Test Steps**:
1. Open Claude Code UI in mobile viewport (DevTools)
2. Open ASAF panel
3. Click sprint selector
4. Verify dropdown appears correctly
5. Try scrolling dropdown

**Pass Criteria**: Usable on mobile, no layout issues

---

## Test Scenarios

### Scenario 1: First-Time User (Happy Path)

**Context**: User creates first ASAF sprint and opens UI

**Steps**:
1. Terminal: `/asaf-init my-first-sprint`
2. Terminal: `/asaf-groom` (creates grooming docs)
3. Open Claude Code UI
4. Select project

**Expected Results**:
- ASAF panel appears
- Shows `my-first-sprint`
- No sprint selector (only 1 sprint)
- Phase: "grooming"
- Status: "ready" or "in-progress"

**Pass Criteria**: Panel works perfectly on first use

---

### Scenario 2: Multi-Sprint Power User (Complex)

**Context**: User working on 5 concurrent features

**Steps**:
1. Create 5 sprints: `feature-auth`, `feature-ui`, `bug-login`, `refactor-db`, `perf-opt`
2. Terminal: `/asaf-select feature-ui`
3. Open Claude Code UI (tab 1)
4. Verify shows `feature-ui`
5. Open second tab (tab 2)
6. Tab 1: Select `bug-login` via dropdown
7. Verify tab 2 updates to `bug-login`
8. Terminal: `/asaf-select perf-opt`
9. Verify both tabs update to `perf-opt`

**Expected Results**:
- Sprint selector shows "5 sprints"
- Dropdown lists all 5
- Tab sync works (UI → UI)
- Terminal sync works (terminal → UI)
- All updates within 2 seconds

**Pass Criteria**: Perfect multi-sprint workflow

---

### Scenario 3: Error Recovery (Edge Case)

**Context**: User encounters corrupted data

**Steps**:
1. Create sprint `feature-broken`
2. Corrupt `.current-sprint.json`: `echo "garbage" > asaf/.current-sprint.json`
3. Open Claude Code UI
4. Verify panel appears (auto-selected)
5. Delete selected sprint directory
6. Trigger refresh (manual or WebSocket)
7. Verify panel auto-selects new sprint

**Expected Results**:
- Corrupted file handled → auto-select
- Deleted sprint handled → auto-select
- No crashes
- Clear console logs (warnings, not errors)

**Pass Criteria**: Graceful error recovery

---

### Scenario 4: Panel Visibility for Problem Project

**Context**: Fix `asaf-for-claude-code` panel visibility

**Steps**:
1. Open project `/Users/elik.k/git/asaf-for-claude-code`
2. Verify project has valid sprint (check `asaf/` directory)
3. Open Claude Code UI
4. Select project from sidebar

**Expected Results**:
- Panel appears in right sidebar
- Shows sprint data
- Sprint selector works (if multiple sprints)

**Pass Criteria**: Panel visible and functional (THIS IS THE KEY FIX)

---

## Definition of Done

### Code Complete

- [ ] All backend functions implemented (`asaf-reader.js`)
- [ ] All API endpoints implemented (`asaf.js`)
- [ ] File watcher configured (`.current-sprint.json`)
- [ ] Frontend hook updated (`useASAFData.js`)
- [ ] Sprint selector component created (`ASAFSprintSelector.jsx`)
- [ ] Panel and header updated to use selector

### Testing Complete

- [ ] All 24 acceptance criteria tested manually
- [ ] All 4 test scenarios executed successfully
- [ ] Edge cases verified (minimum 10 from edge-cases.md)
- [ ] API endpoints tested with Postman/curl
- [ ] WebSocket events verified (both types)

### Quality Gates

- [ ] No console errors during normal operation
- [ ] No React warnings in DevTools
- [ ] Performance criteria met (API < 500ms)
- [ ] Mobile responsive (viewport < 768px)
- [ ] Dark mode works correctly

### Critical Bugs Fixed

- [ ] **EC-9**: Path encoding with hyphens (extractProjectDirectory() used)
- [ ] **AC-10**: Panel appears for `asaf-for-claude-code` project
- [ ] **AC-13**: Terminal → UI sync within 2 seconds
- [ ] **AC-14**: Multi-tab sync works

### Documentation

- [ ] Design document complete (design.md)
- [ ] Edge cases documented (edge-cases.md)
- [ ] Acceptance criteria documented (this file)
- [ ] Technical decisions documented (decisions.md)
- [ ] Code comments added for complex logic

### User-Facing

- [ ] Sprint selector intuitive and discoverable
- [ ] Error messages clear and helpful
- [ ] No regressions in existing ASAF panel functionality
- [ ] Works for both single and multi-sprint projects

---

## Test Summary Table

| ID | Feature | Type | Priority | Status |
|----|---------|------|----------|--------|
| AC-1 | Auto-selection on first load | Functional | High | Not Tested |
| AC-2 | Sprint selection via UI | Functional | High | Not Tested |
| AC-3 | Selector hidden for 1 sprint | UI | Medium | Not Tested |
| AC-4 | Selector hidden for 0 sprints | UI | Medium | Not Tested |
| AC-5 | Sprint list ordering | UI | Medium | Not Tested |
| AC-6 | GET /current endpoint | API | High | Not Tested |
| AC-7 | GET /list endpoint | API | High | Not Tested |
| AC-8 | POST /select endpoint | API | High | Not Tested |
| AC-9 | POST /select 404 error | API | High | Not Tested |
| AC-10 | Panel for hyphenated path | Bug Fix | **Critical** | Not Tested |
| AC-11 | Path decoding correct | Bug Fix | **Critical** | Not Tested |
| AC-12 | Panel hidden for invalid path | Security | High | Not Tested |
| AC-13 | Terminal → UI sync | Sync | **Critical** | Not Tested |
| AC-14 | Multi-tab UI sync | Sync | High | Not Tested |
| AC-15 | WebSocket reconnect sync | Sync | Medium | Not Tested |
| AC-16 | Corrupted file handling | Edge Case | High | Not Tested |
| AC-17 | Deleted sprint auto-reselect | Edge Case | High | Not Tested |
| AC-18 | Rapid switching handled | Edge Case | Medium | Not Tested |
| AC-19 | Permission error displayed | Edge Case | Medium | Not Tested |
| AC-20 | API performance < 500ms | Performance | Medium | Not Tested |
| AC-21 | UI remains responsive | Performance | Medium | Not Tested |
| AC-22 | Selector visually intuitive | UX | Low | Not Tested |
| AC-23 | Dropdown shows metadata | UX | Low | Not Tested |
| AC-24 | Mobile responsive | UX | Medium | Not Tested |

**Total Criteria**: 24
**Critical**: 3
**High Priority**: 10
**Medium Priority**: 9
**Low Priority**: 2

---

**Status**: Acceptance criteria defined
**Next Step**: Document technical decisions
