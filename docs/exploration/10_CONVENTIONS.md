# 10_CONVENTIONS.md - Naming, Organization, and Patterns

This document describes the coding conventions, naming patterns, file organization, and development practices used in Claude Code UI.

## Table of Contents

- [File Naming Conventions](#file-naming-conventions)
- [Component Structure](#component-structure)
- [Import Organization](#import-organization)
- [Error Handling Patterns](#error-handling-patterns)
- [Logging Patterns](#logging-patterns)
- [Code Comments and Documentation](#code-comments-and-documentation)
- [State Management Patterns](#state-management-patterns)
- [API and Networking Patterns](#api-and-networking-patterns)
- [Git Commit Conventions](#git-commit-conventions)

---

## File Naming Conventions

### Frontend Files

#### React Components
**Convention:** PascalCase (UpperCamelCase)
**Extension:** `.jsx`

```
src/components/
├── ChatInterface.jsx           # Main chat component
├── MainContent.jsx             # Content container
├── Sidebar.jsx                 # Sidebar navigation
├── FileTree.jsx                # File browser
├── GitPanel.jsx                # Git operations
├── Settings.jsx                # Settings modal
├── MobileNav.jsx               # Mobile navigation
├── DarkModeToggle.jsx          # Dark mode button
├── ClaudeLogo.jsx              # Logo component
└── CursorLogo.jsx              # Cursor logo

src/components/ui/              # Reusable UI components
├── button.jsx                  # Button component
├── input.jsx                   # Input component
├── badge.jsx                   # Badge component
└── scroll-area.jsx             # Scroll container
```

**Pattern:**
- Component files use PascalCase
- Match the main component name: `ChatInterface.jsx` exports `ChatInterface`
- UI library components use lowercase with hyphens (shadcn/ui convention)

#### Contexts
**Convention:** PascalCase + "Context" suffix
**Extension:** `.jsx`

```
src/contexts/
├── AuthContext.jsx             # Authentication state
├── ThemeContext.jsx            # Theme (dark/light mode)
├── WebSocketContext.jsx        # WebSocket connection
├── TaskMasterContext.jsx       # TaskMaster integration
└── TasksSettingsContext.jsx    # Task display settings
```

#### Hooks
**Convention:** camelCase with "use" prefix
**Extension:** `.js`

```
src/hooks/
├── useLocalStorage.js          # localStorage hook
├── useVersionCheck.js          # Version checking
├── useAudioRecorder.js         # Voice recording
└── useWebSocket.js             # WebSocket connection (in utils)
```

#### Utilities
**Convention:** camelCase
**Extension:** `.js`

```
src/utils/
├── api.js                      # API client functions
├── websocket.js                # WebSocket utilities
├── markdown.js                 # Markdown processing
└── diffUtils.js                # Diff calculations
```

### Backend Files

#### Route Handlers
**Convention:** lowercase with hyphens
**Extension:** `.js`

```
server/routes/
├── auth.js                     # Authentication routes
├── git.js                      # Git operations
├── mcp.js                      # MCP server management
├── mcp-utils.js                # MCP utilities
├── cursor.js                   # Cursor-specific routes
└── taskmaster.js               # TaskMaster routes
```

#### Core Modules
**Convention:** lowercase with hyphens
**Extension:** `.js`

```
server/
├── index.js                    # Main server entry
├── projects.js                 # Project discovery and management
├── claude-cli.js               # Claude CLI integration
├── cursor-cli.js               # Cursor CLI integration
└── database/
    └── db.js                   # Database initialization
```

#### Middleware
**Convention:** lowercase
**Extension:** `.js`

```
server/middleware/
└── auth.js                     # Authentication middleware
```

### Configuration Files

**Convention:** lowercase with dots and hyphens
**Extension:** `.js`, `.json`, `.md`

```
Project root:
├── .env                        # Environment variables
├── .env.example                # Environment template
├── package.json                # NPM configuration
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind configuration
├── postcss.config.js           # PostCSS configuration
├── CLAUDE.md                   # Project documentation
└── README.md                   # Project readme
```

---

## Component Structure

### Functional Components with Hooks

Claude Code UI uses functional components exclusively, no class components.

**Standard Structure:**
```jsx
// 1. Imports
import React, { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../utils/api';
import Button from './ui/button';

// 2. Constants and helper functions (outside component)
const DEFAULT_SETTINGS = {
  autoExpand: false,
  showRaw: false
};

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString();
}

// 3. Main component
function ChatInterface({
  project,
  session,
  onSessionActive,
  onSessionInactive
}) {
  // 4. Hooks (in order)
  // - Context hooks
  const { user } = useAuth();
  const navigate = useNavigate();

  // - State hooks
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // - Ref hooks
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // - Memo hooks
  const sortedMessages = useMemo(() => {
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }, [messages]);

  // - Callback hooks
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Implementation
  }, [input, session]);

  // - Effect hooks
  useEffect(() => {
    // Load initial data
    if (session) {
      loadMessages(session.id);
    }
  }, [session]);

  useEffect(() => {
    // Auto-scroll to bottom
    scrollToBottom();
  }, [messages]);

  // 5. Helper functions (inside component if they need closure)
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = async (sessionId) => {
    setIsLoading(true);
    try {
      const response = await api.sessionMessages(project.name, sessionId);
      const data = await response.json();
      setMessages(data.messages);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Early returns (if component shouldn't render)
  if (!project) {
    return <div>Please select a project</div>;
  }

  // 7. Render
  return (
    <div className="chat-interface">
      <div className="messages">
        {sortedMessages.map((message, index) => (
          <div key={message.id || index} className="message">
            {message.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <Button type="submit" disabled={!input.trim() || isLoading}>
          Send
        </Button>
      </form>
    </div>
  );
}

// 8. PropTypes (optional but recommended)
ChatInterface.propTypes = {
  project: PropTypes.shape({
    name: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired
  }),
  session: PropTypes.shape({
    id: PropTypes.string.isRequired,
    summary: PropTypes.string
  }),
  onSessionActive: PropTypes.func,
  onSessionInactive: PropTypes.func
};

// 9. Default export
export default ChatInterface;
```

### Component Optimization

#### Memoization
Use `memo` for components that render frequently with same props:

```jsx
import { memo } from 'react';

const MessageComponent = memo(({ message, onFileOpen }) => {
  return (
    <div className="message">
      {message.content}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function
  return prevProps.message.id === nextProps.message.id &&
         prevProps.message.content === nextProps.message.content;
});

export default MessageComponent;
```

#### useCallback for Event Handlers
```jsx
const handleClick = useCallback((id) => {
  // Handler logic
  onItemClick(id);
}, [onItemClick]); // Only recreate if onItemClick changes
```

#### useMemo for Expensive Calculations
```jsx
const filteredItems = useMemo(() => {
  return items.filter(item => item.category === selectedCategory);
}, [items, selectedCategory]);
```

---

## Import Organization

### Import Order

Organize imports in this order:

```jsx
// 1. React core
import React, { useState, useEffect, useCallback } from 'react';

// 2. Third-party libraries
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useDropzone } from 'react-dropzone';

// 3. Internal contexts
import { useAuth } from '../contexts/AuthContext';
import { useWebSocketContext } from '../contexts/WebSocketContext';

// 4. Internal components
import Button from './ui/button';
import TodoList from './TodoList';
import ClaudeStatus from './ClaudeStatus';

// 5. Internal utilities
import { api, authenticatedFetch } from '../utils/api';
import { formatDate, parseMarkdown } from '../utils/helpers';

// 6. Styles (if separate CSS files)
import './ChatInterface.css';
```

### Import Patterns

#### Named vs Default Imports
```jsx
// Default imports - for single export
import ChatInterface from './components/ChatInterface';
import Button from './components/ui/button';

// Named imports - for multiple exports
import { useState, useEffect } from 'react';
import { api, authenticatedFetch } from './utils/api';

// Namespace imports - for many exports
import * as utils from './utils/helpers';
```

#### Absolute vs Relative Paths
```jsx
// Relative paths (current convention in project)
import { useAuth } from '../contexts/AuthContext';
import Button from './ui/button';

// Could be improved with path aliases (not currently used)
// vite.config.js: resolve.alias: { '@': '/src' }
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/button';
```

---

## Error Handling Patterns

### Frontend Error Handling

#### Try-Catch with User Feedback
```jsx
const [error, setError] = useState(null);

const loadData = async () => {
  setError(null);
  setIsLoading(true);

  try {
    const response = await api.projects();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    setProjects(data);
  } catch (error) {
    console.error('Failed to load projects:', error);
    setError('Failed to load projects. Please try again.');
  } finally {
    setIsLoading(false);
  }
};

// Render
if (error) {
  return (
    <div className="error-message">
      {error}
      <button onClick={loadData}>Retry</button>
    </div>
  );
}
```

#### Error Boundary
```jsx
// ErrorBoundary.jsx
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <details>
            <summary>Error details</summary>
            <pre>{this.state.error?.toString()}</pre>
          </details>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

#### Safe localStorage
```jsx
// ChatInterface.jsx - safeLocalStorage utility
const safeLocalStorage = {
  setItem: (key, value) => {
    try {
      // Implement size limits and cleanup
      if (key.startsWith('chat_messages_') && typeof value === 'string') {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 50) {
          console.warn(`Truncating ${key} from ${parsed.length} to 50 messages`);
          value = JSON.stringify(parsed.slice(-50));
        }
      }

      localStorage.setItem(key, value);
    } catch (error) {
      if (error.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded, clearing old data');
        // Clear old chat messages
        const keys = Object.keys(localStorage);
        const chatKeys = keys.filter(k => k.startsWith('chat_messages_')).sort();

        if (chatKeys.length > 3) {
          chatKeys.slice(0, chatKeys.length - 3).forEach(k => {
            localStorage.removeItem(k);
          });
        }

        // Retry
        try {
          localStorage.setItem(key, value);
        } catch (retryError) {
          console.error('Failed to save even after cleanup:', retryError);
        }
      }
    }
  },

  getItem: (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('localStorage getItem error:', error);
      return null;
    }
  }
};
```

### Backend Error Handling

#### Express Route Error Handling
```javascript
// server/routes/auth.js
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Business logic
    const user = userDb.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Success
    const token = generateToken(user);
    res.json({
      success: true,
      user: { id: user.id, username: user.username },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

#### Specific Error Code Handling
```javascript
// server/projects.js - extractProjectDirectory
try {
  await fs.access(projectDir);
  // Directory exists, continue
} catch (error) {
  if (error.code === 'ENOENT') {
    // Directory doesn't exist - expected, use fallback
    console.log(`Project directory not found: ${projectDir}`);
    return projectName.replace(/-/g, '/');
  } else if (error.code === 'EACCES') {
    // Permission denied - log warning
    console.warn(`Permission denied accessing: ${projectDir}`);
    return projectName.replace(/-/g, '/');
  } else {
    // Unexpected error - rethrow
    throw error;
  }
}
```

#### Database Transaction Errors
```javascript
// server/routes/auth.js - register endpoint
db.prepare('BEGIN').run();
try {
  const hasUsers = userDb.hasUsers();
  if (hasUsers) {
    db.prepare('ROLLBACK').run();
    return res.status(403).json({ error: 'User already exists' });
  }

  const passwordHash = await bcrypt.hash(password, saltRounds);
  const user = userDb.createUser(username, passwordHash);
  const token = generateToken(user);

  db.prepare('COMMIT').run();

  res.json({ success: true, user, token });
} catch (error) {
  db.prepare('ROLLBACK').run();
  console.error('Registration error:', error);

  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    res.status(409).json({ error: 'Username already exists' });
  } else {
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

---

## Logging Patterns

### Console Logging with Emojis

Claude Code UI uses emojis in console logs for visual distinction:

#### Server Logging
```javascript
// server/index.js
console.log('✅ Database initialization skipped (testing)');
console.log(`Claude Code UI server running on http://0.0.0.0:${PORT}`);
console.log('🔗 Client connected to:', url);
console.log('💬 Chat WebSocket connected');
console.log('🐚 Shell client connected');
console.log('🔌 Chat client disconnected');
console.log('❌ Chat WebSocket error:', error.message);

// server/claude-cli.js
console.log('📤 Claude CLI stdout:', rawOutput);
console.log('📄 Parsed JSON response:', response);
console.log('📝 Captured session ID:', capturedSessionId);
console.log('🛑 Aborting Claude session:', sessionId);

// server/projects.js
console.log('📡 Adding MCP config:', configPath);
console.warn('⚠️ MCP servers detected but no valid config file found');
console.error('❌ Error handling project changes:', error);
```

#### Client Logging
```javascript
// src/contexts/WebSocketContext.jsx
console.log('Connecting to WebSocket:', wsUrl);
console.log('✅ WebSocket connected');
console.log('❌ WebSocket disconnected');
console.error('WebSocket error:', error);

// src/App.jsx
console.log('🔄 Attempting to reconnect...');
console.error('Error fetching projects:', error);
```

### Emoji Convention Guide

| Emoji | Meaning | Usage |
|-------|---------|-------|
| ✅ | Success | Successful operations, connections |
| ❌ | Error | Errors, failures, rejections |
| 🔗 | Connection | Client connections, links |
| 💬 | Chat | Chat-related operations |
| 📁 | Project | Project operations |
| 🔄 | Resume | Session resume, retries |
| 🐚 | Shell | Terminal/shell operations |
| 🔌 | Disconnect | Client disconnections |
| 📤 | Output | CLI stdout, responses |
| 📄 | Data | JSON parsing, data processing |
| 📝 | Note | Important information |
| 🛑 | Stop | Abort, kill, stop operations |
| 📡 | Config | Configuration operations |
| ⚠️ | Warning | Warnings, non-critical issues |
| 🔍 | Debug | Debug information |
| 🔒 | Security | Authentication, permissions |

### Structured Logging

```javascript
// Multi-line structured log
console.log('💬 User message:', data.command || '[Continue/Resume]');
console.log('📁 Project:', data.options?.projectPath || 'Unknown');
console.log('🔄 Session:', data.options?.sessionId ? 'Resume' : 'New');
console.log('🤖 Model:', data.options?.model || 'default');
```

### Conditional Logging
```javascript
// Only log in development
if (process.env.NODE_ENV === 'development') {
  console.log('🔍 Debug info:', debugData);
}

// Verbose logging flag
if (verbose) {
  console.log('🔍 Full command args:', JSON.stringify(args, null, 2));
}
```

---

## Code Comments and Documentation

### Comment Style

#### Single-line Comments
```javascript
// Use for brief explanations
const port = process.env.PORT || 3001; // Default to 3001
```

#### Multi-line Comments
```javascript
/*
 * Use for longer explanations that span multiple lines
 * Format with asterisks on each line
 */
```

### JSDoc Comments

#### Function Documentation
```javascript
/**
 * Extract the actual project directory from JSONL session files
 *
 * Claude stores sessions in ~/.claude/projects/{encoded-path}/ but the
 * actual project is elsewhere. This function reads JSONL files to find
 * the real project path from the 'cwd' field.
 *
 * @param {string} projectName - Encoded project name (e.g., "Users-name-project")
 * @returns {Promise<string>} Absolute path to actual project directory
 *
 * @example
 * const path = await extractProjectDirectory('Users-john-myproject');
 * // Returns: "/Users/john/myproject"
 */
async function extractProjectDirectory(projectName) {
  // Implementation
}
```

#### Component Documentation
```jsx
/**
 * ChatInterface - Main chat component for Claude Code UI
 *
 * Handles user input, message display, session management, and integration
 * with the Session Protection system.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.selectedProject - Currently selected project
 * @param {Object} props.selectedSession - Currently selected session
 * @param {Function} props.onSessionActive - Mark session as active (Session Protection)
 * @param {Function} props.onSessionInactive - Mark session as inactive
 *
 * @example
 * <ChatInterface
 *   selectedProject={project}
 *   selectedSession={session}
 *   onSessionActive={(id) => console.log('Active:', id)}
 *   onSessionInactive={(id) => console.log('Inactive:', id)}
 * />
 */
function ChatInterface({ selectedProject, selectedSession, onSessionActive, onSessionInactive }) {
  // Implementation
}
```

### Architectural Comments

Large comment blocks for critical systems:

```jsx
/*
 * App.jsx - Main Application Component with Session Protection System
 *
 * SESSION PROTECTION SYSTEM OVERVIEW:
 * ===================================
 *
 * Problem: Automatic project updates from WebSocket would refresh the sidebar and clear chat messages
 * during active conversations, creating a poor user experience.
 *
 * Solution: Track "active sessions" and pause project updates during conversations.
 *
 * How it works:
 * 1. When user sends message → session marked as "active"
 * 2. Project updates are skipped while session is active
 * 3. When conversation completes/aborts → session marked as "inactive"
 * 4. Project updates resume normally
 *
 * Handles both existing sessions (with real IDs) and new sessions (with temporary IDs).
 */
```

```javascript
/**
 * PROJECT DISCOVERY AND MANAGEMENT SYSTEM
 * ========================================
 *
 * This module manages project discovery for both Claude CLI and Cursor CLI sessions.
 *
 * ## Architecture Overview
 *
 * 1. **Claude Projects** (stored in ~/.claude/projects/)
 *    - Each project is a directory named with the project path encoded (/ replaced with -)
 *    - Contains .jsonl files with conversation history including 'cwd' field
 *
 * 2. **Cursor Projects** (stored in ~/.cursor/chats/)
 *    - Each project directory is named with MD5 hash of the absolute project path
 *    - Contains session directories with SQLite databases (store.db)
 *
 * ## Critical Limitations
 *
 * - **CANNOT discover Cursor-only projects**: MD5 hash is one-way, cannot reverse
 * - **Project relocation breaks history**: Moving project changes MD5 hash
 */
```

### Inline Explanations

```javascript
// Session Protection Logic: Allow additions but prevent changes during active conversations
// This allows new sessions/projects to appear in sidebar while protecting active chat messages
const hasActiveSession = (selectedSession && activeSessions.has(selectedSession.id)) ||
                         (activeSessions.size > 0 && Array.from(activeSessions).some(id => id.startsWith('new-session-')));

if (hasActiveSession) {
  // Check if update is purely additive
  const isAdditiveUpdate = isUpdateAdditive(currentProjects, updatedProjects, selectedProject, selectedSession);

  if (!isAdditiveUpdate) {
    // Skip updates that would modify existing selected session/project
    return;
  }
}
```

### TODO Comments

```javascript
// TODO: Implement image compression before upload
// TODO: Add retry logic for failed WebSocket connections
// FIXME: Memory leak in message history
// HACK: Temporary workaround for Claude CLI bug #123
// NOTE: This must stay in sync with server/projects.js
```

---

## State Management Patterns

### Context Pattern

#### Creating a Context
```jsx
// src/contexts/ThemeContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

// 1. Create context with default value
const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {}
});

// 2. Create custom hook for easy access
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

// 3. Create provider component
export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Initialize from localStorage
    const saved = localStorage.getItem('theme');
    return saved || 'light';
  });

  // Sync with localStorage
  useEffect(() => {
    localStorage.setItem('theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const value = {
    theme,
    setTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
```

#### Using Context
```jsx
// App.jsx
import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

// Component using context
import { useTheme } from '../contexts/ThemeContext';

function DarkModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
```

### Local State Pattern

```jsx
// Component-local state for UI interactions
function ChatInterface() {
  // Input state
  const [input, setInput] = useState('');

  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Error state
  const [error, setError] = useState(null);

  // Modal state
  const [showSettings, setShowSettings] = useState(false);

  // Selection state
  const [selectedFile, setSelectedFile] = useState(null);

  return (
    // JSX
  );
}
```

### Lifting State Up

When multiple components need shared state:

```jsx
// Parent component manages shared state
function MainContent() {
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  return (
    <>
      <Sidebar
        selectedProject={selectedProject}
        onProjectSelect={setSelectedProject}
        selectedSession={selectedSession}
        onSessionSelect={setSelectedSession}
      />
      <ChatInterface
        project={selectedProject}
        session={selectedSession}
      />
    </>
  );
}
```

### Derived State Pattern

Compute values from existing state instead of storing:

```jsx
// ❌ Bad: Storing derived state
const [messages, setMessages] = useState([]);
const [messageCount, setMessageCount] = useState(0);

useEffect(() => {
  setMessageCount(messages.length); // Redundant state update
}, [messages]);

// ✅ Good: Compute on render
const [messages, setMessages] = useState([]);
const messageCount = messages.length;
```

---

## API and Networking Patterns

### Authenticated Fetch Wrapper

```javascript
// src/utils/api.js
export const authenticatedFetch = (url, options = {}) => {
  const token = localStorage.getItem('auth-token');

  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  if (token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  return fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });
};
```

### API Client Pattern

```javascript
// src/utils/api.js
export const api = {
  // Auth endpoints
  auth: {
    status: () => fetch('/api/auth/status'),
    login: (username, password) =>
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    logout: () => authenticatedFetch('/api/auth/logout', { method: 'POST' }),
  },

  // Protected endpoints
  projects: () => authenticatedFetch('/api/projects'),

  sessions: (projectName, limit = 5, offset = 0) =>
    authenticatedFetch(
      `/api/projects/${projectName}/sessions?limit=${limit}&offset=${offset}`
    ),

  sessionMessages: (projectName, sessionId, limit = null, offset = 0) => {
    const params = new URLSearchParams();
    if (limit !== null) {
      params.append('limit', limit);
      params.append('offset', offset);
    }
    const queryString = params.toString();
    const url = `/api/projects/${projectName}/sessions/${sessionId}/messages${
      queryString ? `?${queryString}` : ''
    }`;
    return authenticatedFetch(url);
  },
};
```

### Usage in Components

```jsx
async function loadProjects() {
  try {
    const response = await api.projects();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    setProjects(data);
  } catch (error) {
    console.error('Failed to load projects:', error);
    setError('Failed to load projects');
  }
}
```

### WebSocket Pattern

```javascript
// src/utils/websocket.js
export const useWebSocket = () => {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const initWebSocket = async () => {
      const config = await fetch('/api/config').then(r => r.json());
      const token = localStorage.getItem('auth-token');
      const wsUrl = `${config.wsUrl}/ws?token=${encodeURIComponent(token)}`;

      const websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
      };

      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setMessages(prev => [...prev, data]);
      };

      websocket.onclose = () => {
        console.log('❌ WebSocket disconnected');
        setIsConnected(false);
        // Attempt reconnect
        setTimeout(initWebSocket, 3000);
      };

      setWs(websocket);
    };

    initWebSocket();

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, []);

  const sendMessage = useCallback((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }, [ws]);

  return { ws, messages, sendMessage, isConnected };
};
```

---

## Git Commit Conventions

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring (no functional changes)
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks (build, dependencies, etc.)
- `ci`: CI/CD changes

### Examples

#### Simple Commit
```
feat: add dark mode toggle

Added dark mode toggle button to navbar. Theme preference is saved to localStorage.
```

#### With Scope
```
fix(auth): prevent token expiration on page refresh

Store token expiration time in localStorage and refresh token automatically when it's close to expiring.
```

#### Breaking Change
```
feat(api)!: change session endpoint response format

BREAKING CHANGE: Session endpoint now returns paginated results with metadata.

Before:
{
  sessions: [...]
}

After:
{
  sessions: [...],
  total: 10,
  hasMore: true,
  limit: 5,
  offset: 0
}
```

#### Multiple Changes
```
feat: add voice input support

- Integrated OpenAI Whisper API for transcription
- Added microphone button to chat input
- Implemented audio recording with visual feedback
- Added transcription mode settings (default, prompt, vibe)

Closes #42
```

### Good Practices

1. **Use imperative mood**: "add feature" not "added feature"
2. **Keep subject under 50 characters**
3. **Capitalize first letter**: "Add feature" not "add feature"
4. **No period at end of subject**
5. **Separate subject and body with blank line**
6. **Wrap body at 72 characters**
7. **Explain what and why, not how**
8. **Reference issues**: "Closes #123", "Fixes #456"

### Commit Examples from Project

```bash
# Recent commits from the project
a100648 Release 1.8.12
7d0fd14 Merge pull request #203 from SyedaAnshrahGillani/fix-accessibility-issues
e5a05d9 fix: Address coderabbitai feedback
2d6c3b5 refactor: Create useLocalStorage hook to reduce code duplication
2a5d27f fix(accessibility): Use buttons for modal backdrops
```

---

## Summary

This document covered ten major convention areas:

1. **File Naming**: PascalCase for components, camelCase for utilities, lowercase with hyphens for routes
2. **Component Structure**: Functional components with organized hooks, memoization patterns
3. **Import Organization**: React core → libraries → contexts → components → utilities → styles
4. **Error Handling**: Try-catch with user feedback, error boundaries, safe storage
5. **Logging**: Console logs with emojis for visual distinction
6. **Comments**: JSDoc for functions, architectural comments for complex systems
7. **State Management**: Context pattern, local state, lifting state up, derived state
8. **API Patterns**: Authenticated fetch wrapper, API client object, WebSocket hooks
9. **Git Commits**: Conventional commits with type, scope, and clear messages

These conventions help maintain consistency across the codebase and make it easier for new contributors to understand and follow the project's patterns.
