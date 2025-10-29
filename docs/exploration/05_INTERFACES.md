# 05_INTERFACES.md - API Endpoints and WebSocket Messages

## Overview

Claude Code UI exposes REST API endpoints and WebSocket connections for real-time communication. This document lists all endpoints, request/response formats, and WebSocket message types.

---

## 1. Authentication Endpoints

**Base Path:** `/api/auth`

### GET /api/auth/status

Check authentication status and setup requirements.

**Response:**
```json
{
  "needsSetup": false,
  "isAuthenticated": false
}
```

### POST /api/auth/register

Register the first user (single-user system).

**Request:**
```json
{
  "username": "admin",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**
- `400`: Username/password validation failed
- `403`: User already exists
- `409`: Username conflict

### POST /api/auth/login

Authenticate and receive JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "securepassword123"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "admin"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:**
- `400`: Missing username/password
- `401`: Invalid credentials

### GET /api/auth/user

Get current authenticated user (protected).

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "created_at": "2025-10-29T10:00:00.000Z",
    "last_login": "2025-10-29T12:00:00.000Z"
  }
}
```

### POST /api/auth/logout

Logout (client-side token removal).

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

## 2. Project Endpoints

**Base Path:** `/api/projects`

All endpoints require authentication.

### GET /api/projects

List all discovered projects.

**Response:**
```json
[
  {
    "name": "Users-username-myproject",
    "path": "/Users/username/myproject",
    "displayName": "My Project",
    "fullPath": "/Users/username/myproject",
    "isCustomName": false,
    "sessions": [
      {
        "id": "session-123",
        "summary": "Create React component",
        "messageCount": 15,
        "lastActivity": "2025-10-29T12:00:00.000Z",
        "cwd": "/Users/username/myproject"
      }
    ],
    "sessionMeta": {
      "hasMore": true,
      "total": 25
    },
    "cursorSessions": [
      {
        "id": "cursor-session-456",
        "name": "Add authentication",
        "createdAt": "2025-10-28T10:00:00.000Z",
        "lastActivity": "2025-10-28T10:00:00.000Z",
        "messageCount": 8,
        "projectPath": "/Users/username/myproject"
      }
    ],
    "taskmaster": {
      "hasTaskmaster": true,
      "hasEssentialFiles": true,
      "metadata": {
        "taskCount": 12,
        "subtaskCount": 5,
        "completed": 8,
        "pending": 3,
        "inProgress": 1,
        "review": 0,
        "completionPercentage": 67,
        "lastModified": "2025-10-29T12:00:00.000Z"
      },
      "status": "configured"
    }
  }
]
```

### GET /api/projects/:projectName/sessions

List sessions for a project with pagination.

**Query Parameters:**
- `limit` (default: 5): Number of sessions to return
- `offset` (default: 0): Pagination offset

**Response:**
```json
{
  "sessions": [
    {
      "id": "session-123",
      "summary": "Create React component",
      "messageCount": 15,
      "lastActivity": "2025-10-29T12:00:00.000Z",
      "cwd": "/Users/username/myproject",
      "isGrouped": false
    }
  ],
  "hasMore": true,
  "total": 25,
  "offset": 0,
  "limit": 5
}
```

### GET /api/projects/:projectName/sessions/:sessionId/messages

Get messages for a specific session with pagination.

**Query Parameters:**
- `limit` (optional): Number of messages to return
- `offset` (default: 0): Pagination offset

**Response:**
```json
{
  "messages": [
    {
      "timestamp": "2025-10-29T10:30:45.123Z",
      "sessionId": "session-123",
      "cwd": "/Users/username/myproject",
      "type": "user",
      "message": {
        "role": "user",
        "content": "Create a React component"
      },
      "uuid": "msg-uuid-123",
      "parentUuid": null
    }
  ],
  "total": 30,
  "hasMore": false,
  "offset": 0,
  "limit": 50
}
```

### PUT /api/projects/:projectName/rename

Rename a project's display name.

**Request:**
```json
{
  "displayName": "My Custom Project Name"
}
```

**Response:**
```json
{
  "success": true
}
```

### DELETE /api/projects/:projectName/sessions/:sessionId

Delete a session from a project.

**Response:**
```json
{
  "success": true
}
```

**Errors:**
- `404`: Session not found

### DELETE /api/projects/:projectName

