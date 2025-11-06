# 08_CONFIG.md - Environment Variables and Configuration

This document describes all configuration options, environment variables, and configuration files used in Claude Code UI.

## Table of Contents

- [Environment Variables (.env)](#environment-variables-env)
- [Project Configuration (~/.claude/project-config.json)](#project-configuration-claudeproject-configjson)
- [Claude Configuration (~/.claude.json)](#claude-configuration-claudejson)
- [Tools Settings (localStorage)](#tools-settings-localstorage)
- [User Preferences (localStorage)](#user-preferences-localstorage)
- [PWA Manifest Configuration](#pwa-manifest-configuration)
- [Vite Configuration](#vite-configuration)
- [Tailwind Configuration](#tailwind-configuration)

---

## Environment Variables (.env)

Environment variables are loaded from `.env` file in the project root. Use `.env.example` as a template.

### File Location
```
/Users/yourname/git/claudecodeui/.env
```

### Available Variables

#### PORT
**Purpose:** Backend server port for Express API and WebSocket server
**Default:** `3001`
**Used in:** `server/index.js`

```bash
PORT=3001
```

**Usage Example:**
```javascript
// server/index.js
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Claude Code UI server running on http://0.0.0.0:${PORT}`);
});
```

#### VITE_PORT
**Purpose:** Frontend development server port
**Default:** `5173`
**Used in:** `vite.config.js`

```bash
VITE_PORT=5173
```

**Usage Example:**
```javascript
// vite.config.js
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    server: {
      port: parseInt(env.VITE_PORT) || 5173
    }
  }
});
```

#### CLAUDE_CLI_PATH
**Purpose:** Custom path to Claude CLI executable
**Default:** `claude` (uses PATH)
**Used in:** `server/claude-cli.js`
**Optional:** Yes

```bash
# Use default (finds 'claude' in PATH)
# CLAUDE_CLI_PATH=claude

# Use custom path
CLAUDE_CLI_PATH=/usr/local/bin/claude

# Use relative path
CLAUDE_CLI_PATH=./bin/claude
```

**Usage Example:**
```javascript
// server/claude-cli.js
const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
console.log('Using Claude CLI path:', claudePath);

const claudeProcess = spawn(claudePath, args, { cwd: workingDir });
```

#### OPENAI_API_KEY
**Purpose:** OpenAI API key for Whisper transcription (voice input)
**Used in:** `server/index.js` (transcription endpoint)
**Optional:** Yes (voice input will not work without it)

```bash
OPENAI_API_KEY=sk-proj-...your-api-key...
```

**Usage Example:**
```javascript
// server/index.js - Transcription endpoint
app.post('/api/transcribe', authenticateToken, async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.'
    });
  }

  // Use Whisper API for transcription
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      ...formData.getHeaders()
    },
    body: formData
  });
});
```

#### API_KEY
**Purpose:** Optional server-side API key for additional security
**Used in:** `server/middleware/auth.js`
**Optional:** Yes (authentication still uses JWT)

```bash
# Leave blank for no API key requirement
API_KEY=

# Or set a secret key
API_KEY=your-secret-api-key-here
```

**Usage Example:**
```javascript
// server/middleware/auth.js
const validateApiKey = (req, res, next) => {
  // Skip if not configured
  if (!process.env.API_KEY) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// Applied to all /api routes
app.use('/api', validateApiKey);
```

#### JWT_SECRET
**Purpose:** Secret key for signing JWT authentication tokens
**Default:** `claude-ui-dev-secret-change-in-production`
**Used in:** `server/middleware/auth.js`
**Security:** MUST be changed in production

```bash
# Development (default if not set)
# JWT_SECRET=claude-ui-dev-secret-change-in-production

# Production (REQUIRED)
JWT_SECRET=your-super-secret-random-string-here-use-openssl-rand-base64-32
```

**Usage Example:**
```javascript
// server/middleware/auth.js
const JWT_SECRET = process.env.JWT_SECRET || 'claude-ui-dev-secret-change-in-production';

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username
    },
    JWT_SECRET
    // No expiration - token lasts forever
  );
};

