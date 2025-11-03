# Design Document: ASAF Sprint Selection Adaptation for Claude Code UI

**Created**: November 3, 2025
**Author**: Claude Code
**Status**: Design Phase
**Priority**: High (Core ASAF functionality)

---

## Executive Summary

Adapt Claude Code UI to support ASAF's new sprint selection feature, enabling users to:
- View and switch between multiple concurrent sprints in a single repository
- See which sprint is currently active in the ASAF panel
- Auto-select the most recently modified sprint when no selection exists
- Provide a visual sprint selector/switcher in the UI

**Key Challenge**: Claude Code UI currently assumes one active sprint per project. The new ASAF architecture supports multiple concurrent sprints with explicit selection via `/asaf/.current-sprint.json`.

---

## Background: ASAF Sprint Selection Feature

### What Changed in ASAF

ASAF now supports multiple concurrent sprints in a single repository with explicit selection tracking:

**State File**: `/asaf/.current-sprint.json`
```json
{
  "sprint": "sprint-name",
  "selected_at": "2025-10-31T11:30:00Z",
  "type": "full"
}
```

**Auto-Selection Algorithm**:
- Scans `/asaf/` for all valid sprints (have `.state.json`)
- Sorts by `.state.json` modification time (most recent first)
- Creates `.current-sprint.json` automatically on first command
- Re-selects if current sprint is deleted

**New Command**: `/asaf-select`
- Interactive mode: shows list with current sprint highlighted
- Direct mode: `/asaf-select <sprint-name>`
- Fuzzy matching for typos

**Command Integration**:
- All 11 sprint-context commands (groom, impl, demo, retro, status, summary) now validate sprint selection as "Step 0"
- `/asaf-status` shows "CURRENT SPRINT" prominently
- `/asaf-init` prompts user to set new sprint as current

---

## Current Claude Code UI Implementation

### Backend (server/)

**File**: `server/utils/asaf-reader.js`
- `readAsafSprintData(projectPath)` - Returns most recent sprint if multiple exist
- No awareness of `.current-sprint.json`
- Uses `.state.json` modification time to pick "most recent" sprint

**File**: `server/routes/asaf.js`
- `GET /api/asaf/:projectPath` - Returns single sprint data
- No endpoint for listing multiple sprints
- No endpoint for sprint selection management

**File**: `server/utils/asaf-watcher.js`
- Watches `asaf/**` for file changes
- Emits `asaf:updated` WebSocket event
- No differentiation between sprints

### Frontend (src/)

**File**: `src/components/ASAFPanel.jsx`
- Displays single sprint data (name, phase, status, progress, summary)
- No concept of sprint selection
- No UI for switching sprints

**File**: `src/hooks/useASAFData.js`
- Fetches sprint data from `/api/asaf/:projectPath`
- Returns single sprint object
- No awareness of multiple sprints

---

## Problem Statement

### Issues with Current Implementation

1. **Hidden Sprints**: If a user has 3 sprints (feature-a, feature-b, feature-c), Claude Code UI only shows the most recent one. The other 2 are invisible.

2. **Mismatched State**: If user runs `/asaf-select feature-a` in terminal, but Claude Code UI shows `feature-b` (most recent by mtime), this creates confusion.

3. **No Sprint Switching**: User cannot switch active sprint from UI - must use terminal commands.

4. **No Sprint Visibility**: User doesn't know how many sprints exist or which one is active.

5. **Auto-selection Disconnect**: ASAF's auto-selection algorithm creates `.current-sprint.json`, but Claude Code UI ignores it.

### User Impact

**Solo Developer Workflow**:
- Working on multiple features in parallel (feature-a, bug-fix-b, refactor-c)
- Switches between sprints using `/asaf-select`
- Claude Code UI shows wrong sprint → confusion, potential mistakes
- Must constantly check terminal `/asaf-status` to verify active sprint

**Expected Behavior**:
- Claude Code UI shows currently selected sprint (reads `.current-sprint.json`)
- UI provides visual sprint selector with all available sprints
- Switching sprint in UI updates `.current-sprint.json` (same as `/asaf-select`)
- Sprint list shows sprint metadata (phase, status, last updated)

