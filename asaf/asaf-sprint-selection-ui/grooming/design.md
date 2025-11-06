# Technical Architecture Design: ASAF Sprint Selection Support

**Sprint**: asaf-sprint-selection-ui
**Phase**: Grooming
**Created**: November 3, 2025
**Status**: Design Complete

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Problem Statement](#problem-statement)
3. [System Architecture](#system-architecture)
4. [Backend Design](#backend-design)
5. [Frontend Design](#frontend-design)
6. [Data Flow](#data-flow)
7. [Panel Visibility Investigation](#panel-visibility-investigation)
8. [API Specifications](#api-specifications)
9. [WebSocket Events](#websocket-events)
10. [Implementation Sequence](#implementation-sequence)

---

## Executive Summary

### Objectives

Implement sprint selection support in Claude Code UI to align with ASAF's new multi-sprint architecture:

1. **Sprint Selection Management**: Enable users to view and switch between multiple concurrent sprints
2. **Panel Visibility Fix**: Investigate and resolve why ASAF panel doesn't appear for `asaf-for-claude-code` project
3. **Real-time Synchronization**: Ensure terminal and UI sprint selections stay in sync via WebSocket

### Key Features

- **Backend**: 3 new API endpoints + modified sprint reader logic
- **Frontend**: New sprint selector dropdown component in panel header
- **Investigation**: Deep dive into panel visibility logic with path encoding fixes
- **Sync**: WebSocket events for real-time sprint selection updates

### Success Metrics

- Sprint selector appears when project has 2+ sprints
- Panel appears for ALL valid ASAF projects (including `asaf-for-claude-code`)
- Terminal → UI sync within 2 seconds
- UI → Terminal sync immediate (WebSocket broadcast)

---

## Problem Statement

### Current Behavior (Broken)

**Issue 1: Hidden Sprints**
- User has 3 sprints: `feature-a`, `feature-b`, `feature-c`
- Claude Code UI only shows `feature-b` (most recently modified by `.state.json` mtime)
- User has no way to see or switch to `feature-a` or `feature-c` from UI

**Issue 2: Selection Mismatch**
- User runs `/asaf-select feature-a` in terminal → creates `.current-sprint.json`
- Claude Code UI ignores `.current-sprint.json`, still shows `feature-b`
- Confusion: UI and terminal show different sprints

**Issue 3: Panel Invisibility**
- Project `/Users/elik.k/git/asaf-for-claude-code` has valid ASAF sprint
- ASAF panel doesn't appear in Claude Code UI
- Likely path encoding or detection issue

### Expected Behavior (Fixed)

**Sprint Selection**
- Backend reads `.current-sprint.json` first, falls back to auto-selection
- Frontend displays sprint selector dropdown when 2+ sprints exist
- User can switch sprints from UI → updates `.current-sprint.json`
- Terminal changes sync to UI via file watcher + WebSocket

**Panel Visibility**
- Panel appears for ALL projects with valid ASAF structure
- Path encoding handles all edge cases (hyphens, underscores, special chars)
- Clear validation logic with debug logging

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (React)                                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  ASAFPanel.jsx                                       │  │
│  │  ├─ ASAFPanelHeader                                  │  │
│  │  │  └─ ASAFSprintSelector (NEW)                      │  │
│  │  ├─ ASAFProgressIndicator                            │  │
│  │  ├─ ASAFStatusCard                                   │  │
│  │  └─ ASAFSummaryContent                               │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  useASAFData Hook (MODIFIED)                                │
│  - fetchCurrentSelection()                                  │
│  - fetchAllSprints()                                        │
│  - selectSprint(name)                                       │
│  - Listen: asaf:sprint-selection-changed                    │
│  - Listen: asaf:sprint-selected                             │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │ HTTP + WebSocket
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Backend (Express + WebSocket)                              │
│                                                             │
│  API Routes: /api/asaf/:projectPath/                        │
│  ├─ GET  /current        → Read .current-sprint.json       │
│  ├─ GET  /list           → Scan all sprints                │
│  ├─ POST /select         → Update selection + emit WS      │
│  └─ GET  / (MODIFIED)    → Use selection (not mtime)       │
│                                                             │
│  asaf-reader.js (MODIFIED)                                  │
│  - getCurrentSprintSelection(projectPath)                   │
│  - getAllSprints(projectPath)                               │
│  - createCurrentSprintSelection(projectPath, name, type)    │
│  - readAsafSprintData() → reads .current-sprint.json first  │
│                                                             │
│  File Watcher (chokidar)                                    │
│  - Watch: asaf/.current-sprint.json                         │
│  - Emit: asaf:sprint-selection-changed                      │
└─────────────────────────────────────────────────────────────┘
                            ▲
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  File System                                                │
│                                                             │
│  /project/asaf/                                             │
│  ├─ .current-sprint.json    ← Sprint selection state       │
│  ├─ sprint-a/                                               │
│  │  ├─ .state.json                                         │
│  │  └─ SUMMARY.md                                          │
│  ├─ sprint-b/                                               │
│  │  ├─ .state.json                                         │
│  │  └─ SUMMARY.md                                          │
│  └─ sprint-c/                                               │
│     ├─ .state.json                                         │
│     └─ SUMMARY.md                                          │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
App.jsx
└─ MainContent.jsx
   └─ ASAFPanel.jsx
      ├─ ASAFPanelHeader.jsx
      │  └─ ASAFSprintSelector.jsx ★ NEW
      ├─ ASAFProgressIndicator.jsx
      ├─ ASAFStatusCard.jsx
      └─ ASAFSummaryContent.jsx
```

---

## Backend Design

### Modified: `server/utils/asaf-reader.js`

#### New Function: `getCurrentSprintSelection(projectPath)`

**Purpose**: Read current sprint selection from `.current-sprint.json`

**Input**: Absolute project path
**Output**: `{sprint: string, selected_at: string, type: string}` or `null`

```javascript
/**
 * Read current sprint selection from .current-sprint.json
 * Returns null if file doesn't exist or is invalid
 */
export async function getCurrentSprintSelection(projectPath) {
  const selectionFile = path.join(projectPath, 'asaf', '.current-sprint.json');

  try {
    const content = await fs.readFile(selectionFile, 'utf8');
    const selection = JSON.parse(content);

    // Validate structure
    if (!selection.sprint || !selection.selected_at || !selection.type) {
      console.warn('Invalid .current-sprint.json structure:', selection);
      return null;
    }

    return selection;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist - no selection yet
    }
    if (error instanceof SyntaxError) {
      console.error('Corrupted .current-sprint.json:', error);
      return null;
    }
    throw error; // Re-throw unexpected errors
  }
}
```

**Edge Cases**:
- File missing → `null` (graceful)
- File corrupted (invalid JSON) → `null` (logged)
- Missing required fields → `null` (logged)
- Permission denied → throw (critical error)

---

#### New Function: `getAllSprints(projectPath)`

**Purpose**: Scan `/asaf/` directory for all valid sprints

**Input**: Absolute project path
**Output**: Array of sprint metadata objects

```javascript
/**
 * Scan asaf directory for all valid sprints
 * Returns array of sprint metadata sorted by updated time (most recent first)
 */
export async function getAllSprints(projectPath) {
  const asafDir = path.join(projectPath, 'asaf');

  try {
    const entries = await fs.readdir(asafDir, { withFileTypes: true });
    const sprints = [];

    for (const entry of entries) {
      // Skip files, hidden files (except .current-sprint.json), and express directory
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'express') {
        continue;
      }

      const sprintPath = path.join(asafDir, entry.name);
      const stateFile = path.join(sprintPath, '.state.json');

      // Check if valid sprint (has .state.json)
      try {
        const stateContent = await fs.readFile(stateFile, 'utf8');
        const state = JSON.parse(stateContent);

        // Validate state structure
        const validationError = validateStateJson(state);
        if (validationError) {
          console.log(`Skipping invalid sprint ${entry.name}: ${validationError}`);
          continue;
        }

        // Get file modification time for sorting
        const stats = await fs.stat(stateFile);

        sprints.push({
          name: entry.name,
          phase: state.phase,
          status: state.status,
          type: state.type || 'full',
          created: state.created || stats.birthtime.toISOString(),
          updated: state.updated || stats.mtime.toISOString()
        });
      } catch (error) {
        // Invalid sprint (missing/corrupted .state.json) - skip it
        console.log(`Skipping invalid sprint ${entry.name}: ${error.message}`);
      }
    }

    // Sort by updated time (most recent first)
    sprints.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    return sprints;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []; // No asaf directory
    }
    console.error('Error reading sprints:', error);
    throw error;
  }
}
```

**Edge Cases**:
- No `/asaf/` directory → `[]` (empty array)
- Empty `/asaf/` directory → `[]`
- Mixed valid/invalid sprints → return only valid ones
- Corrupted `.state.json` → skip that sprint, continue
- Permission denied → throw (critical)

---

#### New Function: `createCurrentSprintSelection(projectPath, sprintName, type)`

**Purpose**: Create or update `.current-sprint.json`

**Input**: Project path, sprint name, sprint type
**Output**: `void` (writes file)

```javascript
/**
 * Create or update .current-sprint.json
 */
export async function createCurrentSprintSelection(projectPath, sprintName, type = 'full') {
  const selectionFile = path.join(projectPath, 'asaf', '.current-sprint.json');

  const selection = {
    sprint: sprintName,
    selected_at: new Date().toISOString(),
    type: type
  };

  try {
    await fs.writeFile(selectionFile, JSON.stringify(selection, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to write .current-sprint.json:', error);
    throw error; // Critical error - should fail loudly
  }
}
```

**Edge Cases**:
- Parent directory missing → throw (should never happen if sprint exists)
- Permission denied → throw (critical)
- Disk full → throw (critical)

---

#### Modified: `readAsafSprintData(projectPath)`

**Purpose**: Read sprint data, using `.current-sprint.json` as source of truth

**Changes**:
1. Read `.current-sprint.json` FIRST
2. If selection exists and valid, return that sprint
3. If selection points to deleted sprint, auto-select new one
4. If no selection, auto-select most recent sprint

```javascript
/**
 * Read and validate ASAF sprint data for a project
 * NOW: Reads .current-sprint.json first, then falls back to auto-selection
 */
export async function readAsafSprintData(projectPath) {
  try {
    // Step 1: Check if asaf directory exists
    const asafPath = path.join(projectPath, 'asaf');
    try {
      const stats = await fs.stat(asafPath);
      if (!stats.isDirectory()) {
        return { exists: false, error: 'asaf path exists but is not a directory' };
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { exists: false }; // No asaf directory
      }
      throw error;
    }

    // Step 2: Read current selection from .current-sprint.json
    const selection = await getCurrentSprintSelection(projectPath);

    // Step 3: If selection exists, try to use it
    if (selection && selection.sprint) {
      const selectedSprintPath = path.join(asafPath, selection.sprint);
      const sprintData = await readSingleSprintData(selectedSprintPath, selection.sprint);

      if (sprintData.valid) {
        // Selection is valid, return it
        return {
          exists: true,
          ...sprintData,
          isSelected: true,
          selectedAt: selection.selected_at
        };
      }

      // Selection points to deleted/invalid sprint - fall through to auto-select
      console.warn(`Selected sprint '${selection.sprint}' is invalid or deleted, auto-selecting...`);
    }

    // Step 4: No valid selection - get all sprints and auto-select
    const allSprints = await getAllSprints(projectPath);

    if (allSprints.length === 0) {
      return {
        exists: false,
        error: 'No valid ASAF sprints found'
      };
    }

    // Step 5: Auto-select most recent sprint
    const mostRecent = allSprints[0];
    console.log(`Auto-selecting sprint: ${mostRecent.name}`);

    // Create .current-sprint.json for this auto-selection
    await createCurrentSprintSelection(projectPath, mostRecent.name, mostRecent.type);

    // Step 6: Read and return the auto-selected sprint
    const selectedSprintPath = path.join(asafPath, mostRecent.name);
    const sprintData = await readSingleSprintData(selectedSprintPath, mostRecent.name);

    return {
      exists: true,
      ...sprintData,
      isSelected: true,
      isAutoSelected: true,
      totalSprints: allSprints.length,
      allSprints: allSprints.length > 1 ? allSprints : undefined
    };

  } catch (error) {
    console.error('Error reading ASAF sprint data:', error);
    if (error.message.includes('Permission denied')) {
      throw error;
    }
    return {
      exists: false,
      error: `Failed to read ASAF data: ${error.message}`
    };
  }
}
```

**Key Changes**:
- Line 23-39: NEW - Read selection first
- Line 41-60: NEW - Auto-selection logic
- Added `isSelected`, `selectedAt`, `isAutoSelected` flags

---

### New: `server/routes/asaf.js` Endpoints

#### GET `/api/asaf/:projectPath/current`

**Purpose**: Get current sprint selection state

**Request**:
```
GET /api/asaf/-Users-elik.k-git-project/current
Authorization: Bearer <token>
```

**Response (selection exists)**:
```json
{
  "exists": true,
  "sprint": "feature-auth-refactor",
  "selected_at": "2025-11-03T10:30:00Z",
  "type": "full"
}
```

**Response (no selection)**:
```json
{
  "exists": false,
  "message": "No sprint selected"
}
```

**Implementation**:
```javascript
router.get('/:projectPath/current', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;
    const actualProjectPath = await extractProjectDirectory(encodedPath);

    // Security validation (same as main endpoint)
    if (!path.isAbsolute(actualProjectPath)) {
      return res.status(403).json({ error: 'Invalid project path' });
    }

    const selection = await getCurrentSprintSelection(actualProjectPath);

    if (selection) {
      res.json({
        exists: true,
        ...selection
      });
    } else {
      res.json({
        exists: false,
        message: 'No sprint selected'
      });
    }
  } catch (error) {
    console.error('Error reading current sprint:', error);
    res.status(500).json({
      exists: false,
      error: 'Failed to read current sprint selection'
    });
  }
});
```

---

#### GET `/api/asaf/:projectPath/list`

**Purpose**: List all available sprints

**Request**:
```
GET /api/asaf/-Users-elik.k-git-project/list
Authorization: Bearer <token>
```

**Response**:
```json
{
  "sprints": [
    {
      "name": "feature-auth-refactor",
      "phase": "implementation",
      "status": "in-progress",
      "type": "full",
      "created": "2025-11-01T09:00:00Z",
      "updated": "2025-11-03T10:30:00Z"
    },
    {
      "name": "bug-fix-login",
      "phase": "demo",
      "status": "complete",
      "type": "full",
      "created": "2025-10-28T14:00:00Z",
      "updated": "2025-10-31T16:45:00Z"
    }
  ],
  "current": "feature-auth-refactor",
  "total": 2
}
```

**Implementation**:
```javascript
router.get('/:projectPath/list', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;
    const actualProjectPath = await extractProjectDirectory(encodedPath);

    // Security validation
    if (!path.isAbsolute(actualProjectPath)) {
      return res.status(403).json({ error: 'Invalid project path' });
    }

    const sprints = await getAllSprints(actualProjectPath);
    const currentSelection = await getCurrentSprintSelection(actualProjectPath);

    res.json({
      sprints,
      current: currentSelection?.sprint || null,
      total: sprints.length
    });
  } catch (error) {
    console.error('Error listing sprints:', error);
    res.status(500).json({
      error: 'Failed to list sprints',
      sprints: [],
      total: 0
    });
  }
});
```

---

#### POST `/api/asaf/:projectPath/select`

**Purpose**: Select a sprint as current

**Request**:
```
POST /api/asaf/-Users-elik.k-git-project/select
Authorization: Bearer <token>
Content-Type: application/json

{
  "sprint": "bug-fix-login"
}
```

**Response (success)**:
```json
{
  "success": true,
  "sprint": "bug-fix-login",
  "selected_at": "2025-11-03T11:00:00Z"
}
```

**Response (sprint not found)**:
```json
{
  "error": "Sprint 'non-existent-sprint' not found",
  "available": ["feature-auth-refactor", "bug-fix-login"]
}
```

**Implementation**:
```javascript
router.post('/:projectPath/select', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;
    const { sprint: sprintName } = req.body;

    if (!sprintName) {
      return res.status(400).json({ error: 'Sprint name is required' });
    }

    const actualProjectPath = await extractProjectDirectory(encodedPath);

    // Security validation
    if (!path.isAbsolute(actualProjectPath)) {
      return res.status(403).json({ error: 'Invalid project path' });
    }

    // Validate sprint exists
    const allSprints = await getAllSprints(actualProjectPath);
    const sprint = allSprints.find(s => s.name === sprintName);

    if (!sprint) {
      return res.status(404).json({
        error: `Sprint '${sprintName}' not found`,
        available: allSprints.map(s => s.name)
      });
    }

    // Create/update selection file
    await createCurrentSprintSelection(actualProjectPath, sprintName, sprint.type);

    // Emit WebSocket event (notify all clients)
    // Note: req.app.locals.wss is the WebSocket server instance
    if (req.app.locals.wss) {
      req.app.locals.wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'asaf:sprint-selected',
            projectPath: actualProjectPath,
            sprint: sprintName,
            timestamp: new Date().toISOString()
          }));
        }
      });
    }

    res.json({
      success: true,
      sprint: sprintName,
      selected_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error selecting sprint:', error);
    res.status(500).json({
      error: 'Failed to select sprint'
    });
  }
});
```

---

## Frontend Design

### New Component: `ASAFSprintSelector.jsx`

**Location**: `src/components/asaf/ASAFSprintSelector.jsx`

**Purpose**: Dropdown for switching between sprints

**Props**:
- `allSprints` - Array of sprint metadata
- `currentSprintName` - Name of currently selected sprint
- `onSelectSprint(sprintName)` - Callback when user selects a sprint
- `isLoading` - Loading state during sprint switch

**Behavior**:
- Hidden if 0 or 1 sprint (nothing to switch)
- Shows "X sprints" button
- Dropdown with sprint list, current highlighted with star
- Each sprint shows: name, phase badge, status, last updated date

**Component Structure**:
```jsx
import React, { useState } from 'react';
import { ChevronDown, Star, Check } from 'lucide-react';

