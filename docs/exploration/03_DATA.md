# 03_DATA.md - Database Schema, Models, and Data Patterns

## Overview

Claude Code UI uses multiple data storage mechanisms:
- **SQLite** for authentication
- **JSONL files** for Claude session history
- **SQLite** for Cursor session history (store.db)
- **In-memory caches** for performance optimization

---

## 1. Authentication Database (SQLite)

### Schema Definition

**Location:** `/Users/elik.k/git/claudecodeui/server/database/init.sql`

```sql
PRAGMA foreign_keys = ON;

-- Users table (single user system)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
```

### Database Operations

**Module:** `server/database/db.js`

```javascript
import Database from 'better-sqlite3';

const db = new Database(DB_PATH);

const userDb = {
  hasUsers: () => {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
    return row.count > 0;
  },

  createUser: (username, passwordHash) => {
    const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
    const result = stmt.run(username, passwordHash);
    return { id: result.lastInsertRowid, username };
  },

  getUserByUsername: (username) => {
    return db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  },

  updateLastLogin: (userId) => {
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  },

  getUserById: (userId) => {
    return db.prepare('SELECT id, username, created_at, last_login FROM users WHERE id = ? AND is_active = 1').get(userId);
  }
};
```

### Authentication Flow

1. **Registration** (`POST /api/auth/register`):
   - Check if users exist (single-user system)
   - Hash password with bcrypt (12 salt rounds)
   - Create user record
   - Generate JWT token
   - Update last_login

2. **Login** (`POST /api/auth/login`):
   - Lookup user by username
   - Verify password with bcrypt
   - Generate JWT token
   - Update last_login

3. **JWT Token Structure**:
```javascript
const token = jwt.sign(
  { id: user.id, username: user.username },
  JWT_SECRET,
  { expiresIn: '7d' }
);
```

---

## 2. Claude Session Data (JSONL)

### Storage Location

Claude sessions are stored in `~/.claude/projects/{encoded-path}/{sessionId}.jsonl`

### JSONL Format

Each line in a `.jsonl` file is a separate JSON object representing a message or event.

#### Example Entry Structure

```json
{
  "timestamp": "2025-10-29T10:30:45.123Z",
  "sessionId": "abc123def456",
  "cwd": "/Users/username/myproject",
  "type": "user",
  "message": {
    "role": "user",
    "content": "Create a new React component"
  },
  "uuid": "msg-uuid-123",
  "parentUuid": null
}
```

```json
{
  "timestamp": "2025-10-29T10:30:46.456Z",
  "sessionId": "abc123def456",
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": "I'll help you create a React component..."
  },
  "uuid": "msg-uuid-124",
  "parentUuid": "msg-uuid-123"
}
```

```json
{
  "timestamp": "2025-10-29T10:30:50.789Z",
  "sessionId": "abc123def456",
  "type": "summary",
  "summary": "Create React component"
}
```

### Key Fields

- **sessionId**: Unique identifier for the conversation session
- **cwd**: Current working directory (actual project path)
- **type**: Message type (`user`, `assistant`, `summary`, `tool-call`, etc.)
- **uuid**: Unique message identifier
- **parentUuid**: Parent message UUID (for threading)
- **timestamp**: ISO 8601 timestamp

### Parsing JSONL Sessions

**Module:** `server/projects.js` - `parseJsonlSessions()`

```javascript
async function parseJsonlSessions(filePath) {
  const sessions = new Map();
  const entries = [];

  const fileStream = fsSync.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const entry = JSON.parse(line);
        entries.push(entry);

        if (entry.sessionId) {
          if (!sessions.has(entry.sessionId)) {
            sessions.set(entry.sessionId, {
              id: entry.sessionId,
              summary: 'New Session',
              messageCount: 0,
              lastActivity: new Date(),
              cwd: entry.cwd || ''
            });
          }

          const session = sessions.get(entry.sessionId);

          // Update summary from summary entries or first user message
          if (entry.type === 'summary' && entry.summary) {
            session.summary = entry.summary;
          } else if (entry.message?.role === 'user' && entry.message?.content) {
            const content = entry.message.content;
            if (typeof content === 'string' && content.length > 0 && !content.startsWith('<command-name>')) {
              session.summary = content.length > 50 ? content.substring(0, 50) + '...' : content;
            }
          }

          session.messageCount++;
          if (entry.timestamp) {
            session.lastActivity = new Date(entry.timestamp);
          }
        }
      } catch (parseError) {
        // Skip malformed lines silently
      }
    }
  }

  return {
    sessions: Array.from(sessions.values()),
    entries: entries
  };
}
```