Delete an empty project.

**Response:**
```json
{
  "success": true
}
```

**Errors:**
- `400`: Project is not empty
- `404`: Project not found

### POST /api/projects/create

Manually add a project.

**Request:**
```json
{
  "path": "/Users/username/myproject"
}
```

**Response:**
```json
{
  "success": true,
  "project": {
    "name": "Users-username-myproject",
    "path": "/Users/username/myproject",
    "fullPath": "/Users/username/myproject",
    "displayName": "myproject",
    "isManuallyAdded": true,
    "sessions": [],
    "cursorSessions": []
  }
}
```

### GET /api/browse-filesystem

Browse filesystem for project suggestions.

**Query Parameters:**
- `path` (optional): Directory path to browse (defaults to home directory)

**Response:**
```json
{
  "path": "/Users/username",
  "suggestions": [
    {
      "path": "/Users/username/Desktop",
      "name": "Desktop",
      "type": "directory"
    },
    {
      "path": "/Users/username/Projects",
      "name": "Projects",
      "type": "directory"
    }
  ]
}
```

---

## 3. File Operations Endpoints

### GET /api/projects/:projectName/file

Read file content.

**Query Parameters:**
- `filePath`: Absolute path to file

**Response:**
```json
{
  "content": "file contents here...",
  "path": "/Users/username/myproject/src/App.jsx"
}
```

**Errors:**
- `400`: Invalid file path
- `403`: Permission denied
- `404`: File not found

### GET /api/projects/:projectName/files/content

Serve binary file content (images, etc.).

**Query Parameters:**
- `path`: Absolute path to file

**Response:**
Binary file stream with appropriate `Content-Type` header.

### PUT /api/projects/:projectName/file

Save file content.

**Request:**
```json
{
  "filePath": "/Users/username/myproject/src/App.jsx",
  "content": "updated file contents..."
}
```

**Response:**
```json
{
  "success": true,
  "path": "/Users/username/myproject/src/App.jsx",
  "message": "File saved successfully"
}
```

**Note:** Creates backup with `.backup.{timestamp}` extension.

### GET /api/projects/:projectName/files

Get file tree for a project.

**Response:**
```json
[
  {
    "name": "src",
    "path": "/Users/username/myproject/src",
    "type": "directory",
    "size": 0,
    "modified": "2025-10-29T10:00:00.000Z",
    "permissions": "755",
    "permissionsRwx": "rwxr-xr-x",
    "children": [
      {
        "name": "App.jsx",
        "path": "/Users/username/myproject/src/App.jsx",
        "type": "file",
        "size": 1024,
        "modified": "2025-10-29T10:00:00.000Z",
        "permissions": "644",
        "permissionsRwx": "rw-r--r--"
      }
    ]
  }
]
```

---

## 4. Git Endpoints

**Base Path:** `/api/git`

All endpoints require authentication.

### GET /api/git/status

Get git status for a project.

**Query Parameters:**
- `project`: Project name

**Response:**
```json
{
  "branch": "main",
  "modified": ["src/App.jsx", "package.json"],
  "added": ["src/NewComponent.jsx"],
  "deleted": [],
  "untracked": ["test.txt"]
}
```

**Error Response:**
```json
{
  "error": "Not a git repository",
  "details": "This directory does not contain a .git folder"
}
```

### GET /api/git/diff

Get diff for a specific file.

**Query Parameters:**
- `project`: Project name
- `file`: File path

**Response:**
```json
{
  "diff": "--- a/src/App.jsx\n+++ b/src/App.jsx\n@@ -1,3 +1,4 @@\n+import React from 'react';\n..."
}
```

### POST /api/git/commit

Commit changes.

**Request:**
```json
{
  "project": "Users-username-myproject",
  "message": "Add new component",
  "files": ["src/App.jsx", "src/NewComponent.jsx"]
}
```

**Response:**
```json
{
  "success": true,
  "output": "[main abc1234] Add new component\n 2 files changed, 50 insertions(+)"
}
```

### GET /api/git/branches

List all branches.

**Query Parameters:**
- `project`: Project name

**Response:**
```json
{
  "branches": ["main", "feature/new-ui", "bugfix/issue-123"]
}
```

### POST /api/git/checkout

Checkout a branch.

