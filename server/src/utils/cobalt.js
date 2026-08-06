import fetch from 'node-fetch';

/**
 * Cobalt API Extraction Utility
 * Replaces local yt-dlp/ffmpeg execution with Cobalt API requests.
 *
 * Docs: https://cobalt.tools
 */

// Default list of Cobalt API instances (supports custom URL or API key via ENV)
const DEFAULT_INSTANCES = [
  process.env.COBALT_API_URL,
  'https://api.cobalt.tools/',
  'https://co.wuk.sh/',
  'https://cobalt.api.sc7.io/'
].filter(Boolean);

/**
 * Normalizes quality strings to Cobalt's expected videoQuality format
 * @param {string} quality 
 * @returns {string} Cobalt quality parameter ("max", "2160", "1440", "1080", "720", "480", "360")
 */
function normalizeQuality(quality) {
  if (!quality || quality === 'best' || quality === 'max') return '1080';
  const numeric = String(quality).replace(/[^0-9]/g, '');
  if (['2160', '1440', '1080', '720', '480', '360', '240', '144'].includes(numeric)) {
    return numeric;
  }
  return '1080';
}

/**
 * Sends a POST request to Cobalt API to extract direct media download links.
 * 
 * @param {string} url - Target video/reel URL (YouTube, Instagram, etc.)
 * @param {Object} options - Extraction options ({ quality, isAudioOnly })
 * @returns {Promise<Object>} Normalized result object
 */
export async function extractVideo(url, options = {}) {
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      error: 'Invalid or missing URL provided.'
    };
  }

  const isAudioOnly = Boolean(options.isAudioOnly || options.formatId === 'bestaudio');
  const videoQuality = normalizeQuality(options.quality || options.formatId);

  const payload = {
    url,
    videoQuality,
    audioFormat: 'mp3',
    filenamePattern: 'basic'
  };

  if (isAudioOnly) {
    payload.downloadMode = 'audio';
  }

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'ClipDrop/1.0'
  };

  if (process.env.COBALT_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.COBALT_API_KEY}`;
  }

  let lastError = null;

  for (const instanceUrl of DEFAULT_INSTANCES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(instanceUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        lastError = 'Cobalt API rate limit reached. Please try again in a few moments.';
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        lastError = `Cobalt API returned status ${response.status}: ${errorText.slice(0, 200)}`;
        continue;
      }

      const data = await response.json();

      // Parse Cobalt API response variants
      if (data.status === 'tunnel' || data.status === 'redirect') {
        return {
          success: true,
          downloadUrl: data.url,
          filename: data.filename || 'download.mp4',
          quality: videoQuality,
          isAudioOnly,
          picker: null,
          error: null
        };
      }

      if (data.status === 'picker') {
        // Multi-item / multi-quality picker mode
        const items = data.picker || [];
        const matchedItem = items.find(i => i.quality === videoQuality) || items[0];

        return {
          success: true,
          downloadUrl: matchedItem ? matchedItem.url : null,
          filename: data.filename || 'download.mp4',
          quality: matchedItem?.quality || videoQuality,
          isAudioOnly,
          picker: items,
          error: null
        };
      }

      if (data.status === 'audio') {
        return {
          success: true,
          downloadUrl: data.url,
          filename: data.filename || 'audio.mp3',
          quality: 'audio',
          isAudioOnly: true,
          picker: null,
          error: null
        };
      }

      if (data.status === 'error') {
        const errCode = data.error?.code || 'error.cobalt.unknown';
        lastError = parseCobaltErrorCode(errCode);
        continue;
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        lastError = 'Cobalt API request timed out.';
      } else {
        lastError = err.message || 'Network error connecting to Cobalt API.';
      }
    }
  }

  return {
    success: false,
    downloadUrl: null,
    filename: null,
    quality: videoQuality,
    error: lastError || 'Failed to extract video using Cobalt API instances.'
  };
}

/**
 * Maps Cobalt error codes to user-friendly messages
 */
function parseCobaltErrorCode(code) {
  switch (code) {
    case 'error.api.auth.jwt.missing':
      return 'Cobalt API instance requires authentication API key (set COBALT_API_KEY env var).';
    case 'error.api.link.invalid':
      return 'The link provided is invalid or unsupported.';
    case 'error.api.youtube.login':
    case 'error.api.content.private':
      return 'The video is private or requires account login.';
    case 'error.api.rate_limit':
      return 'Rate limited by platform. Please wait a few seconds and try again.';
    default:
      return `Extraction failed (${code})`;
  }
}
