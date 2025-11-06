# Claude Code UI - Project Exploration Index

> **Documentation Generated:** 2025-10-28 21:56:00 UTC
> **Based on Commit:** a100648ccbaa4976d09629496f8e97b95075afbf (2025-10-08)
> **Check Freshness:** See [_METADATA.md](./_METADATA.md) for git state verification

---

## Executive Summary

Claude Code UI is a **responsive web-based interface** for Claude Code CLI and Cursor CLI, enabling remote access to AI coding sessions from any device. Built with React 18 + Vite on the frontend and Node.js + Express + WebSocket on the backend, it provides comprehensive project management, interactive chat, file browsing, Git operations, and terminal access.

**Key Innovation**: **Session Protection System** - Prevents automatic project updates from interrupting active conversations by tracking session state.

**Current Version**: 1.8.12 (as of 2025-10-08)
**Tech Stack**: React 18, Vite 7, Express 4, WebSocket (ws 8), SQLite (better-sqlite3), node-pty
**License**: GPL v3.0

---

## Quick Reference

### Essential Reading (Start Here)

1. **[01_OVERVIEW.md](./01_OVERVIEW.md)** - Project purpose, tech stack, how to run
2. **[02_ARCHITECTURE.md](./02_ARCHITECTURE.md)** - System design, components, patterns
3. **[15_IMPLEMENTATION_GUIDE.md](./15_IMPLEMENTATION_GUIDE.md)** - How to add features (practical guide)

### Core Documentation

| Document | What It Covers | Use When |
|----------|---------------|----------|
| [01_OVERVIEW.md](./01_OVERVIEW.md) | Tech stack, structure, entry points, how to run | First time exploring the project |
| [02_ARCHITECTURE.md](./02_ARCHITECTURE.md) | High-level design, components, patterns, data flow | Understanding system architecture |
| [03_DATA.md](./03_DATA.md) | Database schema, JSONL format, caching, data access | Working with data storage |
| [04_BUSINESS_LOGIC.md](./04_BUSINESS_LOGIC.md) | Project discovery, session management, protection system | Understanding core workflows |
| [05_INTERFACES.md](./05_INTERFACES.md) | REST API endpoints, WebSocket messages | Building integrations or API clients |
| [06_INTEGRATIONS.md](./06_INTEGRATIONS.md) | Claude/Cursor CLI, MCP, Whisper, TaskMaster | Working with external services |
| [07_FLOWS.md](./07_FLOWS.md) | Request lifecycles, complete workflows end-to-end | Debugging or understanding data flow |
| [08_CONFIG.md](./08_CONFIG.md) | Environment variables, configuration files | Setting up or deploying the app |
| [09_TESTING.md](./09_TESTING.md) | Test strategy, frameworks, examples | Adding tests (currently no tests exist) |
| [10_CONVENTIONS.md](./10_CONVENTIONS.md) | Naming, file organization, coding patterns | Writing new code or reviewing PRs |
| [11_SECURITY.md](./11_SECURITY.md) | JWT auth, bcrypt, path security, tools permissions | Security audit or hardening |
| [12_OPERATIONS.md](./12_OPERATIONS.md) | Build, deployment, monitoring, performance | Deploying to production |
| [13_EXAMPLES.md](./13_EXAMPLES.md) | Complete feature traces with code | Understanding how features work |
| [14_INSIGHTS.md](./14_INSIGHTS.md) | Strengths, concerns, recommendations | Architecture review or planning improvements |
| [15_IMPLEMENTATION_GUIDE.md](./15_IMPLEMENTATION_GUIDE.md) | Practical how-tos for adding features | Building new functionality |

---

## Documentation Structure

### Foundation (01-02)
Start here to understand what the project is and how it's built:
- **[01_OVERVIEW](./01_OVERVIEW.md)** - "What is this project?"
- **[02_ARCHITECTURE](./02_ARCHITECTURE.md)** - "How is it designed?"

