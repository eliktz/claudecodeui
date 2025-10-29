# 04_BUSINESS_LOGIC.md - Core Concepts and Workflows

## Overview

This document describes the core business logic and workflows in Claude Code UI, including project discovery, session management, provider switching, and the session protection system.

---

## 1. Project Discovery System

### Architecture Overview

Claude Code UI discovers projects from two sources:
1. **Claude Projects**: From `~/.claude/projects/`
2. **Cursor Projects**: From `~/.cursor/chats/` using MD5 hash lookup

### Claude Project Discovery

**Location:** `server/projects.js` - `getProjects()`

#### Step 1: Scan File System

```javascript
const claudeDir = path.join(process.env.HOME, '.claude', 'projects');
const entries = await fs.readdir(claudeDir, { withFileTypes: true });

for (const entry of entries) {
  if (entry.isDirectory()) {
    // Each directory is a project
    const projectName = entry.name; // e.g., "Users-username-myproject"
  }
}
```

#### Step 2: Extract Actual Project Path

The directory name is an encoded version of the project path (`/` replaced with `-`), but this is unreliable. Instead, extract the actual path from `.jsonl` session files:

```javascript
async function extractProjectDirectory(projectName) {
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName);
  }

  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  const files = await fs.readdir(projectDir);
  const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

  if (jsonlFiles.length === 0) {
    // Fall back to decoded project name if no sessions
    return projectName.replace(/-/g, '/');
  }

  const cwdCounts = new Map();
  let latestTimestamp = 0;
  let latestCwd = null;

  // Process all JSONL files to collect cwd values
  for (const file of jsonlFiles) {
    const jsonlFile = path.join(projectDir, file);
    const fileStream = fsSync.createReadStream(jsonlFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const entry = JSON.parse(line);

          if (entry.cwd) {
            // Count occurrences of each cwd
            cwdCounts.set(entry.cwd, (cwdCounts.get(entry.cwd) || 0) + 1);

            // Track the most recent cwd
            const timestamp = new Date(entry.timestamp || 0).getTime();
            if (timestamp > latestTimestamp) {
              latestTimestamp = timestamp;
              latestCwd = entry.cwd;
            }
          }
        } catch (parseError) {
          // Skip malformed lines
        }
      }
    }
  }

  // Determine the best cwd to use
  let extractedPath;
  if (cwdCounts.size === 0) {
    extractedPath = projectName.replace(/-/g, '/');
  } else if (cwdCounts.size === 1) {
    extractedPath = Array.from(cwdCounts.keys())[0];
  } else {
    // Multiple cwd values - prefer the most recent one if it has reasonable usage
    const mostRecentCount = cwdCounts.get(latestCwd) || 0;
    const maxCount = Math.max(...cwdCounts.values());

    // Use most recent if it has at least 25% of the max count
    if (mostRecentCount >= maxCount * 0.25) {
      extractedPath = latestCwd;
    } else {
      // Otherwise use the most frequently used cwd
      for (const [cwd, count] of cwdCounts.entries()) {
        if (count === maxCount) {
          extractedPath = cwd;
          break;
        }
      }
    }
  }

  // Cache the result
  projectDirectoryCache.set(projectName, extractedPath);

  return extractedPath;
}
```

**Key Logic:**
- **Primary**: Use most recent `cwd` if it appears frequently (≥25% of max count)
- **Fallback**: Use most frequently occurring `cwd`
- **Last Resort**: Decode project name (replace `-` with `/`)
- **Cache**: Store result to avoid repeated file I/O

#### Step 3: Generate Display Name

```javascript
async function generateDisplayName(projectName, actualProjectDir) {
  // Try to read package.json from the project path
  try {
    const packageJsonPath = path.join(actualProjectDir, 'package.json');
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);

    if (packageJson.name) {
      return packageJson.name;
    }
  } catch (error) {
    // Fall back to path-based naming
  }

  // If it's an absolute path, return only the last folder name
  if (actualProjectDir.startsWith('/')) {
    const parts = actualProjectDir.split('/').filter(Boolean);
    return parts[parts.length - 1] || actualProjectDir;
  }

  return actualProjectDir;
}
```

#### Step 4: Load Project Metadata

