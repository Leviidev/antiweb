import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0',
  password: process.env.PASSWORD || 'antigravity',
  cookieSecret: process.env.COOKIE_SECRET || 'antiweb_default_secure_cookie_secret_key_change_me',
  agyCommand: process.env.AGY_COMMAND || 'agy',
  dataDir: path.join(__dirname, '../../.data'),
  uploadsDir: path.join(__dirname, '../../.data/uploads'),
  sessionsDir: path.join(__dirname, '../../.data/sessions'),
  settingsFile: path.join(__dirname, '../../.data/settings.json')
};