### Session Grouping Algorithm

Sessions are grouped by first user message UUID to support timeline/branching:

```javascript
// Find the first user message for each session
allEntries.forEach(entry => {
  if (entry.sessionId && entry.type === 'user' && entry.parentUuid === null && entry.uuid) {
    const firstUserMsgId = entry.uuid;

    if (!sessionToFirstUserMsgId.has(entry.sessionId)) {
      sessionToFirstUserMsgId.set(entry.sessionId, firstUserMsgId);

      const session = allSessions.get(entry.sessionId);
      if (session) {
        if (!sessionGroups.has(firstUserMsgId)) {
          sessionGroups.set(firstUserMsgId, {
            latestSession: session,
            allSessions: [session]
          });
        } else {
          const group = sessionGroups.get(firstUserMsgId);
          group.allSessions.push(session);

          // Update latest session if this one is more recent
          if (new Date(session.lastActivity) > new Date(group.latestSession.lastActivity)) {
            group.latestSession = session;
          }
        }
      }
    }
  }
});
```

---

## 3. Cursor Session Data (SQLite)

### Storage Location

Cursor sessions are stored in `~/.cursor/chats/{md5_hash}/{sessionId}/store.db`

The `{md5_hash}` is computed as:
```javascript
const cwdId = crypto.createHash('md5').update(projectPath).digest('hex');
```

### Database Schema

**Tables:**
- `meta` - Session metadata (hex-encoded JSON)
- `blobs` - Message blobs (mixed protobuf/JSON format)

### Meta Table Structure

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value BLOB
);
```

**Key-Value Pairs:**
- `agent`: Session metadata (name, createdAt, mode, agentId, latestRootBlobId)
- Other keys as needed by Cursor

**Example value (hex-encoded JSON):**
```json
{
  "name": "Implement user authentication",
  "createdAt": 1730000000000,
  "mode": "normal",
  "agentId": "agent-123",
  "latestRootBlobId": "blob-456"
}
```

### Blobs Table Structure

```sql
CREATE TABLE blobs (
  rowid INTEGER PRIMARY KEY,
  id TEXT UNIQUE,
  data BLOB
);
```

**Blob Types:**
1. **JSON Blobs** (start with `{`): Actual messages
2. **Protobuf Blobs**: DAG structure with parent references

### Parsing Cursor Sessions

**Module:** `server/routes/cursor.js` - `GET /api/cursor/sessions/:sessionId`

```javascript
// Get all blobs
const allBlobs = await db.all(`SELECT rowid, id, data FROM blobs`);

const blobMap = new Map(); // id -> blob data
const parentRefs = new Map(); // blob id -> [parent blob ids]
const childRefs = new Map(); // blob id -> [child blob ids]
const jsonBlobs = []; // Clean JSON messages

for (const blob of allBlobs) {
  blobMap.set(blob.id, blob);

  // Check if JSON blob (starts with '{')
  if (blob.data && blob.data[0] === 0x7B) {
    try {
      const parsed = JSON.parse(blob.data.toString('utf8'));
      jsonBlobs.push({ ...blob, parsed });
    } catch (e) {
      console.log('Failed to parse JSON blob:', blob.rowid);
    }
  } else if (blob.data) {
    // Protobuf blob - extract parent references
    const parents = [];
    let i = 0;

    // Scan for parent references (0x0A 0x20 followed by 32-byte hash)
    while (i < blob.data.length - 33) {
      if (blob.data[i] === 0x0A && blob.data[i+1] === 0x20) {
        const parentHash = blob.data.slice(i+2, i+34).toString('hex');
        if (blobMap.has(parentHash)) {
          parents.push(parentHash);
        }
        i += 34;
      } else {
        i++;
      }
    }

    if (parents.length > 0) {
      parentRefs.set(blob.id, parents);
      for (const parentId of parents) {
        if (!childRefs.has(parentId)) {
          childRefs.set(parentId, []);
        }
        childRefs.get(parentId).push(blob.id);
      }
    }
  }
}
```

### Topological Sorting for Message Order

Cursor uses a DAG structure, so messages must be topologically sorted:

```javascript
const visited = new Set();
const sorted = [];

function visit(nodeId) {
  if (visited.has(nodeId)) return;
  visited.add(nodeId);

  // Visit all parents first (dependencies)
  const parents = parentRefs.get(nodeId) || [];
  for (const parentId of parents) {
    visit(parentId);
  }

  // Add this node after all its parents
  const blob = blobMap.get(nodeId);
  if (blob) {
    sorted.push(blob);
  }
}

// Start with nodes that have no parents (roots)
for (const blob of allBlobs) {
  if (!parentRefs.has(blob.id)) {
    visit(blob.id);
  }
}
```

---

## 4. Project Configuration (JSON)

### Storage Location

`~/.claude/project-config.json`

### Structure

```json
{
  "Users-username-myproject": {
    "displayName": "My Custom Project Name",
    "manuallyAdded": true,
    "originalPath": "/Users/username/myproject"
  },
  "Users-username-another-project": {
    "displayName": "Another Project"
  }
}
```

### Fields

- **displayName**: Custom name shown in UI (optional, falls back to auto-generated)
- **manuallyAdded**: Boolean flag indicating manually added project
- **originalPath**: Absolute path to project (for manually added projects)

### Operations

```javascript
// Load config
async function loadProjectConfig() {
  const configPath = path.join(process.env.HOME, '.claude', 'project-config.json');
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    return {};
  }
}