const authenticateToken = async (req, res, next) => {
  const token = authHeader && authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = userDb.getUserById(decoded.userId);
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};
```

### Environment File Examples

#### Development (.env)
```bash
# Development environment configuration
PORT=3001
VITE_PORT=5173

# Use default Claude CLI path
# CLAUDE_CLI_PATH=claude

# Optional: Enable voice input
# OPENAI_API_KEY=sk-proj-...

# Development JWT secret (OK for local dev)
# JWT_SECRET will use default

# No API key required
# API_KEY=
```

#### Production (.env)
```bash
# Production environment configuration
PORT=3001
VITE_PORT=5173

# Custom Claude CLI path (if needed)
CLAUDE_CLI_PATH=/opt/claude/bin/claude

# Production features
OPENAI_API_KEY=sk-proj-...your-production-key...

# CRITICAL: Change this in production!
JWT_SECRET=a1b2c3d4e5f6...your-long-random-secret...

# Optional API key for additional security
API_KEY=your-production-api-key
```

### Loading Environment Variables

The server loads environment variables manually in `server/index.js`:

```javascript
// server/index.js
import fs from 'fs';
import path from 'path';

// Load .env file
try {
  const envPath = path.join(__dirname, '../.env');
  const envFile = fs.readFileSync(envPath, 'utf8');

  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0 && !process.env[key]) {
        process.env[key] = valueParts.join('=').trim();
      }
    }
  });
} catch (e) {
  console.log('No .env file found or error reading it:', e.message);
}
```

---

## Project Configuration (~/.claude/project-config.json)

User-specific configuration for projects, stored in home directory.

### File Location
```
~/.claude/project-config.json
/Users/yourname/.claude/project-config.json  (macOS)
/home/yourname/.claude/project-config.json   (Linux)
C:\Users\yourname\.claude\project-config.json (Windows)
```

### Structure

```json
{
  "Users-yourname-myproject": {
    "displayName": "My Awesome Project",
    "manuallyAdded": true,
    "originalPath": "/Users/yourname/myproject"
  },
  "Users-yourname-another-project": {
    "displayName": "Custom Name",
    "manuallyAdded": false
  }
}
```

### Fields

#### Project Key
- **Format:** Encoded project path with `/` replaced by `-`
- **Example:** `/Users/name/project` → `Users-name-project`
- **Purpose:** Matches Claude's project directory naming scheme

#### displayName (optional)
- **Type:** String
- **Purpose:** Custom display name shown in UI sidebar
- **Fallback:** Auto-generated from package.json or directory name

```javascript
// server/projects.js - Generate display name
async function generateDisplayName(projectName, actualProjectDir) {
  // Try to read package.json
  try {
    const packageJsonPath = path.join(actualProjectDir, 'package.json');
    const packageData = await fs.readFile(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageData);

    if (packageJson.name) {
      return packageJson.name;  // Use package.json name
    }
  } catch (error) {
    // Fall back to path-based naming
  }

  // Return last folder name
  const parts = actualProjectDir.split('/').filter(Boolean);
  return parts[parts.length - 1] || actualProjectDir;
}
```

#### manuallyAdded (optional)
- **Type:** Boolean
- **Purpose:** Indicates project was manually added by user (not discovered via Claude CLI)
- **Effect:** Allows tracking Cursor-only projects without Claude sessions

```javascript
// server/projects.js - Manual project addition
async function addProjectManually(projectPath, displayName = null) {
  const projectName = projectPath.replace(/\//g, '-');
  const config = await loadProjectConfig();

  config[projectName] = {
    manuallyAdded: true,
    originalPath: projectPath
  };

  if (displayName) {
    config[projectName].displayName = displayName;
  }

  await saveProjectConfig(config);
}
```

#### originalPath (optional)
- **Type:** String (absolute path)
- **Purpose:** Stores original absolute path for manually added projects
- **Usage:** Used when project directory doesn't exist yet in ~/.claude/projects/

### Usage

#### Reading Configuration
```javascript
// server/projects.js
async function loadProjectConfig() {
  const configPath = path.join(process.env.HOME, '.claude', 'project-config.json');
  try {
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    return {}; // Return empty config if file doesn't exist
  }
}
```

#### Saving Configuration
```javascript
// server/projects.js
async function saveProjectConfig(config) {
  const claudeDir = path.join(process.env.HOME, '.claude');
  const configPath = path.join(claudeDir, 'project-config.json');

  // Ensure directory exists
  await fs.mkdir(claudeDir, { recursive: true });

  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
}
```

#### Renaming a Project
```javascript
// API: PUT /api/projects/:projectName/rename
// Body: { displayName: "New Name" }

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
}
```

---

## Claude Configuration (~/.claude.json)

Claude CLI's configuration file for MCP servers and project-specific settings.

### File Location
```
~/.claude.json
```

### Structure

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "node",
      "args": ["/path/to/mcp-server-filesystem/dist/index.js"],
      "env": {}
    },
    "github": {
      "command": "mcp-server-github",
      "args": [],
      "env": {
        "GITHUB_TOKEN": "your-token-here"
      }
    }
  },
  "claudeProjects": {
    "/Users/yourname/project1": {
      "mcpServers": {
        "project-specific-server": {
          "command": "node",
          "args": ["/path/to/server.js"]
        }
      }
    }
  }
}
```

