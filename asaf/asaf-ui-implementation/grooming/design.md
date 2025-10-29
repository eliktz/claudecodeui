# Design Document: asaf-ui-implementation

## Overview

Building a session-specific ASAF view that provides developers with persistent, real-time visibility into their current sprint status without requiring manual status checks via `/asaf-status` command. The view will be embedded within the chat session interface, showing only when an active ASAF sprint exists for the current project.

**Problem Solved**: Developers lose context switching between chat and file system to check sprint progress. They need constant awareness of their sprint state (phase, status, progress) while working with Claude.

**Primary Users**: Individual developers working on features using the ASAF framework.

**Success Criteria**: Developers can glance at their session and immediately know:
- Current sprint phase (grooming/planning/implementation/demo/retrospective)
- Current status (ready/in-progress/complete/blocked)
- Progress through sprint phases (visual indicators)
- Key information from SUMMARY.md

## Scope

### In Scope
- Session-specific ASAF view integrated into chat sessions
- Display sprint metadata: name, phase, status, creation date
- Visual progress indicators for all sprint phases
- Render SUMMARY.md content with markdown support
- Real-time updates when ASAF files change (via file watching)
- Mobile-responsive design matching existing UI patterns
- Integration with MainContent.jsx tab navigation system
- Auto-detection of ASAF sprints in current project

### Out of Scope (Future Work)
- Sprint dashboard/overview of all sprints across projects
- Creating/editing sprints from UI (slash commands handle this)
- Sprint history or analytics
- Multi-project sprint comparison
- Sprint templates or cloning

## Constraints

- **Quality over Speed**: Optimize for robust, maintainable solution
- **Mobile Parity**: Full mobile responsiveness matching existing patterns
- **No Dependencies**: Standalone feature, no blockers
- **Performance**: No specific concerns (file watching already exists for projects)

## Architecture

### Components

#### 1. **ASAFPanel** (`src/components/ASAFPanel.jsx`)
**Responsibility**: Main container for ASAF sprint visualization
**Location**: `src/components/ASAFPanel.jsx`
**Key Functions**:
- `fetchSprintData(projectPath)` - Load sprint data from API
- `handleWebSocketUpdate(message)` - Handle real-time updates
**Dependencies**:
- WebSocketContext (for real-time updates)
- useLocalStorage (persist panel state)
- react-markdown (render SUMMARY.md)

**State Management**: Component-local (useState)
```javascript
const [sprintData, setSprintData] = useState(null);
const [isOpen, setIsOpen] = useLocalStorage('asafPanelOpen', true);
const [isLoading, setIsLoading] = useState(true);
```

**Layout Integration**:
- Right sidebar panel (250-300px wide when open)
- Collapsible with toggle button
- Hidden completely when no sprint exists
- Mobile: Collapses by default, expands over content

#### 2. **ASAFPanelHeader** (`src/components/asaf/ASAFPanelHeader.jsx`)
**Responsibility**: Sprint name, current phase badge, toggle controls
**Location**: `src/components/asaf/ASAFPanelHeader.jsx`
**Key Elements**:
- Sprint name (truncated on mobile)
- Phase badge with color coding (grooming=blue, planning=purple, implementation=green, demo=orange, retrospective=gray)
- Collapse/expand button (ChevronLeft/ChevronRight icon)

#### 3. **ASAFProgressIndicator** (`src/components/asaf/ASAFProgressIndicator.jsx`)
**Responsibility**: Visual progress through 5 sprint phases
**Location**: `src/components/asaf/ASAFProgressIndicator.jsx`
**Visualization**: Vertical checklist (optimal for narrow panel)
```
✓ Initialization    (always complete when sprint exists)
● Grooming          (in-progress indicator)
○ Planning          (pending)
○ Implementation    (pending)
○ Demo              (pending)
○ Retrospective     (pending)
```

