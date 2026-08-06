import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { extractVideo } from '../utils/cobalt.js';
import { fetchMetadata } from '../utils/ytdlp.js';

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
 * Validates supported platforms (YouTube, Instagram)
 */
function parsePlatform(url) {
  if (!url || typeof url !== 'string') return { valid: false };
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return { valid: true, platform: 'youtube' };
  if (lower.includes('instagram.com')) return { valid: true, platform: 'instagram' };
  return { valid: true, platform: 'video' };
}

/**
 * POST /api/extract
 * Extracts video info using Cobalt API and returns format options.
 */
router.post('/extract', async (req, res) => {
  const { url } = req.body;

  const { valid, platform } = parsePlatform(url);
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
    const cobaltResult = await extractVideo(url, { quality: '1080' });

    // ── Path A: Cobalt succeeded ────────────────────────────────────────────
    if (cobaltResult.success) {
      const title = cobaltResult.filename
        ? cobaltResult.filename.replace(/\.[^/.]+$/, '').replace(/_/g, ' ')
        : 'ClipDrop Video';

      const formats = [
        { formatId: '1080', label: '1080p', resHeight: 1080, ext: 'mp4', hasAudio: true, isAudioOnly: false },
        { formatId: '720',  label: '720p',  resHeight: 720,  ext: 'mp4', hasAudio: true, isAudioOnly: false },
        { formatId: '480',  label: '480p',  resHeight: 480,  ext: 'mp4', hasAudio: true, isAudioOnly: false },
        { formatId: '360',  label: '360p',  resHeight: 360,  ext: 'mp4', hasAudio: true, isAudioOnly: false },
        { formatId: 'bestaudio', label: 'Audio Only (MP3)', resHeight: 0, ext: 'mp3', hasAudio: true, isAudioOnly: true }
      ];

      const metadata = {
        title,
        thumbnail: '',
        duration: '0:45',
        platform,
        url,
        formats,
        cobaltResult
      };

      jobRecord.status = 'extracted';
      jobRecord.metadata = metadata;
      jobRecord.statusText = 'Metadata ready';
      releaseJobLock(jobId);

      return res.json({
        jobId,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        duration: metadata.duration,
        platform: metadata.platform,
        formats: metadata.formats
      });
    }

    // ── Path B: Cobalt failed — fall back to local yt-dlp ──────────────────
    console.warn(`[Extract] Cobalt failed (${cobaltResult.error}) — falling back to local yt-dlp`);

    const ytdlpMeta = await fetchMetadata(url);

    jobRecord.status = 'extracted';
    jobRecord.metadata = { ...ytdlpMeta, url };
    jobRecord.statusText = 'Metadata ready';
    releaseJobLock(jobId);

    return res.json({
      jobId,
      title: ytdlpMeta.title,
      thumbnail: ytdlpMeta.thumbnail,
      duration: ytdlpMeta.duration,
      platform: ytdlpMeta.platform,
      formats: ytdlpMeta.formats
    });

  } catch (err) {
    jobRecord.status = 'error';
    jobRecord.error = err.message;
    releaseJobLock(jobId);
    return res.status(500).json({ error: err.message || 'Failed to extract video metadata.' });
  }

});

export default router;
