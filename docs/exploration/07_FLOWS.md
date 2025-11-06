# 07_FLOWS.md - Request Lifecycle and Key Workflows

This document describes the major request lifecycles and workflows in Claude Code UI, showing how data flows through the system.

## Table of Contents

- [Chat Message Flow](#chat-message-flow)
- [Project Update Flow](#project-update-flow)
- [Authentication Flow](#authentication-flow)
- [Session Creation Flow](#session-creation-flow)
- [Session Resume Flow](#session-resume-flow)
- [File Upload Flow](#file-upload-flow)
- [WebSocket Connection Lifecycle](#websocket-connection-lifecycle)
- [Terminal Initialization Flow](#terminal-initialization-flow)

---

## Chat Message Flow

**Full lifecycle: User types message → Claude responds**

### 1. User Input Phase

```
User types in ChatInterface.jsx
    ↓
handleSubmit() called
    ↓
Validates input, checks for images
    ↓
Generates temporary session ID (if new session)
    e.g., "new-session-1234567890"
    ↓
Marks session as active (Session Protection)
    App.jsx: markSessionAsActive(tempSessionId)
```

**Code Example:**
```jsx
// ChatInterface.jsx - handleSubmit()
const handleSubmit = async (e) => {
  e.preventDefault();
  if (!input.trim() && uploadedImages.length === 0) return;

  // Generate temp ID for new sessions
  const tempSessionId = session ? session.id : `new-session-${Date.now()}`;

  // Activate session protection
  if (onSessionActive) {
    onSessionActive(tempSessionId);
  }

  // Prepare message data
  const messageData = {
    type: provider === 'cursor' ? 'cursor-command' : 'claude-command',
    command: input,
    options: {
      sessionId: session?.id,
      resume: !!session,
      projectPath: project?.path,
      cwd: project?.fullPath,
      toolsSettings: {
        allowedTools,
        disallowedTools,
        skipPermissions
      },
      permissionMode,
      images: uploadedImages
    }
  };

  // Send via WebSocket
  sendMessage(messageData);
};
```

### 2. WebSocket Transmission

```
Message sent via WebSocket (ws)
    ↓
Server receives at server/index.js
    handleChatConnection() processes message
    ↓
Message type checked:
  - 'claude-command' → spawnClaude()
  - 'cursor-command' → spawnCursor()
```

**Code Example:**
```javascript
// server/index.js - handleChatConnection()
function handleChatConnection(ws) {
  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    if (data.type === 'claude-command') {
      console.log('💬 User message:', data.command);
      console.log('📁 Project:', data.options?.projectPath);
      console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');
      await spawnClaude(data.command, data.options, ws);
    }
  });
}
```

### 3. CLI Process Spawning

```
spawnClaude() called in server/claude-cli.js
    ↓
Build CLI arguments:
  - --output-format stream-json
  - --verbose
  - --resume {sessionId} (if resuming)
  - --mcp-config (if MCP servers configured)
  - --allowedTools, --disallowedTools (tools settings)
  - --print -- {command} (user's message)
    ↓
Handle images (if present):
  - Save base64 to temp files in .tmp/images/
  - Append image paths to command
    ↓
Spawn Claude CLI process:
  spawn('claude', args, { cwd: projectPath })
```

**Code Example:**
```javascript
// server/claude-cli.js - spawnClaude()
async function spawnClaude(command, options, ws) {
  const { sessionId, cwd, toolsSettings, images } = options;
  const args = [];

  // Resume or new session
  if (sessionId) {
    args.push('--resume', sessionId);
  }

  // Add flags
  args.push('--output-format', 'stream-json', '--verbose');

  // Handle images
  if (images && images.length > 0) {
    const tempDir = path.join(cwd, '.tmp', 'images', Date.now().toString());
    await fs.mkdir(tempDir, { recursive: true });

    for (const [index, image] of images.entries()) {
      const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
      const [, mimeType, base64Data] = matches;
      const extension = mimeType.split('/')[1];
      const filepath = path.join(tempDir, `image_${index}.${extension}`);

      await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
      tempImagePaths.push(filepath);
    }
  }

  // Add command
  if (command.trim()) {
    args.push('--print', '--', command);
  }

  // Spawn process
  const claudeProcess = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}
```

### 4. Response Streaming

```
Claude CLI outputs JSON lines to stdout
    ↓
Server parses each line:
  JSON.parse(line)
    ↓
Types of responses:
  - { session_id: "..." } → Capture real session ID
  - { type: "conversation-event" } → Claude's message
  - { type: "tool-call" } → Tool invocation
  - { type: "error" } → Error messages
    ↓
Send to WebSocket:
  ws.send(JSON.stringify({ type: 'claude-response', data: response }))
```

**Code Example:**
```javascript
// server/claude-cli.js - stdout handler
claudeProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const response = JSON.parse(line);

      // Capture session ID for new sessions
      if (response.session_id && !capturedSessionId) {
        capturedSessionId = response.session_id;

        // Send session-created event
        if (!sessionId && !sessionCreatedSent) {
          sessionCreatedSent = true;
          ws.send(JSON.stringify({
            type: 'session-created',
            sessionId: capturedSessionId
          }));
        }
      }

      // Forward response to client
      ws.send(JSON.stringify({
        type: 'claude-response',
        data: response
      }));
    } catch (parseError) {
      // Non-JSON output
      ws.send(JSON.stringify({
        type: 'claude-output',
        data: line
      }));
    }
  }
});
```

### 5. Client-Side Rendering

```
WebSocket receives messages
    ↓
WebSocketContext processes in useWebSocket hook
    ↓
Messages added to state array
    ↓
ChatInterface receives via props
    ↓
Renders messages based on type:
  - User messages: Right-aligned blue bubbles
  - Assistant messages: Left-aligned white bubbles
  - Tool calls: Expandable details sections
  - Errors: Red error messages
```

**Code Example:**
```jsx
// src/contexts/WebSocketContext.jsx - useWebSocket hook
const useWebSocket = () => {
  const [messages, setMessages] = useState([]);
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const websocket = new WebSocket(wsUrl);

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'claude-response') {
        // Add to messages array
        setMessages(prev => [...prev, data.data]);
      } else if (data.type === 'session-created') {
        // Replace temporary session ID with real one
        onReplaceTemporarySession?.(data.sessionId);
      }
    };

    setWs(websocket);
  }, []);

  return { ws, messages, sendMessage };
};
```

### 6. Completion Phase

```
Claude CLI exits with code 0
    ↓
Server sends 'claude-complete' message
    ↓
Client receives completion:
  - Mark session as inactive (Session Protection)
  - Clear temp session ID
  - Enable input field
  - Auto-scroll to bottom
    ↓
Clean up temp files:
  - Delete .tmp/images/ directory
  - Remove from activeClaudeProcesses Map
```

**Code Example:**
```jsx
// ChatInterface.jsx - WebSocket message handler
useEffect(() => {
  if (!ws) return;

  const handleMessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'claude-complete') {
      // Mark session as inactive
      if (onSessionInactive && currentSessionId) {
        onSessionInactive(currentSessionId);
      }

      // Re-enable input
      setIsProcessing(false);

      // Clear temp session
      setTempSessionId(null);

      // Auto-scroll
      if (autoScrollToBottom) {
        scrollToBottom();
      }
    }
  };

  ws.addEventListener('message', handleMessage);
  return () => ws.removeEventListener('message', handleMessage);
}, [ws, currentSessionId]);
```

---

## Project Update Flow

**Lifecycle: File changes in ~/.claude/projects/ → UI refresh**

### 1. File System Event

```
File created/changed in ~/.claude/projects/
    ↓
Chokidar file watcher detects change
    (setupProjectsWatcher in server/index.js)
    ↓
Debounced update triggered (300ms delay)
    ↓
Cache cleared:
  clearProjectDirectoryCache()
```

**Code Example:**
```javascript
// server/index.js - setupProjectsWatcher()
async function setupProjectsWatcher() {
  const chokidar = (await import('chokidar')).default;
  const claudeProjectsPath = path.join(process.env.HOME, '.claude', 'projects');

  projectsWatcher = chokidar.watch(claudeProjectsPath, {
    ignored: ['**/node_modules/**', '**/.git/**'],
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50
    }
  });

  // Debounce function
  let debounceTimer;
  const debouncedUpdate = async (eventType, filePath) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      // Clear cache
      clearProjectDirectoryCache();

      // Get updated projects
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
    }, 300);
  };

  projectsWatcher
    .on('add', (filePath) => debouncedUpdate('add', filePath))
    .on('change', (filePath) => debouncedUpdate('change', filePath))
    .on('unlink', (filePath) => debouncedUpdate('unlink', filePath));
}
```

### 2. Project Data Fetching

```
getProjects() called in server/projects.js
    ↓
For each project directory:
  1. Extract actual project path from JSONL files
     (extractProjectDirectory with caching)
  2. Load display name from config
  3. Get first 5 sessions (getSessions)
  4. Fetch Cursor sessions (getCursorSessions)
  5. Detect TaskMaster (detectTaskMasterFolder)
    ↓
Return combined project list
```

**Code Example:**
```javascript
// server/projects.js - getProjects()
async function getProjects() {
  const claudeDir = path.join(process.env.HOME, '.claude', 'projects');
  const config = await loadProjectConfig();
  const projects = [];

  const entries = await fs.readdir(claudeDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Extract actual project path from JSONL sessions
      const actualProjectDir = await extractProjectDirectory(entry.name);

      // Get display name
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

      // Fetch sessions
      const sessionResult = await getSessions(entry.name, 5, 0);
      project.sessions = sessionResult.sessions || [];
      project.sessionMeta = {
        hasMore: sessionResult.hasMore,
        total: sessionResult.total
      };

      // Fetch Cursor sessions
      project.cursorSessions = await getCursorSessions(actualProjectDir);

      // Detect TaskMaster
      const taskMasterResult = await detectTaskMasterFolder(actualProjectDir);
      project.taskmaster = {
        hasTaskmaster: taskMasterResult.hasTaskmaster,
        metadata: taskMasterResult.metadata
      };

      projects.push(project);
    }
  }

  return projects;
}
```

### 3. WebSocket Broadcast

```
Updated projects sent to all connected clients
    via WebSocket 'projects_updated' message
    ↓
Each client receives the update
```

### 4. Session Protection Check

```
Client receives 'projects_updated' message
    ↓
App.jsx checks Session Protection:
  - Is there an active session?
    activeSessions.has(selectedSession.id)
  - Is this an additive update?
    isUpdateAdditive(currentProjects, updatedProjects)
    ↓
If active session:
  - SKIP updates that modify existing session
  - ALLOW additive updates (new sessions/projects)
    ↓
If no active session:
  - Allow all updates
```

**Code Example:**
```jsx
// App.jsx - WebSocket message handler
useEffect(() => {
  if (messages.length > 0) {
    const latestMessage = messages[messages.length - 1];

    if (latestMessage.type === 'projects_updated') {
      // Session Protection Logic
      const hasActiveSession = (selectedSession && activeSessions.has(selectedSession.id)) ||
                               (activeSessions.size > 0 && Array.from(activeSessions).some(id => id.startsWith('new-session-')));

      if (hasActiveSession) {
        // Check if update is purely additive
        const isAdditiveUpdate = isUpdateAdditive(
          projects,
          latestMessage.projects,
          selectedProject,
          selectedSession
        );

        if (!isAdditiveUpdate) {
          // Skip modifying updates during active conversation
          return;
        }
      }

      // Apply update
      setProjects(latestMessage.projects);

      // Update selected project/session if needed
      if (selectedProject) {
        const updatedSelectedProject = latestMessage.projects.find(
          p => p.name === selectedProject.name
        );
        if (updatedSelectedProject) {
          setSelectedProject(updatedSelectedProject);
        }
      }
    }
  }
}, [messages, selectedProject, selectedSession, activeSessions]);
```

### 5. UI Update

```
Projects state updated in App.jsx
    ↓
Sidebar re-renders with new data
    ↓
If selected session was deleted:
  - Clear selectedSession
  - Navigate to '/'
```

---

## Authentication Flow

**Lifecycle: Login → JWT → Protected requests**

### 1. Initial Setup Check

```
App loads → Check auth status
    ↓
GET /api/auth/status
    ↓
Response: { needsSetup: true/false, isAuthenticated: false }
    ↓
If needsSetup === true:
  Show SetupForm component
Else:
  Check for existing token in localStorage
```

**Code Example:**
```jsx
// AuthContext.jsx - Initial check
useEffect(() => {
  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/status');
      const data = await response.json();

      if (data.needsSetup) {
        setNeedsSetup(true);
        setIsAuthenticated(false);
      } else {
        // Check for existing token
        const token = localStorage.getItem('auth-token');
        if (token) {
          // Verify token is still valid
          const userResponse = await authenticatedFetch('/api/auth/user');
          if (userResponse.ok) {
            const userData = await userResponse.json();
            setUser(userData.user);
            setIsAuthenticated(true);
          } else {
            // Token invalid, clear it
            localStorage.removeItem('auth-token');
            setIsAuthenticated(false);
          }
        }
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setIsAuthenticated(false);
    }
  };

  checkAuth();
}, []);
```

### 2. User Registration (First-Time Setup)

```
User fills SetupForm
    ↓
POST /api/auth/register
    { username, password }
    ↓
Server (auth.js route):
  1. Validate input (min 3 chars username, 6 chars password)
  2. Check hasUsers() (only one user allowed)
  3. Hash password with bcrypt (12 rounds)
  4. Store in SQLite users table
  5. Generate JWT token (no expiration)
  6. Update last_login timestamp
    ↓
Response: { success: true, user: {...}, token: "..." }
```

**Code Example:**
```javascript
// server/routes/auth.js - register endpoint
router.post('/register', async (req, res) => {
  const { username, password } = req.body;

  // Validate
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({
      error: 'Username must be at least 3 characters, password at least 6 characters'
    });
  }

  // Transaction for race condition safety
  db.prepare('BEGIN').run();
  try {
    // Check if users exist
    const hasUsers = userDb.hasUsers();
    if (hasUsers) {
      db.prepare('ROLLBACK').run();
      return res.status(403).json({
        error: 'User already exists. This is a single-user system.'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = userDb.createUser(username, passwordHash);

    // Generate JWT (never expires)
    const token = generateToken(user);

    // Update last login
    userDb.updateLastLogin(user.id);

    db.prepare('COMMIT').run();

    res.json({
      success: true,
      user: { id: user.id, username: user.username },
      token
    });
  } catch (error) {
    db.prepare('ROLLBACK').run();
    throw error;
  }
});
```

### 3. User Login

```
User fills LoginForm
    ↓
POST /api/auth/login
    { username, password }
    ↓
Server:
  1. Look up user by username
  2. Compare password with bcrypt.compare()
  3. Generate JWT token
  4. Update last_login
    ↓
Response: { success: true, user: {...}, token: "..." }
```

### 4. Token Storage

```
Client receives token
    ↓
Store in localStorage:
    localStorage.setItem('auth-token', token)
    ↓
Update AuthContext:
    setUser(user)
    setIsAuthenticated(true)
    ↓
Redirect to main app
```

**Code Example:**
```jsx
// LoginForm.jsx - handleLogin
const handleLogin = async (e) => {
  e.preventDefault();

  try {
    const response = await api.auth.login(username, password);
    const data = await response.json();

    if (data.success) {
      // Store token
      localStorage.setItem('auth-token', data.token);

      // Update context
      setUser(data.user);
      setIsAuthenticated(true);

      // Redirect
      navigate('/');
    } else {
      setError(data.error || 'Login failed');
    }
  } catch (error) {
    setError('Network error. Please try again.');
  }
};
```

### 5. Protected Requests

```
Client makes API request
    ↓
authenticatedFetch() wrapper adds token:
    headers: { 'Authorization': `Bearer ${token}` }
    ↓
Server middleware authenticateToken():
  1. Extract token from Authorization header
  2. Verify with jwt.verify(token, JWT_SECRET)
  3. Look up user in database
  4. Attach user to req.user
  5. Call next()
    ↓
If invalid token:
  Return 401 Unauthorized
    ↓
Client handles 401:
  - Clear localStorage token
  - Set isAuthenticated = false
  - Redirect to login
```

**Code Example:**
```javascript
// server/middleware/auth.js - authenticateToken
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists
    const user = userDb.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};
```

### 6. WebSocket Authentication

```
Client establishes WebSocket connection
    ↓
Pass token in query parameter:
    ws://localhost:3001/ws?token=...
    ↓
Server verifyClient callback:
  1. Extract token from URL params or headers
  2. Call authenticateWebSocket(token)
  3. Verify JWT
  4. Store user in req.user
  5. Return true/false
    ↓
If false: Connection rejected
If true: Connection established
```

**Code Example:**
```javascript
// server/index.js - WebSocket verifyClient
const wss = new WebSocketServer({
  server,
  verifyClient: (info) => {
    // Extract token from query or headers
    const url = new URL(info.req.url, 'http://localhost');
    const token = url.searchParams.get('token') ||
                  info.req.headers.authorization?.split(' ')[1];

    // Verify token
    const user = authenticateWebSocket(token);
    if (!user) {
      console.log('❌ WebSocket authentication failed');
      return false;
    }

    // Store user for later use
    info.req.user = user;
    console.log('✅ WebSocket authenticated for user:', user.username);
    return true;
  }
});
```

---

## Session Creation Flow

**Lifecycle: New session → Real session ID**

### 1. User Initiates New Session

```
User types message in new session
    (no selectedSession in state)
    ↓
ChatInterface generates temporary session ID:
    const tempSessionId = `new-session-${Date.now()}`
    ↓
Mark as active for Session Protection:
    onSessionActive(tempSessionId)
```

### 2. Message Sent to Server

```
WebSocket message sent:
    {
      type: 'claude-command',
      command: "User's message",
      options: {
        sessionId: undefined,  // No real session ID yet
        resume: false,
        projectPath: project.path,
        cwd: project.fullPath,
        toolsSettings: {...},
        images: [...]
      }
    }
```

### 3. Server Spawns Claude CLI

```
spawnClaude() called without sessionId
    ↓
Build CLI command without --resume flag:
    claude --output-format stream-json --verbose --print -- "User's message"
    ↓
Process spawned
    ↓
Track with temporary key:
    activeClaudeProcesses.set(tempKey, claudeProcess)
```

### 4. Claude Returns Session ID

```
Claude CLI outputs first response:
    { "session_id": "abc123def456" }
    ↓
Server captures session ID:
    if (response.session_id && !capturedSessionId) {
      capturedSessionId = response.session_id;
    }
    ↓
Update process tracking:
    activeClaudeProcesses.delete(tempKey);
    activeClaudeProcesses.set(capturedSessionId, claudeProcess);
    ↓
Send session-created event to client:
    ws.send(JSON.stringify({
      type: 'session-created',
      sessionId: capturedSessionId
    }))
```

**Code Example:**
```javascript
// server/claude-cli.js - stdout handler
claudeProcess.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(line => line.trim());

  for (const line of lines) {
    const response = JSON.parse(line);

    // Capture session ID
    if (response.session_id && !capturedSessionId) {
      capturedSessionId = response.session_id;
      console.log('📝 Captured session ID:', capturedSessionId);

      // Update process key
      if (processKey !== capturedSessionId) {
        activeClaudeProcesses.delete(processKey);
        activeClaudeProcesses.set(capturedSessionId, claudeProcess);
      }

      // Send event for NEW sessions only
      if (!sessionId && !sessionCreatedSent) {
        sessionCreatedSent = true;
        ws.send(JSON.stringify({
          type: 'session-created',
          sessionId: capturedSessionId
        }));
      }
    }
  }
});
```

### 5. Client Updates Session Reference

```
Client receives 'session-created' message
    ↓
Replace temporary session ID with real one:
    onReplaceTemporarySession(realSessionId)
    ↓
App.jsx updates activeSessions Set:
    - Remove 'new-session-*' entries
    - Add real session ID
    ↓
Update URL:
    navigate(`/session/${realSessionId}`)
    ↓
Store real session in state:
    setSelectedSession({ id: realSessionId, ... })
```

**Code Example:**
```jsx
// App.jsx - replaceTemporarySession
const replaceTemporarySession = (realSessionId) => {
  if (realSessionId) {
    setActiveSessions(prev => {
      const newSet = new Set();
      // Keep all non-temporary sessions and add real session ID
      for (const sessionId of prev) {
        if (!sessionId.startsWith('new-session-')) {
          newSet.add(sessionId);
        }
      }
      newSet.add(realSessionId);
      return newSet;
    });
  }
};
```

### 6. Subsequent Messages Use Real ID

```
All future messages in this session use real session ID
    ↓
Resume flag set to true:
    options: { sessionId: realSessionId, resume: true }
    ↓
Claude CLI called with --resume:
    claude --resume abc123def456 --print -- "Next message"
```

---

## Session Resume Flow

**Lifecycle: User selects existing session → Resume conversation**

### 1. User Selects Session

```
User clicks session in Sidebar
    ↓
handleSessionSelect(session) called
    ↓
Update state:
    setSelectedSession(session)
    setActiveTab('chat')
    ↓
Navigate to URL:
    navigate(`/session/${session.id}`)
```

### 2. Load Session Messages

```
ChatInterface useEffect detects session change
    ↓
Fetch session messages:
    GET /api/projects/{projectName}/sessions/{sessionId}/messages
    ↓
Server reads JSONL files:
    - Parse all .jsonl files in project directory
    - Filter entries by sessionId
    - Sort by timestamp
    - Return messages array
    ↓
Client receives messages and populates chat history
```

**Code Example:**
```jsx
// ChatInterface.jsx - Load session messages
useEffect(() => {
  if (!session || !project) return;

  const loadSessionMessages = async () => {
    try {
      setIsLoadingHistory(true);

      const response = await api.sessionMessages(
        project.name,
        session.id,
        null,  // Load all messages
        0
      );
      const data = await response.json();

      // Set messages in state
      setLoadedMessages(data.messages || []);

      // Scroll to bottom
      setTimeout(() => scrollToBottom(), 100);
    } catch (error) {
      console.error('Error loading session:', error);
      setError('Failed to load session history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  loadSessionMessages();
}, [session, project]);
```

### 3. User Sends New Message

```
User types in input field
    ↓
handleSubmit() called
    ↓
Mark session as active:
    onSessionActive(session.id)
    ↓
Send message with resume flag:
    {
      type: 'claude-command',
      command: "User's new message",
      options: {
        sessionId: session.id,
        resume: true,  // KEY: Resume existing session
        projectPath: project.path,
        cwd: project.fullPath
      }
    }
```

### 4. Server Resumes Session

```
spawnClaude() called with sessionId
    ↓
Build CLI command with --resume:
    claude --resume abc123def456 --output-format stream-json --verbose --print -- "New message"
    ↓
Claude CLI loads session context from ~/.claude/projects/{encoded-path}/
    ↓
Process spawned, tracked with sessionId:
    activeClaudeProcesses.set(sessionId, claudeProcess)
```

**Code Example:**
```javascript
// server/claude-cli.js - Resume session
async function spawnClaude(command, options, ws) {
  const { sessionId, resume, cwd } = options;
  const args = [];

  // Add resume flag for existing sessions
  if (resume && sessionId) {
    args.push('--resume', sessionId);
    console.log('🔄 Resuming session:', sessionId);
  }

  args.push('--output-format', 'stream-json', '--verbose');

  if (command && command.trim()) {
    args.push('--print', '--', command);
  }

  console.log('Spawning Claude CLI:', 'claude', args.join(' '));
  const claudeProcess = spawn('claude', args, { cwd });

  // Track with session ID
  activeClaudeProcesses.set(sessionId, claudeProcess);
}
```

### 5. Response Streaming

```
Claude responds with conversation context preserved
    ↓
Responses streamed to client as normal
    ↓
New messages appended to JSONL file by Claude CLI
```

### 6. Completion

```
Claude completes response
    ↓
Server sends 'claude-complete' message
    ↓
Client marks session as inactive:
    onSessionInactive(session.id)
    ↓
Session Protection released
    ↓
Sidebar can now refresh to show updated session
```

---

## File Upload Flow

**Lifecycle: Images → Temp files → CLI**

### 1. User Selects Images

```
User drags/drops or clicks to select images
    ↓
react-dropzone handles file selection
    ↓
Validate files:
  - Type: image/jpeg, image/png, image/gif, image/webp, image/svg+xml
  - Size: Max 5MB per file
  - Count: Max 5 files
```

**Code Example:**
```jsx
// ChatInterface.jsx - useDropzone configuration
const { getRootProps, getInputProps, isDragActive } = useDropzone({
  onDrop: handleImageDrop,
  accept: {
    'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp', '.svg']
  },
  maxSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 5,
  noClick: true,
  noKeyboard: true
});
```

### 2. Client-Side Upload

```
Selected files sent to server
    ↓
POST /api/projects/{projectName}/upload-images
    FormData with files
    ↓
multer middleware processes upload:
  - Saves to temp directory: os.tmpdir()/claude-ui-uploads/{userId}/
  - Generates unique filename: {timestamp}-{random}-{original}
```

### 3. Server Processing

```
Server reads uploaded files
    ↓
For each file:
  1. Read file buffer
  2. Convert to base64
  3. Create data URL: data:{mimeType};base64,{base64}
  4. Delete temp file immediately
    ↓
Return array of image objects:
    {
      name: "original.jpg",
      data: "data:image/jpeg;base64,...",
      size: 12345,
      mimeType: "image/jpeg"
    }
```

**Code Example:**
```javascript
// server/index.js - Image upload endpoint
app.post('/api/projects/:projectName/upload-images', authenticateToken, async (req, res) => {
  upload.array('images', 5)(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    try {
      const processedImages = await Promise.all(
        req.files.map(async (file) => {
          // Read and convert to base64
          const buffer = await fs.readFile(file.path);
          const base64 = buffer.toString('base64');
          const mimeType = file.mimetype;

          // Clean up temp file
          await fs.unlink(file.path);

          return {
            name: file.originalname,
            data: `data:${mimeType};base64,${base64}`,
            size: file.size,
            mimeType: mimeType
          };
        })
      );

      res.json({ images: processedImages });
    } catch (error) {
      res.status(500).json({ error: 'Failed to process images' });
    }
  });
});
```

### 4. Client Stores Images

```
Client receives processed images
    ↓
Store in component state:
    setUploadedImages(prev => [...prev, ...images])
    ↓
Display thumbnails in UI
```

### 5. Message Submission with Images

```
User submits message with images attached
    ↓
Images included in WebSocket message:
    {
      type: 'claude-command',
      command: "Analyze these images",
      options: {
        images: [
          { name: "image1.jpg", data: "data:image/jpeg;base64,..." },
          { name: "image2.png", data: "data:image/png;base64,..." }
        ]
      }
    }
```

### 6. Server Saves Images to Project

```
spawnClaude() receives images in options
    ↓
Create temp directory in project:
    {projectPath}/.tmp/images/{timestamp}/
    ↓
For each image:
  1. Extract base64 data from data URL
  2. Determine file extension from MIME type
  3. Write to file: image_0.jpg, image_1.png, etc.
  4. Add path to tempImagePaths array
    ↓
Append image paths to user's command:
    "Analyze these images

    [Images provided at the following paths:]
    1. /path/to/project/.tmp/images/1234567890/image_0.jpg
    2. /path/to/project/.tmp/images/1234567890/image_1.png"
```

**Code Example:**
```javascript
// server/claude-cli.js - Handle images
if (images && images.length > 0) {
  const tempDir = path.join(cwd, '.tmp', 'images', Date.now().toString());
  await fs.mkdir(tempDir, { recursive: true });

  for (const [index, image] of images.entries()) {
    // Extract base64 data
    const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) continue;

    const [, mimeType, base64Data] = matches;
    const extension = mimeType.split('/')[1] || 'png';
    const filename = `image_${index}.${extension}`;
    const filepath = path.join(tempDir, filename);

    // Write to file
    await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
    tempImagePaths.push(filepath);
  }

  // Append paths to command
  if (tempImagePaths.length > 0 && command && command.trim()) {
    const imageNote = `\n\n[Images provided at the following paths:]\n` +
      tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n');
    command = command + imageNote;
  }
}
```

### 7. Claude Processes Images

```
Claude CLI receives command with image paths
    ↓
Claude reads image files from project directory
    ↓
Analyzes images and responds
```

### 8. Cleanup

```
Claude process completes
    ↓
Server cleanup on 'close' event:
  1. Delete temp image files
  2. Delete temp directory
  3. Clear process reference
```

**Code Example:**
```javascript
// server/claude-cli.js - Cleanup on close
claudeProcess.on('close', async (code) => {
  // Clean up temporary image files
  if (claudeProcess.tempImagePaths && claudeProcess.tempImagePaths.length > 0) {
    for (const imagePath of claudeProcess.tempImagePaths) {
      await fs.unlink(imagePath).catch(err =>
        console.error(`Failed to delete temp image ${imagePath}:`, err)
      );
    }

    if (claudeProcess.tempDir) {
      await fs.rm(claudeProcess.tempDir, { recursive: true, force: true }).catch(err =>
        console.error(`Failed to delete temp directory:`, err)
      );
    }
  }
});
```

---

## WebSocket Connection Lifecycle

**Full lifecycle of WebSocket connection**

### 1. Client Initialization

```
App loads → WebSocketProvider initializes
    ↓
useWebSocket hook creates connection:
  1. Fetch server config: GET /api/config
  2. Extract WebSocket URL and protocol (ws/wss)
  3. Get auth token from localStorage
  4. Build WebSocket URL with token:
     ws://localhost:3001/ws?token={token}
```

**Code Example:**
```javascript
// src/utils/websocket.js - useWebSocket
export const useWebSocket = () => {
  const [ws, setWs] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const initWebSocket = async () => {
      try {
        // Get server config
        const response = await authenticatedFetch('/api/config');
        const config = await response.json();

        // Get auth token
        const token = localStorage.getItem('auth-token');
        if (!token) {
          console.error('No auth token for WebSocket');
          return;
        }

        // Build WebSocket URL
        const wsUrl = `${config.wsUrl}/ws?token=${encodeURIComponent(token)}`;
        console.log('Connecting to WebSocket:', wsUrl);

        const websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
          console.log('✅ WebSocket connected');
          setIsConnected(true);
        };

        setWs(websocket);
      } catch (error) {
        console.error('WebSocket initialization error:', error);
      }
    };

    initWebSocket();
  }, []);

  return { ws, isConnected };
};
```

### 2. Server Authentication

```
Connection request reaches server
    ↓
verifyClient callback in WebSocketServer:
  1. Parse URL to extract token
  2. Call authenticateWebSocket(token)
  3. Verify JWT token
  4. Look up user
  5. Store user in req.user
  6. Return true (accept) or false (reject)
    ↓
If rejected: Connection closed with 401
If accepted: Connection established
```

### 3. Connection Routing

```
Connection established
    ↓
Server checks URL pathname:
  - /ws → Chat connection (handleChatConnection)
  - /shell → Terminal connection (handleShellConnection)
    ↓
Add to connectedClients Set (for project updates)
```

**Code Example:**
```javascript
// server/index.js - Connection routing
wss.on('connection', (ws, request) => {
  const url = request.url;
  const urlObj = new URL(url, 'http://localhost');
  const pathname = urlObj.pathname;

  console.log('🔗 Client connected to:', pathname);

  if (pathname === '/shell') {
    handleShellConnection(ws);
  } else if (pathname === '/ws') {
    handleChatConnection(ws);
  } else {
    console.log('❌ Unknown WebSocket path:', pathname);
    ws.close();
  }
});
```

### 4. Message Handling

```
Client sends message:
  ws.send(JSON.stringify({ type: 'claude-command', ... }))
    ↓
Server receives in 'message' event handler
    ↓
Parse JSON and route by type:
  - 'claude-command' → spawnClaude()
  - 'cursor-command' → spawnCursor()
  - 'abort-session' → abortClaudeSession() or abortCursorSession()
    ↓
Server sends responses:
  ws.send(JSON.stringify({ type: 'claude-response', data: {...} }))
    ↓
Client receives in 'message' event handler
    ↓
Parse and add to messages array
```

### 5. Connection Monitoring

```
Client monitors connection state:
  - onopen: Set isConnected = true
  - onclose: Set isConnected = false, attempt reconnect
  - onerror: Log error, set isConnected = false
    ↓
Server monitors connection:
  - 'close' event: Remove from connectedClients
  - 'error' event: Log error
```

**Code Example:**
```javascript
// Client-side connection monitoring
useEffect(() => {
  if (!ws) return;

  ws.onclose = () => {
    console.log('❌ WebSocket disconnected');
    setIsConnected(false);

    // Attempt reconnect after delay
    setTimeout(() => {
      console.log('🔄 Attempting to reconnect...');
      initWebSocket();
    }, 3000);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    setIsConnected(false);
  };
}, [ws]);
```

### 6. Graceful Shutdown

```
Browser/tab closes or navigates away
    ↓
beforeunload event fires
    ↓
WebSocket closes:
  ws.close()
    ↓
Server receives 'close' event:
  - Remove from connectedClients Set
  - Clean up any active processes
  - Log disconnection
```

---

## Terminal Initialization Flow

**Lifecycle: Open terminal → Interactive shell**

### 1. User Opens Terminal

```
User clicks "Terminal" tab or StandaloneShell component
    ↓
Shell component initializes:
  - Create xterm.js terminal instance
  - Configure addons (fit, webgl, clipboard)
  - Mount terminal to DOM element
```

**Code Example:**
```jsx
// StandaloneShell.jsx - Terminal initialization
useEffect(() => {
  const terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4'
    }
  });

  // Load addons
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebglAddon());
  terminal.loadAddon(new ClipboardAddon());

  // Mount to DOM
  terminal.open(terminalRef.current);
  fitAddon.fit();

  setTerminalInstance(terminal);
}, []);
```

### 2. WebSocket Connection

```
Terminal creates separate WebSocket connection
    ↓
Connect to /shell endpoint:
    ws://localhost:3001/shell?token={token}
    ↓
Server routes to handleShellConnection()
```

### 3. Shell Initialization Message

```
Client sends 'init' message:
    {
      type: 'init',
      projectPath: project.fullPath,
      sessionId: session?.id,
      hasSession: !!session,
      provider: 'claude' | 'cursor' | 'plain-shell',
      initialCommand: 'npm run dev',  // Optional
      isPlainShell: true  // For custom commands
    }
```

**Code Example:**
```jsx
// StandaloneShell.jsx - Send init message
useEffect(() => {
  if (!shellWs || shellWs.readyState !== WebSocket.OPEN) return;

  const initMessage = {
    type: 'init',
    projectPath: project.fullPath,
    sessionId: session?.id,
    hasSession: !!session,
    provider: provider,
    isPlainShell: !!initialCommand && !session
  };

  if (initialCommand) {
    initMessage.initialCommand = initialCommand;
  }

  shellWs.send(JSON.stringify(initMessage));
}, [shellWs, project, session, provider]);
```

### 4. Server Spawns PTY

```
Server receives 'init' message
    ↓
Build shell command based on provider:
  - Claude: cd "{projectPath}" && claude --resume {sessionId}
  - Cursor: cd "{projectPath}" && cursor-agent --resume="{sessionId}"
  - Plain shell: cd "{projectPath}" && {initialCommand}
    ↓
Spawn PTY (pseudo-terminal):
  pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: homeDir,
    env: { TERM: 'xterm-256color', ... }
  })
```

**Code Example:**
```javascript
// server/index.js - Shell initialization
if (data.type === 'init') {
  const projectPath = data.projectPath || process.cwd();
  const sessionId = data.sessionId;
  const hasSession = data.hasSession;
  const provider = data.provider || 'claude';
  const initialCommand = data.initialCommand;
  const isPlainShell = data.isPlainShell || (!!initialCommand && !hasSession);

  // Send welcome message
  const welcomeMsg = isPlainShell ?
    `\x1b[36mStarting terminal in: ${projectPath}\x1b[0m\r\n` :
    `\x1b[36mResuming ${provider} session ${sessionId} in: ${projectPath}\x1b[0m\r\n`;

  ws.send(JSON.stringify({ type: 'output', data: welcomeMsg }));

  // Build shell command
  let shellCommand;
  if (isPlainShell) {
    // Plain shell with custom command
    shellCommand = os.platform() === 'win32' ?
      `Set-Location -Path "${projectPath}"; ${initialCommand}` :
      `cd "${projectPath}" && ${initialCommand}`;
  } else if (provider === 'cursor') {
    // Cursor agent
    shellCommand = os.platform() === 'win32' ?
      `Set-Location -Path "${projectPath}"; cursor-agent --resume="${sessionId}"` :
      `cd "${projectPath}" && cursor-agent --resume="${sessionId}"`;
  } else {
    // Claude CLI
    shellCommand = os.platform() === 'win32' ?
      `Set-Location -Path "${projectPath}"; claude --resume ${sessionId}` :
      `cd "${projectPath}" && claude --resume ${sessionId}`;
  }

  // Spawn PTY
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
  const shellArgs = os.platform() === 'win32' ? ['-Command', shellCommand] : ['-c', shellCommand];

  shellProcess = pty.spawn(shell, shellArgs, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    }
  });
}
```

### 5. Bidirectional Data Flow

```
PTY Output → Server → Client → xterm.js
    ↓
shellProcess.onData((data) => {
  ws.send(JSON.stringify({ type: 'output', data }))
})
    ↓
Client receives and writes to terminal:
    terminal.write(data)
```

```
User Input → xterm.js → Client → Server → PTY
    ↓
terminal.onData((data) => {
  shellWs.send(JSON.stringify({ type: 'input', data }))
})
    ↓
Server receives and writes to PTY:
    shellProcess.write(data)
```

**Code Example:**
```jsx
// Client-side bidirectional data flow
useEffect(() => {
  if (!terminal || !shellWs) return;

  // PTY output → terminal
  const handleShellMessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'output') {
      terminal.write(data.data);
    }
  };
  shellWs.addEventListener('message', handleShellMessage);

  // Terminal input → PTY
  const inputHandler = terminal.onData((data) => {
    if (shellWs && shellWs.readyState === WebSocket.OPEN) {
      shellWs.send(JSON.stringify({ type: 'input', data }));
    }
  });

  return () => {
    shellWs.removeEventListener('message', handleShellMessage);
    inputHandler.dispose();
  };
}, [terminal, shellWs]);
```

### 6. Terminal Resize Handling

```
Browser window resizes
    ↓
FitAddon calculates new dimensions
    ↓
Client sends resize message:
    { type: 'resize', cols: 120, rows: 30 }
    ↓
Server updates PTY:
    shellProcess.resize(cols, rows)
```

### 7. Terminal Cleanup

```
User closes terminal or navigates away
    ↓
Client closes WebSocket:
    shellWs.close()
    ↓
Server receives 'close' event:
  - Kill shell process: shellProcess.kill()
  - Clean up references
  - Log disconnection
```

**Code Example:**
```javascript
// server/index.js - Shell cleanup
ws.on('close', () => {
  console.log('🔌 Shell client disconnected');
  if (shellProcess && shellProcess.kill) {
    console.log('🔴 Killing shell process:', shellProcess.pid);
    shellProcess.kill();
  }
});
```

---

## Summary

This document covered eight major workflows in Claude Code UI:

1. **Chat Message Flow**: End-to-end lifecycle of a user message from input to Claude's response
2. **Project Update Flow**: File system monitoring and real-time project updates with Session Protection
3. **Authentication Flow**: User setup, login, JWT generation, and protected request handling
4. **Session Creation Flow**: New session initialization with temporary ID replacement
5. **Session Resume Flow**: Loading and continuing existing conversations
6. **File Upload Flow**: Image processing and integration with Claude CLI
7. **WebSocket Connection Lifecycle**: Connection establishment, routing, and maintenance
8. **Terminal Initialization Flow**: Interactive shell spawning with PTY

Each flow demonstrates:
- Clear sequence of events
- Code examples from actual implementation
- Data transformation at each step
- Error handling considerations
- Integration between frontend and backend

These workflows form the foundation of Claude Code UI's functionality and demonstrate how different components work together to create a seamless user experience.