**Request:**
```json
{
  "project": "Users-username-myproject",
  "branch": "feature/new-ui"
}
```

**Response:**
```json
{
  "success": true,
  "output": "Switched to branch 'feature/new-ui'"
}
```

### POST /api/git/create-branch

Create and checkout a new branch.

**Request:**
```json
{
  "project": "Users-username-myproject",
  "branch": "feature/new-feature"
}
```

**Response:**
```json
{
  "success": true,
  "output": "Switched to a new branch 'feature/new-feature'"
}
```

### GET /api/git/commits

Get recent commits.

**Query Parameters:**
- `project`: Project name
- `limit` (default: 10): Number of commits

**Response:**
```json
{
  "commits": [
    {
      "hash": "abc1234",
      "author": "John Doe",
      "email": "john@example.com",
      "date": "2 hours ago",
      "message": "Add new component",
      "stats": "2 files changed, 50 insertions(+)"
    }
  ]
}
```

### GET /api/git/commit-diff

Get diff for a specific commit.

**Query Parameters:**
- `project`: Project name
- `commit`: Commit hash

**Response:**
```json
{
  "diff": "commit abc1234\nAuthor: John Doe <john@example.com>\n..."
}
```

### GET /api/git/remote-status

Get remote status (ahead/behind commits).

**Query Parameters:**
- `project`: Project name

**Response:**
```json
{
  "hasRemote": true,
  "hasUpstream": true,
  "branch": "main",
  "remoteBranch": "origin/main",
  "remoteName": "origin",
  "ahead": 2,
  "behind": 0,
  "isUpToDate": false
}
```

### POST /api/git/fetch

Fetch from remote.

**Request:**
```json
{
  "project": "Users-username-myproject"
}
```

**Response:**
```json
{
  "success": true,
  "output": "Fetch completed successfully",
  "remoteName": "origin"
}
```

### POST /api/git/pull

Pull from remote.

**Request:**
```json
{
  "project": "Users-username-myproject"
}
```

**Response:**
```json
{
  "success": true,
  "output": "Already up to date.",
  "remoteName": "origin",
  "remoteBranch": "main"
}
```

**Error Response:**
```json
{
  "error": "Merge conflicts detected",
  "details": "Pull created merge conflicts. Please resolve conflicts manually in the editor, then commit the changes."
}
```

### POST /api/git/push

Push to remote.

**Request:**
```json
{
  "project": "Users-username-myproject"
}
```

**Response:**
```json
{
  "success": true,
  "output": "Everything up-to-date",
  "remoteName": "origin",
  "remoteBranch": "main"
}
```

### POST /api/git/publish

Publish branch to remote (set upstream and push).

**Request:**
```json
{
  "project": "Users-username-myproject",
  "branch": "feature/new-feature"
}
```

**Response:**
```json
{
  "success": true,
  "output": "Branch 'feature/new-feature' set up to track remote branch 'feature/new-feature' from 'origin'.",
  "remoteName": "origin",
  "branch": "feature/new-feature"
}
```

### POST /api/git/discard

Discard changes for a specific file.

**Request:**
```json
{
  "project": "Users-username-myproject",
  "file": "src/App.jsx"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Changes discarded for src/App.jsx"
}
```

### POST /api/git/delete-untracked

Delete an untracked file.

**Request:**
```json
{
  "project": "Users-username-myproject",
  "file": "test.txt"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Untracked file test.txt deleted successfully"
}
```

---

## 5. MCP (Model Context Protocol) Endpoints

**Base Path:** `/api/mcp`

### GET /api/mcp/cli/list

List MCP servers using Claude CLI.

**Response:**
```json
{
  "success": true,
  "output": "test: test test - ✗ Failed to connect\nserver-name: command - ✓ Connected",
  "servers": [
    {
      "name": "test",
      "type": "stdio",
      "status": "failed",
      "description": "test test"
    },
    {
      "name": "server-name",
      "type": "stdio",
      "status": "connected",
      "description": "command"
    }
  ]
}
```

### POST /api/mcp/cli/add

Add MCP server using Claude CLI.

**Request:**
```json
{
  "name": "my-server",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-example"],
  "env": {
    "API_KEY": "secret"
  },
  "scope": "user"
}
```

**For HTTP/SSE:**
```json
{
  "name": "http-server",
  "type": "http",
  "url": "http://localhost:3000",
  "headers": {
    "Authorization": "Bearer token"
  },
  "scope": "user"
}
```

