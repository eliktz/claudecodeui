# 13. End-to-End Feature Traces

This document traces three critical features through the entire codebase, showing the complete data flow from user action to final result.

## Table of Contents

1. [Example 1: Starting a New Chat Session](#example-1-starting-a-new-chat-session)
2. [Example 2: Session Protection During File Changes](#example-2-session-protection-during-file-changes)
3. [Example 3: Resuming an Existing Session](#example-3-resuming-an-existing-session)

---

## Example 1: Starting a New Chat Session

**User Journey:** User selects a project → Types a message → Sends it → Receives Claude's response

### Step 1: User Selects a Project

**User Action:** Clicks project in sidebar

**File:** `/Users/elik.k/git/claudecodeui/src/App.jsx:311-318`

```javascript
const handleProjectSelect = (project) => {
  setSelectedProject(project);
  setSelectedSession(null);  // Clear any existing session
  navigate('/');
  if (isMobile) {
    setSidebarOpen(false);
  }
};
```

**State Changes:**
- `selectedProject` = chosen project object
- `selectedSession` = null (starting fresh)
- URL = `/` (home route)

---

### Step 2: User Types and Sends Message

**User Action:** Types message in chat input and clicks send or presses Enter

**File:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx` (handleSubmit function, around line 1400-1500)

```javascript
const handleSubmit = async (e) => {
  e?.preventDefault();

  if ((!inputValue.trim() && uploadedImages.length === 0) || isLoading) return;

  const userMessage = inputValue.trim();
  const imagesToSend = [...uploadedImages];

  // Clear input immediately for better UX
  setInputValue('');
  setUploadedImages([]);

  // Add user message to chat
  setChatMessages(prev => [...prev, {
    type: 'user',
    content: userMessage,
    timestamp: new Date(),
    images: imagesToSend.length > 0 ? imagesToSend : undefined
  }]);

  setIsLoading(true);
  setClaudeStatus('initializing');
  setCanAbortSession(true);

  // Generate temporary session ID for new sessions
  const tempSessionId = selectedSession?.id || `new-session-${Date.now()}`;

  // CRITICAL: Mark session as active BEFORE sending message
  // This prevents project updates from interrupting the chat
  if (onSessionActive) {
    onSessionActive(tempSessionId);
  }

  try {
    // Get selected provider (claude or cursor)
    const provider = localStorage.getItem('selected-provider') || 'claude';

    // Get tools settings from localStorage
    const toolsSettings = JSON.parse(localStorage.getItem('tools-settings') || '{}');

    if (provider === 'cursor') {
      // Cursor CLI flow
      sendMessage({
        type: 'cursor-command',
        command: userMessage,
        options: {
          cwd: selectedProject.fullPath || selectedProject.path,
          sessionId: selectedSession?.id,
          resume: !!selectedSession?.id,
          model: localStorage.getItem('cursor-model') || 'claude-3.5-sonnet',
          images: imagesToSend
        }
      });
    } else {
      // Claude CLI flow
      sendMessage({
        type: 'claude-command',
        command: userMessage,
        options: {
          projectPath: selectedProject.name,
          cwd: selectedProject.fullPath || selectedProject.path,
          sessionId: selectedSession?.id,
          resume: !!selectedSession?.id,
          toolsSettings: toolsSettings,
          permissionMode: localStorage.getItem('permission-mode') || 'default',
          images: imagesToSend
        }
      });
    }

    // Store pending session ID for new sessions
    if (!selectedSession?.id) {
      sessionStorage.setItem('pendingSessionId', tempSessionId);
    }
  } catch (error) {
    console.error('Error sending message:', error);
    setChatMessages(prev => [...prev, {
      type: 'error',
      content: `Failed to send message: ${error.message}`,
      timestamp: new Date()
    }]);
    setIsLoading(false);
    setClaudeStatus(null);

    // Mark session as inactive on error
    if (onSessionInactive) {
      onSessionInactive(tempSessionId);
    }
  }
};
```

**Key Actions:**
1. **Optimistic UI Update:** User message added to chat immediately
2. **Temporary Session ID:** Generated for new sessions (`new-session-${Date.now()}`)
3. **Session Protection:** `onSessionActive(tempSessionId)` marks session as protected
4. **WebSocket Message:** Sends command with all necessary options

**State Changes:**
- `chatMessages` += user message
- `isLoading` = true
- `claudeStatus` = 'initializing'
- `canAbortSession` = true
- **App-level:** `activeSessions` Set includes `tempSessionId`

---

### Step 3: WebSocket Message to Backend

**Data Flow:** Frontend → WebSocket → Backend Handler

**File:** `/Users/elik.k/git/claudecodeui/src/utils/websocket.js:95-101`

```javascript
const sendMessage = (message) => {
  if (ws && isConnected) {
    ws.send(JSON.stringify(message));
  } else {
    console.warn('WebSocket not connected');
  }
};
```

**WebSocket Message Format:**
```json
{
  "type": "claude-command",
  "command": "Add a dark mode toggle",
  "options": {
    "projectPath": "Users-john-myproject",
    "cwd": "/Users/john/myproject",
    "sessionId": null,
    "resume": false,
    "toolsSettings": {
      "allowedTools": ["Read", "Edit", "Write"],
      "disallowedTools": [],
      "skipPermissions": false
    },
    "permissionMode": "default",
    "images": []
  }
}
```

---

### Step 4: Backend Receives and Routes Message

**File:** `/Users/elik.k/git/claudecodeui/server/index.js:545-553`

```javascript
ws.on('message', async (message) => {
  try {
    const data = JSON.parse(message);

    if (data.type === 'claude-command') {
      console.log('💬 User message:', data.command || '[Continue/Resume]');
      console.log('📁 Project:', data.options?.projectPath || 'Unknown');
      console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');
      await spawnClaude(data.command, data.options, ws);
    }
    // ... other message types
  }
});
```

---

### Step 5: Spawn Claude CLI Process

**File:** `/Users/elik.k/git/claudecodeui/server/claude-cli.js:12-249`

**Core Function:**
```javascript
async function spawnClaude(command, options = {}, ws) {
  return new Promise(async (resolve, reject) => {
    const { sessionId, projectPath, cwd, resume, toolsSettings, permissionMode, images } = options;
    let capturedSessionId = sessionId;
    let sessionCreatedSent = false;

    // Build Claude CLI command
    const args = [];
    const workingDir = cwd || process.cwd();

    // Handle images (save to temp files)
    const tempImagePaths = [];
    if (images && images.length > 0) {
      const tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
      await fs.mkdir(tempDir, { recursive: true });

      for (const [index, image] of images.entries()) {
        const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
        const [, mimeType, base64Data] = matches;
        const extension = mimeType.split('/')[1] || 'png';
        const filepath = path.join(tempDir, `image_${index}.${extension}`);
        await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
        tempImagePaths.push(filepath);
      }
    }

    // Build CLI arguments
    args.push('--output-format', 'stream-json', '--verbose');

    // Add MCP config if available
    const claudeConfigPath = path.join(os.homedir(), '.claude.json');
    if (fsSync.existsSync(claudeConfigPath)) {
      const claudeConfig = JSON.parse(fsSync.readFileSync(claudeConfigPath, 'utf8'));
      if (claudeConfig.mcpServers && Object.keys(claudeConfig.mcpServers).length > 0) {
        args.push('--mcp-config', claudeConfigPath);
      }
    }

    // Add model for new sessions
    if (!resume) {
      args.push('--model', 'sonnet');
    }

    // Add permission mode
    if (permissionMode && permissionMode !== 'default') {
      args.push('--permission-mode', permissionMode);
    }

    // Add tools settings
    if (toolsSettings) {
      if (toolsSettings.skipPermissions) {
        args.push('--dangerously-skip-permissions');
      } else {
        // Add allowed tools
        if (toolsSettings.allowedTools && toolsSettings.allowedTools.length > 0) {
          for (const tool of toolsSettings.allowedTools) {
            args.push('--allowedTools', tool);
          }
        }
        // Add disallowed tools
        if (toolsSettings.disallowedTools && toolsSettings.disallowedTools.length > 0) {
          for (const tool of toolsSettings.disallowedTools) {
            args.push('--disallowedTools', tool);
          }
        }
      }
    }

    // Add command with --print flag
    if (command && command.trim()) {
      args.push('--print');
      args.push('--');
      args.push(command);
    }

    console.log('Spawning Claude CLI:', 'claude', args.join(' '));

    // Spawn Claude CLI process
    const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
    const claudeProcess = spawnFunction(claudePath, args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });

    // Store process for potential abort
    const processKey = capturedSessionId || sessionId || Date.now().toString();
    activeClaudeProcesses.set(processKey, claudeProcess);

    // Handle stdout (streaming JSON responses)
    claudeProcess.stdout.on('data', (data) => {
      const rawOutput = data.toString();
      const lines = rawOutput.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);

          // Capture session ID from response
          if (response.session_id && !capturedSessionId) {
            capturedSessionId = response.session_id;

            // Send session-created event only once
            if (!sessionId && !sessionCreatedSent) {
              sessionCreatedSent = true;
              ws.send(JSON.stringify({
                type: 'session-created',
                sessionId: capturedSessionId
              }));
            }
          }

          // Forward response to frontend
          ws.send(JSON.stringify({
            type: 'claude-response',
            data: response
          }));
        } catch (parseError) {
          // Non-JSON output, send as raw text
          ws.send(JSON.stringify({
            type: 'claude-output',
            data: line
          }));
        }
      }
    });

    // Handle process completion
    claudeProcess.on('close', async (code) => {
      console.log(`Claude CLI process exited with code ${code}`);

      // Clean up process reference
      activeClaudeProcesses.delete(capturedSessionId || sessionId);

      ws.send(JSON.stringify({
        type: 'claude-complete',
        exitCode: code,
        isNewSession: !sessionId && !!command
      }));

      // Clean up temporary image files
      for (const imagePath of tempImagePaths) {
        await fs.unlink(imagePath).catch(() => {});
      }
    });

    // Handle errors
    claudeProcess.on('error', (error) => {
      console.error('Claude CLI process error:', error);
      ws.send(JSON.stringify({
        type: 'claude-error',
        error: error.message
      }));
      reject(error);
    });
  });
}
```

**CLI Command Example:**
```bash
claude --output-format stream-json --verbose --model sonnet --allowedTools Read --allowedTools Edit --allowedTools Write --print -- "Add a dark mode toggle"
```

---

### Step 6: Claude CLI Streams Responses

**Claude CLI Output Format (JSONL):**

```json
{"type":"system","subtype":"init","session_id":"abc123-session-id"}
{"type":"message_start","message":{"id":"msg_01","role":"assistant"}}
{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}
{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'll"}}
{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" help"}}
{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" add"}}
{"type":"content_block_stop","index":0}
{"type":"message_delta","delta":{"stop_reason":"end_turn"}}
{"type":"message_stop"}
```

---

### Step 7: Backend Forwards Responses to Frontend

**File:** `/Users/elik.k/git/claudecodeui/server/claude-cli.js:292-295`

Each parsed JSON line is wrapped and sent via WebSocket:

```javascript
ws.send(JSON.stringify({
  type: 'claude-response',
  data: response  // Original Claude CLI response
}));
```

---

### Step 8: Frontend Receives and Processes Responses

**File:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx` (around lines 1800-2100)