### Fields

#### mcpServers (global)
- **Type:** Object
- **Purpose:** MCP (Model Context Protocol) servers available globally
- **Structure:** Each key is server name, value is server configuration

**Server Configuration:**
- `command`: Executable command (e.g., "node", "npx", "python")
- `args`: Array of command arguments
- `env`: Environment variables for the server process

#### claudeProjects (project-specific)
- **Type:** Object
- **Purpose:** Project-specific MCP servers and settings
- **Key:** Absolute project path
- **Value:** Project configuration with `mcpServers` object

### Usage in Claude Code UI

#### MCP Detection and Configuration

```javascript
// server/claude-cli.js - MCP config detection
let hasMcpServers = false;
const claudeConfigPath = path.join(os.homedir(), '.claude.json');

if (fs.existsSync(claudeConfigPath)) {
  try {
    const claudeConfig = JSON.parse(fs.readFileSync(claudeConfigPath, 'utf8'));

    // Check global MCP servers
    if (claudeConfig.mcpServers && Object.keys(claudeConfig.mcpServers).length > 0) {
      console.log(`✅ Found ${Object.keys(claudeConfig.mcpServers).length} global MCP servers`);
      hasMcpServers = true;
    }

    // Check project-specific MCP servers
    if (!hasMcpServers && claudeConfig.claudeProjects) {
      const currentProjectPath = process.cwd();
      const projectConfig = claudeConfig.claudeProjects[currentProjectPath];

      if (projectConfig && projectConfig.mcpServers &&
          Object.keys(projectConfig.mcpServers).length > 0) {
        console.log(`✅ Found ${Object.keys(projectConfig.mcpServers).length} project MCP servers`);
        hasMcpServers = true;
      }
    }
  } catch (e) {
    console.log(`❌ Failed to parse Claude config:`, e.message);
  }
}

// Add --mcp-config flag if MCP servers found
if (hasMcpServers) {
  args.push('--mcp-config', claudeConfigPath);
  console.log('📡 Adding MCP config:', claudeConfigPath);
}
```

#### MCP Server Management UI

Claude Code UI provides a UI for managing MCP servers in Settings panel:

