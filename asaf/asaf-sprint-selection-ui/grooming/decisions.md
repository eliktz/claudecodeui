# Technical Decisions: ASAF Sprint Selection Support

**Sprint**: asaf-sprint-selection-ui
**Phase**: Grooming
**Created**: November 3, 2025
**Status**: Decisions Finalized

---

## Table of Contents

1. [Decision Summary](#decision-summary)
2. [Architecture Decisions](#architecture-decisions)
3. [API Design Decisions](#api-design-decisions)
4. [UI/UX Decisions](#uiux-decisions)
5. [Synchronization Decisions](#synchronization-decisions)
6. [Implementation Decisions](#implementation-decisions)
7. [Deferred Decisions](#deferred-decisions)

---

## Decision Summary

| ID | Decision | Chosen Approach | Alternatives Considered | Impact |
|----|----------|-----------------|-------------------------|--------|
| D-1 | Sprint selection source of truth | `.current-sprint.json` file | In-memory cache, Database | High |
| D-2 | Auto-selection algorithm | Most recent by mtime | User prompt, First created | High |
| D-3 | Sprint selector UI pattern | Dropdown in header | Modal, Sidebar, Tabs | Medium |
| D-4 | WebSocket event naming | Two events (selected, changed) | Single event | Low |
| D-5 | Path encoding resolution | Use extractProjectDirectory() | Fix encoding algorithm | **Critical** |
| D-6 | API endpoint structure | RESTful sub-resources | Query parameters | Medium |
| D-7 | Single sprint handling | Hide selector completely | Show disabled selector | Low |
| D-8 | Error handling strategy | Graceful degradation + auto-select | Fail loudly with modal | High |
| D-9 | Sprint list sorting | Server-side by mtime | Client-side alphabetical | Low |
| D-10 | File watcher scope | Watch .current-sprint.json only | Watch entire /asaf/ | Medium |

---

## Architecture Decisions

### D-1: Sprint Selection Source of Truth

**Decision**: Use `.current-sprint.json` file as single source of truth

**Rationale**:
1. **ASAF CLI Compatibility**: ASAF framework already uses this file for sprint selection via `/asaf-select` command
2. **Multi-Client Consistency**: File system state shared between terminal, UI, and any future clients
3. **Simplicity**: No need for database, no cache invalidation complexity
4. **Durability**: Selection persists across restarts, crashes, browser refreshes

**Alternatives Considered**:

**Option A: In-Memory Cache (Backend)**
- Pros: Fast access, no file I/O on every request
- Cons: State lost on server restart, multi-instance deployment issues, out of sync with terminal
- **Rejected**: Violates single source of truth principle

**Option B: Database (SQLite)**
- Pros: Structured queries, relational data, atomic transactions
- Cons: Overkill for simple key-value storage, adds complexity, still out of sync with ASAF CLI
- **Rejected**: Too complex for this use case

**Option C: LocalStorage (Frontend)**
- Pros: Client-side state, fast access
- Cons: Per-client state (no sync), lost on cache clear, terminal doesn't access it
- **Rejected**: Doesn't solve terminal → UI sync problem

**Chosen**: `.current-sprint.json` file (matches ASAF's design)

**Trade-offs Accepted**:
- File I/O on every API request (mitigated by caching in future if needed)
- Possible TOCTOU race conditions (handled gracefully with error recovery)
- File corruption risk (handled with validation + auto-select fallback)

**Impact**: High - Affects all sprint selection logic

---

### D-2: Auto-Selection Algorithm

**Decision**: Auto-select most recently updated sprint (by `.state.json` mtime)

**Rationale**:
1. **User Intent Alignment**: Most recently modified sprint is likely the one user is working on
2. **ASAF CLI Compatibility**: ASAF's `/asaf-status` and commands use same algorithm
3. **Predictable Behavior**: Deterministic (not random), reproducible
4. **No User Interruption**: No modal asking "Which sprint?" on first load

**Alternatives Considered**:

**Option A: Prompt User on First Load**
- Pros: User explicitly chooses, no assumptions
- Cons: Interrupts workflow, annoying for single-sprint projects, modal UI complexity
- **Rejected**: Bad UX, unnecessary friction

**Option B: Alphabetical First**
- Pros: Simple, deterministic
- Cons: Arbitrary, ignores temporal context, doesn't match ASAF CLI
- **Rejected**: Not aligned with ASAF's design

**Option C: First Created (by .state.json created field)**
- Pros: Stable over time (doesn't change)
- Cons: Old sprint might be auto-selected after weeks of inactivity
- **Rejected**: Doesn't reflect current work

**Chosen**: Most recent by mtime (matches ASAF)

**Trade-offs Accepted**:
- Mtime can be misleading (e.g., file touched accidentally)
- User might expect different sprint (mitigated by clear UI showing selection)

**Impact**: High - Defines default behavior for all users

---

### D-3: Path Encoding Resolution (CRITICAL FIX)

**Decision**: Use `extractProjectDirectory(encodedPath)` for ALL path decoding

**Rationale**:
1. **Solves Hyphen Ambiguity**: Project `asaf-for-claude-code` has hyphens; naive decoding breaks
2. **Security**: Validates project against known projects list (no arbitrary paths)
3. **Accuracy**: Looks up actual absolute path from `.claude/projects/` metadata
4. **Existing Pattern**: `extractProjectDirectory()` already used in other API routes

**Problem Context**:
```
Project path: /Users/elik.k/git/asaf-for-claude-code
Encoded:      -Users-elik.k-git-asaf-for-claude-code

Naive decoding (WRONG):
encodedPath.replace(/-/g, '/')
→ /Users/elik.k/git/asaf/for/claude/code  ❌ Incorrect!

Correct decoding (extractProjectDirectory):
→ /Users/elik.k/git/asaf-for-claude-code  ✅ Correct!
```

**Alternatives Considered**:

**Option A: Fix Encoding Algorithm (Escape Hyphens)**
- Idea: Replace `/` with `-` and `-` with `--` (or use Base64)
- Pros: Reversible encoding
- Cons: Complex, requires changes in multiple places, breaks existing URLs
- **Rejected**: Too invasive, not backward compatible

**Option B: Use URL Encoding (encodeURIComponent)**
- Pros: Standard, handles all special characters
- Cons: Ugly URLs (`%2F` everywhere), breaks existing API calls
- **Rejected**: Aesthetic concerns, breaking change

**Option C: Use Project ID Instead of Path**
- Pros: No encoding issues, short URLs
- Cons: Requires ID generation, mapping storage, doesn't match current system
- **Rejected**: Too large a refactor

**Chosen**: Use `extractProjectDirectory()` (existing function)

**Implementation Details**:
```javascript
// BEFORE (WRONG):
const actualProjectPath = encodedPath.replace(/-/g, '/');

// AFTER (CORRECT):
const actualProjectPath = await extractProjectDirectory(encodedPath);
```

**Trade-offs Accepted**:
- Requires project to be in known projects list (acceptable - security feature)
- Async lookup (minimal performance impact)

**Impact**: CRITICAL - Fixes panel visibility for `asaf-for-claude-code` project

---

## API Design Decisions

### D-4: API Endpoint Structure

**Decision**: Use RESTful sub-resources under `/api/asaf/:projectPath/`

**Chosen Endpoints**:
- `GET  /api/asaf/:projectPath/current`
- `GET  /api/asaf/:projectPath/list`
- `POST /api/asaf/:projectPath/select`

**Rationale**:
1. **RESTful Semantics**: Resources map to concepts (current selection, sprint list)
2. **Extensibility**: Easy to add more endpoints (e.g., `/history`, `/validate`)
3. **Clarity**: URL path indicates action (GET list vs GET current)
4. **Consistency**: Matches existing API structure in codebase

**Alternatives Considered**:

**Option A: Query Parameters**
- Example: `GET /api/asaf/:projectPath?action=list`
- Pros: Single endpoint
- Cons: Not RESTful, POST with query param is weird, harder to document
- **Rejected**: Violates REST principles

**Option B: RPC-Style**
- Example: `POST /api/asaf/:projectPath/actions/selectSprint`
- Pros: Explicit action naming
- Cons: Verbose, not idiomatic for REST APIs
- **Rejected**: Overcomplicates simple operations

**Chosen**: RESTful sub-resources

**Trade-offs Accepted**:
- More routes to maintain (3 new endpoints vs 1)
- Slightly more complex routing logic

**Impact**: Medium - Affects API structure and frontend integration

---

### D-5: WebSocket Event Naming

**Decision**: Use TWO separate WebSocket event types

**Event Types**:
1. **`asaf:sprint-selected`**: Emitted by backend after POST /select succeeds (UI-initiated)
2. **`asaf:sprint-selection-changed`**: Emitted by file watcher when `.current-sprint.json` changes (terminal-initiated)

**Rationale**:
1. **Semantic Clarity**: Different events have different sources and meanings
2. **Debugging**: Easier to trace where events originate (UI vs terminal)
3. **Future Extensibility**: May want different handling logic per event type

**Alternatives Considered**:

**Option A: Single Event Type (`asaf:selection-updated`)**
- Pros: Simpler (one event handler), less code
- Cons: Loses source context, harder to debug, less semantic
- **Rejected**: Clarity > simplicity

**Option B: Include Source in Payload**
- Example: `{type: "asaf:selection-updated", source: "ui" | "terminal"}`
- Pros: Single event type, source still known
- Cons: Requires payload inspection, less idiomatic
- **Rejected**: Event type should convey intent

**Chosen**: Two event types

**Trade-offs Accepted**:
- Frontend must handle two event types (minimal code duplication)
- Both trigger same action (refresh sprint data)

**Impact**: Low - Mostly affects logging and debugging

---

## UI/UX Decisions

### D-6: Sprint Selector UI Pattern

**Decision**: Dropdown button in panel header

**Component**: `ASAFSprintSelector.jsx` - Dropdown with backdrop

**Rationale**:
1. **Space Efficiency**: Dropdown doesn't take permanent screen space
2. **Discoverability**: Button always visible in header (when 2+ sprints)
3. **Familiarity**: Matches Git branch selector UX (common pattern)
4. **Accessibility**: Works on desktop and mobile (touch-friendly)

**Alternatives Considered**:

**Option A: Modal Dialog**
- Pros: More space for sprint details, focus-grabbing
- Cons: Interrupts workflow, requires extra click to close, feels heavy
- **Rejected**: Too disruptive for frequent operation

**Option B: Sidebar/Drawer**
- Pros: Persistent view of all sprints
- Cons: Takes screen space, requires toggle state, complex on mobile
- **Rejected**: Panel is already a sidebar; nested sidebar is awkward

**Option C: Tabs in Panel Header**
- Pros: Visual representation of all sprints, quick switching
- Cons: Limited space (doesn't scale to 5+ sprints), tab text truncated
- **Rejected**: Doesn't scale

**Option D: Inline Select Dropdown (Native `<select>`)**
- Pros: Native element, familiar, accessible
- Cons: Can't style richly (no phase badges, dates), looks dated
- **Rejected**: Insufficient metadata display

**Chosen**: Custom dropdown with backdrop (like Git branch selector)

**Design Details**:
- Button shows: "X sprints" with ChevronDown icon
- Dropdown shows: Sprint list with name, phase badge, status, date
- Current sprint: Star icon + checkmark + blue background
- Backdrop: Click outside to close
- Max height: 96 (24rem) with scroll

**Trade-offs Accepted**:
- Custom component vs native (more code to maintain)
- Works well for up to ~20 sprints; may need search for 50+ (edge case)

**Impact**: Medium - Primary user interaction for sprint switching

---

### D-7: Single Sprint Handling

**Decision**: Hide sprint selector completely when project has 0 or 1 sprint

**Rationale**:
1. **Simplicity**: No sprint selector = less visual clutter
2. **User Intent**: Can't "switch" when there's nothing to switch to
3. **Progressive Disclosure**: Feature appears only when needed

**Alternatives Considered**:

**Option A: Show Disabled Selector**
- Example: Button grayed out, tooltip "Only 1 sprint"
- Pros: User knows feature exists, consistent layout
- Cons: Disabled UI element (anti-pattern), takes space unnecessarily
- **Rejected**: Disabled buttons are bad UX

**Option B: Show Selector with "Create Sprint" Option**
- Pros: Direct path to creating new sprint
- Cons: Mixing sprint selection with sprint creation (different concerns)
- **Rejected**: Out of scope (sprint creation is terminal-only for now)

**Chosen**: Hide selector (return `null` from component)

**Implementation**:
```jsx
if (!allSprints || allSprints.length <= 1) {
  return null;
}
```

**Trade-offs Accepted**:
- Layout may shift when 2nd sprint created (acceptable)

**Impact**: Low - Affects only single-sprint users

---

### D-8: Sprint Dropdown Metadata Display

**Decision**: Show sprint name, phase badge, status, and last updated date

**Metadata Displayed**:
- **Name**: Bold, truncated with ellipsis if > 30 chars
- **Phase Badge**: Color-coded pill (grooming, planning, implementation, demo, retrospective)
- **Status**: Implied by phase badge color (in-progress = blue, complete = green)
- **Last Updated**: Formatted date (e.g., "Nov 3" or "2 days ago")

**Rationale**:
1. **Context**: User needs to know sprint state before switching
2. **Visual Scanning**: Color-coded badges enable quick recognition
3. **Recency**: Date helps identify stale vs active sprints

**Alternatives Considered**:

**Option A: Name Only**
- Pros: Simplest, least code
- Cons: No context, user must switch to see sprint state
- **Rejected**: Insufficient information

**Option B: Full Sprint Summary**
- Example: Show SUMMARY.md preview, progress bars
- Pros: Maximum context
- Cons: Dropdown becomes massive, slow to render, information overload
- **Rejected**: Too complex

**Chosen**: Name + phase + date (balanced)

**Trade-offs Accepted**:
- Truncated names may be ambiguous (hover tooltip can help in future)
- Date formatting requires `toLocaleDateString()` (locale-aware)

**Impact**: Medium - Affects user decision-making during sprint switch

---

## Synchronization Decisions

### D-9: File Watcher Scope

**Decision**: Watch `.current-sprint.json` file specifically (not entire `/asaf/` directory)

**Rationale**:
1. **Precision**: Only selection changes trigger events (not every file save)
2. **Performance**: Fewer file system events to process
3. **Clarity**: Event type directly maps to file (`asaf:sprint-selection-changed`)

**Alternatives Considered**:

**Option A: Watch Entire `/asaf/` Directory**
- Pros: Catches sprint creation, deletion, renames
- Cons: Too many events (every `.state.json` update, every SUMMARY.md edit), noisy
- **Rejected**: Overly broad

**Option B: Watch All `.state.json` Files**
- Pros: Detects sprint metadata changes
- Cons: Events emitted even when selection doesn't change, complex logic
- **Rejected**: Not directly related to selection

**Chosen**: Watch `.current-sprint.json` only

**Implementation**:
```javascript
chokidar.watch(path.join(projectPath, 'asaf/.current-sprint.json'), {
  ignoreInitial: true
})
  .on('change', () => { /* emit event */ })
  .on('add', () => { /* emit event (file created) */ });
```

**Trade-offs Accepted**:
- Sprint creation/deletion not detected by this watcher (OK - separate concern)
- File watcher may not fire if file doesn't exist initially (handled by `add` event)

**Impact**: Medium - Affects WebSocket event frequency and precision

---

### D-10: WebSocket Reconnection Handling

**Decision**: Auto-refresh sprint data on WebSocket reconnection

**Rationale**:
1. **Sync Guarantee**: If connection drops, UI might miss selection changes; reconnect refreshes state
2. **User Expectation**: UI should always show current state, even after network issues
3. **Simplicity**: Single `fetchSprintData()` call on reconnect (no complex reconciliation)

**Implementation**:
```javascript
useEffect(() => {
  if (isConnected && hasFetchedRef.current && selectedProject) {
    fetchSprintData(selectedProject);
  }
}, [isConnected, selectedProject, fetchSprintData]);
```

**Alternatives Considered**:

**Option A: No Auto-Refresh on Reconnect**
- Pros: Fewer API calls
- Cons: UI may show stale data if selection changed while disconnected
- **Rejected**: Violates sync requirement

**Option B: Periodic Polling (Every 5 Seconds)**
- Pros: Always synced, even without WebSocket
- Cons: Wasteful (API calls when nothing changed), battery drain on mobile
- **Rejected**: Inefficient

**Chosen**: Refresh on reconnect only

**Trade-offs Accepted**:
- Short window of stale data while disconnected (acceptable)
- Extra API call on reconnect (minimal cost)

**Impact**: Medium - Ensures eventual consistency

---

## Implementation Decisions

### D-11: Error Handling Strategy

**Decision**: Graceful degradation with auto-selection fallback

**Philosophy**: Never crash, always show something useful

**Error Scenarios**:
1. **Corrupted `.current-sprint.json`**: Log warning, auto-select, overwrite file
2. **Selected sprint deleted**: Log warning, auto-select from remaining sprints
3. **No valid sprints**: Return `{exists: false}`, hide panel
4. **Permission denied**: Throw error, show error state in panel, offer refresh
5. **API timeout**: Show error state, offer retry button

**Rationale**:
1. **Resilience**: UI remains functional even with file system issues
2. **Self-Healing**: Auto-selection repairs most common issues automatically
3. **Transparency**: Errors logged to console (for debugging)
4. **User Control**: Error states provide retry mechanism

**Alternatives Considered**:

**Option A: Fail Loudly (Modal Errors)**
- Example: Show modal "Sprint selection corrupted, please fix manually"
- Pros: Forces user to address issue
- Cons: Interrupts workflow, scary for non-technical users, unhelpful
- **Rejected**: Too aggressive

**Option B: Silent Failure (Hide Panel)**
- Pros: No user interruption
- Cons: User doesn't know ASAF exists, no feedback, confusing
- **Rejected**: Too passive

**Chosen**: Log + auto-select + show error state when critical

**Trade-offs Accepted**:
- Auto-selection may select "wrong" sprint (mitigated by selector visibility)
- Errors only visible in console (acceptable for edge cases)

**Impact**: High - Defines user experience during failures

---

### D-12: Sprint List Sorting

**Decision**: Sort sprints server-side by `.state.json` mtime (most recent first)

**Rationale**:
1. **Consistency**: Same logic as auto-selection (most recent = top)
2. **User Expectation**: Active sprints at top of list
3. **Performance**: Sorting on server (one-time cost) vs client (every render)

**Alternatives Considered**:

**Option A: Alphabetical Sorting (Client-Side)**
- Pros: Predictable order, easy to find by name
- Cons: Ignores temporal context, mtime already read on server
- **Rejected**: Not aligned with auto-selection

**Option B: Let User Choose Sort Order**
- Example: Dropdown with "Recent | Alphabetical | Status"
- Pros: Flexible, power user feature
- Cons: Complexity, UI clutter, premature optimization
- **Rejected**: Overkill for MVP

**Chosen**: Server-side mtime sort (descending)

**Implementation**:
```javascript
sprints.sort((a, b) => new Date(b.updated) - new Date(a.updated));
```

**Trade-offs Accepted**:
- User can't change sort order (acceptable for now)

**Impact**: Low - Affects dropdown order

---

## Deferred Decisions

### DD-1: Sprint Creation from UI

**Deferred**: Not implementing in this sprint

**Rationale**: Sprint creation is a terminal operation (`/asaf-init`), requires significant validation and setup. Out of scope for selection feature.

**Future Consideration**: Add "New Sprint" button in dropdown (future sprint)

---

### DD-2: Sprint Deletion from UI

**Deferred**: Not implementing in this sprint

**Rationale**: Deletion is destructive, requires confirmation modal, file system cleanup. Out of scope.

**Future Consideration**: Context menu with "Delete Sprint" option (future sprint)

---

### DD-3: Sprint Search/Filter

**Deferred**: Not implementing in this sprint

**Rationale**: Dropdown works for up to ~20 sprints. Search is premature optimization.

**Trigger**: Implement if users report > 20 sprints in practice

---

### DD-4: Virtual Scrolling for Large Sprint Lists

**Deferred**: Not implementing in this sprint

**Rationale**: CSS `max-height + overflow-y: auto` sufficient for now.

**Trigger**: Implement if performance issues reported with 50+ sprints

---

### DD-5: Sprint Rename from UI

**Deferred**: Not implementing in this sprint

**Rationale**: Rename requires updating directory name, all references, `.current-sprint.json`. Complex operation. Out of scope.

---

## Decision Impact Summary

### Critical Impact (Must Get Right)
- **D-3**: Path encoding resolution (fixes panel visibility bug)
- **D-1**: `.current-sprint.json` as source of truth (architectural foundation)
- **D-2**: Auto-selection algorithm (defines default behavior)
- **D-11**: Error handling strategy (defines failure modes)

### High Impact (Significant Consequences)
- **D-4**: API endpoint structure (affects all frontend integration)
- **D-6**: Sprint selector UI pattern (primary user interaction)
- **D-10**: WebSocket reconnection handling (ensures sync)

### Medium Impact (Noticeable but Manageable)
- **D-5**: WebSocket event naming (debugging clarity)
- **D-8**: Sprint dropdown metadata (user decision context)
- **D-9**: File watcher scope (event frequency)

### Low Impact (Minor Details)
- **D-7**: Single sprint handling (edge case UX)
- **D-12**: Sprint list sorting (dropdown order)

---

## Review and Approval

### Decision Review Checklist

- [x] All decisions documented with rationale
- [x] Alternatives considered for each decision
- [x] Trade-offs explicitly stated
- [x] Critical path decisions identified
- [x] Deferred decisions noted for future

### Key Decisions to Validate During Implementation

1. **Path Encoding Fix (D-3)**: Test with `asaf-for-claude-code` project immediately
2. **Auto-Selection (D-2)**: Verify behavior matches ASAF CLI exactly
3. **WebSocket Events (D-5)**: Test both event types with multi-client scenario
4. **Error Handling (D-11)**: Test all edge cases from edge-cases.md

### Open Questions (None)

All technical decisions finalized. Ready to proceed to implementation.

---

**Status**: All decisions finalized
**Next Step**: Begin Phase 1 implementation (Backend)