```javascript
useEffect(() => {
  if (messages.length > 0) {
    const latestMessage = messages[messages.length - 1];

    switch (latestMessage.type) {
      case 'session-created':
        // New session ID received from backend
        const newSessionId = latestMessage.sessionId;
        console.log('🎉 Session created:', newSessionId);

        // Replace temporary session ID with real one
        if (onReplaceTemporarySession) {
          onReplaceTemporarySession(newSessionId);
        }

        // Store for later use
        setCurrentSessionId(newSessionId);
        sessionStorage.removeItem('pendingSessionId');

        // Navigate to session URL
        if (onNavigateToSession) {
          onNavigateToSession(newSessionId);
        }
        break;

      case 'claude-response':
        const messageData = latestMessage.data;

        // Handle streaming text deltas
        if (messageData.type === 'content_block_delta') {
          if (messageData.delta?.type === 'text_delta') {
            const chunk = messageData.delta.text || '';
            if (chunk) {
              setChatMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last && last.type === 'assistant' && !last.isToolUse && last.isStreaming) {
                  // Append to existing streaming message
                  last.content += chunk;
                } else {
                  // Create new streaming message
                  updated.push({
                    type: 'assistant',
                    content: chunk,
                    timestamp: new Date(),
                    isStreaming: true
                  });
                }
                return updated;
              });
            }
          }
        }

        // Handle message completion
        if (messageData.type === 'message_stop') {
          setChatMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.type === 'assistant' && last.isStreaming) {
              last.isStreaming = false;
            }
            return updated;
          });
        }

        // Handle tool use
        if (Array.isArray(messageData.content)) {
          for (const part of messageData.content) {
            if (part.type === 'tool_use') {
              setChatMessages(prev => [...prev, {
                type: 'assistant',
                content: '',
                timestamp: new Date(),
                isToolUse: true,
                toolName: part.name,
                toolInput: JSON.stringify(part.input, null, 2),
                toolId: part.id,
                toolResult: null
              }]);
            } else if (part.type === 'text' && part.text?.trim()) {
              setChatMessages(prev => [...prev, {
                type: 'assistant',
                content: part.text,
                timestamp: new Date()
              }]);
            }
          }
        }
        break;

      case 'claude-complete':
        setIsLoading(false);
        setCanAbortSession(false);
        setClaudeStatus(null);

        // Mark session as inactive - allows project updates to resume
        const completedSessionId = currentSessionId || sessionStorage.getItem('pendingSessionId');
        if (completedSessionId && onSessionInactive) {
          onSessionInactive(completedSessionId);
        }

        // Refresh projects to show new session in sidebar
        if (window.refreshProjects && latestMessage.isNewSession) {
          setTimeout(() => window.refreshProjects(), 500);
        }
        break;

      case 'claude-error':
        setChatMessages(prev => [...prev, {
          type: 'error',
          content: `Error: ${latestMessage.error}`,
          timestamp: new Date()
        }]);
        setIsLoading(false);
        setClaudeStatus(null);
        break;
    }
  }
}, [messages]);
```