const ASAFSprintSelector = ({
  allSprints,
  currentSprintName,
  onSelectSprint,
  isLoading
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Don't show selector if 0 or 1 sprint
  if (!allSprints || allSprints.length <= 1) {
    return null;
  }

  const handleSelect = async (sprintName) => {
    setIsOpen(false);
    await onSelectSprint(sprintName);
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        disabled={isLoading}
      >
        <span className="font-medium">{allSprints.length} sprints</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Sprint List */}
          <div className="absolute top-full mt-2 right-0 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-3 py-2">
                Select Sprint
              </div>

              {allSprints.map((sprint) => {
                const isCurrent = sprint.name === currentSprintName;

                return (
                  <button
                    key={sprint.name}
                    onClick={() => handleSelect(sprint.name)}
                    className={`w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      isCurrent ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {isCurrent && (
                            <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                          )}
                          <span className={`text-sm font-medium truncate ${
                            isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-white'
                          }`}>
                            {sprint.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            sprint.status === 'complete'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                              : sprint.status === 'in-progress'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                              : sprint.status === 'blocked'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                          }`}>
                            {sprint.phase}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(sprint.updated).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {isCurrent && (
                        <Check className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ASAFSprintSelector;
```

---

### Modified: `ASAFPanelHeader.jsx`

**Changes**: Add sprint selector to header

```jsx
import ASAFSprintSelector from './ASAFSprintSelector';

const ASAFPanelHeader = ({
  sprintName,
  phase,
  onToggle,
  isMobile,
  allSprints,          // NEW
  currentSprintName,   // NEW
  onSelectSprint,      // NEW
  isLoading            // NEW
}) => {
  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* ASAF Badge */}
        <div className="w-8 h-8 rounded-md bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow-sm flex-shrink-0">
          A
        </div>

        {/* Sprint Name & Phase */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
            {sprintName}
          </h3>
          <span className={`text-xs px-2 py-0.5 rounded ${
            phase === 'demo' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
            phase === 'implementation' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
            'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
          }`}>
            {phase}
          </span>
        </div>
      </div>

      {/* Sprint Selector (NEW) */}
      <ASAFSprintSelector
        allSprints={allSprints}
        currentSprintName={currentSprintName}
        onSelectSprint={onSelectSprint}
        isLoading={isLoading}
      />

      {/* Collapse Button */}
      <button onClick={onToggle} className="ml-2">
        {/* ... existing collapse button ... */}
      </button>
    </div>
  );
};
```

---

### Modified: `ASAFPanel.jsx`

**Changes**: Fetch sprint list, handle selection

```jsx
const ASAFPanel = ({ selectedProject, className = '' }) => {
  // ... existing state ...

  const {
    sprintData,
    allSprints,           // NEW
    currentSelection,     // NEW
    isLoading,
    error,
    refreshData,
    selectSprint          // NEW
  } = useASAFData(selectedProject);

  // Handle sprint selection
  const handleSelectSprint = async (sprintName) => {
    try {
      await selectSprint(selectedProject, sprintName);
      // Data will be refreshed automatically
    } catch (error) {
      console.error('Error selecting sprint:', error);
      // TODO: Show error notification
    }
  };

  // ... rest of component ...

  return (
    // ...
    <ASAFPanelHeader
      sprintName={sprintData?.sprintName}
      phase={sprintData?.state?.phase}
      onToggle={togglePanel}
      isMobile={isMobile}
      allSprints={allSprints}                // NEW
      currentSprintName={currentSelection?.sprint}  // NEW
      onSelectSprint={handleSelectSprint}    // NEW
      isLoading={isLoading}                  // NEW
    />
    // ...
  );
};
```

---

### Modified: `useASAFData.js`

**Changes**: Add sprint list and selection management

```javascript
export function useASAFData(selectedProject) {
  const [sprintData, setSprintData] = useState(null);
  const [allSprints, setAllSprints] = useState([]);           // NEW
  const [currentSelection, setCurrentSelection] = useState(null); // NEW
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch current selection
  const fetchCurrentSelection = useCallback(async (project) => {
    const rawPath = project.path || project.fullPath || project.name;
    const encodedPath = rawPath.replace(/\//g, '-');

    const response = await fetch(`/api/asaf/${encodedPath}/current`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token')}` }
    });

    const data = await response.json();
    setCurrentSelection(data.exists ? data : null);
    return data;
  }, []);

  // Fetch all sprints
  const fetchAllSprints = useCallback(async (project) => {
    const rawPath = project.path || project.fullPath || project.name;
    const encodedPath = rawPath.replace(/\//g, '-');

    const response = await fetch(`/api/asaf/${encodedPath}/list`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('auth-token')}` }
    });

    const data = await response.json();
    setAllSprints(data.sprints || []);
    return data;
  }, []);

  // Select a sprint
  const selectSprint = useCallback(async (project, sprintName) => {
    const rawPath = project.path || project.fullPath || project.name;
    const encodedPath = rawPath.replace(/\//g, '-');

    const response = await fetch(`/api/asaf/${encodedPath}/select`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth-token')}`
      },
      body: JSON.stringify({ sprint: sprintName })
    });

    if (!response.ok) {
      throw new Error('Failed to select sprint');
    }

    // Refresh data after selection
    await fetchSprintData(project);
    await fetchAllSprints(project);
    await fetchCurrentSelection(project);
  }, []);

  // Fetch sprint data (MODIFIED)
  const fetchSprintData = useCallback(async (project) => {
    // ... existing implementation ...

    // After fetching sprint data, also fetch sprint list
    await fetchAllSprints(project);
    await fetchCurrentSelection(project);
  }, [fetchAllSprints, fetchCurrentSelection]);

  // ... existing useEffect hooks ...

  // NEW: Handle sprint selection WebSocket events
  useEffect(() => {
    if (!ws || !selectedProject || messages.length === 0) {
      return;
    }

    const latestMessage = messages[messages.length - 1];

    // Handle sprint selection changes
    if (
      latestMessage?.type === 'asaf:sprint-selected' ||
      latestMessage?.type === 'asaf:sprint-selection-changed'
    ) {
      const messagePath = latestMessage.projectPath?.replace(/\\/g, '/');
      const currentPath = (selectedProject.fullPath || selectedProject.path)?.replace(/\\/g, '/');

      if (messagePath === currentPath) {
        console.log('Sprint selection changed via WebSocket, refreshing...');
        fetchSprintData(selectedProject);
      }
    }
  }, [messages, selectedProject, fetchSprintData]);

  return {
    sprintData,
    allSprints,           // NEW
    currentSelection,     // NEW
    isLoading,
    error,
    refreshData,
    selectSprint          // NEW
  };
}
```

---

## Data Flow

### Flow 1: Initial Load

```
1. User opens Claude Code UI
2. Frontend: useASAFData hook initialized
3. Frontend → Backend: GET /api/asaf/:projectPath
4. Backend: readAsafSprintData(projectPath)
   a. Read .current-sprint.json
   b. If exists, return selected sprint
   c. If not, auto-select most recent sprint
   d. Create .current-sprint.json
5. Backend → Frontend: Sprint data + metadata
6. Frontend → Backend: GET /api/asaf/:projectPath/list
7. Backend: getAllSprints(projectPath)
8. Backend → Frontend: Array of all sprints
9. Frontend: Render panel with sprint selector (if 2+ sprints)
```

### Flow 2: User Selects Sprint from UI

```
1. User clicks sprint selector dropdown
2. User clicks "bug-fix-login"
3. Frontend: handleSelectSprint("bug-fix-login")
4. Frontend → Backend: POST /api/asaf/:projectPath/select {"sprint": "bug-fix-login"}
5. Backend: Validate sprint exists
6. Backend: createCurrentSprintSelection(projectPath, "bug-fix-login", "full")
7. Backend: Write .current-sprint.json
8. Backend: Emit WebSocket event "asaf:sprint-selected"
9. Backend → Frontend: {success: true, sprint: "bug-fix-login"}
10. Frontend: Refresh sprint data (GET /api/asaf/:projectPath)
11. All connected clients: Receive WebSocket event, refresh
```

### Flow 3: User Selects Sprint from Terminal

```
1. User runs: /asaf-select bug-fix-login
2. ASAF CLI: Write .current-sprint.json
3. File watcher (chokidar): Detects .current-sprint.json change
4. Backend: Emit WebSocket event "asaf:sprint-selection-changed"
5. Frontend: Receive WebSocket event
6. Frontend: Check if event is for current project
7. Frontend: Refresh sprint data (GET /api/asaf/:projectPath)
8. Frontend: Update UI to show "bug-fix-login"
```

---

## Panel Visibility Investigation

### Problem

ASAF panel doesn't appear for project `/Users/elik.k/git/asaf-for-claude-code` despite having valid ASAF structure.

### Hypothesis: Path Encoding Issues

**Suspect 1: Hyphen Confusion**

Project path: `/Users/elik.k/git/asaf-for-claude-code`

Encoding: Replace `/` with `-` → `-Users-elik.k-git-asaf-for-claude-code`

**Problem**: Project already has hyphens. When decoding, how do we know which hyphens are path separators vs original hyphens?

**Current Code** (in `asaf.js`):
```javascript
const actualProjectPath = encodedPath.replace(/-/g, '/');
```

This would decode `-Users-elik.k-git-asaf-for-claude-code` to:
```
/Users/elik.k/git/asaf/for/claude/code
```

**WRONG!** Should be:
```
/Users/elik.k/git/asaf-for-claude-code
```

---

### Solution: Use `extractProjectDirectory()`

**Fix**: Always use `extractProjectDirectory()` from `server/projects.js`

This function:
1. Looks up project in known projects list (from `.claude/projects/`)
2. Returns actual absolute path
3. Doesn't rely on reversible encoding

**Updated Code**:
```javascript
router.get('/:projectPath', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;

    // CORRECT: Use extractProjectDirectory
    let actualProjectPath;
    try {
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      // If extraction fails, project is not in user's list
      return res.status(403).json({
        error: 'Project not found or access denied'
      });
    }

    // Continue with actualProjectPath...
  }
});
```

---

### Investigation Checklist

1. **Path Encoding Audit**
   - Check all places where project paths are encoded (frontend → backend)
   - Check all places where paths are decoded (backend)
   - Ensure consistent use of `extractProjectDirectory()`

2. **Project Detection Logic**
   - Verify `asaf-for-claude-code` appears in `getAllProjects()` response
   - Check if encoded path matches expected format
   - Add debug logging to track path transformation

3. **Panel Rendering Conditions**
   - Check `ASAFPanel.jsx` render conditions
   - Ensure `sprintData.exists` is true
   - Verify no early returns before panel render

4. **API Response Validation**
   - Test API directly: `GET /api/asaf/-Users-elik.k-git-asaf-for-claude-code`
   - Check if 200 response with `exists: true`
   - Inspect response data structure

5. **Console Logging**
   - Add logs in `useASAFData` for project path resolution
   - Log API request URLs
   - Log API responses

---

## API Specifications

### Summary Table

| Endpoint | Method | Purpose | Request Body | Response |
|----------|--------|---------|--------------|----------|
| `/api/asaf/:projectPath` | GET | Get selected sprint data | None | Sprint data object |
| `/api/asaf/:projectPath/current` | GET | Get current selection | None | Selection object or null |
| `/api/asaf/:projectPath/list` | GET | List all sprints | None | Array of sprint metadata |
| `/api/asaf/:projectPath/select` | POST | Select a sprint | `{sprint: string}` | Success confirmation |

### Path Encoding

All endpoints use `:projectPath` parameter:
- Frontend encodes: `/Users/elik.k/git/project` → `-Users-elik.k-git-project`
- Backend decodes: Use `extractProjectDirectory(encodedPath)`

---

## WebSocket Events

### Event: `asaf:sprint-selected`

**Emitted by**: Backend (after POST /select succeeds)

**Payload**:
```json
{
  "type": "asaf:sprint-selected",
  "projectPath": "/Users/elik.k/git/project",
  "sprint": "feature-auth-refactor",
  "timestamp": "2025-11-03T11:00:00Z"
}
```

**Frontend Action**: Refresh sprint data if projectPath matches

---

### Event: `asaf:sprint-selection-changed`

**Emitted by**: Backend (file watcher detects `.current-sprint.json` change)

**Payload**:
```json
{
  "type": "asaf:sprint-selection-changed",
  "projectPath": "/Users/elik.k/git/project",
  "timestamp": "2025-11-03T11:00:00Z"
}
```

**Frontend Action**: Refresh sprint data if projectPath matches

---

### File Watcher Setup

**File**: `server/index.js` (or wherever file watcher is configured)

```javascript
import chokidar from 'chokidar';

// Watch for .current-sprint.json changes in all projects
const watchAsafSelections = (projectPaths, wss) => {
  projectPaths.forEach(projectPath => {
    const selectionFile = path.join(projectPath, 'asaf', '.current-sprint.json');

    chokidar.watch(selectionFile, { ignoreInitial: true })
      .on('change', () => {
        console.log(`Sprint selection changed: ${projectPath}`);

        // Emit WebSocket event
        wss.clients.forEach(client => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: 'asaf:sprint-selection-changed',
              projectPath: projectPath,
              timestamp: new Date().toISOString()
            }));
          }
        });
      })
      .on('add', () => {
        // .current-sprint.json created (first sprint selection)
        console.log(`Sprint selection created: ${projectPath}`);

        wss.clients.forEach(client => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'asaf:sprint-selection-changed',
              projectPath: projectPath,
              timestamp: new Date().toISOString()
            }));
          }
        });
      });
  });
};
```

---

## Implementation Sequence

### Phase 1: Backend Foundation (2-3 hours)

**Task 1.1**: Modify `asaf-reader.js` (1 hour)
- Add `getCurrentSprintSelection()`
- Add `getAllSprints()`
- Add `createCurrentSprintSelection()`
- Modify `readAsafSprintData()` to use selection
- **Test**: Unit test each function with sample data

**Task 1.2**: Add API endpoints in `asaf.js` (1 hour)
- `GET /current`
- `GET /list`
- `POST /select`
- **Test**: Postman/curl tests for all endpoints

**Task 1.3**: Update file watcher (30 min)
- Watch `.current-sprint.json`
- Emit WebSocket events
- **Test**: Manually edit file, check WebSocket messages

---

### Phase 2: Frontend UI (2-3 hours)

**Task 2.1**: Update `useASAFData` hook (1 hour)
- Add `fetchCurrentSelection()`
- Add `fetchAllSprints()`
- Add `selectSprint()`
- Handle new WebSocket events
- **Test**: Log all fetch calls and responses

**Task 2.2**: Create `ASAFSprintSelector` component (1 hour)
- Build dropdown UI
- Style sprint list items
- Handle selection
- **Test**: Render with mock data

**Task 2.3**: Update `ASAFPanel` and `ASAFPanelHeader` (30 min)
- Pass sprint list to header
- Wire up selection handler
- **Test**: Full integration with real API

---

### Phase 3: Panel Visibility Investigation (1-2 hours)

**Task 3.1**: Path encoding audit (30 min)
- Find all path encoding/decoding locations
- Replace manual decoding with `extractProjectDirectory()`
- Add debug logging

**Task 3.2**: Test `asaf-for-claude-code` project (30 min)
- Run frontend with this project selected
- Check console logs for path resolution
- Verify API calls succeed
- Confirm panel renders

**Task 3.3**: Fix any remaining issues (30 min - 1 hour)
- Based on findings, patch code
- Retest

---

### Phase 4: Testing & QA (1-2 hours)

**Task 4.1**: Edge case testing (1 hour)
- No selection → auto-select
- Corrupted `.current-sprint.json`
- Selected sprint deleted
- Rapid switching
- Multi-client sync

**Task 4.2**: Manual QA (30 min - 1 hour)
- Test all user scenarios
- Verify WebSocket sync (terminal ↔ UI)
- Check responsive behavior

---

## Total Estimated Time: 6-10 hours

**Backend**: 2-3 hours
**Frontend**: 2-3 hours
**Investigation**: 1-2 hours
**Testing**: 1-2 hours

---

## Success Criteria

1. Sprint selector appears when project has 2+ sprints ✅
2. Panel appears for ALL valid ASAF projects (including `asaf-for-claude-code`) ✅
3. Terminal `/asaf-select` syncs to UI within 2 seconds ✅
4. UI sprint selection updates `.current-sprint.json` immediately ✅
5. Multiple browser tabs stay in sync ✅
6. Edge cases handled gracefully ✅
7. No race conditions or stale data ✅
8. Clear error messages for failures ✅

---

**Status**: Design Complete
**Next Step**: Begin Phase 1 implementation
