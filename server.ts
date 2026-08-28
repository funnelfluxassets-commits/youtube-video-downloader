import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';
import { execFile, exec } from 'child_process';
import util from 'util';
import { initializeApp, cert } from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

const execFileAsync = util.promisify(execFile);
const execAsync = util.promisify(exec);

// Initialize Firebase Admin SDK if service account is provided
let db: Firestore | null = null;
try {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountEnv) {
    const serviceAccount = JSON.parse(serviceAccountEnv);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    initializeApp({
      credential: cert(serviceAccount),
    });
    db = getFirestore();
    console.log('--- Firebase Firestore: INITIALIZED ---');
  }
} catch (err: any) {
  console.warn('--- Firebase Firestore: using fallback store ---', err?.message);
}

const app = express();
app.use(express.json());

// ─── yt-dlp Binary Management ────────────────────────────────────────────────
// On Vercel: download yt-dlp to /tmp on cold-start (writable, ephemeral)
// Locally: use the system yt-dlp from PATH

const YTDLP_TMP_PATH = '/tmp/yt-dlp';
const YTDLP_DOWNLOAD_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

let ytdlpReadyPath: string | null = null;
let ytdlpSetupPromise: Promise<string> | null = null;

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading yt-dlp`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

async function ensureYtDlp(): Promise<string> {
  if (ytdlpReadyPath) return ytdlpReadyPath;
  if (ytdlpSetupPromise) return ytdlpSetupPromise;

  ytdlpSetupPromise = (async () => {
    // 1. Try system yt-dlp first (works locally with brew install yt-dlp)
    try {
      const { stdout } = await execAsync('yt-dlp --version', { timeout: 5000 });
      console.log('[yt-dlp] Using system yt-dlp', stdout.trim());
      ytdlpReadyPath = 'yt-dlp';
      return 'yt-dlp';
    } catch {
      console.log('[yt-dlp] System yt-dlp not found, setting up...');
    }

    // 2. Try /tmp/yt-dlp if already downloaded
    if (fs.existsSync(YTDLP_TMP_PATH)) {
      try {
        const { stdout } = await execFileAsync(YTDLP_TMP_PATH, ['--version'], { timeout: 15000 });
        console.log('[yt-dlp] Using cached /tmp/yt-dlp', stdout.trim());
        ytdlpReadyPath = YTDLP_TMP_PATH;
        return YTDLP_TMP_PATH;
      } catch {
        try { fs.unlinkSync(YTDLP_TMP_PATH); } catch {}
      }
    }

    // 3. Download yt-dlp to /tmp (Vercel's writable directory)
    console.log('[yt-dlp] Downloading yt-dlp to /tmp...');
    await downloadFile(YTDLP_DOWNLOAD_URL, YTDLP_TMP_PATH);
    fs.chmodSync(YTDLP_TMP_PATH, '755');

    const { stdout: version } = await execFileAsync(YTDLP_TMP_PATH, ['--version'], { timeout: 20000 });
    console.log('[yt-dlp] Downloaded & verified:', version.trim());
    ytdlpReadyPath = YTDLP_TMP_PATH;
    return YTDLP_TMP_PATH;
  })();

  return ytdlpSetupPromise;
}

// ─── FFmpeg Binary Management ────────────────────────────────────────────────
// Required for merging high-res video streams + audio streams into standard MP4s
const FFMPEG_TMP_PATH = '/tmp/ffmpeg';
const FFMPEG_LINUX_URL =
  'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-linux-x64.gz';

let ffmpegReadyPath: string | null = null;
let ffmpegSetupPromise: Promise<string> | null = null;

async function ensureFfmpeg(): Promise<string> {
  if (ffmpegReadyPath) return ffmpegReadyPath;
  if (ffmpegSetupPromise) return ffmpegSetupPromise;

  ffmpegSetupPromise = (async () => {
    // 1. Try system ffmpeg in PATH (works locally on Mac/Linux)
    try {
      await execAsync('ffmpeg -version', { timeout: 5000 });
      console.log('[ffmpeg] Using system ffmpeg');
      ffmpegReadyPath = 'ffmpeg';
      return 'ffmpeg';
    } catch {
      console.log('[ffmpeg] System ffmpeg not found, checking alternatives...');
    }

    // 2. Try ffmpeg-static package if installed
    try {
      const ffmpegStaticPkg = (await import('ffmpeg-static')).default;
      if (ffmpegStaticPkg && fs.existsSync(ffmpegStaticPkg)) {
        console.log('[ffmpeg] Using ffmpeg-static package path:', ffmpegStaticPkg);
        ffmpegReadyPath = ffmpegStaticPkg;
        return ffmpegStaticPkg;
      }
    } catch (e: any) {
      console.log('[ffmpeg] ffmpeg-static package check:', e?.message);
    }

    // 3. Try /tmp/ffmpeg if already cached
    if (fs.existsSync(FFMPEG_TMP_PATH)) {
      try {
        await execFileAsync(FFMPEG_TMP_PATH, ['-version'], { timeout: 5000 });
        console.log('[ffmpeg] Using cached /tmp/ffmpeg');
        ffmpegReadyPath = FFMPEG_TMP_PATH;
        return FFMPEG_TMP_PATH;
      } catch {
        try { fs.unlinkSync(FFMPEG_TMP_PATH); } catch {}
      }
    }

    // 4. Download and gunzip static ffmpeg to /tmp/ffmpeg (Vercel Linux x64)
    console.log('[ffmpeg] Downloading static ffmpeg to /tmp/ffmpeg...');
    const res = await fetch(FFMPEG_LINUX_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} downloading ffmpeg`);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const uncompressed = zlib.gunzipSync(buffer);
    fs.writeFileSync(FFMPEG_TMP_PATH, uncompressed);
    fs.chmodSync(FFMPEG_TMP_PATH, '755');

    await execFileAsync(FFMPEG_TMP_PATH, ['-version'], { timeout: 10000 });
    console.log('[ffmpeg] Downloaded & verified /tmp/ffmpeg');
    ffmpegReadyPath = FFMPEG_TMP_PATH;
    return FFMPEG_TMP_PATH;
  })();

  return ffmpegSetupPromise;
}

