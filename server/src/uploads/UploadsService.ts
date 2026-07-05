import fs from 'fs';
import path from 'path';
import { config } from '../config';

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  url: string;
  localPath: string;
  size: number;
  mimetype: string;
  uploadedAt: string;
}

export class UploadsService {
  private metadataFile: string;
  private uploads: Map<string, UploadedFile> = new Map();

  constructor() {
    if (!fs.existsSync(config.uploadsDir)) {
      fs.mkdirSync(config.uploadsDir, { recursive: true });
    }
    this.metadataFile = path.join(config.uploadsDir, 'metadata.json');
    this.loadMetadata();
  }

  private loadMetadata(): void {
    if (fs.existsSync(this.metadataFile)) {
      try {
        const list: UploadedFile[] = JSON.parse(fs.readFileSync(this.metadataFile, 'utf-8'));
        list.forEach(item => this.uploads.set(item.id, item));
      } catch (e) {
        console.error('Failed to load upload metadata:', e);
      }
    }
  }

  private saveMetadata(): void {
    try {
      const list = Array.from(this.uploads.values());
      fs.writeFileSync(this.metadataFile, JSON.stringify(list, null, 2));
    } catch (e) {
      console.error('Failed to save upload metadata:', e);
    }
  }

  public async saveUpload(
    buffer: Buffer,
    originalName: string,
    mimetype: string
  ): Promise<UploadedFile> {
    const id = `up_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const ext = path.extname(originalName) || '';
    const filename = `${id}${ext}`;
    const localPath = path.join(config.uploadsDir, filename);

    fs.writeFileSync(localPath, buffer);

    const uploadedFile: UploadedFile = {
      id,
      filename,
      originalName,
      url: `/api/uploads/file/${filename}`,
      localPath,
      size: buffer.length,
      mimetype,
      uploadedAt: new Date().toISOString()
    };

    this.uploads.set(id, uploadedFile);
    this.saveMetadata();
    return uploadedFile;
  }

  public getFile(filename: string): { path: string; mimetype: string; originalName: string } | null {
    const item = Array.from(this.uploads.values()).find(u => u.filename === filename);
    if (!item) return null;
    if (!fs.existsSync(item.localPath)) return null;
    return {
      path: item.localPath,
      mimetype: item.mimetype,
      originalName: item.originalName
    };
  }

  public listUploads(): UploadedFile[] {
    return Array.from(this.uploads.values()).sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
  }

  public deleteUpload(id: string): boolean {
    const item = this.uploads.get(id);
    if (!item) return false;
    if (fs.existsSync(item.localPath)) {
      fs.unlinkSync(item.localPath);
    }
    this.uploads.delete(id);
    this.saveMetadata();
    return true;
  }
}
