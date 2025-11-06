/**
 * ASAF Sprint Data Reader
 * ========================
 *
 * Utility module for reading and validating ASAF sprint data from the file system.
 * Handles edge cases including corrupted structure, missing files, and multiple sprints.
 *
 * Sprint Selection Support:
 * - Reads `.current-sprint.json` as source of truth for selected sprint
 * - Falls back to auto-selection (most recent by mtime) if selection missing
 * - Creates `.current-sprint.json` on auto-selection
 * - Handles corrupted files, deleted sprints, and missing data gracefully
 */

import { promises as fs } from 'fs';
import path from 'path';

// Valid ASAF phases
const VALID_PHASES = ['grooming', 'planning', 'implementation', 'demo', 'retrospective'];

// Valid ASAF statuses
const VALID_STATUSES = ['ready', 'in-progress', 'complete', 'blocked'];

/**
 * Get current sprint selection from .current-sprint.json
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Object|null} Selection object or null if file doesn't exist/is invalid
 */
export async function getCurrentSprintSelection(projectPath) {
  const selectionFile = path.join(projectPath, 'asaf', '.current-sprint.json');

  try {
    const content = await fs.readFile(selectionFile, 'utf8');
    const selection = JSON.parse(content);

    // Validate structure
    if (!selection.sprint || !selection.selected_at || !selection.type) {
      console.warn('[ASAF] Invalid .current-sprint.json structure:', selection);
      return null;
    }

    return selection;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist - no selection yet
      return null;
    }
    if (error instanceof SyntaxError) {
      console.error('[ASAF] Corrupted .current-sprint.json:', error.message);
      return null;
    }
    // Re-throw unexpected errors (e.g., permission denied)
    throw error;
  }
}

/**
 * Get all valid sprints in a project
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Array} Array of sprint metadata objects sorted by updated time (most recent first)
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
          console.log(`[ASAF] Skipping invalid sprint ${entry.name}: ${validationError}`);
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
        console.log(`[ASAF] Skipping invalid sprint ${entry.name}: ${error.message}`);
      }
    }

    // Sort by updated time (most recent first)
    sprints.sort((a, b) => new Date(b.updated) - new Date(a.updated));

    return sprints;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // No asaf directory
      return [];
    }
    console.error('[ASAF] Error reading sprints:', error);
    throw error;
  }
}

/**
 * Create or update .current-sprint.json
 * @param {string} projectPath - Absolute path to the project directory
 * @param {string} sprintName - Name of the sprint to select
 * @param {string} type - Sprint type (default: 'full')
 * @returns {void}
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
    console.log(`[ASAF] Created sprint selection: ${sprintName}`);
  } catch (error) {
    console.error('[ASAF] Failed to write .current-sprint.json:', error);
    throw error; // Critical error - should fail loudly
  }
}

/**
 * Read and validate ASAF sprint data for a project
 * NOW: Reads .current-sprint.json first, then falls back to auto-selection
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Object} Sprint data or error information
 */
