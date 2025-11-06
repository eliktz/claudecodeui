# Implementation Guide: Adding New Features

This guide provides step-by-step instructions for extending Claude Code UI with new features. Each section includes complete code examples and explains the architectural patterns to follow.

---

## Table of Contents

1. [Adding a New API Endpoint](#1-adding-a-new-api-endpoint)
2. [Adding a New UI Component](#2-adding-a-new-ui-component)
3. [Adding a New Context Provider](#3-adding-a-new-context-provider)
4. [Adding a New CLI Integration](#4-adding-a-new-cli-integration)
5. [Adding a New WebSocket Message Type](#5-adding-a-new-websocket-message-type)
6. [Common Pitfalls](#6-common-pitfalls)
7. [Testing Your Feature](#7-testing-your-feature)
8. [Feature Implementation Checklist](#8-feature-implementation-checklist)

---

## 1. Adding a New API Endpoint

### Example: Adding a "Favorites" Feature

Users want to mark projects as favorites and filter by favorites in the UI.

### Step 1.1: Create the Route File

Create `/Users/elik.k/git/claudecodeui/server/routes/favorites.js`:

```javascript
import express from 'express';
import db from '../database/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all favorite projects
router.get('/', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT project_id, created_at
      FROM favorites
      ORDER BY created_at DESC
    `);
    const favorites = stmt.all();

    res.json({
      success: true,
      favorites
    });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add a project to favorites
router.post('/', authenticateToken, (req, res) => {
  const { projectId } = req.body;

  if (!projectId) {
    return res.status(400).json({
      success: false,
      error: 'projectId is required'
    });
  }

  try {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO favorites (project_id, created_at)
      VALUES (?, datetime('now'))
    `);
    const result = stmt.run(projectId);

    res.json({
      success: true,
      projectId,
      message: result.changes > 0 ? 'Added to favorites' : 'Already in favorites'
    });
  } catch (error) {
    console.error('Error adding favorite:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Remove a project from favorites
router.delete('/:projectId', authenticateToken, (req, res) => {
  const { projectId } = req.params;

  try {
    const stmt = db.prepare('DELETE FROM favorites WHERE project_id = ?');
    const result = stmt.run(projectId);

    if (result.changes === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not in favorites'
      });
    }

    res.json({
      success: true,
      message: 'Removed from favorites'
    });
  } catch (error) {
    console.error('Error removing favorite:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Check if a project is favorited
router.get('/:projectId', authenticateToken, (req, res) => {
  const { projectId } = req.params;

  try {
    const stmt = db.prepare('SELECT 1 FROM favorites WHERE project_id = ?');
    const isFavorite = stmt.get(projectId) !== undefined;

    res.json({
      success: true,
      projectId,
      isFavorite
    });
  } catch (error) {
    console.error('Error checking favorite:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
```

### Step 1.2: Create Database Migration

Add to `/Users/elik.k/git/claudecodeui/server/database/db.js`:

```javascript
// Add this to the initialization section
db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    project_id TEXT PRIMARY KEY,
    created_at DATETIME NOT NULL
  )
`);
```

### Step 1.3: Mount the Route in Server

Edit `/Users/elik.k/git/claudecodeui/server/index.js`:

```javascript
// Add import at top
import favoritesRouter from './routes/favorites.js';

// Add route mounting with other routes
app.use('/api/favorites', favoritesRouter);
```

### Step 1.4: Create Frontend API Functions

Create `/Users/elik.k/git/claudecodeui/src/utils/favoritesApi.js`:

```javascript
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function getFavorites() {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/api/favorites`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch favorites');
  }

  return response.json();
}

export async function addFavorite(projectId) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/api/favorites`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ projectId })
  });

  if (!response.ok) {
    throw new Error('Failed to add favorite');
  }

  return response.json();
}

export async function removeFavorite(projectId) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/api/favorites/${projectId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to remove favorite');
  }

  return response.json();
}

export async function isFavorite(projectId) {
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}/api/favorites/${projectId}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to check favorite status');
  }

  const data = await response.json();
  return data.isFavorite;
}
```

### Step 1.5: Use in Components

```jsx
// In ProjectList.jsx or similar component
import { useState, useEffect } from 'react';
import { getFavorites, addFavorite, removeFavorite } from '../utils/favoritesApi';

function ProjectList({ projects }) {
  const [favorites, setFavorites] = useState(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    try {
      const data = await getFavorites();
      setFavorites(new Set(data.favorites.map(f => f.project_id)));
    } catch (error) {
      console.error('Failed to load favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (projectId) => {
    try {
      if (favorites.has(projectId)) {
        await removeFavorite(projectId);
        setFavorites(prev => {
          const next = new Set(prev);
          next.delete(projectId);
          return next;
        });
      } else {
        await addFavorite(projectId);
        setFavorites(prev => new Set(prev).add(projectId));
      }
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  return (
    <div>
      {projects.map(project => (
        <div key={project.id} className="flex items-center justify-between">
          <span>{project.name}</span>
          <button
            onClick={() => toggleFavorite(project.id)}
            className={favorites.has(project.id) ? 'text-yellow-500' : 'text-gray-400'}
          >
            {favorites.has(project.id) ? '★' : '☆'}
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 2. Adding a New UI Component

### Example: Adding a "Bookmarks" Panel

Users want to bookmark specific messages in conversations for quick reference.

### Step 2.1: Create the Component File

Create `/Users/elik.k/git/claudecodeui/src/components/BookmarksPanel.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { Star, Trash2, ExternalLink } from 'lucide-react';

export default function BookmarksPanel({ currentProjectId }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
  }, [currentProjectId]);

  const loadBookmarks = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/bookmarks?projectId=${currentProjectId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setBookmarks(data.bookmarks || []);
    } catch (error) {
      console.error('Failed to load bookmarks:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeBookmark = async (bookmarkId) => {
    try {
      await fetch(`/api/bookmarks/${bookmarkId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      setBookmarks(prev => prev.filter(b => b.id !== bookmarkId));
    } catch (error) {
      console.error('Failed to remove bookmark:', error);
    }
  };

  const navigateToMessage = (sessionId, messageIndex) => {
    // Navigate to the session and scroll to the message
    window.location.href = `/chat/${sessionId}?message=${messageIndex}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Star className="w-12 h-12 mb-4 opacity-50" />
        <p className="text-lg">No bookmarks yet</p>
        <p className="text-sm mt-2">Click the star icon on any message to bookmark it</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold flex items-center">
          <Star className="w-5 h-5 mr-2 text-yellow-500" />
          Bookmarks
        </h2>
        <span className="text-sm text-gray-500">{bookmarks.length} saved</span>
      </div>

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto">
        {bookmarks.map(bookmark => (
          <div
            key={bookmark.id}
            className="p-4 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <h3 className="font-medium text-sm mb-1">{bookmark.sessionTitle}</h3>
                <p className="text-xs text-gray-500">
                  {new Date(bookmark.createdAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => navigateToMessage(bookmark.sessionId, bookmark.messageIndex)}
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  title="Go to message"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeBookmark(bookmark.id)}
                  className="p-1 hover:bg-red-100 dark:hover:bg-red-900 rounded"
                  title="Remove bookmark"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>

            {/* Message Preview */}
            <div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
              {bookmark.messageContent}
            </div>

            {/* Tags (if any) */}
            {bookmark.tags && bookmark.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {bookmark.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 2.2: Add to Parent Component

Edit `/Users/elik.k/git/claudecodeui/src/components/MainContent.jsx`:

```jsx
import BookmarksPanel from './BookmarksPanel';

function MainContent({ activeView, currentProjectId, currentSessionId }) {
  return (
    <div className="flex-1 flex flex-col">
      {activeView === 'chat' && <ChatInterface sessionId={currentSessionId} />}
      {activeView === 'files' && <FileTree projectId={currentProjectId} />}
      {activeView === 'git' && <GitPanel projectId={currentProjectId} />}
      {activeView === 'bookmarks' && <BookmarksPanel currentProjectId={currentProjectId} />}
    </div>
  );
}
```

### Step 2.3: Add to Navigation

Edit `/Users/elik.k/git/claudecodeui/src/components/Sidebar.jsx`:

```jsx
import { Star } from 'lucide-react';

function Sidebar({ activeView, onViewChange }) {
  return (
    <div className="w-64 border-r border-gray-200 dark:border-gray-700">
      <nav className="p-4 space-y-2">
        <button
          onClick={() => onViewChange('chat')}
          className={`w-full flex items-center px-3 py-2 rounded ${
            activeView === 'chat' ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => onViewChange('files')}
          className={`w-full flex items-center px-3 py-2 rounded ${
            activeView === 'files' ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
        >
          Files
        </button>
        <button
          onClick={() => onViewChange('git')}
          className={`w-full flex items-center px-3 py-2 rounded ${
            activeView === 'git' ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
        >
          Git
        </button>
        <button
          onClick={() => onViewChange('bookmarks')}
          className={`w-full flex items-center px-3 py-2 rounded ${
            activeView === 'bookmarks' ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
        >
          <Star className="w-4 h-4 mr-2" />
          Bookmarks
        </button>
      </nav>
    </div>
  );
}
```

### Step 2.4: Add to Mobile Navigation

Edit `/Users/elik.k/git/claudecodeui/src/components/MobileNav.jsx`:

```jsx
import { MessageSquare, FileText, GitBranch, Star } from 'lucide-react';

function MobileNav({ activeView, onViewChange }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom">
      <div className="flex justify-around items-center h-16">
        <button
          onClick={() => onViewChange('chat')}
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            activeView === 'chat' ? 'text-blue-500' : 'text-gray-500'
          }`}
        >
          <MessageSquare className="w-6 h-6" />
          <span className="text-xs mt-1">Chat</span>
        </button>
        <button
          onClick={() => onViewChange('files')}
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            activeView === 'files' ? 'text-blue-500' : 'text-gray-500'
          }`}
        >
          <FileText className="w-6 h-6" />
          <span className="text-xs mt-1">Files</span>
        </button>
        <button
          onClick={() => onViewChange('git')}
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            activeView === 'git' ? 'text-blue-500' : 'text-gray-500'
          }`}
        >
          <GitBranch className="w-6 h-6" />
          <span className="text-xs mt-1">Git</span>
        </button>
        <button
          onClick={() => onViewChange('bookmarks')}
          className={`flex flex-col items-center justify-center flex-1 h-full ${
            activeView === 'bookmarks' ? 'text-blue-500' : 'text-gray-500'
          }`}
        >
          <Star className="w-6 h-6" />
          <span className="text-xs mt-1">Saved</span>
        </button>
      </div>
    </nav>
  );
}
```

### Step 2.5: Add Bookmark Button to Messages

Edit `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx`:

```jsx
// Add bookmark button to message actions
function MessageActions({ message, messageIndex, sessionId }) {
  const [isBookmarked, setIsBookmarked] = useState(false);

  const toggleBookmark = async () => {
    try {
      if (isBookmarked) {
        await fetch(`/api/bookmarks/${message.bookmarkId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        setIsBookmarked(false);
      } else {
        const response = await fetch('/api/bookmarks', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId,
            messageIndex,
            messageContent: message.content
          })
        });
        const data = await response.json();
        setIsBookmarked(true);
      }
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    }
  };

  return (
    <div className="flex space-x-2">
      <button
        onClick={toggleBookmark}
        className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${
          isBookmarked ? 'text-yellow-500' : 'text-gray-500'
        }`}
        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      >
        <Star className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
      </button>
      {/* Other action buttons */}
    </div>
  );
}
```

---

## 3. Adding a New Context Provider

### Example: NotificationsContext

Users want toast notifications for success/error messages throughout the app.

### Step 3.1: Create the Context File

Create `/Users/elik.k/git/claudecodeui/src/contexts/NotificationsContext.jsx`:

```jsx
import { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const NotificationsContext = createContext();

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}

let notificationId = 0;

export function NotificationsProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = 'info', duration = 5000) => {
    const id = ++notificationId;
    const notification = { id, message, type, timestamp: Date.now() };

    setNotifications(prev => [...prev, notification]);

    if (duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const success = useCallback((message, duration) => {
    return addNotification(message, 'success', duration);
  }, [addNotification]);

  const error = useCallback((message, duration) => {
    return addNotification(message, 'error', duration);
  }, [addNotification]);

  const info = useCallback((message, duration) => {
    return addNotification(message, 'info', duration);
  }, [addNotification]);

  const warning = useCallback((message, duration) => {
    return addNotification(message, 'warning', duration);
  }, [addNotification]);

  const value = {
    notifications,
    addNotification,
    removeNotification,
    success,
    error,
    info,
    warning
  };

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      <NotificationContainer
        notifications={notifications}
        onRemove={removeNotification}
      />
    </NotificationsContext.Provider>
  );
}

function NotificationContainer({ notifications, onRemove }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map(notification => (
        <Notification
          key={notification.id}
          notification={notification}
          onRemove={() => onRemove(notification.id)}
        />
      ))}
    </div>
  );
}

function Notification({ notification, onRemove }) {
  const { type, message } = notification;

  const styles = {
    success: {
      bg: 'bg-green-100 dark:bg-green-900',
      text: 'text-green-800 dark:text-green-200',
      icon: CheckCircle
    },
    error: {
      bg: 'bg-red-100 dark:bg-red-900',
      text: 'text-red-800 dark:text-red-200',
      icon: AlertCircle
    },
    warning: {
      bg: 'bg-yellow-100 dark:bg-yellow-900',
      text: 'text-yellow-800 dark:text-yellow-200',
      icon: AlertCircle
    },
    info: {
      bg: 'bg-blue-100 dark:bg-blue-900',
      text: 'text-blue-800 dark:text-blue-200',
      icon: Info
    }
  };

  const style = styles[type] || styles.info;
  const Icon = style.icon;

  return (
    <div
      className={`${style.bg} ${style.text} p-4 rounded-lg shadow-lg flex items-start space-x-3 animate-slide-in`}
    >
      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
      <p className="flex-1 text-sm">{message}</p>
      <button
        onClick={onRemove}
        className="flex-shrink-0 hover:opacity-70"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

### Step 3.2: Add Animation to Tailwind

Edit `/Users/elik.k/git/claudecodeui/tailwind.config.js`:

```javascript
module.exports = {
  // ... existing config
  theme: {
    extend: {
      animation: {
        'slide-in': 'slideIn 0.3s ease-out'
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(100%)', opacity: 0 },
          '100%': { transform: 'translateX(0)', opacity: 1 }
        }
      }
    }
  }
};
```

### Step 3.3: Add to Provider Hierarchy

Edit `/Users/elik.k/git/claudecodeui/src/App.jsx`:

```jsx
import { NotificationsProvider } from './contexts/NotificationsContext';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <WebSocketProvider>
          <NotificationsProvider>
            {/* Rest of app */}
          </NotificationsProvider>
        </WebSocketProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
```

### Step 3.4: Use in Components

```jsx
import { useNotifications } from '../contexts/NotificationsContext';

function ProjectList() {
  const { success, error } = useNotifications();

  const handleDeleteProject = async (projectId) => {
    try {
      await deleteProject(projectId);
      success('Project deleted successfully');
    } catch (err) {
      error('Failed to delete project: ' + err.message);
    }
  };

  return (
    <div>
      {/* Project list UI */}
    </div>
  );
}
```

### Step 3.5: Replace Existing Alert Calls

Search and replace throughout the codebase:

```jsx
// Before
alert('Project deleted successfully');
console.error('Failed to delete project');

// After
const { success, error } = useNotifications();
success('Project deleted successfully');
error('Failed to delete project');
```

---

## 4. Adding a New CLI Integration

### Example: Adding Aider CLI Support

Users want to use Aider (another AI coding assistant) through the same UI.

### Step 4.1: Create CLI Handler

Create `/Users/elik.k/git/claudecodeui/server/aider-cli.js`:

```javascript
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const AIDER_SESSIONS_DIR = path.join(os.homedir(), '.aider', 'sessions');

// Spawn Aider CLI process
export function spawnAiderCLI(projectPath, sessionId, options = {}) {
  const {
    model = 'gpt-4',
    autoCommit = false,
    yesAlways = false,
    verbose = false
  } = options;

  const args = [
    '--model', model,
    '--no-git', // We handle git separately
    '--yes' // Auto-confirm prompts
  ];

  if (autoCommit) {
    args.push('--auto-commits');
  }

  if (verbose) {
    args.push('--verbose');
  }

  // Add session file for history
  const sessionFile = path.join(AIDER_SESSIONS_DIR, `${sessionId}.jsonl`);
  args.push('--input-history-file', sessionFile);
  args.push('--output-history-file', sessionFile);

  console.log(`Spawning Aider CLI: aider ${args.join(' ')}`);

  const aiderProcess = spawn('aider', args, {
    cwd: projectPath,
    env: {
      ...process.env,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY
    }
  });

  return aiderProcess;
}

// Parse Aider output
export function parseAiderOutput(line) {
  try {
    // Aider outputs JSON lines in verbose mode
    if (line.startsWith('{')) {
      const data = JSON.parse(line);
      return {
        type: data.type || 'message',
        content: data.content || data.message,
        metadata: data
      };
    }

    // Regular text output
    return {
      type: 'text',
      content: line
    };
  } catch (error) {
    return {
      type: 'text',
      content: line
    };
  }
}

// Get Aider sessions for a project
export async function getAiderSessions(projectPath) {
  try {
    await fs.mkdir(AIDER_SESSIONS_DIR, { recursive: true });

    const files = await fs.readdir(AIDER_SESSIONS_DIR);
    const sessions = [];

    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;

      const filePath = path.join(AIDER_SESSIONS_DIR, file);
      const stats = await fs.stat(filePath);

      // Read first line for session info
      const content = await fs.readFile(filePath, 'utf-8');
      const firstLine = content.split('\n')[0];
      let title = 'Untitled Session';

      try {
        const data = JSON.parse(firstLine);
        title = data.title || data.message?.substring(0, 50) || title;
      } catch (e) {
        // Use filename as fallback
        title = file.replace('.jsonl', '');
      }

      sessions.push({
        sessionId: file.replace('.jsonl', ''),
        title,
        lastModified: stats.mtime,
        projectPath
      });
    }

    return sessions.sort((a, b) => b.lastModified - a.lastModified);
  } catch (error) {
    console.error('Error getting Aider sessions:', error);
    return [];
  }
}

// Get session messages
export async function getAiderSessionMessages(sessionId) {
  try {
    const sessionFile = path.join(AIDER_SESSIONS_DIR, `${sessionId}.jsonl`);
    const content = await fs.readFile(sessionFile, 'utf-8');

    const messages = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { type: 'text', content: line };
        }
      });

    return messages;
  } catch (error) {
    console.error('Error reading Aider session:', error);
    return [];
  }
}

// Check if Aider is installed
export async function isAiderInstalled() {
  return new Promise((resolve) => {
    const aider = spawn('which', ['aider']);
    aider.on('close', (code) => {
      resolve(code === 0);
    });
  });
}
```

### Step 4.2: Add WebSocket Handler

Edit `/Users/elik.k/git/claudecodeui/server/index.js`:

```javascript
import { spawnAiderCLI, parseAiderOutput } from './aider-cli.js';

// Store active Aider processes
const aiderProcesses = new Map();

// Add WebSocket message handler
wss.on('connection', (ws) => {
  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    if (data.type === 'aider-start') {
      const { projectPath, sessionId, options } = data;

      // Spawn Aider CLI
      const aiderProcess = spawnAiderCLI(projectPath, sessionId, options);
      aiderProcesses.set(sessionId, aiderProcess);

      // Stream stdout
      aiderProcess.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            const parsed = parseAiderOutput(line);
            ws.send(JSON.stringify({
              type: 'aider-output',
              sessionId,
              ...parsed
            }));
          }
        });
      });

      // Stream stderr
      aiderProcess.stderr.on('data', (chunk) => {
        ws.send(JSON.stringify({
          type: 'aider-error',
          sessionId,
          error: chunk.toString()
        }));
      });

      // Handle process exit
      aiderProcess.on('close', (code) => {
        aiderProcesses.delete(sessionId);
        ws.send(JSON.stringify({
          type: 'aider-close',
          sessionId,
          code
        }));
      });

      ws.send(JSON.stringify({
        type: 'aider-started',
        sessionId
      }));
    }

    if (data.type === 'aider-input') {
      const { sessionId, input } = data;
      const aiderProcess = aiderProcesses.get(sessionId);

      if (aiderProcess) {
        aiderProcess.stdin.write(input + '\n');
      } else {
        ws.send(JSON.stringify({
          type: 'aider-error',
          sessionId,
          error: 'Aider process not found'
        }));
      }
    }

    if (data.type === 'aider-stop') {
      const { sessionId } = data;
      const aiderProcess = aiderProcesses.get(sessionId);

      if (aiderProcess) {
        aiderProcess.kill();
        aiderProcesses.delete(sessionId);
      }

      ws.send(JSON.stringify({
        type: 'aider-stopped',
        sessionId
      }));
    }
  });
});
```

### Step 4.3: Add API Routes

Create `/Users/elik.k/git/claudecodeui/server/routes/aider.js`:

```javascript
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import {
  getAiderSessions,
  getAiderSessionMessages,
  isAiderInstalled
} from '../aider-cli.js';

