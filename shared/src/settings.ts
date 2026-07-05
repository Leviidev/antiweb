export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  defaultWorkspacePath: string;
  terminalFontSize: number;
  terminalFontFamily: string;
  agyCommand: string;
  apiKeys?: {
    opencode?: string;
    openrouter?: string;
    gemini?: string;
    openai?: string;
    anthropic?: string;
    groq?: string;
    cerebras?: string;
    github?: string;
    ollama?: string;
  };
}
