import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fetchMetadata, validateUrl } from '../utils/ytdlp.js';

const router = express.Router();

// Shared In-Memory Jobs Store & Lock
export const jobsStore = new Map(); // jobId -> { status, percent, speed, eta, metadata, createdAt, filePath }
let activeLockJobId = null;

export function acquireJobLock(jobId) {
  if (activeLockJobId && jobsStore.has(activeLockJobId)) {
    const activeJob = jobsStore.get(activeLockJobId);
    if (activeJob.status === 'extracting' || activeJob.status === 'downloading') {
      return false; // Lock busy
    }
  }
  activeLockJobId = jobId;
  return true;
}

export function releaseJobLock(jobId) {
  if (activeLockJobId === jobId) {
    activeLockJobId = null;
  }
}

/**
 * POST /api/extract
 * Validates URL, acquires lock, extracts metadata with formats list, and returns unified jobId.
 */
router.post('/extract', async (req, res) => {
  const { url } = req.body;

  const { valid, platform } = validateUrl(url);
  if (!valid) {
    return res.status(400).json({
      error: 'Invalid or unsupported URL. Please paste a valid Instagram Reel or YouTube URL.'
    });
  }

  const jobId = uuidv4();

  // Check job lock
  if (!acquireJobLock(jobId)) {
    return res.status(429).json({
      error: 'Another extraction or download is currently in progress. Please wait a moment.'
    });
  }

  // Create initial job record
  const jobRecord = {
    jobId,
    url,
    platform,
    status: 'extracting',
    percent: 0,
    speed: null,
    eta: null,
    statusText: 'Extracting video metadata...',
    createdAt: Date.now()
  };
  jobsStore.set(jobId, jobRecord);

  try {
    const metadata = await fetchMetadata(url);
    jobRecord.status = 'extracted';
    jobRecord.metadata = metadata;
    jobRecord.statusText = 'Metadata ready';
    releaseJobLock(jobId);

    return res.json({
      jobId,
      title: metadata.title,
      thumbnail: metadata.thumbnail,
      duration: metadata.duration,
      durationSec: metadata.durationSec,
      platform: metadata.platform,
      formats: metadata.formats
    });
  } catch (err) {
    jobRecord.status = 'error';
    jobRecord.error = err.message;
    releaseJobLock(jobId);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