```jsx
// Settings.jsx - MCP Configuration
const [mcpServers, setMcpServers] = useState([]);

useEffect(() => {
  // Fetch MCP servers
  fetch('/api/mcp/servers')
    .then(res => res.json())
    .then(data => setMcpServers(data.servers || []));
}, []);

// Add new MCP server
const addMcpServer = async (serverConfig) => {
  await fetch('/api/mcp/servers', {
    method: 'POST',
    body: JSON.stringify(serverConfig)
  });
};

// Remove MCP server
const removeMcpServer = async (serverName) => {
  await fetch(`/api/mcp/servers/${serverName}`, {
    method: 'DELETE'
  });
};
```

### Example Configurations

#### Basic MCP Setup
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname/Documents"],
      "env": {}
    }
  }
}
```

#### Advanced MCP with Multiple Servers
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname"],
      "env": {}
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"],
      "env": {
        "PGPASSWORD": "secret"
      }
    }
  }
}
```

#### Project-Specific MCP
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/yourname"]
    }
  },
  "claudeProjects": {
    "/Users/yourname/work/special-project": {
      "mcpServers": {
        "custom-api": {
          "command": "node",
          "args": ["/Users/yourname/mcp-servers/custom-api-server.js"],
          "env": {
            "API_KEY": "special-key",
            "API_URL": "https://api.example.com"
          }
        }
      }
    }
  }
}
```

---

## Tools Settings (localStorage)

User preferences for Claude Code tool permissions stored in browser localStorage.

### Storage Keys

All tools settings are stored under the `tools-settings` key:

```javascript
localStorage.setItem('tools-settings', JSON.stringify({
  allowedTools: ['Read', 'Glob', 'Grep'],
  disallowedTools: ['Bash', 'Write'],
  skipPermissions: false
}));
```

### Structure

```typescript
interface ToolsSettings {
  allowedTools: string[];       // Tools explicitly allowed
  disallowedTools: string[];    // Tools explicitly disallowed
  skipPermissions: boolean;     // Skip all permission checks (dangerous)
}
```

### Available Tools

Claude Code supports these tools:

```javascript
const AVAILABLE_TOOLS = [
  'Bash',           // Execute shell commands
  'Read',           // Read files
  'Write',          // Write/create files
  'Edit',           // Edit files (find-replace)
  'Glob',           // Search for files by pattern
  'Grep',           // Search file contents
  'WebFetch',       // Fetch web content
  'WebSearch',      // Web search
  'Task',           // Complex multi-step tasks
  'TodoWrite',      // Todo list management
  'TodoRead',       // Read todo list
  'NotebookEdit',   // Edit Jupyter notebooks
  'SlashCommand',   // Execute slash commands
  'BashOutput',     // Read background bash output
  'KillShell'       // Kill background shells
];
```

### Usage

#### Reading Tools Settings
```jsx
// Settings.jsx
const [toolsSettings, setToolsSettings] = useState(() => {
  const stored = localStorage.getItem('tools-settings');
  return stored ? JSON.parse(stored) : {
    allowedTools: [],
    disallowedTools: [],
    skipPermissions: false
  };
});
```

#### Saving Tools Settings
```jsx
// Settings.jsx
const saveToolsSettings = (newSettings) => {
  localStorage.setItem('tools-settings', JSON.stringify(newSettings));
  setToolsSettings(newSettings);
};
```

#### Sending to Server
```jsx
// ChatInterface.jsx - Include in message options
const messageData = {
  type: 'claude-command',
  command: input,
  options: {
    sessionId: session?.id,
    toolsSettings: {
      allowedTools: allowedTools,
      disallowedTools: disallowedTools,
      skipPermissions: skipPermissions
    }
  }
};
```

#### Server-Side Application
```javascript
// server/claude-cli.js - Apply tools settings
const args = [];

