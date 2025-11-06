# Implementation Tasks: ASAF Sprint Selection Support

**Sprint**: asaf-sprint-selection-ui
**Phase**: Implementation
**Created**: November 3, 2025
**Status**: In Progress

---

## Task Breakdown

### Backend Tasks

#### Task 1: Update asaf-reader.js (Core Sprint Selection Logic)
**Status**: Not Started
**Estimated Time**: 1.5 hours
**Priority**: Critical
**Dependencies**: None

**Description**: Add sprint selection management functions to asaf-reader.js

**Files to Modify**:
- `/Users/elik.k/git/claudecodeui/server/utils/asaf-reader.js`

**Changes Required**:
1. Add `getCurrentSprintSelection(projectPath)` - Read `.current-sprint.json`
2. Add `getAllSprints(projectPath)` - Scan and validate all sprints
3. Add `createCurrentSprintSelection(projectPath, sprintName, type)` - Write selection file
4. Modify `readAsafSprintData(projectPath)` - Use selection as source of truth

**DoD (Definition of Done)**:
- [ ] All 3 new functions implemented with error handling
- [ ] `readAsafSprintData()` reads `.current-sprint.json` first
- [ ] Falls back to auto-selection if file missing/corrupted
- [ ] Creates `.current-sprint.json` on auto-selection
- [ ] Code includes detailed comments
- [ ] Handles all edge cases (corrupted JSON, missing fields, deleted sprint)

---

#### Task 2: Add API Endpoints to asaf.js
**Status**: Not Started
**Estimated Time**: 1 hour
**Priority**: Critical
**Dependencies**: Task 1

**Description**: Add 3 new REST endpoints for sprint selection management

**Files to Modify**:
- `/Users/elik.k/git/claudecodeui/server/routes/asaf.js`

**Endpoints to Add**:
1. `GET /api/asaf/:projectPath/current` - Get current selection
2. `GET /api/asaf/:projectPath/list` - List all sprints
3. `POST /api/asaf/:projectPath/select` - Select a sprint

**DoD**:
- [ ] All 3 endpoints implemented
- [ ] Use `extractProjectDirectory()` for path decoding (NOT manual replace)
- [ ] Validation: Check sprint exists before selecting
- [ ] POST /select emits WebSocket event `asaf:sprint-selected`
- [ ] Error handling: 404 for missing sprint, 403 for invalid path
- [ ] Tested with curl/Postman

---

#### Task 3: Add WebSocket File Watcher for Sprint Selection
**Status**: Not Started
**Estimated Time**: 45 minutes
**Priority**: High
**Dependencies**: Task 1

**Description**: Watch `.current-sprint.json` and emit WebSocket events on changes

**Files to Modify**:
- `/Users/elik.k/git/claudecodeui/server/index.js` (or wherever file watcher is configured)

**Changes Required**:
1. Add chokidar watcher for `asaf/.current-sprint.json` in all projects
2. Emit `asaf:sprint-selection-changed` on `change` event
3. Emit `asaf:sprint-selection-changed` on `add` event (file created)

**DoD**:
- [ ] File watcher configured for `.current-sprint.json`
- [ ] WebSocket event emitted with correct structure
- [ ] Tested: Manual file edit triggers event
- [ ] Handles file deletion gracefully

---

#### Task 4: Fix Path Encoding Issues (Critical Bug Fix)
**Status**: Not Started
**Estimated Time**: 30 minutes
**Priority**: CRITICAL
**Dependencies**: None

**Description**: Ensure ALL ASAF API routes use `extractProjectDirectory()` instead of manual path decoding

**Files to Audit**:
- `/Users/elik.k/git/claudecodeui/server/routes/asaf.js`

**Changes Required**:
1. Remove fallback manual decoding: `encodedPath.replace(/-/g, '/')`
2. Always use `extractProjectDirectory()` and handle errors properly
3. Add debug logging for path resolution

**DoD**:
- [ ] No manual path decoding in asaf.js
- [ ] `extractProjectDirectory()` used consistently
- [ ] Panel appears for `asaf-for-claude-code` project
- [ ] Tested with project containing hyphens

---

### Frontend Tasks

