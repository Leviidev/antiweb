export type PtyStatus = 'running' | 'exited' | 'stopped';

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  workspacePath: string;
  model?: string;
  ptyStatus: PtyStatus;
  exitCode?: number;
}

export interface TerminalTab {
  id: string;
  title: string;
  cwd: string;
  ptyStatus: PtyStatus;
  createdAt: string;
}
