import { PtyManager } from '../pty';
import { TerminalTab } from '@antiweb/shared';
import fs from 'fs';
import path from 'path';
import { config } from '../config';

export class TerminalManager {
  private ptyManager: PtyManager;
  private tabs: Map<string, TerminalTab> = new Map();
  private tabsFile: string;

  constructor(ptyManager?: PtyManager) {
    this.ptyManager = ptyManager || new PtyManager();
    this.tabsFile = path.join(config.dataDir, 'terminals.json');
    this.loadTabs();
  }

  private loadTabs(): void {
    if (fs.existsSync(this.tabsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.tabsFile, 'utf-8'));
        if (Array.isArray(data)) {
          data.forEach((tab: TerminalTab) => {
            this.tabs.set(tab.id, { ...tab, ptyStatus: 'stopped' });
          });
        }
      } catch (e) {
        console.error('Failed to load terminal tabs:', e);
      }
    }
  }

  private saveTabs(): void {
    try {
      if (!fs.existsSync(config.dataDir)) {
        fs.mkdirSync(config.dataDir, { recursive: true });
      }
      fs.writeFileSync(this.tabsFile, JSON.stringify(Array.from(this.tabs.values()), null, 2));
    } catch (e) {
      console.error('Failed to save terminal tabs:', e);
    }
  }

  public async createTab(title?: string, cwd?: string): Promise<TerminalTab> {
    const id = `term_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const tab: TerminalTab = {
      id,
      title: title || `Terminal ${this.tabs.size + 1}`,
      cwd: cwd || process.cwd(),
      ptyStatus: 'running',
      createdAt: new Date().toISOString()
    };
    this.tabs.set(id, tab);
    this.saveTabs();

    const shell = process.env.SHELL || 'bash';
    await this.ptyManager.ensurePty(id, tab.cwd, 80, 24, shell, []);
    return tab;
  }

  public async attachTab(id: string, cols: number = 80, rows: number = 24): Promise<TerminalTab | undefined> {
    const tab = this.tabs.get(id);
    if (!tab) return undefined;

    const shell = process.env.SHELL || 'bash';
    await this.ptyManager.ensurePty(id, tab.cwd, cols, rows, shell, []);
    tab.ptyStatus = 'running';
    this.saveTabs();
    return tab;
  }

  public closeTab(id: string): void {
    this.ptyManager.kill(id);
    this.tabs.delete(id);
    this.saveTabs();
  }

  public listTabs(): TerminalTab[] {
    return Array.from(this.tabs.values()).map(tab => ({
      ...tab,
      ptyStatus: this.ptyManager.isRunning(tab.id) ? 'running' : 'stopped'
    }));
  }

  public getPtyManager(): PtyManager {
    return this.ptyManager;
  }
}