---

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                               │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  ASAFPanel.jsx                                            │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  ASAFSprintSelector (NEW)                           │ │ │
│  │  │  - Dropdown/Modal with sprint list                  │ │ │
│  │  │  - Shows current sprint (star/highlight)            │ │ │
│  │  │  - Sprint metadata preview (phase, status)          │ │ │
│  │  │  - Switch sprint → POST /api/asaf/:project/select  │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  ASAFPanelHeader (MODIFIED)                         │ │ │
│  │  │  - Show current sprint name with selector button   │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  useASAFData hook (MODIFIED)                                   │
│  - Fetch current selection from /api/asaf/:project/current     │
│  - Fetch all sprints from /api/asaf/:project/list              │
│  - Fetch selected sprint data from /api/asaf/:project/sprint   │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Backend API (Express)                                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  GET /api/asaf/:projectPath/current                       │ │
│  │  → Read .current-sprint.json                              │ │
│  │  → Return {sprint, selected_at, type} or null             │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  GET /api/asaf/:projectPath/list                          │ │
│  │  → Scan /asaf/ for all sprints                            │ │
│  │  → Return [{name, phase, status, updated}, ...]           │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  POST /api/asaf/:projectPath/select                       │ │
│  │  → Validate sprint exists                                 │ │
│  │  → Create/update .current-sprint.json                     │ │
│  │  → Emit WebSocket event "asaf:sprint-selected"            │ │
│  └───────────────────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  GET /api/asaf/:projectPath (MODIFIED)                    │ │
│  │  → Read .current-sprint.json first                        │ │
│  │  → Return selected sprint data (not "most recent")        │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  File System                                                    │
│  /project/asaf/                                                 │
│  ├── .current-sprint.json (NEW - sprint selection state)       │
│  ├── sprint-a/                                                  │
│  │   ├── .state.json                                           │
│  │   └── SUMMARY.md                                            │
│  ├── sprint-b/                                                  │
│  │   ├── .state.json                                           │
│  │   └── SUMMARY.md                                            │
│  └── sprint-c/                                                  │
│      ├── .state.json                                           │
│      └── SUMMARY.md                                            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Backend - Sprint Selection API (2-3 hours)

#### Task 1.1: Update asaf-reader.js (30 min)

**New Function**: `getCurrentSprintSelection(projectPath)`
```javascript
/**
 * Read current sprint selection from .current-sprint.json
 * Returns null if file doesn't exist or is invalid
 */
async function getCurrentSprintSelection(projectPath) {
  const selectionFile = path.join(projectPath, 'asaf', '.current-sprint.json');

  try {
    const content = await fs.readFile(selectionFile, 'utf8');
    const selection = JSON.parse(content);

    // Validate structure
    if (!selection.sprint || !selection.selected_at || !selection.type) {
      return null;
    }

    return selection;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist - no selection yet
    }
    console.error('Error reading current sprint selection:', error);
    return null; // Corrupted file - treat as no selection
  }
}
```

**New Function**: `getAllSprints(projectPath)`
```javascript
/**
 * Scan asaf directory for all valid sprints
 * Returns array of sprint metadata
 */
async function getAllSprints(projectPath) {
  const asafDir = path.join(projectPath, 'asaf');

  try {
    const entries = await fs.readdir(asafDir, { withFileTypes: true });
    const sprints = [];

    for (const entry of entries) {
      // Skip files, hidden files, and express directory
      if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'express') {
        continue;
      }

      const sprintPath = path.join(asafDir, entry.name);
      const stateFile = path.join(sprintPath, '.state.json');

      // Check if valid sprint (has .state.json)
      try {
        const stateContent = await fs.readFile(stateFile, 'utf8');
        const state = JSON.parse(stateContent);

        // Get file modification time for sorting
        const stats = await fs.stat(stateFile);

        sprints.push({
          name: entry.name,
          phase: state.phase,
          status: state.status,
          type: state.type || 'full',
          created: state.created,
          updated: state.updated || stats.mtime.toISOString()
        });
      } catch (error) {
        // Invalid sprint - skip it
        console.log(`Skipping invalid sprint: ${entry.name}`);
      }
    }

    // Sort by updated time (most recent first)
    sprints.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    return sprints;
  } catch (error) {
    console.error('Error reading sprints:', error);
    return [];
  }
}
```

**Modify**: `readAsafSprintData(projectPath)`
```javascript
// BEFORE: Returns most recent sprint
// AFTER: Returns currently selected sprint (reads .current-sprint.json first)

async function readAsafSprintData(projectPath) {
  // 1. Read current selection
  const selection = await getCurrentSprintSelection(projectPath);

  // 2. If selection exists, use it
  if (selection && selection.sprint) {
    const sprintData = await readSingleSprintData(projectPath, selection.sprint);
    if (sprintData.exists) {
      return sprintData;
    }
    // Selection points to deleted sprint - fall through to auto-select
  }

  // 3. No valid selection - auto-select most recent
  const allSprints = await getAllSprints(projectPath);

  if (allSprints.length === 0) {
    return { exists: false, message: 'No valid sprints found' };
  }

  // Select most recent sprint
  const mostRecent = allSprints[0];

  // Create .current-sprint.json (auto-selection)
  await createCurrentSprintSelection(projectPath, mostRecent.name, 'full');

  return await readSingleSprintData(projectPath, mostRecent.name);
}
```