```javascript
const project = {
  name: entry.name,                    // Encoded project name
  path: actualProjectDir,              // Actual project path
  displayName: customName || autoDisplayName,
  fullPath: actualProjectDir,
  isCustomName: !!customName,
  sessions: []                         // Claude sessions
};

// Load Claude sessions (first 5 for performance)
const sessionResult = await getSessions(entry.name, 5, 0);
project.sessions = sessionResult.sessions || [];
project.sessionMeta = {
  hasMore: sessionResult.hasMore,
  total: sessionResult.total
};

// Load Cursor sessions
project.cursorSessions = await getCursorSessions(actualProjectDir);

// Detect TaskMaster
const taskMasterResult = await detectTaskMasterFolder(actualProjectDir);
project.taskmaster = {
  hasTaskmaster: taskMasterResult.hasTaskmaster,
  hasEssentialFiles: taskMasterResult.hasEssentialFiles,
  metadata: taskMasterResult.metadata,
  status: taskMasterResult.hasTaskmaster && taskMasterResult.hasEssentialFiles ? 'configured' : 'not-configured'
};

projects.push(project);
```

### Cursor Project Discovery

**Module:** `server/projects.js` - `getCursorSessions()`

#### MD5 Hash-Based Lookup

Cursor stores sessions in directories named with MD5 hash of the project path:

```javascript
async function getCursorSessions(projectPath) {
  // Calculate cwdID hash for the project path
  const cwdId = crypto.createHash('md5').update(projectPath).digest('hex');
  const cursorChatsPath = path.join(os.homedir(), '.cursor', 'chats', cwdId);

  // Check if the directory exists
  try {
    await fs.access(cursorChatsPath);
  } catch (error) {
    // No sessions for this project
    return [];
  }

  // List all session directories
  const sessionDirs = await fs.readdir(cursorChatsPath);
  const sessions = [];

  for (const sessionId of sessionDirs) {
    const sessionPath = path.join(cursorChatsPath, sessionId);
    const storeDbPath = path.join(sessionPath, 'store.db');

    // Open SQLite database
    const db = await open({
      filename: storeDbPath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY
    });

    // Get metadata from meta table
    const metaRows = await db.all(`SELECT key, value FROM meta`);

    // Parse metadata (hex-encoded JSON)
    let metadata = {};
    for (const row of metaRows) {
      if (row.value) {
        try {
          const hexMatch = row.value.toString().match(/^[0-9a-fA-F]+$/);
          if (hexMatch) {
            const jsonStr = Buffer.from(row.value, 'hex').toString('utf8');
            metadata[row.key] = JSON.parse(jsonStr);
          } else {
            metadata[row.key] = row.value.toString();
          }
        } catch (e) {
          metadata[row.key] = row.value.toString();
        }
      }
    }

    // Get message count
    const messageCountResult = await db.get(`SELECT COUNT(*) as count FROM blobs`);

    await db.close();

    // Extract session info
    const sessionName = metadata.title || metadata.sessionTitle || 'Untitled Session';
    const createdAt = metadata.createdAt ? new Date(metadata.createdAt).toISOString() : new Date().toISOString();

    sessions.push({
      id: sessionId,
      name: sessionName,
      createdAt: createdAt,
      lastActivity: createdAt,
      messageCount: messageCountResult.count || 0,
      projectPath: projectPath
    });
  }

  // Sort sessions by creation time (newest first)
  sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Return only the first 5 sessions for performance
  return sessions.slice(0, 5);
}
```

#### Critical Limitation

**Cannot auto-discover Cursor-only projects** because:
1. Directory name is MD5 hash of project path
2. Project path is NOT stored in the database
3. No way to reverse engineer the original path from the hash

**Workaround:**
- User must manually add project path via UI
- Once added, MD5 hash can be computed to find Cursor sessions

### Manual Project Addition

**Endpoint:** `POST /api/projects/create`

```javascript
async function addProjectManually(projectPath, displayName = null) {
  const absolutePath = path.resolve(projectPath);

  // Check if the path exists
  await fs.access(absolutePath);

  // Generate project name (encode path for use as directory name)
  const projectName = absolutePath.replace(/\//g, '-');

  // Add to config as manually added project
  const config = await loadProjectConfig();
  config[projectName] = {
    manuallyAdded: true,
    originalPath: absolutePath
  };

  if (displayName) {
    config[projectName].displayName = displayName;
  }

  await saveProjectConfig(config);

  return {
    name: projectName,
    path: absolutePath,
    fullPath: absolutePath,
    displayName: displayName || await generateDisplayName(projectName, absolutePath),
    isManuallyAdded: true,
    sessions: [],
    cursorSessions: []
  };
}
```

---

## 2. Session Management

### Create New Session

**Workflow:**

