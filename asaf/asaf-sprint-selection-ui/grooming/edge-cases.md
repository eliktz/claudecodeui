# Edge Cases Analysis: ASAF Sprint Selection Support

**Sprint**: asaf-sprint-selection-ui
**Phase**: Grooming
**Created**: November 3, 2025
**Status**: Comprehensive Analysis

---

## Table of Contents

1. [Sprint Selection Edge Cases](#sprint-selection-edge-cases)
2. [Panel Visibility Edge Cases](#panel-visibility-edge-cases)
3. [WebSocket Synchronization Edge Cases](#websocket-synchronization-edge-cases)
4. [Multi-Client Edge Cases](#multi-client-edge-cases)
5. [Performance Edge Cases](#performance-edge-cases)
6. [Security Edge Cases](#security-edge-cases)
7. [Summary Matrix](#summary-matrix)

---

## Sprint Selection Edge Cases

### EC-1: No `.current-sprint.json` Exists

**Scenario**: User has 3 sprints, but no `.current-sprint.json` file

**Steps to Reproduce**:
1. Create 3 sprints: `sprint-a`, `sprint-b`, `sprint-c`
2. Delete `.current-sprint.json` (if exists)
3. Open Claude Code UI

**Expected Behavior**:
- Backend auto-selects most recent sprint (by `.state.json` mtime)
- Backend creates `.current-sprint.json` automatically
- UI shows auto-selected sprint
- Sprint selector shows all 3 sprints

**Handling Strategy**:
- `readAsafSprintData()` detects missing file (Step 2)
- Calls `getAllSprints()` to get all sprints
- Selects `allSprints[0]` (most recent)
- Calls `createCurrentSprintSelection()` to persist choice
- Returns sprint data with `isAutoSelected: true` flag

**Code Location**: `asaf-reader.js:line 41-60`

**Test Case**:
```javascript
// Precondition: No .current-sprint.json
const result = await readAsafSprintData('/path/to/project');
expect(result.exists).toBe(true);
expect(result.isAutoSelected).toBe(true);
expect(result.sprintName).toBe('sprint-c'); // Most recent
// Verify .current-sprint.json was created
const selection = await getCurrentSprintSelection('/path/to/project');
expect(selection.sprint).toBe('sprint-c');
```

---

### EC-2: Corrupted `.current-sprint.json` (Invalid JSON)

**Scenario**: `.current-sprint.json` exists but contains invalid JSON

**Steps to Reproduce**:
1. Create `.current-sprint.json` with content: `{invalid json}`
2. Open Claude Code UI

**Expected Behavior**:
- Backend catches JSON parse error
- Logs warning: "Corrupted .current-sprint.json"
- Treats as missing file → auto-selects
- Creates new valid `.current-sprint.json`

**Handling Strategy**:
- `getCurrentSprintSelection()` has try-catch for `JSON.parse()`
- `SyntaxError` caught → return `null`
- `readAsafSprintData()` proceeds to auto-selection
- Overwrites corrupted file with valid one

**Code Location**: `asaf-reader.js:getCurrentSprintSelection()` line 10-15

**Test Case**:
```javascript
// Precondition: Corrupted .current-sprint.json
await fs.writeFile('asaf/.current-sprint.json', '{invalid}', 'utf8');
const result = await readAsafSprintData('/path/to/project');
expect(result.exists).toBe(true);
expect(result.isAutoSelected).toBe(true);
// Verify file was fixed
const selection = await getCurrentSprintSelection('/path/to/project');
expect(selection).not.toBeNull();
expect(selection.sprint).toBeTruthy();
```

---

### EC-3: `.current-sprint.json` Missing Required Fields

**Scenario**: Valid JSON but missing `sprint`, `selected_at`, or `type`

**Steps to Reproduce**:
1. Create `.current-sprint.json`: `{"sprint": "feature-a"}` (missing other fields)
2. Open Claude Code UI

**Expected Behavior**:
- Backend validates structure
- Detects missing fields
- Logs warning: "Invalid .current-sprint.json structure"
- Treats as invalid → auto-selects
- Creates new valid file

**Handling Strategy**:
- `getCurrentSprintSelection()` validates all required fields
- Returns `null` if any missing
- Auto-selection overwrites invalid file

**Code Location**: `asaf-reader.js:getCurrentSprintSelection()` line 7-9

**Test Case**:
```javascript
await fs.writeFile('asaf/.current-sprint.json', '{"sprint":"feature-a"}', 'utf8');
const selection = await getCurrentSprintSelection('/path/to/project');
expect(selection).toBeNull(); // Invalid structure
```

---

### EC-4: Selected Sprint Deleted

**Scenario**: `.current-sprint.json` points to `feature-a`, but `asaf/feature-a/` folder deleted

**Steps to Reproduce**:
1. Select `feature-a` (creates `.current-sprint.json`)
2. Delete `asaf/feature-a/` directory
3. Refresh UI

**Expected Behavior**:
- Backend reads `.current-sprint.json` → `feature-a`
- Tries to read `asaf/feature-a/.state.json` → fails
- Logs warning: "Selected sprint 'feature-a' is invalid or deleted"
- Auto-selects from remaining sprints
- Updates `.current-sprint.json` to new selection

**Handling Strategy**:
- `readAsafSprintData()` calls `readSingleSprintData(feature-a)`
- Returns `{valid: false}` (missing files)
- Falls through to auto-selection logic
- Updates selection file

**Code Location**: `asaf-reader.js:readAsafSprintData()` line 23-39

**Test Case**:
```javascript
// Precondition: .current-sprint.json points to deleted sprint
await createCurrentSprintSelection('/path', 'deleted-sprint', 'full');
await fs.rm('asaf/deleted-sprint', { recursive: true });
const result = await readAsafSprintData('/path/to/project');
expect(result.sprintName).not.toBe('deleted-sprint');
expect(result.isAutoSelected).toBe(true);
```

---

### EC-5: Only One Sprint Exists

**Scenario**: Project has exactly 1 sprint

**Steps to Reproduce**:
1. Create `asaf/feature-a/` with valid structure
2. Open Claude Code UI

**Expected Behavior**:
- Backend auto-selects the only sprint
- Creates `.current-sprint.json`
- Frontend fetches sprint list → 1 sprint
- **Sprint selector HIDDEN** (nothing to switch)

**Handling Strategy**:
- `ASAFSprintSelector.jsx` checks `allSprints.length <= 1`
- Returns `null` (don't render)
- Panel still shows sprint name in header

**Code Location**: `ASAFSprintSelector.jsx` line 14-16

**Test Case**:
```jsx
const { container } = render(
  <ASAFSprintSelector allSprints={[{name: 'feature-a'}]} />
);
expect(container.firstChild).toBeNull(); // Not rendered
```

---

### EC-6: No Valid Sprints Exist

**Scenario**: `/asaf/` directory exists but contains no valid sprints (all corrupted)

**Steps to Reproduce**:
1. Create `asaf/sprint-a/` without `.state.json`
2. Create `asaf/sprint-b/.state.json` with invalid phase
3. Open Claude Code UI

**Expected Behavior**:
- Backend scans all directories
- All fail validation
- `getAllSprints()` returns `[]`
- `readAsafSprintData()` returns `{exists: false, error: "No valid sprints"}`
- Frontend: Panel doesn't render (hidden)

**Handling Strategy**:
- `getAllSprints()` skips invalid sprints (try-catch per sprint)
- Returns empty array
- `readAsafSprintData()` checks `allSprints.length === 0`
- Returns early with `exists: false`

**Code Location**: `asaf-reader.js:getAllSprints()` line 30-47

**Test Case**:
```javascript
// Precondition: All sprints invalid
const result = await readAsafSprintData('/path/to/project');
expect(result.exists).toBe(false);
expect(result.error).toContain('No valid sprints');
```

---

### EC-7: Rapid Sprint Switching (Race Condition)

**Scenario**: User clicks sprint selector and switches 3 times rapidly

**Steps to Reproduce**:
1. Open sprint selector
2. Click `sprint-a` → `sprint-b` → `sprint-c` (within 500ms)
3. Watch network requests

**Expected Behavior**:
- 3 POST requests sent
- All 3 succeed (idempotent)
- Last request wins (`.current-sprint.json` = `sprint-c`)
- UI shows `sprint-c` (not intermediate states)
- WebSocket events emitted for all 3 (OK - handled gracefully)

**Handling Strategy**:
- Frontend: Disable button during loading (`isLoading` prop)
- Backend: File write is atomic (last write wins)
- `selectSprint()` waits for response before re-enabling
- AbortController cancels in-flight GET requests when new POST starts

**Code Location**: `useASAFData.js:selectSprint()`, `ASAFSprintSelector.jsx`

**Test Case**:
```javascript
// Simulate rapid clicks
await selectSprint(project, 'sprint-a');
await selectSprint(project, 'sprint-b');
await selectSprint(project, 'sprint-c');
const selection = await getCurrentSprintSelection('/path');
expect(selection.sprint).toBe('sprint-c'); // Last wins
```

---

### EC-8: Sprint Selection During API Request

**Scenario**: User switches project while sprint selection API call in flight

**Steps to Reproduce**:
1. Select `sprint-a` (POST /select in progress)
2. Switch to different project before response

**Expected Behavior**:
- POST completes successfully
- `.current-sprint.json` updated for old project
- Frontend aborts GET requests for old project (AbortController)
- Frontend fetches data for new project
- No stale state shown

**Handling Strategy**:
- `useASAFData` uses `AbortController` for GET requests
- POST requests complete even if component unmounts (OK - server state updated)
- `fetchSprintData()` checks if project changed before setting state
- Use `inFlightProjectPathRef` to track current request

**Code Location**: `useASAFData.js:fetchSprintData()` line 68-80

---

## Panel Visibility Edge Cases

### EC-9: Project Path with Hyphens (Path Encoding Issue)

**Scenario**: Project path contains hyphens: `/Users/elik.k/git/asaf-for-claude-code`

**Steps to Reproduce**:
1. Open project `asaf-for-claude-code`
2. Check if ASAF panel appears

**Expected Behavior**:
- Panel appears correctly
- API calls use `extractProjectDirectory()` for decoding
- No ambiguity between path separator hyphens and original hyphens

**Handling Strategy**:
- **NEVER** manually decode with `.replace(/-/g, '/')`
- **ALWAYS** use `extractProjectDirectory(encodedPath)`
- This function looks up project in known projects list
- Returns actual absolute path

**Code Location**: `asaf.js:router.get()` line 55

**Test Case**:
```javascript
// Project: /Users/elik.k/git/asaf-for-claude-code
const encoded = '-Users-elik.k-git-asaf-for-claude-code';
const decoded = await extractProjectDirectory(encoded);
expect(decoded).toBe('/Users/elik.k/git/asaf-for-claude-code');
// NOT /Users/elik.k/git/asaf/for/claude/code
```

---

### EC-10: Project Path with Special Characters

**Scenario**: Project path contains spaces, ampersands, or Unicode: `/Users/test/My Project & Stuff 日本語/`

**Steps to Reproduce**:
1. Create project with special chars
2. Open in Claude Code UI

**Expected Behavior**:
- Path encoding handles all characters
- `extractProjectDirectory()` looks up by normalized path
- API calls succeed
- Panel appears

**Handling Strategy**:
- Project discovery uses file system directly (not URL encoding)
- `extractProjectDirectory()` uses Map lookup (supports any string key)
- No URL encoding/decoding issues

**Code Location**: `projects.js:extractProjectDirectory()`

**Test Case**:
```javascript
const projectPath = '/Users/test/My Project & Stuff/';
const encoded = projectPath.replace(/\//g, '-');
const decoded = await extractProjectDirectory(encoded);
expect(decoded).toBe(projectPath);
```

---

### EC-11: Project Not in Known Projects List

**Scenario**: User manually types project path that's not in `.claude/projects/`

**Steps to Reproduce**:
1. Navigate to unknown project (via URL hack)
2. Check ASAF panel

**Expected Behavior**:
- `extractProjectDirectory()` throws error
- API returns 403 Forbidden
- Panel doesn't appear
- No security vulnerability

**Handling Strategy**:
- `extractProjectDirectory()` validates against known projects
- Returns 403 if not found
- Frontend handles 403 gracefully (no error spam)

**Code Location**: `asaf.js:router.get()` line 52-60

**Test Case**:
```javascript
const response = await fetch('/api/asaf/-unknown-project');
expect(response.status).toBe(403);
const data = await response.json();
expect(data.error).toContain('access denied');
```

---

### EC-12: ASAF Directory Exists But Is Not Directory

**Scenario**: `/asaf` is a file, not a directory (weird edge case)

**Steps to Reproduce**:
1. Create file: `touch asaf` (not `mkdir asaf`)
2. Open Claude Code UI

**Expected Behavior**:
- Backend checks `stats.isDirectory()`
- Returns `{exists: false, error: "asaf path exists but is not a directory"}`
- Panel doesn't appear
- Clear error message

**Handling Strategy**:
- `readAsafSprintData()` explicitly checks `stats.isDirectory()`
- Returns descriptive error

**Code Location**: `asaf-reader.js:readAsafSprintData()` line 30-34

**Test Case**:
```javascript
// Precondition: /asaf is a file
await fs.writeFile('asaf', 'not a directory', 'utf8');
const result = await readAsafSprintData('/path/to/project');
expect(result.exists).toBe(false);
expect(result.error).toContain('not a directory');
```

---

### EC-13: Permission Denied on ASAF Directory

**Scenario**: `/asaf/` directory exists but user lacks read permission

**Steps to Reproduce**:
1. `chmod 000 asaf/`
2. Open Claude Code UI

**Expected Behavior**:
- Backend gets EACCES error
- Throws error (doesn't suppress)
- API returns 500 with clear message: "Permission denied accessing ASAF files"
- Frontend shows error state in panel

**Handling Strategy**:
- Don't catch permission errors silently
- Throw them up to API handler
- API returns 500 with user-friendly message
- Frontend renders `ASAFErrorState` component

**Code Location**: `asaf-reader.js:readAsafSprintData()` line 41-44

**Test Case**:
```javascript
// Precondition: No read permission
await fs.chmod('asaf', 0o000);
await expect(readAsafSprintData('/path')).rejects.toThrow('Permission denied');
```

---

## WebSocket Synchronization Edge Cases

### EC-14: WebSocket Disconnected During Sprint Selection

**Scenario**: User selects sprint from UI, but WebSocket connection drops before event broadcast

**Steps to Reproduce**:
1. Open UI
2. Kill WebSocket connection (e.g., network tab → disable)
3. Select sprint from UI

**Expected Behavior**:
- POST /select succeeds (HTTP, not WebSocket)
- `.current-sprint.json` updated
- WebSocket event NOT emitted (no connection)
- UI refreshes via HTTP response (not WebSocket)
- Other clients don't get update immediately
- When WebSocket reconnects, they auto-refresh (reconnect handler)

**Handling Strategy**:
- POST /select doesn't depend on WebSocket for success
- Frontend refreshes after POST response
- `useASAFData` has WebSocket reconnection handler
- Calls `fetchSprintData()` on reconnect

**Code Location**: `useASAFData.js:useEffect` line 222-228

**Test Case**:
```javascript
// Disconnect WebSocket
ws.close();
// Select sprint
const response = await fetch('/api/asaf/.../select', { method: 'POST', body: ... });
expect(response.ok).toBe(true); // Still succeeds
// Reconnect
ws = new WebSocket('...');
// Verify data refreshes
await waitFor(() => expect(fetchSprintData).toHaveBeenCalled());
```

---

### EC-15: File Watcher Event Fires Before File Write Complete

**Scenario**: Chokidar detects `.current-sprint.json` change, but file write still in progress (incomplete)

**Steps to Reproduce**:
1. Run `/asaf-select` in terminal
2. File watcher fires immediately
3. Backend reads file before write completes

**Expected Behavior**:
- File write is atomic (OS guarantees)
- Chokidar waits for write to complete (buffering)
- Backend always reads complete file
- No partial JSON reads

**Handling Strategy**:
- Rely on chokidar's built-in debouncing
- OS file writes are atomic for small files (<4KB)
- `.current-sprint.json` is ~100 bytes → always atomic
- If partial read somehow occurs, JSON.parse() fails → treated as corrupted

**Code Location**: File watcher setup in `server/index.js`

**Test Case**:
```javascript
// Simulate file write
await fs.writeFile('.current-sprint.json', JSON.stringify(selection));
// File watcher event fires
// Read should always succeed
const selection = await getCurrentSprintSelection('/path');
expect(selection).not.toBeNull();
```

---

### EC-16: Multiple WebSocket Clients (Multi-Tab)

**Scenario**: User has 3 browser tabs open, selects sprint in tab 1

**Steps to Reproduce**:
1. Open 3 tabs pointing to same project
2. In tab 1, select `sprint-b`
3. Observe tabs 2 and 3

**Expected Behavior**:
- Tab 1: POST /select → immediate refresh
- Backend: Emit `asaf:sprint-selected` event
- Tabs 2 & 3: Receive WebSocket event
- Tabs 2 & 3: Refresh sprint data (GET /api/asaf)
- All tabs show `sprint-b` within 1-2 seconds

**Handling Strategy**:
- WebSocket server broadcasts to ALL clients
- Each client checks if event is for their current project
- If match, call `fetchSprintData()`
- No race condition (GET is idempotent)

**Code Location**: `asaf.js:POST /select` line 49-60, `useASAFData.js` WebSocket handler

**Test Case**:
```javascript
// Tab 1: Select sprint
await selectSprint('sprint-b');
// Tab 2 & 3: Receive WebSocket event
const event = await waitForWebSocketMessage();
expect(event.type).toBe('asaf:sprint-selected');
expect(event.sprint).toBe('sprint-b');
// All tabs refresh
expect(fetchSprintData).toHaveBeenCalledTimes(3);
```

---

### EC-17: Terminal and UI Select Different Sprints Simultaneously

**Scenario**: User selects `sprint-a` in terminal, then immediately selects `sprint-b` in UI (within 100ms)

**Steps to Reproduce**:
1. Run `/asaf-select sprint-a` in terminal
2. Within 100ms, click `sprint-b` in UI dropdown

**Expected Behavior**:
- Terminal: Writes `.current-sprint.json` (sprint-a)
- UI: POST /select (sprint-b)
- Backend: POST overwrites file (sprint-b wins)
- File watcher: Detects 2 changes (may coalesce)
- Final state: `sprint-b` (last write wins)
- UI shows `sprint-b`

**Handling Strategy**:
- File system write is atomic
- Last write wins (acceptable behavior)
- Both operations are valid
- No data corruption

**Code Location**: File write in `createCurrentSprintSelection()`

**Test Case**:
```javascript
// Simulate simultaneous writes
await Promise.all([
  createCurrentSprintSelection('/path', 'sprint-a', 'full'),
  createCurrentSprintSelection('/path', 'sprint-b', 'full')
]);
const selection = await getCurrentSprintSelection('/path');
// One of them wins (deterministic by OS)
expect(['sprint-a', 'sprint-b']).toContain(selection.sprint);
```

---

## Multi-Client Edge Cases

### EC-18: UI Client and Terminal Client Out of Sync

**Scenario**: User selects `sprint-a` in terminal 5 minutes ago, opens UI now

**Steps to Reproduce**:
1. Terminal: `/asaf-select sprint-a` (creates `.current-sprint.json`)
2. Wait 5 minutes
3. Open Claude Code UI

**Expected Behavior**:
- UI loads
- Backend reads `.current-sprint.json` → `sprint-a`
- UI shows `sprint-a` (synced with terminal)
- No confusion

**Handling Strategy**:
- `.current-sprint.json` is source of truth
- UI always reads file on load
- No in-memory cache conflicts

**Code Location**: `readAsafSprintData()` always reads file system

---

### EC-19: User Deletes `.current-sprint.json` While UI Open

**Scenario**: User manually deletes `.current-sprint.json` via terminal/file manager

**Steps to Reproduce**:
1. UI showing `sprint-a`
2. Terminal: `rm asaf/.current-sprint.json`
3. File watcher detects deletion

**Expected Behavior**:
- File watcher emits `asaf:sprint-selection-changed` (or `unlink` event)
- UI receives event
- UI refreshes: `GET /api/asaf/:projectPath`
- Backend: No selection → auto-selects most recent
- Backend: Creates new `.current-sprint.json`
- UI shows auto-selected sprint

**Handling Strategy**:
- Watch for both `change` and `add` events (covers deletion → re-creation)
- `getCurrentSprintSelection()` returns `null` for missing file
- Auto-selection logic kicks in

**Code Location**: File watcher setup, `readAsafSprintData()`

**Test Case**:
```javascript
// Precondition: .current-sprint.json exists
await fs.unlink('asaf/.current-sprint.json');
// Trigger refresh
const result = await readAsafSprintData('/path');
expect(result.isAutoSelected).toBe(true);
// File re-created
const selection = await getCurrentSprintSelection('/path');
expect(selection).not.toBeNull();
```

---

## Performance Edge Cases

### EC-20: Project with 50 Sprints

**Scenario**: Power user has 50 concurrent sprints (unlikely but possible)

**Steps to Reproduce**:
1. Create 50 sprints: `sprint-01` to `sprint-50`
2. Open Claude Code UI

**Expected Behavior**:
- `getAllSprints()` reads all 50 `.state.json` files
- Returns array sorted by updated time
- Sprint selector shows all 50 (scrollable)
- Performance: < 500ms to load sprint list
- UI remains responsive

**Handling Strategy**:
- Backend: Sequential reads (simplicity over performance for now)
- For 50 sprints × 1ms per read = 50ms (acceptable)
- Frontend: Virtual scrolling if needed (future optimization)
- Limit dropdown height, add scroll

**Code Location**: `getAllSprints()`, `ASAFSprintSelector.jsx` (max-height CSS)

**Performance Test**:
```javascript
// Create 50 sprints
const start = Date.now();
const sprints = await getAllSprints('/path/to/project');
const elapsed = Date.now() - start;
expect(sprints.length).toBe(50);
expect(elapsed).toBeLessThan(500); // < 500ms
```

---

### EC-21: Very Large `SUMMARY.md` File (10MB)

**Scenario**: Sprint has 10MB `SUMMARY.md` (generated docs)

**Steps to Reproduce**:
1. Create `SUMMARY.md` with 10MB of text
2. Load sprint in UI

**Expected Behavior**:
- Backend reads entire file (no streaming for now)
- May cause memory spike
- Frontend renders markdown (may be slow)
- Consider truncation or pagination for large summaries (future)

**Handling Strategy**:
- Accept limitation for now (edge case)
- Future: Add file size check, truncate > 1MB
- Future: Lazy load summary content

**Code Location**: `readSingleSprintData()` reads SUMMARY.md

**Mitigation** (future):
```javascript
const stats = await fs.stat(summaryPath);
if (stats.size > 1024 * 1024) { // > 1MB
  summaryContent = '*Summary too large to display*';
}
```

---

## Security Edge Cases

### EC-22: Path Traversal in Sprint Name

**Scenario**: Malicious user creates sprint: `../../../etc/passwd`

**Steps to Reproduce**:
1. Attempt to create sprint with path traversal name
2. Try to select it via API

**Expected Behavior**:
- Sprint name validation (ASAF CLI level)
- Backend: `getAllSprints()` only reads direct children of `/asaf/`
- `readdir()` doesn't follow `..` paths
- No access to files outside `/asaf/`

**Handling Strategy**:
- Rely on `readdir()` safety (only returns direct children)
- Don't use user input in path construction beyond sprint name
- `path.join(asafDir, entry.name)` is safe (normalizes path)

**Code Location**: `getAllSprints()` uses `readdir(asafDir, {withFileTypes: true})`

**Test Case**:
```javascript
// Attempt to create malicious sprint name
const sprints = await getAllSprints('/path');
// Should only contain valid sprint names, no path traversal
expect(sprints.every(s => !s.name.includes('..'))).toBe(true);
```

---

### EC-23: Race Condition in File Watcher (TOCTOU)

**Scenario**: File watcher detects change, but file deleted before API reads it

**Steps to Reproduce**:
1. Update `.current-sprint.json`
2. File watcher fires
3. Delete `.current-sprint.json` before WebSocket handler reads it

**Expected Behavior**:
- WebSocket event emitted (file changed)
- Frontend requests data
- Backend: `getCurrentSprintSelection()` returns `null` (file missing)
- Auto-selection logic handles it
- No crash

**Handling Strategy**:
- File read failures handled gracefully
- `getCurrentSprintSelection()` catches `ENOENT`
- Returns `null` → auto-select
- No security issue, just graceful degradation

**Code Location**: `getCurrentSprintSelection()` error handling

---

## Summary Matrix

| ID | Category | Severity | Handling | Status |
|----|----------|----------|----------|--------|
| EC-1 | Selection | Low | Auto-select + create file | Handled |
| EC-2 | Selection | Medium | Catch parse error, auto-select | Handled |
| EC-3 | Selection | Medium | Validate structure, auto-select | Handled |
| EC-4 | Selection | High | Detect invalid, auto-select new | Handled |
| EC-5 | UI | Low | Hide selector if 1 sprint | Handled |
| EC-6 | Selection | Medium | Return exists:false | Handled |
| EC-7 | Selection | Medium | Disable button, last write wins | Handled |
| EC-8 | Selection | Low | AbortController for GET | Handled |
| EC-9 | Visibility | **Critical** | Use extractProjectDirectory() | **FIX REQUIRED** |
| EC-10 | Visibility | Medium | File system lookup | Handled |
| EC-11 | Visibility | High | 403 Forbidden | Handled |
| EC-12 | Visibility | Low | Check isDirectory() | Handled |
| EC-13 | Visibility | High | Throw permission error | Handled |
| EC-14 | Sync | Medium | HTTP success, reconnect refresh | Handled |
| EC-15 | Sync | Low | Atomic writes + debouncing | Handled |
| EC-16 | Sync | Medium | Broadcast to all clients | Handled |
| EC-17 | Sync | Low | Last write wins (acceptable) | Handled |
| EC-18 | Sync | Low | File is source of truth | Handled |
| EC-19 | Sync | Medium | Watch add/change/unlink events | Handled |
| EC-20 | Performance | Low | Sequential reads OK for now | Handled |
| EC-21 | Performance | Low | Accept limitation (future: truncate) | Deferred |
| EC-22 | Security | High | readdir() only direct children | Handled |
| EC-23 | Security | Low | Catch ENOENT, graceful fallback | Handled |

---

## Critical Edge Cases Summary

**MUST FIX**:
1. **EC-9**: Path encoding with hyphens → Use `extractProjectDirectory()` everywhere
2. **EC-4**: Selected sprint deleted → Implement auto-reselection

**SHOULD HANDLE**:
3. **EC-2/EC-3**: Corrupted `.current-sprint.json` → Validation + auto-select
4. **EC-14**: WebSocket disconnect → Reconnect handler
5. **EC-16**: Multi-tab sync → Broadcast events

**NICE TO HAVE**:
6. **EC-20**: Performance with many sprints → Optimize if needed
7. **EC-21**: Large SUMMARY.md → Add size limit

---

**Total Edge Cases Identified**: 23
**Critical**: 2
**High Priority**: 5
**Medium Priority**: 10
**Low Priority**: 6

**Status**: Comprehensive analysis complete
**Next Step**: Proceed to acceptance criteria definition
