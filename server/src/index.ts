import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import httpProxy from '@fastify/http-proxy';
import fs from 'fs';
import { config } from './config';
import { AuthService } from './auth';
import { PtyManager } from './pty';
import { TerminalManager } from './terminal';
import { SessionsService } from './sessions';
import { SettingsService } from './settings';
import { FilesystemService } from './filesystem';
import { UploadsService } from './uploads';
import { WsBroker } from './websockets';

async function startServer() {
  const fastify = Fastify({
    logger: true,
    bodyLimit: 10 * 1024 * 1024 // 10MB limit
  });

  // Services initialization
  const authService = new AuthService();
  const ptyManager = new PtyManager();
  const terminalManager = new TerminalManager(ptyManager);
  const sessionsService = new SessionsService(ptyManager);
  const settingsService = new SettingsService();
  const filesystemService = new FilesystemService();
  const uploadsService = new UploadsService();
  const wsBroker = new WsBroker(ptyManager, terminalManager, authService, sessionsService);

  // Plugins
  await fastify.register(cors, {
    origin: true, // Allow LAN / localhost access
    credentials: true
  });

  await fastify.register(cookie, {
    secret: config.cookieSecret,
    parseOptions: {}
  });

  await fastify.register(rateLimit, {
    max: 200,
    timeWindow: '1 minute'
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024 // 20MB per file
    }
  });

  // --- HTTP BASIC AUTH HOOK (OpenCode-style browser popup alert) ---
  fastify.addHook('onRequest', async (req, reply) => {
    const httpUser = process.env.ANTIWEB_HTTP_USER || process.env.ANTIWEB_USER || 'antiweb';
    const httpPass = process.env.ANTIWEB_HTTP_PASSWORD || process.env.ANTIWEB_PASSWORD || process.env.PASSWORD;

    if (httpPass) {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const [scheme, encoded] = authHeader.split(' ');
        if (scheme?.toLowerCase() === 'basic' && encoded) {
          try {
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
            const [user, ...passParts] = decoded.split(':');
            const pass = passParts.join(':');
            if (user === httpUser && pass === httpPass) {
              // Basic auth passed! Ensure they also get a session cookie so WebSockets can authenticate!
              const token = req.cookies.antiweb_session;
              if (!authService.isValidSession(token)) {
                const { sessionToken } = authService.createSession();
                reply.setCookie('antiweb_session', sessionToken, {
                  path: '/',
                  httpOnly: true,
                  sameSite: 'lax',
                  maxAge: 60 * 60 * 24 * 30 // 30 days
                });
              }
              return; // Basic auth passed!
            }
          } catch (e) {
            // ignore
          }
        }
      }

      // Trigger browser native popup alert box
      reply.status(401).header('WWW-Authenticate', 'Basic realm="AntiWeb Studio"').send('Authentication Required');
      return reply;
    }
  });

  // Authentication middleware for API routes
  fastify.addHook('preHandler', async (req, reply) => {
    // If HTTP Basic Auth is configured, they already passed onRequest hook!
    const httpPass = process.env.ANTIWEB_HTTP_PASSWORD || process.env.ANTIWEB_PASSWORD || process.env.PASSWORD;
    if (httpPass) return;

    // Public routes
    if (req.url.startsWith('/api/auth/login') || req.url.startsWith('/api/auth/status')) {
      return;
    }
    // Check if it's an API route or upload file access
    if (req.url.startsWith('/api/')) {
      const token = req.cookies.antiweb_session;
      if (!authService.isValidSession(token)) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  });

  // --- AUTH ROUTES ---
  fastify.post('/api/auth/login', async (req, reply) => {
    const { password } = (req.body as { password?: string }) || {};
    if (!password || !authService.verifyPassword(password)) {
      return reply.status(401).send({ error: 'Invalid password' });
    }

    const { sessionToken, csrfToken } = authService.createSession();
    reply.setCookie('antiweb_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return { success: true, csrfToken };
  });

  fastify.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies.antiweb_session;
    authService.destroySession(token);
    reply.clearCookie('antiweb_session', { path: '/' });
    return { success: true };
  });

  fastify.get('/api/auth/status', async (req, reply) => {
    const token = req.cookies.antiweb_session;
    const httpPass = process.env.ANTIWEB_HTTP_PASSWORD || process.env.ANTIWEB_PASSWORD || process.env.PASSWORD;
    
    // If HTTP Basic Auth is set, they passed the popup box, so consider them authenticated!
    const authenticated = !!httpPass || authService.isValidSession(token);
    const csrfToken = authenticated ? authService.getNewCsrfToken() : undefined;
    return { authenticated, csrfToken };
  });

  // --- MODELS ROUTES ---
  fastify.get('/api/models', async () => {
    return [
      // OpenCode Cloud / Default Models
      'DeepSeek V4 Flash',
      'DeepSeek V4 Flash Free',
      'Gemini 3.5 Flash (Medium)',
      'Gemini 3.5 Flash (High)',
      'Gemini 3.5 Flash (Low)',
      'Gemini 3.1 Pro (Low)',
      'Gemini 3.1 Pro (High)',
      'Claude Sonnet 4.6 (Thinking)',
      'Claude Opus 4.6 (Thinking)',
      'GPT-OSS 120B (Medium)',
      // BYOK: OpenRouter
      'openrouter/deepseek/deepseek-chat',
      'openrouter/anthropic/claude-3.5-sonnet',
      'openrouter/meta-llama/llama-3.3-70b-instruct',
      'openrouter/openai/gpt-4o',
      'openrouter/google/gemini-2.0-flash-001',
      // BYOK: Groq
      'groq/llama-3.3-70b-versatile',
      'groq/mixtral-8x7b-32768',
      // BYOK: Google Gemini
      'gemini/gemini-2.0-flash',
      'gemini/gemini-1.5-pro',
      'gemini/gemini-2.5-pro',
      // BYOK: OpenAI
      'openai/gpt-4o',
      'openai/o1',
      'openai/o3-mini',
      // BYOK: Anthropic Claude
      'anthropic/claude-3-5-sonnet-20241022',
      'anthropic/claude-3-opus-20240229',
      // BYOK: Cerebras
      'cerebras/llama3.1-70b',
      // BYOK: Ollama (Local)
      'ollama/llama3.2',
      'ollama/deepseek-r1'
    ];
  });

  // --- SESSIONS ROUTES ---
  fastify.get('/api/sessions', async (req, reply) => {
    const { search, includeArchived } = (req.query as { search?: string; includeArchived?: string }) || {};
    return sessionsService.listSessions(search, includeArchived === 'true');
  });

  fastify.post('/api/sessions', async (req, reply) => {
    const { title, workspacePath, model } = (req.body as { title?: string; workspacePath?: string; model?: string }) || {};
    const session = await sessionsService.createSession(title, workspacePath || settingsService.getSettings().defaultWorkspacePath, model);
    wsBroker.broadcast('session.created', session);
    return session;
  });

  fastify.get('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const session = sessionsService.getSession(id);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    return session;
  });

  fastify.patch('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { title?: string; archived?: boolean; model?: string; workspacePath?: string }) || {};
    const session = await sessionsService.updateSession(id, body);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    wsBroker.broadcast('session.updated', session);
    return session;
  });

  fastify.delete('/api/sessions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = sessionsService.deleteSession(id);
    if (!deleted) return reply.status(404).send({ error: 'Session not found' });
    wsBroker.broadcast('session.deleted', { id });
    return { success: true };
  });

  fastify.post('/api/sessions/:id/resume', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { cols, rows } = (req.body as { cols?: number; rows?: number }) || {};
    const session = await sessionsService.resumeSession(id, cols || 80, rows || 24);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    wsBroker.broadcast('session.updated', session);
    return session;
  });

  fastify.post('/api/sessions/:id/restart', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { cols, rows } = (req.body as { cols?: number; rows?: number }) || {};
    const session = await sessionsService.restartSessionPty(id, cols || 80, rows || 24);
    if (!session) return reply.status(404).send({ error: 'Session not found' });
    wsBroker.broadcast('session.updated', session);
    return session;
  });

  // --- TERMINALS ROUTES ---
  fastify.get('/api/terminals', async () => {
    return terminalManager.listTabs();
  });

  fastify.post('/api/terminals', async (req, reply) => {
    const { title, cwd } = (req.body as { title?: string; cwd?: string }) || {};
    return terminalManager.createTab(title, cwd || settingsService.getSettings().defaultWorkspacePath);
  });

  fastify.delete('/api/terminals/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    terminalManager.closeTab(id);
    return { success: true };
  });

  // --- FILESYSTEM ROUTES ---
  fastify.get('/api/files/list', async (req, reply) => {
    const { path: dirPath } = (req.query as { path?: string }) || {};
    const target = dirPath || settingsService.getSettings().defaultWorkspacePath;
    try {
      return filesystemService.listDirectory(target);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  fastify.get('/api/files/read', async (req, reply) => {
    const { path: filePath } = (req.query as { path?: string }) || {};
    if (!filePath) return reply.status(400).send({ error: 'File path required' });
    try {
      return filesystemService.readFile(filePath);
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  fastify.post('/api/files/write', async (req, reply) => {
    const { path: filePath, content } = (req.body as { path?: string; content?: string }) || {};
    if (!filePath || typeof content !== 'string') {
      return reply.status(400).send({ error: 'Valid file path and content required' });
    }
    try {
      filesystemService.writeFile(filePath, content);
      wsBroker.broadcast('workspace.changed', { path: filePath });
      return { success: true };
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message });
    }
  });

  // --- SETTINGS ROUTES ---
  fastify.get('/api/settings', async () => {
    return settingsService.getSettings();
  });

  fastify.patch('/api/settings', async (req, reply) => {
    const updates = req.body as any;
    const updated = settingsService.updateSettings(updates);
    wsBroker.broadcast('settings.updated', updated);
    return updated;
  });

  // --- UPLOADS ROUTES ---
  fastify.get('/api/uploads/list', async () => {
    return uploadsService.listUploads();
  });

  fastify.post('/api/uploads', async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const buffer = await data.toBuffer();
    const file = await uploadsService.saveUpload(buffer, data.filename, data.mimetype);
    return file;
  });

  fastify.delete('/api/uploads/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = uploadsService.deleteUpload(id);
    if (!deleted) return reply.status(404).send({ error: 'File not found' });
    return { success: true };
  });

  fastify.get('/api/uploads/file/:filename', async (req, reply) => {
    const { filename } = req.params as { filename: string };
    const fileInfo = uploadsService.getFile(filename);
    if (!fileInfo) return reply.status(404).send({ error: 'File not found' });

    reply.type(fileInfo.mimetype);
    return fs.createReadStream(fileInfo.path);
  });

  // --- SINGLE-PORT FRONTDOOR PROXY TO NEXT.JS ---
  // Proxy all non-API / non-WS requests to internal Next.js client port
  const internalClientPort = parseInt(process.env.PORT_CLIENT || '3001', 10);
  await fastify.register(httpProxy, {
    upstream: `http://127.0.0.1:${internalClientPort}`,
    prefix: '/',
    httpMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
    websocket: false // WebSockets are handled by wsBroker on /ws
  });

  // Start HTTP Server
  const address = await fastify.listen({ port: config.port, host: config.host });
  console.log(`🚀 AntiWeb Server running at ${address}`);

  // Attach WebSocket server
  wsBroker.attachToServer(fastify.server);
  console.log(`⚡ WebSocket Server listening on ${address}/ws`);
}

startServer().catch(err => {
  console.error('Fatal error starting AntiWeb server:', err);
  process.exit(1);
});