1. **User sends message** via WebSocket:
```javascript
ws.send(JSON.stringify({
  type: 'claude-command',
  command: 'Create a React component',
  options: {
    projectPath: '/Users/username/myproject',
    cwd: '/Users/username/myproject',
    toolsSettings: {
      allowedTools: ['Read', 'Write', 'Edit'],
      disallowedTools: [],
      skipPermissions: false
    },
    permissionMode: 'default'
  }
}));
```

2. **Server spawns Claude CLI**:
```javascript
async function spawnClaude(command, options, ws) {
  const { projectPath, cwd, toolsSettings, permissionMode } = options;
  const workingDir = cwd || process.cwd();

  const args = [
    '--output-format', 'stream-json',
    '--verbose',
    '--model', 'sonnet'
  ];

  // Add permission mode
  if (permissionMode && permissionMode !== 'default') {
    args.push('--permission-mode', permissionMode);
  }

  // Add tools settings
  if (toolsSettings.skipPermissions && permissionMode !== 'plan') {
    args.push('--dangerously-skip-permissions');
  } else {
    for (const tool of toolsSettings.allowedTools) {
      args.push('--allowedTools', tool);
    }
    for (const tool of toolsSettings.disallowedTools) {
      args.push('--disallowedTools', tool);
    }
  }

  // Add command
  if (command && command.trim()) {
    args.push('--print', '--', command);
  }

  const claudeProcess = spawn('claude', args, {
    cwd: workingDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Store process for potential abort
  activeClaudeProcesses.set(sessionId, claudeProcess);

  // Handle output
  claudeProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const response = JSON.parse(line);

        // Capture session ID
        if (response.session_id && !capturedSessionId) {
          capturedSessionId = response.session_id;

          // Send session-created event
          ws.send(JSON.stringify({
            type: 'session-created',
            sessionId: capturedSessionId
          }));
        }

        // Forward response to client
        ws.send(JSON.stringify({
          type: 'claude-response',
          data: response
        }));
      } catch (parseError) {
        // Forward non-JSON output
        ws.send(JSON.stringify({
          type: 'claude-output',
          data: line
        }));
      }
    }
  });

  claudeProcess.on('close', (code) => {
    ws.send(JSON.stringify({
      type: 'claude-complete',
      exitCode: code,
      isNewSession: !sessionId && !!command
    }));

    activeClaudeProcesses.delete(sessionId);
  });
}
```

3. **Client receives session ID** and stores it:
```javascript
if (data.type === 'session-created') {
  setCurrentSessionId(data.sessionId);
}
```

### Resume Existing Session

**Workflow:**

1. **User clicks session** in sidebar
2. **Client loads session messages**:
```javascript
const response = await fetch(`/api/projects/${projectName}/sessions/${sessionId}/messages`);
const data = await response.json();
setMessages(data.messages);
```

3. **User sends follow-up message**:
```javascript
ws.send(JSON.stringify({
  type: 'claude-command',
  command: 'Now add tests',
  options: {
    sessionId: currentSessionId,
    resume: true,
    projectPath: '/Users/username/myproject',
    cwd: '/Users/username/myproject'
  }
}));
```

4. **Server spawns with --resume flag**:
```javascript
if (resume && sessionId) {
  args.push('--resume', sessionId);
}
```

### Abort Session

**Workflow:**

1. **User clicks abort** button
2. **Client sends abort message**:
```javascript
ws.send(JSON.stringify({
  type: 'abort-session',
  sessionId: currentSessionId,
  provider: 'claude'
}));
```

3. **Server kills process**:
```javascript
function abortClaudeSession(sessionId) {
  const process = activeClaudeProcesses.get(sessionId);
  if (process) {
    process.kill('SIGTERM');
    activeClaudeProcesses.delete(sessionId);
    return true;
  }
  return false;
}
```

4. **Client receives confirmation**:
```javascript
if (data.type === 'session-aborted') {
  setIsProcessing(false);
  setCurrentSessionId(null);
}
```

### Delete Session

**Endpoint:** `DELETE /api/projects/:projectName/sessions/:sessionId`

```javascript
async function deleteSession(projectName, sessionId) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);
  const files = await fs.readdir(projectDir);
  const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

  // Check all JSONL files to find which one contains the session
  for (const file of jsonlFiles) {
    const jsonlFile = path.join(projectDir, file);
    const content = await fs.readFile(jsonlFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    // Check if this file contains the session
    const hasSession = lines.some(line => {
      try {
        const data = JSON.parse(line);
        return data.sessionId === sessionId;
      } catch {
        return false;
      }
    });

    if (hasSession) {
      // Filter out all entries for this session
      const filteredLines = lines.filter(line => {
        try {
          const data = JSON.parse(line);
          return data.sessionId !== sessionId;
        } catch {
          return true; // Keep malformed lines
        }
      });

      // Write back the filtered content
      await fs.writeFile(jsonlFile, filteredLines.join('\n') + (filteredLines.length > 0 ? '\n' : ''));
      return true;
    }
  }

  throw new Error(`Session ${sessionId} not found in any files`);
}
```

