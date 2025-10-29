/**
 * ASAF Sprint Data Reader
 * ========================
 *
 * Utility module for reading and validating ASAF sprint data from the file system.
 * Handles edge cases including corrupted structure, missing files, and multiple sprints.
 */

import { promises as fs } from 'fs';
import path from 'path';

// Valid ASAF phases
const VALID_PHASES = ['grooming', 'planning', 'implementation', 'demo', 'retrospective'];

// Valid ASAF statuses
const VALID_STATUSES = ['ready', 'in-progress', 'complete', 'blocked'];

/**
 * Read and validate ASAF sprint data for a project
 * @param {string} projectPath - Absolute path to the project directory
 * @returns {Object} Sprint data or error information
 */
export async function readAsafSprintData(projectPath) {
  try {
    const asafPath = path.join(projectPath, 'asaf');

    // Check if asaf directory exists
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

    // List all directories in asaf folder
    const entries = await fs.readdir(asafPath, { withFileTypes: true });
    const sprintDirs = entries.filter(entry => entry.isDirectory());

    if (sprintDirs.length === 0) {
      return { exists: false };
    }

    // Get all valid sprints with their metadata
    const sprints = [];

    for (const dir of sprintDirs) {
      const sprintPath = path.join(asafPath, dir.name);
      const sprintData = await readSingleSprintData(sprintPath, dir.name);

      if (sprintData.valid) {
        sprints.push(sprintData);
      }
    }

    if (sprints.length === 0) {
      return {
        exists: false,
        error: 'No valid ASAF sprints found (corrupted structure)'
      };
    }

    // Return the most recently updated sprint
    const mostRecentSprint = sprints.reduce((latest, current) => {
      const latestTime = new Date(latest.state.updated).getTime();
      const currentTime = new Date(current.state.updated).getTime();
      return currentTime > latestTime ? current : latest;
    });

    return {
      exists: true,
      ...mostRecentSprint,
      totalSprints: sprints.length,
      allSprints: sprints.length > 1 ? sprints.map(s => ({
        sprintName: s.sprintName,
        phase: s.state.phase,
        status: s.state.status,
        updated: s.state.updated
      })) : undefined
    };

  } catch (error) {
    console.error('Error reading ASAF sprint data:', error);

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