**UI Updates:**
1. **Streaming Text:** Chat bubbles update character-by-character as deltas arrive
2. **Tool Use:** Special UI components show tool calls (Edit, Write, etc.)
3. **Completion:** Loading spinner stops, session marked inactive
4. **Session Created:** URL updates to `/session/{sessionId}`

---

### Step 9: Session Protection Ends

**File:** `/Users/elik.k/git/claudecodeui/src/App.jsx:440-455`

```javascript
// Mark session as inactive when conversation completes
const markSessionAsInactive = (sessionId) => {
  if (sessionId) {
    setActiveSessions(prev => {
      const newSet = new Set(prev);
      newSet.delete(sessionId);
      return newSet;
    });
  }
};

// Replace temporary session ID with real session ID
const replaceTemporarySession = (realSessionId) => {
  if (realSessionId) {
    setActiveSessions(prev => {
      const newSet = new Set();
      // Keep all non-temporary sessions and add the real session ID
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

**Result:** Project updates from file system watcher are no longer blocked for this session.

---

### Complete Data Flow Summary

```
User Input
   ↓
ChatInterface.handleSubmit()
   ↓ [Generates temp ID, marks session active]
WebSocket.sendMessage({type: 'claude-command', ...})
   ↓
Backend WebSocket Handler
   ↓