---

## 3. Session Protection System

### Problem Statement

When a user sends a message, the file system watcher detects changes and broadcasts project updates to all clients. This causes the sidebar to refresh, potentially clearing the active chat session.

### Solution: Active Session Tracking

**Location:** `src/App.jsx`

```javascript
// Track which sessions are actively being used
const activeSessions = useRef(new Set());

// Mark session as active when user sends a message
const markSessionAsActive = (sessionId) => {
  if (sessionId) {
    activeSessions.current.add(sessionId);
  }
};

// Mark session as inactive when conversation completes/aborts
const markSessionAsInactive = (sessionId) => {
  if (sessionId) {
    activeSessions.current.delete(sessionId);
  }
};

// Check if current session is active
const isSessionActive = (sessionId) => {
  return activeSessions.current.has(sessionId);
};
```

### WebSocket Message Handling

```javascript
useEffect(() => {
  if (!ws) return;

  const handleMessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'projects_updated':
        // Only update projects if no active sessions
        if (activeSessions.current.size === 0) {
          setProjects(data.projects);
        } else {
          console.log('Skipping project update due to active session');
        }
        break;

      case 'session-created':
        markSessionAsActive(data.sessionId);
        break;

      case 'claude-complete':
      case 'session-aborted':
        markSessionAsInactive(currentSessionId);
        break;
    }
  };

  ws.addEventListener('message', handleMessage);

  return () => {
    ws.removeEventListener('message', handleMessage);
  };
}, [ws, currentSessionId]);
```

### Workflow

1. **User sends message** → Session marked as active
2. **File system changes** → Server broadcasts `projects_updated`
3. **Client receives update** → Checks if any sessions are active
4. **Active sessions exist** → Skip update (preserves chat state)
5. **Session completes** → Session marked as inactive
6. **Next update** → Applied normally

---

## 4. Provider Switching (Claude vs Cursor)

### Provider Selection

**Location:** `src/components/ChatInterface.jsx`

```javascript
const [provider, setProvider] = useState('claude'); // 'claude' or 'cursor'

// Switch provider
const handleProviderChange = (newProvider) => {
  setProvider(newProvider);
  // Clear current session when switching providers
  setCurrentSessionId(null);
  setMessages([]);
};
```

### Sending Messages

```javascript
const sendMessage = (message) => {
  if (provider === 'cursor') {
    ws.send(JSON.stringify({
      type: 'cursor-command',
      command: message,
      options: {
        sessionId: currentSessionId,
        cwd: currentProject.path,
        resume: !!currentSessionId,
        model: cursorModel,
        skipPermissions: cursorSkipPermissions
      }
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'claude-command',
      command: message,
      options: {
        sessionId: currentSessionId,
        projectPath: currentProject.name,
        cwd: currentProject.path,
        resume: !!currentSessionId,
        toolsSettings: claudeToolsSettings,
        permissionMode: claudePermissionMode
      }
    }));
  }
};
```

### Loading Sessions by Provider

```javascript
const loadSession = async (sessionId) => {
  if (provider === 'cursor') {
    const response = await fetch(`/api/cursor/sessions/${sessionId}?projectPath=${encodeURIComponent(currentProject.path)}`);
    const data = await response.json();
    setMessages(data.session.messages);
  } else {
    const response = await fetch(`/api/projects/${currentProject.name}/sessions/${sessionId}/messages`);
    const data = await response.json();
    setMessages(data.messages);
  }
};
```

### Provider-Specific Settings

**Claude Settings:**
```javascript
const claudeToolsSettings = {
  allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
  disallowedTools: [],
  skipPermissions: false
};

const claudePermissionMode = 'default'; // 'default', 'plan', 'always-allow'
```

**Cursor Settings:**
```javascript
const cursorModel = 'gpt-5'; // Model selection
const cursorSkipPermissions = false; // -f flag
```

---

## 5. File System Watching and Update Broadcasting

### Chokidar Watcher Setup

**Location:** `server/index.js` - `setupProjectsWatcher()`

