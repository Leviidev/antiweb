import { ChatSession, TerminalTab, FileNode, FileContentResponse, AppSettings } from '@antiweb/shared';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    credentials: 'include'
  });

  if (!res.ok) {
    let errMsg = `HTTP error ${res.status}`;
    try {
      const data = await res.json();
      if (data.error) errMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  return res.json();
}

export const api = {
  auth: {
    login: (password: string) =>
      request<{ success: boolean; csrfToken?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password })
      }),
    logout: () =>
      request<{ success: boolean }>('/auth/logout', { method: 'POST' }),
    status: () =>
      request<{ authenticated: boolean; csrfToken?: string }>('/auth/status')
  },
  models: {
    list: () => request<string[]>('/models')
  },
  sessions: {
    list: (search?: string, includeArchived?: boolean) => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (includeArchived) params.set('includeArchived', 'true');
      return request<ChatSession[]>(`/sessions?${params.toString()}`);
    },
    create: (title?: string, workspacePath?: string, model?: string) =>
      request<ChatSession>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ title, workspacePath, model })
      }),
    get: (id: string) => request<ChatSession>(`/sessions/${id}`),
    update: (id: string, updates: { title?: string; archived?: boolean; model?: string; workspacePath?: string }) =>
      request<ChatSession>(`/sessions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/sessions/${id}`, { method: 'DELETE' }),
    resume: (id: string, cols?: number, rows?: number) =>
      request<ChatSession>(`/sessions/${id}/resume`, {
        method: 'POST',
        body: JSON.stringify({ cols, rows })
      }),
    restart: (id: string, cols?: number, rows?: number) =>
      request<ChatSession>(`/sessions/${id}/restart`, {
        method: 'POST',
        body: JSON.stringify({ cols, rows })
      })
  },
  terminals: {
    list: () => request<TerminalTab[]>('/terminals'),
    create: (title?: string, cwd?: string) =>
      request<TerminalTab>('/terminals', {
        method: 'POST',
        body: JSON.stringify({ title, cwd })
      }),
    delete: (id: string) =>
      request<{ success: boolean }>(`/terminals/${id}`, { method: 'DELETE' })
  },
  files: {
    list: (path?: string) => {
      const p = path ? `?path=${encodeURIComponent(path)}` : '';
      return request<FileNode[]>(`/files/list${p}`);
    },
    read: (path: string) =>
      request<FileContentResponse>(`/files/read?path=${encodeURIComponent(path)}`),
    write: (path: string, content: string) =>
      request<{ success: boolean }>('/files/write', {
        method: 'POST',
        body: JSON.stringify({ path, content })
      })
  },
  settings: {
    get: () => request<AppSettings>('/settings'),
    update: (updates: Partial<AppSettings>) =>
      request<AppSettings>('/settings', {
        method: 'PATCH',
        body: JSON.stringify(updates)
      })
  },
  uploads: {
    list: () => request<any[]>('/uploads/list'),
    upload: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/uploads`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    },
    delete: (id: string) =>
      request<{ success: boolean }>(`/uploads/${id}`, { method: 'DELETE' })
  }
};