if (settings.skipPermissions && permissionMode !== 'plan') {
  // Dangerous mode - skip all permissions
  args.push('--dangerously-skip-permissions');
  console.log('⚠️  Using --dangerously-skip-permissions');
} else {
  // Add allowed tools
  if (settings.allowedTools && settings.allowedTools.length > 0) {
    for (const tool of settings.allowedTools) {
      args.push('--allowedTools', tool);
      console.log('✅ Allowing tool:', tool);
    }
  }

  // Add disallowed tools
  if (settings.disallowedTools && settings.disallowedTools.length > 0) {
    for (const tool of settings.disallowedTools) {
      args.push('--disallowedTools', tool);
      console.log('❌ Disallowing tool:', tool);
    }
  }
}
```

### Permission Modes

In addition to tool settings, Claude Code supports permission modes:

```javascript
const PERMISSION_MODES = {
  default: 'Default (prompt for each tool)',
  plan: 'Plan mode (read-only, auto-approve safe tools)',
  approve_all: 'Approve all (auto-approve all tools)'
};
```

Stored separately:
```javascript
localStorage.setItem('permission-mode', 'plan');
```

---

## User Preferences (localStorage)

Various user preferences stored in browser localStorage for UI customization.

### Available Preferences

#### auto-expand-tools
**Purpose:** Automatically expand tool call details when they appear
**Type:** Boolean
**Default:** `false`

```javascript
localStorage.setItem('autoExpandTools', 'true');

// Usage in ChatInterface
const [autoExpandTools, setAutoExpandTools] = useLocalStorage('autoExpandTools', false);
```

#### show-raw-parameters
**Purpose:** Show raw JSON parameters in tool calls
**Type:** Boolean
**Default:** `false`

```javascript
localStorage.setItem('showRawParameters', 'true');
```

#### auto-scroll-to-bottom
**Purpose:** Automatically scroll chat to bottom when new messages arrive
**Type:** Boolean
**Default:** `true`

```javascript
localStorage.setItem('autoScrollToBottom', 'true');
```

#### send-by-ctrl-enter
**Purpose:** Send messages with Ctrl+Enter instead of just Enter
**Type:** Boolean
**Default:** `false`

```javascript
localStorage.setItem('sendByCtrlEnter', 'false');
```

#### selected-provider
**Purpose:** Currently selected AI provider (Claude or Cursor)
**Type:** String (`'claude'` or `'cursor'`)
**Default:** `'claude'`

```javascript
localStorage.setItem('selected-provider', 'cursor');
```

#### theme
**Purpose:** UI theme (light or dark mode)
**Type:** String (`'light'` or `'dark'`)
**Default:** System preference or `'light'`

```javascript
// ThemeContext.jsx
const getInitialTheme = () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    return savedTheme;
  }

  // Check system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
};
```

#### auth-token
**Purpose:** JWT authentication token
**Type:** String
**Security:** Sensitive - cleared on logout

```javascript
// Store token after login
localStorage.setItem('auth-token', jwtToken);

// Include in all authenticated requests
const token = localStorage.getItem('auth-token');
headers: {
  'Authorization': `Bearer ${token}`
}

// Clear on logout
localStorage.removeItem('auth-token');
```

#### Chat Message History (per session)
**Purpose:** Cache chat messages for offline access and fast loading
**Type:** JSON array
**Key format:** `chat_messages_{projectName}_{sessionId}`
**Size limit:** Last 50 messages only (auto-truncated)

```javascript
// Save chat history
const key = `chat_messages_${project.name}_${session.id}`;
safeLocalStorage.setItem(key, JSON.stringify(messages));

// Load chat history
const stored = safeLocalStorage.getItem(key);
if (stored) {
  setMessages(JSON.parse(stored));
}
```

**Safe storage with quota handling:**
```javascript
// src/components/ChatInterface.jsx
const safeLocalStorage = {
  setItem: (key, value) => {
    try {
      // Truncate chat history to last 50 messages
      if (key.startsWith('chat_messages_') && typeof value === 'string') {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 50) {
          value = JSON.stringify(parsed.slice(-50));
        }
      }

      localStorage.setItem(key, value);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        // Clear old chat messages
        const keys = Object.keys(localStorage);
        const chatKeys = keys.filter(k => k.startsWith('chat_messages_')).sort();

        // Keep only 3 most recent projects
        if (chatKeys.length > 3) {
          chatKeys.slice(0, chatKeys.length - 3).forEach(k => {
            localStorage.removeItem(k);
          });
        }
      }
    }
  }
};
```

#### Draft Input (per project)
**Purpose:** Save draft message input when switching sessions
**Type:** String
**Key format:** `draft_input_{projectName}`

```javascript
// Save draft
localStorage.setItem(`draft_input_${project.name}`, inputValue);