**New Function**: `createCurrentSprintSelection(projectPath, sprintName, type)`
```javascript
/**
 * Create or update .current-sprint.json
 */
async function createCurrentSprintSelection(projectPath, sprintName, type = 'full') {
  const selectionFile = path.join(projectPath, 'asaf', '.current-sprint.json');

  const selection = {
    sprint: sprintName,
    selected_at: new Date().toISOString(),
    type: type
  };

  await fs.writeFile(selectionFile, JSON.stringify(selection, null, 2), 'utf8');
}
```

#### Task 1.2: Create New API Endpoints in asaf.js (1 hour)

**GET /api/asaf/:projectPath/current**
```javascript
/**
 * Get current sprint selection
 * Returns {sprint, selected_at, type} or {exists: false}
 */
router.get('/:projectPath/current', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;
    const actualProjectPath = await extractProjectDirectory(encodedPath);

    // Security validation (same as main endpoint)
    // ... path validation code ...

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

**GET /api/asaf/:projectPath/list**
```javascript
/**
 * List all available sprints
 * Returns array of sprint metadata
 */
router.get('/:projectPath/list', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;
    const actualProjectPath = await extractProjectDirectory(encodedPath);

    // Security validation
    // ... path validation code ...

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
      error: 'Failed to list sprints'
    });
  }
});
```

**POST /api/asaf/:projectPath/select**
```javascript
/**
 * Select a sprint as current
 * Body: {sprint: "sprint-name"}
 */