// ─── YouTube Cookies (bypass "sign in to confirm you're not a bot") ───────────
const COOKIES_PATH = '/tmp/yt-cookies.txt';
let cookiesWritten = false;

function ensureCookiesFile(): string[] {
  const cookiesEnv = process.env.YOUTUBE_COOKIES || process.env.COOKIES_TXT;
  if (!cookiesEnv) return [];

  try {
    if (!fs.existsSync(COOKIES_PATH) || fs.statSync(COOKIES_PATH).size === 0) {
      let content = cookiesEnv;
      if (!content.includes('\n')) {
        content = content.split('\\n').join('\n');
      }
      fs.writeFileSync(COOKIES_PATH, content, 'utf-8');
      console.log('[yt-dlp] YouTube cookies written to /tmp/yt-cookies.txt');
    }
    return ['--cookies', COOKIES_PATH];
  } catch (err: any) {
    console.warn('[yt-dlp] Failed to write cookies:', err?.message);
    return [];
  }
}

// Pre-warm yt-dlp and ffmpeg on startup so first download is fast
ensureYtDlp().catch((e) => console.warn('[yt-dlp] Setup warning:', e?.message));
ensureFfmpeg().catch((e) => console.warn('[ffmpeg] Setup warning:', e?.message));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/[\s_]+/g, '_')
    .trim()
    .slice(0, 120);
  return cleaned || 'youtube_download';
}

function parseYouTubeUrl(inputUrl: string): { videoId: string; isShorts: boolean; cleanUrl: string } | null {
  try {
    const trimmed = inputUrl.trim();
    const shortsMatch = trimmed.match(/(?:youtube\.com|youtu\.be)\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) {
      return { videoId: shortsMatch[1], isShorts: true, cleanUrl: `https://www.youtube.com/shorts/${shortsMatch[1]}` };
    }
    const watchMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
      return { videoId: watchMatch[1], isShorts: false, cleanUrl: `https://www.youtube.com/watch?v=${watchMatch[1]}` };
    }
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return { videoId: trimmed, isShorts: false, cleanUrl: `https://www.youtube.com/watch?v=${trimmed}` };
    }
    return null;
  } catch {
    return null;
  }
}