// Restore draft
const draft = localStorage.getItem(`draft_input_${project.name}`);
if (draft) {
  setInput(draft);
}
```

### Custom Hook for localStorage

```jsx
// src/hooks/useLocalStorage.js
import { useState, useEffect } from 'react';

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error('Error writing to localStorage:', error);
    }
  };

  return [storedValue, setValue];
}

export default useLocalStorage;
```

**Usage:**
```jsx
const [autoExpandTools, setAutoExpandTools] = useLocalStorage('autoExpandTools', false);

// Update value
setAutoExpandTools(true);  // Automatically saves to localStorage
```

---

## PWA Manifest Configuration

Progressive Web App manifest for mobile installation.

### File Location
```
/Users/yourname/git/claudecodeui/public/manifest.json
```

### Structure

```json
{
  "name": "Claude Code UI",
  "short_name": "Claude UI",
  "description": "Claude Code UI web application",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#ffffff",
  "orientation": "portrait-primary",
  "scope": "/",
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "maskable any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable any"
    }
  ]
}
```

### Fields

#### name
- **Type:** String
- **Purpose:** Full app name shown on home screen
- **Value:** "Claude Code UI"

#### short_name
- **Type:** String
- **Purpose:** Short name shown under icon when space is limited
- **Value:** "Claude UI"

#### display
- **Type:** String
- **Purpose:** Display mode for PWA
- **Value:** "standalone" (full-screen without browser UI)
- **Options:** `fullscreen`, `standalone`, `minimal-ui`, `browser`

#### orientation
- **Type:** String
- **Purpose:** Preferred screen orientation
- **Value:** "portrait-primary" (vertical orientation preferred)

#### icons
- **Type:** Array of icon objects
- **Purpose:** App icons for different screen sizes
- **Sizes:** 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512

**Icon Generation:**
Icons are generated using Sharp from a source icon:

```bash
# Install sharp (dev dependency)
npm install --save-dev sharp

# Generate icons
node public/icons/generate-icons.js
```

```javascript
// public/icons/generate-icons.js
import sharp from 'sharp';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const sourceIcon = 'icon-source.png';

for (const size of sizes) {
  await sharp(sourceIcon)
    .resize(size, size)
    .toFile(`icon-${size}x${size}.png`);
}
```

### PWA Detection

```jsx
// App.jsx - Detect PWA mode
const [isPWA, setIsPWA] = useState(false);

