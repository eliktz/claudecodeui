# 09_TESTING.md - Test Frameworks and Patterns

This document outlines testing strategies, recommended frameworks, and patterns for Claude Code UI.

## Table of Contents

- [Current Testing Status](#current-testing-status)
- [Recommended Testing Strategy](#recommended-testing-strategy)
- [Frontend Testing (Vitest + React Testing Library)](#frontend-testing-vitest--react-testing-library)
- [Backend Testing (Jest + Supertest)](#backend-testing-jest--supertest)
- [E2E Testing (Playwright)](#e2e-testing-playwright)
- [Testing Patterns and Best Practices](#testing-patterns-and-best-practices)
- [CI/CD Integration](#cicd-integration)

---

## Current Testing Status

### No Tests Currently Implemented

As of version 1.8.12, Claude Code UI **does not have any tests**:

```json
// package.json - No test script
{
  "scripts": {
    "dev": "concurrently --kill-others \"npm run server\" \"npm run client\"",
    "server": "node server/index.js",
    "client": "vite --host",
    "build": "vite build",
    "preview": "vite preview",
    "start": "npm run build && npm run server"
    // ❌ No "test" script
  }
}
```

### Why Testing is Important

Given the complexity of Claude Code UI, tests would provide:

1. **Confidence in refactoring** - Large files (ChatInterface.jsx is 3484 lines) need safe refactoring
2. **Regression prevention** - Critical flows like Session Protection need safeguards
3. **Documentation** - Tests serve as executable documentation
4. **Faster development** - Quick feedback loop without manual testing
5. **Production stability** - Catch bugs before deployment

---

## Recommended Testing Strategy

### Test Pyramid

```
           /\
          /  \  E2E Tests (Playwright)
         /----\  - Critical user journeys
        /      \  - 5-10 tests
       /--------\
      /          \ Integration Tests (Jest + Supertest)
     /------------\ - API endpoints
    /              \ - WebSocket communication
   /----------------\ - CLI integration
  /                  \ - 20-30 tests
 /--------------------\
/______________________\ Unit Tests (Vitest + RTL)
                         - Components
                         - Utilities
                         - Hooks
                         - 50-100 tests
```

### Testing Priorities

**Priority 1 (Critical Flows):**
1. Authentication flow
2. Chat message flow
3. Session creation/resume
4. Project updates with Session Protection
5. WebSocket connection lifecycle

**Priority 2 (Important Features):**
1. File uploads
2. Terminal initialization
3. Git operations
4. Tools settings
5. MCP configuration

**Priority 3 (Nice to Have):**
1. UI components
2. Utility functions
3. Edge cases
4. Error handling

---

## Frontend Testing (Vitest + React Testing Library)

### Why Vitest?

- **Vite-native**: Shares Vite config, instant startup
- **Jest-compatible**: Drop-in replacement for Jest API
- **Fast**: ESM support, smart watch mode
- **Built-in**: Coverage, mocking, snapshots

### Installation

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### Configuration

**vitest.config.js:**
```javascript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      exclude: [
        'node_modules/',
        'dist/',
        'src/test/',
        '**/*.config.js'
      ]
    }
  }
});
```

**src/test/setup.js:**
```javascript
import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest expect with RTL matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {}
  })
});

// Mock localStorage
const localStorageMock = {
  getItem: (key) => null,
  setItem: (key, value) => {},
  removeItem: (key) => {},
  clear: () => {}
};
global.localStorage = localStorageMock;
```

### Example Component Tests

#### 1. Simple UI Component Test

```javascript
// src/components/__tests__/DarkModeToggle.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DarkModeToggle from '../DarkModeToggle';
import { ThemeProvider } from '../../contexts/ThemeContext';

describe('DarkModeToggle', () => {
  it('renders toggle button', () => {
    render(
      <ThemeProvider>
        <DarkModeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button', { name: /toggle dark mode/i });
    expect(button).toBeInTheDocument();
  });

  it('toggles theme on click', () => {
    render(
      <ThemeProvider>
        <DarkModeToggle />
      </ThemeProvider>
    );

    const button = screen.getByRole('button');

    // Initial state is light
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    // Click to dark mode
    fireEvent.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Click back to light mode
    fireEvent.click(button);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
```

#### 2. Hook Test

```javascript
// src/hooks/__tests__/useLocalStorage.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useLocalStorage from '../useLocalStorage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns initial value when no stored value exists', () => {
    const { result } = renderHook(() =>
      useLocalStorage('testKey', 'default')
    );

    expect(result.current[0]).toBe('default');
  });

  it('returns stored value when it exists', () => {
    localStorage.setItem('testKey', JSON.stringify('stored'));

    const { result } = renderHook(() =>
      useLocalStorage('testKey', 'default')
    );

    expect(result.current[0]).toBe('stored');
  });

  it('updates localStorage when value changes', () => {
    const { result } = renderHook(() =>
      useLocalStorage('testKey', 'initial')
    );

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');
    expect(localStorage.getItem('testKey')).toBe(JSON.stringify('updated'));
  });

  it('handles function updater', () => {
    const { result } = renderHook(() =>
      useLocalStorage('counter', 0)
    );

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(1);
  });
});
```

#### 3. Context Test

```javascript
// src/contexts/__tests__/AuthContext.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Mock fetch
global.fetch = vi.fn();

// Test component that uses auth context
function TestComponent() {
  const { isAuthenticated, user, login } = useAuth();

  return (
    <div>
      <div data-testid="auth-status">
        {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
      </div>
      {user && <div data-testid="username">{user.username}</div>}
      <button onClick={() => login('testuser', 'password')}>
        Login
      </button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('provides initial unauthenticated state', () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ needsSetup: false })
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('Not Authenticated');
  });

  it('authenticates user on successful login', async () => {
    // Mock auth status check
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ needsSetup: false })
    });

    // Mock login
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        token: 'test-token',
        user: { id: 1, username: 'testuser' }
      })
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Click login button
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
      expect(screen.getByTestId('username')).toHaveTextContent('testuser');
    });

    // Token should be stored
    expect(localStorage.getItem('auth-token')).toBe('test-token');
  });
});
```

#### 4. Complex Component Test

```javascript
// src/components/__tests__/ChatInterface.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInterface from '../ChatInterface';
import { WebSocketProvider } from '../../contexts/WebSocketContext';

// Mock WebSocket
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = WebSocket.OPEN;
    this.onmessage = null;
    this.onopen = null;
  }

  send(data) {
    this.lastSent = data;
  }

  close() {
    this.readyState = WebSocket.CLOSED;
  }

  // Simulate receiving message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data: JSON.stringify(data) });
    }
  }
}

global.WebSocket = MockWebSocket;

describe('ChatInterface', () => {
  const mockProject = {
    name: 'test-project',
    path: '/test/path',
    fullPath: '/test/path'
  };

  const mockSession = {
    id: 'test-session-id',
    summary: 'Test Session'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders input field and send button', () => {
    render(
      <WebSocketProvider>
        <ChatInterface
          selectedProject={mockProject}
          selectedSession={null}
        />
      </WebSocketProvider>
    );

    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('disables send button when input is empty', () => {
    render(
      <WebSocketProvider>
        <ChatInterface
          selectedProject={mockProject}
          selectedSession={null}
        />
      </WebSocketProvider>
    );

    const sendButton = screen.getByRole('button', { name: /send/i });
    expect(sendButton).toBeDisabled();
  });

  it('enables send button when input has text', async () => {
    const user = userEvent.setup();

    render(
      <WebSocketProvider>
        <ChatInterface
          selectedProject={mockProject}
          selectedSession={null}
        />
      </WebSocketProvider>
    );

    const input = screen.getByPlaceholderText(/message/i);
    const sendButton = screen.getByRole('button', { name: /send/i });

    await user.type(input, 'Hello Claude');

    expect(sendButton).toBeEnabled();
  });

  it('sends message when send button clicked', async () => {
    const mockSendMessage = vi.fn();
    const user = userEvent.setup();

    render(
      <WebSocketProvider>
        <ChatInterface
          selectedProject={mockProject}
          selectedSession={null}
          sendMessage={mockSendMessage}
        />
      </WebSocketProvider>
    );

    const input = screen.getByPlaceholderText(/message/i);
    await user.type(input, 'Test message');

    const sendButton = screen.getByRole('button', { name: /send/i });
    await user.click(sendButton);

    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'claude-command',
        command: 'Test message'
      })
    );
  });

  it('displays session protection indicator when session is active', async () => {
    const onSessionActive = vi.fn();

    render(
      <WebSocketProvider>
        <ChatInterface
          selectedProject={mockProject}
          selectedSession={mockSession}
          onSessionActive={onSessionActive}
        />
      </WebSocketProvider>
    );

    // Send a message to activate session
    const input = screen.getByPlaceholderText(/message/i);
    await userEvent.type(input, 'Test');
    fireEvent.submit(input.closest('form'));

    // Session should be marked as active
    expect(onSessionActive).toHaveBeenCalledWith(mockSession.id);
  });
});
```

### Running Frontend Tests

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# UI mode (interactive)
npm run test:ui
```

**package.json scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

---

## Backend Testing (Jest + Supertest)

### Why Jest for Backend?

- **Mature**: Widely used, excellent documentation
- **Complete**: Built-in mocking, assertions, coverage
- **ESM support**: Works with ES modules (type: "module")
- **Supertest**: Easy HTTP/WebSocket testing

### Installation

```bash
npm install --save-dev jest supertest @types/jest
```

### Configuration

**jest.config.js:**
```javascript
export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server/**/*.js',
    '!server/index.js',
    '!**/node_modules/**'
  ],
  testMatch: [
    '**/server/**/__tests__/**/*.test.js'
  ]
};
```

### Example Backend Tests

#### 1. Authentication Endpoints

```javascript
// server/routes/__tests__/auth.test.js
import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import express from 'express';
import authRoutes from '../auth.js';
import { initializeDatabase, closeDatabase } from '../../database/db.js';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Routes', () => {
  beforeEach(async () => {
    await initializeDatabase(':memory:');
  });

  afterAll(async () => {
    await closeDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('creates new user with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        user: {
          username: 'testuser'
        },
        token: expect.any(String)
      });
    });

    it('rejects registration when user already exists', async () => {
      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      // Try to create second user
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser2',
          password: 'password456'
        })
        .expect(403);

      expect(response.body.error).toContain('User already exists');
    });

    it('rejects short username', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'ab',
          password: 'password123'
        })
        .expect(400);

      expect(response.body.error).toContain('Username must be at least 3 characters');
    });

    it('rejects short password', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          password: '12345'
        })
        .expect(400);

      expect(response.body.error).toContain('password at least 6 characters');
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create user for login tests
      await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          password: 'password123'
        });
    });

    it('logs in with correct credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        user: {
          username: 'testuser'
        },
        token: expect.any(String)
      });
    });

    it('rejects wrong password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid username or password');
    });

    it('rejects non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'nonexistent',
          password: 'password123'
        })
        .expect(401);

      expect(response.body.error).toContain('Invalid username or password');
    });
  });

  describe('GET /api/auth/user', () => {
    let token;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          password: 'password123'
        });

      token = response.body.token;
    });

    it('returns user info with valid token', async () => {
      const response = await request(app)
        .get('/api/auth/user')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.user).toMatchObject({
        username: 'testuser'
      });
    });

    it('rejects request without token', async () => {
      await request(app)
        .get('/api/auth/user')
        .expect(401);
    });

    it('rejects request with invalid token', async () => {
      await request(app)
        .get('/api/auth/user')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);
    });
  });
});
```

#### 2. Project API Tests

```javascript
// server/__tests__/projects.test.js
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  getProjects,
  getSessions,
  getSessionMessages,
  extractProjectDirectory
} from '../projects.js';

