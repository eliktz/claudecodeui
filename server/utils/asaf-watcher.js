/**
 * ASAF File Watcher
 * ==================
 *
 * Manages dynamic file watchers for ASAF sprint directories.
 * Creates watchers when users connect to projects, removes them when disconnected.
 * Emits WebSocket events when ASAF files change.
 *
 * Key Features:
 * - Dynamic watcher lifecycle management per project
 * - Watches only `asaf/**` directories
 * - Debounced change events to prevent spam
 * - Automatic cleanup on disconnect
 * - Memory leak prevention
 */

import chokidar from 'chokidar';
import path from 'path';

// Map of project paths to their watchers
const projectWatchers = new Map();

// Map of project paths to connected WebSocket clients
const projectClients = new Map();

// Debounce timers for each project
const debounceTimers = new Map();

// Configuration
const DEBOUNCE_DELAY = 300; // milliseconds
const WATCHER_OPTIONS = {
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/*.tmp',
    '**/*.swp',
    '**/.DS_Store',
    '**/.idea/**',
    '**/.vscode/**'
  ],
  persistent: true,
  ignoreInitial: true, // Don't fire events for existing files on startup
  followSymlinks: false,
  depth: 10, // Reasonable depth for sprint subdirectories
  awaitWriteFinish: {
    stabilityThreshold: 100, // Wait 100ms for file to stabilize
    pollInterval: 50
  }
};

/**
 * Add a client to watch a project's ASAF directory
 * Creates a watcher if this is the first client for the project
 *
 * @param {string} projectPath - Absolute path to the project directory
 * @param {WebSocket} ws - WebSocket client instance
 * @param {Object} wss - WebSocket server instance for broadcasting
 */
export function addAsafWatcher(projectPath, ws, wss) {
  if (!projectPath || !path.isAbsolute(projectPath)) {
    console.warn('Invalid project path for ASAF watcher:', projectPath);
    return;
  }

  // Initialize client set for this project if not exists
  if (!projectClients.has(projectPath)) {
    projectClients.set(projectPath, new Set());
  }

  // Add client to the project's client set
  const clients = projectClients.get(projectPath);
  clients.add(ws);

  // If this is the first client, create a watcher
  if (clients.size === 1 && !projectWatchers.has(projectPath)) {
    createWatcher(projectPath, wss);
  }

  console.log(`✅ ASAF watcher: Client added for ${projectPath} (${clients.size} clients)`);
}

/**
 * Remove a client from watching a project's ASAF directory
 * Removes the watcher if this was the last client for the project
 *
 * @param {string} projectPath - Absolute path to the project directory
 * @param {WebSocket} ws - WebSocket client instance
 */
export function removeAsafWatcher(projectPath, ws) {
  if (!projectPath || !projectClients.has(projectPath)) {
    return;
  }

  const clients = projectClients.get(projectPath);
  clients.delete(ws);

  console.log(`🔌 ASAF watcher: Client removed for ${projectPath} (${clients.size} clients remaining)`);

  // If no clients remain, clean up the watcher
  if (clients.size === 0) {
    cleanupWatcher(projectPath);
    projectClients.delete(projectPath);
  }
}

/**
 * Remove a client from all project watchers
 * Called when a WebSocket connection is closed
 *
 * @param {WebSocket} ws - WebSocket client instance
 */
export function removeClientFromAllWatchers(ws) {
  for (const [projectPath, clients] of projectClients.entries()) {
    if (clients.has(ws)) {
      removeAsafWatcher(projectPath, ws);
    }
  }
}

/**
 * Create a file watcher for a project's ASAF directory
 *
 * @param {string} projectPath - Absolute path to the project directory
 * @param {Object} wss - WebSocket server instance for broadcasting
 */