// ─── YouTube Extraction ───────────────────────────────────────────────────────

async function extractYouTubeMedia(targetUrl: string) {
  const parsed = parseYouTubeUrl(targetUrl);
  if (!parsed) throw new Error('Invalid YouTube URL. Please enter a valid YouTube video or Shorts link.');

  const { videoId, isShorts, cleanUrl } = parsed;

  let title = isShorts ? 'YouTube Shorts Video' : 'YouTube Video';
  let authorName = 'YouTube Creator';
  let authorUrl = 'https://www.youtube.com';
  const maxResThumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  const hqThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      if (oembed.title) title = oembed.title;
      if (oembed.author_name) authorName = oembed.author_name;
      if (oembed.author_url) authorUrl = oembed.author_url;
    }
  } catch { /* non-fatal */ }

  const downloads: any[] = [
    { id: 'yt_4k_2160p',   label: '4K Ultra HD (2160p)',           quality: '2160', description: 'Maximum resolution 4K Ultra HD video with audio',    badge: '4K ULTRA HD',  type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_2k_1440p',   label: '2K Quad HD (1440p)',            quality: '1440', description: '1440p QHD format for large screens with audio',       badge: '2K QHD',       type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_1080p_fhd',  label: '1080p Full HD (Recommended)',   quality: '1080', description: 'Crystal-clear 1080p Full HD MP4 with crisp audio',    badge: '1080p FULL HD', type: 'video', url: videoId, extension: 'mp4', recommend: true  },
    { id: 'yt_720p_hd',    label: '720p HD (Fast Download)',       quality: '720',  description: 'Standard HD MP4 with audio — fast to save and share', badge: '720p HD',      type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_360p_sd',    label: '360p Standard MP4',             quality: '360',  description: 'Compact file size with audio for quick messaging',    badge: 'Standard MP4', type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_audio_mp3',  label: 'Download Audio (MP3)',          quality: 'audio', description: 'Extract speech, song or soundtrack as 320kbps MP3',  badge: 'MP3 AUDIO',    type: 'audio', url: videoId, extension: 'mp3', recommend: false },
    { id: 'yt_thumbnail',  label: 'Download HD Thumbnail Cover',   quality: 'thumb', description: 'Full-resolution video artwork image in JPG',         badge: 'HD IMAGE',     type: 'thumbnail', url: maxResThumbnail, extension: 'jpg', recommend: false },
  ];

  return {
    id: videoId,
    title,
    duration: 0,
    durationFormatted: isShorts ? 'Shorts' : 'HD Video',
    cover: maxResThumbnail,
    originCover: hqThumbnail,
    author: { name: authorName, username: authorName.replace(/[^\w]/g, '').toLowerCase(), channelUrl: authorUrl },
    stats: { views: 0, likes: 0 },
    isShorts,
    aspectRatio: isShorts ? ('9:16' as const) : ('16:9' as const),
    downloads,
    originalUrl: cleanUrl,
    extractedAt: Date.now(),
  };
}

// ─── API: /api/debug — Diagnostic endpoint ──────────────────────────────────

