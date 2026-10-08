import fs from 'fs';
import path from 'path';

export type LogSeverity = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface LogEntry {
  timestamp: string;
  severity: LogSeverity;
  operation: string;
  message: string;
  technicalDetails?: string;
}

const LOGS_DIR = path.resolve(process.cwd(), 'logs');
const APP_LOG_PATH = path.join(LOGS_DIR, 'app.log');
const FFMPEG_LOG_PATH = path.join(LOGS_DIR, 'ffmpeg.log');
const MAX_LOG_SIZE_BYTES = 5 * 1024 * 1024; // 5MB rotation

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function rotateLogIfNeeded(filePath: string) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > MAX_LOG_SIZE_BYTES) {
        const backupPath = `${filePath}.1`;
        if (fs.existsSync(backupPath)) {
          fs.unlinkSync(backupPath);
        }
        fs.renameSync(filePath, backupPath);
      }
    }
  } catch {
    // Ignore rotation errors
  }
}

export function logApp(
  severity: LogSeverity,
  operation: string,
  message: string,
  technicalDetails?: string
) {
  ensureLogsDir();
  rotateLogIfNeeded(APP_LOG_PATH);
  const timestamp = new Date().toISOString();
  const detailStr = technicalDetails ? ` | Details: ${technicalDetails.replace(/\n/g, ' ')}` : '';
  const line = `[${timestamp}] [${severity}] [${operation}] ${message}${detailStr}\n`;
  try {
    fs.appendFileSync(APP_LOG_PATH, line, 'utf-8');
  } catch {
    // Fallback if disk write fails
  }
}

export function logFFmpeg(
  severity: LogSeverity,
  operation: string,
  commandOrMessage: string,
  outputDetails?: string
) {
  ensureLogsDir();
  rotateLogIfNeeded(FFMPEG_LOG_PATH);
  const timestamp = new Date().toISOString();
  const detailStr = outputDetails ? `\n--- OUTPUT ---\n${outputDetails}\n--------------` : '';
  const line = `[${timestamp}] [${severity}] [${operation}] ${commandOrMessage}${detailStr}\n`;
  try {
    fs.appendFileSync(FFMPEG_LOG_PATH, line, 'utf-8');
  } catch {
    // Fallback
  }
}

export function getRecentLogs(type: 'app' | 'ffmpeg' = 'app', maxLines = 150): string {
  ensureLogsDir();
  const target = type === 'ffmpeg' ? FFMPEG_LOG_PATH : APP_LOG_PATH;
  if (!fs.existsSync(target)) {
    return `[${new Date().toISOString()}] [INFO] [System] Log file initialized (${type}.log).`;
  }
  try {
    const content = fs.readFileSync(target, 'utf-8');
    const lines = content.trim().split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch (err: any) {
    return `Error reading log file: ${err?.message || String(err)}`;
  }
}
