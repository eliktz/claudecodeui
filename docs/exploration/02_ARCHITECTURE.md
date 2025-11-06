# Architecture

## High-Level System Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER (Browser)                         │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                │
│  │   React UI   │  │  WebSocket   │  │   Service    │                │
│  │  Components  │◄─┤   Client     │  │    Worker    │                │
│  └──────────────┘  └──────────────┘  └──────────────┘                │
│         │                  │                  │                        │
│         │                  │                  │                        │
│         └──────────────────┴──────────────────┘                        │
│                            │                                           │
└────────────────────────────┼───────────────────────────────────────────┘
                             │
                    HTTP / WebSocket
                             │
┌────────────────────────────┼───────────────────────────────────────────┐
│                    SERVER LAYER (Node.js)                              │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                     Express HTTP Server                          │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐   │ │
│  │  │   REST API  │  │  WebSocket   │  │   Static File        │   │ │
│  │  │   Routes    │  │   Server     │  │   Serving (dist/)    │   │ │
│  │  └─────────────┘  └──────────────┘  └──────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│           │                  │                                        │
│           │                  │                                        │
│  ┌────────┴────────┐  ┌─────┴──────┐  ┌──────────────────────────┐  │
│  │  Auth           │  │  File      │  │  Process Management      │  │
│  │  Middleware     │  │  Watcher   │  │  (CLI Spawning)          │  │
│  │  (JWT)          │  │  (chokidar)│  │                          │  │
│  └─────────────────┘  └────────────┘  └──────────────────────────┘  │
│           │                  │                  │                     │
└───────────┼──────────────────┼──────────────────┼─────────────────────┘
            │                  │                  │
            │                  │                  │
┌───────────┼──────────────────┼──────────────────┼─────────────────────┐
│                    PERSISTENCE & EXTERNAL LAYER                        │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────┐    │
│  │  SQLite DB  │  │  File System │  │  CLI Processes           │    │
│  │  (auth.db)  │  │              │  │  ┌─────────┐             │    │
│  │             │  │  ~/.claude/  │  │  │ Claude  │ (spawned)   │    │
│  │  - users    │  │  ~/.cursor/  │  │  │  CLI    │             │    │
│  └─────────────┘  │              │  │  └─────────┘             │    │
│                   │  Project     │  │  ┌─────────┐             │    │
│                   │  Files       │  │  │ Cursor  │ (spawned)   │    │
│                   │              │  │  │  CLI    │             │    │
│                   └──────────────┘  │  └─────────┘             │    │
│                                     │  ┌──────────┐            │    │
│                                     │  │  Shell   │ (node-pty) │    │
│                                     │  └──────────┘            │    │
│                                     └──────────────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

## Architectural Pattern

**Primary Pattern**: **Model-View-Controller (MVC) with Real-time Event-Driven Architecture**

- **Model**: Project/session data managed by `server/projects.js`, SQLite database for auth
- **View**: React components rendering UI
- **Controller**: Express route handlers and WebSocket message handlers
- **Event-Driven**: WebSocket for real-time bidirectional communication, chokidar for file system events

## Major Components and Responsibilities

### Frontend Components

#### 1. **App.jsx** (729 lines) - Application Root
**Location**: `src/App.jsx`

**Responsibilities**:
- Top-level application state management
- Routing configuration (`/` and `/session/:sessionId`)
- **Session Protection System** - Prevents project updates during active conversations
- Mobile vs desktop layout switching
- Version update notifications
- Provider orchestration

**Key Features**:
```javascript
// Session Protection System (lines 62-66)
const [activeSessions, setActiveSessions] = useState(new Set());

// Functions to manage active sessions
markSessionAsActive(sessionId)      // Pause project updates
markSessionAsInactive(sessionId)    // Resume project updates
replaceTemporarySession(realId)     // Transition temporary to real session ID
```

**State Management**:
- `projects` - All discovered projects
- `selectedProject` - Currently active project
- `selectedSession` - Currently active session
- `activeTab` - Current view (chat, files, git, etc.)
- `activeSessions` - Set of sessions with ongoing conversations

#### 2. **ChatInterface.jsx** (3484 lines) - Chat UI
**Location**: `src/components/ChatInterface.jsx`

**Responsibilities**:
- WebSocket message streaming and rendering
- User input handling (text, images, voice)
- Tool call visualization
- Session management (create, resume, abort)
- Message history display
- Provider switching (Claude/Cursor)

**Major Sections**:
- Message rendering with markdown, code blocks, tool calls
- Input area with image upload and voice recording
- Tools settings UI (enable/disable specific tools)
- Session history sidebar
- Streaming response handling

#### 3. **MainContent.jsx** (576 lines) - Content Container
**Location**: `src/components/MainContent.jsx`

**Responsibilities**:
- Tab management (chat, files, git, terminal, tasks)
- Content area switching based on active tab
- Header with project/session info
- Integration point for all content views

