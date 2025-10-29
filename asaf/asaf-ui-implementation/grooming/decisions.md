# Technical Decisions: asaf-ui-implementation

## Stack & Tooling

**Language**: JavaScript (ES6+)
**Framework**: React 18 (functional components + hooks)
**Build Tool**: Vite 7
**Styling**: Tailwind CSS 3.4
**Backend**: Node.js + Express 4
**Real-Time**: WebSocket (ws 8)
**Markdown**: react-markdown 10
**Icons**: lucide-react 0.515

**Rationale**: Matches existing tech stack completely - zero new dependencies required.

---

## Key Technical Decisions

### Decision 1: Panel Placement

**Decision**: Right sidebar panel (250-300px), collapsible

**Alternatives Considered**:
1. New tab in MainContent (like Files, Git, Tasks tabs)
2. Top banner/header (like NextTaskBanner)
3. Left sidebar (next to project list)

**Rationale**:
- Right sidebar keeps sprint info "always visible" during chat (primary goal)
- Tabs would require switching away from chat (defeats purpose)
- Top banner doesn't provide enough space for full summary content
- Right placement is conventional for "inspector" panels in IDEs

**Trade-offs**:
- Takes screen space from chat area (mitigated by collapsible design)
- More complex mobile handling (addressed with overlay pattern)

---

### Decision 2: State Management

**Decision**: Component-local state (useState) with WebSocket subscriptions

**Alternatives Considered**:
1. New ASAFContext (Context API)
2. Extend WebSocketContext to include ASAF data
3. Use existing TaskMasterContext pattern

**Rationale**:
- Single consumer (ASAFPanel) in this sprint
- YAGNI principle: Context adds complexity without current benefit
- When building sprint dashboard (next sprint), will extract to ASAFContext

**Trade-offs**:
- Potential refactor needed for dashboard feature (acceptable - planned work)
- Cannot share ASAF data across components yet (not needed in this scope)

---

### Decision 3: Real-Time Updates

**Decision**: Dynamic file watchers (chokidar) + WebSocket events

**Alternatives Considered**:
1. Global watch of all `asaf/**` folders
2. Polling API every N seconds
3. No real-time (manual refresh only)

**Rationale**:
- Dynamic watchers optimize resources (only watch active projects)
- Leverages existing chokidar infrastructure
- WebSocket already in use for project updates
- Better UX than polling or manual refresh

**Trade-offs**:
- Slightly more complex watcher lifecycle management
- Benefits outweigh complexity (optimal resource usage)

---

### Decision 4: Progress Visualization

**Decision**: Vertical checklist with icons

**Alternatives Considered**:
1. Horizontal step indicator (progress bar style)
2. Circular progress ring (percentage-based)
3. Simple text list

**Rationale**:
- Vertical fits narrow panel width (250-300px)
- Icons provide quick visual scanning
- Familiar pattern (similar to todo lists, checklists)

**Trade-offs**:
- Less "fancy" than progress ring
- Prioritize clarity and scannability over visual flair

---

### Decision 5: Mobile Responsive Strategy

**Decision**: Overlay panel (slides over chat content)

**Alternatives Considered**:
1. Bottom sheet/drawer (slides up from bottom)
2. Full-screen modal
3. Horizontal scroll between chat and panel

**Rationale**:
- Overlay preserves chat context while showing sprint info
- Matches mobile patterns in app (modals, sidebars)
- Easy to dismiss (tap backdrop)

**Trade-offs**:
- Covers chat when open (mitigated by quick dismiss)
- More implementation than bottom sheet (acceptable for better UX)

---

### Decision 6: API Design

**Decision**: REST endpoint `GET /api/asaf/:projectPath` with WebSocket notifications

**Alternatives Considered**:
1. WebSocket-only (no REST endpoint)
2. Multiple endpoints per file (`.state.json`, `SUMMARY.md`)
3. GraphQL query

**Rationale**:
- REST for data fetching, WebSocket for notifications (existing pattern)
- Single endpoint simplifies client code
- Matches existing API architecture (projects, sessions, tasks)

**Trade-offs**:
- Combines multiple file reads in one request (small files, negligible)

---

### Decision 7: File Watching Scope

**Decision**: Watch `asaf/**` only (not entire project)

**Alternatives Considered**:
1. Reuse existing project watcher
2. Watch specific files only (`.state.json`, `SUMMARY.md`)
3. No watching (poll or manual refresh)

**Rationale**:
- ASAF files are scoped to `asaf/` directory
- Watching entire project for ASAF changes is wasteful
- Glob pattern `asaf/**` catches all relevant changes

**Trade-offs**:
- Additional watcher per project (minimal overhead)

---

## Execution Configuration

### Executor Profile
**Profile**: `javascript-pro`

**Capabilities**:
- Modern JavaScript (ES2023+) syntax and patterns
- React 18 functional components and hooks
- Node.js + Express backend development
- Async/await patterns and error handling
- Tailwind CSS utility classes
- WebSocket integration

**Rationale**: Matches project stack (JavaScript, React, Node.js). No TypeScript needed.

---

### Reviewer Configuration

**Mode**: Supportive Mentor

**Rationale**: No personal-goals.md provided. Default to balanced review mode.

**Reviewer Behavior**:
- Provides balanced feedback with constructive guidance
- Points out issues and explains why they matter
- Suggests improvements with code examples
- Maintains quality standards without being overly strict
- Focuses on:
  - Code correctness and edge case handling
  - React best practices (hooks, component patterns)
  - Error handling and user experience
  - Performance considerations
  - Security validation

**Focus Areas**:
- Proper WebSocket subscription cleanup (useEffect dependencies)
- AbortController usage for fetch cancellation
- Error state handling across all components
- Mobile responsive CSS patterns
- File watching implementation on backend

---

### Task Execution

**Default Pattern**: executor → test → reviewer → executor (if changes needed)

**Max Iterations**: 3 per task

**Special Cases**: None - standard pattern for all tasks

**Estimated Effort**:
- Based on 6 acceptance criteria
- ~10-12 implementation tasks (frontend + backend)
- Estimated time: 6-8 hours total
- Tasks broken down in planning phase

---

## Out of Scope

The following are explicitly out of scope for this sprint:

1. **Sprint Dashboard**: Overview of all sprints across projects (future sprint)
2. **Sprint Editing**: Creating, editing, or deleting sprints from UI (handled by slash commands)
3. **Sprint Analytics**: Metrics, velocity, time tracking (not in ASAF v1 spec)
4. **Multi-user**: Collaborative sprint viewing or real-time presence (single-user app)
5. **Sprint Templates**: Creating sprints from templates (future enhancement)

These may become future sprints or enhancements.

---

## Decision Log

| Date | Decision | Rationale | Decided By |
|------|----------|-----------|------------|
| 2025-10-29 | Right sidebar panel | Best balance of visibility and space | Developer + Grooming Agent |
| 2025-10-29 | Component-local state | YAGNI - single consumer in this sprint | Developer + Grooming Agent |
| 2025-10-29 | Dynamic file watchers | Optimal resource usage | Grooming Agent (Developer approved) |
| 2025-10-29 | Vertical checklist progress | Fits narrow panel, clear visualization | Developer + Grooming Agent |
| 2025-10-29 | Mobile overlay pattern | Best UX for mobile context | Grooming Agent |
| 2025-10-29 | Supportive Mentor review mode | Default without personal goals | Grooming Agent (Developer approved) |

---

_Generated from grooming session on 2025-10-29_
_Updated with execution configuration_
