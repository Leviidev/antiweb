import { IAntigravityBackend, IPtyEvent } from './IAntigravityBackend';
import { PtyAntigravityBackend } from './PtyAntigravityBackend';
import { config } from '../config';

export class PtyManager {
  private backend: IAntigravityBackend;
  private onOutputCallback?: (sessionId: string, data: string) => void;
  private onExitCallback?: (sessionId: string, exitCode: number) => void;

  constructor(backend?: IAntigravityBackend) {
    this.backend = backend || new PtyAntigravityBackend();

    this.backend.onData((event: IPtyEvent) => {
      if (event.data && this.onOutputCallback) {
        this.onOutputCallback(event.sessionId, event.data);
      }
    });

    this.backend.onExit((event: IPtyEvent) => {
      if (event.exitCode !== undefined && this.onExitCallback) {
        this.onExitCallback(event.sessionId, event.exitCode);
      }
    });
  }

  public async ensurePty(
    sessionId: string,
    cwd: string = process.cwd(),
    cols: number = 80,
    rows: number = 24,
    command?: string,
    args?: string[],
    model?: string
  ): Promise<void> {
    if (!this.backend.isRunning(sessionId)) {
      await this.backend.spawn(sessionId, cols, rows, cwd, command || config.agyCommand, args, model);
    }
  }

  public async restartPty(
    sessionId: string,
    cwd: string = process.cwd(),
    cols: number = 80,
    rows: number = 24,
    command?: string,
    args?: string[],
    model?: string
  ): Promise<void> {
    this.backend.kill(sessionId);
    await this.backend.spawn(sessionId, cols, rows, cwd, command || config.agyCommand, args, model);
  }

  public write(sessionId: string, data: string): void {
    this.backend.write(sessionId, data);
  }

  public resize(sessionId: string, cols: number, rows: number): void {
    this.backend.resize(sessionId, cols, rows);
  }

  public kill(sessionId: string): void {
    this.backend.kill(sessionId);
  }

  public getScrollback(sessionId: string): string {
    return this.backend.getScrollback(sessionId);
  }

  public isRunning(sessionId: string): boolean {
    return this.backend.isRunning(sessionId);
  }

  public onOutput(cb: (sessionId: string, data: string) => void): void {
    this.onOutputCallback = cb;
  }

  public onExit(cb: (sessionId: string, exitCode: number) => void): void {
    this.onExitCallback = cb;
  }
}