```javascript
async function setupProjectsWatcher() {
  const chokidar = (await import('chokidar')).default;
  const claudeProjectsPath = path.join(process.env.HOME, '.claude', 'projects');

  projectsWatcher = chokidar.watch(claudeProjectsPath, {
    ignored: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/*.tmp',
      '**/*.swp',
      '**/.DS_Store'
    ],
    persistent: true,
    ignoreInitial: true,
    followSymlinks: false,
    depth: 10,
    awaitWriteFinish: {
      stabilityThreshold: 100, // Wait 100ms for file to stabilize
      pollInterval: 50
    }
  });

  // Debounce function to prevent excessive notifications
  let debounceTimer;
  const debouncedUpdate = async (eventType, filePath) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        // Clear project directory cache
        clearProjectDirectoryCache();

        // Get updated projects list
        const updatedProjects = await getProjects();

        // Notify all connected clients
        const updateMessage = JSON.stringify({
          type: 'projects_updated',
          projects: updatedProjects,
          timestamp: new Date().toISOString(),
          changeType: eventType,
          changedFile: path.relative(claudeProjectsPath, filePath)
        });

        connectedClients.forEach(client => {
          if (client.readyState === client.OPEN) {
            client.send(updateMessage);
          }
        });
      } catch (error) {
        console.error('Error handling project changes:', error);
      }
    }, 300); // 300ms debounce
  };

  // Set up event listeners
  projectsWatcher
    .on('add', (filePath) => debouncedUpdate('add', filePath))
    .on('change', (filePath) => debouncedUpdate('change', filePath))
    .on('unlink', (filePath) => debouncedUpdate('unlink', filePath))
    .on('addDir', (dirPath) => debouncedUpdate('addDir', dirPath))
    .on('unlinkDir', (dirPath) => debouncedUpdate('unlinkDir', dirPath));
}
```

### Event Types

- **add**: New file created
- **change**: File modified
- **unlink**: File deleted
- **addDir**: New directory created
- **unlinkDir**: Directory deleted

### Debouncing Strategy

**Why debounce?**
- CLI writes multiple files in quick succession
- Prevents flooding clients with redundant updates
- Reduces server load

**Implementation:**
- 300ms delay after last file system event
- Clear previous timer on new event
- Only broadcast once after activity stops

---

## 6. Project Lifecycle Workflows

### Rename Project

**Endpoint:** `PUT /api/projects/:projectName/rename`

```javascript
async function renameProject(projectName, newDisplayName) {
  const config = await loadProjectConfig();

  if (!newDisplayName || newDisplayName.trim() === '') {
    // Remove custom name, will fall back to auto-generated
    delete config[projectName];
  } else {
    // Set custom display name
    config[projectName] = {
      displayName: newDisplayName.trim()
    };
  }

  await saveProjectConfig(config);
  return true;
}
```

### Delete Empty Project

**Endpoint:** `DELETE /api/projects/:projectName`

```javascript
async function deleteProject(projectName) {
  // First check if the project is empty
  const isEmpty = await isProjectEmpty(projectName);
  if (!isEmpty) {
    throw new Error('Cannot delete project with existing sessions');
  }

  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);

  // Remove the project directory
  await fs.rm(projectDir, { recursive: true, force: true });

  // Remove from project config
  const config = await loadProjectConfig();
  delete config[projectName];
  await saveProjectConfig(config);

  return true;
}

async function isProjectEmpty(projectName) {
  const sessionsResult = await getSessions(projectName, 1, 0);
  return sessionsResult.total === 0;
}
```

---

## Summary

Key business logic patterns:

1. **Project Discovery**:
   - Scan `~/.claude/projects/` for Claude projects
   - Extract actual paths from JSONL `cwd` fields
   - Compute MD5 hash to find Cursor sessions
   - Manual addition for Cursor-only projects

2. **Session Management**:
   - Create: Spawn CLI with command
   - Resume: Spawn CLI with `--resume` flag
   - Abort: Kill process via SIGTERM
   - Delete: Filter session from JSONL files

3. **Session Protection**:
   - Track active sessions in Set
   - Skip project updates during active conversations
   - Mark inactive when session completes

4. **Provider Switching**:
   - Claude vs Cursor toggle in UI
   - Provider-specific settings and endpoints
   - Different CLI spawning strategies

5. **File System Watching**:
   - Chokidar watches `~/.claude/projects/`
   - Debounced updates (300ms)
   - Broadcasts to all connected clients
   - Respects session protection

6. **Caching**:
   - Project directory extraction cached
   - Cache cleared on file system changes
   - Improves performance for repeated operations
