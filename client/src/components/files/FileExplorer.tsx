import React, { useState, useEffect } from 'react';
import { FileNode, FileContentResponse } from '@antiweb/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Folder,
  FolderOpen,
  File as FileIcon,
  FileCode,
  FileText,
  FileImage,
  ChevronRight,
  ChevronDown,
  X,
  RefreshCw,
  Lock,
  Save,
  Code2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface OpenFileTab {
  path: string;
  name: string;
  content: string;
  size: number;
  isDirty?: boolean;
}

interface FileExplorerProps {
  initialPath?: string;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ initialPath }) => {
  const [rootNodes, setRootNodes] = useState<FileNode[]>([]);
  const [expandedDirs, setExpandedDirs] = useState<Map<string, FileNode[]>>(new Map());
  const [openTabs, setOpenTabs] = useState<OpenFileTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentRoot, setCurrentRoot] = useState<string>(initialPath || '/home/levi/workspace/antiweb');
  const [rootInput, setRootInput] = useState<string>(initialPath || '/home/levi/workspace/antiweb');
  const [isEditingRoot, setIsEditingRoot] = useState<boolean>(false);

  // Structured for future file editing capability
  const [isEditMode, setIsEditMode] = useState(false);

  const fetchDir = async (path?: string, isRoot: boolean = false) => {
    setIsLoading(true);
    setError(null);
    try {
      const target = path || currentRoot || undefined;
      const nodes = await api.files.list(target);
      if (!path || isRoot || path === currentRoot) {
        setRootNodes(nodes);
        if (nodes.length > 0 && nodes[0].path) {
          const derivedRoot = nodes[0].path.substring(0, nodes[0].path.lastIndexOf('/'));
          if (derivedRoot && !currentRoot) {
            setCurrentRoot(derivedRoot);
            setRootInput(derivedRoot);
          }
        }
      } else {
        setExpandedDirs(prev => new Map(prev).set(path, nodes));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const targetRoot = initialPath || currentRoot;
    if (initialPath && initialPath !== currentRoot) {
      setCurrentRoot(initialPath);
      setRootInput(initialPath);
    }
    fetchDir(targetRoot, true);
  }, [initialPath]);

  const toggleFolder = async (node: FileNode) => {
    if (expandedDirs.has(node.path)) {
      setExpandedDirs(prev => {
        const next = new Map(prev);
        next.delete(node.path);
        return next;
      });
    } else {
      await fetchDir(node.path);
    }
  };

  const openFile = async (node: FileNode) => {
    if (node.isDirectory) return;

    const existing = openTabs.find(t => t.path === node.path);
    if (existing) {
      setActiveTabPath(existing.path);
      return;
    }

    try {
      const data = await api.files.read(node.path);
      const newTab: OpenFileTab = {
        path: node.path,
        name: node.name,
        content: data.content,
        size: data.size
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabPath(newTab.path);
    } catch (err) {
      alert(`Could not open file: ${(err as Error).message}`);
    }
  };

  const closeTab = (path: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenTabs(prev => {
      const filtered = prev.filter(t => t.path !== path);
      if (activeTabPath === path) {
        setActiveTabPath(filtered.length > 0 ? filtered[filtered.length - 1].path : null);
      }
      return filtered;
    });
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html', 'py', 'go', 'rs'].includes(ext || '')) {
      return <FileCode className="w-4 h-4 text-blue-400" />;
    }
    if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp'].includes(ext || '')) {
      return <FileImage className="w-4 h-4 text-purple-400" />;
    }
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  const renderTree = (nodes: FileNode[], depth = 0) => {
    return nodes.map(node => {
      const isExpanded = expandedDirs.has(node.path);
      const children = expandedDirs.get(node.path);

      return (
        <div key={node.path} className="select-none">
          <div
            onClick={() => (node.isDirectory ? toggleFolder(node) : openFile(node))}
            className={cn(
              'flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer hover:bg-accent/60 text-xs transition-colors',
              activeTabPath === node.path && 'bg-primary/20 text-primary font-semibold'
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            {node.isDirectory ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                {isExpanded ? (
                  <FolderOpen className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                ) : (
                  <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                )}
              </>
            ) : (
              <>
                <span className="w-3.5" />
                {getFileIcon(node.name)}
              </>
            )}
            <span className="truncate">{node.name}</span>
          </div>

          {node.isDirectory && isExpanded && children && (
            <div>{renderTree(children, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const activeTab = openTabs.find(t => t.path === activeTabPath);

  const getLanguage = (filename?: string) => {
    if (!filename) return 'text';
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'py':
        return 'python';
      case 'md':
        return 'markdown';
      case 'sh':
      case 'bash':
        return 'bash';
      default:
        return 'text';
    }
  };

  return (
    <div className="flex h-full bg-background border border-border/40 rounded-xl overflow-hidden shadow-2xl">
      {/* Sidebar Tree */}
      <div className="w-64 border-r border-white/10 flex flex-col bg-[#09090b]">
        <div className="p-2.5 border-b border-white/10 space-y-2 bg-[#09090b]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-primary" />
              Workspace
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditingRoot(!isEditingRoot)}
                title="Change Folder"
              >
                <FolderOpen className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={() => fetchDir(currentRoot, true)}
                title="Refresh Explorer"
              >
                <RefreshCw className={cn('w-3 h-3', isLoading && 'animate-spin')} />
              </Button>
            </div>
          </div>
          {isEditingRoot ? (
            <div className="flex items-center gap-1">
              <input
                value={rootInput}
                onChange={e => setRootInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    setCurrentRoot(rootInput.trim());
                    fetchDir(rootInput.trim(), true);
                    setIsEditingRoot(false);
                  } else if (e.key === 'Escape') {
                    setIsEditingRoot(false);
                  }
                }}
                placeholder="/path/to/folder"
                className="h-6 w-full px-1.5 text-[11px] bg-black/60 border border-white/20 rounded font-mono text-foreground focus:outline-none focus:border-primary"
                autoFocus
              />
              <Button
                size="sm"
                className="h-6 px-2 text-[10px] bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => {
                  setCurrentRoot(rootInput.trim());
                  fetchDir(rootInput.trim(), true);
                  setIsEditingRoot(false);
                }}
              >
                Go
              </Button>
            </div>
          ) : (
            <div
              onClick={() => setIsEditingRoot(true)}
              className="text-[11px] text-muted-foreground hover:text-foreground font-mono truncate cursor-pointer bg-white/5 px-1.5 py-1 rounded border border-white/5 flex items-center justify-between group"
              title={currentRoot || 'Click to change root folder'}
            >
              <span className="truncate">{currentRoot || 'Default'}</span>
              <span className="text-[9px] text-primary opacity-0 group-hover:opacity-100 ml-1">Edit</span>
            </div>
          )}
        </div>

        {error && <div className="p-2 text-xs text-destructive">{error}</div>}

        <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
          {rootNodes.length === 0 && !isLoading ? (
            <div className="text-center py-8 text-xs text-muted-foreground">No files found.</div>
          ) : (
            renderTree(rootNodes)
          )}
        </div>
      </div>

      {/* Editor / Viewer Area */}
      <div className="flex-1 flex flex-col bg-[#0b0f19] overflow-hidden">
        {/* Tab Bar */}
        <div className="flex items-center border-b border-border/40 bg-card/60 overflow-x-auto min-h-[40px]">
          {openTabs.length === 0 ? (
            <div className="px-4 text-xs text-muted-foreground italic">No file open</div>
          ) : (
            openTabs.map(tab => {
              const isActive = tab.path === activeTabPath;
              return (
                <div
                  key={tab.path}
                  onClick={() => setActiveTabPath(tab.path)}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2 border-r border-border/40 cursor-pointer text-xs font-medium transition-all select-none',
                    isActive
                      ? 'bg-[#0b0f19] text-foreground border-t-2 border-t-primary font-semibold shadow-sm'
                      : 'bg-card/40 text-muted-foreground hover:bg-card/80 hover:text-foreground'
                  )}
                >
                  {getFileIcon(tab.name)}
                  <span>{tab.name}</span>
                  <button
                    onClick={e => closeTab(tab.path, e)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-all"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })
          )}

          <div className="ml-auto px-4 flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground/70 flex items-center gap-1 bg-muted/20 px-2 py-0.5 rounded font-mono">
              <Lock className="w-3 h-3 text-amber-500" />
              Read-Only Mode
            </span>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 overflow-auto p-4">
          {!activeTab ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50 space-y-3">
              <Code2 className="w-16 h-16 stroke-1" />
              <p className="text-sm">Select a file from the explorer to view its contents.</p>
              <p className="text-xs text-muted-foreground/40">
                Syntax highlighting and multi-tab browsing enabled.
              </p>
            </div>
          ) : (
            <div className="h-full rounded-lg overflow-hidden border border-border/20 bg-[#0d121f]">
              <SyntaxHighlighter
                language={getLanguage(activeTab.name)}
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  background: 'transparent',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  fontFamily: 'JetBrains Mono, Menlo, monospace',
                }}
                showLineNumbers
              >
                {activeTab.content}
              </SyntaxHighlighter>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