**Response:**
```json
{
  "success": true,
  "output": "MCP server added successfully",
  "message": "MCP server \"my-server\" added successfully"
}
```

### POST /api/mcp/cli/add-json

Add MCP server using JSON format.

**Request:**
```json
{
  "name": "my-server",
  "jsonConfig": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-example"],
    "env": {
      "API_KEY": "secret"
    }
  },
  "scope": "user"
}
```

**Response:**
```json
{
  "success": true,
  "output": "MCP server added successfully",
  "message": "MCP server \"my-server\" added successfully via JSON"
}
```

### DELETE /api/mcp/cli/remove/:name

Remove MCP server using Claude CLI.

**Query Parameters:**
- `scope`: "user" or "local"

**Response:**
```json
{
  "success": true,
  "output": "MCP server removed successfully",
  "message": "MCP server \"my-server\" removed successfully"
}
```

### GET /api/mcp/cli/get/:name

Get MCP server details.

**Response:**
```json
{
  "success": true,
  "output": "Server details...",
  "server": {
    "name": "my-server",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-example"]
  }
}
```

### GET /api/mcp/config/read

Read MCP servers directly from Claude config files.

**Response:**
```json
{
  "success": true,
  "configPath": "/Users/username/.claude.json",
  "servers": [
    {
      "id": "my-server",
      "name": "my-server",
      "type": "stdio",
      "scope": "user",
      "config": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-example"],
        "env": {}
      },
      "raw": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-example"]
      }
    }
  ]
}
```

---

## 6. Cursor Endpoints

**Base Path:** `/api/cursor`

### GET /api/cursor/config

Read Cursor CLI configuration.

**Response:**
```json
{
  "success": true,
  "config": {
    "version": 1,
    "model": {
      "modelId": "gpt-5",
      "displayName": "GPT-5"
    },
    "permissions": {
      "allow": [],
      "deny": []
    }
  },
  "path": "/Users/username/.cursor/cli-config.json"
}
```

### POST /api/cursor/config

Update Cursor CLI configuration.

**Request:**
```json
{
  "permissions": {
    "allow": ["read", "write"],
    "deny": ["delete"]
  },
  "model": {
    "modelId": "gpt-5",
    "displayName": "GPT-5"
  }
}
```

**Response:**
```json
{
  "success": true,
  "config": { /* updated config */ },
  "message": "Cursor configuration updated successfully"
}
```

### GET /api/cursor/mcp

Read Cursor MCP servers configuration.

**Response:**
```json
{
  "success": true,
  "servers": [
    {
      "id": "cursor-server",
      "name": "cursor-server",
      "type": "stdio",
      "scope": "cursor",
      "config": {
        "command": "npx",
        "args": ["-y", "server"],
        "env": {}
      },
      "raw": { /* raw config */ }
    }
  ],
  "path": "/Users/username/.cursor/mcp.json"
}
```

### POST /api/cursor/mcp/add

Add MCP server to Cursor configuration.

**Request:**
```json
{
  "name": "cursor-server",
  "type": "stdio",
  "command": "npx",
  "args": ["-y", "server"],
  "env": {}
}
```

**Response:**
```json
{
  "success": true,
  "message": "MCP server \"cursor-server\" added to Cursor configuration",
  "config": { /* updated config */ }
}
```

### DELETE /api/cursor/mcp/:name

Remove MCP server from Cursor configuration.

**Response:**
```json
{
  "success": true,
  "message": "MCP server \"cursor-server\" removed from Cursor configuration",
  "config": { /* updated config */ }
}
```

### POST /api/cursor/mcp/add-json

Add MCP server using JSON format.

**Request:**
```json
{
  "name": "cursor-server",
  "jsonConfig": {
    "command": "npx",
    "args": ["-y", "server"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "MCP server \"cursor-server\" added to Cursor configuration via JSON",
  "config": { /* updated config */ }
}
```

### GET /api/cursor/sessions

Get Cursor sessions from SQLite database.