const router = express.Router();

// Check if Aider is installed
router.get('/installed', authenticateToken, async (req, res) => {
  const installed = await isAiderInstalled();
  res.json({ installed });
});

// Get Aider sessions for a project
router.get('/sessions', authenticateToken, async (req, res) => {
  const { projectPath } = req.query;

  if (!projectPath) {
    return res.status(400).json({ error: 'projectPath is required' });
  }

  try {
    const sessions = await getAiderSessions(projectPath);
    res.json({ sessions });
  } catch (error) {
    console.error('Error getting Aider sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get messages for a session
router.get('/sessions/:sessionId', authenticateToken, async (req, res) => {
  const { sessionId } = req.params;

  try {
    const messages = await getAiderSessionMessages(sessionId);
    res.json({ messages });
  } catch (error) {
    console.error('Error getting Aider session messages:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

Mount the route in `server/index.js`:

```javascript
import aiderRouter from './routes/aider.js';
app.use('/api/aider', aiderRouter);
```

### Step 4.4: Create Frontend Components

Create `/Users/elik.k/git/claudecodeui/src/components/AiderChat.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

export default function AiderChat({ projectPath, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const { ws } = useWebSocket();
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.sessionId !== sessionId) return;

      if (data.type === 'aider-output') {
        setMessages(prev => [...prev, {
          type: 'assistant',
          content: data.content,
          timestamp: Date.now()
        }]);
      }

      if (data.type === 'aider-started') {
        setIsRunning(true);
      }

      if (data.type === 'aider-stopped' || data.type === 'aider-close') {
        setIsRunning(false);
      }

      if (data.type === 'aider-error') {
        setMessages(prev => [...prev, {
          type: 'error',
          content: data.error,
          timestamp: Date.now()
        }]);
      }
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startSession = () => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'aider-start',
      projectPath,
      sessionId,
      options: {
        model: 'gpt-4',
        verbose: true
      }
    }));
  };

  const sendMessage = () => {
    if (!ws || !input.trim()) return;

    // Add user message to UI
    setMessages(prev => [...prev, {
      type: 'user',
      content: input,
      timestamp: Date.now()
    }]);

    // Send to Aider
    ws.send(JSON.stringify({
      type: 'aider-input',
      sessionId,
      input: input.trim()
    }));

    setInput('');
  };

  const stopSession = () => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'aider-stop',
      sessionId
    }));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">Aider Chat</h2>
        <div className="flex space-x-2">
          {!isRunning ? (
            <button
              onClick={startSession}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Start Session
            </button>
          ) : (
            <button
              onClick={stopSession}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Stop Session
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-3/4 px-4 py-2 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-500 text-white'
                  : message.type === 'error'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              {message.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            disabled={!isRunning}
            className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-700"
          />
          <button
            onClick={sendMessage}
            disabled={!isRunning || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 4.5: Add to Settings

Edit `/Users/elik.k/git/claudecodeui/src/components/Settings.jsx`:

```jsx
function Settings() {
  const [aiderInstalled, setAiderInstalled] = useState(false);

  useEffect(() => {
    checkAiderInstallation();
  }, []);

  const checkAiderInstallation = async () => {
    const response = await fetch('/api/aider/installed', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    setAiderInstalled(data.installed);
  };

  return (
    <div>
      {/* Other settings */}

      <div className="border-t pt-4 mt-4">
        <h3 className="font-semibold mb-2">CLI Integrations</h3>

        <div className="flex items-center justify-between py-2">
          <span>Aider CLI</span>
          <span className={aiderInstalled ? 'text-green-600' : 'text-red-600'}>
            {aiderInstalled ? 'Installed' : 'Not Installed'}
          </span>
        </div>

        {!aiderInstalled && (
          <p className="text-sm text-gray-500">
            Install Aider: <code>pip install aider-chat</code>
          </p>
        )}
      </div>
    </div>
  );
}
```

---

## 5. Adding a New WebSocket Message Type

### Example: Adding Presence/Typing Indicators

Show when other users are viewing the same session or typing (requires multi-user support).

### Step 5.1: Define Message Format

Document the new WebSocket message types:

```javascript
// Client → Server: User starts viewing a session
{
  type: 'presence-join',
  sessionId: 'abc123',
  userId: 'user1',
  username: 'Alice'
}

// Client → Server: User stops viewing a session
{
  type: 'presence-leave',
  sessionId: 'abc123',
  userId: 'user1'
}

// Client → Server: User is typing
{
  type: 'typing-start',
  sessionId: 'abc123',
  userId: 'user1'
}

// Client → Server: User stopped typing
{
  type: 'typing-stop',
  sessionId: 'abc123',
  userId: 'user1'
}

// Server → Clients: Presence update
{
  type: 'presence-update',
  sessionId: 'abc123',
  users: [
    { userId: 'user1', username: 'Alice' },
    { userId: 'user2', username: 'Bob' }
  ]
}

// Server → Clients: Typing indicator update
{
  type: 'typing-update',
  sessionId: 'abc123',
  typingUsers: [
    { userId: 'user2', username: 'Bob' }
  ]
}
```

### Step 5.2: Add Server-Side Handler

Edit `/Users/elik.k/git/claudecodeui/server/index.js`:

```javascript
// Track presence and typing state
const sessionPresence = new Map(); // sessionId -> Set of { ws, userId, username }
const typingUsers = new Map();     // sessionId -> Set of userIds

wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', async (message) => {
    const data = JSON.parse(message);

    // Handle presence join
    if (data.type === 'presence-join') {
      const { sessionId, userId, username } = data;
      currentUser = { userId, username };

      if (!sessionPresence.has(sessionId)) {
        sessionPresence.set(sessionId, new Set());
      }

      sessionPresence.get(sessionId).add({ ws, userId, username });

      // Broadcast updated presence to all users in session
      broadcastPresence(sessionId);
    }

    // Handle presence leave
    if (data.type === 'presence-leave') {
      const { sessionId, userId } = data;

      if (sessionPresence.has(sessionId)) {
        const users = sessionPresence.get(sessionId);
        for (const user of users) {
          if (user.userId === userId) {
            users.delete(user);
            break;
          }
        }

        if (users.size === 0) {
          sessionPresence.delete(sessionId);
        } else {
          broadcastPresence(sessionId);
        }
      }
    }

    // Handle typing start
    if (data.type === 'typing-start') {
      const { sessionId, userId } = data;

      if (!typingUsers.has(sessionId)) {
        typingUsers.set(sessionId, new Set());
      }

      typingUsers.get(sessionId).add(userId);
      broadcastTyping(sessionId);

      // Auto-stop typing after 5 seconds
      setTimeout(() => {
        if (typingUsers.has(sessionId)) {
          typingUsers.get(sessionId).delete(userId);
          broadcastTyping(sessionId);
        }
      }, 5000);
    }

    // Handle typing stop
    if (data.type === 'typing-stop') {
      const { sessionId, userId } = data;

      if (typingUsers.has(sessionId)) {
        typingUsers.get(sessionId).delete(userId);
        broadcastTyping(sessionId);
      }
    }
  });

  // Clean up on disconnect
  ws.on('close', () => {
    if (currentUser) {
      // Remove from all sessions
      sessionPresence.forEach((users, sessionId) => {
        for (const user of users) {
          if (user.ws === ws) {
            users.delete(user);
            if (users.size === 0) {
              sessionPresence.delete(sessionId);
            } else {
              broadcastPresence(sessionId);
            }
            break;
          }
        }
      });

      // Remove from typing
      typingUsers.forEach((users, sessionId) => {
        if (users.has(currentUser.userId)) {
          users.delete(currentUser.userId);
          broadcastTyping(sessionId);
        }
      });
    }
  });
});

function broadcastPresence(sessionId) {
  if (!sessionPresence.has(sessionId)) return;

  const users = Array.from(sessionPresence.get(sessionId)).map(u => ({
    userId: u.userId,
    username: u.username
  }));

  const message = JSON.stringify({
    type: 'presence-update',
    sessionId,
    users
  });

  // Send to all users in the session
  sessionPresence.get(sessionId).forEach(user => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
}

function broadcastTyping(sessionId) {
  if (!sessionPresence.has(sessionId)) return;
  if (!typingUsers.has(sessionId)) return;

  const typing = Array.from(typingUsers.get(sessionId));

  // Get usernames for typing users
  const typingUsersData = Array.from(sessionPresence.get(sessionId))
    .filter(u => typing.includes(u.userId))
    .map(u => ({ userId: u.userId, username: u.username }));

  const message = JSON.stringify({
    type: 'typing-update',
    sessionId,
    typingUsers: typingUsersData
  });

  // Send to all users in the session
  sessionPresence.get(sessionId).forEach(user => {
    if (user.ws.readyState === WebSocket.OPEN) {
      user.ws.send(message);
    }
  });
}
```

### Step 5.3: Add Client-Side Sender

Edit `/Users/elik.k/git/claudecodeui/src/contexts/WebSocketContext.jsx`:

```jsx
export function WebSocketProvider({ children }) {
  const [ws, setWs] = useState(null);
  const [presence, setPresence] = useState(new Map()); // sessionId -> users[]
  const [typing, setTyping] = useState(new Map());     // sessionId -> users[]

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'presence-update') {
        setPresence(prev => new Map(prev).set(data.sessionId, data.users));
      }

      if (data.type === 'typing-update') {
        setTyping(prev => new Map(prev).set(data.sessionId, data.typingUsers));
      }

      // ... other message handlers
    };

    ws.addEventListener('message', handleMessage);
    return () => ws.removeEventListener('message', handleMessage);
  }, [ws]);

  const joinSession = useCallback((sessionId, userId, username) => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'presence-join',
      sessionId,
      userId,
      username
    }));
  }, [ws]);

  const leaveSession = useCallback((sessionId, userId) => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'presence-leave',
      sessionId,
      userId
    }));
  }, [ws]);

  const startTyping = useCallback((sessionId, userId) => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'typing-start',
      sessionId,
      userId
    }));
  }, [ws]);

  const stopTyping = useCallback((sessionId, userId) => {
    if (!ws) return;

    ws.send(JSON.stringify({
      type: 'typing-stop',
      sessionId,
      userId
    }));
  }, [ws]);

  const value = {
    ws,
    presence,
    typing,
    joinSession,
    leaveSession,
    startTyping,
    stopTyping,
    // ... other values
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
```

### Step 5.4: Use in Components

```jsx
import { useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { useAuth } from '../contexts/AuthContext';

function ChatInterface({ sessionId }) {
  const { user } = useAuth();
  const { joinSession, leaveSession, presence, typing, startTyping, stopTyping } = useWebSocket();
  const [inputValue, setInputValue] = useState('');

  // Join session on mount
  useEffect(() => {
    if (sessionId && user) {
      joinSession(sessionId, user.id, user.username);

      return () => {
        leaveSession(sessionId, user.id);
      };
    }
  }, [sessionId, user, joinSession, leaveSession]);

  // Handle typing indicator
  useEffect(() => {
    if (!inputValue || !sessionId || !user) return;

    startTyping(sessionId, user.id);

    const timeout = setTimeout(() => {
      stopTyping(sessionId, user.id);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [inputValue, sessionId, user, startTyping, stopTyping]);

  const sessionPresence = presence.get(sessionId) || [];
  const sessionTyping = typing.get(sessionId) || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header with presence indicator */}
      <div className="p-4 border-b">
        <h2>Chat Session</h2>
        {sessionPresence.length > 0 && (
          <div className="text-sm text-gray-500 flex items-center space-x-2">
            <span>Viewing:</span>
            {sessionPresence.map(u => (
              <span key={u.userId} className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                {u.username}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {/* Message list */}
      </div>

      {/* Typing indicator */}
      {sessionTyping.length > 0 && (
        <div className="px-4 py-2 text-sm text-gray-500">
          {sessionTyping.map(u => u.username).join(', ')} {sessionTyping.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Type a message..."
        />
      </div>
    </div>
  );
}
```

---

## 6. Common Pitfalls

### Pitfall 1: Not Updating Session Protection Logic

**Problem:** Adding a feature that updates projects automatically without respecting active sessions.

**Example:**
```javascript
// BAD: This will interrupt active conversations
watcher.on('change', async () => {
  const projects = await getProjects();
  wss.clients.forEach(client => {
    client.send(JSON.stringify({ type: 'project-update', projects }));
  });
});
```

**Solution:** Check active sessions before broadcasting:
```javascript
// GOOD: Respects active sessions
watcher.on('change', async () => {
  const projects = await getProjects();

  wss.clients.forEach(client => {
    // Only send if client has no active sessions
    if (!client.hasActiveSessions) {
      client.send(JSON.stringify({ type: 'project-update', projects }));
    }
  });
});
```

### Pitfall 2: Forgetting Authentication Middleware

**Problem:** Creating API endpoints without authentication.

**Example:**
```javascript
// BAD: Unprotected endpoint
router.get('/api/projects', async (req, res) => {
  const projects = await getProjects();
  res.json(projects);
});
```

**Solution:** Always add `authenticateToken` middleware:
```javascript
// GOOD: Protected endpoint
import { authenticateToken } from '../middleware/auth.js';

router.get('/api/projects', authenticateToken, async (req, res) => {
  const projects = await getProjects();
  res.json(projects);
});
```

### Pitfall 3: Not Handling Mobile Responsive Layout

**Problem:** Adding components that only work on desktop.

**Example:**
```jsx
// BAD: Fixed widths don't work on mobile
<div className="w-96 h-screen">
  <FeaturePanel />
</div>
```

**Solution:** Use responsive Tailwind classes:
```jsx
// GOOD: Responsive sizing
<div className="w-full md:w-96 h-screen">
  <FeaturePanel />
</div>

// Or use viewport units
<div className="w-screen md:w-96 h-screen">
  <FeaturePanel />
</div>
```

### Pitfall 4: Missing Error Handling

**Problem:** Not handling errors in async operations.

**Example:**
```javascript
// BAD: Errors crash the app
async function loadProjects() {
  const response = await fetch('/api/projects');
  const data = await response.json();
  setProjects(data.projects);
}
```

**Solution:** Always use try-catch:
```javascript
// GOOD: Errors are handled gracefully
async function loadProjects() {
  try {
    const response = await fetch('/api/projects');

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    setProjects(data.projects);
  } catch (error) {
    console.error('Failed to load projects:', error);
    setError('Failed to load projects. Please try again.');
  }
}
```

### Pitfall 5: Not Clearing Caches After Updates

**Problem:** Creating/updating data but not invalidating cached responses.

**Example:**
```javascript
// BAD: Cache not cleared after update
router.post('/api/projects', async (req, res) => {
  const project = await createProject(req.body);
  res.json(project);
});
```

**Solution:** Invalidate cache after mutations:
```javascript
// GOOD: Cache cleared after update
import { cache } from '../cache.js';

router.post('/api/projects', async (req, res) => {
  const project = await createProject(req.body);

  // Invalidate projects cache
  cache.del('projects:all');
  cache.del(`projects:${project.id}`);

  res.json(project);
});
```

### Pitfall 6: WebSocket Memory Leaks

**Problem:** Not removing WebSocket event listeners.

**Example:**
```javascript
// BAD: Event listeners accumulate on every render
useEffect(() => {
  ws.addEventListener('message', handleMessage);
  // Missing cleanup!
}, [ws]);
```

**Solution:** Always clean up event listeners:
```javascript
// GOOD: Event listeners removed on unmount
useEffect(() => {
  if (!ws) return;

  ws.addEventListener('message', handleMessage);

  return () => {
    ws.removeEventListener('message', handleMessage);
  };
}, [ws]);
```

### Pitfall 7: Not Handling Missing Dependencies

**Problem:** Assuming CLIs or tools are always installed.

**Example:**
```javascript
// BAD: Crashes if Claude CLI not installed
const claudeProcess = spawn('claude', args);
```

**Solution:** Check installation first:
```javascript
// GOOD: Graceful handling of missing CLI
async function isClaudeInstalled() {
  return new Promise((resolve) => {
    const which = spawn('which', ['claude']);
    which.on('close', (code) => resolve(code === 0));
  });
}

const installed = await isClaudeInstalled();
if (!installed) {
  return res.status(503).json({
    error: 'Claude CLI is not installed',
    installUrl: 'https://claude.ai/download'
  });
}

const claudeProcess = spawn('claude', args);
```

### Pitfall 8: Hardcoding Paths

**Problem:** Using hardcoded file system paths.

**Example:**
```javascript
// BAD: Hardcoded path breaks on Windows
const projectsDir = '~/.claude/projects';
```

**Solution:** Use path utilities:
```javascript
// GOOD: Cross-platform paths
import path from 'path';
import os from 'os';

const projectsDir = path.join(os.homedir(), '.claude', 'projects');
```

---

## 7. Testing Your Feature

### Manual Testing Checklist

#### Authentication
- [ ] Feature works for authenticated users
- [ ] Feature blocks unauthenticated users
- [ ] Proper error message shown for auth failures
- [ ] Token expiration handled gracefully

#### Mobile Responsive
- [ ] Feature works on mobile (375px width)
- [ ] Feature works on tablet (768px width)
- [ ] Feature works on desktop (1024px+ width)
- [ ] Touch interactions work on mobile
- [ ] No horizontal scrolling on mobile
- [ ] Safe area insets respected (notched devices)

#### WebSocket
- [ ] Feature works when WebSocket is connected
- [ ] Feature handles WebSocket disconnection
- [ ] Feature handles WebSocket reconnection
- [ ] No memory leaks (event listeners cleaned up)
- [ ] Proper error messages for connection issues

#### Error Handling
- [ ] Network errors handled gracefully
- [ ] API errors show user-friendly messages
- [ ] Loading states shown during async operations
- [ ] Empty states shown when no data
- [ ] Rate limiting handled properly

#### Performance
- [ ] No unnecessary re-renders
- [ ] Large lists virtualized (if applicable)
- [ ] Images optimized and lazy loaded
- [ ] API responses cached (if applicable)
- [ ] Debouncing used for frequent operations

#### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Screen reader friendly (aria labels)
- [ ] Color contrast meets WCAG standards
- [ ] No motion for users who prefer reduced motion

#### Browser Compatibility
- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge

#### PWA Mode
- [ ] Feature works when installed as PWA
- [ ] Offline functionality (if applicable)
- [ ] Service worker caching works

### Automated Testing

#### Unit Tests Example (Vitest)

```javascript
// tests/utils/favoritesApi.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addFavorite, removeFavorite, getFavorites } from '../src/utils/favoritesApi';

// Mock fetch
global.fetch = vi.fn();

beforeEach(() => {
  fetch.mockClear();
  localStorage.setItem('token', 'test-token');
});

describe('Favorites API', () => {
  it('should fetch favorites', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        favorites: [{ project_id: 'proj1' }]
      })
    });

    const result = await getFavorites();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/favorites'),
      expect.objectContaining({
        headers: { 'Authorization': 'Bearer test-token' }
      })
    );

    expect(result.favorites).toHaveLength(1);
  });

  it('should add favorite', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true })
    });

    await addFavorite('proj1');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/favorites'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ projectId: 'proj1' })
      })
    );
  });

  it('should handle errors', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    await expect(getFavorites()).rejects.toThrow('Failed to fetch favorites');
  });
});
```

#### Component Tests Example (React Testing Library)

```javascript
// tests/components/BookmarksPanel.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BookmarksPanel from '../src/components/BookmarksPanel';

