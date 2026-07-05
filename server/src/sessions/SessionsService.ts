import fs from 'fs';
import path from 'path';
import { ChatSession } from '@antiweb/shared';
import { config } from '../config';
import { PtyManager } from '../pty';

export class SessionsService {
  private ptyManager: PtyManager;

  constructor(ptyManager: PtyManager) {
    this.ptyManager = ptyManager;
    if (!fs.existsSync(config.sessionsDir)) {
      fs.mkdirSync(config.sessionsDir, { recursive: true });
    }
  }

  private getSessionPath(id: string): string {
    return path.join(config.sessionsDir, `${id}.json`);
  }

  public async createSession(title?: string, workspacePath?: string, model?: string): Promise<ChatSession> {
    const id = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const session: ChatSession = {
      id,
      title: title || `Chat ${new Date().toLocaleTimeString()}`,
      createdAt: now,
      updatedAt: now,
      archived: false,
      workspacePath: workspacePath || process.cwd(),
      model: model || undefined,
      ptyStatus: 'running'
    };

    this.saveSession(session);
    await this.ptyManager.ensurePty(id, session.workspacePath, 80, 24, undefined, undefined, session.model);
    return session;
  }

  public getSession(id: string): ChatSession | null {
    const file = this.getSessionPath(id);
    if (!fs.existsSync(file)) return null;
    try {
      const session: ChatSession = JSON.parse(fs.readFileSync(file, 'utf-8'));
      session.ptyStatus = this.ptyManager.isRunning(id) ? 'running' : 'stopped';
      return session;
    } catch (e) {
      console.error(`Error reading session ${id}:`, e);
      return null;
    }
  }

  public saveSession(session: ChatSession): void {
    session.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.getSessionPath(session.id), JSON.stringify(session, null, 2));
  }

  public listSessions(search?: string, includeArchived: boolean = false): ChatSession[] {
    if (!fs.existsSync(config.sessionsDir)) return [];
    const files = fs.readdirSync(config.sessionsDir).filter(f => f.endsWith('.json'));
    const sessions: ChatSession[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(config.sessionsDir, file), 'utf-8');
        const session: ChatSession = JSON.parse(content);
        session.ptyStatus = this.ptyManager.isRunning(session.id) ? 'running' : 'stopped';

        if (!includeArchived && session.archived) continue;
        if (search) {
          const q = search.toLowerCase();
          if (!session.title.toLowerCase().includes(q) && !session.id.toLowerCase().includes(q)) {
            continue;
          }
        }
        sessions.push(session);
      } catch (e) {
        console.error(`Error reading session file ${file}:`, e);
      }
    }

    return sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public renameSession(id: string, title: string): ChatSession | null {
    const session = this.getSession(id);
    if (!session) return null;
    session.title = title;
    this.saveSession(session);
    return session;
  }

  public archiveSession(id: string, archived: boolean = true): ChatSession | null {
    const session = this.getSession(id);
    if (!session) return null;
    session.archived = archived;
    if (archived) {
      this.ptyManager.kill(id);
      session.ptyStatus = 'stopped';
    }
    this.saveSession(session);
    return session;
  }

  public async updateSession(id: string, updates: { title?: string; archived?: boolean; model?: string; workspacePath?: string }): Promise<ChatSession | null> {
    const session = this.getSession(id);
    if (!session) return null;
    let needsRestart = false;
    if (updates.title !== undefined) session.title = updates.title;
    if (updates.archived !== undefined) {
      session.archived = updates.archived;
      if (updates.archived) {
        this.ptyManager.kill(id);
        session.ptyStatus = 'stopped';
      }
    }
    if (updates.model !== undefined && updates.model !== session.model) {
      session.model = updates.model;
      needsRestart = true;
    }
    if (updates.workspacePath !== undefined && updates.workspacePath !== session.workspacePath) {
      session.workspacePath = updates.workspacePath;
      needsRestart = true;
    }
    this.saveSession(session);
    if (needsRestart && !session.archived) {
      await this.ptyManager.restartPty(id, session.workspacePath, 80, 24, undefined, ['-c'], session.model);
      session.ptyStatus = 'running';
    }
    return session;
  }

  public deleteSession(id: string): boolean {
    const file = this.getSessionPath(id);
    if (!fs.existsSync(file)) return false;
    this.ptyManager.kill(id);
    fs.unlinkSync(file);
    return true;
  }

  public async resumeSession(id: string, cols: number = 80, rows: number = 24): Promise<ChatSession | null> {
    const session = this.getSession(id);
    if (!session) return null;
    await this.ptyManager.ensurePty(id, session.workspacePath, cols, rows, undefined, ['-c'], session.model);
    session.ptyStatus = 'running';
    this.saveSession(session);
    return session;
  }

  public async restartSessionPty(id: string, cols: number = 80, rows: number = 24): Promise<ChatSession | null> {
    const session = this.getSession(id);
    if (!session) return null;
    await this.ptyManager.restartPty(id, session.workspacePath, cols, rows, undefined, ['-c'], session.model);
    session.ptyStatus = 'running';
    this.saveSession(session);
    return session;
  }
}
