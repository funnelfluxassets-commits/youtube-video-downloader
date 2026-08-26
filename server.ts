import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
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
// MUST use yt-dlp_linux (standalone binary) NOT yt-dlp (Python ZIP).
// The standalone binary bundles Python + all deps inside (~38MB).
// The Python ZIP only works if Python 3.10+ is installed (Vercel Lambda has no Python).
const YTDLP_DOWNLOAD_URL =
  'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';

let ytdlpReadyPath: string | null = null;
let ytdlpSetupPromise: Promise<string> | null = null;

async function downloadFile(url: string, dest: string): Promise<void> {
  // fetch() automatically follows all redirects (GitHub uses 301→302→200)
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
        fs.unlinkSync(YTDLP_TMP_PATH);
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

// ─── YouTube Cookies (bypass "sign in to confirm you're not a bot") ───────────
// YouTube blocks datacenter IPs. Providing browser cookies proves it's a real session.
const COOKIES_PATH = '/tmp/yt-cookies.txt';
let cookiesWritten = false;

function ensureCookiesFile(): string[] {
  const cookiesEnv = process.env.YOUTUBE_COOKIES;
  if (!cookiesEnv) return [];

  try {
    // Always write fresh on each Lambda cold start
    if (!cookiesWritten) {
      // Handle both real newlines and escaped \n from env var
      let content = cookiesEnv;
      if (!content.includes('\n')) {
        // Env var has literal backslash-n, convert to real newlines
        content = content.split('\\n').join('\n');
      }
      fs.writeFileSync(COOKIES_PATH, content, 'utf-8');
      cookiesWritten = true;
      const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
      console.log('[yt-dlp] Cookies written:', COOKIES_PATH, '- data lines:', lines, 'size:', content.length);
    }
    return ['--cookies', COOKIES_PATH];
  } catch (err: any) {
    console.warn('[yt-dlp] Failed to write cookies:', err?.message);
    return [];
  }
}

// Pre-warm yt-dlp on startup so first download is fast
ensureYtDlp().catch((e) => console.warn('[yt-dlp] Setup warning:', e?.message));

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
    { id: 'yt_4k_2160p',   label: '4K Ultra HD (2160p)',           quality: '2160', description: 'Maximum resolution 4K Ultra HD video',               badge: '4K ULTRA HD',  type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_2k_1440p',   label: '2K Quad HD (1440p)',            quality: '1440', description: '1440p QHD format for large screens',                  badge: '2K QHD',       type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_1080p_fhd',  label: '1080p Full HD (Recommended)',   quality: '1080', description: 'Crystal-clear 1080p Full HD MP4 video',               badge: '1080p FULL HD', type: 'video', url: videoId, extension: 'mp4', recommend: true  },
    { id: 'yt_720p_hd',    label: '720p HD (Fast Download)',       quality: '720',  description: 'Standard HD MP4 — fast to save and share',            badge: '720p HD',      type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_360p_sd',    label: '360p Standard MP4',             quality: '360',  description: 'Compact file size for quick messaging',               badge: 'Standard MP4', type: 'video', url: videoId, extension: 'mp4', recommend: false },
    { id: 'yt_audio_mp3',  label: 'Download Audio (MP3)',          quality: 'audio', description: 'Extract speech, song or soundtrack as MP3',          badge: 'MP3 AUDIO',    type: 'audio', url: videoId, extension: 'mp3', recommend: false },
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

  // Test stream URL extraction if video ID provided
  const testId = (req.query.id as string) || '0FnBozdvWg8';
  const cookieArgs = ensureCookiesFile();
  info.hasCookies = cookieArgs.length > 0;
  info.cookiesEnvSet = !!process.env.YOUTUBE_COOKIES;
  if (info.ytdlpBin) {
    try {
      const { stdout, stderr } = await execFileAsync(
        info.ytdlpBin,
        ['-g', '-f', 'bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]', '--no-playlist', '--js-runtimes', 'node',
         ...cookieArgs,
         `https://www.youtube.com/watch?v=${testId}`],
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
// Streams binary MP4/MP3/JPG directly to browser Downloads folder

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

    // ── 2. Video / Audio download via yt-dlp ──────────────────────────────────
    const videoId =
      (typeof id === 'string' && id.trim()) ? id.trim() :
      (typeof url === 'string' ? parseYouTubeUrl(url)?.videoId ?? '' : '');

    if (!videoId) return res.status(400).json({ error: 'Missing video identifier.' });

    const isAudio = type === 'audio' || fileExt === 'mp3';
    const qualityStr = typeof quality === 'string' ? quality : '1080';

    // Build yt-dlp format selector
    let formatSelector: string;
    if (isAudio) {
      formatSelector = 'bestaudio[ext=m4a]/bestaudio';
      fileExt = 'mp3';
    } else if (qualityStr === '2160') {
      formatSelector = 'bestvideo[height<=2160][ext=mp4]/bestvideo[height<=2160]';
    } else if (qualityStr === '1440') {
      formatSelector = 'bestvideo[height<=1440][ext=mp4]/bestvideo[height<=1440]';
    } else if (qualityStr === '1080') {
      formatSelector = 'bestvideo[height<=1080][ext=mp4]/bestvideo[height<=1080]';
    } else if (qualityStr === '720') {
      formatSelector = 'bestvideo[height<=720][ext=mp4]/bestvideo[height<=720]';
    } else {
      formatSelector = 'bestvideo[height<=480][ext=mp4]/bestvideo[height<=480]';
    }

    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Get yt-dlp binary (downloads it to /tmp on Vercel cold start)
    let ytdlpBin: string;
    try {
      ytdlpBin = await Promise.race([
        ensureYtDlp(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('yt-dlp setup timeout')), 50000)),
      ]);
    } catch (setupErr: any) {
      console.error('[yt-dlp] Setup failed:', setupErr?.message);
      return res.status(503).json({ error: 'Download service is starting up. Please wait 30 seconds and try again.' });
    }

    // Resolve direct GoogleVideo CDN stream URL
    let directStreamUrl = '';
    let lastError = '';
    const cookieArgs = ensureCookiesFile();
    try {
      const { stdout } = await execFileAsync(
        ytdlpBin,
        ['-g', '-f', formatSelector, '--no-playlist', '--js-runtimes', 'node', ...cookieArgs, ytUrl],
        { timeout: 30000 }
      );
      directStreamUrl = stdout.trim().split('\n')[0].trim();
      console.log('[yt-dlp] Resolved stream URL for', videoId, qualityStr);
    } catch (execErr: any) {
      lastError = (execErr?.stderr || execErr?.message || 'unknown error').slice(0, 300);
      console.warn('[yt-dlp] Primary selector failed:', lastError);
      try {
        const fallbackFmt = isAudio ? 'bestaudio' : 'bestvideo[ext=mp4]/best[ext=mp4]/best';
        const { stdout } = await execFileAsync(
          ytdlpBin,
          ['-g', '-f', fallbackFmt, '--no-playlist', '--js-runtimes', 'node', ...cookieArgs, ytUrl],
          { timeout: 30000 }
        );
        directStreamUrl = stdout.trim().split('\n')[0].trim();
      } catch (fallbackErr: any) {
        lastError = (fallbackErr?.stderr || fallbackErr?.message || 'unknown error').slice(0, 300);
        console.error('[yt-dlp] All selectors failed:', lastError);
      }
    }

    if (!directStreamUrl || !directStreamUrl.startsWith('http')) {
      const cookieFileExists = fs.existsSync(COOKIES_PATH);
      const cookieFileSize = cookieFileExists ? fs.statSync(COOKIES_PATH).size : 0;
      return res.status(500).json({
        error: 'Could not resolve media stream.',
        detail: lastError,
        debug: { cookieArgs: cookieArgs.length, cookieFileExists, cookieFileSize, ytdlpBin, formatSelector }
      });
    }

    // Stream Google CDN directly to user with attachment header
    const streamRes = await fetch(directStreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://www.youtube.com/',
      },
    });

    if (!streamRes.ok) {
      return res.status(streamRes.status).json({ error: `Stream server returned ${streamRes.status}` });
    }

    const contentType = isAudio ? 'audio/mpeg' : 'video/mp4';
    const contentLength = streamRes.headers.get('content-length');

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.${fileExt}"`);
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'no-cache');

    // Pipe stream to browser
    if (streamRes.body) {
      const reader = streamRes.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } catch {
        res.end();
      }
    } else {
      const buffer = await streamRes.arrayBuffer();
      res.end(Buffer.from(buffer));
    }
  } catch (err: any) {
    console.error('Download proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream media file.' });
    }
  }
});

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

    if (db) {
      try {
        const ref = db.collection('users').doc(cleanEmail);
        const doc = await ref.get();
        if (!doc.exists) await ref.set(userData);
        else await ref.update({ lastLoginAt: now, ...(cleanName ? { name: cleanName } : {}) });
      } catch { /* non-fatal */ }
    }
    inMemoryUsers.set(cleanEmail, userData);
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