app.get('/api/debug', async (req, res) => {
  const info: any = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cwd: process.cwd(),
    tmpExists: fs.existsSync('/tmp'),
    ytdlpTmpExists: fs.existsSync(YTDLP_TMP_PATH),
    ytdlpReadyPath,
    ffmpegTmpExists: fs.existsSync(FFMPEG_TMP_PATH),
    ffmpegReadyPath,
  };

  try {
    const bin = await ensureYtDlp();
    info.ytdlpBin = bin;
    const { stdout } = await execFileAsync(bin, ['--version'], { timeout: 15000 });
    info.ytdlpVersion = stdout.trim();
  } catch (e: any) {
    info.ytdlpError = e?.message?.slice(0, 300);
    info.ytdlpStderr = e?.stderr?.slice(0, 300);
  }

  try {
    const ffBin = await ensureFfmpeg();
    info.ffmpegBin = ffBin;
    const { stdout } = await execFileAsync(ffBin, ['-version'], { timeout: 10000 });
    info.ffmpegVersion = stdout.trim().split('\n')[0];
  } catch (e: any) {
    info.ffmpegError = e?.message?.slice(0, 300);
  }

  // Test stream extraction with video ID
  const testId = (req.query.id as string) || '0FnBozdvWg8';
  const cookieArgs = ensureCookiesFile();
  info.hasCookies = cookieArgs.length > 0;
  info.cookiesEnvSet = !!process.env.YOUTUBE_COOKIES;

  if (info.ytdlpBin) {
    try {
      const { stdout, stderr } = await execFileAsync(
        info.ytdlpBin,
        [
          '-g',
          '-f',
          'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best',
          '--no-playlist',
          '--js-runtimes',
          'node',
          ...cookieArgs,
          `https://www.youtube.com/watch?v=${testId}`,
        ],
        { timeout: 30000 }
      );
      info.testStreamUrl = stdout.trim().split('\n')[0]?.slice(0, 100) + '...';
      info.testStderr = stderr?.slice(0, 200);
      info.testSuccess = true;
    } catch (e: any) {
      info.testSuccess = false;
      info.testError = e?.message?.slice(0, 300);
      info.testStderr = e?.stderr?.slice(0, 300);
    }
  }

  return res.json(info);
});

// ─── API: /api/extract ────────────────────────────────────────────────────────

app.post('/api/extract', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'Please provide a valid YouTube video or Shorts link.' });
    }
    const result = await extractYouTubeMedia(url.trim());
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('YouTube extraction error:', err);
    return res.status(400).json({ success: false, error: err?.message || 'Failed to extract YouTube video.' });
  }
});

// ─── API: /api/proxy-download ────────────────────────────────────────────────
// Streams binary MP4 (merged video+audio) / MP3 / JPG directly to browser Downloads folder

