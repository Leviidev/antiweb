export interface IPtyEvent {
  sessionId: string;
  data?: string;
  exitCode?: number;
}

export interface IAntigravityBackend {
  spawn(sessionId: string, cols: number, rows: number, cwd?: string, command?: string, args?: string[], model?: string): Promise<void>;
  write(sessionId: string, data: string): void;
  resize(sessionId: string, cols: number, rows: number): void;
  kill(sessionId: string): void;
  onData(callback: (event: IPtyEvent) => void): void;
  onExit(callback: (event: IPtyEvent) => void): void;
  getScrollback(sessionId: string): string;
  isRunning(sessionId: string): boolean;
}