describe('Projects Module', () => {
  let testDir;
  let claudeProjectsDir;

  beforeEach(async () => {
    // Create temp directory for test
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-test-'));
    claudeProjectsDir = path.join(testDir, '.claude', 'projects');
    await fs.mkdir(claudeProjectsDir, { recursive: true });

    // Override HOME for tests
    process.env.HOME = testDir;
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('getProjects', () => {
    it('returns empty array when no projects exist', async () => {
      const projects = await getProjects();
      expect(projects).toEqual([]);
    });

    it('discovers projects from directories', async () => {
      // Create mock project directory
      const projectDir = path.join(claudeProjectsDir, 'Users-test-myproject');
      await fs.mkdir(projectDir, { recursive: true });

      // Create session file
      const sessionFile = path.join(projectDir, 'session-123.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({
        sessionId: 'session-123',
        cwd: '/Users/test/myproject',
        timestamp: new Date().toISOString()
      }) + '\n');

      const projects = await getProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0]).toMatchObject({
        name: 'Users-test-myproject',
        path: '/Users/test/myproject'
      });
    });
  });

  describe('extractProjectDirectory', () => {
    it('extracts cwd from JSONL file', async () => {
      const projectName = 'Users-test-project';
      const projectDir = path.join(claudeProjectsDir, projectName);
      await fs.mkdir(projectDir, { recursive: true });

      // Create JSONL file with cwd
      const sessionFile = path.join(projectDir, 'session.jsonl');
      await fs.writeFile(sessionFile, JSON.stringify({
        sessionId: 'test',
        cwd: '/Users/test/project',
        timestamp: new Date().toISOString()
      }) + '\n');

      const extractedPath = await extractProjectDirectory(projectName);

      expect(extractedPath).toBe('/Users/test/project');
    });

    it('falls back to decoded name when no sessions exist', async () => {
      const projectName = 'Users-test-project';
      const projectDir = path.join(claudeProjectsDir, projectName);
      await fs.mkdir(projectDir, { recursive: true });

      const extractedPath = await extractProjectDirectory(projectName);

      expect(extractedPath).toBe('Users/test/project');
    });
  });

  describe('getSessions', () => {
    it('returns sessions from JSONL files', async () => {
      const projectName = 'test-project';
      const projectDir = path.join(claudeProjectsDir, projectName);
      await fs.mkdir(projectDir, { recursive: true });

      // Create session file
      const sessionFile = path.join(projectDir, 'session.jsonl');
      const sessionData = [
        { sessionId: 'session-1', type: 'user', message: { content: 'Hello' }, timestamp: '2025-01-01T00:00:00Z' },
        { sessionId: 'session-1', type: 'assistant', message: { content: 'Hi' }, timestamp: '2025-01-01T00:00:01Z' }
      ];

      await fs.writeFile(
        sessionFile,
        sessionData.map(d => JSON.stringify(d)).join('\n') + '\n'
      );

      const result = await getSessions(projectName, 5, 0);

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        id: 'session-1',
        messageCount: 2
      });
    });

    it('paginates sessions correctly', async () => {
      const projectName = 'test-project';
      const projectDir = path.join(claudeProjectsDir, projectName);
      await fs.mkdir(projectDir, { recursive: true });

      // Create multiple sessions
      for (let i = 1; i <= 10; i++) {
        const sessionFile = path.join(projectDir, `session-${i}.jsonl`);
        await fs.writeFile(
          sessionFile,
          JSON.stringify({
            sessionId: `session-${i}`,
            message: { content: `Message ${i}` },
            timestamp: new Date(2025, 0, i).toISOString()
          }) + '\n'
        );
      }

      // Get first page
      const page1 = await getSessions(projectName, 5, 0);
      expect(page1.sessions).toHaveLength(5);
      expect(page1.hasMore).toBe(true);
      expect(page1.total).toBe(10);

      // Get second page
      const page2 = await getSessions(projectName, 5, 5);
      expect(page2.sessions).toHaveLength(5);
      expect(page2.hasMore).toBe(false);
    });
  });
});
```

#### 3. WebSocket Tests

```javascript
// server/__tests__/websocket.test.js
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

