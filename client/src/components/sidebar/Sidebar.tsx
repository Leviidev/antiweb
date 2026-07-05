import React, { useState, useEffect } from 'react';
import { ChatSession } from '@antiweb/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus,
  Search,
  MessageSquare,
  Archive,
  Trash2,
  Edit2,
  Settings,
  LogOut,
  Terminal,
  FolderOpen,
  Sparkles,
  ChevronRight,
  ChevronLeft
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId?: string;
  onSelectSession: (id: string) => void;
  onCreateSession: (title?: string, workspacePath?: string, model?: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  onArchiveSession: (id: string, archived: boolean) => void;
  onDeleteSession: (id: string) => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  activeTab: 'chat' | 'terminal' | 'files';
  onSwitchTab: (tab: 'chat' | 'terminal' | 'files') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onSelectSession,
  onCreateSession,
  onRenameSession,
  onArchiveSession,
  onDeleteSession,
  onOpenSettings,
  onLogout,
  activeTab,
  onSwitchTab,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingSession, setEditingSession] = useState<ChatSession | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newWorkspace, setNewWorkspace] = useState('/home/levi/workspace/antiweb');
  const [newModel, setNewModel] = useState('Gemini 3.5 Flash (Medium)');
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    if (isNewModalOpen) {
      api.models.list().then(list => {
        if (list.length > 0) {
          setAvailableModels(list);
          if (!list.includes(newModel)) setNewModel(list[0]);
        }
      }).catch(() => {});
    }
  }, [isNewModalOpen]);

  const filteredSessions = sessions.filter(s => {
    if (showArchived ? !s.archived : s.archived) return false;
    if (!searchQuery) return true;
    return s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.id.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleStartRename = (e: React.MouseEvent, s: ChatSession) => {
    e.stopPropagation();
    setEditingSession(s);
    setEditTitle(s.title);
  };

  const handleSaveRename = () => {
    if (editingSession && editTitle.trim()) {
      onRenameSession(editingSession.id, editTitle.trim());
      setEditingSession(null);
    }
  };

  return (
    <>
      <aside
        className={cn(
          'relative flex flex-col border-r border-[#2d2828] bg-[#1b1818] transition-all duration-300 h-full z-20 select-none',
          isCollapsed ? 'w-16' : 'w-72'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-[#2d2828] bg-[#131010]/50">
          {!isCollapsed && (
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#fe8019] to-[#fab283] flex items-center justify-center shadow-[0_0_12px_rgba(250,178,131,0.25)]">
                <Terminal className="w-3.5 h-3.5 text-[#131010] font-extrabold" />
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-tight flex items-center gap-1.5 text-[#f1ecec] font-sans">
                  AntiWeb
                  <span className="text-[10px] bg-[#252121] text-[#fab283] border border-[#343030] px-1.5 py-0.5 rounded-md font-mono font-normal">v1.0</span>
                </h1>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="w-7 h-7 rounded-md ml-auto text-[#9a9898] hover:text-[#f1ecec] hover:bg-[#252121]"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        {/* Segmented Navigation Control */}
        <div className="p-2 border-b border-[#2d2828] bg-[#131010]/30">
          <div className="flex items-center p-0.5 rounded-lg bg-[#131010] border border-[#2d2828]">
            <button
              onClick={() => onSwitchTab('chat')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 h-7 text-xs font-medium rounded-md transition-all',
                activeTab === 'chat'
                  ? 'bg-[#252121] text-[#f1ecec] shadow-sm border border-[#3e3939]'
                  : 'text-[#9a9898] hover:text-[#f1ecec]'
              )}
              title="AI Chat & CLI"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#fab283]" />
              {!isCollapsed && <span>Chat</span>}
            </button>
            <button
              onClick={() => onSwitchTab('terminal')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 h-7 text-xs font-medium rounded-md transition-all',
                activeTab === 'terminal'
                  ? 'bg-[#252121] text-[#f1ecec] shadow-sm border border-[#3e3939]'
                  : 'text-[#9a9898] hover:text-[#f1ecec]'
              )}
              title="Linux Terminal"
            >
              <Terminal className="w-3.5 h-3.5 text-[#fab283]" />
              {!isCollapsed && <span>Term</span>}
            </button>
            <button
              onClick={() => onSwitchTab('files')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 h-7 text-xs font-medium rounded-md transition-all',
                activeTab === 'files'
                  ? 'bg-[#252121] text-[#f1ecec] shadow-sm border border-[#3e3939]'
                  : 'text-[#9a9898] hover:text-[#f1ecec]'
              )}
              title="Workspace Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#fab283]" />
              {!isCollapsed && <span>Files</span>}
            </button>
          </div>
        </div>

        {/* New Chat & Search */}
        {activeTab === 'chat' && (
          <div className="p-3 space-y-2.5 border-b border-[#2d2828] bg-[#1b1818]">
            <button
              className="w-full flex items-center justify-center gap-2 opencode-gradient-btn h-8 text-xs rounded-lg font-mono tracking-wide"
              onClick={() => setIsNewModalOpen(true)}
              title="Start New Session"
            >
              <Plus className="w-3.5 h-3.5 font-bold" />
              {!isCollapsed && <span>+ New Session</span>}
            </button>

            {!isCollapsed && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[#9a9898]" />
                <Input
                  placeholder="Search sessions..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs bg-[#131010] border-[#2d2828] text-[#f1ecec] placeholder:text-[#645f5f] focus-visible:ring-1 focus-visible:ring-[#fab283]"
                />
              </div>
            )}
          </div>
        )}

        {/* Sessions List */}
        {activeTab === 'chat' && (
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {!isCollapsed && (
              <div className="flex items-center justify-between px-2 py-1.5 text-[11px] font-semibold text-[#9a9898] uppercase tracking-wider font-mono">
                <span>{showArchived ? 'Archived Sessions' : 'Recent Sessions'}</span>
                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="text-[#fab283] hover:underline lowercase font-sans text-xs"
                >
                  {showArchived ? 'view active' : 'view archived'}
                </button>
              </div>
            )}

            {filteredSessions.length === 0 ? (
              !isCollapsed && (
                <div className="text-center py-8 text-xs text-[#645f5f] font-mono">
                  {searchQuery ? 'No matching sessions found.' : 'No sessions yet.'}
                </div>
              )
            ) : (
              filteredSessions.map(session => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={cn(
                      'group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-all text-xs font-medium',
                      isActive
                        ? 'bg-[#252121] text-[#f1ecec] border border-[#fab283]/50 shadow-md font-semibold'
                        : 'hover:bg-[#252121]/60 text-[#9a9898] hover:text-[#f1ecec] border border-transparent'
                    )}
                    title={session.title}
                  >
                    <div className="flex items-center gap-2.5 truncate flex-1">
                      <MessageSquare
                        className={cn(
                          'w-3.5 h-3.5 flex-shrink-0 transition-colors',
                          isActive ? 'text-[#fab283]' : 'text-[#645f5f] group-hover:text-[#9a9898]'
                        )}
                      />
                      {!isCollapsed && (
                        <span className="truncate tracking-tight font-sans">{session.title}</span>
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 hover:bg-[#343030] hover:text-[#fab283] text-[#9a9898]"
                          onClick={e => handleStartRename(e, session)}
                          title="Rename"
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 hover:bg-[#343030] hover:text-[#fab283] text-[#9a9898]"
                          onClick={e => {
                            e.stopPropagation();
                            onArchiveSession(session.id, !session.archived);
                          }}
                          title={session.archived ? 'Unarchive' : 'Archive'}
                        >
                          <Archive className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-6 h-6 hover:bg-[#343030] hover:text-[#fc543a] text-[#9a9898]"
                          onClick={e => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab !== 'chat' && (
          <div className="flex-1 p-4 text-center text-xs text-muted-foreground">
            {!isCollapsed && (
              <p>
                {activeTab === 'terminal'
                  ? 'Manage Linux terminal tabs in the main workspace.'
                  : 'Explore files and code in the main workspace.'}
              </p>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-3 border-t border-border/50 bg-muted/20 flex items-center justify-between gap-1">
          <Button
            variant="ghost"
            size={isCollapsed ? 'icon' : 'sm'}
            className="flex-1 justify-start gap-2 text-xs font-medium hover:bg-background/80"
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            {!isCollapsed && <span>Settings</span>}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onLogout}
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </aside>

      {/* Rename Dialog */}
      <Dialog open={!!editingSession} onOpenChange={() => setEditingSession(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename Session</DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <Input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              placeholder="Session title"
              onKeyDown={e => e.key === 'Enter' && handleSaveRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingSession(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveRename}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Session Dialog */}
      <Dialog open={isNewModalOpen} onOpenChange={setIsNewModalOpen}>
        <DialogContent className="max-w-md bg-[#1b1818] border border-[#2d2828] text-[#f1ecec] font-sans shadow-2xl rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-white font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#fab283]"></span>
              Create New AntiWeb Session
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-[#9a9898] font-mono">Session Title</label>
              <Input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="e.g. Refactor Web UI"
                className="h-9 bg-[#131010] border-[#2d2828] text-[#f1ecec] focus-visible:ring-1 focus-visible:ring-[#fab283]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-[#9a9898] font-mono">Workspace Directory</label>
              <Input
                value={newWorkspace}
                onChange={e => setNewWorkspace(e.target.value)}
                placeholder="/home/levi/workspace/..."
                className="h-9 bg-[#131010] border-[#2d2828] font-mono text-xs text-[#f1ecec] focus-visible:ring-1 focus-visible:ring-[#fab283]"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {['/home/levi/workspace/antiweb', '/home/levi/workspace', '/home/levi'].map(path => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => setNewWorkspace(path)}
                    className="px-2.5 py-1 rounded-md bg-[#131010] hover:bg-[#252121] text-[11px] text-[#9a9898] hover:text-[#f1ecec] border border-[#2d2828] font-mono transition-colors"
                  >
                    {path.split('/').pop() || 'home'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="font-semibold text-[#9a9898] font-mono">AI Model Provider</label>
              <select
                value={newModel}
                onChange={e => setNewModel(e.target.value)}
                className="w-full h-9 px-3 rounded-md bg-[#131010] border border-[#2d2828] text-[#f1ecec] text-xs font-medium focus:outline-none focus:ring-1 focus:ring-[#fab283]"
              >
                {availableModels.length === 0 ? (
                  <>
                    <option value="DeepSeek V4 Flash">DeepSeek V4 Flash</option>
                    <option value="DeepSeek V4 Flash Free">DeepSeek V4 Flash Free</option>
                    <option value="Gemini 3.5 Flash (Medium)">Gemini 3.5 Flash (Medium)</option>
                  </>
                ) : (
                  availableModels.map(m => (
                    <option key={m} value={m} className="bg-[#1b1818] text-[#f1ecec]">
                      {m}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2 border-t border-[#2d2828]">
            <Button variant="outline" size="sm" onClick={() => setIsNewModalOpen(false)} className="h-8 text-xs bg-[#252121] border-[#343030] text-[#9a9898] hover:text-white">
              Cancel
            </Button>
            <button
              className="px-4 py-1.5 rounded-md text-xs opencode-gradient-btn"
              onClick={() => {
                onCreateSession(newTitle.trim() || undefined, newWorkspace.trim() || undefined, newModel || undefined);
                setNewTitle('');
                setIsNewModalOpen(false);
              }}
            >
              Start Session
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