**Icons**:
- `CheckCircle` (lucide-react) - Completed phases
- `Circle` (lucide-react, filled) - Current phase
- `Circle` (lucide-react, outline) - Pending phases

#### 4. **ASAFStatusCard** (`src/components/asaf/ASAFStatusCard.jsx`)
**Responsibility**: Current status details
**Location**: `src/components/asaf/ASAFStatusCard.jsx`
**Key Elements**:
- Current status badge (ready=gray, in-progress=blue, complete=green, blocked=red)
- Last updated timestamp (relative time: "2 hours ago")
- Quick info: Created date, sprint type

#### 5. **ASAFSummaryContent** (`src/components/asaf/ASAFSummaryContent.jsx`)
**Responsibility**: Rendered markdown from SUMMARY.md
**Location**: `src/components/asaf/ASAFSummaryContent.jsx`
**Rendering**:
- Uses `react-markdown` with `@tailwindcss/typography` (prose)
- Scrollable content area
- Syntax highlighting for code blocks (if present)

### Data Models

**Sprint Data API Response** (`GET /api/asaf/:projectPath`)
```javascript
{
  sprintName: "asaf-ui-implementation",          // From folder name
  state: {                                       // From .state.json
    phase: "grooming",                           // Current phase
    status: "in-progress",                       // Current status
    created: "2025-10-29T00:00:00.000Z",        // ISO timestamp
    updated: "2025-10-29T00:00:00.000Z",        // ISO timestamp
    grooming_approved: false,                    // Phase milestones
    planning_complete: false,
    implementation_complete: false
  },
  summary: "# Sprint Summary: ...",              // Raw markdown from SUMMARY.md
  hasGrooming: true,                             // grooming/ folder exists
  hasPlanning: false,                            // planning/ folder exists
  exists: true                                   // Sprint folder found
}

// If no sprint exists:
{
  exists: false
}
```

**Component State**
```javascript
// ASAFPanel.jsx local state
{
  sprintData: {/* API response */},   // Sprint data from API
  isOpen: true,                       // Panel open/collapsed (persisted)
  isLoading: false                    // Loading state
}
```

### User Flows

**Flow 1: Developer Opens Session with ASAF Sprint**
1. Developer selects project "claudecodeui" from sidebar
2. `App.jsx` loads → passes `selectedProject` to `MainContent`
3. `MainContent` renders `ChatInterface` with `selectedProject` prop
4. `ChatInterface` mounts → API call: `GET /api/asaf/${projectPath}`
5. If `exists: true` → renders `ASAFPanel` (right sidebar)
6. If `exists: false` → no panel shown (regular chat only)
7. `ASAFPanel` displays:
   - Header: "asaf-ui-implementation" + "Grooming" badge + toggle
   - Progress: 5 phase indicators (current phase highlighted)
   - Status: "In Progress" + "Updated 5 min ago"
   - Summary: Markdown content from SUMMARY.md (scrollable)

**Flow 2: Real-Time Sprint Update**
1. Developer runs `/asaf-groom` in chat
2. Backend ASAF command modifies `.state.json` (phase: grooming → planning)
3. File watcher detects change in `asaf/asaf-ui-implementation/.state.json`
4. Backend emits WebSocket message:
```javascript
{
  type: 'asaf:updated',
  projectPath: '/Users/dev/claudecodeui'
}
```
5. `ASAFPanel` receives WebSocket event via `WebSocketContext`
6. Panel re-fetches: `GET /api/asaf/${projectPath}`
7. UI updates:
   - Progress indicator: Grooming ✓ (checkmark), Planning ● (current)
   - Status card: Last updated "Just now"
   - Summary: New content from SUMMARY.md

**Flow 3: Mobile Responsive Behavior**
1. User opens session on mobile device
2. `ASAFPanel` detects mobile viewport (via CSS media queries)
3. Panel renders collapsed by default (save screen space)
4. User taps toggle button → panel slides over chat content (overlay)
5. User taps backdrop or close button → panel slides back
6. Panel state persisted: `localStorage.setItem('asafPanelOpen', false)`