describe('WebSocket Communication', () => {
  let server;
  let wss;
  let serverUrl;

  beforeAll((done) => {
    server = http.createServer();
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'claude-command') {
          // Echo back
          ws.send(JSON.stringify({
            type: 'claude-response',
            data: { message: `Echo: ${data.command}` }
          }));
        }
      });
    });

    server.listen(0, () => {
      const port = server.address().port;
      serverUrl = `ws://localhost:${port}`;
      done();
    });
  });

  afterAll((done) => {
    wss.close();
    server.close(done);
  });

  it('establishes WebSocket connection', (done) => {
    const ws = new WebSocket(serverUrl);

    ws.on('open', () => {
      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
      done();
    });
  });

  it('sends and receives messages', (done) => {
    const ws = new WebSocket(serverUrl);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        type: 'claude-command',
        command: 'Test message'
      }));
    });

    ws.on('message', (data) => {
      const message = JSON.parse(data);

      expect(message).toMatchObject({
        type: 'claude-response',
        data: {
          message: 'Echo: Test message'
        }
      });

      ws.close();
      done();
    });
  });
});
```

### Running Backend Tests

```bash
# Run backend tests
npm run test:server

# Watch mode
npm run test:server:watch

# Coverage
npm run test:server:coverage
```

**package.json scripts:**
```json
{
  "scripts": {
    "test:server": "NODE_OPTIONS=--experimental-vm-modules jest",
    "test:server:watch": "NODE_OPTIONS=--experimental-vm-modules jest --watch",
    "test:server:coverage": "NODE_OPTIONS=--experimental-vm-modules jest --coverage"
  }
}
```

---

## E2E Testing (Playwright)

### Why Playwright?

- **Multi-browser**: Chrome, Firefox, Safari, Edge
- **Auto-wait**: Smart waiting for elements
- **Network control**: Mock API responses
- **Screenshots/videos**: Debug failures easily
- **Mobile emulation**: Test responsive design

### Installation

```bash
npm install --save-dev @playwright/test
npx playwright install
```

### Configuration

**playwright.config.js:**
```javascript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run start',
    port: 3001,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Example E2E Tests