### Technical Deep Dive (03-06)
Detailed technical documentation for developers:
- **[03_DATA](./03_DATA.md)** - Database, JSONL, data structures
- **[04_BUSINESS_LOGIC](./04_BUSINESS_LOGIC.md)** - Core workflows and logic
- **[05_INTERFACES](./05_INTERFACES.md)** - API contracts and WebSocket messages
- **[06_INTEGRATIONS](./06_INTEGRATIONS.md)** - External service integrations

### Practical Guides (07-12)
How things work and how to work with them:
- **[07_FLOWS](./07_FLOWS.md)** - Complete request/response flows
- **[08_CONFIG](./08_CONFIG.md)** - Configuration and environment setup
- **[09_TESTING](./09_TESTING.md)** - Testing strategy (to be implemented)
- **[10_CONVENTIONS](./10_CONVENTIONS.md)** - Code style and patterns
- **[11_SECURITY](./11_SECURITY.md)** - Security measures and best practices
- **[12_OPERATIONS](./12_OPERATIONS.md)** - Deployment and operations

### Analysis & Implementation (13-15)
Examples and guidance for extending the project:
- **[13_EXAMPLES](./13_EXAMPLES.md)** - Real feature implementations traced
- **[14_INSIGHTS](./14_INSIGHTS.md)** - Architectural analysis and recommendations
- **[15_IMPLEMENTATION_GUIDE](./15_IMPLEMENTATION_GUIDE.md)** - How to add features

---

## Key Findings

### Strengths
- ✅ **Excellent Documentation** - Critical files have extensive inline docs (e.g., `projects.js:1-58`)
- ✅ **Session Protection System** - Innovative solution to prevent UI disruption during conversations
- ✅ **Mobile-First Design** - Fully responsive with PWA support
- ✅ **Real-Time Architecture** - WebSocket-based with efficient file watching
- ✅ **Dual CLI Support** - Works with both Claude and Cursor seamlessly
- ✅ **Modular State Management** - Clean Context API usage

### Critical Concerns
- ⚠️ **No Test Coverage** - 0 tests in the entire codebase
- ⚠️ **ChatInterface.jsx is 3484 lines** - Needs urgent refactoring
- ⚠️ **Cursor Project Discovery Limitation** - MD5-based approach can't auto-discover Cursor-only projects
- ⚠️ **Native Module Dependencies** - Deployment complexity (node-pty, bcrypt, better-sqlite3)
- ⚠️ **Single-User Authentication** - Not designed for multi-tenant use

### Technical Debt
- Missing TypeScript (JavaScript only)
- Inconsistent error handling patterns
- No structured logging framework
- Missing request/response caching layer
- Incomplete error boundaries

### Recommendations (Prioritized)
1. **High Priority**: Add test suite (Vitest, Jest, Playwright)
2. **High Priority**: Refactor ChatInterface into smaller components
3. **Medium Priority**: Add TypeScript for type safety
4. **Medium Priority**: Implement structured logging (Winston/Pino)
5. **Low Priority**: Consider multi-tenant support for teams

---

## Critical Files

### Backend
- **`server/index.js`** (1169 lines) - Main server, WebSocket, routes
- **`server/projects.js`** (1063 lines) - ⭐ **CRITICAL** - Project discovery with extensive architecture docs (lines 1-58)
- **`server/claude-cli.js`** - Claude CLI process spawning
- **`server/cursor-cli.js`** - Cursor CLI process spawning
- **`server/database/db.js`** - SQLite authentication database

### Frontend
- **`src/App.jsx`** (729 lines) - Main app component with Session Protection System
- **`src/components/ChatInterface.jsx`** (3484 lines) - ⚠️ Largest component, needs refactoring
- **`src/components/MainContent.jsx`** (576 lines) - Content container
- **`src/components/Sidebar.jsx`** (1664 lines) - Project/session navigation
- **`src/components/GitPanel.jsx`** (1282 lines) - Git operations UI