app.get('/api/proxy-download', async (req, res) => {
  try {
    const { url, id, quality, type, filename, ext } = req.query;

    const safeFilename = sanitizeFilename(typeof filename === 'string' ? filename : 'youtube_media');
    let fileExt = typeof ext === 'string' ? ext.replace('.', '').toLowerCase() : 'mp4';

    // ── 1. Thumbnail download ──────────────────────────────────────────────────
    if (type === 'thumbnail' || (typeof url === 'string' && url.includes('ytimg.com'))) {
      const thumbUrl = typeof url === 'string' ? url.trim() : '';
      if (!thumbUrl) return res.status(400).json({ error: 'Missing thumbnail URL.' });

      const imgRes = await fetch(thumbUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.youtube.com/' },
      });
      if (!imgRes.ok) return res.status(404).json({ error: 'Thumbnail not found.' });

      const buffer = await imgRes.arrayBuffer();
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.jpg"`);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Length', String(buffer.byteLength));
      return res.end(Buffer.from(buffer));
    }

    // ── 2. Video / Audio download via yt-dlp + ffmpeg muxing ──────────────────
    const videoId =
      typeof id === 'string' && id.trim()
        ? id.trim()
        : typeof url === 'string'
        ? parseYouTubeUrl(url)?.videoId ?? ''
        : '';

    if (!videoId) return res.status(400).json({ error: 'Missing video identifier.' });

    const isAudio = type === 'audio' || fileExt === 'mp3';
    const qualityStr = typeof quality === 'string' ? quality : '1080';
    if (isAudio) fileExt = 'mp3';

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Ensure yt-dlp and ffmpeg are ready
    let ytdlpBin: string;
    let ffmpegBin: string;
    try {
      const [yt, ff] = await Promise.all([
        Promise.race([
          ensureYtDlp(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('yt-dlp setup timeout')), 50000)),
        ]),
        Promise.race([
          ensureFfmpeg(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ffmpeg setup timeout')), 50000)),
        ]),
      ]);
      ytdlpBin = yt;
      ffmpegBin = ff;
    } catch (setupErr: any) {
      console.error('[setup] Failed:', setupErr?.message);
      return res.status(503).json({ error: 'Download engine is initialising. Please try again in 15 seconds.' });
    }

    const cookieArgs = ensureCookiesFile();
    const tempFileId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tmpFile = path.join('/tmp', tempFileId);

    // Build format and arguments for yt-dlp
    let ytdlpArgs: string[];
    if (isAudio) {
      ytdlpArgs = [
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '0',
        '--ffmpeg-location', ffmpegBin,
        '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        '--add-header', 'Referer:https://www.youtube.com/',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--extractor-args', 'youtube:player_client=android,web',
        '-o', tmpFile,
        '--no-playlist',
        '--js-runtimes', 'node',
        ...cookieArgs,
        ytUrl,
      ];
    } else {
      const isShortsVideo =
        req.query.isShorts === '1' ||
        (typeof url === 'string' && parseYouTubeUrl(url)?.isShorts) ||
        (typeof id === 'string' && false);

      const qNum = parseInt(qualityStr, 10) || 1080;
      let maxHeight: number;
      let maxWidth: number;

      if (isShortsVideo) {
        // Vertical video / Shorts (9:16)
        const verticalMap: Record<number, { h: number; w: number }> = {
          2160: { h: 3840, w: 2160 },
          1440: { h: 2560, w: 1440 },
          1080: { h: 1920, w: 1080 },
          720:  { h: 1280, w: 720 },
          480:  { h: 854,  w: 480 },
          360:  { h: 640,  w: 360 },
        };
        const target = verticalMap[qNum] || { h: Math.round((qNum * 16) / 9), w: qNum };
        maxHeight = target.h;
        maxWidth = target.w;
      } else {
        // Horizontal video (16:9)
        const horizontalMap: Record<number, { h: number; w: number }> = {
          2160: { h: 2160, w: 3840 },
          1440: { h: 1440, w: 2560 },
          1080: { h: 1080, w: 1920 },
          720:  { h: 720,  w: 1280 },
          480:  { h: 480,  w: 854 },
          360:  { h: 360,  w: 640 },
        };
        const target = horizontalMap[qNum] || { h: qNum, w: Math.round((qNum * 16) / 9) };
        maxHeight = target.h;
        maxWidth = target.w;
      }

      const h264Vid = `bestvideo[vcodec^=avc][height<=${maxHeight}][width<=${maxWidth}]`;
      const fallbackVid = `bestvideo[height<=${maxHeight}][width<=${maxWidth}]`;
      const format = `${h264Vid}+bestaudio[acodec^=mp4a]/${h264Vid}+bestaudio/${fallbackVid}+bestaudio/best`;

      ytdlpArgs = [
        '-f', format,
        '--merge-output-format', 'mp4',
        '--ffmpeg-location', ffmpegBin,
        '--postprocessor-args', 'ffmpeg:-movflags +faststart',
        '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        '--add-header', 'Referer:https://www.youtube.com/',
        '--add-header', 'Accept-Language:en-US,en;q=0.9',
        '--extractor-args', 'youtube:player_client=android,web',
        '-o', tmpFile,
        '--no-playlist',
        '--js-runtimes', 'node',
        ...cookieArgs,
        ytUrl,
      ];
    }

    console.log('[yt-dlp] Downloading & muxing:', ytdlpArgs.join(' '));
    try {
      await execFileAsync(ytdlpBin, ytdlpArgs, { timeout: 50000 });
    } catch (execErr: any) {
      const errDetail = (execErr?.stderr || execErr?.message || 'unknown error').slice(0, 300);
      console.error('[yt-dlp] Exec error:', errDetail);
      return res.status(500).json({ error: 'Could not process media download.', detail: errDetail });
    }

    let actualFile = tmpFile;
    if (!fs.existsSync(actualFile)) {
      if (fs.existsSync(`${tmpFile}.mp3`)) actualFile = `${tmpFile}.mp3`;
      else if (fs.existsSync(`${tmpFile}.mp4`)) actualFile = `${tmpFile}.mp4`;
      else if (fs.existsSync(path.join('/tmp', `${tempFileId}.mp3`))) actualFile = path.join('/tmp', `${tempFileId}.mp3`);
      else if (fs.existsSync(path.join('/tmp', `${tempFileId}.mp4`))) actualFile = path.join('/tmp', `${tempFileId}.mp4`);
    }

    // Verify output file exists and is not empty
    if (!fs.existsSync(actualFile)) {
      return res.status(500).json({ error: 'Failed to generate media file.' });
    }

    const stat = fs.statSync(actualFile);
    if (stat.size === 0) {
      try { fs.unlinkSync(actualFile); } catch {}
      return res.status(500).json({ error: 'Generated file is empty.' });
    }

    const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.${fileExt}"`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(stat.size));
    res.setHeader('Cache-Control', 'no-cache');

    const readStream = fs.createReadStream(actualFile);
    readStream.pipe(res);

    const cleanup = () => {
      try {
        if (fs.existsSync(actualFile)) fs.unlinkSync(actualFile);
        if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
        if (fs.existsSync(`${tmpFile}.mp3`)) fs.unlinkSync(`${tmpFile}.mp3`);
        if (fs.existsSync(`${tmpFile}.mp4`)) fs.unlinkSync(`${tmpFile}.mp4`);
      } catch {}
    };

    res.on('finish', cleanup);
    res.on('close', cleanup);
    readStream.on('error', (err) => {
      console.error('[stream] File read error:', err);
      cleanup();
      if (!res.headersSent) res.status(500).json({ error: 'Stream interrupted.' });
    });
  } catch (err: any) {
    console.error('Download proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream media file.' });
    }
  }
});

