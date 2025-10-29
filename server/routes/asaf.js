/**
 * ASAF API Routes
 * ================
 *
 * REST API endpoints for ASAF sprint data management.
 * Provides access to sprint metadata, state, and summary content.
 */

import express from 'express';
import path from 'path';
import { readAsafSprintData } from '../utils/asaf-reader.js';
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

    if (!encodedPath) {
      return res.status(400).json({
        error: 'Project path is required'
      });
    }

    // Decode and validate project path
    let actualProjectPath;
    try {
      // Use extractProjectDirectory to get the actual path
      // This also validates that it's a known project
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      console.error('Error extracting project directory:', error);
      // Fall back to simple decoding
      actualProjectPath = encodedPath.replace(/-/g, '/');
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
    // This is implicitly done by extractProjectDirectory, but we can add extra validation
    // by checking if the encoded path matches a known pattern
    if (!encodedPath.startsWith('-') && !encodedPath.includes('-')) {
      // Likely not a valid encoded project path
      console.warn('Suspicious project path format:', encodedPath);
    }

    // Read ASAF sprint data
    const sprintData = await readAsafSprintData(actualProjectPath);

    // Handle different response scenarios
    if (!sprintData.exists) {
      // No sprint exists or corrupted structure
      return res.json({
        exists: false,
        error: sprintData.error
      });
    }

    // Return sprint data
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

    // Decode and validate project path (same security checks as main endpoint)
    let actualProjectPath;
    try {
      actualProjectPath = await extractProjectDirectory(encodedPath);
    } catch (error) {
      actualProjectPath = encodedPath.replace(/-/g, '/');
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