**Query Parameters:**
- `projectPath`: Absolute path to project

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "cursor-session-456",
      "name": "Add authentication",
      "createdAt": "2025-10-28T10:00:00.000Z",
      "mode": "normal",
      "projectPath": "/Users/username/myproject",
      "lastMessage": "Let's implement JWT authentication...",
      "messageCount": 8
    }
  ],
  "cwdId": "a1b2c3d4e5f6...",
  "path": "/Users/username/.cursor/chats/a1b2c3d4e5f6..."
}
```

### GET /api/cursor/sessions/:sessionId

Get specific Cursor session from SQLite.

**Query Parameters:**
- `projectPath`: Absolute path to project

**Response:**
```json
{
  "success": true,
  "session": {
    "id": "cursor-session-456",
    "projectPath": "/Users/username/myproject",
    "messages": [
      {
        "id": "blob-123",
        "sequence": 1,
        "rowid": 1,
        "content": {
          "role": "user",
          "content": [
            {
              "type": "text",
              "text": "Add JWT authentication"
            }
          ]
        }
      }
    ],
    "metadata": {
      "agent": {
        "name": "Add authentication",
        "createdAt": 1730000000000,
        "mode": "normal",
        "agentId": "agent-123"
      }
    },
    "cwdId": "a1b2c3d4e5f6..."
  }
}
```

---

## 7. TaskMaster Endpoints

**Base Path:** `/api/taskmaster`

### GET /api/taskmaster/installation-status

Check if TaskMaster CLI is installed.

**Response:**
```json
{
  "success": true,
  "installation": {
    "isInstalled": true,
    "installPath": "/usr/local/bin/task-master",
    "version": "1.0.0",
    "reason": null
  },
  "mcpServer": {
    "hasMCPServer": true,
    "isConfigured": true,
    "configPath": "/Users/username/.claude.json"
  },
  "isReady": true
}
```

### GET /api/taskmaster/detect/:projectName

Detect TaskMaster configuration for a specific project.

**Response:**
```json
{
  "projectName": "Users-username-myproject",
  "projectPath": "/Users/username/myproject",
  "status": "fully-configured",
  "taskmaster": {
    "hasTaskmaster": true,
    "hasEssentialFiles": true,
    "files": {
      "tasks/tasks.json": true,
      "config.json": true
    },
    "metadata": {
      "taskCount": 12,
      "subtaskCount": 5,
      "completed": 8,
      "pending": 3,
      "inProgress": 1,
      "review": 0,
      "completionPercentage": 67,
      "lastModified": "2025-10-29T12:00:00.000Z"
    },
    "path": "/Users/username/myproject/.taskmaster"
  },
  "mcp": {
    "hasMCPServer": true,
    "isConfigured": true
  },
  "timestamp": "2025-10-29T12:00:00.000Z"
}
```

### GET /api/taskmaster/tasks/:projectName

Load actual tasks from .taskmaster/tasks/tasks.json.

**Response:**
```json
{
  "projectName": "Users-username-myproject",
  "projectPath": "/Users/username/myproject",
  "tasks": [
    {
      "id": "task-1",
      "title": "Implement user authentication",
      "description": "Add JWT-based authentication system",
      "status": "in-progress",
      "priority": "high",
      "dependencies": [],
      "createdAt": "2025-10-28T10:00:00.000Z",
      "updatedAt": "2025-10-29T12:00:00.000Z",
      "details": "Use bcrypt for password hashing...",
      "testStrategy": "Unit tests for auth functions",
      "subtasks": []
    }
  ],
  "currentTag": "master",
  "totalTasks": 12,
  "tasksByStatus": {
    "pending": 3,
    "in-progress": 1,
    "done": 8,
    "review": 0,
    "deferred": 0,
    "cancelled": 0
  },
  "timestamp": "2025-10-29T12:00:00.000Z"
}
```

### POST /api/taskmaster/init/:projectName

Initialize TaskMaster in a project.

**Response:**
```json
{
  "projectName": "Users-username-myproject",
  "projectPath": "/Users/username/myproject",
  "message": "TaskMaster initialized successfully",
  "output": "TaskMaster initialized...",
  "timestamp": "2025-10-29T12:00:00.000Z"
}
```

### POST /api/taskmaster/add-task/:projectName

Add a new task to the project.

**Request:**
```json
{
  "prompt": "Add user authentication with JWT",
  "priority": "high",
  "dependencies": "task-0"
}
```

**Response:**
```json
{
  "projectName": "Users-username-myproject",
  "projectPath": "/Users/username/myproject",
  "message": "Task added successfully",
  "output": "Task created...",
  "timestamp": "2025-10-29T12:00:00.000Z"
}
```

### PUT /api/taskmaster/update-task/:projectName/:taskId

Update a specific task.

**Request:**
```json
{
  "status": "done"
}
```

**Response:**
```json
{
  "projectName": "Users-username-myproject",
  "projectPath": "/Users/username/myproject",
  "taskId": "task-1",
  "message": "Task status updated successfully",
  "output": "Task updated...",
  "timestamp": "2025-10-29T12:00:00.000Z"
}
```

---

## 8. WebSocket Messages

### Connection

**URL:** `ws://localhost:3001/ws?token={jwt_token}`