spawnClaude(command, options, ws)
   ↓ [Builds CLI args, spawns process]
Claude CLI Process
   ↓ [Streams JSONL responses]
Backend stdout handler
   ↓ [Parses and forwards]
Frontend WebSocket onmessage
   ↓
ChatInterface useEffect (processes message types)
   ↓ [Updates chat messages, handles session ID]
React Re-render
   ↓
User Sees Response
   ↓
'claude-complete' message
   ↓
Mark session inactive (project updates resume)
```

**Key Timestamps:**
- t=0ms: User clicks send
- t=10ms: Message in chat (optimistic update)
- t=50ms: WebSocket message sent
- t=100ms: Claude CLI spawned
- t=500ms: First text delta received
- t=1000ms: Session ID received
- t=5000ms: Response complete

---

## Example 2: Session Protection During File Changes

**Scenario:** User is actively chatting when external file changes trigger project updates

### Step 1: Active Chat Session

**Current State:**
- User sent message: "Add authentication"
- `activeSessions` Set contains: `["abc123-session-id"]`
- Claude is responding (streaming text)

---

### Step 2: File System Change Detected

**External Event:** User edits `README.md` in the project folder using VSCode

**File:** `/Users/elik.k/git/claudecodeui/server/index.js:122-126`

```javascript
projectsWatcher
  .on('add', (filePath) => debouncedUpdate('add', filePath))
  .on('change', (filePath) => debouncedUpdate('change', filePath))  // ← Triggered
  .on('unlink', (filePath) => debouncedUpdate('unlink', filePath))
```

**Chokidar Event:**
```javascript
// Event fired
{
  event: 'change',
  path: '/Users/john/.claude/projects/Users-john-myproject/abc123-session.jsonl'
}
```

---

### Step 3: Debounced Update Triggered

**File:** `/Users/elik.k/git/claudecodeui/server/index.js:88-119`

```javascript
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
      console.error('❌ Error handling project changes:', error);
    }
  }, 300); // 300ms debounce
};
```

**Debounce Behavior:**
- Multiple file changes within 300ms are batched
- Only one `projects_updated` message sent per batch

---

### Step 4: Frontend Receives Update

**File:** `/Users/elik.k/git/claudecodeui/src/App.jsx:157-209`

```javascript
useEffect(() => {
  if (messages.length > 0) {
    const latestMessage = messages[messages.length - 1];

    if (latestMessage.type === 'projects_updated') {
      console.log('📦 Projects updated from WebSocket');

      // SESSION PROTECTION LOGIC
      // Check if we have an active session that should be protected
      const hasActiveSession = (selectedSession && activeSessions.has(selectedSession.id)) ||
                               (activeSessions.size > 0 && Array.from(activeSessions).some(id => id.startsWith('new-session-')));

      if (hasActiveSession) {
        console.log('🛡️ Active session detected, checking if update is additive');

        // Allow updates but be selective: permit additions, prevent changes to existing items
        const updatedProjects = latestMessage.projects;
        const currentProjects = projects;

        // Check if this is purely additive (new sessions/projects) vs modification
        const isAdditiveUpdate = isUpdateAdditive(currentProjects, updatedProjects, selectedProject, selectedSession);

        if (!isAdditiveUpdate) {
          console.log('⛔ Blocking non-additive update during active session');
          return;  // ← CRITICAL: Update blocked here
        }
        console.log('✅ Additive update allowed during active session');
      }

      // Update projects state with the new data
      const updatedProjects = latestMessage.projects;
      setProjects(updatedProjects);

      // Update selected project if it exists
      if (selectedProject) {
        const updatedSelectedProject = updatedProjects.find(p => p.name === selectedProject.name);
        if (updatedSelectedProject) {
          setSelectedProject(updatedSelectedProject);

          // Only update session if it was deleted
          if (selectedSession) {
            const updatedSelectedSession = updatedSelectedProject.sessions?.find(s => s.id === selectedSession.id);
            if (!updatedSelectedSession) {
              setSelectedSession(null);  // Session deleted
            }
          }
        }
      }
    }
  }
}, [messages, selectedProject, selectedSession, activeSessions]);
```

---

### Step 5: Additive Update Check

**File:** `/Users/elik.k/git/claudecodeui/src/App.jsx:118-154`

```javascript
const isUpdateAdditive = (currentProjects, updatedProjects, selectedProject, selectedSession) => {
  if (!selectedProject || !selectedSession) {
    // No active session to protect, allow all updates
    return true;
  }

  // Find the selected project in both current and updated data
  const currentSelectedProject = currentProjects?.find(p => p.name === selectedProject.name);
  const updatedSelectedProject = updatedProjects?.find(p => p.name === selectedProject.name);

  if (!currentSelectedProject || !updatedSelectedProject) {
    // Project structure changed significantly, not purely additive
    return false;
  }

  // Find the selected session in both current and updated project data
  const currentSelectedSession = currentSelectedProject.sessions?.find(s => s.id === selectedSession.id);
  const updatedSelectedSession = updatedSelectedProject.sessions?.find(s => s.id === selectedSession.id);

  if (!currentSelectedSession || !updatedSelectedSession) {
    // Selected session was deleted or significantly changed, not purely additive
    return false;
  }

  // Check if the selected session's content has changed
  const sessionUnchanged =
    currentSelectedSession.id === updatedSelectedSession.id &&
    currentSelectedSession.title === updatedSelectedSession.title &&
    currentSelectedSession.created_at === updatedSelectedSession.created_at &&
    currentSelectedSession.updated_at === updatedSelectedSession.updated_at;

  // This is considered additive if the selected session is unchanged
  // (new sessions may have been added elsewhere, but active session is protected)
  return sessionUnchanged;
};
```

**Logic:**
1. **No active session?** → Allow all updates
2. **Active session selected?** → Check if it changed
3. **Session metadata same?** → Additive (allow)
4. **Session metadata changed?** → Non-additive (block)

---

### Step 6: Update Blocked

**Console Output:**
```
📦 Projects updated from WebSocket
🛡️ Active session detected, checking if update is additive
⛔ Blocking non-additive update during active session
```

**Result:**
- Sidebar does NOT refresh
- Chat messages remain visible
- User's conversation is uninterrupted
- File change is recorded but UI update deferred

---

### Step 7: Session Completes

**User's Response Finishes:**

**File:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx` (claude-complete handler)

