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
 * Formats seconds into human readable text like "5 sec", "1 min 15 sec", "2 hr 5 min"
 */
function formatSecondsToHuman(totalSeconds) {
  if (totalSeconds <= 1) return '< 5 sec';
  if (totalSeconds < 60) return `${totalSeconds} sec`;

  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hrs > 0) {
    return `${hrs} hr ${mins} min`;
  }
  if (secs > 0) {
    return `${mins} min ${secs} sec`;
  }
  return `${mins} min`;
}

/**
 * Parses raw yt-dlp ETA string or dynamically estimates remaining download time based on progress speed.
 */
function parseAndFormatEta(rawEta, percent, startTime) {
  // Post-processing / remux phase — handled by caller, just say "a few seconds"
  if (percent >= 90) {
    return 'a few seconds';
  }

  // 1. Parse yt-dlp's raw ETA string (e.g., "00:05", "01:23", "01:05:30")
  if (typeof rawEta === 'string' && rawEta.trim() && rawEta !== 'Unknown') {
    const parts = rawEta.trim().split(':').map(p => parseInt(p, 10));
    if (parts.every(p => !isNaN(p))) {
      let seconds = 0;
      if (parts.length === 3) {
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) {
        seconds = parts[0] * 60 + parts[1];
      } else if (parts.length === 1) {
        seconds = parts[0];
      }

      if (seconds >= 0) {
        return formatSecondsToHuman(seconds);
      }
    }
  }

  // 2. Dynamic estimation fallback based on progress velocity
  if (typeof percent === 'number' && percent > 1 && percent < 90 && startTime) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > 500) {
      const remainingPercent = 100 - percent;
      const msPerPercent = elapsedMs / percent;
      const estimatedRemainingSec = Math.round((remainingPercent * msPerPercent) / 1000);
      if (estimatedRemainingSec >= 0) {
        return formatSecondsToHuman(estimatedRemainingSec);
      }
    }
  }

  return 'Calculating...';
}

/**
 * Extracts full JSON metadata using `yt-dlp -J` with performance timeouts.
 * Prioritizes H.264 (avc1) + AAC (mp4a) formats for QuickTime compatibility.
 */
/**
 * Helper to resolve cookies.txt path from project root or YTDLP_COOKIES environment variable.
 */
function getCookiesPath() {
  const localCookies = path.join(process.cwd(), 'cookies.txt');
  if (fs.existsSync(localCookies)) return localCookies;

  const serverCookies = path.join(process.cwd(), 'server', 'cookies.txt');
  if (fs.existsSync(serverCookies)) return serverCookies;

  if (process.env.YTDLP_COOKIES) {
    const tmpCookies = path.join(TEMP_DIR, 'render_cookies.txt');
    try {
      fs.writeFileSync(tmpCookies, process.env.YTDLP_COOKIES, 'utf8');
      return tmpCookies;
    } catch (e) {
      console.error('Failed to write YTDLP_COOKIES env var to file:', e);
    }
  }
  return null;
}