// Save config
async function saveProjectConfig(config) {
  const claudeDir = path.join(process.env.HOME, '.claude');
  const configPath = path.join(claudeDir, 'project-config.json');

  await fs.mkdir(claudeDir, { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}
```

---

## 5. Caching Strategies

### Project Directory Cache

**Module:** `server/projects.js`

```javascript
const projectDirectoryCache = new Map();

async function extractProjectDirectory(projectName) {
  // Check cache first
  if (projectDirectoryCache.has(projectName)) {
    return projectDirectoryCache.get(projectName);
  }

  // Extract from JSONL files...
  const extractedPath = /* extraction logic */;

  // Cache the result
  projectDirectoryCache.set(projectName, extractedPath);

  return extractedPath;
}

// Clear cache when needed
function clearProjectDirectoryCache() {
  projectDirectoryCache.clear();
}
```

**Cache Invalidation:**
- Cleared when project files change (via chokidar watcher)
- Cleared manually via `clearProjectDirectoryCache()`

### Why Cache?

Extracting project directories requires:
1. Reading potentially multiple `.jsonl` files
2. Parsing each line as JSON
3. Counting `cwd` occurrences
4. Determining the most recent/frequent path

Caching avoids this expensive I/O operation on every request.

---

## 6. Data Access Patterns

### Project Discovery

```javascript
async function getProjects() {
  const claudeDir = path.join(process.env.HOME, '.claude', 'projects');
  const config = await loadProjectConfig();
  const projects = [];
  const existingProjects = new Set();

  // 1. Scan filesystem for Claude projects
  const entries = await fs.readdir(claudeDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      existingProjects.add(entry.name);

      // Extract actual project directory from JSONL sessions
      const actualProjectDir = await extractProjectDirectory(entry.name);

      // Get display name from config or generate one
      const customName = config[entry.name]?.displayName;
      const autoDisplayName = await generateDisplayName(entry.name, actualProjectDir);

      const project = {
        name: entry.name,
        path: actualProjectDir,
        displayName: customName || autoDisplayName,
        fullPath: actualProjectDir,
        isCustomName: !!customName,
        sessions: []
      };

      // Load sessions (first 5 for performance)
      const sessionResult = await getSessions(entry.name, 5, 0);
      project.sessions = sessionResult.sessions || [];

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
    }
  }

  // 2. Add manually configured projects
  for (const [projectName, projectConfig] of Object.entries(config)) {
    if (!existingProjects.has(projectName) && projectConfig.manuallyAdded) {
      // Add manually configured projects that don't exist as folders yet
      // ...
    }
  }

  return projects;
}
```

### Session Pagination

```javascript
async function getSessions(projectName, limit = 5, offset = 0) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);

  const files = await fs.readdir(projectDir);
  const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

  // Sort files by modification time (newest first)
  const filesWithStats = await Promise.all(
    jsonlFiles.map(async (file) => {
      const filePath = path.join(projectDir, file);
      const stats = await fs.stat(filePath);
      return { file, mtime: stats.mtime };
    })
  );
  filesWithStats.sort((a, b) => b.mtime - a.mtime);

  const allSessions = new Map();
  const allEntries = [];

  // Parse sessions from files
  for (const { file } of filesWithStats) {
    const jsonlFile = path.join(projectDir, file);
    const result = await parseJsonlSessions(jsonlFile);

    result.sessions.forEach(session => {
      if (!allSessions.has(session.id)) {
        allSessions.set(session.id, session);
      }
    });

    allEntries.push(...result.entries);

    // Early exit optimization for large projects
    if (allSessions.size >= (limit + offset) * 2) {
      break;
    }
  }

  // Group sessions by first user message (for timeline support)
  // ... grouping logic ...

  const total = visibleSessions.length;
  const paginatedSessions = visibleSessions.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    sessions: paginatedSessions,
    hasMore,
    total,
    offset,
    limit
  };
}
```

### Message Retrieval with Pagination

```javascript
async function getSessionMessages(projectName, sessionId, limit = null, offset = 0) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);

  const files = await fs.readdir(projectDir);
  const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

  const messages = [];

  // Process all JSONL files to find messages for this session
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
          if (entry.sessionId === sessionId) {
            messages.push(entry);
          }
        } catch (parseError) {
          console.warn('Error parsing line:', parseError.message);
        }
      }
    }
  }

  // Sort messages by timestamp
  const sortedMessages = messages.sort((a, b) =>
    new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  );

  const total = sortedMessages.length;

  // If no limit, return all messages (backward compatibility)
  if (limit === null) {
    return sortedMessages;
  }

  // Apply pagination - for recent messages, slice from the end
  const startIndex = Math.max(0, total - offset - limit);
  const endIndex = total - offset;
  const paginatedMessages = sortedMessages.slice(startIndex, endIndex);
  const hasMore = startIndex > 0;

  return {
    messages: paginatedMessages,
    total,
    hasMore,
    offset,
    limit
  };
}
```

---

## 7. Data Consistency and Error Handling

### ENOENT Handling

All file operations gracefully handle missing directories:

```javascript
try {
  await fs.access(claudeDir);
  // Directory exists, proceed
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.error('Error reading projects directory:', error);
  }
  // Return empty results instead of crashing
  return [];
}
```

### Malformed Data

JSONL parsing skips malformed lines without crashing:

```javascript
for await (const line of rl) {
  if (line.trim()) {
    try {
      const entry = JSON.parse(line);
      // Process entry...
    } catch (parseError) {
      // Skip malformed lines silently
    }
  }
}
```

### Transaction Safety

SQLite operations use transactions for atomicity:

```javascript
db.prepare('BEGIN').run();
try {
  // Check if users already exist
  const hasUsers = userDb.hasUsers();
  if (hasUsers) {
    db.prepare('ROLLBACK').run();
    return res.status(403).json({ error: 'User already exists' });
  }

  // Create user
  const user = userDb.createUser(username, passwordHash);

  db.prepare('COMMIT').run();

  res.json({ success: true, user, token });
} catch (error) {
  db.prepare('ROLLBACK').run();
  throw error;
}
```

---

## Summary

Claude Code UI uses a multi-layered data storage approach:

1. **SQLite** for authentication (simple, single-user)
2. **JSONL** for Claude session history (append-only, human-readable)
3. **SQLite** for Cursor sessions (DAG structure, binary blobs)
4. **JSON** for project configuration (simple key-value)
5. **In-memory caches** for performance

Key patterns:
- **Graceful degradation** when directories don't exist
- **Caching** to avoid expensive I/O operations
- **Pagination** for large datasets
- **Transaction safety** for write operations
- **Error resilience** with malformed data