export async function readAsafSprintData(projectPath) {
  try {
    const asafPath = path.join(projectPath, 'asaf');

    // Step 1: Check if asaf directory exists
    try {
      const stats = await fs.stat(asafPath);
      if (!stats.isDirectory()) {
        return {
          exists: false,
          error: 'asaf path exists but is not a directory'
        };
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        // No asaf directory
        return { exists: false };
      }
      if (error.code === 'EACCES') {
        throw new Error('Permission denied accessing ASAF directory');
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
        console.log(`[ASAF] Using selected sprint: ${selection.sprint}`);

        // Get all sprints for metadata
        const allSprints = await getAllSprints(projectPath);

        return {
          exists: true,
          ...sprintData,
          isSelected: true,
          selectedAt: selection.selected_at,
          totalSprints: allSprints.length,
          allSprints: allSprints.length > 1 ? allSprints.map(s => ({
            sprintName: s.name,
            phase: s.phase,
            status: s.status,
            updated: s.updated
          })) : undefined
        };
      }

      // Selection points to deleted/invalid sprint - fall through to auto-select
      console.warn(`[ASAF] Selected sprint '${selection.sprint}' is invalid or deleted, auto-selecting...`);
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
    const mostRecent = allSprints[0]; // Already sorted by updated time
    console.log(`[ASAF] Auto-selecting sprint: ${mostRecent.name}`);

    // Create .current-sprint.json for this auto-selection
    await createCurrentSprintSelection(projectPath, mostRecent.name, mostRecent.type);

    // Step 6: Read and return the auto-selected sprint
    const selectedSprintPath = path.join(asafPath, mostRecent.name);
    const sprintData = await readSingleSprintData(selectedSprintPath, mostRecent.name);

    if (!sprintData.valid) {
      return {
        exists: false,
        error: 'Auto-selected sprint is invalid'
      };
    }

    return {
      exists: true,
      ...sprintData,
      isSelected: true,
      isAutoSelected: true,
      totalSprints: allSprints.length,
      allSprints: allSprints.length > 1 ? allSprints.map(s => ({
        sprintName: s.name,
        phase: s.phase,
        status: s.status,
        updated: s.updated
      })) : undefined
    };

  } catch (error) {
    console.error('[ASAF] Error reading ASAF sprint data:', error);

    if (error.message.includes('Permission denied')) {
      throw error; // Re-throw permission errors
    }

    return {
      exists: false,
      error: `Failed to read ASAF data: ${error.message}`
    };
  }
}

/**
 * Read data for a single sprint
 * @param {string} sprintPath - Path to the sprint directory
 * @param {string} sprintName - Name of the sprint
 * @returns {Object} Sprint data with validation status
 */
async function readSingleSprintData(sprintPath, sprintName) {
  try {
    // Read .state.json
    const statePath = path.join(sprintPath, '.state.json');
    let stateData;

    try {
      const stateContent = await fs.readFile(statePath, 'utf8');
      stateData = JSON.parse(stateContent);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          valid: false,
          error: 'Missing .state.json file',
          sprintName
        };
      }
      if (error instanceof SyntaxError) {
        return {
          valid: false,
          error: 'Invalid JSON in .state.json',
          sprintName
        };
      }
      throw error;
    }

    // Validate state structure
    const validationError = validateStateJson(stateData);
    if (validationError) {
      return {
        valid: false,
        error: validationError,
        sprintName
      };
    }

    // Read SUMMARY.md
    const summaryPath = path.join(sprintPath, 'SUMMARY.md');
    let summaryContent = '';

    try {
      summaryContent = await fs.readFile(summaryPath, 'utf8');

      // Handle empty SUMMARY.md
      if (!summaryContent || summaryContent.trim() === '') {
        summaryContent = '*No summary content yet*';
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return {
          valid: false,
          error: 'Missing SUMMARY.md file',
          sprintName
        };
      }
      throw error;
    }

    // Check for phase-specific folders
    const hasGrooming = await checkDirectoryExists(path.join(sprintPath, 'grooming'));
    const hasPlanning = await checkDirectoryExists(path.join(sprintPath, 'planning'));
    const hasImplementation = await checkDirectoryExists(path.join(sprintPath, 'implementation'));
    const hasDemo = await checkDirectoryExists(path.join(sprintPath, 'demo'));
    const hasRetrospective = await checkDirectoryExists(path.join(sprintPath, 'retrospective'));

    return {
      valid: true,
      sprintName,
      state: {
        phase: stateData.phase,
        status: stateData.status,
        created: stateData.created || new Date().toISOString(),
        updated: stateData.updated || stateData.created || new Date().toISOString(),
        grooming_approved: stateData.grooming_approved || false,
        planning_complete: stateData.planning_complete || false,
        implementation_complete: stateData.implementation_complete || false,
        demo_complete: stateData.demo_complete || false,
        retrospective_complete: stateData.retrospective_complete || false
      },
      summary: summaryContent,
      hasGrooming,
      hasPlanning,
      hasImplementation,
      hasDemo,
      hasRetrospective
    };

  } catch (error) {
    console.error(`Error reading sprint ${sprintName}:`, error);
    return {
      valid: false,
      error: error.message,
      sprintName
    };
  }
}

/**
 * Validate .state.json structure
 * @param {Object} state - State object to validate
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateStateJson(state) {
  if (!state || typeof state !== 'object') {
    return 'Invalid .state.json structure';
  }

  if (!state.phase) {
    return 'Missing phase in .state.json';
  }

  if (!VALID_PHASES.includes(state.phase)) {
    return `Invalid phase value: ${state.phase}. Must be one of: ${VALID_PHASES.join(', ')}`;
  }

  if (!state.status) {
    return 'Missing status in .state.json';
  }

  if (!VALID_STATUSES.includes(state.status)) {
    return `Invalid status value: ${state.status}. Must be one of: ${VALID_STATUSES.join(', ')}`;
  }

  return null;
}

/**
 * Check if a directory exists
 * @param {string} dirPath - Path to check
 * @returns {boolean} True if directory exists
 */
async function checkDirectoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Get the most recent sprint from a project
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Object} Most recent sprint or null
 */
export async function getMostRecentSprint(projectPath) {
  const data = await readAsafSprintData(projectPath);

  if (data.exists) {
    // Remove helper properties before returning
    const { valid, allSprints, totalSprints, ...sprintData } = data;
    return sprintData;
  }

  return null;
}