**Flow 4: No Sprint Exists**
1. Developer selects project without ASAF sprint
2. API returns: `{ exists: false }`
3. `ASAFPanel` component returns `null` (not rendered)
4. Chat interface takes full width (normal behavior)

### Technology Decisions

**Markdown Rendering**: `react-markdown`
- Already in dependencies (`package.json`)
- Paired with `@tailwindcss/typography` for prose styling
- Safe by default (no HTML injection risk)
- **Rationale**: Consistent with existing markdown rendering patterns, no new dependencies

**Icons**: `lucide-react`
- Already in dependencies
- Icons needed: `CheckCircle`, `Circle`, `Clock`, `ChevronLeft`, `ChevronRight`, `AlertCircle`
- **Rationale**: Matches existing UI patterns (see TaskMaster, NextTaskBanner)

**State Management**: Component-local `useState`
- Simple, self-contained
- Fetch on mount and project change
- Subscribe to WebSocket events via `WebSocketContext`
- **Rationale**: Single consumer (this sprint), avoid premature Context abstraction. Extract to `ASAFContext` when building sprint dashboard (next sprint)

**Panel State Persistence**: `useLocalStorage` hook
- Already implemented in codebase (`src/hooks/useLocalStorage.jsx`)
- Persists `isOpen` state across sessions
- **Rationale**: Matches existing pattern (see `autoExpandTools`, `autoScrollToBottom`)

**Real-Time Updates**: File watching + WebSocket
- **Backend**: Extend existing `chokidar` watcher to watch `asaf/**` in project directories
- **Dynamic watchers**: Add watcher when user opens project, remove when last client disconnects
- **WebSocket event**: Emit `{ type: 'asaf:updated', projectPath: '...' }` on file change
- **Rationale**: Leverages existing infrastructure, optimal resource usage

### Security Considerations

**Path Traversal Prevention**:
- API endpoint validates `projectPath` is in user's project list
- No arbitrary file system access
- Only read from `asaf/` subdirectory within validated project paths

**Authentication**:
- Use existing JWT middleware on `/api/asaf/:projectPath`
- Consistent with existing API patterns

**File Reading**:
- Restricted to `.state.json`, `SUMMARY.md`, folder existence checks
- No execution of file contents
- Markdown rendering is safe by default (react-markdown escapes HTML)

**Input Validation**:
- Project path: Must match existing project in database
- No user-supplied file paths (only derived from validated project)

### Performance Considerations

**File Watching**:
- **Pattern**: `${projectPath}/asaf/**` (only watch ASAF directories)
- **Dynamic**: Add watcher when user opens project, remove on disconnect
- **Rationale**: Already watching project files globally; this adds minimal overhead

**API Response Caching**:
- Consider 30-second cache on backend for `/api/asaf/:projectPath`
- Files change infrequently (only when commands run)
- Cache invalidated on file change event
- **Rationale**: Reduce disk I/O for frequent panel re-renders

**Markdown Parsing**:
- SUMMARY.md typically < 10KB
- react-markdown is performant for small documents
- No performance concern expected

**WebSocket Events**:
- Only emit to clients watching specific project
- Filtered by `projectPath` in connection metadata
- **Rationale**: Prevent unnecessary updates to unrelated clients

### Dependencies

**New Dependencies**: None (all required libraries already in `package.json`)

**Existing Code to Leverage**:
- `src/hooks/useLocalStorage.jsx` - Panel state persistence
- `src/contexts/WebSocketContext.jsx` - Real-time updates
- `src/utils/api.js` - HTTP client pattern
- `server/index.js` (chokidar watcher) - Extend for ASAF files
- `src/components/NextTaskBanner.jsx` - Reference for collapsible panel pattern
- `src/components/TaskMasterStatus.jsx` - Reference for status badges

---

_Generated from grooming session on 2025-10-29_
_Phase 2 Complete: Technical Design_
