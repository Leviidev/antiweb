import React, { useState, useEffect } from 'react';
import { AppSettings } from '@antiweb/shared';
import { api } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sun, Moon, Laptop, Terminal, FolderOpen, Save, Check, Key, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettingsUpdated: (settings: AppSettings) => void;
}

const PROVIDERS = [
  { id: 'opencode', name: 'OpenCode Zen / AI', desc: 'Official OpenCode cloud models & agents', placeholder: 'sk-AHYhm...' },
  { id: 'openrouter', name: 'OpenRouter', desc: 'Access 200+ models (DeepSeek, Llama, Claude, GPT)', placeholder: 'sk-or-v1-...' },
  { id: 'gemini', name: 'Google Gemini', desc: 'Gemini 1.5 Pro, Flash, & AI Studio models', placeholder: 'AIza... or AQ...' },
  { id: 'groq', name: 'Groq Cloud', desc: 'Ultra-fast Llama & Mixtral inference', placeholder: 'gsk_...' },
  { id: 'cerebras', name: 'Cerebras Cloud', desc: 'Llama 3.1 70B at 2000+ tokens/second', placeholder: 'csk-...' },
  { id: 'openai', name: 'OpenAI', desc: 'GPT-4o, o1, o3-mini models', placeholder: 'sk-...' },
  { id: 'anthropic', name: 'Anthropic Claude', desc: 'Claude 3.5 Sonnet, Claude 3 Opus', placeholder: 'sk-ant-...' },
  { id: 'github', name: 'GitHub Copilot / Models', desc: 'GitHub Personal Access Token or Copilot token', placeholder: 'ghp_... or github_pat_...' },
  { id: 'ollama', name: 'Ollama (Local)', desc: 'Local server base URL', placeholder: 'http://localhost:11434' },
] as const;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onOpenChange,
  onSettingsUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'providers'>('general');
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'dark',
    defaultWorkspacePath: '',
    terminalFontSize: 14,
    terminalFontFamily: 'JetBrains Mono, monospace',
    agyCommand: 'agy',
    apiKeys: {},
  });
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      api.settings.get().then(res => setSettings(res)).catch(console.error);
    }
  }, [open]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await api.settings.update(settings);
      onSettingsUpdated(updated);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2000);
      onOpenChange(false);
    } catch (err) {
      alert(`Failed to save settings: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#0e1015] border-neutral-800 shadow-2xl text-foreground">
        <DialogHeader className="space-y-3">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
              <Terminal className="w-4 h-4 text-neutral-400" />
              OpenCode & AntiWeb Settings
            </DialogTitle>
          </div>
          <div className="flex gap-4 border-b border-neutral-800 pt-1">
            <button
              onClick={() => setActiveTab('general')}
              className={cn(
                'pb-2 text-xs font-semibold uppercase tracking-wider transition-all border-b-2',
                activeTab === 'general'
                  ? 'border-white text-white font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              )}
            >
              General
            </button>
            <button
              onClick={() => setActiveTab('providers')}
              className={cn(
                'pb-2 text-xs font-semibold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5',
                activeTab === 'providers'
                  ? 'border-white text-white font-bold'
                  : 'border-transparent text-neutral-500 hover:text-neutral-300'
              )}
            >
              <Key className="w-3 h-3" />
              <span>AI Providers & API Keys</span>
              <span className="text-[9px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded font-mono">BYOK</span>
            </button>
          </div>
        </DialogHeader>

        <div className="py-2 max-h-[60vh] overflow-y-auto pr-1 space-y-6">
          {activeTab === 'general' ? (
            <div className="space-y-6">
              {/* Theme Selector */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  Theme Appearance
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['dark', 'light', 'system'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setSettings({ ...settings, theme: t })}
                      className={cn(
                        'flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border transition-all text-xs font-medium capitalize',
                        settings.theme === t
                          ? 'bg-neutral-800 border-neutral-600 text-white font-bold'
                          : 'bg-neutral-900/50 border-neutral-800/80 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                      )}
                    >
                      {t === 'dark' && <Moon className="w-3.5 h-3.5" />}
                      {t === 'light' && <Sun className="w-3.5 h-3.5" />}
                      {t === 'system' && <Laptop className="w-3.5 h-3.5" />}
                      <span>{t}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Default Workspace */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-neutral-400" />
                  Default Workspace Path
                </label>
                <Input
                  value={settings.defaultWorkspacePath}
                  onChange={e => setSettings({ ...settings, defaultWorkspacePath: e.target.value })}
                  placeholder="/home/user/workspace/project"
                  className="font-mono text-xs bg-neutral-900/80 border-neutral-800 h-9 text-neutral-200"
                />
                <p className="text-[11px] text-neutral-500">
                  Directory path where new chat sessions and terminals start by default.
                </p>
              </div>

              {/* Antigravity Command */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-neutral-400" />
                  Antigravity CLI Command
                </label>
                <Input
                  value={settings.agyCommand}
                  onChange={e => setSettings({ ...settings, agyCommand: e.target.value })}
                  placeholder="agy"
                  className="font-mono text-xs bg-neutral-900/80 border-neutral-800 h-9 text-neutral-200"
                />
                <p className="text-[11px] text-neutral-500">
                  The terminal executable name or absolute path to launch when starting sessions.
                </p>
              </div>

              {/* Terminal Typography */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Terminal Font Size
                  </label>
                  <Input
                    type="number"
                    value={settings.terminalFontSize}
                    onChange={e => setSettings({ ...settings, terminalFontSize: parseInt(e.target.value) || 14 })}
                    className="font-mono text-xs bg-neutral-900/80 border-neutral-800 h-9 text-neutral-200"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Font Family
                  </label>
                  <Input
                    value={settings.terminalFontFamily}
                    onChange={e => setSettings({ ...settings, terminalFontFamily: e.target.value })}
                    className="font-mono text-xs bg-neutral-900/80 border-neutral-800 h-9 text-neutral-200"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-neutral-900/60 rounded-xl border border-neutral-800 flex items-center gap-2 text-xs text-neutral-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Keys configured here are automatically passed to your local OpenCode / Antigravity CLI sessions and synced with <code className="text-neutral-300 font-mono">~/.local/share/opencode/auth.json</code>.
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {PROVIDERS.map(p => {
                  const keyVal = settings.apiKeys?.[p.id as keyof typeof settings.apiKeys] || '';
                  const isConfigured = keyVal.trim().length > 0;
                  return (
                    <div key={p.id} className="p-3 bg-neutral-900/40 rounded-xl border border-neutral-800/80 space-y-2 hover:border-neutral-700 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-semibold text-neutral-200">{p.name}</h4>
                          <p className="text-[10px] text-neutral-500">{p.desc}</p>
                        </div>
                        {isConfigured ? (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                            Configured
                          </span>
                        ) : (
                          <span className="text-[10px] bg-neutral-800 text-neutral-500 px-2 py-0.5 rounded-full">
                            Not Set
                          </span>
                        )}
                      </div>
                      <Input
                        type="password"
                        value={keyVal}
                        onChange={e =>
                          setSettings({
                            ...settings,
                            apiKeys: { ...(settings.apiKeys || {}), [p.id]: e.target.value },
                          })
                        }
                        placeholder={p.placeholder}
                        className="font-mono text-xs bg-black/50 border-neutral-800 h-8 text-neutral-200 placeholder:text-neutral-600 focus-visible:ring-1 focus-visible:ring-neutral-600"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-neutral-800">
          <Button variant="ghost" className="text-xs text-neutral-400 hover:text-white" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving} className="gap-1.5 min-w-[110px] bg-white hover:bg-neutral-200 text-black text-xs font-semibold rounded-lg shadow-sm">
            {savedSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                <span>Saved</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
