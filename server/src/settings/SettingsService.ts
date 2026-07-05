import fs from 'fs';
import path from 'path';
import os from 'os';
import { AppSettings } from '@antiweb/shared';
import { config } from '../config';

export class SettingsService {
  private settings: AppSettings;

  constructor() {
    this.settings = {
      theme: 'dark',
      defaultWorkspacePath: process.cwd(),
      terminalFontSize: 14,
      terminalFontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      agyCommand: config.agyCommand,
      apiKeys: {}
    };
    this.load();
  }

  private load(): void {
    if (fs.existsSync(config.settingsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(config.settingsFile, 'utf-8'));
        this.settings = { ...this.settings, ...data };
      } catch (e) {
        console.error('Failed to load settings file:', e);
      }
    }

    // Sync from OpenCode auth.json (~/.local/share/opencode/auth.json)
    const opencodeAuthPath = path.join(os.homedir(), '.local', 'share', 'opencode', 'auth.json');
    if (fs.existsSync(opencodeAuthPath)) {
      try {
        const authData = JSON.parse(fs.readFileSync(opencodeAuthPath, 'utf-8'));
        const apiKeys = { ...(this.settings.apiKeys || {}) };
        if (authData.opencode?.key && !apiKeys.opencode) apiKeys.opencode = authData.opencode.key;
        if (authData.openrouter?.key && !apiKeys.openrouter) apiKeys.openrouter = authData.openrouter.key;
        if (authData.groq?.key && !apiKeys.groq) apiKeys.groq = authData.groq.key;
        if (authData.cerebras?.key && !apiKeys.cerebras) apiKeys.cerebras = authData.cerebras.key;
        if (authData.google?.key && !apiKeys.gemini) apiKeys.gemini = authData.google.key;
        this.settings.apiKeys = apiKeys;
      } catch (e) {
        console.error('Failed to read OpenCode auth.json:', e);
      }
    }
  }

  public getSettings(): AppSettings {
    return this.settings;
  }

  public updateSettings(newSettings: Partial<AppSettings>): AppSettings {
    this.settings = { ...this.settings, ...newSettings };
    this.save();
    return this.settings;
  }

  private save(): void {
    try {
      if (!fs.existsSync(config.dataDir)) {
        fs.mkdirSync(config.dataDir, { recursive: true });
      }
      fs.writeFileSync(config.settingsFile, JSON.stringify(this.settings, null, 2));

      // Sync back to OpenCode auth.json (~/.local/share/opencode/auth.json)
      const opencodeAuthDir = path.join(os.homedir(), '.local', 'share', 'opencode');
      const opencodeAuthPath = path.join(opencodeAuthDir, 'auth.json');
      if (!fs.existsSync(opencodeAuthDir)) {
        fs.mkdirSync(opencodeAuthDir, { recursive: true });
      }
      let authData: any = {};
      if (fs.existsSync(opencodeAuthPath)) {
        try { authData = JSON.parse(fs.readFileSync(opencodeAuthPath, 'utf-8')); } catch (e) {}
      }
      const keys = this.settings.apiKeys || {};
      if (keys.opencode) authData.opencode = { type: 'api', key: keys.opencode };
      if (keys.openrouter) authData.openrouter = { type: 'api', key: keys.openrouter };
      if (keys.groq) authData.groq = { type: 'api', key: keys.groq };
      if (keys.cerebras) authData.cerebras = { type: 'api', key: keys.cerebras };
      if (keys.gemini) authData.google = { type: 'api', key: keys.gemini };
      fs.writeFileSync(opencodeAuthPath, JSON.stringify(authData, null, 2));
    } catch (e) {
      console.error('Failed to save settings file:', e);
    }
  }
}
