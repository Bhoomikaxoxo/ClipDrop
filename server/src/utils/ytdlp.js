import { spawn } from 'child_process';
import path from 'path';
import { TEMP_DIR } from './cleanup.js';

// Resolve binary path once at module initialization (warm path)
const YTDLP_BIN = process.env.YTDLP_PATH || 'yt-dlp';

// Strict Regex Allowlist for supported platforms
const INSTAGRAM_REGEX = /^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[A-Za-z0-9_-]+/;
const YOUTUBE_REGEX = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[A-Za-z0-9_-]+/;

/**
 * Validates whether the given URL matches supported Instagram or YouTube patterns.
 */
export function validateUrl(url) {
  if (!url || typeof url !== 'string') return { valid: false, platform: null };
  const cleanUrl = url.trim();
  if (INSTAGRAM_REGEX.test(cleanUrl)) {
    return { valid: true, platform: 'instagram', url: cleanUrl };
  }
  if (YOUTUBE_REGEX.test(cleanUrl)) {
    return { valid: true, platform: 'youtube', url: cleanUrl };
  }
  return { valid: false, platform: null };
}

/**
 * Codec check helpers for QuickTime compatibility (H.264 + AAC)
 */
function isH264(vcodec) {
  if (!vcodec || typeof vcodec !== 'string') return false;
  const lower = vcodec.toLowerCase();
  return lower.startsWith('avc') || lower.startsWith('h264') || lower.includes('avc1');
}

function isAAC(acodec) {
  if (!acodec || typeof acodec !== 'string') return false;
  const lower = acodec.toLowerCase();
  return lower.startsWith('mp4a') || lower.startsWith('aac');
}

/**
 * Formats seconds or duration string into clean MM:SS or HH:MM:SS format.
 */
