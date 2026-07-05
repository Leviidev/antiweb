import * as pty from 'node-pty';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IAntigravityBackend, IPtyEvent } from './IAntigravityBackend';
import { config } from '../config';

interface PtyInstance {
  process: pty.IPty;
  scrollback: string;
  running: boolean;
}

const MAX_SCROLLBACK_CHARS = 100000; // ~100KB buffer per session

export class PtyAntigravityBackend implements IAntigravityBackend {
  private instances: Map<string, PtyInstance> = new Map();
  private dataCallbacks: Array<(event: IPtyEvent) => void> = [];
  private exitCallbacks: Array<(event: IPtyEvent) => void> = [];

  public async spawn(
    sessionId: string,
    cols: number = 80,
    rows: number = 24,
    cwd: string = process.cwd(),
    command?: string,
    args: string[] = [],
    model?: string
  ): Promise<void> {
    if (this.instances.has(sessionId)) {
      this.kill(sessionId);
    }

    const defaultShell = process.platform === 'win32' ? (process.env.COMSPEC || 'powershell.exe') : (process.env.SHELL || 'bash');
    let cmd = command || config.agyCommand || defaultShell;
    const homeDir = process.env.HOME || os.homedir();

    // Resolve agy command path robustly across environments
    if (cmd === 'agy' || cmd === 'antigravity') {
      const candidates = [
        path.join(homeDir, '.local', 'bin', cmd),
        `/usr/local/bin/${cmd}`,
        `/usr/bin/${cmd}`,
        path.join(homeDir, 'bin', cmd),
        cmd
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          cmd = c;
          break;
        }
      }
    }

    const finalArgs = [...args];
    if (cmd.includes('agy') || cmd.endsWith('/agy') || cmd === 'agy') {
      if (model) finalArgs.push('--model', model);
    }

    const env: { [key: string]: string } = {
      ...process.env as { [key: string]: string },
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      PATH: `${process.env.PATH || ''}:${homeDir}/.local/bin:/usr/local/bin:/usr/bin:/bin`
    };

    // Inject API Keys from OpenCode auth.json and AntiWeb settings
    try {
      const authPath = path.join(homeDir, '.local', 'share', 'opencode', 'auth.json');
      if (fs.existsSync(authPath)) {
        const auth = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
        if (auth.opencode?.key) env.OPENCODE_API_KEY = auth.opencode.key;
        if (auth.openrouter?.key) env.OPENROUTER_API_KEY = auth.openrouter.key;
        if (auth.groq?.key) env.GROQ_API_KEY = auth.groq.key;
        if (auth.cerebras?.key) env.CEREBRAS_API_KEY = auth.cerebras.key;
        if (auth.google?.key) env.GEMINI_API_KEY = auth.google.key;
      }
      const settingsPath = path.join(process.cwd(), 'server', '.data', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const set = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (set.apiKeys) {
          if (set.apiKeys.opencode) env.OPENCODE_API_KEY = set.apiKeys.opencode;
          if (set.apiKeys.openrouter) env.OPENROUTER_API_KEY = set.apiKeys.openrouter;
          if (set.apiKeys.gemini) env.GEMINI_API_KEY = set.apiKeys.gemini;
          if (set.apiKeys.openai) env.OPENAI_API_KEY = set.apiKeys.openai;
          if (set.apiKeys.anthropic) env.ANTHROPIC_API_KEY = set.apiKeys.anthropic;
          if (set.apiKeys.groq) env.GROQ_API_KEY = set.apiKeys.groq;
          if (set.apiKeys.cerebras) env.CEREBRAS_API_KEY = set.apiKeys.cerebras;
          if (set.apiKeys.github) env.GITHUB_TOKEN = set.apiKeys.github;
          if (set.apiKeys.ollama) env.OLLAMA_HOST = set.apiKeys.ollama;
        }
      }
    } catch (e) {
      console.error('Error injecting API keys into PTY env:', e);
    }

    let ptyProcess: pty.IPty;
    try {
      ptyProcess = pty.spawn(cmd, finalArgs, {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: env as { [key: string]: string }
      });
    } catch (err) {
      // Fallback to default shell if command (e.g. agy) not found
      console.warn(`Failed to spawn "${cmd}", falling back to ${defaultShell}:`, err);
      ptyProcess = pty.spawn(defaultShell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env: env as { [key: string]: string }
      });
    }

    const instance: PtyInstance = {
      process: ptyProcess,
      scrollback: '',
      running: true
    };

    this.instances.set(sessionId, instance);

    ptyProcess.onData((data: string) => {
      // Append to scrollback
      instance.scrollback += data;
      if (instance.scrollback.length > MAX_SCROLLBACK_CHARS) {
        instance.scrollback = instance.scrollback.slice(-MAX_SCROLLBACK_CHARS);
      }

      for (const cb of this.dataCallbacks) {
        cb({ sessionId, data });
      }
    });

    ptyProcess.onExit((res: { exitCode: number; signal?: number }) => {
      instance.running = false;
      for (const cb of this.exitCallbacks) {
        cb({ sessionId, exitCode: res.exitCode });
      }
    });
  }

  public write(sessionId: string, data: string): void {
    const instance = this.instances.get(sessionId);
    if (instance && instance.running) {
      instance.process.write(data);
    }
  }

  public resize(sessionId: string, cols: number, rows: number): void {
    const instance = this.instances.get(sessionId);
    if (instance && instance.running) {
      try {
        instance.process.resize(cols, rows);
      } catch (e) {
        console.error(`Failed to resize PTY for session ${sessionId}:`, e);
      }
    }
  }

  public kill(sessionId: string): void {
    const instance = this.instances.get(sessionId);
    if (instance && instance.running) {
      try {
        instance.process.kill();
      } catch (e) {
        console.error(`Error killing PTY ${sessionId}:`, e);
      }
      instance.running = false;
    }
    this.instances.delete(sessionId);
  }

  public getScrollback(sessionId: string): string {
    return this.instances.get(sessionId)?.scrollback || '';
  }

  public isRunning(sessionId: string): boolean {
    return this.instances.get(sessionId)?.running || false;
  }

  public onData(callback: (event: IPtyEvent) => void): void {
    this.dataCallbacks.push(callback);
  }

  public onExit(callback: (event: IPtyEvent) => void): void {
    this.exitCallbacks.push(callback);
  }
}