#### Task 5: Update useASAFData Hook
**Status**: Not Started
**Estimated Time**: 1 hour
**Priority**: High
**Dependencies**: Task 2

**Description**: Add sprint list and selection management to useASAFData hook

**Files to Modify**:
- `/Users/elik.k/git/claudecodeui/src/hooks/useASAFData.js` (or similar location)

**Functions to Add**:
1. `fetchCurrentSelection(project)` - GET /current
2. `fetchAllSprints(project)` - GET /list
3. `selectSprint(project, sprintName)` - POST /select

**State to Add**:
- `allSprints` - Array of sprint metadata
- `currentSelection` - Current selection object

**WebSocket Handling**:
- Listen for `asaf:sprint-selected`
- Listen for `asaf:sprint-selection-changed`
- Refresh sprint data when events match current project

**DoD**:
- [ ] All 3 fetch functions implemented
- [ ] State variables added
- [ ] WebSocket listeners implemented
- [ ] Refresh logic on sprint selection events
- [ ] Error handling for API failures

---

#### Task 6: Create ASAFSprintSelector Component
**Status**: Not Started
**Estimated Time**: 1.5 hours
**Priority**: High
**Dependencies**: Task 5

**Description**: Build dropdown component for sprint selection

**File to Create**:
- `/Users/elik.k/git/claudecodeui/src/components/asaf/ASAFSprintSelector.jsx`

**Component Props**:
- `allSprints` - Array of sprint objects
- `currentSprintName` - Currently selected sprint
- `onSelectSprint(sprintName)` - Selection callback
- `isLoading` - Loading state

**Features**:
- Dropdown with backdrop (click outside to close)
- Button shows "X sprints" with chevron icon
- Each sprint shows: name, phase badge, status, last updated
- Current sprint highlighted with star + checkmark
- Hidden if 0 or 1 sprint

**DoD**:
- [ ] Component created with all features
- [ ] Styled with Tailwind CSS
- [ ] Dark mode support
- [ ] Mobile responsive
- [ ] Loading state disables button
- [ ] Keyboard accessible (Escape to close)

---

#### Task 7: Update ASAFPanelHeader to Integrate Selector
**Status**: Not Started
**Estimated Time**: 30 minutes
**Priority**: Medium
**Dependencies**: Task 6

**Description**: Add sprint selector to panel header

**Files to Modify**:
- `/Users/elik.k/git/claudecodeui/src/components/asaf/ASAFPanelHeader.jsx`

**Changes Required**:
1. Import `ASAFSprintSelector`
2. Add new props: `allSprints`, `currentSprintName`, `onSelectSprint`, `isLoading`
3. Render selector between sprint name and collapse button

**DoD**:
- [ ] Selector integrated in header
- [ ] Layout doesn't break on mobile
- [ ] Selector positioned correctly (right side)
- [ ] Props passed from parent

---

#### Task 8: Update ASAFPanel to Pass Props
**Status**: Not Started
**Estimated Time**: 30 minutes
**Priority**: Medium
**Dependencies**: Task 5, Task 7

**Description**: Wire up useASAFData hook to ASAFPanel and pass props to header

**Files to Modify**:
- `/Users/elik.k/git/claudecodeui/src/components/asaf/ASAFPanel.jsx`

**Changes Required**:
1. Destructure new values from `useASAFData`: `allSprints`, `currentSelection`, `selectSprint`
2. Create `handleSelectSprint` function
3. Pass props to `ASAFPanelHeader`

**DoD**:
- [ ] Props passed correctly
- [ ] Sprint selection triggers refresh
- [ ] Error handling for selection failures
- [ ] Loading state managed

---

### Testing & Polish Tasks

#### Task 9: Test Critical Path Encoding Fix
**Status**: Not Started
**Estimated Time**: 30 minutes
**Priority**: CRITICAL
**Dependencies**: Task 4

**Description**: Verify panel appears for `asaf-for-claude-code` project

**Test Steps**:
1. Open project `/Users/elik.k/git/asaf-for-claude-code`
2. Verify ASAF panel appears
3. Check browser console for errors
4. Verify API calls succeed
5. Test sprint selector (if multiple sprints)

**DoD**:
- [ ] Panel visible for hyphenated project
- [ ] No console errors
- [ ] API calls use correct path
- [ ] No regressions for other projects