### Configuration
- **`CLAUDE.md`** - Project instructions for Claude Code
- **`.env`** - Environment configuration (PORT, VITE_PORT, API keys)
- **`package.json`** - Dependencies and scripts

---

## Use Case Scenarios

### "I'm new to the project"
**Start with:**
1. [01_OVERVIEW.md](./01_OVERVIEW.md) - Understand what it does
2. [02_ARCHITECTURE.md](./02_ARCHITECTURE.md) - Learn the design
3. [13_EXAMPLES.md](./13_EXAMPLES.md) - See real features in action
4. [10_CONVENTIONS.md](./10_CONVENTIONS.md) - Learn coding patterns

### "I need to add a new feature"
**Read:**
1. [15_IMPLEMENTATION_GUIDE.md](./15_IMPLEMENTATION_GUIDE.md) - Step-by-step guide
2. [10_CONVENTIONS.md](./10_CONVENTIONS.md) - Follow existing patterns
3. [05_INTERFACES.md](./05_INTERFACES.md) - If adding API endpoints
4. [13_EXAMPLES.md](./13_EXAMPLES.md) - Reference existing features

### "I'm debugging an issue"
**Check:**
1. [07_FLOWS.md](./07_FLOWS.md) - Understand complete request/response flow
2. [13_EXAMPLES.md](./13_EXAMPLES.md) - See how features work end-to-end
3. [02_ARCHITECTURE.md](./02_ARCHITECTURE.md) - Component interactions
4. [04_BUSINESS_LOGIC.md](./04_BUSINESS_LOGIC.md) - Core logic and workflows

### "I'm deploying to production"
**Follow:**
1. [12_OPERATIONS.md](./12_OPERATIONS.md) - Build and deployment guide
2. [08_CONFIG.md](./08_CONFIG.md) - Environment setup
3. [11_SECURITY.md](./11_SECURITY.md) - Security hardening
4. [14_INSIGHTS.md](./14_INSIGHTS.md) - Production recommendations

### "I'm doing a security audit"
**Review:**
1. [11_SECURITY.md](./11_SECURITY.md) - Security measures implemented
2. [05_INTERFACES.md](./05_INTERFACES.md) - API endpoints and auth
3. [14_INSIGHTS.md](./14_INSIGHTS.md) - Security recommendations
4. [08_CONFIG.md](./08_CONFIG.md) - Secret management

### "I'm reviewing the architecture"
**Study:**
1. [02_ARCHITECTURE.md](./02_ARCHITECTURE.md) - System design
2. [14_INSIGHTS.md](./14_INSIGHTS.md) - Critical analysis
3. [04_BUSINESS_LOGIC.md](./04_BUSINESS_LOGIC.md) - Core workflows
4. [07_FLOWS.md](./07_FLOWS.md) - Data flow patterns

---

## Key Architectural Concepts

### 1. Session Protection System
**Where:** `App.jsx:62-66`, `App.jsx:436-474`

Tracks active sessions to prevent automatic project updates from clearing chat messages during conversations.

```javascript
const [activeSessions, setActiveSessions] = useState(new Set());

// Mark session active when user sends message
markSessionAsActive(sessionId);

// Mark inactive when conversation completes
markSessionAsInactive(sessionId);
```