// ─── Signup Notification System ───────────────────────────────────────────────
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'funnelflux.assets@gmail.com';

async function sendSignupNotification(params: {
  appName: string;
  email: string;
  name?: string;
  req?: express.Request;
}) {
  const { appName, email, name, req } = params;
  const userName = name || email.split('@')[0];
  const dateStr = new Date().toUTCString();

  const country = (req?.headers['x-vercel-ip-country'] as string) || (req?.headers['cf-ipcountry'] as string) || 'Global';
  const city = (req?.headers['x-vercel-ip-city'] as string) || '';
  const locationStr = city ? `${city}, ${country}` : String(country);
  const userAgent = (req?.headers['user-agent'] as string) || '';

  let deviceType = 'Desktop';
  if (/iPhone|iPad|iPod/i.test(userAgent)) deviceType = 'Apple iOS (iPhone/iPad)';
  else if (/Android/i.test(userAgent)) deviceType = 'Android Mobile';
  else if (/Macintosh|Mac OS X/i.test(userAgent)) deviceType = 'Apple Mac';
  else if (/Windows/i.test(userAgent)) deviceType = 'Windows PC';

  console.log(`[Notification] 🚀 New Signup on ${appName}: ${email} (${userName}) from ${locationStr} [${deviceType}]`);

  // 1. Resend Transactional Email (Free 3,000 emails/month)
  const resendApiKey = process.env.RESEND_API_KEY;
  if (resendApiKey) {
    try {
      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e4e4e7; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #dc2626, #991b1b); padding: 24px 32px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">🚀 New User Registered</h2>
            <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">${appName} • ${dateStr}</p>
          </div>
          <div style="padding: 24px 32px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; color: #71717a; font-size: 13px; font-weight: 600; width: 130px;">Full Name</td>
                <td style="padding: 10px 0; color: #18181b; font-size: 14px; font-weight: 700;">${userName}</td>
              </tr>
              <tr style="border-top: 1px solid #f4f4f5;">
                <td style="padding: 10px 0; color: #71717a; font-size: 13px; font-weight: 600;">Email Address</td>
                <td style="padding: 10px 0; color: #18181b; font-size: 14px; font-weight: 700;"><a href="mailto:${email}" style="color: #dc2626; text-decoration: none;">${email}</a></td>
              </tr>
              <tr style="border-top: 1px solid #f4f4f5;">
                <td style="padding: 10px 0; color: #71717a; font-size: 13px; font-weight: 600;">Application</td>
                <td style="padding: 10px 0; color: #dc2626; font-size: 14px; font-weight: 700;">${appName}</td>
              </tr>
              <tr style="border-top: 1px solid #f4f4f5;">
                <td style="padding: 10px 0; color: #71717a; font-size: 13px; font-weight: 600;">Location</td>
                <td style="padding: 10px 0; color: #18181b; font-size: 14px;">${locationStr}</td>
              </tr>
              <tr style="border-top: 1px solid #f4f4f5;">
                <td style="padding: 10px 0; color: #71717a; font-size: 13px; font-weight: 600;">Device / OS</td>
                <td style="padding: 10px 0; color: #18181b; font-size: 14px;">${deviceType}</td>
              </tr>
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="https://console.firebase.google.com" style="display: inline-block; background: #18181b; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-size: 13px; font-weight: 600;">Open Firebase Dashboard →</a>
            </div>
          </div>
        </div>
      `;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${appName} <onboarding@resend.dev>`,
          to: [NOTIFICATION_EMAIL],
          subject: `🚀 New User: ${userName} on ${appName}`,
          html: htmlBody,
        }),
      });
      console.log(`[Notification] Email notification dispatched to ${NOTIFICATION_EMAIL}`);
    } catch (e: any) {
      console.warn('[Notification] Resend email error:', e?.message);
    }
  }

  // 2. Webhook Notification (Discord / Slack / Formspree)
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `🚀 **New User Registered on ${appName}!**\n👤 **Name:** ${userName}\n✉️ **Email:** ${email}\n🌍 **Location:** ${locationStr}\n💻 **Device:** ${deviceType}\n⏰ **Time:** ${dateStr}`,
        }),
      });
    } catch (e: any) {
      console.warn('[Notification] Webhook error:', e?.message);
    }
  }
}

