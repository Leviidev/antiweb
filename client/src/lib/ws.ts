import { WsClientMessage, WsServerMessage, WsServerEventType, WsClientEventType } from '@antiweb/shared';

type EventCallback<T = any> = (payload: T) => void;

class WebSocketClient {
  private socket?: WebSocket;
  private url: string = '';
  private listeners: Map<WsServerEventType, Set<EventCallback>> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 20;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private attachedTargets: Set<string> = new Set();
  private isConnecting: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const hostname = window.location.hostname;
      // In production (single-port frontdoor), WebSockets are served on the exact same port as the page!
      // In local standalone dev mode (port 3000), connect to dev backend on port 3001.
      const hostStr = window.location.port === '3000' ? `${hostname}:3001` : window.location.host;
      this.url = `${protocol}//${hostStr}/ws`;
    }
  }

  public isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  public connect(): void {
    if (typeof window === 'undefined' || this.socket?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        console.log('⚡ WebSocket Connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.startHeartbeat();

        // Re-attach to any active targets after reconnect
        this.attachedTargets.forEach(targetId => {
          this.send('session.attach', { targetId });
        });
      };

      this.socket.onmessage = (event) => {
        try {
          const msg: WsServerMessage = JSON.parse(event.data);
          this.emit(msg.event, msg.payload);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      this.socket.onclose = () => {
        console.warn('⚠️ WebSocket Disconnected');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.error('WebSocket error:', err);
        this.isConnecting = false;
      };
    } catch (e) {
      console.error('Failed to instantiate WebSocket:', e);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send('ping');
    }, 20000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max WebSocket reconnect attempts reached.');
      return;
    }

    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    console.log(`Reconnecting WebSocket in ${Math.round(delay)}ms (Attempt ${this.reconnectAttempts})...`);

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  public send<T>(event: WsClientEventType, payload?: T): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      const msg: WsClientMessage<T> = { event, payload };
      this.socket.send(JSON.stringify(msg));
    }
  }

  public attach(targetId: string, cols?: number, rows?: number): void {
    this.attachedTargets.add(targetId);
    this.send('session.attach', { targetId, cols, rows });
  }

  public detach(targetId: string): void {
    this.attachedTargets.delete(targetId);
  }

  public sendInput(targetId: string, data: string): void {
    this.send('terminal.input', { targetId, data });
  }

  public resize(targetId: string, cols: number, rows: number): void {
    this.send('terminal.resize', { targetId, cols, rows });
  }

  public on<T>(event: WsServerEventType, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: WsServerEventType, payload: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(payload));
    }
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
  }
}

export const wsClient = new WebSocketClient();
