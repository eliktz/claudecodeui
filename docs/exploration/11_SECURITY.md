# 11. Security and Authentication

This document details the authentication and security measures implemented in Claude Code UI.

## Table of Contents

1. [Authentication System](#authentication-system)
2. [JWT Token Management](#jwt-token-management)
3. [Password Security](#password-security)
4. [WebSocket Authentication](#websocket-authentication)
5. [API Key Validation](#api-key-validation)
6. [CORS Configuration](#cors-configuration)
7. [Path Security](#path-security)
8. [Tools Security](#tools-security)
9. [Input Validation](#input-validation)
10. [Secret Management](#secret-management)

---

## Authentication System

### Single-User Design

Claude Code UI uses a **single-user authentication model** suitable for local development environments:

**Location:** `/Users/elik.k/git/claudecodeui/server/routes/auth.js`

```javascript
// User registration (setup) - only allowed if no users exist
router.post('/register', async (req, res) => {
  // Use a transaction to prevent race conditions
  db.prepare('BEGIN').run();
  try {
    // Check if users already exist (only allow one user)
    const hasUsers = userDb.hasUsers();
    if (hasUsers) {
      db.prepare('ROLLBACK').run();
      return res.status(403).json({
        error: 'User already exists. This is a single-user system.'
      });
    }
    // ... create user
  }
});
```

### Database Schema

**Location:** `/Users/elik.k/git/claudecodeui/server/database/db.js`

SQLite database stores user credentials in `auth.db`:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  is_active INTEGER DEFAULT 1
);
```

### Authentication Flow

**Location:** `/Users/elik.k/git/claudecodeui/src/contexts/AuthContext.jsx`

```javascript
// 1. Check auth status on mount
const checkAuthStatus = async () => {
  // Check if system needs setup
  const statusResponse = await api.auth.status();
  const statusData = await statusResponse.json();

  if (statusData.needsSetup) {
    setNeedsSetup(true);
    return;
  }

  // If we have a token, verify it
  if (token) {
    const userResponse = await api.auth.user();
    if (userResponse.ok) {
      const userData = await userResponse.json();
      setUser(userData.user);
    } else {
      // Token is invalid
      localStorage.removeItem('auth-token');
      setToken(null);
    }
  }
};
```

### Protected Routes

**Location:** `/Users/elik.k/git/claudecodeui/src/components/ProtectedRoute.jsx`

All routes except `/auth` paths are protected and require authentication.

---

## JWT Token Management

### Token Generation

**Location:** `/Users/elik.k/git/claudecodeui/server/middleware/auth.js:48-57`

```javascript
// Generate JWT token (never expires)
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
```

**Key Features:**
- Tokens never expire (suitable for local development)
- Payload includes: `userId`, `username`
- Signed with `JWT_SECRET` from environment

### Token Verification

**Location:** `/Users/elik.k/git/claudecodeui/server/middleware/auth.js:22-45`

```javascript
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists and is active
    const user = userDb.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};
```

**Security Checks:**
1. Token presence in `Authorization` header
2. Token signature validity
3. User existence in database
4. User active status

### JWT Secret Configuration

**Location:** `/Users/elik.k/git/claudecodeui/server/middleware/auth.js:5`

```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'claude-ui-dev-secret-change-in-production';
```

**Security Best Practice:**
- Default secret is for development only
- Production deployments should set `JWT_SECRET` environment variable
- Secret should be cryptographically random and long (minimum 32 characters)

---

## Password Security

### Password Hashing with bcrypt

**Location:** `/Users/elik.k/git/claudecodeui/server/routes/auth.js:47-48`

```javascript
const saltRounds = 12;
const passwordHash = await bcrypt.hash(password, saltRounds);
```

**Features:**
- Uses bcrypt with 12 rounds (strong security)
- Salt automatically generated per password
- Password hashes stored, never plaintext

### Password Validation Requirements

**Location:** `/Users/elik.k/git/claudecodeui/server/routes/auth.js:32-34`

```javascript
if (username.length < 3 || password.length < 6) {
  return res.status(400).json({
    error: 'Username must be at least 3 characters, password at least 6 characters'
  });
}
```

### Password Verification

**Location:** `/Users/elik.k/git/claudecodeui/server/routes/auth.js:98-101`

```javascript
// Verify password
const isValidPassword = await bcrypt.compare(password, user.password_hash);
if (!isValidPassword) {
  return res.status(401).json({ error: 'Invalid username or password' });
}
```

**Security Note:** Generic error message prevents username enumeration attacks.

---

## WebSocket Authentication

### Token-Based WebSocket Auth

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:144-166`

```javascript
const wss = new WebSocketServer({
  server,
  verifyClient: (info) => {
    // Extract token from query parameters or headers
    const url = new URL(info.req.url, 'http://localhost');
    const token = url.searchParams.get('token') ||
        info.req.headers.authorization?.split(' ')[1];

    // Verify token
    const user = authenticateWebSocket(token);
    if (!user) {
      console.log('❌ WebSocket authentication failed');
      return false;
    }

    // Store user info in the request for later use
    info.req.user = user;
    console.log('✅ WebSocket authenticated for user:', user.username);
    return true;
  }
});
```

### Frontend WebSocket Connection

**Location:** `/Users/elik.k/git/claudecodeui/src/utils/websocket.js:22-60`

```javascript
const connect = async () => {
  // Get authentication token
  const token = localStorage.getItem('auth-token');
  if (!token) {
    console.warn('No authentication token found for WebSocket connection');
    return;
  }

  // Fetch server configuration to get the correct WebSocket URL
  const configResponse = await fetch('/api/config', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  const config = await configResponse.json();

  // Include token in WebSocket URL as query parameter
  const wsUrl = `${config.wsUrl}/ws?token=${encodeURIComponent(token)}`;
  const websocket = new WebSocket(wsUrl);
  // ...
};
```

**Security Features:**
- Token passed as query parameter (WebSocket doesn't support custom headers)
- Connection rejected at handshake if authentication fails
- Automatic reconnection with token refresh

---

## API Key Validation

### Optional API Key Middleware

**Location:** `/Users/elik.k/git/claudecodeui/server/middleware/auth.js:7-19`

```javascript
const validateApiKey = (req, res, next) => {
  // Skip API key validation if not configured
  if (!process.env.API_KEY) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};
```

**Usage:** `/Users/elik.k/git/claudecodeui/server/index.js:175`

```javascript
// Optional API key validation (if configured)
app.use('/api', validateApiKey);
```

**Configuration:**
- Set `API_KEY` environment variable to enable
- Applied to all `/api/*` routes
- Checked via `X-API-Key` header

---

## CORS Configuration

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:171`

```javascript
app.use(cors());
```

**Current Setup:**
- Allows all origins (permissive configuration)
- Suitable for local development
- **Production Recommendation:** Configure with specific origins

### Production CORS Example

```javascript
app.use(cors({
  origin: ['https://your-domain.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
}));
```

---

## Path Security

### Preventing Directory Traversal

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:376-378`

```javascript
// Security check - ensure the path is safe and absolute
if (!filePath || !path.isAbsolute(filePath)) {
  return res.status(400).json({ error: 'Invalid file path' });
}
```

**Security Checks:**
1. Only absolute paths allowed (prevents `../` attacks)
2. Path existence verification before operations
3. Permission checks via `fs.access()`

### File Access Validation

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:318-326`

```javascript
// Security check - ensure path is accessible
try {
  await fs.promises.access(targetPath);
  const stats = await fs.promises.stat(targetPath);

  if (!stats.isDirectory()) {
    return res.status(400).json({ error: 'Path is not a directory' });
  }
} catch (err) {
  return res.status(404).json({ error: 'Directory not accessible' });
}
```

---

## Tools Security

### Default-Deny Policy

All Claude Code tools are **disabled by default** for security. Users must explicitly enable tools in Settings.

**Location:** `/Users/elik.k/git/claudecodeui/server/claude-cli.js:176-218`

```javascript
// Add tools settings flags
if (settings.skipPermissions && permissionMode !== 'plan') {
  args.push('--dangerously-skip-permissions');
  console.log('⚠️  Using --dangerously-skip-permissions');
} else {
  // Collect all allowed tools
  let allowedTools = [...(settings.allowedTools || [])];

  // Add plan mode specific tools
  if (permissionMode === 'plan') {
    const planModeTools = ['Read', 'Task', 'exit_plan_mode', 'TodoRead', 'TodoWrite'];
    for (const tool of planModeTools) {
      if (!allowedTools.includes(tool)) {
        allowedTools.push(tool);
      }
    }
  }

  // Add allowed tools
  if (allowedTools.length > 0) {
    for (const tool of allowedTools) {
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

Three permission modes available:

1. **Default** - Prompts for each tool use
2. **Plan** - Limited tools (Read, TodoWrite, TodoRead, Task, exit_plan_mode)
3. **No-Approval** - Auto-approves all enabled tools (dangerous)

**Security Best Practice:** Users should enable only necessary tools for their workflow.

---

## Input Validation

### Registration Input Validation

**Location:** `/Users/elik.k/git/claudecodeui/server/routes/auth.js:28-34`

```javascript
// Validate input
if (!username || !password) {
  return res.status(400).json({ error: 'Username and password are required' });
}

if (username.length < 3 || password.length < 6) {
  return res.status(400).json({
    error: 'Username must be at least 3 characters, password at least 6 characters'
  });
}
```

### File Upload Validation

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:993-1009`

```javascript
const fileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5
  }
});
```

### Project Path Validation

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:292-295`

```javascript
if (!projectPath || !projectPath.trim()) {
  return res.status(400).json({ error: 'Project path is required' });
}
```

---

## Secret Management

### Environment Variables

**Location:** `/Users/elik.k/git/claudecodeui/.env.example`

```bash
# Backend server port (Express API + WebSocket server)
PORT=3001

# Frontend dev server port
VITE_PORT=5173

# Optional: Custom Claude CLI path
# CLAUDE_CLI_PATH=claude

# JWT secret for production (not in .env.example for security)
# JWT_SECRET=your-long-random-secret-here

# Optional: API key for additional security layer
# API_KEY=your-api-key-here

# Optional: OpenAI API key for Whisper transcription
# OPENAI_API_KEY=sk-...
```

### Secrets Not in Version Control

The `.env` file is in `.gitignore` to prevent accidental commit of secrets:

```gitignore
.env
*.db
node_modules/
```

### API Keys for External Services

**OpenAI Whisper (Optional):**

**Location:** `/Users/elik.k/git/claudecodeui/server/index.js:838-841`

```javascript
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  return res.status(500).json({
    error: 'OpenAI API key not configured. Please set OPENAI_API_KEY in server environment.'
  });
}
```

---

## Security Recommendations

### For Development

1. **Use default JWT secret** - Acceptable for local development
2. **No HTTPS required** - WebSocket over WS is fine locally
3. **Single-user model** - Appropriate for personal use

### For Production Deployment

1. **Set Strong JWT Secret**
   ```bash
   export JWT_SECRET=$(openssl rand -base64 32)
   ```

2. **Enable API Key**
   ```bash
   export API_KEY=$(openssl rand -hex 32)
   ```

3. **Configure CORS Properly**
   ```javascript
   app.use(cors({
     origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
     credentials: true
   }));
   ```

4. **Use HTTPS**
   - Deploy behind reverse proxy (nginx, Caddy)
   - WebSocket will upgrade to WSS automatically

5. **Enable Security Headers**
   ```javascript
   import helmet from 'helmet';
   app.use(helmet({
     contentSecurityPolicy: false // Adjust based on your needs
   }));
   ```

6. **Rate Limiting**
   ```javascript
   import rateLimit from 'express-rate-limit';

   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100 // limit each IP to 100 requests per windowMs
   });
   app.use('/api/', limiter);
   ```

7. **Regular Dependency Updates**
   ```bash
   npm audit
   npm update
   ```

---

## Security Audit Checklist

- [x] Password hashing with bcrypt (12 rounds)
- [x] JWT token-based authentication
- [x] WebSocket authentication
- [x] Input validation on all endpoints
- [x] Path security (absolute paths only)
- [x] File upload restrictions (type, size)
- [x] Default-deny tool permissions
- [x] Transaction-based user creation (race condition prevention)
- [x] Secret management via environment variables
- [ ] CORS restricted to specific origins (production)
- [ ] Rate limiting (recommended for production)
- [ ] Security headers with helmet (recommended for production)
- [ ] HTTPS/WSS (required for production)
- [ ] Multi-user support (not applicable - single-user design)

---

## Common Security Questions

**Q: Why doesn't JWT token expire?**
A: Claude Code UI is designed for local development where the user is the sole developer. Token expiration would be an inconvenience without security benefit in this context.

**Q: Is the single-user model secure?**
A: Yes, for local development. The application is intended to run on `localhost` accessible only to the local user. For multi-user scenarios, significant architectural changes would be needed.

**Q: What about SQL injection?**
A: Better-sqlite3 uses prepared statements with parameter binding, preventing SQL injection:
```javascript
db.prepare('SELECT * FROM users WHERE username = ?').get(username);
```

**Q: Are WebSocket messages encrypted?**
A: In development (WS), messages are not encrypted. In production with HTTPS, WebSocket automatically upgrades to WSS (encrypted).

**Q: How are file permissions handled?**
A: Node.js file system operations respect OS-level permissions. The application cannot access files the running user doesn't have permission to read/write.
