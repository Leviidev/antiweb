export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  extension?: string;
  children?: FileNode[];
}

export interface FileContentResponse {
  path: string;
  content: string;
  size: number;
}