**Documentation:** [04_BUSINESS_LOGIC.md](./04_BUSINESS_LOGIC.md#session-protection-system), [13_EXAMPLES.md](./13_EXAMPLES.md#example-2)

### 2. Project Discovery System
**Where:** `server/projects.js:1-58`

Discovers both Claude projects (`~/.claude/projects/`) and Cursor projects (`~/.cursor/chats/{md5}/`). Critical limitation: Cannot auto-discover Cursor-only projects due to MD5 hashing.

**Documentation:** [04_BUSINESS_LOGIC.md](./04_BUSINESS_LOGIC.md#project-discovery), [02_ARCHITECTURE.md](./02_ARCHITECTURE.md#backend-components)

### 3. Dual WebSocket Endpoints
**Where:** `server/index.js:520-536`

- `/ws` - Chat and project updates
- `/shell` - Terminal emulation (PTY)

Single WebSocket server routes based on URL path.

**Documentation:** [05_INTERFACES.md](./05_INTERFACES.md#websocket-messages), [07_FLOWS.md](./07_FLOWS.md#websocket-lifecycle)

### 4. JSONL Session Storage
**Where:** `server/projects.js:649-710`

Sessions stored as JSONL (JSON Lines), not JSON arrays. Each line is a separate JSON object.

**Documentation:** [03_DATA.md](./03_DATA.md#claude-session-data), [04_BUSINESS_LOGIC.md](./04_BUSINESS_LOGIC.md#session-management)

### 5. MD5-Based Cursor Discovery
**Where:** `server/projects.js:938-1046`

Cursor projects identified by MD5 hash of absolute project path. This makes auto-discovery impossible without knowing the path first.

**Documentation:** [04_BUSINESS_LOGIC.md](./04_BUSINESS_LOGIC.md#cursor-project-discovery), [14_INSIGHTS.md](./14_INSIGHTS.md#cursor-discovery)

---

## Quick Commands

```bash
# Development (recommended)
npm run dev              # Runs both client (Vite) and server (Express)

# Production
npm start                # Build + serve from dist/

# Individual services
npm run server           # Backend only (port 3001)
npm run client           # Frontend only (port 5173)
npm run build            # Build for production

# Quick start (no install)
npx @siteboon/claude-code-ui
```

---

## Technology Highlights

### Frontend
- React 18 (functional components + hooks)
- Vite 7 (fast build tool)
- Tailwind CSS (utility-first)
- CodeMirror (code editor)
- xterm.js (terminal emulator)
- React Router (URL-based routing)

### Backend
- Node.js 20+ (ES modules)
- Express 4 (HTTP server)
- WebSocket (ws 8) (real-time)
- better-sqlite3 (database)
- node-pty (terminal emulation)
- chokidar (file watching)

### Optional
- OpenAI Whisper (voice transcription)
- TaskMaster AI (project management)

---

## Documentation Freshness

⚠️ **Always check [_METADATA.md](./_METADATA.md) to verify if this documentation is current with the codebase.**

This documentation was generated based on:
- **Commit:** a100648ccbaa4976d09629496f8e97b95075afbf
- **Date:** 2025-10-08 06:37:46 +0200
- **Message:** Release 1.8.12

If significant commits have been made since then, consider regenerating this documentation using the `/project-explorer` command.

---

## Contributing to This Project

Before contributing, read:
1. [10_CONVENTIONS.md](./10_CONVENTIONS.md) - Code style and patterns
2. [15_IMPLEMENTATION_GUIDE.md](./15_IMPLEMENTATION_GUIDE.md) - How to add features
3. [09_TESTING.md](./09_TESTING.md) - Testing strategy
4. [README.md](../../README.md) - Contributing guidelines

---

## Additional Resources

- **Project Repository:** https://github.com/siteboon/claudecodeui
- **NPM Package:** https://www.npmjs.com/package/@siteboon/claude-code-ui
- **Homepage:** https://claudecodeui.siteboon.ai
- **Claude Code Docs:** https://docs.anthropic.com/en/docs/claude-code
- **Cursor CLI Docs:** https://docs.cursor.com/en/cli/overview

---

## Document Statistics

- **Total Documentation Files:** 16 (plus this index)
- **Total Documentation Words:** ~150,000+
- **Code Examples:** 200+
- **Diagrams:** 30+
- **API Endpoints Documented:** 40+
- **WebSocket Message Types:** 20+

---

*This documentation was generated to provide a comprehensive understanding of the Claude Code UI codebase for developers planning to extend, maintain, or deploy the application.*
