import fs from 'fs';
import path from 'path';
import { FileNode, FileContentResponse } from '@antiweb/shared';

const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', 'dist', '.data', 'out', 'coverage', '.gemini']);
const MAX_FILE_READ_SIZE = 5 * 1024 * 1024; // 5MB

export class FilesystemService {
  public listDirectory(dirPath: string): FileNode[] {
    const targetPath = path.resolve(dirPath);
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isDirectory()) {
      throw new Error(`Invalid directory path: ${dirPath}`);
    }

    try {
      const items = fs.readdirSync(targetPath, { withFileTypes: true });
      const nodes: FileNode[] = [];

      for (const item of items) {
        if (item.name.startsWith('.') && item.name !== '.env.example') continue;
        if (item.isDirectory() && IGNORED_DIRS.has(item.name)) continue;

        const fullPath = path.join(targetPath, item.name);
        let size: number | undefined;
        let isDir = item.isDirectory();

        if (!isDir && item.isFile()) {
          try {
            const stat = fs.statSync(fullPath);
            size = stat.size;
          } catch (e) {
            // Permission or broken symlink
            continue;
          }
        }

        nodes.push({
          name: item.name,
          path: fullPath,
          isDirectory: isDir,
          size,
          extension: isDir ? undefined : path.extname(item.name).slice(1)
        });
      }

      return nodes.sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
          return a.name.localeCompare(b.name);
        }
        return a.isDirectory ? -1 : 1;
      });
    } catch (err) {
      console.error(`Error reading directory ${dirPath}:`, err);
      throw new Error(`Failed to list directory: ${(err as Error).message}`);
    }
  }

  public readFile(filePath: string): FileContentResponse {
    const targetPath = path.resolve(filePath);
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = fs.statSync(targetPath);
    if (stat.size > MAX_FILE_READ_SIZE) {
      throw new Error(`File too large to display (${Math.round(stat.size / 1024 / 1024)}MB). Max read size is 5MB.`);
    }

    try {
      const content = fs.readFileSync(targetPath, 'utf-8');
      return {
        path: targetPath,
        content,
        size: stat.size
      };
    } catch (err) {
      throw new Error(`Failed to read file: ${(err as Error).message}`);
    }
  }

  // Structured for future file editing capability
  public writeFile(filePath: string, content: string): void {
    const targetPath = path.resolve(filePath);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, content, 'utf-8');
  }
}
