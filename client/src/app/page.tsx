'use client';

import React, { useState, useEffect } from 'react';
import { ChatSession, TerminalTab as TerminalTabModel, AppSettings } from '@antiweb/shared';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sparkles,
  Lock,
  Terminal as TerminalIcon,
  Plus,
  MessageSquare,
  FolderOpen,
  Menu,
  X,
  AlertCircle,
  Send,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

const ChatPanel = dynamic(
  () => import('@/components/chat/ChatPanel').then(mod => mod.ChatPanel),
  { ssr: false }
);

const TerminalTab = dynamic(
  () => import('@/components/terminal/TerminalTab').then(mod => mod.TerminalTab),
  { ssr: false }
);

const FileExplorer = dynamic(
  () => import('@/components/files/FileExplorer').then(mod => mod.FileExplorer),
  { ssr: false }
);

const SettingsModal = dynamic(
  () => import('@/components/settings/SettingsModal').then(mod => mod.SettingsModal),
  { ssr: false }
);

export default function AntiWebApp() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [terminalTabs, setTerminalTabs] = useState<TerminalTabModel[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<'chat' | 'terminal' | 'files'>('chat');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Check auth status on mount
  useEffect(() => {
    api.auth.status()
      .then(res => {
        setIsAuthenticated(res.authenticated);
        if (res.authenticated) {
          initializeWorkspace();
        }
      })
      .catch(() => setIsAuthenticated(false));
  }, []);

  const initializeWorkspace = async () => {
    wsClient.connect();

    try {
      const [sessList, termList] = await Promise.all([
        api.sessions.list(),
        api.terminals.list()
      ]);

      setSessions(sessList);
      if (sessList.length > 0 && !activeSessionId) {
        setActiveSessionId(sessList[0].id);
      } else if (sessList.length === 0) {
        // Create initial default session
        const newSess = await api.sessions.create('Welcome to AntiWeb');
        setSessions([newSess]);
        setActiveSessionId(newSess.id);
      }

      setTerminalTabs(termList);
      if (termList.length > 0 && !activeTerminalId) {
        setActiveTerminalId(termList[0].id);
      }
    } catch (err) {
      console.error('Failed to initialize workspace:', err);
    }
  };

  // WebSocket Broadcast Listeners
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubSessCreated = wsClient.on<ChatSession>('session.created', session => {
      setSessions(prev => [session, ...prev.filter(s => s.id !== session.id)]);
      setActiveSessionId(session.id);
      setActiveTab('chat');
    });

    const unsubSessUpdated = wsClient.on<ChatSession>('session.updated', session => {
      setSessions(prev => prev.map(s => (s.id === session.id ? session : s)));
    });

    const unsubSessDeleted = wsClient.on<{ id: string }>('session.deleted', ({ id }) => {
      setSessions(prev => {
        const next = prev.filter(s => s.id !== id);
        if (activeSessionId === id && next.length > 0) {
          setActiveSessionId(next[0].id);
        }
        return next;
      });
    });

    return () => {
      unsubSessCreated();
      unsubSessUpdated();
      unsubSessDeleted();
    };
  }, [isAuthenticated, activeSessionId]);

  // Global OpenCode Keyboard Shortcuts (Tabs & Navigation)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S -> Switch to Chat / Sessions tab
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setActiveTab('chat');
      }
      // Ctrl+P -> Switch to Files View
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setActiveTab('files');
      }
      // Ctrl+O -> Toggle Terminal view tab
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setActiveTab(prev => (prev === 'terminal' ? 'chat' : 'terminal'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!passwordInput) return;
    setIsLoggingIn(true);
    setLoginError(null);

    try {
      const res = await api.auth.login(passwordInput);
      if (res.success) {
        setIsAuthenticated(true);
        initializeWorkspace();
      }
    } catch (err) {
      setLoginError((err as Error).message || 'Invalid password');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await api.auth.logout();
    wsClient.disconnect();
    setIsAuthenticated(false);
    setPasswordInput('');
  };

  const handleCreateSession = async (title?: string, workspacePath?: string, model?: string): Promise<ChatSession | undefined> => {
    try {
      const session = await api.sessions.create(title, workspacePath, model);
      setSessions(prev => [session, ...prev]);
      setActiveSessionId(session.id);
      setActiveTab('chat');
      setIsMobileMenuOpen(false);
      return session;
    } catch (err) {
      alert(`Could not create session: ${(err as Error).message}`);
      return undefined;
    }
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    try {
      const updated = await api.sessions.update(id, { title: newTitle });
      setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    } catch (err) {
      alert(`Rename failed: ${(err as Error).message}`);
    }
  };

  const handleUpdateSession = async (id: string, updates: { model?: string; workspacePath?: string; title?: string }) => {
    try {
      const updated = await api.sessions.update(id, updates);
      setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    } catch (err) {
      alert(`Update failed: ${(err as Error).message}`);
    }
  };

  const handleArchiveSession = async (id: string, archived: boolean) => {
    try {
      const updated = await api.sessions.update(id, { archived });
      setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
    } catch (err) {
      alert(`Archive toggle failed: ${(err as Error).message}`);
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (!confirm('Are you sure you want to delete this session?')) return;
    try {
      await api.sessions.delete(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter(s => s.id !== id);
        setActiveSessionId(remaining.length > 0 ? remaining[0].id : undefined);
      }
    } catch (err) {
      alert(`Delete failed: ${(err as Error).message}`);
    }
  };

  const handleRestartPty = async (id: string) => {
    try {
      const updated = await api.sessions.restart(id);
      if (updated) {
        setSessions(prev => prev.map(s => (s.id === id ? updated : s)));
      }
    } catch (err) {
      alert(`Restart failed: ${(err as Error).message}`);
    }
  };

  const handleCreateTerminal = async () => {
    try {
      const tab = await api.terminals.create(`Terminal ${terminalTabs.length + 1}`);
      setTerminalTabs(prev => [...prev, tab]);
      setActiveTerminalId(tab.id);
    } catch (err) {
      alert(`Failed to create terminal: ${(err as Error).message}`);
    }
  };

  const handleCloseTerminal = async (id: string) => {
    try {
      await api.terminals.delete(id);
      const remaining = terminalTabs.filter(t => t.id !== id);
      setTerminalTabs(remaining);
      if (activeTerminalId === id) {
        setActiveTerminalId(remaining.length > 0 ? remaining[0].id : undefined);
      }
    } catch (err) {
      alert(`Failed to close terminal: ${(err as Error).message}`);
    }
  };

  // If loading auth status
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-primary animate-spin" />
          </div>
          <span className="text-sm font-semibold text-muted-foreground">Loading AntiWeb 1.0...</span>
        </div>
      </div>
    );
  }

  // If unauthenticated -> show OpenCode Minimalist Login View
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] p-4 select-none">
        <div className="w-full max-w-sm bg-[#141414] border border-[#242424] rounded-lg p-6 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded bg-[#0a0a0a] border border-[#242424] flex items-center justify-center mx-auto">
              <TerminalIcon className="w-6 h-6 text-[#fab283]" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-white font-mono">AntiWeb 1.0</h1>
            <p className="text-xs text-[#9a9898] font-mono">
              Enter your access password to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3 h-3 text-neutral-400" />
                Password
              </label>
              <Input
                type="password"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                placeholder="Enter password..."
                className="h-9 bg-black/50 border-neutral-800 text-sm font-mono text-white placeholder:text-neutral-600 focus-visible:ring-1 focus-visible:ring-neutral-600"
                autoFocus
              />
            </div>

            {loginError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <Button
              type="submit"
              disabled={isLoggingIn || !passwordInput}
              className="w-full h-9 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs shadow-sm transition-all active:scale-95"
            >
              {isLoggingIn ? 'Verifying...' : 'Unlock AntiWeb'}
            </Button>
          </form>

          <div className="text-center pt-3 border-t border-neutral-800/80 text-[10px] text-neutral-600 font-mono">
            AntiWeb 1.0 • PTY & WebSockets
          </div>
        </div>
      </div>
    );
  }

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden bg-[#0e0f12]">
      {/* OpenCode Web Studio App Header */}
      <header className="h-12 bg-[#14151a] border-b border-[#23252f] px-4 flex items-center justify-between shrink-0 select-none z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-[#23252f] transition-colors border border-transparent hover:border-white/5"
            title="Toggle Sidebar"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Session Tab Pill */}
          <div className="flex items-center gap-2 bg-[#1d1e26] border border-[#23252f] px-3 py-1 rounded-lg text-xs font-medium text-white shadow-sm">
            <span className="w-2 h-2 rounded-full bg-[#2dd4bf] shadow-[0_0_8px_#2dd4bf]"></span>
            <span className="truncate max-w-[200px]">{activeSession?.title || 'New session'}</span>
          </div>

          <button
            onClick={() => handleCreateSession()}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-[#23252f] transition-colors"
            title="New Session"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-[#2dd4bf]"></span>
            <span className="hidden sm:inline">AntiWeb 1.0</span>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-[#23252f] transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex min-h-0 w-full overflow-hidden relative">
        {/* Mobile Header */}
        <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#14151a]/90 backdrop-blur-md border-b border-[#23252f] flex items-center justify-between px-4 z-40">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-[#1d1e26] border border-[#23252f] flex items-center justify-center">
              <TerminalIcon className="w-4 h-4 text-[#2dd4bf]" />
            </div>
            <span className="font-bold text-sm text-white font-sans">AntiWeb 1.0</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>

        {/* Drawer Overlay */}
        {(isMobileMenuOpen || isSidebarOpen) && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
            onClick={() => {
              setIsMobileMenuOpen(false);
              setIsSidebarOpen(false);
            }}
          />
        )}

        {/* Sidebar (Desktop & Mobile Drawer) */}
        <div
          className={cn(
            'fixed top-0 bottom-0 left-0 z-40 transition-transform duration-300 h-full',
            isMobileMenuOpen || isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={id => {
              setActiveSessionId(id);
              setActiveTab('chat');
              setIsMobileMenuOpen(false);
              setIsSidebarOpen(false);
            }}
            onCreateSession={handleCreateSession}
            onRenameSession={handleRenameSession}
            onArchiveSession={handleArchiveSession}
            onDeleteSession={handleDeleteSession}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onLogout={handleLogout}
            activeTab={activeTab}
            onSwitchTab={tab => {
              setActiveTab(tab);
              setIsMobileMenuOpen(false);
              setIsSidebarOpen(false);
            }}
          />
        </div>

      {/* Main Workspace Area */}
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative pt-14 md:pt-0">
        {activeTab === 'chat' && (
          <div className="flex-1 h-full min-h-0 overflow-hidden flex flex-col">
            {activeSession ? (
              <ChatPanel
                key={activeSession.id}
                session={activeSession}
                onRename={newTitle => handleRenameSession(activeSession.id, newTitle)}
                onRestartPty={() => handleRestartPty(activeSession.id)}
                onUpdateSession={updates => handleUpdateSession(activeSession.id, updates)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full px-4 relative bg-[#0a0a0a]">
                <div className="max-w-2xl w-full text-center space-y-8 my-auto">
                  <div className="space-y-3">
                    <div className="w-14 h-14 rounded-lg bg-[#141414] border border-[#242424] flex items-center justify-center mx-auto shadow-xl">
                      <TerminalIcon className="w-7 h-7 text-[#fab283]" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#eeeeee] font-mono">AntiWeb 1.0</h1>
                    <p className="text-sm text-[#9a9898] font-mono">
                      Terminal-native AI coding interface. Monospace-first, frameless, and fast.
                    </p>
                  </div>

                  {/* OpenCode style home chat input */}
                  <div className="relative bg-[#141414] rounded-lg border border-[#242424] shadow-2xl p-2 text-left focus-within:border-[#fab283]/60 transition-all">
                    <form
                      onSubmit={async e => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const input = form.elements.namedItem('homePrompt') as HTMLInputElement;
                        if (input && input.value.trim()) {
                          const promptText = input.value.trim();
                          input.value = '';
                          const title = promptText.length > 30 ? promptText.substring(0, 30) + '...' : promptText;
                          const createdSession = await handleCreateSession(title);
                          if (createdSession) {
                            try {
                              const existing = JSON.parse(localStorage.getItem('antiweb_sent_prompts') || '[]');
                              localStorage.setItem('antiweb_sent_prompts', JSON.stringify([...existing, promptText]));
                            } catch (e) {}
                            setTimeout(() => {
                              wsClient.sendInput(createdSession.id, promptText + '\r');
                            }, 1000);
                          }
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        name="homePrompt"
                        type="text"
                        placeholder="Message AntiWeb 1.0... (Press Enter to start)"
                        className="w-full bg-transparent border-0 h-12 px-4 text-sm text-[#eeeeee] placeholder:text-[#9a9898] focus:outline-none font-mono"
                        autoFocus
                      />
                      <Button
                        type="submit"
                        size="icon"
                        className="h-10 w-10 rounded bg-[#fab283] hover:bg-[#fab283]/90 text-black shrink-0 transition-transform active:scale-95 font-bold"
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    </form>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs text-[#9a9898] font-mono">
                    <span>⚡ Monospace-first • Frameless UI • OpenCode Powered</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'terminal' && (
          <div className="flex-1 flex flex-col h-full bg-[#0a0a0a] overflow-hidden p-2 md:p-4 gap-3">
            {/* Terminal Tab Bar */}
            <div className="flex items-center justify-between gap-2 border-b border-border/30 pb-2">
              <div className="flex items-center gap-1.5 overflow-x-auto">
                {terminalTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTerminalId(tab.id)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all select-none',
                      tab.id === activeTerminalId
                        ? 'bg-primary/20 text-primary border border-primary/40 font-bold'
                        : 'bg-card/40 text-muted-foreground hover:bg-card/80 hover:text-foreground border border-transparent'
                    )}
                  >
                    <TerminalIcon className="w-3.5 h-3.5" />
                    <span>{tab.title}</span>
                    <span
                      onClick={e => {
                        e.stopPropagation();
                        handleCloseTerminal(tab.id);
                      }}
                      className="hover:text-destructive ml-1"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  </button>
                ))}
              </div>

              <Button
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                onClick={handleCreateTerminal}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Terminal</span>
              </Button>
            </div>

            {/* Terminal Viewport */}
            <div className="flex-1 overflow-hidden">
              {activeTerminalId ? (
                <TerminalTab
                  key={activeTerminalId}
                  id={activeTerminalId}
                  title={terminalTabs.find(t => t.id === activeTerminalId)?.title || 'Terminal'}
                  onClose={() => handleCloseTerminal(activeTerminalId)}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 space-y-4">
                  <TerminalIcon className="w-16 h-16 stroke-1" />
                  <p className="text-sm">No terminal tab open.</p>
                  <Button onClick={handleCreateTerminal} className="gap-2">
                    <Plus className="w-4 h-4" /> Open Linux Terminal
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex-1 h-full overflow-hidden p-2 md:p-4">
            <FileExplorer initialPath={activeSession?.workspacePath} />
          </div>
        )}
      </main>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        onSettingsUpdated={newSettings => {
          console.log('Settings updated:', newSettings);
        }}
      />
    </div>
  );
}
