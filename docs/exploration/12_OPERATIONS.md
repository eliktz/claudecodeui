# 12. Build, Deployment, and Operations

This document covers the build process, deployment strategies, and operational considerations for Claude Code UI.

## Table of Contents

1. [Development Workflow](#development-workflow)
2. [Build Process](#build-process)
3. [Production Deployment](#production-deployment)
4. [Native Module Compilation](#native-module-compilation)
5. [NPM Package Publishing](#npm-package-publishing)
6. [Environment Configuration](#environment-configuration)
7. [Port Management](#port-management)
8. [Logging and Monitoring](#logging-and-monitoring)
9. [Error Tracking](#error-tracking)
10. [Performance Considerations](#performance-considerations)

---

## Development Workflow

### Starting the Development Environment

**Location:** `/Users/elik.k/git/claudecodeui/package.json:24-29`

```json
"scripts": {
  "dev": "concurrently --kill-others \"npm run server\" \"npm run client\"",
  "server": "node server/index.js",
  "client": "vite --host",
  "build": "vite build",
  "preview": "vite preview",
  "start": "npm run build && npm run server"
}
```

### Development Mode (Dual Process)

**Command:**
```bash
npm run dev
```

**What Happens:**
1. **Concurrently** launches two processes:
   - **Backend Server** (port 3001):
     - Express API server
     - WebSocket server
     - Claude/Cursor CLI spawning
     - File system watcher (chokidar)

   - **Frontend Dev Server** (port 5173):
     - Vite development server
     - Hot Module Replacement (HMR)
     - Proxies API/WebSocket requests to backend

**Vite Configuration:** `/Users/elik.k/git/claudecodeui/vite.config.js`

```javascript
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: parseInt(env.VITE_PORT) || 5173,
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
    build: {
      outDir: 'dist'
    }
  }
})
```

**Development Features:**
- Hot reload for frontend changes (HMR)
- Backend auto-restart on file changes (if using nodemon)
- Proxy eliminates CORS issues
- Source maps for debugging

---

## Build Process

### Production Build

**Command:**
```bash
npm run build
```

**Build Steps:**

1. **Vite Build Process:**
   ```bash
   vite build
   ```

   **Output:** `/Users/elik.k/git/claudecodeui/dist/`

   **What Gets Built:**
   - React application bundled and minified
   - JavaScript code splitting
   - CSS extraction and minification
   - Asset optimization (images, fonts)
   - Index.html with asset references

2. **Build Artifacts:**
   ```
   dist/
   ├── index.html           # Entry point with asset links
   ├── assets/
   │   ├── index-[hash].js  # Main application bundle
   │   ├── index-[hash].css # Compiled styles
   │   └── [other-assets]   # Images, fonts, etc.
   └── manifest.json        # PWA manifest
   ```

### Build Configuration

**Location:** `/Users/elik.k/git/claudecodeui/vite.config.js:25-27`

```javascript
build: {
  outDir: 'dist'
}
```

**Optimization Features:**
- Tree shaking (removes unused code)
- Code splitting (lazy loading)
- Minification (Terser for JS, cssnano for CSS)
- Asset hashing (cache busting)

### Analyzing Build Size

```bash
# Install analyzer
npm install --save-dev rollup-plugin-visualizer

# Add to vite.config.js
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({ open: true })
  ]
});

# Build and view stats
npm run build
```

---

## Production Deployment

### Production Start

**Command:**
```bash
npm start
```

**What Happens:**
```bash
npm run build && npm run server
```

1. Builds frontend to `dist/`
2. Starts Express server on port 3001
3. Serves static files from `dist/`
4. API and WebSocket available

### Serving Static Files

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:196`

```javascript
// Static files served after API routes
app.use(express.static(path.join(__dirname, '../dist')));
```

### Catch-All Route for SPA

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:1057-1064`

```javascript
// Serve React app for all other routes
app.get('*', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    // In development, redirect to Vite dev server
    res.redirect(`http://localhost:${process.env.VITE_PORT || 3001}`);
  }
});
```

**Purpose:** Enables client-side routing (React Router) by serving `index.html` for all non-API routes.

### Deployment Strategies

#### 1. Direct Deployment (Simple)

```bash
# On server
git clone https://github.com/siteboon/claudecodeui.git
cd claudecodeui
npm install
npm start
```

**Access:** `http://server-ip:3001`

#### 2. PM2 (Process Management)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start npm --name "claude-code-ui" -- start

# PM2 ecosystem config (ecosystem.config.js)
module.exports = {
  apps: [{
    name: 'claude-code-ui',
    script: 'npm',
    args: 'start',
    cwd: '/path/to/claudecodeui',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JWT_SECRET: 'your-secret-here'
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M'
  }]
};

# Start with ecosystem
pm2 start ecosystem.config.js

# Save PM2 config
pm2 save

# Start on boot
pm2 startup
```

#### 3. Docker Deployment

**Dockerfile:**
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including native modules)
RUN apk add --no-cache python3 make g++ && \
    npm ci --only=production && \
    apk del python3 make g++

# Copy application
COPY . .

# Build frontend
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  claude-code-ui:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - PORT=3001
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ~/.claude:/root/.claude
      - ~/.cursor:/root/.cursor
    restart: unless-stopped
```

#### 4. Reverse Proxy (nginx)

**nginx.conf:**
```nginx
server {
    listen 80;
    server_name claude-ui.example.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name claude-ui.example.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/claude-ui.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/claude-ui.example.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }

    location /shell {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400;
    }
}
```

---

## Native Module Compilation

### Native Dependencies

Claude Code UI uses three native modules that require compilation:

1. **node-pty** - Terminal emulation
2. **better-sqlite3** - SQLite database
3. **bcrypt** - Password hashing

**Location:** `/Users/elik.k/git/claudecodeui/package.json:53-55,66`

```json
"dependencies": {
  "bcrypt": "^6.0.0",
  "better-sqlite3": "^12.2.0",
  "node-pty": "^1.1.0-beta34"
}
```

### Build Requirements

**macOS:**
```bash
# Xcode Command Line Tools
xcode-select --install
```

**Linux:**
```bash
# Debian/Ubuntu
sudo apt-get install build-essential python3

# RHEL/CentOS/Fedora
sudo yum install gcc-c++ make python3
```

**Windows:**
```bash
# Install Visual Studio Build Tools
# OR
npm install --global windows-build-tools
```

### Compilation Process

**Automatic (npm install):**
```bash
npm install  # Compiles native modules automatically
```

**Manual Rebuild:**
```bash
# Rebuild all native modules
npm rebuild

# Rebuild specific module
npm rebuild better-sqlite3
```

### Docker Compilation

**In Dockerfile:**
```dockerfile
# Install build dependencies
RUN apk add --no-cache python3 make g++

# Install npm packages (compiles native modules)
RUN npm ci --only=production

# Remove build dependencies to reduce image size
RUN apk del python3 make g++
```

### Prebuilt Binaries

Some native modules provide prebuilt binaries:

```bash
# Check if prebuilt binary is available
npm install better-sqlite3 --verbose

# Force compilation from source
npm install better-sqlite3 --build-from-source
```

### Troubleshooting Native Modules

**Error: "node-gyp not found"**
```bash
npm install -g node-gyp
```

**Error: "Python not found"**
```bash
# Ensure Python 3 is installed
python3 --version

# Set python path for npm
npm config set python /usr/bin/python3
```

**Error: "MSBuild.exe not found" (Windows)**
- Install Visual Studio Build Tools
- Or use `windows-build-tools` package

---

## NPM Package Publishing

### Package Configuration

**Location:** `/Users/elik.k/git/claudecodeui/package.json:1-14`

```json
{
  "name": "@siteboon/claude-code-ui",
  "version": "1.8.12",
  "description": "A web-based UI for Claude Code CLI",
  "type": "module",
  "main": "server/index.js",
  "bin": {
    "claude-code-ui": "server/index.js"
  },
  "files": [
    "server/",
    "dist/",
    "README.md"
  ]
}
```

### Publishing Process

**Manual Publish:**
```bash
# Login to npm
npm login

# Build frontend
npm run build

# Publish to npm
npm publish --access public
```

**Automated Publishing (release-it):**

**Location:** `/Users/elik.k/git/claudecodeui/package.json:30`

```json
"scripts": {
  "release": "release-it"
}
```

**Release Process:**
```bash
# Interactive release
npm run release

# Release specific version
npm run release -- minor  # 1.8.12 -> 1.9.0
npm run release -- patch  # 1.8.12 -> 1.8.13
npm run release -- major  # 1.8.12 -> 2.0.0
```

**What release-it Does:**
1. Prompts for version bump
2. Updates version in `package.json`
3. Runs `npm run build`
4. Creates git commit and tag
5. Pushes to GitHub
6. Publishes to npm
7. Creates GitHub release

### Installing Published Package

**Global Installation:**
```bash
npm install -g @siteboon/claude-code-ui

# Run from anywhere
claude-code-ui
```

**Executable Binary:**

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:1`

```javascript
#!/usr/bin/env node
```

This shebang makes the server file executable when installed globally.

---

## Environment Configuration

### Environment Variables

**Location:** `/Users/elik.k/git/claudecodeui/.env.example`

```bash
# Backend server port (Express API + WebSocket server)
PORT=3001

# Frontend dev server port (Vite)
VITE_PORT=5173

# Optional: Custom Claude CLI path
# CLAUDE_CLI_PATH=claude

# Production secrets (not in .env.example)
# JWT_SECRET=your-secret-here
# API_KEY=your-api-key-here
# OPENAI_API_KEY=sk-...
```

### Loading Environment Variables

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:11-25`

```javascript
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

**Note:** Custom `.env` loader (doesn't use `dotenv` package) to avoid additional dependency.

### Environment-Specific Configurations

**Development:**
```bash
NODE_ENV=development
PORT=3001
VITE_PORT=5173
```

**Production:**
```bash
NODE_ENV=production
PORT=3001
JWT_SECRET=<long-random-string>
API_KEY=<optional-api-key>
```

### Accessing Environment Variables

**Backend (Node.js):**
```javascript
const port = process.env.PORT || 3001;
```

**Frontend (Vite):**
```javascript
// Must be prefixed with VITE_
const apiUrl = import.meta.env.VITE_API_URL;
```

---

## Port Management

### Default Ports

- **Backend API/WebSocket:** 3001
- **Frontend Dev Server:** 5173

### Port Configuration

**Backend Port:**

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:1147`

```javascript
const PORT = process.env.PORT || 3001;

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Claude Code UI server running on http://0.0.0.0:${PORT}`);
});
```

**Frontend Port:**

**Location:** `/Users/elik.k/git/claudecodeui/vite.config.js:12`

```javascript
server: {
  port: parseInt(env.VITE_PORT) || 5173
}
```

### Port Conflicts

**Check Port Usage:**
```bash
# macOS/Linux
lsof -i :3001

# Windows
netstat -ano | findstr :3001
```

**Kill Process Using Port:**
```bash
# macOS/Linux
kill -9 $(lsof -t -i:3001)

# Windows
taskkill /PID <PID> /F
```

### Changing Ports

**Option 1: Environment Variables**
```bash
PORT=4000 VITE_PORT=8080 npm run dev
```

**Option 2: .env File**
```bash
PORT=4000
VITE_PORT=8080
```

---

## Logging and Monitoring

### Console Logging

**Backend Logging Patterns:**

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js`

```javascript
// Emoji prefixes for visual scanning
console.log('✅ Database initialization skipped (testing)');
console.log('🔗 Client connected to:', url);
console.log('💬 Chat WebSocket connected');
console.log('📤 Claude CLI stdout:', rawOutput);
console.error('❌ Failed to start server:', error);
console.warn('⚠️ Using --dangerously-skip-permissions');
```

**Frontend Logging:**

**Location:** `/Users/elik.k/git/claudecodeui/src/components/ChatInterface.jsx`

```javascript
console.log('🔄 Claude CLI session duplication detected:', {
  originalSession: currentSessionId,
  newSession: latestMessage.data.session_id
});
```

### Structured Logging (Production)

**Install Winston:**
```bash
npm install winston
```

**logger.js:**
```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;
```

**Usage:**
```javascript
import logger from './logger.js';

logger.info('Server started', { port: PORT });
logger.error('Database error', { error: err.message, stack: err.stack });
```

### Request Logging

**Install Morgan:**
```bash
npm install morgan
```

**Usage:**
```javascript
import morgan from 'morgan';

// Development
app.use(morgan('dev'));

// Production
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));
```

---

## Error Tracking

### Error Boundaries (Frontend)

**Location:** `/Users/elik.k/git/claudecodeui/src/components/ErrorBoundary.jsx`

React Error Boundary component catches and logs frontend errors.

### Backend Error Handling

**Global Error Handler:**
```javascript
// After all routes
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});
```

### Sentry Integration (Optional)

**Install Sentry:**
```bash
npm install @sentry/node @sentry/react
```

**Backend:**
```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

**Frontend:**
```javascript
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE
});
```

---

## Performance Considerations

### Build Optimization

**Code Splitting:**
```javascript
// Lazy load routes
const Settings = lazy(() => import('./components/Settings'));
```

**Bundle Analysis:**
```bash
npm run build -- --mode=analyze
```

### Backend Performance

**File System Watcher (chokidar):**

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:67-85`

```javascript
projectsWatcher = chokidar.watch(claudeProjectsPath, {
  ignored: [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**'
  ],
  persistent: true,
  ignoreInitial: true,
  followSymlinks: false,
  depth: 10,
  awaitWriteFinish: {
    stabilityThreshold: 100,
    pollInterval: 50
  }
});
```

**Debouncing Updates:**

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:88-119`

```javascript
let debounceTimer;
const debouncedUpdate = async (eventType, filePath) => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(async () => {
    // ... update projects
  }, 300); // 300ms debounce
};
```

### Caching Strategies

**Project Directory Cache:**

**Location:** `/Users/elik.k/git/claudecodeui/server/projects.js:197-203`

```javascript
// Cache for extracted project directories
const projectDirectoryCache = new Map();

function clearProjectDirectoryCache() {
  projectDirectoryCache.clear();
}

// Check cache first
if (projectDirectoryCache.has(projectName)) {
  return projectDirectoryCache.get(projectName);
}
```

### Database Performance

**Prepared Statements:**
```javascript
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);
```

**Transactions:**
```javascript
db.prepare('BEGIN').run();
try {
  // ... multiple operations
  db.prepare('COMMIT').run();
} catch (error) {
  db.prepare('ROLLBACK').run();
  throw error;
}
```

---

## Health Checks and Monitoring

### Health Check Endpoint

```javascript
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  });
});
```

### Process Monitoring

**PM2 Monitoring:**
```bash
# View process status
pm2 status

