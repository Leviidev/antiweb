import crypto from 'crypto';
import { config } from '../config';

interface ActiveSession {
  token: string;
  createdAt: number;
}

export class AuthService {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private csrfTokens: Set<string> = new Set();

  public verifyPassword(password: string): boolean {
    // Constant-time comparison to prevent timing attacks
    const expected = Buffer.from(config.password, 'utf-8');
    const provided = Buffer.from(password, 'utf-8');
    if (expected.length !== provided.length) {
      return false;
    }
    return crypto.timingSafeEqual(expected, provided);
  }

  public createSession(): { sessionToken: string; csrfToken: string } {
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const csrfToken = crypto.randomBytes(32).toString('hex');

    this.activeSessions.set(sessionToken, {
      token: sessionToken,
      createdAt: Date.now()
    });
    this.csrfTokens.add(csrfToken);

    return { sessionToken, csrfToken };
  }

  public isValidSession(sessionToken?: string): boolean {
    if (!sessionToken) return false;
    return this.activeSessions.has(sessionToken);
  }

  public isValidCsrf(csrfToken?: string): boolean {
    if (!csrfToken) return false;
    return this.csrfTokens.has(csrfToken);
  }

  public destroySession(sessionToken?: string): void {
    if (sessionToken) {
      this.activeSessions.delete(sessionToken);
    }
  }

  public getNewCsrfToken(): string {
    const csrfToken = crypto.randomBytes(32).toString('hex');
    this.csrfTokens.add(csrfToken);
    return csrfToken;
  }
}
