/**
 * ASAF API Routes
 * ================
 *
 * REST API endpoints for ASAF sprint data management.
 * Provides access to sprint metadata, state, and summary content.
 */

import express from 'express';
import path from 'path';
import {
  readAsafSprintData,
  getCurrentSprintSelection,
  getAllSprints,
  createCurrentSprintSelection
} from '../utils/asaf-reader.js';
import { extractProjectDirectory } from '../projects.js';

const router = express.Router();

/**
 * GET /api/asaf/:projectPath
 *
 * Retrieve ASAF sprint data for a project.
 * Returns the most recently updated sprint if multiple exist.
 *
 * Security:
 * - Validates project path against user's project list
 * - Prevents path traversal attacks
 * - Handles file system errors gracefully
 *
 * Response:
 * - 200: Sprint data found
 * - 403: Invalid project path (not in user's list)
 * - 404: No ASAF sprint exists
 * - 500: Server error or permission denied
 */
router.get('/:projectPath', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;

    console.log('[ASAF API] Request received:', {
      encodedPath,
      url: req.url,
      originalUrl: req.originalUrl,
      params: req.params
    });

    if (!encodedPath) {
      return res.status(400).json({
        error: 'Project path is required'
      });
    }

    // Decode and validate project path using extractProjectDirectory
    // CRITICAL: Do NOT use manual decoding (encodedPath.replace(/-/g, '/'))
    // This causes issues with projects that have hyphens in their path
    let actualProjectPath;
    try {
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      console.error('[ASAF API] Error extracting project directory:', error);
      return res.status(403).json({
        error: 'Project not found or access denied'
      });
    }

    // Security check: Ensure the path is absolute and doesn't contain traversal patterns
    if (!path.isAbsolute(actualProjectPath)) {
      return res.status(403).json({
        error: 'Invalid project path: must be absolute'
      });
    }

    // Check for path traversal attempts
    const normalizedPath = path.normalize(actualProjectPath);
    if (normalizedPath.includes('..') || normalizedPath !== actualProjectPath) {
      return res.status(403).json({
        error: 'Invalid project path: path traversal detected'
      });
    }

    // Additional security: Verify the project is in the user's project list
    // This is implicitly done by extractProjectDirectory
    // Note: Encoded paths don't necessarily start with '-' since we strip leading slashes

    // Read ASAF sprint data
    const sprintData = await readAsafSprintData(actualProjectPath);

    console.log('[ASAF API] Sprint data read:', {
      exists: sprintData.exists,
      hasState: !!sprintData.state,
      phase: sprintData.state?.phase,
      status: sprintData.state?.status
    });

    // Handle different response scenarios
    if (!sprintData.exists) {
      // No sprint exists or corrupted structure
      console.log('[ASAF API] No sprint exists, returning false');
      return res.json({
        exists: false,
        error: sprintData.error
      });
    }

    // Return sprint data
    console.log('[ASAF API] Returning sprint data');
    res.json(sprintData);

  } catch (error) {
    console.error('ASAF API error:', error);

    // Handle specific error types
    if (error.message.includes('Permission denied')) {
      return res.status(500).json({
        exists: false,
        error: 'Permission denied accessing ASAF files. Please check file system permissions.'
      });
    }

    if (error.code === 'ENOENT') {
      return res.json({
        exists: false
      });
    }

    // Generic error response
    res.status(500).json({
      exists: false,
      error: 'Failed to read ASAF sprint data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/asaf/:projectPath/current
 *
 * Get current sprint selection state from .current-sprint.json
 *
 * Response:
 * - 200: Selection exists (returns {exists: true, sprint, selected_at, type})
 * - 200: No selection (returns {exists: false, message})
 * - 403: Invalid project path
 * - 500: Server error
 */
router.get('/:projectPath/current', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;

    if (!encodedPath) {
      return res.status(400).json({ error: 'Project path is required' });
    }

    // Decode and validate project path using extractProjectDirectory
    let actualProjectPath;
    try {
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      console.error('[ASAF API] Error extracting project directory for current:', error);
      return res.status(403).json({
        error: 'Project not found or access denied'
      });
    }

    // Security check
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
    console.error('[ASAF API] Error reading current sprint:', error);
    res.status(500).json({
      exists: false,
      error: 'Failed to read current sprint selection'
    });
  }
});

/**
 * GET /api/asaf/:projectPath/list
 *
 * List all available sprints in a project
 *
 * Response:
 * - 200: Returns {sprints: [], current: string|null, total: number}
 * - 403: Invalid project path
 * - 500: Server error
 */
router.get('/:projectPath/list', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;

    if (!encodedPath) {
      return res.status(400).json({ error: 'Project path is required' });
    }

    // Decode and validate project path using extractProjectDirectory
    let actualProjectPath;
    try {
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      console.error('[ASAF API] Error extracting project directory for list:', error);
      return res.status(403).json({
        error: 'Project not found or access denied'
      });
    }

    // Security check
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
    console.error('[ASAF API] Error listing sprints:', error);
    res.status(500).json({
      error: 'Failed to list sprints',
      sprints: [],
      total: 0
    });
  }
});

