# Feature: asaf-sprint-selection-ui

## Description

Adapt Claude Code UI to support ASAF's new sprint selection feature, enabling users to view and switch between multiple concurrent sprints in a single repository.

**Core Functionality:**
- Read and respect the `.current-sprint.json` file that tracks which sprint is currently active
- Provide a visual sprint selector dropdown in the ASAF panel to switch between multiple concurrent sprints
- Add backend API endpoints for listing sprints, reading current selection, and changing selection
- Real-time synchronization between terminal commands and UI via WebSocket
- Auto-selection of most recent sprint when no selection exists (matching ASAF's behavior)

**Problem Being Solved:**
Currently, Claude Code UI has two critical issues:
1. **Ignores Sprint Selection**: Shows only the "most recent" sprint by modification time, ignoring ASAF's explicit `.current-sprint.json` selection file. This causes confusion when users work on multiple features in parallel and switch sprints using `/asaf-select` in the terminal.
2. **Inconsistent Panel Visibility**: ASAF panel appears for some projects (e.g., git/products3, git/claudecodeui) but not others (e.g., git/asaf-for-claude-code), despite valid ASAF sprints existing. This suggests an issue with project path detection or encoding.

**Success Criteria:**
- UI always shows the currently selected sprint (reads `.current-sprint.json`)
- Visual sprint selector with all available sprints and metadata
- Switching sprint in UI updates `.current-sprint.json` (same as `/asaf-select`)
- ASAF panel appears consistently for ALL projects with valid ASAF sprints
- Real-time sync between terminal and UI (file watcher + WebSocket)

## Context

**ASAF Sprint Selection Feature** (implemented in asaf-for-claude-code):
- New state file: `/asaf/.current-sprint.json` with format:
  ```json
  {
    "sprint": "sprint-name",
    "selected_at": "2025-10-31T11:30:00Z",
    "type": "full"
  }
  ```
- Auto-selection algorithm: scans `/asaf/` for valid sprints, sorts by `.state.json` mtime, selects most recent
- New command: `/asaf-select` for interactive and direct sprint selection
- All 11 sprint-context commands now validate selection as "Step 0"

**Existing Claude Code UI Architecture:**
- Backend: `server/utils/asaf-reader.js` returns most recent sprint (no awareness of `.current-sprint.json`)
- Backend: `server/routes/asaf.js` provides `GET /api/asaf/:projectPath` (single sprint only)
- Frontend: `src/components/ASAFPanel.jsx` displays single sprint data
- Frontend: `src/hooks/useASAFData.js` fetches sprint data from API

**Design Reference:**
Detailed design document available at `/todos/asaf-sprint-selection-adaptation.md` with:
- 3 new API endpoints (current, list, select)
- New ASAFSprintSelector component
- WebSocket events for real-time sync
- Edge case handling (9 scenarios)

---

Created: November 3, 2025
Type: Full ASAF Sprint
