import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { wsClient } from '@/lib/ws';
import { Button } from '@/components/ui/button';
import { Copy, ClipboardPaste, RotateCw, Trash2, Terminal as TerminalIcon } from 'lucide-react';

interface TerminalTabProps {
  id: string;
  title: string;
  cwd?: string;
  onClose?: () => void;
  onRestart?: () => void;
}

export const TerminalTab: React.FC<TerminalTabProps> = ({
  id,
  title,
  cwd,
  onClose,
  onRestart,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      theme: {
        background: '#0a0a0a',
        foreground: '#eeeeee',
        cursor: '#fab283',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(250, 178, 131, 0.3)',
        black: '#1e293b',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#8b5cf6',
        cyan: '#06b6d4',
        white: '#f8fafc',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Attach to server WebSocket
    wsClient.attach(id, term.cols, term.rows);

    // Send user input to WebSocket
    const dataSub = term.onData(data => {
      wsClient.sendInput(id, data);
    });

    // Listen for output from server
    const unsubscribeOutput = wsClient.on<{ targetId: string; data: string }>('terminal.output', payload => {
      if (payload.targetId === id) {
        term.write(payload.data);
      }
    });

    // Listen for resize events
    const handleResize = () => {
      try {
        fitAddon.fit();
        if (term.cols && term.rows) {
          wsClient.resize(id, term.cols, term.rows);
        }
      } catch (e) {
        // ignore resize error during unmount
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      dataSub.dispose();
      unsubscribeOutput();
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      wsClient.detach(id);
      term.dispose();
    };
  }, [id]);

  const handleCopy = async () => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        await navigator.clipboard.writeText(selection);
      }
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        wsClient.sendInput(id, text);
      }
    } catch (e) {
      console.error('Clipboard read failed:', e);
    }
  };

  const handleClear = () => {
    xtermRef.current?.clear();
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] border border-[#242424] rounded-lg overflow-hidden shadow-2xl">
      {/* Terminal Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#141414] border-b border-[#242424] select-none font-mono">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-4 h-4 text-primary animate-pulse" />
          <span className="font-semibold text-xs text-foreground/90">{title}</span>
          {cwd && (
            <span className="text-[11px] font-mono text-muted-foreground/70 bg-muted/30 px-2 py-0.5 rounded">
              {cwd}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs hover:bg-background/80"
            onClick={handleCopy}
            title="Copy Selection"
          >
            <Copy className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            Copy
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs hover:bg-background/80"
            onClick={handlePaste}
            title="Paste from Clipboard"
          >
            <ClipboardPaste className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            Paste
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 hover:bg-background/80"
            onClick={handleClear}
            title="Clear Terminal Display"
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
          {onRestart && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-background/80 hover:text-primary"
              onClick={onRestart}
              title="Restart PTY"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs hover:bg-destructive/20 hover:text-destructive text-muted-foreground ml-1"
              onClick={onClose}
              title="Close Tab"
            >
              Close
            </Button>
          )}
        </div>
      </div>

      {/* Terminal Viewport */}
      <div ref={containerRef} className="flex-1 w-full h-full p-2 overflow-hidden" />
    </div>
  );
};