```javascript
case 'claude-complete':
  setIsLoading(false);
  setCanAbortSession(false);
  setClaudeStatus(null);

  // Mark session as inactive - allows project updates to resume
  const completedSessionId = currentSessionId || sessionStorage.getItem('pendingSessionId');
  if (completedSessionId && onSessionInactive) {
    onSessionInactive(completedSessionId);
  }
  break;
```

**Calls:** `App.jsx:markSessionAsInactive(sessionId)`

```javascript
const markSessionAsInactive = (sessionId) => {
  if (sessionId) {
    setActiveSessions(prev => {
      const newSet = new Set(prev);
      newSet.delete(sessionId);  // ← Session removed from protection
      return newSet;
    });
  }
};
```

**Result:**
- `activeSessions` Set is now empty
- Next `projects_updated` message will NOT be blocked

---

### Step 8: Deferred Update Received

**Next File Change:**
- New file change event triggers another `projects_updated` message
- OR user manually refreshes sidebar

**File:** `/Users/elik.k/git/claudecodeui/src/App.jsx:157-209`

```javascript
if (latestMessage.type === 'projects_updated') {
  const hasActiveSession = activeSessions.size > 0;  // → false now

  if (hasActiveSession) {
    // ... protection logic
  }  // ← Skipped because no active sessions

  // Update proceeds normally
  const updatedProjects = latestMessage.projects;
  setProjects(updatedProjects);
  // ...
}
```

**Result:** Sidebar refreshes with latest data

---

### Protection Lifecycle Diagram

```
User Sends Message
   ↓
markSessionAsActive(tempId)
   ↓
[activeSessions = {tempId}]
   ↓
File Change → projects_updated
   ↓
Check: hasActiveSession? YES
   ↓
Check: isAdditiveUpdate? NO
   ↓
BLOCK UPDATE (return early)
   ↓
... (user continues chatting)
   ↓
session-created: realId
   ↓
replaceTemporarySession(realId)
   ↓
[activeSessions = {realId}]
   ↓
File Changes Continue → BLOCKED
   ↓
... (response completes)
   ↓
markSessionAsInactive(realId)
   ↓
[activeSessions = {}]
   ↓
File Change → projects_updated
   ↓
Check: hasActiveSession? NO
   ↓
UPDATE PROCEEDS (sidebar refreshes)
```

---

## Example 3: Resuming an Existing Session

**User Journey:** User selects existing session from sidebar → Chat history loads → User continues conversation

### Step 1: User Selects Existing Session

**User Action:** Clicks session in sidebar

**File:** `/Users/elik.k/git/claudecodeui/src/App.jsx:320-340`