function createWatcher(projectPath, wss) {
  const asafPath = path.join(projectPath, 'asaf');

  console.log(`🔍 ASAF watcher: Creating watcher for ${asafPath}`);

  try {
    // Create chokidar watcher for asaf directory only
    const watcher = chokidar.watch(asafPath, WATCHER_OPTIONS);

    // Debounced notification function
    const notifyClients = () => {
      const clients = projectClients.get(projectPath);
      if (!clients || clients.size === 0) {
        return;
      }

      const message = JSON.stringify({
        type: 'asaf:updated',
        projectPath: projectPath,
        timestamp: new Date().toISOString()
      });

      // Notify all clients watching this project
      for (const client of clients) {
        if (client.readyState === client.OPEN) {
          try {
            client.send(message);
          } catch (error) {
            console.error('Error sending ASAF update to client:', error);
          }
        }
      }

      console.log(`📤 ASAF watcher: Notified ${clients.size} clients about changes in ${projectPath}`);
    };

    // Debounced event handler
    const handleChange = (eventType, filePath) => {
      // Clear existing timer
      if (debounceTimers.has(projectPath)) {
        clearTimeout(debounceTimers.get(projectPath));
      }

      // Set new debounce timer
      const timer = setTimeout(() => {
        console.log(`📝 ASAF watcher: ${eventType} event for ${filePath}`);
        notifyClients();
        debounceTimers.delete(projectPath);
      }, DEBOUNCE_DELAY);

      debounceTimers.set(projectPath, timer);
    };

    // Set up event listeners
    watcher
      .on('add', (filePath) => handleChange('add', filePath))
      .on('change', (filePath) => handleChange('change', filePath))
      .on('unlink', (filePath) => handleChange('unlink', filePath))
      .on('addDir', (dirPath) => handleChange('addDir', dirPath))
      .on('unlinkDir', (dirPath) => handleChange('unlinkDir', dirPath))
      .on('error', (error) => {
        console.error(`❌ ASAF watcher error for ${projectPath}:`, error);
        // Don't remove watcher on error, it might recover
      })
      .on('ready', () => {
        console.log(`✅ ASAF watcher: Ready for ${asafPath}`);
      });

    // Store the watcher
    projectWatchers.set(projectPath, watcher);

  } catch (error) {
    console.error(`❌ ASAF watcher: Failed to create watcher for ${projectPath}:`, error);
    // If watcher creation fails (e.g., no asaf directory), that's okay
    // We'll try again if the directory is created later
  }
}

/**
 * Clean up a watcher for a project
 *
 * @param {string} projectPath - Absolute path to the project directory
 */
function cleanupWatcher(projectPath) {
  const watcher = projectWatchers.get(projectPath);

  if (watcher) {
    console.log(`🧹 ASAF watcher: Cleaning up watcher for ${projectPath}`);

    try {
      // Close the watcher
      watcher.close();
    } catch (error) {
      console.error(`Error closing ASAF watcher for ${projectPath}:`, error);
    }

    // Remove from map
    projectWatchers.delete(projectPath);
  }

  // Clear any pending debounce timer
  if (debounceTimers.has(projectPath)) {
    clearTimeout(debounceTimers.get(projectPath));
    debounceTimers.delete(projectPath);
  }
}

/**
 * Clean up all watchers
 * Called on server shutdown
 */
export function cleanupAllAsafWatchers() {
  console.log('🧹 ASAF watcher: Cleaning up all watchers');

  // Close all watchers
  for (const [projectPath, watcher] of projectWatchers.entries()) {
    try {
      watcher.close();
    } catch (error) {
      console.error(`Error closing ASAF watcher for ${projectPath}:`, error);
    }
  }

  // Clear all maps
  projectWatchers.clear();
  projectClients.clear();

  // Clear all debounce timers
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
}

/**
 * Get statistics about active watchers
 * Useful for monitoring and debugging
 *
 * @returns {Object} Statistics object
 */
export function getWatcherStats() {
  const stats = {
    totalWatchers: projectWatchers.size,
    totalClients: 0,
    projects: []
  };

  for (const [projectPath, clients] of projectClients.entries()) {
    stats.totalClients += clients.size;
    stats.projects.push({
      path: projectPath,
      clientCount: clients.size,
      hasWatcher: projectWatchers.has(projectPath)
    });
  }

  return stats;
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  cleanupAllAsafWatchers();
});

process.on('SIGTERM', () => {
  cleanupAllAsafWatchers();
});