// Mock API
vi.mock('../src/utils/favoritesApi', () => ({
  getFavorites: vi.fn(() => Promise.resolve({
    favorites: [
      { id: 1, sessionTitle: 'Test Session', messageContent: 'Test message' }
    ]
  }))
}));

describe('BookmarksPanel', () => {
  it('should render loading state', () => {
    render(<BookmarksPanel currentProjectId="proj1" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should render bookmarks after loading', async () => {
    render(<BookmarksPanel currentProjectId="proj1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });
  });

  it('should show empty state when no bookmarks', async () => {
    vi.mocked(getFavorites).mockResolvedValueOnce({ favorites: [] });

    render(<BookmarksPanel currentProjectId="proj1" />);

    await waitFor(() => {
      expect(screen.getByText('No bookmarks yet')).toBeInTheDocument();
    });
  });

  it('should remove bookmark on click', async () => {
    const user = userEvent.setup();
    render(<BookmarksPanel currentProjectId="proj1" />);

    await waitFor(() => {
      expect(screen.getByText('Test Session')).toBeInTheDocument();
    });

    const deleteButton = screen.getByTitle('Remove bookmark');
    await user.click(deleteButton);

    await waitFor(() => {
      expect(screen.queryByText('Test Session')).not.toBeInTheDocument();
    });
  });
});
```

#### Integration Tests Example (Playwright)

```javascript
// tests/e2e/bookmarks.spec.js
import { test, expect } from '@playwright/test';

test.describe('Bookmarks Feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'admin');
    await page.click('button[type="submit"]');
  });

  test('should add bookmark', async ({ page }) => {
    // Navigate to chat
    await page.click('text=Test Project');
    await page.click('text=Test Session');

    // Hover over message to show actions
    await page.hover('.message-container:first-child');

    // Click bookmark button
    await page.click('button[title="Add bookmark"]');

    // Verify bookmark added
    await expect(page.locator('button[title="Remove bookmark"]')).toBeVisible();
  });

  test('should view bookmarks', async ({ page }) => {
    // Navigate to bookmarks panel
    await page.click('text=Bookmarks');

    // Verify bookmarks list visible
    await expect(page.locator('.bookmarks-list')).toBeVisible();
  });

  test('should navigate to bookmarked message', async ({ page }) => {
    await page.click('text=Bookmarks');
    await page.click('.bookmark-item:first-child button[title="Go to message"]');

    // Verify navigated to correct session
    await expect(page).toHaveURL(/\/chat\/[a-z0-9]+/);
  });
});
```

---

## 8. Feature Implementation Checklist

Use this checklist for every new feature:

### Planning Phase
- [ ] Define feature requirements and user stories
- [ ] Review existing architecture and patterns
- [ ] Identify which components/files need modification
- [ ] Plan database schema changes (if applicable)
- [ ] Design API endpoints (if applicable)
- [ ] Create mockups/wireframes (for UI features)

### Development Phase - Backend
- [ ] Create route file in `server/routes/`
- [ ] Add authentication middleware
- [ ] Implement input validation
- [ ] Add error handling
- [ ] Add logging
- [ ] Mount route in `server/index.js`
- [ ] Update database schema (if applicable)
- [ ] Add WebSocket handlers (if applicable)
- [ ] Test with Postman/curl

### Development Phase - Frontend
- [ ] Create component files
- [ ] Add to parent components
- [ ] Create Context (if needed)
- [ ] Add to Context hierarchy
- [ ] Create API utility functions
- [ ] Add to navigation (sidebar + mobile)
- [ ] Add loading states
- [ ] Add error states
- [ ] Add empty states
- [ ] Make responsive (mobile/tablet/desktop)
- [ ] Test in browser DevTools mobile view

### Testing Phase
- [ ] Write unit tests (utilities, pure functions)
- [ ] Write component tests (React Testing Library)
- [ ] Write integration tests (API endpoints)
- [ ] Write E2E tests (critical user flows)
- [ ] Test authentication scenarios
- [ ] Test error scenarios
- [ ] Test mobile responsiveness
- [ ] Test WebSocket reconnection
- [ ] Test browser compatibility
- [ ] Test PWA mode

### Polish Phase
- [ ] Add keyboard shortcuts (if applicable)
- [ ] Add accessibility attributes (aria labels)
- [ ] Optimize performance (memoization, virtualization)
- [ ] Add animations/transitions
- [ ] Verify color contrast (WCAG AA)
- [ ] Test with screen reader

### Documentation Phase
- [ ] Update `CLAUDE.md` with new patterns
- [ ] Add JSDoc comments to functions
- [ ] Document API endpoints
- [ ] Document WebSocket messages
- [ ] Update README (if user-facing feature)
- [ ] Add inline code comments for complex logic

### Deployment Phase
- [ ] Run `npm run build` and verify no errors
- [ ] Test production build with `npm run preview`
- [ ] Update migration scripts (if DB changes)
- [ ] Create pull request with detailed description
- [ ] Request code review
- [ ] Address review feedback
- [ ] Merge to main branch
- [ ] Monitor for errors in production

---

## Quick Reference: File Locations

```
/Users/elik.k/git/claudecodeui/
├── server/
│   ├── index.js                 # Main server, WebSocket setup
│   ├── database/
│   │   └── db.js                # SQLite database initialization
│   ├── middleware/
│   │   └── auth.js              # Authentication middleware
│   ├── routes/
│   │   ├── auth.js              # Authentication endpoints
│   │   ├── git.js               # Git operations
│   │   ├── mcp.js               # MCP server management
│   │   └── [your-route].js      # Your new routes here
│   ├── claude-cli.js            # Claude CLI integration
│   ├── cursor-cli.js            # Cursor CLI integration
│   └── projects.js              # Project discovery logic
│
├── src/
│   ├── App.jsx                  # Main app component
│   ├── contexts/
│   │   ├── AuthContext.jsx
│   │   ├── WebSocketContext.jsx
│   │   ├── ThemeContext.jsx
│   │   └── [YourContext].jsx    # Your new contexts here
│   ├── components/
│   │   ├── ChatInterface.jsx    # Main chat component (3484 lines)
│   │   ├── MainContent.jsx      # Content area manager
│   │   ├── Sidebar.jsx          # Desktop sidebar
│   │   ├── MobileNav.jsx        # Mobile navigation
│   │   ├── FileTree.jsx         # File browser
│   │   ├── GitPanel.jsx         # Git operations
│   │   └── [YourComponent].jsx  # Your new components here
│   └── utils/
│       ├── api.js               # API utility functions
│       ├── websocket.js         # WebSocket utilities
│       └── [your-utils].js      # Your new utilities here
│
└── CLAUDE.md                    # Project documentation
```

---

## Conclusion

This guide provides a comprehensive framework for adding new features to Claude Code UI. Always follow the established patterns, respect the Session Protection System, and test thoroughly across devices and scenarios.

**Key Takeaways:**
1. Authentication is required for all API endpoints
2. Mobile responsiveness must be considered from the start
3. WebSocket event listeners must be cleaned up
4. Session Protection System must not be interrupted
5. Error handling is mandatory for all async operations
6. Testing should cover authentication, mobile, WebSocket, and error scenarios

**When in doubt:**
- Look at existing similar features for patterns
- Read the extensive documentation in `CLAUDE.md` and code comments
- Test on mobile devices early and often
- Handle errors gracefully with user-friendly messages

Happy coding!
