import fs from 'fs';
import path from 'path';

export const DIRS = {
  root: process.cwd(),
  uploads: path.resolve(process.cwd(), 'cache', 'uploads'),
  thumbnails: path.resolve(process.cwd(), 'cache', 'thumbnails'),
  waveforms: path.resolve(process.cwd(), 'cache', 'waveforms'),
  proxies: path.resolve(process.cwd(), 'cache', 'proxies'),
  exports: path.resolve(process.cwd(), 'cache', 'exports'),
  projects: path.resolve(process.cwd(), 'projects'),
  autosave: path.resolve(process.cwd(), 'projects', 'autosave'),
  logs: path.resolve(process.cwd(), 'logs'),
};

export function ensureDirectories() {
  Object.values(DIRS).forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

export function getCacheStats() {
  ensureDirectories();
  const calculateDirSize = (dirPath: string): { count: number; bytes: number } => {
    if (!fs.existsSync(dirPath)) return { count: 0, bytes: 0 };
    const files = fs.readdirSync(dirPath);
    let totalBytes = 0;
    let count = 0;
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          totalBytes += stat.size;
          count++;
        }
      } catch {
        // ignore
      }
    }
    return { count, bytes: totalBytes };
  };

  const thumbnails = calculateDirSize(DIRS.thumbnails);
  const waveforms = calculateDirSize(DIRS.waveforms);
  const proxies = calculateDirSize(DIRS.proxies);
  const exportsStats = calculateDirSize(DIRS.exports);
  const uploads = calculateDirSize(DIRS.uploads);

  return {
    thumbnails,
    waveforms,
    proxies,
    exports: exportsStats,
    uploads,
    totalBytes:
      thumbnails.bytes +
      waveforms.bytes +
      proxies.bytes +
      exportsStats.bytes,
  };
}

export function clearCacheDirectories(includeUploads = false) {
  ensureDirectories();
  const targets = [DIRS.thumbnails, DIRS.waveforms, DIRS.proxies, DIRS.exports];
  if (includeUploads) {
    targets.push(DIRS.uploads);
  }
  let removedFiles = 0;
  let freedBytes = 0;

  for (const dir of targets) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) {
          freedBytes += stat.size;
          fs.unlinkSync(fullPath);
          removedFiles++;
        }
      } catch {
        // ignore
      }
    }
  }
  return { removedFiles, freedBytes };
}
