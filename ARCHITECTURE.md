# AntiWeb Architecture & System Design

AntiWeb is a production-quality, real-time web interface for the Antigravity CLI (`agy`), built for Linux desktop and mobile access. It communicates with the local filesystem and pseudo-terminals (`node-pty`) via a Fastify + WebSocket server, displaying data in a modern, responsive Next.js + TailwindCSS + shadcn/ui application.

---

## 1. Architectural Overview & Reasoning

```
+-------------------------------------------------------------------------------+
| Client (Next.js 14 App Router + TailwindCSS + xterm.js + Markdown Engine)     |
+-------------------------------------------------------------------------------+
       ^                                                  ^
       | HTTP / REST (Auth, Files, Uploads, Sessions)     | WebSocket Bidirectional Streaming
       v                                                  v
+-------------------------------------------------------------------------------+
| Server (Fastify + ws WebSocket Server + Cookie Auth + Rate Limiter)           |
+-------------------------------------------------------------------------------+
       |                                                  |
       v                                                  v
+-----------------------------------------+     +-------------------------------+
| PTY Layer (node-pty)                    |     | Filesystem & Disk Store       |
| - Chat Sessions (agy CLI instances)     |     | - Sessions (.data/sessions/)  |
| - General Linux Terminal Tabs           |     | - Uploads (.data/uploads/)    |
| - Abstraction: IAntigravityBackend      |     | - Workspace File Explorer     |
+-----------------------------------------+     +-------------------------------+
```

### Key Architectural Decisions:
1. **Decoupled PTY Abstraction (`IAntigravityBackend`)**:
   Instead of directly coupling WebSocket handlers to `node-pty`, we introduce an abstraction interface. Currently, `PtyAntigravityBackend` spawns `agy` via `node-pty`. If Google releases an official RPC or API for Antigravity in the future, we simply implement `ApiAntigravityBackend` against `IAntigravityBackend`.
2. **Zero-Buffering Real-time WebSocket Protocol**:
   Terminal output (`stdout`/`stderr`) is emitted immediately over WebSockets (`terminal.output`). A lightweight circular history buffer (max 100KB per session) is retained in memory/disk so that browser refreshes instantly restore the exact terminal display.
3. **Single-User Security & Session Persistence**:
   A `.env`-configured password authenticates sessions via secure, HTTP-only cookies with CSRF tokens and rate limiting. Sessions and settings persist across server restarts in `.data/`.

---

## 2. Folder Structure

```
antiweb/
├── package.json (Monorepo root)
├── tsconfig.base.json
├── shared/
│   ├── package.json
│   └── src/
│       ├── protocol.ts      # WebSocket Event types & Payloads
│       ├── session.ts       # Chat Session & Terminal models
│       ├── filesystem.ts    # File tree & Workspace types
│       └── index.ts
├── server/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── index.ts         # Server bootstrapper
│       ├── config/          # Environment & Security configuration
│       ├── auth/            # Single-user authentication & CSRF
│       ├── pty/             # PTY Manager & IAntigravityBackend
│       ├── sessions/        # Disk-persistent session management
│       ├── websockets/      # Real-time WebSocket event broker
│       ├── terminal/        # General Linux terminal PTY management
│       ├── filesystem/      # Workspace file explorer & reader
│       ├── uploads/         # Drag & Drop file upload handling
│       └── settings/        # App settings manager
└── client/
    ├── package.json
    ├── tailwind.config.ts
    └── src/
        ├── app/             # Next.js App Router (Main Layout, Chat, Terminal, Files)
        ├── components/
        │   ├── sidebar/     # Session history, Search, New Chat
        │   ├── chat/        # Markdown viewer, Streaming display, Input box
        │   ├── terminal/    # xterm.js full interactive terminal wrapper
        │   ├── files/       # Workspace file tree explorer & code viewer
        │   ├── uploads/     # Drag & drop upload dropzone & preview
        │   └── ui/          # Reusable shadcn-style UI components
        ├── hooks/           # useWebSocket, useSession, useTerminal
        └── lib/             # API client, WebSocket singleton
```

---

## 3. PTY Abstraction Design

### Interface Definition (`IAntigravityBackend`)
```typescript
export interface IPtyEvent {
  sessionId: string;
  data?: string;
  exitCode?: number;
}

export interface IAntigravityBackend {
  spawn(sessionId: string, cols: number, rows: number, cwd?: string): Promise<void>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  kill(sessionId: string): void;
  onData(callback: (event: IPtyEvent) => void): void;
  onExit(callback: (event: IPtyEvent) => void): void;
}
```

---

## 4. Communication Protocol (WebSockets)

Every WebSocket message follows a standard envelope:
```json
{
  "event": "terminal.output",
  "payload": {
    "sessionId": "sess_123",
    "data": "\u001b[32mAntigravity initialized...\u001b[0m"
  }
}
```

### Event Catalog:
- **Client -> Server**:
  - `terminal.input`: Send raw keystrokes/stdin to PTY.
  - `terminal.resize`: Update `cols` and `rows` of PTY.
  - `session.attach`: Subscribe WebSocket connection to a specific session's PTY streams.
  - `ping`: Keepalive heartbeat.
- **Server -> Client**:
  - `terminal.output`: Real-time stdout/stderr chunk.
  - `terminal.exit`: PTY process terminated.
  - `session.created` / `session.updated`: Session metadata changed.
  - `workspace.changed`: Filesystem watcher detected changes.
  - `pong`: Keepalive response.

---

## 5. Session Model

```typescript
export interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  workspacePath: string;
  ptyStatus: 'running' | 'exited' | 'stopped';
  exitCode?: number;
  scrollback?: string; // Stored recent buffer for instant restoration
}
```
Sessions are stored on disk in JSON files inside `server/.data/sessions/<id>.json`.
