# Project Overview

## What is Claude Code UI?

Claude Code UI is a **web-based desktop and mobile interface** for [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) and [Cursor CLI](https://docs.cursor.com/en/cli/overview). It provides a responsive UI that works across devices, allowing users to interact with their AI coding sessions, manage projects, browse files, and work with Git from anywhere - desktop, tablet, or mobile.

**The core problem it solves**: While Claude Code and Cursor CLIs are powerful, they're terminal-only tools. This project brings a full-featured UI layer on top of these CLIs, enabling:
- Remote access to your coding sessions from any device
- Visual project and session management
- Interactive chat interface instead of terminal-only interaction
- Mobile-first responsive design
- File browsing and editing with syntax highlighting
- Git operations through a visual interface

## Tech Stack

### Frontend
- **React 18** - Modern functional components with hooks
- **Vite 7.0.4** - Fast build tool and dev server with hot module replacement
- **Tailwind CSS 3.4** - Utility-first CSS framework
- **React Router DOM 6.8** - Client-side routing with URL-based session management
- **CodeMirror** - Advanced code editor with syntax highlighting for multiple languages
- **xterm.js + xterm-addon-fit** - Terminal emulator for built-in shell
- **React Markdown** - Markdown rendering for chat messages
- **React Dropzone** - Drag-and-drop file uploads

### Backend
- **Node.js** (v20+ required) with ES modules
- **Express 4.18** - HTTP server and REST API
- **WebSocket (ws 8.14)** - Real-time bidirectional communication
- **node-pty 1.1.0-beta34** - Terminal emulation (PTY) for shell access
- **child_process / cross-spawn** - CLI process spawning and management

### Database
- **better-sqlite3 12.2** - SQLite for authentication and user management
- **bcrypt 6.0** - Password hashing

### File System & Utilities
- **chokidar 4.0** - File system watcher for real-time project updates
- **mime-types 3.0** - MIME type detection for file serving
- **multer 2.0** - Multipart form data handling (file uploads)

### Optional Integrations
- **OpenAI Whisper API** - Voice-to-text transcription
- **TaskMaster AI** - Advanced project management (optional external dependency)

## Project Structure

```
claudecodeui/
├── server/                      # Backend Node.js application
│   ├── index.js                 # Main Express server, WebSocket setup
│   ├── claude-cli.js            # Claude CLI process spawning
│   ├── cursor-cli.js            # Cursor CLI process spawning
│   ├── projects.js              # ⭐ Project discovery system (critical)
│   ├── database/
│   │   ├── db.js                # SQLite database initialization
│   │   └── init.sql             # Database schema
│   ├── middleware/
│   │   └── auth.js              # JWT authentication
│   ├── routes/
│   │   ├── auth.js              # Authentication endpoints
│   │   ├── git.js               # Git operations API
│   │   ├── cursor.js            # Cursor-specific endpoints
│   │   ├── mcp.js               # MCP server management
│   │   ├── mcp-utils.js         # MCP utilities
│   │   └── taskmaster.js        # TaskMaster integration
│   └── utils/
│       ├── mcp-detector.js      # Auto-detect MCP servers
│       └── taskmaster-websocket.js
│
├── src/                         # Frontend React application
│   ├── main.jsx                 # React app entry point
│   ├── App.jsx                  # ⭐ Main app component (729 lines)
│   ├── components/
│   │   ├── ChatInterface.jsx    # ⭐ Largest component (3484 lines)
│   │   ├── MainContent.jsx      # Content area container (576 lines)
│   │   ├── Sidebar.jsx          # Project/session navigation
│   │   ├── FileTree.jsx         # Interactive file browser
│   │   ├── GitPanel.jsx         # Git operations UI (1282 lines)
│   │   ├── StandaloneShell.jsx  # Terminal emulator
│   │   ├── Settings.jsx         # App configuration
│   │   ├── MobileNav.jsx        # Mobile bottom navigation
│   │   └── ui/                  # Reusable UI components
│   ├── contexts/                # React Context API state management
│   │   ├── WebSocketContext.jsx # WebSocket connection
│   │   ├── AuthContext.jsx      # Authentication state
│   │   ├── ThemeContext.jsx     # Dark/light mode
│   │   ├── TaskMasterContext.jsx
│   │   └── TasksSettingsContext.jsx
│   ├── hooks/                   # Custom React hooks
│   │   ├── useLocalStorage.jsx  # Persistent user preferences
│   │   ├── useVersionCheck.js   # GitHub release checking
│   │   └── useAudioRecorder.js  # Voice input support
│   └── utils/
│       ├── websocket.js         # ⭐ WebSocket hook implementation
│       ├── api.js               # HTTP API client
│       └── whisper.js           # Whisper integration
│
├── public/                      # Static assets
│   ├── manifest.json            # PWA manifest
│   ├── sw.js                    # Service worker for PWA
│   └── icons/                   # App icons
│
├── dist/                        # Production build output (generated)
├── .env                         # Environment configuration
├── package.json                 # Dependencies and scripts
├── vite.config.js               # Vite build configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── CLAUDE.md                    # ⭐ Project instructions for Claude
└── README.md                    # User documentation

Excluded from typical workflows:
├── node_modules/                # Dependencies (excluded from git)
└── .git/                        # Git metadata
```

## Entry Points

### Backend Entry Point
**File**: `server/index.js`
- Creates Express HTTP server
- Initializes WebSocket server with authentication
- Sets up file system watcher (chokidar) for `~/.claude/projects/`
- Mounts all API routes
- Serves React app in production
- **Port**: 3001 (configurable via `PORT` env var)

### Frontend Entry Point
**File**: `src/main.jsx`
- Renders React app into DOM
- Wraps app with provider hierarchy:
  ```
  ThemeProvider
    → AuthProvider
      → WebSocketProvider
        → TasksSettingsProvider
          → TaskMasterProvider
            → Router
  ```

### Main Application Logic
**File**: `src/App.jsx`
- Contains critical **Session Protection System** (see lines 1-19)
- Manages projects, sessions, and active tab state
- Handles URL-based routing (`/` and `/session/:sessionId`)
- Mobile vs desktop layout switching
- Real-time WebSocket message handling

## How to Run

### Development Mode (Recommended)
```bash
# Install dependencies first
npm install

# Run both client (Vite) and server (Express) concurrently
npm run dev
```
- Frontend dev server: `http://localhost:5173` (Vite)
- Backend API server: `http://localhost:3001` (Express)
- Hot reload enabled for both frontend and backend

### Server Only
```bash
npm run server
```
Runs backend only on port 3001

### Client Only
```bash
npm run client
```
Runs Vite dev server only on port 5173

### Production Build & Start
```bash
# Build frontend and start production server
npm start
# or separately:
npm run build    # Creates optimized build in dist/
npm run server   # Serves from dist/
```

### Quick Start (NPX)
```bash
# No installation required
npx @siteboon/claude-code-ui
```
Automatically opens in default browser

## Key Features at a Glance

1. **Responsive Design** - Desktop, tablet, mobile with touch gestures
2. **Dual CLI Support** - Works with both Claude Code and Cursor CLI
3. **Interactive Chat** - Streaming AI responses with WebSocket
4. **File Explorer** - Browse, edit, save files with syntax highlighting
5. **Git Explorer** - Stage, commit, branch management, diffs
6. **Terminal Emulator** - Built-in shell (xterm.js) for Claude/Cursor CLI
7. **Session Management** - Resume conversations, session history
8. **Authentication** - JWT-based with SQLite backend
9. **MCP Support** - Model Context Protocol server integration
10. **PWA Ready** - Add to home screen, works offline
11. **TaskMaster Integration** (Optional) - AI-powered project management

## Prerequisites

- **Node.js v20+** - Required for ES modules and modern JavaScript features
- **Claude CLI** - Installed and configured (`claude` command in PATH)
  - See: https://docs.anthropic.com/en/docs/claude-code
- **Cursor CLI** (Optional) - For Cursor integration
  - See: https://docs.cursor.com/en/cli/overview
- **Python** - Required for building native modules (node-pty, bcrypt, better-sqlite3)
- **C++ build tools** - For native module compilation
  - macOS: Xcode Command Line Tools
  - Windows: Visual Studio Build Tools
  - Linux: build-essential package

## Package Publishing

Published on npm as `@siteboon/claude-code-ui`
- Homepage: https://claudecodeui.siteboon.ai
- Repository: https://github.com/siteboon/claudecodeui
- License: GNU General Public License v3.0

## Quick Architecture Summary

```
┌──────────────────┐   HTTP/WebSocket   ┌──────────────────┐   Process Spawn   ┌──────────────────┐
│  React Frontend  │◄─────────────────►│  Express Backend │◄────────────────►│  Claude/Cursor   │
│  (Vite Dev)      │                    │  + WebSocket     │                   │  CLI Processes   │
└──────────────────┘                    └──────────────────┘                   └──────────────────┘
        │                                       │                                       │
        │                                       │                                       │
    Browser                               File System                          ~/.claude/projects/
    Local Storage                        Watcher (chokidar)                   ~/.cursor/chats/
    WebSocket Client                     SQLite Database
```

## Version Information

- **Current Version**: 1.8.12 (as of commit a100648, 2025-10-08)
- **Node Engine**: v20+
- **License**: GPL v3.0