#### 1. Authentication Flow

```javascript
// e2e/auth.spec.js
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('completes setup for first-time user', async ({ page }) => {
    await page.goto('/');

    // Should show setup form
    await expect(page.getByRole('heading', { name: /setup/i })).toBeVisible();

    // Fill setup form
    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /create account/i }).click();

    // Should redirect to main app
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/projects/i)).toBeVisible();
  });

  test('logs in existing user', async ({ page }) => {
    // Assume user already created
    await page.goto('/');

    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /login/i }).click();

    // Should redirect to main app
    await expect(page).toHaveURL('/');
    await expect(page.getByText(/projects/i)).toBeVisible();
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /login/i }).click();

    // Should show error
    await expect(page.getByText(/invalid/i)).toBeVisible();
  });
});
```

#### 2. Chat Flow

```javascript
// e2e/chat.spec.js
import { test, expect } from '@playwright/test';

test.describe('Chat Interface', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/');
    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /login/i }).click();

    // Select project
    await page.getByRole('button', { name: /myproject/i }).click();
  });

  test('sends and receives chat message', async ({ page }) => {
    // Type message
    const input = page.getByPlaceholder(/message/i);
    await input.fill('Hello Claude');

    // Send message
    await page.getByRole('button', { name: /send/i }).click();

    // Should show user message
    await expect(page.getByText('Hello Claude')).toBeVisible();

    // Should show Claude's response (wait up to 30s)
    await expect(page.getByText(/hi|hello/i)).toBeVisible({ timeout: 30000 });
  });

  test('creates new session', async ({ page }) => {
    // Send first message
    await page.getByPlaceholder(/message/i).fill('Start new session');
    await page.getByRole('button', { name: /send/i }).click();

    // URL should update with session ID
    await expect(page).toHaveURL(/\/session\/[a-z0-9]+/);

    // Session should appear in sidebar
    await expect(page.getByText('Start new session')).toBeVisible();
  });

  test('resumes existing session', async ({ page }) => {
    // Click on existing session in sidebar
    await page.getByRole('button', { name: /previous session/i }).click();

    // Should load session messages
    await expect(page.getByText(/previous message/i)).toBeVisible();

    // Send new message
    await page.getByPlaceholder(/message/i).fill('Continue conversation');
    await page.getByRole('button', { name: /send/i }).click();

    // Should preserve context
    await expect(page.getByText('Continue conversation')).toBeVisible();
  });

  test('uploads and sends image', async ({ page }) => {
    // Upload image
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /upload image/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles('./e2e/fixtures/test-image.jpg');

    // Image preview should appear
    await expect(page.getByAltText(/uploaded image/i)).toBeVisible();

    // Type message
    await page.getByPlaceholder(/message/i).fill('Analyze this image');
    await page.getByRole('button', { name: /send/i }).click();

    // Should send message with image
    await expect(page.getByText('Analyze this image')).toBeVisible();
    await expect(page.getByAltText(/uploaded image/i)).toBeVisible();
  });
});
```