useEffect(() => {
  const checkPWA = () => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        window.navigator.standalone ||
                        document.referrer.includes('android-app://');
    setIsPWA(isStandalone);

    // Add class for CSS targeting
    if (isStandalone) {
      document.documentElement.classList.add('pwa-mode');
      document.body.classList.add('pwa-mode');
    }
  };

  checkPWA();
}, []);
```

### PWA-Specific Styling

```css
/* index.css - PWA safe area handling */
.pwa-mode {
  /* Account for notch/safe areas on mobile */
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.pwa-mode .mobile-nav {
  /* Position mobile nav accounting for safe area */
  padding-bottom: calc(env(safe-area-inset-bottom) + 1rem);
}
```

---

## Vite Configuration

Frontend build tool configuration.

### File Location
```
/Users/yourname/git/claudecodeui/vite.config.js
```

### Configuration

```javascript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // React plugin for JSX support
    plugins: [react()],

    // Development server configuration
    server: {
      // Port from environment or default
      port: parseInt(env.VITE_PORT) || 5173,

      // Proxy API requests to backend
      proxy: {
        '/api': `http://localhost:${env.PORT || 3001}`,
        '/ws': {
          target: `ws://localhost:${env.PORT || 3001}`,
          ws: true
        },
        '/shell': {
          target: `ws://localhost:${env.PORT || 3002}`,
          ws: true
        }
      }
    },

    // Build configuration
    build: {
      outDir: 'dist'
    }
  }
})
```

### Key Configuration Options

#### plugins
- **react:** Enables JSX transformation and React Fast Refresh

#### server.port
- **Value:** VITE_PORT from .env or 5173
- **Purpose:** Frontend dev server port

#### server.proxy
- **Purpose:** Proxy API and WebSocket requests to backend during development
- **Routes:**
  - `/api` → `http://localhost:3001` (REST API)
  - `/ws` → `ws://localhost:3001` (Chat WebSocket)
  - `/shell` → `ws://localhost:3002` (Terminal WebSocket - note different port)

#### build.outDir
- **Value:** `'dist'`
- **Purpose:** Output directory for production build

### Build Commands

```json
// package.json scripts
{
  "scripts": {
    "dev": "concurrently --kill-others \"npm run server\" \"npm run client\"",
    "client": "vite --host",
    "build": "vite build",
    "preview": "vite preview",
    "start": "npm run build && npm run server"
  }
}
```

**Usage:**
```bash
# Development (Vite dev server)
npm run client

# Production build
npm run build

# Preview production build
npm run preview

# Build and start production server
npm start
```

---

## Tailwind Configuration

Utility-first CSS framework configuration.

### File Location
```
/Users/yourname/git/claudecodeui/tailwind.config.js
```

### Configuration

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  // Dark mode via class (not media query)
  darkMode: ["class"],

  // Content files to scan for class names
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],

  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      // Custom color palette
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },

      // Custom border radius
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      // Safe area inset spacing for mobile notch/home indicator
      spacing: {
        'safe-area-inset-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },

  // Plugins
  plugins: [
    require('@tailwindcss/typography')  // For Markdown rendering
  ],
}
```

### CSS Variables

CSS variables are defined in `src/index.css`:

```css
:root {
  /* Light mode colors */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... more variables ... */

  --radius: 0.5rem;
}

.dark {
  /* Dark mode colors */
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  /* ... more variables ... */
}
```

### Typography Plugin

The `@tailwindcss/typography` plugin provides prose classes for Markdown:

```jsx
// ChatInterface.jsx - Markdown rendering
<ReactMarkdown
  className="prose dark:prose-invert max-w-none"
  components={{
    code: ({ inline, children }) => {
      if (inline) {
        return <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">{children}</code>;
      }
      return <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded">{children}</pre>;
    }
  }}
>
  {content}
</ReactMarkdown>
```

### Custom Spacing for PWA

The `safe-area-inset-bottom` spacing utility handles mobile notches:

```jsx
// MobileNav.jsx
<nav className="pb-safe-area-inset-bottom">
  {/* Content */}
</nav>
```

Generates:
```css
.pb-safe-area-inset-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
```

---

## Summary

This document covered all configuration aspects of Claude Code UI:

1. **Environment Variables**: Server ports, API keys, JWT secrets, CLI paths
2. **Project Configuration**: Custom project names and manually added projects
3. **Claude Configuration**: MCP servers and project-specific settings
4. **Tools Settings**: Claude Code tool permissions stored in localStorage
5. **User Preferences**: UI customization and user-specific settings
6. **PWA Manifest**: Progressive Web App configuration for mobile installation
7. **Vite Configuration**: Frontend build tool and development server setup
8. **Tailwind Configuration**: Utility-first CSS framework and theme customization

Each section includes:
- File locations and structure
- Available options and their purposes
- Code examples showing usage
- Default values and fallbacks
- Security considerations where applicable