function formatDuration(rawDuration, durationStr) {
  if (typeof durationStr === 'string' && /^\d+:\d{2}/.test(durationStr.trim())) {
    return durationStr.trim();
  }

  const seconds = typeof rawDuration === 'number' ? rawDuration : parseFloat(rawDuration);
  if (isNaN(seconds) || seconds <= 0) return null;

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats byte size into human readable string (MB/KB).
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return null;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Extracts full JSON metadata using `yt-dlp -J` with performance timeouts.
 * Prioritizes H.264 (avc1) + AAC (mp4a) formats for QuickTime compatibility.
 */
export function fetchMetadata(url) {
  return new Promise((resolve, reject) => {
    const { valid, platform, url: sanitizedUrl } = validateUrl(url);
    if (!valid) {
      return reject(new Error('Invalid or unsupported URL. Please paste an Instagram Reel or YouTube URL.'));
    }

    const args = [
      '-J',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificate',
      '--socket-timeout', '15',
      sanitizedUrl
    ];

    const child = spawn(YTDLP_BIN, args, { maxBuffer: 15 * 1024 * 1024 });
    let stdoutData = '';
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp is not installed or not found in system PATH on the server. Please install yt-dlp.'));
      } else {
        reject(err);
      }
    });

    child.on('close', (code) => {
      if (code !== 0) {
        let msg = 'Failed to extract video metadata.';
        if (stderrData.includes('cookies') || stderrData.includes('login') || stderrData.includes('Private')) {
          msg = 'Content is private or requires authentication cookies. Unable to extract.';
        } else if (stderrData.includes('429') || stderrData.includes('Too Many Requests')) {
          msg = 'Rate limited by platform. Please try again later.';
        } else if (platform === 'instagram') {
          msg = 'Instagram extraction failed. Instagram frequently updates their API — try updating yt-dlp on the server (`yt-dlp -U`).';
        }
        return reject(new Error(msg));
      }

      try {
        const rawJson = JSON.parse(stdoutData);
        const title = rawJson.title || rawJson.fulltitle || 'Untitled Video';
        const thumbnail = rawJson.thumbnail || (rawJson.thumbnails && rawJson.thumbnails.length ? rawJson.thumbnails[rawJson.thumbnails.length - 1].url : '');
        
        const durationSec = rawJson.duration || rawJson.length_seconds || 0;
        const duration = formatDuration(durationSec, rawJson.duration_string || rawJson.duration_str) || '0:45';

        // Parse and dedupe formats, preferring native H.264 + AAC
        const formatsList = [];
        const rawFormats = rawJson.formats || [];

        const heightMap = new Map();
        let bestAudioFormat = null;

        for (const fmt of rawFormats) {
          const vcodec = fmt.vcodec || 'none';
          const acodec = fmt.acodec || 'none';
          const height = fmt.height;
          const filesize = fmt.filesize || fmt.filesize_approx || null;

          // Track best audio format (prefer AAC/mp4a)
          if (vcodec === 'none' && acodec !== 'none') {
            const isNativeAudioAAC = isAAC(acodec);
            if (!bestAudioFormat || isNativeAudioAAC || (filesize && (!bestAudioFormat.filesize || filesize > bestAudioFormat.filesize))) {
              bestAudioFormat = {
                formatId: 'bestaudio',
                label: 'Audio Only (MP3/M4A)',
                resHeight: 0,
                ext: fmt.ext || 'm4a',
                filesizeApprox: formatBytes(filesize),
                rawBytes: filesize,
                hasAudio: true,
                isAudioOnly: true,
                vcodec: 'none',
                acodec,
                needsTranscode: !isNativeAudioAAC
              };
            }
          }

          // Process video formats
          if (vcodec !== 'none' && height && height >= 144) {
            const hasAudio = acodec !== 'none';
            const isNativeVideoH264 = isH264(vcodec);
            const isNativeAudioAAC = !hasAudio || isAAC(acodec);
            const isNativeH264AAC = isNativeVideoH264 && isNativeAudioAAC;
            const tbr = fmt.tbr || 0;

            const existing = heightMap.get(height);
            
            // Prefer native H.264+AAC format for this height even if slightly lower tbr
            if (!existing || (!existing.isNativeH264AAC && isNativeH264AAC) || (existing.isNativeH264AAC === isNativeH264AAC && tbr > existing.tbr)) {
              heightMap.set(height, {
                formatId: fmt.format_id,
                height,
                tbr,
                ext: fmt.ext || 'mp4',
                filesize,
                hasAudio,
                vcodec,
                acodec,
                isNativeH264AAC,
                needsTranscode: !isNativeH264AAC
              });
            }
          }
        }

        // Sort heights descending
        const sortedHeights = Array.from(heightMap.keys()).sort((a, b) => b - a);

        for (const h of sortedHeights) {
          const item = heightMap.get(h);
          formatsList.push({
            formatId: item.formatId,
            label: `${h}p`,
            resHeight: h,
            ext: item.ext,
            filesizeApprox: formatBytes(item.filesize),
            rawBytes: item.filesize,
            hasAudio: item.hasAudio,
            isAudioOnly: false,
            vcodec: item.vcodec,
            acodec: item.acodec,
            needsTranscode: item.needsTranscode
          });
        }

        // Add Audio Only if found
        if (bestAudioFormat) {
          formatsList.push(bestAudioFormat);
        }

        // Fallback option if formats array couldn't map resolutions
        if (formatsList.length === 0) {
          formatsList.push({
            formatId: 'best',
            label: 'Best Quality',
            resHeight: 1080,
            ext: 'mp4',
            filesizeApprox: null,
            hasAudio: true,
            isAudioOnly: false,
            vcodec: 'h264',
            acodec: 'aac',
            needsTranscode: false
          });
        }

        resolve({
          title,
          thumbnail,
          duration,
          durationSec,
          platform,
          url: sanitizedUrl,
          formats: formatsList
        });
      } catch (err) {
        reject(new Error(`Failed to parse yt-dlp metadata JSON output: ${err.message}`));
      }
    });
  });
}

/**
 * Downloads media file using child_process.spawn with yt-dlp and parses real-time progress.
 * Enforces H.264/AAC output for QuickTime & Safari compatibility with automatic FFmpegVideoConvertor transcode fallback.
 */