#### 4. **Sidebar.jsx** (1664 lines) - Navigation
**Location**: `src/components/Sidebar.jsx`

**Responsibilities**:
- Project list display with metadata
- Session list per project
- Project creation/deletion
- Session management
- Settings and version info
- Provider selection (Claude/Cursor)

#### 5. **FileTree.jsx** - File Browser
**Location**: `src/components/FileTree.jsx`

**Responsibilities**:
- Recursive file tree rendering
- File/folder expand/collapse
- File selection for editing
- Permission display

#### 6. **GitPanel.jsx** (1282 lines) - Git Operations
**Location**: `src/components/GitPanel.jsx`

**Responsibilities**:
- Git status display
- Stage/unstage changes
- Commit creation
- Branch management
- Diff visualization

#### 7. **StandaloneShell.jsx** - Terminal Emulator
**Location**: `src/components/StandaloneShell.jsx`

**Responsibilities**:
- xterm.js terminal integration
- WebSocket connection to `/shell` endpoint
- PTY interaction for Claude/Cursor CLI
- Terminal resize handling

### Backend Components

#### 1. **server/index.js** - Main Server
**Location**: `server/index.js` (1169 lines)

**Responsibilities**:
- Express HTTP server setup
- WebSocket server with authentication
- Route mounting for all API endpoints
- File system watcher (chokidar) for `~/.claude/projects/`
- Static file serving (production)
- Terminal (shell) WebSocket handling
- Image upload processing

**Key WebSocket Handlers**:
```javascript
handleChatConnection(ws)   // /ws - Chat WebSocket
handleShellConnection(ws)  // /shell - Terminal WebSocket
```

#### 2. **server/projects.js** - Project Discovery
**Location**: `server/projects.js` (1063 lines) - **CRITICAL FILE**

**Responsibilities**:
- Discover Claude projects from `~/.claude/projects/`
- Extract actual project paths from JSONL sessions
- Compute MD5 hashes for Cursor project discovery
- Fetch Cursor sessions from `~/.cursor/chats/{md5}/`
- Project configuration management
- Session parsing and pagination
- TaskMaster folder detection

**Critical Architecture** (see lines 1-58 for detailed docs):
```
Claude Projects: ~/.claude/projects/{encoded-path}/
  → JSONL files contain 'cwd' field for actual project path

Cursor Projects: ~/.cursor/chats/{md5-hash}/
  → MD5 hash of absolute project path
  → Cannot auto-discover Cursor-only projects
```

**Caching Strategy**:
- Project directory extraction cached in `Map`
- Cache cleared on file system changes

#### 3. **server/claude-cli.js** - Claude CLI Spawning
**Location**: `server/claude-cli.js`

**Responsibilities**:
- Spawn Claude CLI processes with proper arguments
- Handle `--resume`, `--print`, `--output-format stream-json`
- MCP config detection and `--mcp-config` flag
- Tools settings (allow/disallow specific tools)
- Image handling (save to temp files, pass paths to Claude)
- Process lifecycle management
- Session abortion

**Process Tracking**:
```javascript
activeClaudeProcesses = new Map()  // sessionId -> process
```

#### 4. **server/cursor-cli.js** - Cursor CLI Spawning
**Location**: `server/cursor-cli.js`

**Responsibilities**:
- Spawn Cursor CLI processes
- Handle resume with `--resume={sessionId}`
- Stream JSON output parsing
- Session management
- Similar to claude-cli.js but for Cursor

#### 5. **server/database/db.js** - Authentication
**Location**: `server/database/db.js`

**Responsibilities**:
- SQLite database initialization
- User CRUD operations
- Password hashing with bcrypt
- Last login tracking

**Schema** (from `init.sql`):
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  is_active INTEGER DEFAULT 1
);
```

#### 6. **server/middleware/auth.js** - Auth Middleware
**Location**: `server/middleware/auth.js`

**Responsibilities**:
- JWT token generation and verification
- API key validation (optional)
- HTTP request authentication (`authenticateToken`)
- WebSocket authentication (`authenticateWebSocket`)

### Context Providers (State Management)

#### 1. **WebSocketContext** - WebSocket Connection
**Location**: `src/contexts/WebSocketContext.jsx` + `src/utils/websocket.js`

**Responsibilities**:
- WebSocket connection lifecycle
- Message queue management
- Auto-reconnect with exponential backoff
- Token-based authentication
- Provides: `{ ws, sendMessage, messages, isConnected }`

**Connection URL**: `wss://host:port/ws?token={jwt}`

#### 2. **AuthContext** - Authentication State
**Location**: `src/contexts/AuthContext.jsx`

**Responsibilities**:
- Login/logout state
- Token storage in localStorage
- User info management
- Protected route handling

#### 3. **ThemeContext** - Dark/Light Mode
**Location**: `src/contexts/ThemeContext.jsx`

