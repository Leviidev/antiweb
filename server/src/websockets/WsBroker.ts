import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { WsClientMessage, WsServerMessage, WsServerEventType } from '@antiweb/shared';
import { PtyManager } from '../pty';
import { TerminalManager } from '../terminal';
import { AuthService } from '../auth';
import { SessionsService } from '../sessions';

interface ClientConnection {
  socket: WebSocket;
  isAlive: boolean;
  attachedTargetIds: Set<string>;
}

export class WsBroker {
  private wss?: WebSocketServer;
  private clients: Set<ClientConnection> = new Set();
  private ptyManager: PtyManager;
  private terminalManager: TerminalManager;
  private authService: AuthService;
  private sessionsService: SessionsService;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(
    ptyManager: PtyManager,
    terminalManager: TerminalManager,
    authService: AuthService,
    sessionsService: SessionsService
  ) {
    this.ptyManager = ptyManager;
    this.terminalManager = terminalManager;
    this.authService = authService;
    this.sessionsService = sessionsService;

    // Listen to output from Chat sessions PTY manager
    this.ptyManager.onOutput((sessionId: string, data: string) => {
      this.broadcastToSubscribers('terminal.output', { targetId: sessionId, data }, sessionId);
    });

    this.ptyManager.onExit((sessionId: string, exitCode: number) => {
      this.broadcastToSubscribers('terminal.exit', { targetId: sessionId, exitCode }, sessionId);
    });

    // Listen to output from Terminal tabs PTY manager
    this.terminalManager.getPtyManager().onOutput((tabId: string, data: string) => {
      this.broadcastToSubscribers('terminal.output', { targetId: tabId, data }, tabId);
    });

    this.terminalManager.getPtyManager().onExit((tabId: string, exitCode: number) => {
      this.broadcastToSubscribers('terminal.exit', { targetId: tabId, exitCode }, tabId);
    });
  }

  public attachToServer(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (socket: WebSocket, req) => {
      // Check HTTP Basic Auth first (for OpenCode-style popup alert auth)
      const authHeader = req.headers['authorization'];
      const httpUser = process.env.ANTIWEB_HTTP_USER || process.env.ANTIWEB_USER || 'antiweb';
      const httpPass = process.env.ANTIWEB_HTTP_PASSWORD || process.env.ANTIWEB_PASSWORD || process.env.PASSWORD;

      let basicAuthValid = false;
      if (httpPass && authHeader) {
        const [scheme, encoded] = authHeader.split(' ');
        if (scheme?.toLowerCase() === 'basic' && encoded) {
          try {
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
            const [user, ...passParts] = decoded.split(':');
            if (user === httpUser && passParts.join(':') === httpPass) {
              basicAuthValid = true;
            }
          } catch (e) {}
        }
      }

      // Check session cookie if Basic Auth is not configured or not passed
      const cookieHeader = req.headers.cookie || '';
      const match = cookieHeader.match(/antiweb_session=([^;]+)/);
      const token = match ? match[1] : undefined;
      const sessionValid = this.authService.isValidSession(token);

      if (!basicAuthValid && !sessionValid) {
        socket.close(4001, 'Unauthorized');
        return;
      }

      const client: ClientConnection = {
        socket,
        isAlive: true,
        attachedTargetIds: new Set()
      };

      this.clients.add(client);

      socket.on('pong', () => {
        client.isAlive = true;
      });

      socket.on('message', async (raw: string) => {
        try {
          const msg: WsClientMessage = JSON.parse(raw.toString());
          await this.handleClientMessage(client, msg);
        } catch (err) {
          console.error('Invalid WebSocket message received:', err);
        }
      });

      socket.on('close', () => {
        this.clients.delete(client);
      });

      socket.on('error', (err) => {
        console.error('WebSocket client error:', err);
        this.clients.delete(client);
      });
    });