export function downloadMedia({ url, formatId, hasAudio, isAudioOnly, resHeight, needsTranscode, jobId, onProgress }) {
  return new Promise((resolve, reject) => {
    const { valid, url: sanitizedUrl } = validateUrl(url);
    if (!valid) {
      return reject(new Error('Invalid URL provided for download.'));
    }

    const outputTemplate = path.join(TEMP_DIR, `${jobId}.%(ext)s`);

    // Build format specifier preferring H.264 (avc1) + AAC (mp4a)
    let formatSpec;
    const targetHeight = resHeight || 720;

    if (isAudioOnly || formatId === 'bestaudio') {
      formatSpec = 'bestaudio[acodec^=mp4a]/bestaudio/best';
    } else if (formatId && formatId !== 'best') {
      // Preferred selector prioritizing H.264/AAC at target resolution
      formatSpec = `bestvideo[vcodec^=avc1][height<=${targetHeight}]+bestaudio[acodec^=mp4a]/bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]/${formatId}+bestaudio/best`;
    } else {
      formatSpec = `bestvideo[vcodec^=avc1][height<=1080]+bestaudio[acodec^=mp4a]/bestvideo+bestaudio/best`;
    }

    const args = [
      '-f', formatSpec,
      '--newline',
      '--no-playlist',
      '--no-check-certificate',
      '--socket-timeout', '30',
      '-o', outputTemplate,
      sanitizedUrl
    ];

    if (isAudioOnly || formatId === 'bestaudio') {
      args.push('-x', '--audio-format', 'mp3');
    } else if (needsTranscode) {
      // Fallback Strategy: VP9/AV1/Opus -> Explicit FFmpegVideoConvertor transcode to H.264/AAC
      console.log(`[Codec Strategy] Job ${jobId}: Transcoding VP9/AV1 to QuickTime H.264/AAC (libx264)`);
      args.push(
        '--recode-video', 'mp4',
        '--postprocessor-args', 'VideoConvertor:-c:v libx264 -preset fast -crf 20 -c:a aac -movflags +faststart',
        '--postprocessor-args', 'Merger:-c:v libx264 -preset fast -crf 20 -c:a aac -movflags +faststart',
        '--postprocessor-args', 'ffmpeg:-movflags +faststart'
      );
    } else {
      // Happy Path: Native H.264/AAC fast remux without re-encoding
      console.log(`[Codec Strategy] Job ${jobId}: Direct Fast Remux (Native H.264/AAC)`);
      args.push(
        '--merge-output-format', 'mp4',
        '--postprocessor-args', 'Merger:-c:v copy -c:a copy -movflags +faststart',
        '--postprocessor-args', 'ffmpeg:-movflags +faststart'
      );
    }

    const child = spawn(YTDLP_BIN, args);
    let stderrData = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      // Parse progress: [download]  45.6% of  12.34MiB at  2.45MiB/s ETA 00:03
      const percentMatch = text.match(/\[download\]\s+(\d+\.\d+)%/);
      const speedMatch = text.match(/at\s+([\d\.\w\/]+)/);
      const etaMatch = text.match(/ETA\s+([\d:]+)/);

      let percent = null;
      let speed = null;
      let eta = null;

      if (percentMatch) {
        percent = parseFloat(percentMatch[1]);
      }
      if (speedMatch) {
        speed = speedMatch[1];
      }
      if (etaMatch) {
        eta = etaMatch[1];
      }

      if (text.includes('[Merger]') || text.includes('[VideoConvertor]') || text.includes('[ffmpeg]')) {
        onProgress({ percent: 95, speed: 'Processing', eta: '00:01', status: 'Encoding & optimizing video for QuickTime playback...' });
      } else if (percent !== null) {
        onProgress({ percent: Math.min(percent, 94), speed, eta, status: 'Downloading video...' });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        let msg = 'Failed to download video file.';
        if (stderrData.includes('ffmpeg') && stderrData.includes('not found')) {
          msg = 'ffmpeg is required on the server to merge/transcode video streams. Please install ffmpeg.';
        } else if (stderrData.includes('cookies') || stderrData.includes('login')) {
          msg = 'Authentication required to download this video.';
        } else {
          msg += ' Run `yt-dlp -U` on server if this issue persists.';
        }
        return reject(new Error(msg));
      }
      resolve();
    });
  });
}