**Alternative URL:** `ws://localhost:3001/shell?token={jwt_token}`

### Client → Server Messages

#### Claude Command

```json
{
  "type": "claude-command",
  "command": "Create a React component",
  "options": {
    "sessionId": "session-123",
    "projectPath": "Users-username-myproject",
    "cwd": "/Users/username/myproject",
    "resume": false,
    "toolsSettings": {
      "allowedTools": ["Read", "Write", "Edit"],
      "disallowedTools": [],
      "skipPermissions": false
    },
    "permissionMode": "default",
    "images": []
  }
}
```

#### Cursor Command

```json
{
  "type": "cursor-command",
  "command": "Add user authentication",
  "options": {
    "sessionId": "cursor-session-456",
    "cwd": "/Users/username/myproject",
    "resume": true,
    "model": "gpt-5",
    "skipPermissions": false
  }
}
```

#### Abort Session

```json
{
  "type": "abort-session",
  "sessionId": "session-123",
  "provider": "claude"
}
```

### Server → Client Messages

#### Session Created

```json
{
  "type": "session-created",
  "sessionId": "session-123"
}
```

#### Claude Response (Stream JSON)

```json
{
  "type": "claude-response",
  "data": {
    "type": "content_block_delta",
    "delta": {
      "type": "text_delta",
      "text": "I'll help you create a React component..."
    }
  }
}
```

```json
{
  "type": "claude-response",
  "data": {
    "type": "content_block_stop"
  }
}
```

#### Claude Output (Non-JSON)

```json
{
  "type": "claude-output",
  "data": "Raw text output from Claude CLI"
}
```

#### Claude Error

```json
{
  "type": "claude-error",
  "error": "Error message"
}
```

#### Claude Complete

```json
{
  "type": "claude-complete",
  "exitCode": 0,
  "isNewSession": true
}
```

#### Session Aborted

```json
{
  "type": "session-aborted",
  "sessionId": "session-123",
  "provider": "claude",
  "success": true
}
```

#### Projects Updated

```json
{
  "type": "projects_updated",
  "projects": [ /* project objects */ ],
  "timestamp": "2025-10-29T12:00:00.000Z",
  "changeType": "change",
  "changedFile": "Users-username-myproject/session-123.jsonl"
}
```

#### Cursor System

```json
{
  "type": "cursor-system",
  "data": {
    "type": "system",
    "subtype": "init",
    "session_id": "cursor-session-456",
    "model": "gpt-5",
    "cwd": "/Users/username/myproject"
  }
}
```

#### Cursor User

```json
{
  "type": "cursor-user",
  "data": {
    "type": "user",
    "message": {
      "role": "user",
      "content": "Add authentication"
    }
  }
}
```

#### Cursor Result

```json
{
  "type": "cursor-result",
  "data": {
    "type": "result",
    "subtype": "success"
  },
  "success": true
}
```

---

## Summary

Claude Code UI provides:

1. **REST API** for CRUD operations
   - Authentication (JWT-based)
   - Projects and sessions
   - File operations
   - Git operations
   - MCP server management
   - Cursor configuration
   - TaskMaster integration

2. **WebSocket** for real-time communication
   - Chat messages (Claude/Cursor)
   - Streaming responses
   - Session management
   - File system updates
   - Process control (abort)

3. **Authentication**
   - All API endpoints (except `/api/auth/*`) require JWT token
   - WebSocket connections require token in query parameter
   - Single-user system (only one user can register)

4. **Error Handling**
   - Consistent error response format
   - HTTP status codes (400, 401, 403, 404, 500)
   - Detailed error messages