```javascript
const handleSessionSelect = (session) => {
  setSelectedSession(session);

  // Only switch to chat tab when user explicitly selects a session
  if (activeTab !== 'git' && activeTab !== 'preview') {
    setActiveTab('chat');
  }

  // For Cursor sessions, store session ID differently
  const provider = localStorage.getItem('selected-provider') || 'claude';
  if (provider === 'cursor') {
    sessionStorage.setItem('cursorSessionId', session.id);
  }

  if (isMobile) {
    setSidebarOpen(false);
  }

  navigate(`/session/${session.id}`);  // ← URL updates
};
```

**State Changes:**
- `selectedSession` = chosen session object
- URL = `/session/abc123-session-id`
- `activeTab` = 'chat'

---

### Step 2: URL-Based Session Loading

**React Router triggers re-render with `sessionId` param**

**File:** `/Users/elik.k/git/claudecodeui/src/App.jsx:276-309`

```javascript
// Handle URL-based session loading
useEffect(() => {
  if (sessionId && projects.length > 0) {
    // Only switch tabs on initial load, not on every project update
    const shouldSwitchTab = !selectedSession || selectedSession.id !== sessionId;

    // Find the session across all projects
    for (const project of projects) {
      // Check Claude sessions
      let session = project.sessions?.find(s => s.id === sessionId);
      if (session) {
        setSelectedProject(project);
        setSelectedSession({ ...session, __provider: 'claude' });
        if (shouldSwitchTab) {
          setActiveTab('chat');
        }
        return;  // Found it!
      }

      // Also check Cursor sessions
      const cSession = project.cursorSessions?.find(s => s.id === sessionId);
      if (cSession) {
        setSelectedProject(project);
        setSelectedSession({ ...cSession, __provider: 'cursor' });
        if (shouldSwitchTab) {
          setActiveTab('chat');
        }
        return;  // Found it!
      }
    }

    // If session not found, it might be newly created
    // Let it load naturally on next refresh
  }
}, [sessionId, projects, navigate]);
```

**State Changes:**
- `selectedProject` = project containing the session
- `selectedSession` = session object with `__provider` flag
- `activeTab` = 'chat'

---

### Step 3: ChatInterface Detects Session Change

**File:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx` (around lines 1600-1750)

```javascript
useEffect(() => {
  if (!selectedSession?.id) {
    // No session selected, clear chat
    if (!isSystemSessionChange) {
      setChatMessages([]);
      setCurrentSessionId(null);
    }
    return;
  }

  const sessionId = selectedSession.id;

  // Skip reload if it's the same session (prevents unnecessary API calls)
  if (currentSessionId === sessionId && chatMessages.length > 0) {
    console.log('Same session, skipping reload');
    return;
  }

  // Session changed, load messages
  console.log('📂 Loading session:', sessionId);

  // Show loading indicator
  setIsLoadingHistory(true);
  setChatMessages([]);  // Clear current messages

  // Fetch session messages from API
  loadSessionMessages(sessionId);

}, [selectedSession, selectedProject]);
```

---

### Step 4: Fetch Session Messages

**API Call:**

**File:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx`

```javascript
const loadSessionMessages = async (sessionId) => {
  try {
    const provider = selectedSession?.__provider || localStorage.getItem('selected-provider') || 'claude';

    if (provider === 'cursor') {
      // Load Cursor session messages
      const response = await authenticatedFetch(
        `/api/cursor/sessions/${sessionId}/messages?projectPath=${encodeURIComponent(selectedProject.fullPath)}`
      );
      if (!response.ok) throw new Error('Failed to load Cursor session messages');
      const data = await response.json();

      // Convert Cursor format to UI format
      const messages = (data.messages || []).map(msg => ({
        type: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: new Date(msg.timestamp),
        // ... tool use detection
      }));

      setChatMessages(messages);

    } else {
      // Load Claude session messages
      const url = `/api/projects/${selectedProject.name}/sessions/${sessionId}/messages`;
      const response = await authenticatedFetch(url);
      if (!response.ok) throw new Error('Failed to load session messages');
      const data = await response.json();

      // Parse JSONL entries into chat messages
      const messages = [];
      const entries = data.messages || [];

      for (const entry of entries) {
        if (entry.message?.role === 'user') {
          messages.push({
            type: 'user',
            content: typeof entry.message.content === 'string'
              ? entry.message.content
              : entry.message.content[0]?.text || '',
            timestamp: new Date(entry.timestamp)
          });
        } else if (entry.message?.role === 'assistant') {
          // Handle tool use and text content
          if (Array.isArray(entry.message.content)) {
            for (const part of entry.message.content) {
              if (part.type === 'tool_use') {
                messages.push({
                  type: 'assistant',
                  content: '',
                  timestamp: new Date(entry.timestamp),
                  isToolUse: true,
                  toolName: part.name,
                  toolInput: JSON.stringify(part.input, null, 2),
                  toolId: part.id
                });
              } else if (part.type === 'text' && part.text?.trim()) {
                messages.push({
                  type: 'assistant',
                  content: part.text,
                  timestamp: new Date(entry.timestamp)
                });
              }
            }
          } else if (typeof entry.message.content === 'string') {
            messages.push({
              type: 'assistant',
              content: entry.message.content,
              timestamp: new Date(entry.timestamp)
            });
          }
        }
      }

      setChatMessages(messages);
    }

    setCurrentSessionId(sessionId);
    setIsLoadingHistory(false);

  } catch (error) {
    console.error('Error loading session messages:', error);
    setChatMessages([{
      type: 'error',
      content: `Failed to load session: ${error.message}`,
      timestamp: new Date()
    }]);
    setIsLoadingHistory(false);
  }
};
```