/**
 * POST /api/asaf/:projectPath/select
 *
 * Select a sprint as current
 *
 * Request body: {sprint: string}
 *
 * Response:
 * - 200: Success (returns {success: true, sprint, selected_at})
 * - 400: Missing sprint name
 * - 403: Invalid project path
 * - 404: Sprint not found (returns {error, available: []})
 * - 500: Server error
 */
router.post('/:projectPath/select', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;
    const { sprint: sprintName } = req.body;

    if (!sprintName) {
      return res.status(400).json({ error: 'Sprint name is required' });
    }

    if (!encodedPath) {
      return res.status(400).json({ error: 'Project path is required' });
    }

    // Decode and validate project path using extractProjectDirectory
    let actualProjectPath;
    try {
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      console.error('[ASAF API] Error extracting project directory for select:', error);
      return res.status(403).json({
        error: 'Project not found or access denied'
      });
    }

    // Security check
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
      const wsMessage = JSON.stringify({
        type: 'asaf:sprint-selected',
        projectPath: actualProjectPath,
        sprint: sprintName,
        timestamp: new Date().toISOString()
      });

      req.app.locals.wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(wsMessage);
        }
      });

      console.log(`[ASAF API] Broadcast sprint selection event: ${sprintName}`);
    }

    res.json({
      success: true,
      sprint: sprintName,
      selected_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('[ASAF API] Error selecting sprint:', error);
    res.status(500).json({
      error: 'Failed to select sprint'
    });
  }
});

/**
 * GET /api/asaf/:projectPath/validate
 *
 * Validate ASAF structure for a project without reading full content.
 * Useful for quick health checks.
 */
router.get('/:projectPath/validate', async (req, res) => {
  try {
    const { projectPath: encodedPath } = req.params;

    if (!encodedPath) {
      return res.status(400).json({
        error: 'Project path is required'
      });
    }

    // Decode and validate project path using extractProjectDirectory
    let actualProjectPath;
    try {
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      console.error('[ASAF API] Error extracting project directory for validate:', error);
      return res.status(403).json({
        valid: false,
        error: 'Project not found or access denied'
      });
    }

    if (!path.isAbsolute(actualProjectPath)) {
      return res.status(403).json({
        valid: false,
        error: 'Invalid project path'
      });
    }

    const normalizedPath = path.normalize(actualProjectPath);
    if (normalizedPath.includes('..') || normalizedPath !== actualProjectPath) {
      return res.status(403).json({
        valid: false,
        error: 'Path traversal detected'
      });
    }

    // Quick validation check
    const sprintData = await readAsafSprintData(actualProjectPath);

    res.json({
      valid: sprintData.exists,
      hasMultipleSprints: sprintData.totalSprints > 1,
      currentPhase: sprintData.exists ? sprintData.state?.phase : null,
      currentStatus: sprintData.exists ? sprintData.state?.status : null,
      error: sprintData.error
    });

  } catch (error) {
    console.error('ASAF validation error:', error);
    res.status(500).json({
      valid: false,
      error: 'Validation failed'
    });
  }
});

export default router;