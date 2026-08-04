import express from 'express';
import fs from 'fs';
import path from 'path';
import { jobsStore, acquireJobLock, releaseJobLock } from './extract.js';
import { downloadMedia } from '../utils/ytdlp.js';
import { findJobTempFile, deleteJobTempFile } from '../utils/cleanup.js';

const router = express.Router();
const sseClients = new Map(); // jobId -> Set of SSE response objects

/**
 * Helper to push progress updates to active SSE clients
 */
function broadcastJobProgress(jobId, data) {
  const clients = sseClients.get(jobId);
  if (clients) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      res.write(payload);
    }
  }
}

/**
 * GET /api/progress/:jobId
 * Server-Sent Events (SSE) endpoint to push real-time download status & speed
 */
router.get('/progress/:jobId', (req, res) => {
  const { jobId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients.has(jobId)) {
    sseClients.set(jobId, new Set());
  }
  sseClients.get(jobId).add(res);

  // Send current state if available
  if (jobsStore.has(jobId)) {
    const job = jobsStore.get(jobId);
    res.write(`data: ${JSON.stringify({
      percent: job.percent || 0,
      speed: job.speed || null,
      eta: job.eta || null,
      status: job.statusText || 'Initializing...',
      jobStatus: job.status
    })}\n\n`);
  }

  req.on('close', () => {
    const clients = sseClients.get(jobId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(jobId);
      }
    }
  });
});

/**
 * POST /api/download
 * Triggers yt-dlp file download into temp dir for specified format
 */
router.post('/download', async (req, res) => {
  const { jobId, formatId, url } = req.body;

  if (!jobId) {
    return res.status(400).json({ error: 'Missing jobId' });
  }

  let job;
  if (jobsStore.has(jobId)) {
    job = jobsStore.get(jobId);
  } else if (url) {
    const { fetchMetadata } = await import('../utils/ytdlp.js');
    try {
      const metadata = await fetchMetadata(url);
      job = {
        jobId,
        url,
        status: 'extracted',
        metadata,
        createdAt: Date.now()
      };
      jobsStore.set(jobId, job);
    } catch (e) {
      return res.status(404).json({ error: 'Job session expired. Please paste the URL again.' });
    }
  } else {
    return res.status(404).json({ error: 'Job session expired. Please paste the URL again.' });
  }

  // Acquire job lock
  if (!acquireJobLock(jobId)) {
    return res.status(429).json({ error: 'Another download task is currently active. Please wait.' });
  }

  const metadata = job.metadata;
  let targetFormat = null;

  if (metadata && metadata.formats) {
    targetFormat = metadata.formats.find(f => f.formatId === formatId);
  }

  // Find audio-only format to get expected byte size for progress weighting.
  // This is passed to downloadMedia so the video/audio progress split is
  // proportional to actual stream sizes rather than a fixed 85/10 ratio.
  const audioFormat = metadata && metadata.formats
    ? metadata.formats.find(f => f.isAudioOnly)
    : null;

  job.status = 'downloading';
  job.percent = 0;
  job.statusText = 'Starting download...';

  res.json({ message: 'Download initiated', jobId });

  try {
    await downloadMedia({
      url: job.url,
      formatId: formatId || 'best',
      hasAudio: targetFormat ? targetFormat.hasAudio : true,
      isAudioOnly: targetFormat ? targetFormat.isAudioOnly : false,
      resHeight: targetFormat ? targetFormat.resHeight : null,
      needsTranscode: targetFormat ? targetFormat.needsTranscode : false,
      videoBytes: targetFormat ? targetFormat.rawBytes : null,
      audioBytes: audioFormat ? audioFormat.rawBytes : null,
      jobId,
      onProgress: ({ percent, speed, eta, status }) => {
        job.percent = percent;
        job.speed = speed;
        job.eta = eta;
        job.statusText = status;

        broadcastJobProgress(jobId, {
          percent,
          speed,
          eta,
          status,
          jobStatus: 'downloading'
        });
      }
    });

    const downloadedFilePath = findJobTempFile(jobId);
    if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
      throw new Error('Downloaded file not found in temporary storage.');
    }

    job.status = 'ready';
    job.percent = 100;
    job.statusText = 'File ready for download';
    job.filePath = downloadedFilePath;

    broadcastJobProgress(jobId, {
      percent: 100,
      speed: null,
      eta: null,
      status: 'File ready!',
      jobStatus: 'ready',
      downloadUrl: `/api/file/${jobId}`
    });

    releaseJobLock(jobId);
  } catch (err) {
    console.error(`[Download Route Error] Job ${jobId}:`, err.message);
    job.status = 'error';
    job.error = err.message;
    job.statusText = err.message;

    broadcastJobProgress(jobId, {
      percent: 0,
      status: 'Download failed',
      error: err.message,
      jobStatus: 'error'
    });

    releaseJobLock(jobId);
    deleteJobTempFile(jobId);
  }
});

/**
 * GET /api/file/:jobId
 * Streams the downloaded temp file directly to client with attachment header, then cleans up.
 */
router.get('/file/:jobId', (req, res) => {
  const { jobId } = req.params;

  const filePath = findJobTempFile(jobId);

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(404).send('File not found or expired.');
  }

  const job = jobsStore.get(jobId);
  const ext = path.extname(filePath).toLowerCase();

  let mimeType = 'video/mp4';
  if (ext === '.webm') mimeType = 'video/webm';
  if (ext === '.mp3') mimeType = 'audio/mpeg';
  if (ext === '.m4a') mimeType = 'audio/mp4';

  const rawTitle = job && job.metadata ? job.metadata.title : 'ClipDrop_Video';
  const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 80) || 'ClipDrop_Video';
  const downloadFilename = `${cleanTitle}${ext}`;

  const stat = fs.statSync(filePath);

  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadFilename)}"`);

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  const cleanup = () => {
    deleteJobTempFile(jobId);
    jobsStore.delete(jobId);
  };

  res.on('finish', cleanup);
  res.on('close', cleanup);
  fileStream.on('error', (err) => {
    console.error(`[File Stream Error] Job ${jobId}:`, err);
    cleanup();
  });
});

export default router;
