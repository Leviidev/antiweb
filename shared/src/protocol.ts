import { ChatSession, TerminalTab } from './session';

export type WsClientEventType =
  | 'session.attach'
  | 'terminal.input'
  | 'terminal.resize'
  | 'ping';

export type WsServerEventType =
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'terminal.output'
  | 'terminal.exit'
  | 'chat.updated'
  | 'workspace.changed'
  | 'settings.updated'
  | 'notification'
  | 'pong';

export interface WsClientMessage<T = any> {
  event: WsClientEventType;
  payload?: T;
}

export interface WsServerMessage<T = any> {
  event: WsServerEventType;
  payload?: T;
}

export interface AttachPayload {
  targetId: string; // session ID or terminal tab ID
  cols?: number;
  rows?: number;
}

export interface TerminalInputPayload {
  targetId: string;
  data: string;
}

export interface TerminalResizePayload {
  targetId: string;
  cols: number;
  rows: number;
}

export interface TerminalOutputPayload {
  targetId: string;
  data: string;
}

export interface TerminalExitPayload {
  targetId: string;
  exitCode: number;
}

export interface NotificationPayload {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  title?: string;
}