---

### Step 5: Backend Retrieves Messages

**File:** `/Users/elik.k/git/claudecodeui/server/index.js:231-253`

```javascript
// Get messages for a specific session
app.get('/api/projects/:projectName/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
  try {
    const { projectName, sessionId } = req.params;
    const { limit, offset } = req.query;

    // Parse limit and offset if provided
    const parsedLimit = limit ? parseInt(limit, 10) : null;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;

    const result = await getSessionMessages(projectName, sessionId, parsedLimit, parsedOffset);

    // Handle both old and new response formats
    if (Array.isArray(result)) {
      // Backward compatibility: no pagination
      res.json({ messages: result });
    } else {
      // New format with pagination info
      res.json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

---

### Step 6: Parse JSONL Session Files

**File:** `/Users/elik.k/git/claudecodeui/server/projects.js:713-778`

```javascript
async function getSessionMessages(projectName, sessionId, limit = null, offset = 0) {
  const projectDir = path.join(process.env.HOME, '.claude', 'projects', projectName);

  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

    if (jsonlFiles.length === 0) {
      return { messages: [], total: 0, hasMore: false };
    }

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
              messages.push(entry);  // ← Collect all entries for this session
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

    // If no limit is specified, return all messages (backward compatibility)
    if (limit === null) {
      return sortedMessages;
    }

    // Apply pagination
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
  } catch (error) {
    console.error(`Error reading messages for session ${sessionId}:`, error);
    return limit === null ? [] : { messages: [], total: 0, hasMore: false };
  }
}
```

**JSONL File Example:**

File: `~/.claude/projects/Users-john-myproject/abc123-session.jsonl`

```jsonl
{"sessionId":"abc123","type":"summary","summary":"Add dark mode toggle","timestamp":"2025-01-15T10:30:00Z"}
{"sessionId":"abc123","message":{"role":"user","content":"Add a dark mode toggle"},"timestamp":"2025-01-15T10:30:05Z"}
{"sessionId":"abc123","message":{"role":"assistant","content":[{"type":"text","text":"I'll help you add a dark mode toggle."}]},"timestamp":"2025-01-15T10:30:10Z"}
{"sessionId":"abc123","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool_01","name":"Edit","input":{"file_path":"/Users/john/myproject/src/App.jsx","old_string":"<div>","new_string":"<div className={darkMode ? 'dark' : 'light'}>"}}]},"timestamp":"2025-01-15T10:30:15Z"}
```

---

### Step 7: Render Chat History

**File:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx`

```javascript
return (
  <div className="chat-container">
    {isLoadingHistory && (
      <div className="loading-indicator">Loading session history...</div>
    )}

    <div className="chat-messages">
      {chatMessages.map((message, index) => {
        const prevMessage = index > 0 ? chatMessages[index - 1] : null;

        return (
          <MessageComponent
            key={index}
            message={message}
            index={index}
            prevMessage={prevMessage}
            createDiff={createDiff}
            onFileOpen={handleFileOpen}
            onShowSettings={onShowSettings}
            autoExpandTools={autoExpandTools}
            showRawParameters={showRawParameters}
          />
        );
      })}
    </div>

    {/* Input area */}
    <form onSubmit={handleSubmit}>
      {/* ... */}
    </form>
  </div>
);
```

**Result:** User sees full conversation history

---

### Step 8: User Continues Conversation

**User Action:** Types "Make the toggle animated" and sends

**Flow:** Same as Example 1, but with `resume: true` option

**File:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx:handleSubmit`

```javascript
sendMessage({
  type: 'claude-command',
  command: 'Make the toggle animated',
  options: {
    projectPath: selectedProject.name,
    cwd: selectedProject.fullPath,
    sessionId: selectedSession.id,  // ← Existing session ID
    resume: true,  // ← Resume flag set
    toolsSettings: toolsSettings,
    permissionMode: permissionMode
  }
});
```

**Backend CLI Command:**

**File:** `/Users/elik.k/git/claudecodeui/server/claude-cli.js:79-81`

```javascript
// Add resume flag if resuming
if (resume && sessionId) {
  args.push('--resume', sessionId);
}
```

**Resulting CLI Command:**
```bash
claude --resume abc123-session-id --output-format stream-json --verbose --allowedTools Read --allowedTools Edit --print -- "Make the toggle animated"
```

**Result:** Claude continues the existing session with full context

---

### Session Resume Flow Diagram

```
User Clicks Session in Sidebar
   ↓
