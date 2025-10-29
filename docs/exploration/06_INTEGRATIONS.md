# 06_INTEGRATIONS.md - External Services and CLI Integrations

## Overview

Claude Code UI integrates with multiple external services and CLI tools. This document explains how each integration works, including command-line arguments, output parsing, and error handling.

---

## 1. Claude CLI Integration

### Overview

Claude Code UI spawns the `claude` CLI as a child process to interact with Anthropic's Claude AI.

**Module:** `server/claude-cli.js`

### CLI Path Resolution

```javascript
const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
```

**Environment Variable:** `CLAUDE_CLI_PATH` (optional)
- Defaults to `claude` (assumes it's in PATH)
- Can be set to custom path: `/usr/local/bin/claude`

### Command Building

#### Basic Structure

```javascript
const args = [
  '--output-format', 'stream-json',  // JSON streaming output
  '--verbose',                       // Verbose logging
  '--model', 'sonnet'                // Model selection
];
```

#### Resume Existing Session

```javascript
if (resume && sessionId) {
  args.push('--resume', sessionId);
}
```

#### Permission Mode

```javascript
if (permissionMode && permissionMode !== 'default') {
  args.push('--permission-mode', permissionMode);
}
// Options: 'default', 'plan', 'always-allow'
```

#### Tools Settings

```javascript
if (settings.skipPermissions && permissionMode !== 'plan') {
  args.push('--dangerously-skip-permissions');
} else {
  // Add allowed tools
  for (const tool of settings.allowedTools) {
    args.push('--allowedTools', tool);
  }

  // Add disallowed tools
  for (const tool of settings.disallowedTools) {
    args.push('--disallowedTools', tool);
  }
}
```

**Plan Mode Tools:**
When `permissionMode === 'plan'`, automatically add:
- `Read`
- `Task`
- `exit_plan_mode`
- `TodoRead`
- `TodoWrite`

#### MCP Configuration

```javascript
// Check for MCP servers in ~/.claude.json
const claudeConfigPath = path.join(os.homedir(), '.claude.json');

if (fsSync.existsSync(claudeConfigPath)) {
  const claudeConfig = JSON.parse(fsSync.readFileSync(claudeConfigPath, 'utf8'));

  // Check global MCP servers
  const hasGlobalServers = claudeConfig.mcpServers && Object.keys(claudeConfig.mcpServers).length > 0;

  // Check project-specific MCP servers
  const projectConfig = claudeConfig.claudeProjects?.[process.cwd()];
  const hasProjectServers = projectConfig?.mcpServers && Object.keys(projectConfig.mcpServers).length > 0;

  if (hasGlobalServers || hasProjectServers) {
    args.push('--mcp-config', claudeConfigPath);
  }
}
```

#### Command/Prompt

```javascript
if (command && command.trim()) {
  args.push('--print');
  args.push('--');  // Treat everything after as text
  args.push(command);
}
```

### Image Handling

**Workflow:**

1. **Receive Base64 Images:**
```javascript
const images = [
  {
    name: 'screenshot.png',
    data: 'data:image/png;base64,iVBORw0KGgo...',
    size: 1024,
    mimeType: 'image/png'
  }
];
```

2. **Save to Temporary Files:**
```javascript
const tempDir = path.join(workingDir, '.tmp', 'images', Date.now().toString());
await fs.mkdir(tempDir, { recursive: true });

for (const [index, image] of images.entries()) {
  // Extract base64 data and mime type
  const matches = image.data.match(/^data:([^;]+);base64,(.+)$/);
  const [, mimeType, base64Data] = matches;

  const extension = mimeType.split('/')[1] || 'png';
  const filename = `image_${index}.${extension}`;
  const filepath = path.join(tempDir, filename);

  // Write base64 data to file
  await fs.writeFile(filepath, Buffer.from(base64Data, 'base64'));
  tempImagePaths.push(filepath);
}
```

3. **Include Paths in Prompt:**
```javascript
const imageNote = `\n\n[Images provided at the following paths:]\n${tempImagePaths.map((p, i) => `${i + 1}. ${p}`).join('\n')}`;
const modifiedCommand = command + imageNote;
```

4. **Clean Up After Process Exits:**
```javascript
claudeProcess.on('close', async (code) => {
  if (claudeProcess.tempImagePaths && claudeProcess.tempImagePaths.length > 0) {
    for (const imagePath of claudeProcess.tempImagePaths) {
      await fs.unlink(imagePath).catch(err =>
        console.error(`Failed to delete temp image ${imagePath}:`, err)
      );
    }
    if (claudeProcess.tempDir) {
      await fs.rm(claudeProcess.tempDir, { recursive: true, force: true });
    }
  }
});
```

### Process Spawning

```javascript
const claudeProcess = spawn(claudePath, args, {
  cwd: workingDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

// Store process for potential abort
activeClaudeProcesses.set(sessionId, claudeProcess);
```

### Output Parsing

**Stream JSON Format:**

Claude CLI outputs JSON objects, one per line:

```javascript
claudeProcess.stdout.on('data', (data) => {
  const rawOutput = data.toString();
  const lines = rawOutput.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const response = JSON.parse(line);

      // Capture session ID
      if (response.session_id && !capturedSessionId) {
        capturedSessionId = response.session_id;

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
```

**Message Types:**

1. **Content Block Delta:**
```json
{
  "type": "content_block_delta",
  "delta": {
    "type": "text_delta",
    "text": "streaming text..."
  }
}
```

2. **Content Block Stop:**
```json
{
  "type": "content_block_stop"
}
```

3. **Tool Use:**
```json
{
  "type": "tool_use",
  "id": "tool-123",
  "name": "Read",
  "input": {
    "file_path": "/path/to/file.js"
  }
}
```

4. **Conversation Event:**
```json
{
  "type": "conversation_event",
  "session_id": "session-123"
}
```

### Error Handling

```javascript
claudeProcess.stderr.on('data', (data) => {
  console.error('Claude CLI stderr:', data.toString());
  ws.send(JSON.stringify({
    type: 'claude-error',
    error: data.toString()
  }));
});

claudeProcess.on('error', (error) => {
  console.error('Claude CLI process error:', error);
  ws.send(JSON.stringify({
    type: 'claude-error',
    error: error.message
  }));
});
```

### Process Cleanup

```javascript
claudeProcess.on('close', (code) => {
  console.log(`Claude CLI process exited with code ${code}`);

  // Clean up process reference
  activeClaudeProcesses.delete(sessionId);

  // Clean up temporary files
  // ... (see Image Handling section)

  ws.send(JSON.stringify({
    type: 'claude-complete',
    exitCode: code,
    isNewSession: !sessionId && !!command
  }));
});
```

### Abort Mechanism

```javascript
function abortClaudeSession(sessionId) {
  const process = activeClaudeProcesses.get(sessionId);
  if (process) {
    console.log(`🛑 Aborting Claude session: ${sessionId}`);
    process.kill('SIGTERM');
    activeClaudeProcesses.delete(sessionId);
    return true;
  }
  return false;
}
```

---

## 2. Cursor CLI Integration

### Overview

Claude Code UI spawns the `cursor-agent` CLI as a child process to interact with Cursor's AI.

**Module:** `server/cursor-cli.js`

### Command Building

#### Basic Structure

```javascript
const args = [];

// Resume existing session
if (sessionId) {
  args.push('--resume=' + sessionId);
}

// Provide prompt
if (command && command.trim()) {
  args.push('-p', command);

  // Model selection (only for new sessions)
  if (!sessionId && model) {
    args.push('--model', model);
  }

  // Request streaming JSON
  args.push('--output-format', 'stream-json');
}

// Skip permissions
if (skipPermissions || settings.skipPermissions) {
  args.push('-f');
}
```

### Process Spawning

```javascript
const cursorProcess = spawn('cursor-agent', args, {
  cwd: workingDir,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env }
});

// Store process for potential abort
activeCursorProcesses.set(sessionId, cursorProcess);
```

### Output Parsing

**Stream JSON Format:**

Cursor CLI outputs different message types:

```javascript
cursorProcess.stdout.on('data', (data) => {
  const rawOutput = data.toString();
  const lines = rawOutput.split('\n').filter(line => line.trim());

  for (const line of lines) {
    try {
      const response = JSON.parse(line);

      switch (response.type) {
        case 'system':
          if (response.subtype === 'init') {
            // Capture session ID
            if (response.session_id && !capturedSessionId) {
              capturedSessionId = response.session_id;

              ws.send(JSON.stringify({
                type: 'session-created',
                sessionId: capturedSessionId,
                model: response.model,
                cwd: response.cwd
              }));
            }

            // Forward system info
            ws.send(JSON.stringify({
              type: 'cursor-system',
              data: response
            }));
          }
          break;

        case 'user':
          ws.send(JSON.stringify({
            type: 'cursor-user',
            data: response
          }));
          break;

        case 'assistant':
          // Accumulate assistant message chunks
          if (response.message?.content?.length > 0) {
            const textContent = response.message.content[0].text;
            messageBuffer += textContent;

            // Send as Claude-compatible format
            ws.send(JSON.stringify({
              type: 'claude-response',
              data: {
                type: 'content_block_delta',
                delta: {
                  type: 'text_delta',
                  text: textContent
                }
              }
            }));
          }
          break;

        case 'result':
          // Session complete
          if (messageBuffer) {
            ws.send(JSON.stringify({
              type: 'claude-response',
              data: {
                type: 'content_block_stop'
              }
            }));
          }

          ws.send(JSON.stringify({
            type: 'cursor-result',
            data: response,
            success: response.subtype === 'success'
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'cursor-response',
            data: response
          }));
      }
    } catch (parseError) {
      // Forward non-JSON output
      ws.send(JSON.stringify({
        type: 'cursor-output',
        data: line
      }));
    }
  }
});
```

### Message Types

1. **System Init:**
```json
{
  "type": "system",
  "subtype": "init",
  "session_id": "cursor-session-456",
  "model": "gpt-5",
  "cwd": "/Users/username/myproject"
}
```

2. **User Message:**
```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Add authentication"
  }
}
```

3. **Assistant Message:**
```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I'll help you add authentication..."
      }
    ]
  }
}
```

4. **Result:**
```json
{
  "type": "result",
  "subtype": "success"
}
```

### Abort Mechanism

```javascript
function abortCursorSession(sessionId) {
  const process = activeCursorProcesses.get(sessionId);
  if (process) {
    console.log(`🛑 Aborting Cursor session: ${sessionId}`);
    process.kill('SIGTERM');
    activeCursorProcesses.delete(sessionId);
    return true;
  }
  return false;
}
```

---

## 3. MCP (Model Context Protocol) Servers

### Overview

MCP servers provide additional capabilities to Claude CLI. Claude Code UI can manage MCP servers through the Claude CLI or by directly editing configuration files.

### Detection

**Module:** `server/utils/mcp-detector.js`

```javascript
async function detectTaskMasterMCPServer() {
  const claudeConfigPath = path.join(os.homedir(), '.claude.json');

  try {
    const configContent = await fs.readFile(claudeConfigPath, 'utf8');
    const config = JSON.parse(configContent);

    if (config.mcpServers && config.mcpServers['taskmaster']) {
      return {
        hasMCPServer: true,
        isConfigured: true,
        configPath: claudeConfigPath,
        serverConfig: config.mcpServers['taskmaster']
      };
    }

    return {
      hasMCPServer: false,
      reason: 'TaskMaster MCP server not found in configuration'
    };
  } catch (error) {
    return {
      hasMCPServer: false,
      reason: `Error reading configuration: ${error.message}`
    };
  }
}
```

### Adding MCP Server via CLI

**Endpoint:** `POST /api/mcp/cli/add`

```javascript
const args = ['mcp', 'add'];

// Add scope flag
args.push('--scope', scope); // 'user' or 'local'

if (type === 'http') {
  args.push('--transport', 'http', name, url);
  // Add headers
  Object.entries(headers).forEach(([key, value]) => {
    args.push('--header', `${key}: ${value}`);
  });
} else if (type === 'sse') {
  args.push('--transport', 'sse', name, url);
} else {
  // stdio (default)
  args.push(name);
  // Add environment variables
  Object.entries(env).forEach(([key, value]) => {
    args.push('-e', `${key}=${value}`);
  });
  args.push(command);
  if (args && args.length > 0) {
    args.push(...args);
  }
}

// For local scope, run in project directory
const spawnOptions = {
  stdio: ['pipe', 'pipe', 'pipe']
};

if (scope === 'local' && projectPath) {
  spawnOptions.cwd = projectPath;
}

const process = spawn('claude', args, spawnOptions);
```

### Configuration Format

**File:** `~/.claude.json` or `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "taskmaster": {
      "command": "npx",
      "args": ["-y", "@taskmaster/mcp-server"],
      "env": {
        "API_KEY": "secret"
      }
    },
    "http-server": {
      "url": "http://localhost:3000",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  },
  "claudeProjects": {
    "/Users/username/myproject": {
      "mcpServers": {
        "local-server": {
          "command": "node",
          "args": ["server.js"]
        }
      }
    }
  }
}
```

### Reading Configuration

**Endpoint:** `GET /api/mcp/config/read`

```javascript
const configPaths = [
  path.join(homeDir, '.claude.json'),
  path.join(homeDir, '.claude', 'settings.json')
];

for (const filepath of configPaths) {
  try {
    const fileContent = await fs.readFile(filepath, 'utf8');
    configData = JSON.parse(fileContent);
    break;
  } catch (error) {
    // Try next path
  }
}

// Extract MCP servers
const servers = [];

// User-scoped MCP servers (global)
if (configData.mcpServers) {
  for (const [name, config] of Object.entries(configData.mcpServers)) {
    servers.push({
      id: name,
      name: name,
      type: config.command ? 'stdio' : (config.transport || 'http'),
      scope: 'user',
      config: {
        command: config.command,
        args: config.args || [],
        env: config.env || {},
        url: config.url,
        headers: config.headers || {}
      },
      raw: config
    });
  }
}

// Local-scoped MCP servers (project-specific)
const currentProjectPath = process.cwd();
if (configData.projects?.[currentProjectPath]?.mcpServers) {
  for (const [name, config] of Object.entries(configData.projects[currentProjectPath].mcpServers)) {
    servers.push({
      id: `local:${name}`,
      name: name,
      type: config.command ? 'stdio' : (config.transport || 'http'),
      scope: 'local',
      projectPath: currentProjectPath,
      config: { /* ... */ },
      raw: config
    });
  }
}
```

---

## 4. OpenAI Whisper API (Voice Transcription)

### Overview

Optional integration for voice input support.

**Endpoint:** `POST /api/transcribe`

### Configuration

**Environment Variable:** `OPENAI_API_KEY` (required)

```bash
export OPENAI_API_KEY="sk-..."
```

### Transcription Workflow

1. **Client sends audio file:**
```javascript
const formData = new FormData();
formData.append('audio', audioBlob, 'recording.webm');
formData.append('mode', 'default'); // or 'prompt', 'vibe', 'instructions', 'architect'

const response = await fetch('/api/transcribe', {
  method: 'POST',
  body: formData
});
```

2. **Server transcribes with Whisper:**
```javascript
const FormData = (await import('form-data')).default;
const formData = new FormData();
formData.append('file', req.file.buffer, {
  filename: req.file.originalname,
  contentType: req.file.mimetype
});
formData.append('model', 'whisper-1');
formData.append('response_format', 'json');
formData.append('language', 'en');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    ...formData.getHeaders()
  },
  body: formData
});

const data = await response.json();
let transcribedText = data.text || '';
```

3. **Optional Enhancement with GPT-4:**

If mode is not 'default', enhance the transcription:

```javascript
const mode = req.body.mode || 'default';

if (mode === 'prompt') {
  systemMessage = 'You are an expert prompt engineer who creates clear, detailed, and effective prompts.';
  prompt = `Transform the following rough instruction into a clear, detailed, and context-aware AI prompt...`;
}

if (mode === 'vibe' || mode === 'instructions' || mode === 'architect') {
  systemMessage = 'You are a helpful assistant that formats ideas into clear, actionable instructions for AI agents.';
  prompt = `Transform the following idea into clear, well-structured instructions...`;
  temperature = 0.5;
}

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: systemMessage },
    { role: 'user', content: prompt }
  ],
  temperature: temperature,
  max_tokens: 800
});

transcribedText = completion.choices[0].message.content || transcribedText;
```

4. **Return enhanced text:**
```json
{
  "text": "Create a React component with TypeScript that displays a user profile card..."
}
```

---

## 5. TaskMaster AI (Project Management)

### Overview

Optional integration for AI-powered project management.

**Modules:**
- `server/routes/taskmaster.js` - API endpoints
- `server/utils/mcp-detector.js` - MCP detection
- `server/utils/taskmaster-websocket.js` - WebSocket broadcasting

### Installation Check

```javascript
async function checkTaskMasterInstallation() {
  return new Promise((resolve) => {
    const child = spawn('which', ['task-master'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });

    let output = '';

    child.stdout.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        // TaskMaster is installed, get version
        const versionChild = spawn('task-master', ['--version'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: true
        });

        let versionOutput = '';

        versionChild.stdout.on('data', (data) => {
          versionOutput += data.toString();
        });

        versionChild.on('close', (versionCode) => {
          resolve({
            isInstalled: true,
            installPath: output.trim(),
            version: versionCode === 0 ? versionOutput.trim() : 'unknown',
            reason: null
          });
        });
      } else {
        resolve({
          isInstalled: false,
          installPath: null,
          version: null,
          reason: 'TaskMaster CLI not found in PATH'
        });
      }
    });
  });
}
```

### Folder Detection

```javascript
async function detectTaskMasterFolder(projectPath) {
  const taskMasterPath = path.join(projectPath, '.taskmaster');

  // Check if directory exists
  try {
    const stats = await fs.stat(taskMasterPath);
    if (!stats.isDirectory()) {
      return {
        hasTaskmaster: false,
        reason: '.taskmaster exists but is not a directory'
      };
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        hasTaskmaster: false,
        reason: '.taskmaster directory not found'
      };
    }
    throw error;
  }

  // Check for key files
  const keyFiles = [
    'tasks/tasks.json',
    'config.json'
  ];

  const fileStatus = {};
  let hasEssentialFiles = true;

  for (const file of keyFiles) {
    const filePath = path.join(taskMasterPath, file);
    try {
      await fs.access(filePath, fs.constants.R_OK);
      fileStatus[file] = true;
    } catch (error) {
      fileStatus[file] = false;
      if (file === 'tasks/tasks.json') {
        hasEssentialFiles = false;
      }
    }
  }

  return {
    hasTaskmaster: true,
    hasEssentialFiles,
    files: fileStatus,
    path: taskMasterPath
  };
}
```

### CLI Commands

#### Initialize TaskMaster

```javascript
const initProcess = spawn('npx', ['task-master', 'init'], {
  cwd: projectPath,
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send 'yes' to automated prompts
initProcess.stdin.write('yes\n');
initProcess.stdin.end();
```

#### Add Task

```javascript
const args = ['task-master-ai', 'add-task'];

if (prompt) {
  args.push('--prompt', prompt);
  args.push('--research');
}

if (priority) {
  args.push('--priority', priority);
}

if (dependencies) {
  args.push('--dependencies', dependencies);
}

const addTaskProcess = spawn('npx', args, {
  cwd: projectPath,
  stdio: ['pipe', 'pipe', 'pipe']
});
```

#### Update Task Status

```javascript
const setStatusProcess = spawn('npx', [
  'task-master-ai',
  'set-status',
  `--id=${taskId}`,
  `--status=${status}`
], {
  cwd: projectPath,
  stdio: ['pipe', 'pipe', 'pipe']
});
```

#### Parse PRD

```javascript
const args = ['task-master-ai', 'parse-prd', prdPath];

if (numTasks) {
  args.push('--num-tasks', numTasks.toString());
}

if (append) {
  args.push('--append');
}

args.push('--research');

const parsePRDProcess = spawn('npx', args, {
  cwd: projectPath,
  stdio: ['pipe', 'pipe', 'pipe']
});
```

### WebSocket Broadcasting

**Module:** `server/utils/taskmaster-websocket.js`

```javascript
export function broadcastTaskMasterProjectUpdate(wss, projectName, taskMasterData) {
  const message = JSON.stringify({
    type: 'taskmaster_project_updated',
    projectName,
    taskmaster: taskMasterData,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

export function broadcastTaskMasterTasksUpdate(wss, projectName) {
  const message = JSON.stringify({
    type: 'taskmaster_tasks_updated',
    projectName,
    timestamp: new Date().toISOString()
  });

  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}
```

---

## 6. GitHub API (Version Checking)

### Overview

Checks for new releases on GitHub to notify users of updates.

**Module:** `src/hooks/useVersionCheck.js`

### API Call

```javascript
const checkForUpdates = async () => {
  try {
    const response = await fetch('https://api.github.com/repos/owner/claudecodeui/releases/latest');
    const data = await response.json();

    const latestVersion = data.tag_name.replace('v', '');
    const currentVersion = packageJson.version;

    if (isNewerVersion(latestVersion, currentVersion)) {
      setHasUpdate(true);
      setLatestVersion(latestVersion);
      setReleaseUrl(data.html_url);
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
  }
};
```

### Version Comparison

```javascript
function isNewerVersion(latest, current) {
  const latestParts = latest.split('.').map(Number);
  const currentParts = current.split('.').map(Number);

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}
```

---

## Summary

Claude Code UI integrates with:

1. **Claude CLI**:
   - Spawns as child process
   - Streams JSON output
   - Handles images, tools, MCP servers
   - Session management (create/resume/abort)

2. **Cursor CLI**:
   - Similar to Claude but simpler
   - Different message format
   - Model selection support

3. **MCP Servers**:
   - Auto-detected from config files
   - Managed via Claude CLI
   - Supports stdio, HTTP, SSE transports

4. **OpenAI Whisper API**:
   - Optional voice transcription
   - GPT-4 enhancement modes
   - Falls back to basic transcription on error

5. **TaskMaster AI**:
   - Optional project management
   - CLI-based task operations
   - WebSocket updates for real-time sync

6. **GitHub API**:
   - Version checking
   - Update notifications
   - Release notes linking

All integrations follow similar patterns:
- Graceful failure when unavailable
- Clear error messages
- Fallback mechanisms
- Environment-based configuration