export function fetchMetadata(url) {
  return new Promise((resolve, reject) => {
    const { valid, platform, url: sanitizedUrl } = validateUrl(url);
    if (!valid) {
      return reject(new Error('Invalid or unsupported URL. Please paste an Instagram Reel or YouTube URL.'));
    }

    const cookiesPath = getCookiesPath();

    const args = [
      '-J',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificate',
      '--socket-timeout', '20',
      '--extractor-args', 'youtube:player_client=android_vr,tv_embedded',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    ];

    if (cookiesPath) {
      args.push('--cookies', cookiesPath);
    }

    args.push(sanitizedUrl);

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
        const stderrSnippet = stderrData.trim().slice(-300);
        let msg = `Extraction error (${stderrSnippet || 'yt-dlp exit code ' + code})`;
        if (stderrData.includes('429') || stderrData.includes('Too Many Requests')) {
          msg = `Rate limited by platform (${stderrSnippet})`;
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
          const width = fmt.width;
          const height = fmt.height;
          const filesize = fmt.filesize || fmt.filesize_approx || null;

          // Compute standard resolution indicator (min of width & height for vertical/horizontal videos)
          let effectiveRes = height;
          if (width && height) {
            effectiveRes = Math.min(width, height);
          }

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

          // Process video formats — capped at 1080p max
          if (vcodec !== 'none' && effectiveRes && effectiveRes >= 144 && effectiveRes <= 1080) {
            const hasAudio = acodec !== 'none';
            const isNativeVideoH264 = isH264(vcodec);
            const isNativeAudioAAC = !hasAudio || isAAC(acodec);
            const isNativeH264AAC = isNativeVideoH264 && isNativeAudioAAC;
            const tbr = fmt.tbr || 0;

            const existing = heightMap.get(effectiveRes);

            // Prefer native H.264+AAC format for this resolution even if slightly lower tbr
            if (!existing || (!existing.isNativeH264AAC && isNativeH264AAC) || (existing.isNativeH264AAC === isNativeH264AAC && tbr > existing.tbr)) {
              heightMap.set(effectiveRes, {
                formatId: fmt.format_id,
                height: effectiveRes,
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

        // Sort heights descending (1080p, 720p, 480p, 360p...)
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
            formatId: 'best[height<=1080]',
            label: '1080p',
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
 *
 * Key design decisions:
 * - `formatId` MUST be the raw yt-dlp format_id (itag string from -F output, e.g. "271" or "137"),
 *   NOT a resolution label like "2160p". Passing a height-based label lets yt-dlp reapply its
 *   default preference logic and silently pick a different resolution — reintroducing Bug 1.
 * - Uses --remux-video mp4 with `-c:v copy -c:a aac` so video is stream-copied (zero quality
 *   loss, no CPU) while audio is always transcoded to AAC. This handles both cases:
 *   · mp4a (AAC) audio → trivial AAC→AAC passthrough, ~instant, no quality change
 *   · Opus audio (always present on 4K YouTube) → proper AAC transcode; without this
 *     --remux-video mp4 fails outright because Opus-in-MP4 isn't broadly supported.
 * - Tracks video + audio DASH streams using yt-dlp's "[download] Destination:" boundary
 *   lines (reliable) instead of percent-drop heuristics (fragile). Progress is weighted
 *   by actual expected bytes per stream so ETA is accurate throughout both phases.
 * @param {string}   videoBytes  Expected video stream bytes (from metadata rawBytes)
 * @param {string}   audioBytes  Expected audio stream bytes (from metadata audio format rawBytes)
 */
export function downloadMedia({ url, formatId, hasAudio, isAudioOnly, resHeight, needsTranscode, jobId, onProgress, videoBytes, audioBytes }) {
  return new Promise((resolve, reject) => {
    const { valid, url: sanitizedUrl } = validateUrl(url);
    if (!valid) {
      return reject(new Error('Invalid URL provided for download.'));
    }

    const outputTemplate = path.join(TEMP_DIR, `${jobId}.%(ext)s`);

    // ── Format Selection ────────────────────────────────────────────────────
    // Pin the EXACT format ID the user selected from the metadata list.
    // YouTube 4K/1440p is always VP9 or AV1 — there is no H.264 at those
    // resolutions. The old selector fell back silently to a lower H.264 res.
    let formatSpec;

    if (isAudioOnly || formatId === 'bestaudio') {
      // Audio: prefer AAC/M4A for broadest compatibility
      formatSpec = 'bestaudio[acodec^=mp4a]/bestaudio[ext=m4a]/bestaudio';
    } else if (formatId && formatId !== 'best') {
      // Video: use the exact format_id from metadata + best compatible audio.
      // Fallback chain: (exact video + AAC audio) → (exact video + any audio) → exact format alone
      formatSpec = `${formatId}+bestaudio[acodec^=mp4a]/${formatId}+bestaudio/${formatId}`;
    } else {
      // Generic best capped at 1080p
      formatSpec = 'bestvideo[height<=1080][vcodec^=avc1]+bestaudio[acodec^=mp4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]';
    }

    const cookiesPath = getCookiesPath();

    const args = [
      '-f', formatSpec,
      '--newline',           // One progress line per stdout write — essential for parsing
      '--no-playlist',
      '--no-check-certificate',
      '--socket-timeout', '30',
      '--concurrent-fragments', '4',  // Parallel fragment downloads for faster speeds
      '--extractor-args', 'youtube:player_client=android_vr,tv_embedded',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    ];

    if (cookiesPath) {
      args.push('--cookies', cookiesPath);
    }

    args.push('-o', outputTemplate, sanitizedUrl);

    if (isAudioOnly || formatId === 'bestaudio') {
      // Extract audio and convert to MP3
      args.push('-x', '--audio-format', 'mp3');

    } else if (needsTranscode) {
      // ── VP9 / AV1 source → H.264 encode at Merger step ────────────────────
      // QuickTime and Safari do NOT support VP9 or AV1 in MP4 containers.
      //
      // Encoder flags:
      // - On macOS (`process.platform === 'darwin'`): uses Apple `h264_videotoolbox` hardware
      //   acceleration with bitrate targeting (`-b:v 16M` for 4K, `12M` for 1440p, `8M` for 1080p).
      //   Note: VideoToolbox rejects `-q:v` flags, so `-b:v` is required.
      // - On Linux/Windows: falls back to `libx264 -preset superfast -crf 20`.
      let targetBitrate = '12M';
      if (resHeight && resHeight >= 2160) targetBitrate = '16M';
      else if (resHeight && resHeight >= 1440) targetBitrate = '12M';
      else if (resHeight && resHeight >= 1080) targetBitrate = '8M';
      else targetBitrate = '5M';

      const isMac = process.platform === 'darwin';
      const videoCodecFlags = isMac
        ? `-c:v h264_videotoolbox -b:v ${targetBitrate}`
        : `-c:v libx264 -preset superfast -crf 20`;

      console.log(`[Codec] Job ${jobId}: VP9/AV1 → H.264 (${videoCodecFlags}) at Merger step (${resHeight || 'auto'}p)`);
      args.push(
        '--merge-output-format', 'mp4',
        '--postprocessor-args', `Merger:${videoCodecFlags} -c:a aac -b:a 192k -movflags +faststart`
      );

    } else {
      // ── H.264 source → stream-copy video, AAC audio ──────────────────────
      // Video is already H.264 → stream-copy is instant, zero quality loss.
      // Audio: still -c:a aac in case the audio side is Opus (can happen for
      // some H.264-video formats that YouTube serves with Opus audio tracks).
      console.log(`[Codec] Job ${jobId}: H.264 stream copy at Merger step (${resHeight}p)`);
      args.push(
        '--merge-output-format', 'mp4',
        '--postprocessor-args', 'Merger:-c:v copy -c:a aac -b:a 192k -movflags +faststart'
      );
    }

    console.log(`[yt-dlp] Job ${jobId}: format="${formatSpec}" height=${resHeight || 'auto'}`);

    const child = spawn(YTDLP_BIN, args);
    let stderrData = '';
    const startTime = Date.now();

    // ── Dual-Stream Progress Tracking ────────────────────────────────────────
    // yt-dlp downloads video then audio as separate DASH streams. Each resets
    // percent to 0. We detect the boundary using yt-dlp's own "[download]
    // Destination:" lines (printed once per stream, before its first % line) —
    // this is reliable; percent-drop heuristics are not.
    //
    // Progress is weighted by actual expected stream bytes so the ETA is honest
    // throughout both phases. 4K VP9 video is typically 15-20x the audio size,
    // so a fixed 75/15 split would make video-phase ETA lie badly near 75%.
    // We use rawBytes from metadata; fall back to 85/10 if sizes are unknown.
    const totalBytes = (videoBytes || 0) + (audioBytes || 0);
    const videoWeight = totalBytes > 0
      ? (videoBytes || 0) / totalBytes   // e.g. 0.94 for a typical 4K stream
      : 0.85;                             // fallback: assume video is ~85% of total
    const audioWeight = totalBytes > 0
      ? (audioBytes || 0) / totalBytes
      : 0.10;                             // fallback: audio ~10%
    // Map both streams into the 0–90% display band (90–100% = remux)
    const videoEnd  = videoWeight * 90;   // e.g. ~84.6% for a 0.94 weight
    const audioEnd  = 90;                 // audio fills up to 90%

    let streamIndex = 0;   // 0 = video, 1 = audio
    let lastRawEta  = null;
    let lastSpeed   = null;

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();

      // ── Stream boundary detection ─────────────────────────────────────────
      // yt-dlp prints "[download] Destination: <path>" exactly once per stream,
      // before that stream's first progress line. This is the canonical boundary.
      if (text.includes('[download] Destination:') && streamIndex === 0) {
        // First Destination line: starting video stream (index stays 0)
        // We only bump on subsequent Destination lines.
      } else if (text.includes('[download] Destination:') && streamIndex >= 0) {
        streamIndex += 1;  // Subsequent Destination = new stream (audio, then merge tmp etc.)
      }

      const speedMatch   = text.match(/at\s+([\d.]+\w+\/s)/);
      const etaMatch     = text.match(/ETA\s+([\d:]+)/);
      if (speedMatch) lastSpeed  = speedMatch[1];
      if (etaMatch)   lastRawEta = etaMatch[1];

      // ── Post-processing phase (remux / audio transcode) ───────────────────
      if (text.includes('[Merger]') || text.includes('[VideoConvertor]') ||
          text.includes('[ffmpeg]') || text.includes('[ExtractAudio]')) {
        onProgress({
          percent: 92,
          speed: 'Remuxing',
          eta: 'a few seconds',
          status: isAudioOnly ? 'Converting to MP3...' : 'Remuxing into MP4...'
        });
        return;
      }

      // ── Per-stream progress line ──────────────────────────────────────────
      const percentMatch = text.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (percentMatch) {
        const rawPercent = parseFloat(percentMatch[1]);

        // Map raw stream percent into the unified display band
        let unified;
        if (streamIndex === 0) {
          // Video stream: 0–100% maps to 0–videoEnd%
          unified = rawPercent * videoEnd / 100;
        } else {
          // Audio stream: 0–100% maps to videoEnd–audioEnd%
          unified = videoEnd + (rawPercent * (audioEnd - videoEnd) / 100);
        }

        const formattedEta = parseAndFormatEta(lastRawEta, unified, startTime);
        onProgress({
          percent: Math.min(parseFloat(unified.toFixed(1)), 90),
          speed: lastSpeed,
          eta: formattedEta,
          status: streamIndex === 0 ? 'Downloading video stream...' : 'Downloading audio stream...'
        });
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
          msg = 'ffmpeg is required on the server to remux video streams. Please install ffmpeg.';
        } else if (stderrData.includes('h264_videotoolbox') || stderrData.includes('Unknown encoder')) {
          msg = 'VideoToolbox H.264 encoder not available. Ensure you are running on macOS with a recent ffmpeg build (brew install ffmpeg).';
        } else if (stderrData.includes('cookies') || stderrData.includes('login')) {
          msg = 'Authentication required to download this video.';
        } else if (stderrData.includes('Requested format is not available')) {
          msg = 'The selected quality is not available for this video. Please try a different resolution.';
        } else {
          msg += ' Run `yt-dlp -U` on server if this issue persists.';
        }
        console.error(`[yt-dlp] Job ${jobId} failed (code ${code}):`, stderrData.slice(-500));
        return reject(new Error(msg));
      }
      resolve();
    });
  });
}