**Responsibilities**:
- Theme persistence (localStorage)
- CSS class toggling (`dark` class on `<html>`)

#### 4. **TaskMasterContext** - TaskMaster Integration
**Location**: `src/contexts/TaskMasterContext.jsx`

**Responsibilities**:
- TaskMaster state management
- Task CRUD operations
- PRD parsing
- Optional integration (app works without it)

## Component Dependencies

```
App.jsx
├── Sidebar
│   ├── Projects List
│   ├── Sessions List
│   └── Settings Button
├── MainContent
│   ├── ChatInterface (when activeTab === 'chat')
│   │   ├── Message History
│   │   ├── Input Area
│   │   └── Tools Settings
│   ├── FileTree (when activeTab === 'files')
│   │   └── CodeEditor
│   ├── GitPanel (when activeTab === 'git')
│   │   └── DiffViewer
│   ├── StandaloneShell (when activeTab === 'terminal')
│   └── TaskMaster Components (when activeTab === 'tasks')
└── MobileNav (mobile only)
```

## Design Patterns

### 1. **Session Protection Pattern** (`App.jsx:62-66`)
Problem: Automatic project updates clear chat messages during conversations
Solution: Track active sessions, pause updates during conversations

```javascript
const [activeSessions, setActiveSessions] = useState(new Set());

// Pause updates when user sends message
markSessionAsActive(sessionId);

// Resume updates when conversation ends
markSessionAsInactive(sessionId);
```

### 2. **Provider Pattern** (React Context API)
All global state wrapped in Context Providers:
```jsx
<ThemeProvider>
  <AuthProvider>
    <WebSocketProvider>
      <TasksSettingsProvider>
        <TaskMasterProvider>
          <App />
```

### 3. **Hook-based State Management**
Custom hooks encapsulate logic:
- `useWebSocket()` - WebSocket connection
- `useLocalStorage()` - Persistent preferences
- `useVersionCheck()` - GitHub release checking
- `useAudioRecorder()` - Voice input

### 4. **Process Management Pattern** (Backend)
CLI processes tracked in Map for lifecycle management:
```javascript
activeClaudeProcesses.set(sessionId, process);
process.on('close', () => {
  activeClaudeProcesses.delete(sessionId);
});
```

### 5. **WebSocket Message Routing**
Single WebSocket server, route based on URL path:
```javascript
wss.on('connection', (ws, request) => {
  const pathname = new URL(request.url).pathname;
  if (pathname === '/shell') {
    handleShellConnection(ws);
  } else if (pathname === '/ws') {
    handleChatConnection(ws);
  }
});
```

## Data Flow

### Chat Message Flow
```
User types message
  → ChatInterface.jsx sends via WebSocket
  → server/index.js receives on /ws
  → server/claude-cli.js spawns CLI process
  → CLI stdout streamed as JSON
  → Parse and send back via WebSocket
  → ChatInterface.jsx renders streaming response
```

### Project Update Flow
```
File changes in ~/.claude/projects/
  → chokidar detects change (300ms debounce)
  → clearProjectDirectoryCache()
  → getProjects() fetches updated data
  → Broadcast to all connected WebSocket clients
  → App.jsx checks activeSessions
  → Update projects state (if no active sessions)
  → UI re-renders with updated projects/sessions
```

### Authentication Flow
```
User submits login form
  → POST /api/auth/login
  → Verify password with bcrypt
  → Generate JWT token
  → Return token to client
  → Store in localStorage
  → Include in all subsequent requests (Authorization: Bearer {token})
```

## Critical Architectural Decisions

### 1. **MD5 Hashing for Cursor Projects**
Cursor stores projects by MD5 hash of path. This makes auto-discovery impossible without knowing the path first. See `server/projects.js:938-1046`.

### 2. **JSONL Session Parsing**
Sessions stored as JSONL (JSON Lines), not JSON arrays. Must parse line-by-line with readline interface.

### 3. **Session ID Transition Handling**
New sessions start with temporary ID (`new-session-*`), replaced with real ID when CLI returns `session_id`. Session protection must handle both.

### 4. **Two WebSocket Endpoints**
- `/ws` - Chat and project updates
- `/shell` - Terminal emulation (PTY)

Separate endpoints for different concerns, authentication required for both.

### 5. **Native Module Dependencies**
Three critical native modules require compilation:
- `node-pty` - Terminal emulation
- `better-sqlite3` - Database
- `bcrypt` - Password hashing

Requires Python and C++ build tools on all platforms.

## Performance Considerations

1. **Debouncing**: File watcher events debounced 300ms
2. **Pagination**: Session loading with limit/offset
3. **Caching**: Project directory extraction cached
4. **Early Exit**: Stop scanning files when enough sessions found
5. **Lazy Loading**: Cursor sessions fetched only for visible projects
6. **Object Reference Preservation**: `setProjects` checks for actual changes before updating state