router.post('/:projectPath/select', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;
    const { sprint: sprintName } = req.body;

    if (!sprintName) {
      return res.status(400).json({
        error: 'Sprint name is required'
      });
    }

    const actualProjectPath = await extractProjectDirectory(encodedPath);

    // Security validation
    // ... path validation code ...

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
    if (req.wss) {
      req.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
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

#### Task 1.3: Update WebSocket Handler in server/index.js (30 min)

Add support for `.current-sprint.json` file watching:

```javascript
// In file watcher setup
chokidar.watch(path.join(projectPath, 'asaf/.current-sprint.json'))
  .on('change', () => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'asaf:sprint-selection-changed',
          projectPath: projectPath,
          timestamp: new Date().toISOString()
        }));
      }
    });
  });
```

---

### Phase 2: Frontend - Sprint Selector UI (3-4 hours)

#### Task 2.1: Update useASAFData Hook (1 hour)

**File**: `src/hooks/useASAFData.js`

Add sprint list and selection management:

```javascript
export function useASAFData(selectedProject) {
  const [sprintData, setSprintData] = useState(null);
  const [allSprints, setAllSprints] = useState([]);
  const [currentSelection, setCurrentSelection] = useState(null);
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
  }, []);

  // ... rest of hook ...

  return {
    sprintData,
    allSprints,
    currentSelection,
    isLoading,
    error,
    refreshData,
    selectSprint
  };
}
```

#### Task 2.2: Create ASAFSprintSelector Component (1.5 hours)

**File**: `src/components/asaf/ASAFSprintSelector.jsx`

```javascript
/**
 * ASAFSprintSelector Component
 *
 * Dropdown/modal for switching between multiple ASAF sprints.
 * Shows sprint list with metadata (phase, status, last updated).
 * Highlights current sprint.
 */

import React, { useState } from 'react';
import { ChevronDown, Star, Check } from 'lucide-react';

const ASAFSprintSelector = ({
  allSprints,
  currentSprintName,
  onSelectSprint,
  isLoading
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!allSprints || allSprints.length === 0) {
    return null;
  }

  // If only 1 sprint, don't show selector
  if (allSprints.length === 1) {
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
        <ChevronDown className="w-4 h-4" />
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

#### Task 2.3: Update ASAFPanelHeader (30 min)

**File**: `src/components/asaf/ASAFPanelHeader.jsx`

Add sprint selector to header:

```javascript
import ASAFSprintSelector from './ASAFSprintSelector';

const ASAFPanelHeader = ({
  sprintName,
  phase,
  onToggle,
  isMobile,
  allSprints,          // NEW
  currentSelection,    // NEW
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
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${
              phase === 'demo' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
              phase === 'implementation' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
              'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            }`}>
              {phase}
            </span>
          </div>
        </div>
      </div>

      {/* Sprint Selector (NEW) */}
      <ASAFSprintSelector
        allSprints={allSprints}
        currentSprintName={sprintName}
        onSelectSprint={onSelectSprint}
        isLoading={isLoading}
      />

      {/* Collapse Button */}
      <button onClick={onToggle} className="ml-2">
        {/* ... existing button code ... */}
      </button>
    </div>
  );
};
```

#### Task 2.4: Update ASAFPanel Component (1 hour)

**File**: `src/components/ASAFPanel.jsx`

Integrate sprint selector and handle selection:

```javascript
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
      // Data will be refreshed automatically by selectSprint
    } catch (error) {
      console.error('Error selecting sprint:', error);
      // Show error notification
    }
  };

  // ... rest of component ...

  return (
    <div className={/* ... */}>
      {isOpen && (
        <div className="flex flex-col h-full">
          <ASAFPanelHeader
            sprintName={sprintData.sprintName}
            phase={sprintData.state?.phase}
            onToggle={togglePanel}
            isMobile={isMobile}
            allSprints={allSprints}           // NEW
            currentSelection={currentSelection} // NEW
            onSelectSprint={handleSelectSprint} // NEW
            isLoading={isLoading}              // NEW
          />

          {/* Rest of panel content */}
        </div>
      )}
    </div>
  );
};
```

---

### Phase 3: Testing & Edge Cases (1-2 hours)

#### Edge Cases to Test

1. **No .current-sprint.json** → Backend auto-selects, UI shows selection
2. **Corrupted .current-sprint.json** → Backend treats as missing, auto-selects
3. **Selected sprint deleted** → Backend re-selects, UI updates
4. **Only 1 sprint** → UI hides sprint selector (no need to switch)
5. **User switches sprint in terminal** → File watcher detects change, UI updates
6. **User switches sprint in UI** → WebSocket notifies all clients, updates immediately
7. **Multiple sprints, no selection** → Backend auto-selects most recent, UI shows it
8. **Sprint created while UI open** → File watcher emits event, UI refreshes sprint list
9. **Rapid sprint switching** → Debounce/loading state prevents race conditions

#### Test Scenarios

**Scenario 1: First-time User**
- User creates first sprint with `/asaf-init feature-a`
- Opens Claude Code UI
- ASAF panel shows `feature-a` (auto-selected)
- No sprint selector shown (only 1 sprint)

**Scenario 2: Multiple Sprints**
- User has 3 sprints: `feature-a`, `bug-fix-b`, `refactor-c`
- `.current-sprint.json` says `bug-fix-b`
- Opens Claude Code UI
- ASAF panel shows `bug-fix-b`
- Sprint selector button shows "3 sprints"
- Click selector → dropdown shows all 3, `bug-fix-b` highlighted with star
- Click `feature-a` → UI switches, panel shows `feature-a`, `.current-sprint.json` updated

**Scenario 3: Terminal + UI Sync**
- UI shows `feature-a`
- User runs `/asaf-select refactor-c` in terminal
- File watcher detects `.current-sprint.json` change
- WebSocket event `asaf:sprint-selection-changed` emitted
- UI receives event, refreshes data
- UI now shows `refactor-c`

---

## Files to Create/Modify

### Backend (5 files)

**New Functions in Existing Files**:
1. `server/utils/asaf-reader.js` (+150 lines)
   - `getCurrentSprintSelection()`
   - `getAllSprints()`
   - `createCurrentSprintSelection()`
   - Modify `readAsafSprintData()` to use selection

**New API Routes**:
2. `server/routes/asaf.js` (+200 lines)
   - `GET /api/asaf/:projectPath/current`
   - `GET /api/asaf/:projectPath/list`
   - `POST /api/asaf/:projectPath/select`

**WebSocket Updates**:
3. `server/index.js` (+20 lines)
   - Watch `.current-sprint.json` for changes
   - Emit `asaf:sprint-selection-changed` event

### Frontend (4 files)

**New Components**:
4. `src/components/asaf/ASAFSprintSelector.jsx` (NEW, ~150 lines)
   - Sprint dropdown/modal with list and selection

**Modified Components**:
5. `src/components/asaf/ASAFPanelHeader.jsx` (+20 lines)
   - Add sprint selector to header

6. `src/components/ASAFPanel.jsx` (+30 lines)
   - Pass sprint list and selection handler to header

**Modified Hooks**:
7. `src/hooks/useASAFData.js` (+100 lines)
   - Add `fetchCurrentSelection()`
   - Add `fetchAllSprints()`
   - Add `selectSprint()`
   - Handle new WebSocket events

### Documentation

8. `CLAUDE.md` (+30 lines)
   - Document sprint selection support
   - API endpoints
   - WebSocket events

9. `README.md` (+20 lines)
   - User-facing sprint selector documentation

---

## Technical Decisions

### 1. Sprint Selection Source of Truth

**Decision**: Backend reads `.current-sprint.json` directly
**Rationale**: ASAF framework owns this file. Claude Code UI is a visualization tool.
**Trade-off**: UI depends on file system state (but this is already true for all ASAF data)

### 2. Auto-Selection Behavior

**Decision**: Backend auto-selects most recent sprint if no selection exists
**Rationale**: Matches ASAF's auto-selection algorithm in commands
**Trade-off**: First API call may create `.current-sprint.json` as side effect

### 3. Sprint Selector UI Pattern

**Decision**: Dropdown button in panel header (not modal, not sidebar)
**Rationale**:
- Compact (doesn't take much space)
- Accessible (always visible when panel open)
- Familiar UX (similar to branch selector in Git UI)
**Trade-off**: Limited space for sprint metadata (show only phase/status/date)

### 4. WebSocket Event for Sprint Selection

**Decision**: Emit `asaf:sprint-selected` on POST, `asaf:sprint-selection-changed` on file change
**Rationale**: Differentiate between UI-initiated changes vs external (terminal) changes
**Trade-off**: Two event types to handle, but clearer semantics

### 5. Single Sprint Handling

**Decision**: Hide sprint selector if only 1 sprint exists
**Rationale**: No need to "select" when there's only one option
**Trade-off**: Selector appears/disappears as sprints are created/deleted

---

## Success Metrics

1. **Accuracy**: UI always shows the currently selected sprint (reads `.current-sprint.json`)
2. **Sync**: Changes in terminal reflect in UI within 2 seconds (file watcher + WebSocket)
3. **UX**: Sprint selector is discoverable and easy to use
4. **Performance**: Sprint list loads in <500ms for up to 10 sprints
5. **Edge Case Handling**: All 9 edge cases pass manual testing

---

## Future Enhancements (Out of Scope)

1. **Sprint Comparison**: Side-by-side view of two sprints
2. **Sprint Search/Filter**: Search bar for projects with many sprints
3. **Sprint Creation from UI**: Button to run `/asaf-init <name>`
4. **Sprint Deletion from UI**: Delete sprint folder with confirmation
5. **Sprint History**: Timeline of sprint selections
6. **Multi-Sprint Status**: Dashboard view showing all sprints at once
7. **Sprint Tags**: Custom labels for organizing sprints

---

## Risk Assessment

### High Risk
- **File System Race Conditions**: If user deletes sprint while UI is fetching data
  - Mitigation: Error handling in backend, graceful fallback to auto-selection

### Medium Risk
- **WebSocket Disconnection**: User switches sprint in UI, WebSocket drops, other clients miss update
  - Mitigation: File watcher will eventually emit event when connection restored

### Low Risk
- **Stale Cache**: UI shows old sprint list after new sprint created
  - Mitigation: File watcher on `/asaf/` directory emits event for any new folder

---

## Implementation Timeline

**Estimated Total Time**: 6-9 hours

- **Phase 1 (Backend API)**: 2-3 hours
  - Task 1.1: asaf-reader.js (30 min)
  - Task 1.2: API endpoints (1 hour)
  - Task 1.3: WebSocket handler (30 min)
  - Buffer for testing/debugging (30 min - 1 hour)

- **Phase 2 (Frontend UI)**: 3-4 hours
  - Task 2.1: useASAFData hook (1 hour)
  - Task 2.2: ASAFSprintSelector component (1.5 hours)
  - Task 2.3: ASAFPanelHeader update (30 min)
  - Task 2.4: ASAFPanel integration (1 hour)

- **Phase 3 (Testing)**: 1-2 hours
  - Edge case testing (1 hour)
  - Manual QA of all scenarios (30 min - 1 hour)

**Suggested Approach**: Implement Phase 1 → Test → Phase 2 → Test → Phase 3 → Done

---

## Next Steps

1. **Review this design document** - Get feedback on approach, API design, UX decisions
2. **Create ASAF sprint for this feature** - Run `/asaf-init asaf-sprint-selection-ui`
3. **Begin Phase 1 implementation** - Start with backend API (easier to test in isolation)
4. **Test Phase 1 with Postman/curl** - Verify endpoints work before building UI
5. **Implement Phase 2** - Build sprint selector UI
6. **End-to-end testing** - Test all scenarios with real ASAF projects

---

**Design Status**: ✅ Ready for Review
**Next Action**: Create ASAF sprint and begin implementation