# View logs
pm2 logs claude-code-ui

# Monitor resources
pm2 monit
```

### System Metrics

```javascript
import os from 'os';

app.get('/metrics', authenticateToken, (req, res) => {
  res.json({
    cpu: os.loadavg(),
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    },
    uptime: os.uptime()
  });
});
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run `npm audit` and fix vulnerabilities
- [ ] Set `NODE_ENV=production`
- [ ] Configure `JWT_SECRET` environment variable
- [ ] Set up HTTPS/WSS (reverse proxy)
- [ ] Configure CORS for production domain
- [ ] Set up logging (winston, morgan)
- [ ] Configure error tracking (Sentry)
- [ ] Set up process manager (PM2)
- [ ] Configure automatic restart on crash
- [ ] Set up backup for SQLite database

### Post-Deployment

- [ ] Test authentication flow
- [ ] Test WebSocket connection
- [ ] Test Claude CLI integration
- [ ] Test Cursor CLI integration
- [ ] Verify file operations work
- [ ] Check logs for errors
- [ ] Monitor memory usage
- [ ] Set up uptime monitoring
- [ ] Document deployment process
- [ ] Create rollback plan

---

## Troubleshooting

### Build Failures

**Symptom:** `npm run build` fails

**Solutions:**
1. Clear node_modules: `rm -rf node_modules && npm install`
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Check Node version: `node --version` (requires Node 18+)

### Native Module Compilation Errors

**Symptom:** `gyp ERR!` or `node-gyp` errors

**Solutions:**
1. Install build tools (see Native Module Compilation section)
2. Clear npm cache: `npm cache clean --force`
3. Rebuild: `npm rebuild`
4. Use prebuilt binaries if available

### Port Already in Use

**Symptom:** `EADDRINUSE` error

**Solutions:**
1. Check what's using the port: `lsof -i :3001`
2. Kill the process or change PORT in `.env`

### WebSocket Connection Fails

**Symptom:** WebSocket connection refused

**Solutions:**
1. Check backend is running: `curl http://localhost:3001/health`
2. Verify firewall allows WebSocket connections
3. Check proxy configuration (nginx, Apache)
4. Verify authentication token is valid