#### 3. Session Protection Flow

```javascript
// e2e/session-protection.spec.js
import { test, expect } from '@playwright/test';

test.describe('Session Protection', () => {
  test.beforeEach(async ({ page }) => {
    // Login and select project
    await page.goto('/');
    await page.getByLabel(/username/i).fill('testuser');
    await page.getByLabel(/password/i).fill('password123');
    await page.getByRole('button', { name: /login/i }).click();
    await page.getByRole('button', { name: /myproject/i }).click();
  });

  test('prevents project updates during active conversation', async ({ page, context }) => {
    // Send message to start conversation
    await page.getByPlaceholder(/message/i).fill('Test message');
    await page.getByRole('button', { name: /send/i }).click();

    // Session is now active
    await expect(page.getByText('Test message')).toBeVisible();

    // Open new tab and create another session
    const newPage = await context.newPage();
    await newPage.goto('/');
    await newPage.getByRole('button', { name: /myproject/i }).click();
    await newPage.getByPlaceholder(/message/i).fill('Another session');
    await newPage.getByRole('button', { name: /send/i }).click();

    // Wait for new session to be created
    await newPage.waitForTimeout(2000);

    // Original page should NOT refresh sidebar
    // (session protection prevents update)
    const firstPageSessionCount = await page.locator('[data-testid="session-item"]').count();

    // Wait a bit to ensure no update happens
    await page.waitForTimeout(1000);

    const updatedSessionCount = await page.locator('[data-testid="session-item"]').count();
    expect(updatedSessionCount).toBe(firstPageSessionCount);

    // Close new page
    await newPage.close();

    // Complete conversation in original page
    await page.waitForSelector('[data-testid="message-complete"]');

    // Now sidebar should update (session no longer active)
    await page.waitForTimeout(2000);
    const finalSessionCount = await page.locator('[data-testid="session-item"]').count();
    expect(finalSessionCount).toBeGreaterThan(firstPageSessionCount);
  });
});
```

