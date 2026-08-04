import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEMP_DIR = path.resolve(__dirname, '../../temp');

// Ensure temp directory exists
export function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    console.log(`[ClipDrop Cleanup] Created temp directory: ${TEMP_DIR}`);
  }
}

// Delete specific file for job ID
export function deleteJobTempFile(jobId) {
  try {
    ensureTempDir();
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      if (file.startsWith(jobId)) {
        const filePath = path.join(TEMP_DIR, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[ClipDrop Cleanup] Deleted temp file: ${filePath}`);
        }
      }
    }
  } catch (err) {
    console.error(`[ClipDrop Cleanup] Error deleting file for job ${jobId}:`, err);
  }
}

// Find actual filepath for a jobId
export function findJobTempFile(jobId) {
  try {
    ensureTempDir();
    const files = fs.readdirSync(TEMP_DIR);
    const matched = files.find(file => file.startsWith(jobId));
    if (matched) {
      return path.join(TEMP_DIR, matched);
    }
    return null;
  } catch (err) {
    console.error(`[ClipDrop Cleanup] Error finding file for job ${jobId}:`, err);
    return null;
  }
}

// Interval cleanup for files older than maxAgeMs (default: 15 minutes)
export function startPeriodicCleanup(intervalMs = 5 * 60 * 1000, maxAgeMs = 15 * 60 * 1000) {
  ensureTempDir();
  setInterval(() => {
    try {
      const now = Date.now();
      const files = fs.readdirSync(TEMP_DIR);
      for (const file of files) {
        if (file === '.gitkeep') continue;
        const filePath = path.join(TEMP_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
          console.log(`[ClipDrop Cleanup] Removed stale temp file: ${file}`);
        }
      }
    } catch (err) {
      console.error('[ClipDrop Cleanup] Error during periodic cleanup:', err);
    }
  }, intervalMs);
}