handleSessionSelect(session)
   ↓
[selectedSession = session]
   ↓
navigate('/session/abc123')
   ↓
URL param triggers useEffect
   ↓
Find session in projects array
   ↓
[setSelectedSession, setSelectedProject]
   ↓
ChatInterface detects session change
   ↓
loadSessionMessages(sessionId)
   ↓
API: GET /api/projects/{project}/sessions/{sessionId}/messages
   ↓
Backend: getSessionMessages()
   ↓
Parse JSONL files, filter by sessionId
   ↓
Return sorted messages
   ↓
Frontend: Parse entries into chat format
   ↓
setChatMessages(parsedMessages)
   ↓
React renders chat history
   ↓
User sees full conversation
   ↓
User types new message
   ↓
handleSubmit with resume: true, sessionId: 'abc123'
   ↓
WebSocket sends 'claude-command'
   ↓
Backend: spawnClaude with --resume abc123
   ↓
Claude CLI continues session
   ↓
Response streams back
   ↓
Chat updates with new messages
```

---

## Key Architectural Patterns

### 1. Optimistic UI Updates

**Pattern:** Update UI immediately, handle errors later

**Example:** User message added to chat before WebSocket confirms

**Benefit:** Responsive feel, no perceived lag

---

### 2. Session Protection System

**Pattern:** Track active sessions, filter updates based on context

**Components:**
- `activeSessions` Set in `App.jsx`
- `markSessionAsActive()`, `markSessionAsInactive()`, `replaceTemporarySession()`
- `isUpdateAdditive()` helper

**Benefit:** Prevents interruptions during active conversations

---

### 3. Temporary ID Strategy

**Pattern:** Generate temp ID, replace with real ID when available

**Example:**
```javascript
const tempId = `new-session-${Date.now()}`;
// ... later ...
replaceTemporarySession(realId);
```

**Benefit:** Session protection works immediately for new sessions

---

### 4. Streaming Response Handling

**Pattern:** Buffer deltas, update UI incrementally

**Example:**
```javascript
if (last.isStreaming) {
  last.content += chunk;  // Append to existing message
} else {
  createNewMessage(chunk);  // Start new streaming message
}
```

**Benefit:** Real-time feedback, smooth user experience

---

### 5. JSONL Session Storage

**Pattern:** Append-only log of conversation events

**Benefits:**
- Simple parsing (line-by-line)
- Safe concurrent writes
- Easy to replay or analyze
- Compact storage

---

### 6. WebSocket Message Routing

**Pattern:** Type-based message handling with switch statements

**Example:**
```javascript
switch (latestMessage.type) {
  case 'claude-response': /* ... */ break;
  case 'claude-complete': /* ... */ break;
  case 'session-created': /* ... */ break;
}
```

**Benefit:** Clear separation of concerns, easy to extend

---

### 7. Debounced File System Updates

**Pattern:** Batch multiple file changes into single update

**Implementation:** 300ms debounce timer

**Benefit:** Reduces WebSocket messages, improves performance

---

## Performance Considerations

### Message Batching

Streaming deltas buffered for 100ms before updating UI to reduce re-renders.

### Lazy Loading

Session messages fetched only when session is selected (not preloaded).

### Pagination Support

API supports `limit` and `offset` for large sessions (not yet used in UI).

### Cache Invalidation

Project directory cache cleared when file changes detected.

---

## Error Scenarios

### Session Not Found

**Trigger:** User navigates to `/session/invalid-id`

**Handling:**
- `useEffect` in `App.jsx` loops through projects
- If not found, session stays null
- ChatInterface shows empty state
- No error thrown (graceful degradation)

### WebSocket Disconnection

**Trigger:** Network failure, server restart

**Handling:**
- `useWebSocket` hook detects `onclose` event
- Automatic reconnection after 3 seconds
- Messages queued during disconnection are lost
- User sees "Connection lost" indicator

### Claude CLI Failure

**Trigger:** Claude CLI not installed, invalid arguments

**Handling:**
- `claudeProcess.on('error')` catches spawn errors
- WebSocket sends `'claude-error'` message
- Error displayed in chat as red message
- Session marked as inactive
- User can try again

---

## Conclusion

These three examples demonstrate the core architectural patterns of Claude Code UI:

1. **Optimistic Updates + Event-Driven Architecture** - UI responds instantly, backend confirms later
2. **Session Protection** - Sophisticated state tracking prevents unwanted interruptions
3. **Streaming + Progressive Enhancement** - Real-time feedback with graceful degradation
4. **JSONL Storage + Stateless Backend** - Simple, reliable session persistence
5. **WebSocket Bidirectional Communication** - Low-latency updates between client and server

The codebase is designed around these principles to provide a responsive, reliable interface for AI-powered coding.