    // Heartbeat checking every 30s
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.socket.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.socket.ping();
      }
    }, 30000);
  }

  private async ensureTerminalPty(targetId: string, cols: number = 80, rows: number = 24): Promise<void> {
    let cwd = process.cwd();
    const tab = this.terminalManager.listTabs().find(t => t.id === targetId);
    if (tab?.cwd) {
      cwd = tab.cwd;
    } else {
      const sessionId = targetId.replace('term_', '');
      const session = this.sessionsService.listSessions().find(s => s.id === sessionId);
      if (session?.workspacePath) {
        cwd = session.workspacePath;
      }
    }
    await this.terminalManager.getPtyManager().ensurePty(targetId, cwd, cols, rows, process.env.SHELL || 'bash', []);
  }

  private async handleClientMessage(client: ClientConnection, msg: WsClientMessage): Promise<void> {
    const { event, payload } = msg;

    switch (event) {
      case 'ping':
        this.sendMessage(client.socket, 'pong', {});
        break;

      case 'session.attach': {
        const { targetId, cols, rows } = payload || {};
        if (!targetId) return;
        client.attachedTargetIds.add(targetId);

        const isTerminalTab = targetId.startsWith('term_');
        const targetPtyMgr = isTerminalTab ? this.terminalManager.getPtyManager() : this.ptyManager;

        // Auto-resume / spawn PTY if it isn't running (e.g. after server restart or loading old session)
        if (!targetPtyMgr.isRunning(targetId)) {
          if (isTerminalTab) {
            await this.ensureTerminalPty(targetId, cols || 80, rows || 24);
          } else {
            await this.sessionsService.resumeSession(targetId, cols || 80, rows || 24);
          }
        } else if (cols && rows) {
          targetPtyMgr.resize(targetId, cols, rows);
        }

        const scrollback = targetPtyMgr.getScrollback(targetId);
        if (scrollback) {
          this.sendMessage(client.socket, 'terminal.output', { targetId, data: scrollback });
        }
        break;
      }

      case 'terminal.input': {
        const { targetId, data } = payload || {};
        if (!targetId || typeof data !== 'string') return;
        const isTerminalTab = targetId.startsWith('term_');
        const targetPtyMgr = isTerminalTab ? this.terminalManager.getPtyManager() : this.ptyManager;

        if (!targetPtyMgr.isRunning(targetId)) {
          if (isTerminalTab) {
            await this.ensureTerminalPty(targetId, 80, 24);
          } else {
            await this.sessionsService.resumeSession(targetId, 80, 24);
          }
          // Give the CLI 1500ms to initialize its interactive prompt before writing buffered input
          setTimeout(() => {
            targetPtyMgr.write(targetId, data);
          }, 1500);
        } else {
          targetPtyMgr.write(targetId, data);
        }
        break;
      }

      case 'terminal.resize': {
        const { targetId, cols, rows } = payload || {};
        if (!targetId || !cols || !rows) return;
        const isTerminalTab = targetId.startsWith('term_');
        const targetPtyMgr = isTerminalTab ? this.terminalManager.getPtyManager() : this.ptyManager;
        targetPtyMgr.resize(targetId, cols, rows);
        break;
      }
    }
  }

  public sendMessage<T>(socket: WebSocket, event: WsServerEventType, payload?: T): void {
    if (socket.readyState === WebSocket.OPEN) {
      const msg: WsServerMessage<T> = { event, payload };
      socket.send(JSON.stringify(msg));
    }
  }

  public broadcast<T>(event: WsServerEventType, payload?: T): void {
    for (const client of this.clients) {
      this.sendMessage(client.socket, event, payload);
    }
  }

  public broadcastToSubscribers<T>(event: WsServerEventType, payload: T, targetId: string): void {
    for (const client of this.clients) {
      if (client.attachedTargetIds.has(targetId)) {
        this.sendMessage(client.socket, event, payload);
      }
    }
  }

  public close(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.wss?.close();
  }
}