// ─── Auth APIs ────────────────────────────────────────────────────────────────

const inMemoryUsers = new Map<string, any>();

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    const now = Date.now();
    const userData = { email: cleanEmail, name: cleanName, createdAt: now, lastLoginAt: now };

    let isNewUser = false;
    if (db) {
      try {
        const ref = db.collection('users').doc(cleanEmail);
        const doc = await ref.get();
        if (!doc.exists) {
          await ref.set(userData);
          isNewUser = true;
        } else {
          await ref.update({ lastLoginAt: now, ...(cleanName ? { name: cleanName } : {}) });
        }
      } catch { /* non-fatal */ }
    } else {
      if (!inMemoryUsers.has(cleanEmail)) isNewUser = true;
    }
    inMemoryUsers.set(cleanEmail, userData);

    if (isNewUser) {
      sendSignupNotification({ appName: 'TubeDownloader', email: cleanEmail, name: cleanName, req }).catch(() => {});
    }

    return res.json({ success: true, user: { email: cleanEmail, name: cleanName, createdAt: now } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Failed to process account.' });
  }
});

app.get('/api/auth/verify', async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'Email parameter required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    if (db) {
      try {
        const doc = await db.collection('users').doc(cleanEmail).get();
        if (doc.exists) {
          const data = doc.data();
          return res.json({ success: true, user: { email: cleanEmail, name: data?.name, createdAt: data?.createdAt } });
        }
      } catch { /* non-fatal */ }
    }
    const local = inMemoryUsers.get(cleanEmail);
    if (local) return res.json({ success: true, user: local });
    return res.json({ success: true, user: { email: cleanEmail, createdAt: Date.now() } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Verification failed.' });
  }
});

// ─── Local Dev Server ─────────────────────────────────────────────────────────

if (!process.env.VERCEL) {
  const bootstrap = async () => {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, r) => r.sendFile(path.join(distPath, 'index.html')));
    }
    const PORT = process.env.PORT || 3000;
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`TubeDownloader Server on http://0.0.0.0:${PORT}`);
    });
  };
  bootstrap();
}

export default app;