---

#### Task 10: Test Sprint Selection (Auto, Manual, UI)
**Status**: Not Started
**Estimated Time**: 45 minutes
**Priority**: High
**Dependencies**: Task 1-8

**Description**: End-to-end testing of sprint selection flows

**Test Scenarios**:
1. **Auto-Selection**: Delete `.current-sprint.json`, verify auto-select most recent
2. **Manual Selection (UI)**: Click dropdown, select different sprint
3. **Manual Selection (Terminal)**: Run `/asaf-select sprint-b`, verify UI updates

**DoD**:
- [ ] Auto-selection works correctly
- [ ] UI selection updates `.current-sprint.json`
- [ ] Panel refreshes after selection
- [ ] No race conditions or stale data

---

#### Task 11: Test Real-Time Sync (Terminal ↔ UI)
**Status**: Not Started
**Estimated Time**: 30 minutes
**Priority**: High
**Dependencies**: Task 3, Task 5

**Description**: Verify terminal and UI stay synchronized

**Test Scenarios**:
1. **Terminal → UI**: Select sprint in terminal, verify UI updates within 2 seconds
2. **UI → UI**: Open 2 tabs, select in tab 1, verify tab 2 updates
3. **Reconnect**: Disconnect WebSocket, change sprint, reconnect, verify sync

**DoD**:
- [ ] Terminal selection syncs to UI < 2 seconds
- [ ] Multi-tab sync works
- [ ] WebSocket reconnection triggers refresh
- [ ] File watcher events broadcast correctly

---

#### Task 12: Final Integration Testing
**Status**: Not Started
**Estimated Time**: 1 hour
**Priority**: Medium
**Dependencies**: All previous tasks

**Description**: Comprehensive testing of all features and edge cases

**Test Matrix**:
- [ ] Single sprint project (selector hidden)
- [ ] Multi-sprint project (selector visible)
- [ ] Corrupted `.current-sprint.json` (auto-repaired)
- [ ] Selected sprint deleted (auto-reselect)
- [ ] Rapid sprint switching (no race conditions)
- [ ] Permission denied (error shown)
- [ ] Mobile responsive (viewport < 768px)
- [ ] Dark mode works

**DoD**:
- [ ] All acceptance criteria from acceptance-criteria.md pass
- [ ] No regressions in existing ASAF functionality
- [ ] Performance acceptable (API < 500ms)
- [ ] Ready for production

---

## Task Summary

| Task | Type | Priority | Est. Time | Status |
|------|------|----------|-----------|--------|
| 1 | Backend | Critical | 1.5h | Not Started |
| 2 | Backend | Critical | 1h | Not Started |
| 3 | Backend | High | 45m | Not Started |
| 4 | Backend | CRITICAL | 30m | Not Started |
| 5 | Frontend | High | 1h | Not Started |
| 6 | Frontend | High | 1.5h | Not Started |
| 7 | Frontend | Medium | 30m | Not Started |
| 8 | Frontend | Medium | 30m | Not Started |
| 9 | Testing | CRITICAL | 30m | Not Started |
| 10 | Testing | High | 45m | Not Started |
| 11 | Testing | High | 30m | Not Started |
| 12 | Testing | Medium | 1h | Not Started |

**Total Tasks**: 12
**Total Estimated Time**: ~10 hours
**Critical Path**: Tasks 1, 2, 4, 5, 6 → 7, 8 → 9, 10, 11 → 12

---

## Implementation Order

### Phase 1: Backend Foundation (3 hours)
1. Task 1: Update asaf-reader.js
2. Task 4: Fix path encoding (in parallel)
3. Task 2: Add API endpoints
4. Task 3: Add WebSocket watcher

### Phase 2: Frontend UI (3 hours)
5. Task 5: Update useASAFData hook
6. Task 6: Create ASAFSprintSelector component
7. Task 7: Update ASAFPanelHeader
8. Task 8: Update ASAFPanel

### Phase 3: Testing (2.5 hours)
9. Task 9: Test path encoding fix
10. Task 10: Test sprint selection
11. Task 11: Test real-time sync
12. Task 12: Final integration testing

---

**Next Step**: Begin Task 1 - Update asaf-reader.js
