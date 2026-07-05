import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { ChatSession } from '@antiweb/shared';
import { wsClient } from '@/lib/ws';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Send,
  Square,
  Paperclip,
  Terminal as TerminalIcon,
  MessageSquare,
  Copy,
  Check,
  Sparkles,
  ArrowDown,
  ChevronDown,
  X,
  FileText,
  Image as ImageIcon,
  RotateCw,
  FolderOpen,
  Code,
  Wrench,
  Search,
  Layout,
  Plus
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useDropzone } from 'react-dropzone';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

const TerminalTab = dynamic(
  () => import('@/components/terminal/TerminalTab').then(mod => mod.TerminalTab),
  { ssr: false }
);

const FileExplorer = dynamic(
  () => import('@/components/files/FileExplorer').then(mod => mod.FileExplorer),
  { ssr: false }
);

interface ChatPanelProps {
  session: ChatSession;
  onRename?: (newTitle: string) => void;
  onRestartPty?: () => void;
  onUpdateSession?: (updates: { model?: string; workspacePath?: string }) => void;
}

interface UploadedFileInfo {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  localPath: string;
  mimetype: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  session,
  onRename,
  onRestartPty,
  onUpdateSession,
}) => {
  const [outputBuffer, setOutputBuffer] = useState<string>('');
  const [viewMode, setViewMode] = useState<'markdown' | 'terminal' | 'split'>('split');
  const [rightPaneTab, setRightPaneTab] = useState<'review' | 'terminal' | 'files'>('review');
  const [terminalMode, setTerminalMode] = useState<'bash' | 'cli'>('bash');
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [promptHistoryIndex, setPromptHistoryIndex] = useState<number>(-1);
  const [attachments, setAttachments] = useState<UploadedFileInfo[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [showScrollDown, setShowScrollDown] = useState<boolean>(false);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [fileReviewStatus, setFileReviewStatus] = useState<Record<string, 'accepted' | 'declined' | 'pending'>>({});

  const [isEditingFolder, setIsEditingFolder] = useState<boolean>(false);
  const [folderInput, setFolderInput] = useState<string>(session.workspacePath);
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    api.models.list().then(setAvailableModels).catch(() => {});
  }, []);

  useEffect(() => {
    setFolderInput(session.workspacePath);
  }, [session.workspacePath]);

  // Global OpenCode Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+L -> Clear Output Buffer
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setOutputBuffer('');
      }
      // Ctrl+O -> Toggle View Mode
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        setViewMode(prev => (prev === 'split' ? 'markdown' : prev === 'markdown' ? 'terminal' : 'split'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingToBottomRef = useRef<boolean>(false);
  const outputLengthRef = useRef<number>(0);
  const headlessTermRef = useRef<XTerm | null>(null);

  // Strip ANSI escape codes for clean Markdown rendering
  const stripAnsi = (str: string) => {
    return str.replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ''
    );
  };

  useEffect(() => {
    setOutputBuffer('');
    setIsGenerating(false);

    // Create an in-memory headless terminal to cleanly parse PTY animations and screen clears
    const term = new XTerm({
      cols: 120,
      rows: 1000,
      scrollback: 50000,
      allowProposedApi: true,
    });
    headlessTermRef.current = term;

    // Subscribe to WebSocket events for this session
    const unsubscribeOutput = wsClient.on<{ targetId: string; data: string }>('terminal.output', payload => {
      if (payload.targetId === session.id) {
        if (headlessTermRef.current) {
          headlessTermRef.current.write(payload.data, () => {
            if (!headlessTermRef.current) return;
            let text = '';
            const buffer = headlessTermRef.current.buffer.active;
            for (let i = 0; i < buffer.length; i++) {
              const str = buffer.getLine(i)?.translateToString(true);
              if (str !== undefined && (str.trim().length > 0 || text.length > 0)) {
                text += str + '\n';
              }
            }
            setOutputBuffer(text);

            // Check only the last 15 lines of the buffer for idle vs busy status
            const recentLines = text.trim().split('\n').slice(-15).join('\n');
            const isIdle = recentLines.includes('? for shortcuts') || recentLines.includes('Welcome to the Antigravity CLI') || recentLines.trim().endsWith('>') || recentLines.includes('~/workspace');
            const isBusy = recentLines.includes('Generating...') || recentLines.includes('Thinking...') || recentLines.includes('esc to cancel');
            if (isIdle) {
              setIsGenerating(false);
            } else if (isBusy) {
              setIsGenerating(true);
            }
          });
        } else {
          setOutputBuffer(prev => {
            const next = prev + payload.data;
            const recentLines = next.trim().split('\n').slice(-15).join('\n');
            const isIdle = recentLines.includes('? for shortcuts') || recentLines.includes('Welcome to the Antigravity CLI') || recentLines.trim().endsWith('>') || recentLines.includes('~/workspace');
            const isBusy = recentLines.includes('Generating...') || recentLines.includes('Thinking...') || recentLines.includes('esc to cancel');
            if (isIdle) setIsGenerating(false);
            else if (isBusy) setIsGenerating(true);
            return next;
          });
        }
      }
    });

    const unsubscribeExit = wsClient.on<{ targetId: string; exitCode: number }>('terminal.exit', payload => {
      if (payload.targetId === session.id) {
        setIsGenerating(false);
      }
    });

    // Attach to session PTY
    wsClient.attach(session.id);

    return () => {
      unsubscribeOutput();
      unsubscribeExit();
      wsClient.detach(session.id);
      if (headlessTermRef.current) {
        headlessTermRef.current.dispose();
        headlessTermRef.current = null;
      }
    };
  }, [session.id]);

  // Reset scroll state on session change
  useEffect(() => {
    setAutoScroll(true);
    setShowScrollDown(false);
  }, [session.id]);

  const handleScroll = () => {
    if (!scrollContainerRef.current || isScrollingToBottomRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom < 30;
    setAutoScroll(isAtBottom);
    setShowScrollDown(!isAtBottom && distanceFromBottom > 30);
  };

  const handleSendMessage = () => {
    if (!inputPrompt.trim() && attachments.length === 0) return;

    let fullCommand = inputPrompt.trim();
    if (attachments.length > 0) {
      const fileReferences = attachments.map(a => `[File: ${a.localPath}]`).join(' ');
      fullCommand = fullCommand ? `${fullCommand} ${fileReferences}` : fileReferences;
    }

    // Send to Antigravity CLI PTY via stdin
    try {
      const existing = JSON.parse(localStorage.getItem('antiweb_sent_prompts') || '[]');
      localStorage.setItem('antiweb_sent_prompts', JSON.stringify([...existing, fullCommand]));
    } catch (e) {}
    wsClient.sendInput(session.id, fullCommand + '\r');
    setInputPrompt('');
    setPromptHistoryIndex(-1);
    setAttachments([]);
    setIsGenerating(true);
    setAutoScroll(true);
    setShowScrollDown(false);
  };

  const handleStopGenerating = () => {
    // Send Ctrl+C to interrupt CLI
    wsClient.sendInput(session.id, '\x03');
    setIsGenerating(false);
  };

  const handleCopyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  // Drag and Drop File Upload
  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    setIsUploading(true);
    try {
      const uploaded: UploadedFileInfo[] = [];
      for (const file of acceptedFiles) {
        const res = await api.uploads.upload(file);
        uploaded.push(res);
      }
      setAttachments(prev => [...prev, ...uploaded]);
    } catch (err) {
      alert(`Upload failed: ${(err as Error).message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    accept: {
      'image/*': [],
      'text/*': [],
      'application/pdf': [],
      'text/markdown': []
    }
  });

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  // Helper to remove tool usage titles (e.g. Prioritizing Tool Usage, Analyzing Request)
  const cleanAssistantContent = (text: string): string => {
    let lines = text.split('\n');
    const cleanedLines: string[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;
      
      // Check if this line is purely a tool usage title (e.g. "Prioritizing Tool Usage", "Analyzing Request", "Searching Codebase", etc.)
      if (!/[.!?:,;]/.test(line) && line.length < 70 && /^(?:[▸•\-*]\s*)?[A-Z]/.test(line)) {
        if (/^(?:[▸•\-*]\s*)?(?:Prioritizing|Analyzing|Searching|Reading|Updating|Executing|Evaluating|Formulating|Checking|Running|Applying|Inspecting|Reviewing|Planning|Generating|Synthesizing|Understanding|Investigating|Writing|Editing|Creating|Modifying|Fixing|Debugging|Testing|Building|Deploying|Configuring|Installing|Validating|Listing|Viewing|Fetching|Querying|Scanning|Thought|Tool|Action|Step|Task|Goal)\b/i.test(line)) {
          continue;
        }
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 6 && words.every(w => /^[A-Z0-9]/.test(w))) {
          continue;
        }
      }
      
      // Check if the line has a title prepended to a sentence like "Prioritizing Tool Usage Hi there!..."
      if (/^(?:Prioritizing|Analyzing|Searching|Reading|Updating|Executing|Evaluating|Formulating|Checking|Running|Applying|Inspecting|Reviewing|Planning|Generating|Synthesizing|Understanding|Investigating|Writing|Editing|Creating|Modifying|Fixing|Debugging|Testing|Building|Deploying|Configuring|Installing|Validating|Listing|Viewing|Fetching|Querying|Scanning|Thought|Tool|Action|Step|Task|Goal)\b/i.test(line)) {
        const words = line.split(/\s+/);
        let firstLowercaseIdx = -1;
        for (let w = 0; w < words.length; w++) {
          if (/^[a-z0-9]/.test(words[w]) || /^[A-Z][a-z0-9]*[.!?:,;]/.test(words[w])) {
            firstLowercaseIdx = w;
            break;
          }
        }
        if (firstLowercaseIdx >= 2) {
          line = words.slice(firstLowercaseIdx - 1).join(' ').trim();
        } else if (!/[.!?:,;]/.test(line) && line.length < 70) {
          continue;
        }
      }
      
      cleanedLines.push(line);
    }
    
    return cleanedLines.join('\n').trim();
  };

  // Clean up TUI slop and parse into separate User, Tool Call, and AI Chat Bubbles!
  const parsedChat = useMemo(() => {
    let raw = stripAnsi(outputBuffer);
    raw = raw.replace(/[\u2800-\u28FF]/g, '').replace(/─{3,}/g, '---');

    let sentPrompts: string[] = [];
    try {
      sentPrompts = JSON.parse(localStorage.getItem('antiweb_sent_prompts') || '[]');
    } catch (e) {}

    const lines = raw.split('\n');
    type ChatBubble = { id: string; role: 'user' | 'assistant' | 'tool'; content: string; thoughtBadge?: string; toolName?: string };
    const bubbles: ChatBubble[] = [];
    let currentBubble: { role: 'user' | 'assistant' | 'tool'; lines: string[]; thoughtBadge?: string; toolName?: string } | null = null;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trimEnd();
      const trimmed = line.trim();

      // 1. Skip ASCII art banners, logos, and version headers (▄, ▀, █, etc.)
      if (/[\u2580-\u259F]/.test(trimmed) || trimmed.includes('Antigravity CLI') || trimmed.includes('~/workspace/') || trimmed.includes('~/')) {
        continue;
      }
      // 2. Skip TUI footer status bars and hints - also marks end of current assistant message!
      if (
        trimmed.startsWith('? for shortcuts') ||
        /^(?:[\u2800-\u28FF]|[\u2500-\u257F]|\u2022|\u25B8|\u25AA|\u25AB|\*|o|\-|\+|\?|\u231B|\u26A1|\s)*?(?:Generating|Thinking|Loading|Executing|Evaluating|Waiting|Processing|Connecting|Sending|Receiving|Formatting|Parsing|Searching|Reading|Writing|Updating)(?:\.{1,3}|\s*\.\.\.|\s*…|\s*$)/i.test(trimmed) ||
        trimmed.includes('esc to cancel') ||
        trimmed.includes('@gmail.com') ||
        trimmed.includes('(Google AI Pro)')
      ) {
        if (currentBubble) {
          const contentStr = currentBubble.role === 'assistant' ? cleanAssistantContent(currentBubble.lines.join('\n')) : currentBubble.lines.join('\n').trim();
          if (contentStr.length > 0 || currentBubble.thoughtBadge) {
            bubbles.push({
              id: `bubble_${bubbles.length}`,
              role: currentBubble.role,
              content: contentStr,
              thoughtBadge: currentBubble.thoughtBadge,
              toolName: currentBubble.toolName
            });
          }
          currentBubble = null;
        }
        continue;
      }
      // 3. Skip empty prompt lines, command echoes, prompt borders, and separators!
      if (
        trimmed === '>' ||
        trimmed === '---' ||
        trimmed === '--- > ---' ||
        /^[-─_=\s>]{2,}$/.test(trimmed) ||
        /^[─\s>]+$/.test(trimmed) ||
        trimmed.includes('▄▀▀') ||
        trimmed.includes('▀▀▄') ||
        trimmed === 'Restart' ||
        trimmed.length === 0
      ) {
        continue;
      }

      // 4. Check if line matches a known sent prompt from the user or starts with prompt echo!
      const cleanLine = trimmed.replace(/^(?:>|\$|---|─+|\[?User\]?:?|\u2580-\u259F)\s*/i, '').trim();
      const isKnownUserPrompt = sentPrompts.some(p => {
        const cleanP = p.trim();
        if (!cleanP) return false;
        if (cleanLine === cleanP || cleanLine.startsWith(cleanP)) return true;
        if (cleanP.startsWith(cleanLine) && cleanLine.length >= 10) return true;
        return false;
      });
      const isPromptEcho = /^>(?:\s+[a-zA-Z0-9_'"]|$)/.test(trimmed) || /^\[?User\]?:?\s+/i.test(trimmed);

      if ((isKnownUserPrompt || isPromptEcho) && cleanLine.length > 0) {
        if (currentBubble && currentBubble.role !== 'user') {
          const contentStr = currentBubble.role === 'assistant' ? cleanAssistantContent(currentBubble.lines.join('\n')) : currentBubble.lines.join('\n').trim();
          if (contentStr.length > 0 || currentBubble.thoughtBadge) {
            bubbles.push({
              id: `bubble_${bubbles.length}`,
              role: currentBubble.role,
              content: contentStr,
              thoughtBadge: currentBubble.thoughtBadge,
              toolName: currentBubble.toolName
            });
          }
          currentBubble = null;
        }
        if (!currentBubble) {
          currentBubble = {
            role: 'user',
            lines: [cleanLine]
          };
        } else {
          currentBubble.lines.push(cleanLine);
        }
        continue;
      }

      // 5. Check if line is a Tool Call!
      const toolNames = ['run_command', 'view_file', 'replace_file_content', 'multi_replace_file_content', 'write_to_file', 'grep_search', 'list_dir', 'read_url_content', 'search_web', 'invoke_subagent', 'send_message', 'manage_task', 'schedule', 'generate_image'];
      const isToolPrefix = /^(?:[\u2800-\u28FF]|[\u2500-\u257F]|\u2022|\u25B8|\u25AA|\u25AB|\*|o|\-|\+|\$|\[?Tool\]?:?|Calling|Used|Executing|Running|Reading|Editing|Viewing|Searching|Invoking)\s+/i.test(trimmed);
      const isToolCallLine = trimmed.length < 90 && (
        (isToolPrefix && toolNames.some(t => trimmed.includes(t))) ||
        /^(?:[\u2800-\u28FF]|[\u2500-\u257F]|\u2022|\u25B8|\u25AA|\u25AB|\*|o|\-)?\s*(?:Calling|Used|Executing|Tool|Running|Reading|Editing|Viewing|Searching)\s+(?:tool|command|file|codebase|bash)/i.test(trimmed) ||
        /^\$?\s*(?:cat|grep|ls|cd|npm|npx|node|git|python|pip|systemctl|pkill|sleep)\s+/i.test(trimmed)
      );

      if (isToolCallLine && (!currentBubble || currentBubble.role !== 'tool')) {
        if (currentBubble) {
          const contentStr = currentBubble.role === 'assistant' ? cleanAssistantContent(currentBubble.lines.join('\n')) : currentBubble.lines.join('\n').trim();
          if (contentStr.length > 0 || currentBubble.thoughtBadge) {
            bubbles.push({
              id: `bubble_${bubbles.length}`,
              role: currentBubble.role,
              content: contentStr,
              thoughtBadge: currentBubble.thoughtBadge,
              toolName: currentBubble.toolName
            });
          }
        }
        let matchedTool = toolNames.find(t => trimmed.includes(t)) || 'tool';
        if (trimmed.includes('bash') || trimmed.includes('command') || /^\$?\s*(?:npm|npx|node|git|python|systemctl|pkill)/.test(trimmed)) {
          matchedTool = 'run_command';
        } else if (trimmed.includes('read') || trimmed.includes('view') || trimmed.includes('cat')) {
          matchedTool = 'view_file';
        } else if (trimmed.includes('edit') || trimmed.includes('replace') || trimmed.includes('write')) {
          matchedTool = 'replace_file_content';
        } else if (trimmed.includes('grep') || trimmed.includes('search')) {
          matchedTool = 'grep_search';
        }
        currentBubble = {
          role: 'tool',
          lines: [line],
          toolName: matchedTool
        };
        continue;
      }

      // 6. Extract thought / token usage (▸ Thought for 2s, 203 tokens ...) -> Starts Assistant Bubble!
      if (trimmed.startsWith('▸') || trimmed.startsWith('• Thought') || trimmed.startsWith('Thought for') || trimmed.includes('tokens')) {
        if (currentBubble) {
          const contentStr = currentBubble.role === 'assistant' ? cleanAssistantContent(currentBubble.lines.join('\n')) : currentBubble.lines.join('\n').trim();
          if (contentStr.length > 0 || currentBubble.thoughtBadge) {
            bubbles.push({
              id: `bubble_${bubbles.length}`,
              role: currentBubble.role,
              content: contentStr,
              thoughtBadge: currentBubble.thoughtBadge,
              toolName: currentBubble.toolName
            });
          }
        }

        const tokenMatch = trimmed.match(/(?:▸|•)?\s*(Thought\s+for\s+[^\.\!\?]+(?:tokens|sec|ms|s))/i);
        const badge = tokenMatch ? tokenMatch[1].trim() : 'Thought for 1s, 100 tokens';
        let remainder = tokenMatch ? trimmed.replace(/(?:▸|•)?\s*Thought\s+for\s+[^\.\!\?]+(?:tokens|sec|ms|s)/i, '').trim() : '';

        currentBubble = {
          role: 'assistant',
          lines: remainder.length > 0 ? [remainder] : [],
          thoughtBadge: badge
        };
        continue;
      }

      // 7. Normal text line -> Belongs to active bubble (or Assistant by default if none)!
      if (!currentBubble) {
        currentBubble = {
          role: 'assistant',
          lines: [line]
        };
      } else {
        currentBubble.lines.push(line);
      }
    }

    if (currentBubble) {
      const contentStr = currentBubble.role === 'assistant' ? cleanAssistantContent(currentBubble.lines.join('\n')) : currentBubble.lines.join('\n').trim();
      if (contentStr.length > 0 || currentBubble.thoughtBadge) {
        bubbles.push({
          id: `bubble_${bubbles.length}`,
          role: currentBubble.role,
          content: contentStr,
          thoughtBadge: currentBubble.thoughtBadge,
          toolName: currentBubble.toolName
        });
      }
    }

    const turns: any[] = [];
    let currentAsstTurn: any = null;
    let currentUserTurn: any = null;

    for (const b of bubbles) {
      if (b.role === 'user') {
        if (currentAsstTurn) {
          turns.push(currentAsstTurn);
          currentAsstTurn = null;
        }
        if (!currentUserTurn) {
          currentUserTurn = {
            id: b.id || `user_${turns.length}`,
            role: 'user',
            content: b.content
          };
        } else {
          currentUserTurn.content += '\n' + b.content;
        }
      } else {
        if (currentUserTurn) {
          turns.push(currentUserTurn);
          currentUserTurn = null;
        }
        // Assistant or tool block -> belongs to the current Assistant Turn!
        if (!currentAsstTurn) {
          currentAsstTurn = {
            id: `asst_${turns.length}`,
            role: 'assistant',
            items: [],
            thoughtBadge: b.thoughtBadge
          };
        }
        if (b.thoughtBadge) {
          currentAsstTurn.thoughtBadge = b.thoughtBadge;
        }
        currentAsstTurn.items.push({
          role: b.role,
          content: b.content || '',
          toolName: b.toolName,
          thoughtBadge: b.thoughtBadge
        });
      }
    }

    if (currentUserTurn) {
      turns.push(currentUserTurn);
    }
    if (currentAsstTurn) {
      turns.push(currentAsstTurn);
    }

    return {
      turns: turns.length > 0 ? turns : null,
      bubbles: bubbles.length > 0 ? bubbles : null
    };
  }, [outputBuffer]);

  // Extract changed files for Review Tab
  const changedFiles = useMemo(() => {
    const filesMap = new Map<string, { path: string; name: string; status: 'modified' | 'created' }>();
    const lines = outputBuffer.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const matches = line.match(/(?:\/home\/[^\s'"]+|[a-zA-Z0-9_\-\/]+\.[a-zA-Z0-9]+)/g);
      if (matches) {
        for (const match of matches) {
          const cleanPath = match.replace(/^[^\w\/]+|[^\w\/.]+$|['";),]+/g, '');
          if (cleanPath.length > 3 && /\.(ts|tsx|js|jsx|css|html|json|md|py|sh|sql)$/.test(cleanPath)) {
            if (cleanPath.includes('node_modules') || cleanPath.includes('.git') || cleanPath.includes('.data') || cleanPath.includes('.next') || cleanPath.includes('dist/') || cleanPath.includes('build/')) continue;
            const name = cleanPath.split('/').pop() || cleanPath;
            const isCreated = line.toLowerCase().includes('create') || line.toLowerCase().includes('write_to_file') || line.toLowerCase().includes('new');
            if (!filesMap.has(cleanPath)) {
              filesMap.set(cleanPath, {
                path: cleanPath,
                name,
                status: isCreated ? 'created' : 'modified'
              });
            }
          }
        }
      }
    }
    return Array.from(filesMap.values());
  }, [outputBuffer]);

  // Auto-scroll logic & scroll to bottom on load / updates
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      const scrollToBottom = () => {
        if (scrollContainerRef.current) {
          isScrollingToBottomRef.current = true;
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          setTimeout(() => {
            isScrollingToBottomRef.current = false;
          }, 250);
        }
      };
      scrollToBottom();
      // Ensure bottom scroll after DOM layout and media/markdown rendering
      requestAnimationFrame(scrollToBottom);
      const timer = setTimeout(scrollToBottom, 150);
      return () => clearTimeout(timer);
    }
  }, [outputBuffer, parsedChat, autoScroll, session.id]);

  return (
    <div {...getRootProps()} className="flex flex-col h-full min-h-0 bg-[#0a0a0a] text-foreground relative overflow-hidden">
      <input {...getInputProps()} />

      {/* Drag & Drop Overlay */}
      {isDragActive && (
        <div className="absolute inset-0 z-50 bg-primary/20 backdrop-blur-md border-2 border-dashed border-primary flex flex-col items-center justify-center text-primary animate-pulse">
          <Paperclip className="w-16 h-16 mb-4" />
          <h3 className="text-xl font-bold">Drop files here to upload to AntiWeb</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Images, Markdown, PDFs, and Text files will be made available to Antigravity CLI.
          </p>
        </div>
      )}

      {/* OpenCode Web Studio 2-Pane Workspace Layout */}
      <div className="flex-1 w-full h-full flex flex-col lg:flex-row overflow-hidden bg-[#0e0f12] p-2 md:p-3 gap-3">
        {/* LEFT PANE: Chat / Session */}
        <div className={cn("flex-1 h-1/2 lg:h-full flex flex-col rounded-2xl bg-[#14151a] border border-[#23252f] overflow-hidden shadow-2xl relative", viewMode === 'terminal' ? 'hidden' : viewMode === 'markdown' ? 'w-full' : 'lg:w-1/2')}>
          {/* Left Pane Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#23252f] bg-[#14151a] shrink-0 select-none">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold text-sm text-white/90 font-sans tracking-tight">
                {session.title || 'New session'}
              </h2>
            </div>
            <div className="flex items-center gap-3 text-neutral-400">
              {isGenerating && (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-neutral-600 border-t-neutral-300 animate-spin" title="Active"></span>
              )}
              <button className="hover:text-white transition-colors tracking-widest text-base leading-none" title="Menu">
                •••
              </button>
            </div>
          </div>

          {/* Left Pane Chat Stream */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto px-4 md:px-6 py-6 space-y-6"
          >
            {parsedChat.turns ? (
              <div className="max-w-4xl mx-auto space-y-6 pb-6">
                {parsedChat.turns.map((turn: any, index: number) => (
                  <div key={turn.id || index} className="transition-all animate-in fade-in duration-300">
                    {turn.role === 'user' ? (
                      /* Premium User Message Bubble */
                      <div className="flex justify-end gap-3 items-start pl-10 md:pl-16">
                        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-[#242424] to-[#1a1a1a] border border-[#fab283]/40 px-5 py-3.5 text-white shadow-lg shadow-[#fab283]/5 font-sans text-sm md:text-base">
                          <div className="flex items-center justify-between gap-4 mb-1 pb-1 border-b border-white/5 text-[11px] text-[#fab283] font-mono font-medium">
                            <span>You</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words leading-relaxed text-neutral-100">
                            {turn.content}
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-xl bg-[#242424] border border-[#fab283]/40 flex items-center justify-center text-[#fab283] font-mono font-bold text-xs shrink-0 shadow-md">
                          U
                        </div>
                      </div>
                    ) : (
                      /* Premium Assistant Message Bubble */
                      <div className="flex justify-start gap-3.5 items-start pr-6 md:pr-12">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#fab283] to-[#d97736] border border-[#fab283] flex items-center justify-center text-black font-mono font-bold text-xs shrink-0 shadow-lg shadow-[#fab283]/20 mt-1">
                          AW
                        </div>
                        <div className="flex-1 max-w-[92%] rounded-2xl rounded-tl-sm bg-[#141414]/90 backdrop-blur-md border border-[#242424] hover:border-[#fab283]/30 transition-all duration-300 p-5 md:p-6 shadow-xl text-neutral-200 font-sans space-y-4">
                          <div className="flex items-center justify-between pb-3 border-b border-[#242424] text-xs">
                            <div className="flex items-center gap-2 font-mono font-semibold text-[#fab283]">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>AntiWeb AI</span>
                            </div>
                            {turn.thoughtBadge && (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0a0a0a] border border-[#242424] text-[11px] text-neutral-400 font-mono shadow-inner">
                                <span>{turn.thoughtBadge}</span>
                              </div>
                            )}
                          </div>
                          <div className="space-y-4">
                            {turn.items && turn.items.map((item: any, itemIdx: number) => (
                              <div key={itemIdx} className="w-full">
                                {item.role === 'tool' ? (
                                  /* Sleek Tool Card */
                                  <div className="rounded-xl bg-[#0a0a0a] border border-[#242424] shadow-inner overflow-hidden my-3 w-full font-mono text-xs">
                                    <div className="flex items-center justify-between px-3.5 py-2 bg-[#141414] border-b border-[#242424] text-neutral-300">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[#fab283] font-bold">
                                          ● {item.toolName || 'Tool Action'}
                                        </span>
                                      </div>
                                      <span className="text-[10px] bg-[#242424] text-neutral-400 px-2 py-0.5 rounded border border-white/5">
                                        {item.toolName || 'tool'}
                                      </span>
                                    </div>
                                    <div className="p-3 text-neutral-300 bg-[#0a0a0a] overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                      {item.content}
                                    </div>
                                  </div>
                                ) : (
                                  /* Assistant Markdown Text Block */
                                  <div className="prose prose-invert max-w-none">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm]}
                                      components={{
                                        code({ node, inline, className, children, ...props }: any) {
                                          const match = /language-(\w+)/.exec(className || '');
                                          const codeStr = String(children).replace(/\n$/, '');
                                          const codeId = `code_${Math.random().toString(36).substring(2, 9)}`;

                                          if (!inline && match) {
                                            return (
                                              <div className="my-4 rounded-xl overflow-hidden border border-[#242424] bg-[#0a0a0a] shadow-lg">
                                                <div className="flex items-center justify-between px-4 py-2 bg-[#141414] border-b border-[#242424] text-xs text-neutral-400 font-mono">
                                                  <span>{match[1].toUpperCase()}</span>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-6 px-2 text-[11px] gap-1 hover:bg-white/5 text-neutral-400 hover:text-white"
                                                    onClick={() => handleCopyCode(codeStr, codeId)}
                                                  >
                                                    {copiedCodeId === codeId ? (
                                                      <>
                                                        <Check className="w-3 h-3 text-[#fab283]" />
                                                        <span className="text-[#fab283] font-semibold">Copied!</span>
                                                      </>
                                                    ) : (
                                                      <>
                                                        <Copy className="w-3 h-3" />
                                                        <span>Copy</span>
                                                      </>
                                                    )}
                                                  </Button>
                                                </div>
                                                <SyntaxHighlighter
                                                  style={vscDarkPlus as any}
                                                  language={match[1]}
                                                  PreTag="div"
                                                  customStyle={{
                                                    margin: 0,
                                                    padding: '1rem',
                                                    background: 'transparent',
                                                    fontSize: '0.85rem',
                                                  }}
                                                  {...props}
                                                >
                                                  {codeStr}
                                                </SyntaxHighlighter>
                                              </div>
                                            );
                                          }
                                          return (
                                            <code className="text-[#fab283] font-mono font-normal bg-[#fab283]/10 px-1.5 py-0.5 rounded text-xs" {...props}>
                                              {children}
                                            </code>
                                          );
                                        },
                                        table({ children }: any) {
                                          return (
                                            <div className="my-4 overflow-x-auto rounded-xl border border-[#242424] shadow-sm">
                                              <table className="w-full text-left border-collapse text-sm">
                                                {children}
                                              </table>
                                            </div>
                                          );
                                        },
                                        th({ children }: any) {
                                          return (
                                            <th className="bg-[#1a1a1a] px-4 py-2.5 font-semibold text-white border-b border-[#242424]">
                                              {children}
                                            </th>
                                          );
                                        },
                                        td({ children }: any) {
                                          return (
                                            <td className="px-4 py-2 border-b border-[#242424]/50 text-neutral-300">
                                              {children}
                                            </td>
                                          );
                                        },
                                        img({ src, alt }: any) {
                                          return (
                                            <div className="my-4 rounded-xl overflow-hidden border border-[#242424] shadow-lg bg-[#141414] p-2 inline-block max-w-full">
                                              <img src={src} alt={alt} className="rounded-lg max-h-96 object-contain" />
                                              {alt && <p className="text-center text-xs text-neutral-400 mt-1.5">{alt}</p>}
                                            </div>
                                          );
                                        }
                                      }}
                                    >
                                      {item.content || (index === (parsedChat.turns?.length || 0) - 1 && itemIdx === (turn.items?.length || 0) - 1 && isGenerating ? 'Thinking & generating response...' : '')}
                                    </ReactMarkdown>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Separator & Action Buttons inside Bubble */}
                          {index === (parsedChat.turns?.length || 0) - 1 && (
                            <div className="pt-4 mt-2 border-t border-[#242424] space-y-3">
                              <div className="flex items-center gap-3 text-xs text-neutral-500 font-mono">
                                <div className="h-px bg-[#242424] flex-1"></div>
                                <span>{isGenerating ? 'Generating...' : 'Completed'}</span>
                                <div className="h-px bg-[#242424] flex-1"></div>
                              </div>
                              {!isGenerating && (
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setInputPrompt('Continue');
                                    }}
                                    className="px-3.5 py-1.5 rounded-lg bg-[#242424] hover:bg-[#fab283] hover:text-black border border-[#fab283]/30 text-xs font-medium text-white shadow-sm transition-all duration-200"
                                  >
                                    Continue?
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-3 select-none">
                <div className="w-12 h-12 rounded-xl bg-[#1d1e26] flex items-center justify-center border border-[#23252f] shadow-sm">
                  <TerminalIcon className="w-6 h-6 text-neutral-400" />
                </div>
                <h3 className="text-base font-semibold text-white">AntiWeb 1.0</h3>
                <p className="text-xs text-neutral-500 max-w-sm">
                  Ready for input. Ask anything, / for commands, @ for context...
                </p>
              </div>
            )}
          </div>

          {/* Floating Scroll to Bottom Button */}
          {showScrollDown && (
            <div className="absolute bottom-24 right-8 z-40 animate-in fade-in zoom-in-90 duration-200">
              <button
                onClick={() => {
                  if (scrollContainerRef.current) {
                    isScrollingToBottomRef.current = true;
                    scrollContainerRef.current.scrollTo({
                      top: scrollContainerRef.current.scrollHeight,
                      behavior: 'smooth'
                    });
                    setTimeout(() => {
                      if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                      }
                      isScrollingToBottomRef.current = false;
                    }, 600);
                  }
                  setAutoScroll(true);
                  setShowScrollDown(false);
                }}
                className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#1a1a1a]/95 backdrop-blur-md hover:bg-[#fab283] hover:text-black border border-[#fab283]/40 text-xs font-medium text-white shadow-xl shadow-black/50 transition-all duration-300 group cursor-pointer"
                title="Scroll to latest message"
              >
                <span>Latest message</span>
                <ChevronDown className="w-4 h-4 text-[#fab283] group-hover:text-black transition-colors" />
              </button>
            </div>
          )}

          {/* Left Pane Prompt Input Box */}
          <div className="p-3 bg-[#14151a] shrink-0 border-t border-[#23252f]">
            <div className="relative bg-[#1a1b22] rounded-xl border border-[#23252f] shadow-lg p-3 focus-within:border-[#2dd4bf]/50 focus-within:ring-1 focus-within:ring-[#2dd4bf]/20 transition-all font-sans">
              {attachments.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap p-2 mb-2 bg-[#14151a] rounded-lg border border-[#23252f] shadow-sm font-mono">
                  {attachments.map(att => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#1d1e26] border border-[#23252f] text-xs font-medium text-[#2dd4bf]"
                    >
                      {att.mimetype.startsWith('image/') ? (
                        <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
                      ) : (
                        <FileText className="w-3.5 h-3.5 text-[#2dd4bf]" />
                      )}
                      <span className="truncate max-w-[150px]">{att.originalName}</span>
                      <button
                        onClick={() => removeAttachment(att.id)}
                        className="hover:text-red-400 transition-colors ml-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Input
                value={inputPrompt}
                onChange={e => setInputPrompt(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  } else if (e.key === 'ArrowUp') {
                    try {
                      const prompts = JSON.parse(localStorage.getItem('antiweb_sent_prompts') || '[]');
                      if (prompts.length > 0) {
                        const nextIdx = promptHistoryIndex === -1 ? prompts.length - 1 : Math.max(0, promptHistoryIndex - 1);
                        setPromptHistoryIndex(nextIdx);
                        setInputPrompt(prompts[nextIdx]);
                        e.preventDefault();
                      }
                    } catch (err) {}
                  } else if (e.key === 'ArrowDown') {
                    try {
                      const prompts = JSON.parse(localStorage.getItem('antiweb_sent_prompts') || '[]');
                      if (prompts.length > 0 && promptHistoryIndex !== -1) {
                        const nextIdx = promptHistoryIndex + 1;
                        if (nextIdx >= prompts.length) {
                          setPromptHistoryIndex(-1);
                          setInputPrompt('');
                        } else {
                          setPromptHistoryIndex(nextIdx);
                          setInputPrompt(prompts[nextIdx]);
                        }
                        e.preventDefault();
                      }
                    } catch (err) {}
                  }
                }}
                placeholder={isUploading ? 'Uploading attachments...' : 'Ask anything, / for commands, @ for context...'}
                disabled={isUploading}
                className="border-0 bg-transparent h-10 focus-visible:ring-0 focus-visible:ring-offset-0 px-1 text-sm text-white placeholder:text-neutral-500 shadow-none font-sans w-full"
              />

              <div className="flex items-center justify-between pt-2 mt-1 border-t border-white/5">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="file-upload"
                    className="p-1.5 text-neutral-400 hover:text-white bg-[#23252f] hover:bg-[#2c2f3c] rounded-lg cursor-pointer transition-colors border border-white/5"
                    title="Attach File"
                  >
                    <Plus className="w-4 h-4" />
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      className="hidden"
                      onChange={async e => {
                        if (e.target.files && e.target.files.length > 0) {
                          onDrop(Array.from(e.target.files));
                        }
                      }}
                    />
                  </label>

                  {/* Model Selector Pill */}
                  <div className="flex items-center gap-1.5 bg-[#23252f] hover:bg-[#2c2f3c] px-2.5 py-1 rounded-lg border border-white/5 text-xs font-medium text-neutral-200 cursor-pointer">
                    <Sparkles className="w-3 h-3 text-[#2dd4bf]" />
                    <select
                      value={session.model || 'Claude Fable 5'}
                      onChange={e => onUpdateSession?.({ model: e.target.value })}
                      className="bg-transparent text-xs font-medium text-neutral-200 focus:outline-none cursor-pointer pr-1"
                    >
                      {availableModels.length > 0 ? (
                        availableModels.map(m => (
                          <option key={m} value={m} className="bg-[#14151a] text-white">
                            {m}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="DeepSeek V4 Flash" className="bg-[#14151a] text-white">DeepSeek V4 Flash</option>
                          <option value="DeepSeek V4 Flash Free" className="bg-[#14151a] text-white">DeepSeek V4 Flash Free</option>
                          <option value="Claude Fable 5" className="bg-[#14151a] text-white">Claude Fable 5</option>
                          <option value="Claude 3.7 Sonnet" className="bg-[#14151a] text-white">Claude 3.7 Sonnet</option>
                          <option value="Gemini 2.5 Pro" className="bg-[#14151a] text-white">Gemini 2.5 Pro</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {isGenerating && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 rounded-lg gap-1.5 text-xs font-semibold border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 shadow-sm"
                      onClick={handleStopGenerating}
                      title="Stop Generating"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span>Stop</span>
                    </Button>
                  )}
                  <button
                    onClick={handleSendMessage}
                    disabled={isUploading || (!inputPrompt.trim() && attachments.length === 0)}
                    className="h-8 w-8 rounded-lg bg-[#282a36] hover:bg-[#343746] text-white flex items-center justify-center border border-white/10 transition-transform active:scale-95 disabled:opacity-40"
                    title="Send Message"
                  >
                    <span className="font-bold text-base leading-none">↑</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Review / Terminal / Files */}
        <div className={cn("flex-1 h-1/2 lg:h-full flex flex-col rounded-2xl bg-[#14151a] border border-[#23252f] overflow-hidden shadow-2xl relative", viewMode === 'markdown' ? 'hidden' : viewMode === 'terminal' ? 'w-full' : 'lg:w-1/2')}>
          {/* Right Pane Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#23252f] bg-[#14151a] shrink-0 select-none">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRightPaneTab('review')}
                className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all', rightPaneTab === 'review' ? 'bg-[#23252f] text-white border border-white/5' : 'text-neutral-400 hover:text-white')}
              >
                Review
              </button>
              <button
                onClick={() => setRightPaneTab('terminal')}
                className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all', rightPaneTab === 'terminal' ? 'bg-[#23252f] text-white border border-white/5' : 'text-neutral-400 hover:text-white')}
              >
                Terminal
              </button>
              <button
                onClick={() => setRightPaneTab('files')}
                className={cn('px-3 py-1 rounded-lg text-xs font-semibold transition-all', rightPaneTab === 'files' ? 'bg-[#23252f] text-white border border-white/5' : 'text-neutral-400 hover:text-white')}
              >
                Files
              </button>
              <button className="p-1 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5" title="New Tab">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(prev => prev === 'split' ? 'markdown' : 'split')}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-white/5"
                title={viewMode === 'split' ? "Expand Chat" : "Split View"}
              >
                <Layout className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sub-header for Review Tab */}
          {rightPaneTab === 'review' && (
            <div className="px-5 py-2.5 border-b border-[#23252f] bg-[#14151a] flex items-center justify-between text-xs text-neutral-300 shrink-0">
              <div className="flex items-center gap-1.5 cursor-pointer hover:text-white">
                <span>Last turn changes</span>
                <span className="text-[10px]">▼</span>
              </div>
            </div>
          )}

          {/* Sub-header / Switcher for Terminal Tab */}
          {rightPaneTab === 'terminal' && (
            <div className="px-5 py-2 border-b border-[#23252f] bg-[#14151a] flex items-center justify-between text-xs text-neutral-300 shrink-0 select-none">
              <div className="flex items-center gap-1.5 bg-[#0e0f12] p-1 rounded-lg border border-[#23252f]">
                <button
                  onClick={() => setTerminalMode('bash')}
                  className={cn(
                    "px-3 py-1 rounded-md font-mono text-xs font-semibold transition-all flex items-center gap-1.5",
                    terminalMode === 'bash'
                      ? "bg-[#2dd4bf]/20 text-[#2dd4bf] border border-[#2dd4bf]/30 shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  <TerminalIcon className="w-3.5 h-3.5" />
                  <span>Bash Terminal</span>
                </button>
                <button
                  onClick={() => setTerminalMode('cli')}
                  className={cn(
                    "px-3 py-1 rounded-md font-mono text-xs font-semibold transition-all flex items-center gap-1.5",
                    terminalMode === 'cli'
                      ? "bg-[#fab283]/20 text-[#fab283] border border-[#fab283]/30 shadow-sm"
                      : "text-neutral-400 hover:text-white"
                  )}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AGY CLI</span>
                </button>
              </div>
              <div className="text-[11px] font-mono text-neutral-500 hidden sm:block">
                {terminalMode === 'bash' ? 'Run commands in workspace' : 'Interactive Antigravity PTY'}
              </div>
            </div>
          )}

          {/* Right Pane Content */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-[#0e0f12]">
            {rightPaneTab === 'review' ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 font-sans bg-[#0e0f12]">
                <div className="flex items-center justify-between pb-3 border-b border-[#23252f]">
                  <div>
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#fab283]" />
                      <span>Changed Files</span>
                      <span className="px-2 py-0.5 rounded-full bg-[#23252f] text-neutral-400 text-xs font-mono">
                        {changedFiles.length}
                      </span>
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Changes are auto-accepted unless you decline them.
                    </p>
                  </div>
                  {changedFiles.length > 0 && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const next: Record<string, 'accepted' | 'declined' | 'pending'> = {};
                          changedFiles.forEach(f => { next[f.path] = 'accepted'; });
                          setFileReviewStatus(prev => ({ ...prev, ...next }));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#23252f] hover:bg-[#2dd4bf]/20 hover:text-[#2dd4bf] text-xs font-medium text-neutral-300 transition-colors border border-white/5 flex items-center gap-1"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept All</span>
                      </button>
                      <button
                        onClick={() => {
                          const next: Record<string, 'accepted' | 'declined' | 'pending'> = {};
                          changedFiles.forEach(f => { next[f.path] = 'declined'; });
                          setFileReviewStatus(prev => ({ ...prev, ...next }));
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#23252f] hover:bg-red-500/20 hover:text-red-400 text-xs font-medium text-neutral-300 transition-colors border border-white/5 flex items-center gap-1"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Decline All</span>
                      </button>
                    </div>
                  )}
                </div>

                {changedFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 select-none">
                    <div className="w-12 h-12 rounded-xl bg-[#14151a] flex items-center justify-center border border-[#23252f] shadow-sm">
                      <Check className="w-6 h-6 text-neutral-500" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-neutral-300">No changed files detected yet</h4>
                      <p className="text-xs text-neutral-500 max-w-xs">
                        When the AI creates or modifies files in your workspace, they will appear here for review.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {changedFiles.map(file => {
                      const status = fileReviewStatus[file.path] || 'pending';
                      return (
                        <div
                          key={file.path}
                          className={cn(
                            "flex items-center justify-between p-3.5 rounded-xl border transition-all duration-200 bg-[#14151a]",
                            status === 'accepted' ? "border-[#2dd4bf]/30 bg-[#2dd4bf]/5" :
                            status === 'declined' ? "border-red-500/30 bg-red-500/5 opacity-60" :
                            "border-[#23252f] hover:border-[#fab283]/30"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1 pr-4">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-mono uppercase font-bold shrink-0",
                              file.status === 'created' ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                              "bg-[#fab283]/10 text-[#fab283] border border-[#fab283]/20"
                            )}>
                              {file.status}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="font-mono text-xs font-semibold text-white truncate">
                                {file.name}
                              </div>
                              <div className="font-mono text-[11px] text-neutral-500 truncate">
                                {file.path}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {status === 'accepted' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2dd4bf]/10 text-[#2dd4bf] text-xs font-mono font-medium border border-[#2dd4bf]/20">
                                <Check className="w-3.5 h-3.5" />
                                <span>Accepted</span>
                              </span>
                            ) : status === 'declined' ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 text-xs font-mono font-medium border border-red-500/20">
                                <X className="w-3.5 h-3.5" />
                                <span>Declined</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-800 text-neutral-400 text-xs font-mono font-medium border border-white/5">
                                <Check className="w-3.5 h-3.5 text-[#2dd4bf]" />
                                <span>Auto-accepted</span>
                              </span>
                            )}

                            <div className="flex items-center border border-[#23252f] rounded-lg overflow-hidden bg-[#0e0f12] ml-1">
                              <button
                                onClick={() => setFileReviewStatus(prev => ({ ...prev, [file.path]: 'accepted' }))}
                                className={cn(
                                  "p-1.5 hover:bg-[#2dd4bf]/20 hover:text-[#2dd4bf] transition-colors",
                                  status === 'accepted' ? "text-[#2dd4bf] bg-[#2dd4bf]/10" : "text-neutral-400"
                                )}
                                title="Accept changes"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <div className="w-px h-6 bg-[#23252f]"></div>
                              <button
                                onClick={() => setFileReviewStatus(prev => ({ ...prev, [file.path]: 'declined' }))}
                                className={cn(
                                  "p-1.5 hover:bg-red-500/20 hover:text-red-400 transition-colors",
                                  status === 'declined' ? "text-red-400 bg-red-500/10" : "text-neutral-400"
                                )}
                                title="Decline changes"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : rightPaneTab === 'terminal' ? (
              <div className="w-full h-full p-2 bg-[#0e0f12]">
                {terminalMode === 'bash' ? (
                  <TerminalTab
                    key={`bash_${session.id}`}
                    id={`term_${session.id}`}
                    title="Bash Terminal"
                    cwd={session.workspacePath}
                  />
                ) : (
                  <TerminalTab
                    key={`cli_${session.id}`}
                    id={session.id}
                    title="Antigravity CLI"
                    cwd={session.workspacePath}
                  />
                )}
              </div>
            ) : (
              <div className="w-full h-full p-2 bg-[#0e0f12]">
                <FileExplorer initialPath={session.workspacePath} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