### Running E2E Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run in UI mode (interactive)
npm run test:e2e:ui

# Run specific browser
npm run test:e2e -- --project=chromium

# Debug mode
npm run test:e2e:debug

# Generate report
npm run test:e2e:report
```

**package.json scripts:**
```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report"
  }
}
```

---

## Testing Patterns and Best Practices

### 1. Test Structure (AAA Pattern)

```javascript
test('descriptive test name', async () => {
  // Arrange - Set up test data and conditions
  const user = { username: 'test', password: 'pass' };
  const mockFetch = vi.fn();

  // Act - Perform the action being tested
  const result = await login(user.username, user.password);

  // Assert - Verify the outcome
  expect(result.success).toBe(true);
  expect(mockFetch).toHaveBeenCalledWith('/api/auth/login');
});
```

### 2. Mocking External Dependencies

```javascript
// Mock fetch globally
global.fetch = vi.fn();

// Mock specific responses
fetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({ data: 'test' })
});

// Mock WebSocket
vi.mock('websocket', () => ({
  WebSocket: class MockWebSocket {
    constructor(url) {
      this.url = url;
    }
    send(data) {
      this.lastSent = data;
    }
  }
}));
```

### 3. Test Data Factories

```javascript
// test/factories/userFactory.js
export function createUser(overrides = {}) {
  return {
    id: Math.random().toString(36).substr(2, 9),
    username: 'testuser',
    email: 'test@example.com',
    created_at: new Date().toISOString(),
    ...overrides
  };
}

// test/factories/projectFactory.js
export function createProject(overrides = {}) {
  return {
    name: 'test-project',
    path: '/test/path',
    displayName: 'Test Project',
    sessions: [],
    ...overrides
  };
}

// Usage
const user = createUser({ username: 'custom' });
const project = createProject({ displayName: 'My Project' });
```

### 4. Custom Test Utilities

```javascript
// test/utils/renderWithProviders.jsx
import { render } from '@testing-library/react';
import { ThemeProvider } from '../../src/contexts/ThemeContext';
import { AuthProvider } from '../../src/contexts/AuthContext';
import { WebSocketProvider } from '../../src/contexts/WebSocketContext';

export function renderWithProviders(ui, options = {}) {
  const Wrapper = ({ children }) => (
    <ThemeProvider>
      <AuthProvider>
        <WebSocketProvider>
          {children}
        </WebSocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );

  return render(ui, { wrapper: Wrapper, ...options });
}

// Usage
renderWithProviders(<ChatInterface project={mockProject} />);
```

### 5. Testing Async Code

```javascript
// Wait for element to appear
await waitFor(() => {
  expect(screen.getByText('Success')).toBeInTheDocument();
});

// Wait for specific timeout
await waitFor(() => {
  expect(callbackMock).toHaveBeenCalled();
}, { timeout: 5000 });

// Use findBy queries (built-in waiting)
const element = await screen.findByText('Loaded');
expect(element).toBeInTheDocument();
```

### 6. Testing Error Boundaries

```javascript
// Suppress console.error for expected errors
const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

test('shows error boundary on component error', () => {
  const ThrowError = () => {
    throw new Error('Test error');
  };

  render(
    <ErrorBoundary>
      <ThrowError />
    </ErrorBoundary>
  );

  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
});

consoleSpy.mockRestore();
```

### 7. Snapshot Testing

```javascript
// Component snapshot
test('renders correctly', () => {
  const { container } = render(<Button>Click me</Button>);
  expect(container).toMatchSnapshot();
});

// Inline snapshot
test('generates correct data structure', () => {
  const result = transformData(input);
  expect(result).toMatchInlineSnapshot(`
    {
      "id": "123",
      "name": "Test",
      "active": true
    }
  `);
});
```

### 8. Testing localStorage

```javascript
beforeEach(() => {
  localStorage.clear();
});

test('saves data to localStorage', () => {
  const data = { theme: 'dark' };
  saveSettings(data);

  expect(localStorage.getItem('settings')).toBe(JSON.stringify(data));
});

test('handles localStorage quota exceeded', () => {
  // Mock quota exceeded error
  const setItemMock = vi.spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

  saveSettings({ large: 'data' });

  // Should handle error gracefully
  expect(consoleWarnMock).toHaveBeenCalled();

  setItemMock.mockRestore();
});
```

---

## CI/CD Integration

### GitHub Actions Workflow

**.github/workflows/test.yml:**
```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  frontend-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run frontend tests
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  backend-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run backend tests
        run: npm run test:server:coverage

  e2e-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

### Pre-commit Hook

**Install Husky:**
```bash
npm install --save-dev husky lint-staged
npx husky install
```

**.husky/pre-commit:**
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

npx lint-staged
```

**package.json:**
```json
{
  "lint-staged": {
    "*.{js,jsx}": [
      "eslint --fix",
      "vitest related --run"
    ]
  }
}
```

---

## Summary

This testing guide provides:

1. **Current Status**: No tests currently exist (as of v1.8.12)

2. **Recommended Stack**:
   - Frontend: Vitest + React Testing Library
   - Backend: Jest + Supertest
   - E2E: Playwright

3. **Test Coverage Targets**:
   - Unit tests: 50-100 tests for components, hooks, utilities
   - Integration tests: 20-30 tests for API endpoints and WebSocket
   - E2E tests: 5-10 tests for critical user journeys

4. **Priority Testing Areas**:
   - Authentication flow
   - Chat message flow
   - Session creation/resume
   - Project updates with Session Protection
   - WebSocket communication

5. **Best Practices**:
   - AAA pattern (Arrange, Act, Assert)
   - Mock external dependencies
   - Use test data factories
   - Custom test utilities
   - CI/CD integration

Implementing this testing strategy will significantly improve code quality, development speed, and production stability for Claude Code UI.
