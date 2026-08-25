import 'dotenv/config';
import express from 'express';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

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

// Sanitize filename for download
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/[\s_]+/g, '_')
    .trim()
    .slice(0, 120);
  return cleaned || 'youtube_download';
}

// Extract Video ID and detect Shorts from YouTube URL
function parseYouTubeUrl(inputUrl: string): { videoId: string; isShorts: boolean; cleanUrl: string } | null {
  try {
    const trimmed = inputUrl.trim();
    
    // Pattern 1: shorts/ID
    const shortsMatch = trimmed.match(/(?:youtube\.com|youtu\.be)\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) {
      return {
        videoId: shortsMatch[1],
        isShorts: true,
        cleanUrl: `https://www.youtube.com/shorts/${shortsMatch[1]}`,
      };
    }

    // Pattern 2: watch?v=ID or /v/ID or /embed/ID or youtu.be/ID
    const watchMatch = trimmed.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (watchMatch) {
      return {
        videoId: watchMatch[1],
        isShorts: false,
        cleanUrl: `https://www.youtube.com/watch?v=${watchMatch[1]}`,
      };
    }

    // Pattern 3: raw 11-character video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return {
        videoId: trimmed,
        isShorts: false,
        cleanUrl: `https://www.youtube.com/watch?v=${trimmed}`,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// High-performance YouTube Multi-Source Extractor (Zero API Keys)
async function extractYouTubeMedia(targetUrl: string) {
  const parsed = parseYouTubeUrl(targetUrl);
  if (!parsed) {
    throw new Error('Invalid YouTube URL. Please enter a valid YouTube video or Shorts link.');
  }

  const { videoId, isShorts, cleanUrl } = parsed;

  // 1. Fetch Verified YouTube oEmbed Metadata
  let title = isShorts ? 'YouTube Shorts Video' : 'YouTube Video';
  let authorName = 'YouTube Creator';
  let authorUrl = 'https://www.youtube.com';
  let maxResThumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  let hqThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const oembedRes = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      if (oembed.title) title = oembed.title;
      if (oembed.author_name) authorName = oembed.author_name;
      if (oembed.author_url) authorUrl = oembed.author_url;
    }
  } catch (err) {
    console.warn('oEmbed notice:', err);
  }

  // 2. Build Multi-Resolution Download Options
  const downloads: any[] = [
    {
      id: 'yt_4k_2160p',
      label: '4K Ultra HD (2160p)',
      quality: '2160p (4K)',
      resolutionNumber: 2160,
      description: 'Maximum resolution 4K Ultra HD video stream with HDR visuals',
      badge: '4K ULTRA HD',
      type: 'video_4k',
      url: videoId,
      extension: 'mp4',
      recommend: false,
    },
    {
      id: 'yt_2k_1440p',
      label: '2K Quad HD (1440p)',
      quality: '1440p (2K)',
      resolutionNumber: 1440,
      description: 'High-definition 1440p QHD format for large screens',
      badge: '2K QHD',
      type: 'video_2k',
      url: videoId,
      extension: 'mp4',
      recommend: false,
    },
    {
      id: 'yt_1080p_fhd',
      label: '1080p Full HD (Recommended)',
      quality: '1080p Full HD',
      resolutionNumber: 1080,
      description: 'Crystal-clear 1080p Full HD MP4 with synchronized audio',
      badge: '1080p FULL HD',
      type: 'video_1080p',
      url: videoId,
      extension: 'mp4',
      recommend: true,
    },
    {
      id: 'yt_720p_hd',
      label: '720p HD (Fast Download)',
      quality: '720p HD',
      resolutionNumber: 720,
      description: 'Standard HD MP4 format for fast mobile & desktop saving',
      badge: '720p HD',
      type: 'video_720p',
      url: videoId,
      extension: 'mp4',
      recommend: false,
    },
    {
      id: 'yt_360p_sd',
      label: '360p / 480p Standard MP4',
      quality: '360p Standard',
      resolutionNumber: 360,
      description: 'Compact file size for quick messaging and sharing',
      badge: 'Standard MP4',
      type: 'video_360p',
      url: videoId,
      extension: 'mp4',
      recommend: false,
    },
    {
      id: 'yt_audio_mp3',
      label: 'Download Audio (MP3)',
      quality: 'Audio Soundtrack (320kbps)',
      description: 'Extract and save speech, song, or background sound in MP3',
      badge: 'MP3 AUDIO',
      type: 'audio',
      url: videoId,
      extension: 'mp3',
      recommend: false,
    },
    {
      id: 'yt_cover_image',
      label: 'Download HD Thumbnail Cover',
      quality: 'High Resolution Image (1280x720)',
      description: 'Full-resolution video artwork image in JPG format',
      badge: 'HD IMAGE',
      type: 'thumbnail',
      url: maxResThumbnail,
      extension: 'jpg',
      recommend: false,
    },
  ];

  return {
    id: videoId,
    title: title,
    duration: 0,
    durationFormatted: isShorts ? 'Shorts' : 'HD Video',
    cover: maxResThumbnail,
    originCover: hqThumbnail,
    author: {
      name: authorName,
      username: authorName.replace(/[^\w]/g, '').toLowerCase(),
      channelUrl: authorUrl,
    },
    stats: {
      views: 0,
      likes: 0,
    },
    isShorts: isShorts,
    aspectRatio: isShorts ? ('9:16' as const) : ('16:9' as const),
    downloads: downloads,
    originalUrl: cleanUrl,
    extractedAt: Date.now(),
  };
}

// API 1: Extract YouTube Video & Shorts Endpoint
app.post('/api/extract', async (req, res) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ success: false, error: 'Please provide a valid YouTube video or Shorts link.' });
    }

    const input = url.trim();
    const result = await extractYouTubeMedia(input);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('YouTube extraction error:', err);
    return res.status(400).json({
      success: false,
      error: err?.message || 'Failed to extract YouTube video. Please ensure the video is public and the link is valid.',
    });
  }
});

// API 2: Proxy Download with Attachment Headers
app.get('/api/proxy-download', async (req, res) => {
  try {
    const { url, id, quality, type, filename, ext } = req.query;

    const safeFilename = sanitizeFilename(typeof filename === 'string' ? filename : 'youtube_media');
    const fileExt = typeof ext === 'string' ? ext.replace('.', '').toLowerCase() : 'mp4';

    // 1. Direct Thumbnail Image Download
    if (typeof url === 'string' && url.trim()) {
      const targetUrl = url.trim();
      const imgRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          Referer: 'https://www.youtube.com/',
        },
      });

      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.jpg"`);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.end(Buffer.from(buffer));
      }
    }

    // 2. Video & Audio Direct Download Gateway
    const videoId = typeof id === 'string' && id.trim() ? id.trim() : (typeof url === 'string' ? parseYouTubeUrl(url)?.videoId : '');
    if (!videoId) {
      return res.status(400).json({ error: 'Missing video identifier.' });
    }

    const isAudio = type === 'audio' || fileExt === 'mp3';
    const targetQuality = typeof quality === 'string' ? quality.toLowerCase() : '1080';

    let formatCode = '1080';
    if (isAudio) {
      formatCode = 'mp3';
    } else if (targetQuality.includes('2160') || targetQuality.includes('4k')) {
      formatCode = '4k';
    } else if (targetQuality.includes('1440') || targetQuality.includes('2k')) {
      formatCode = '1440';
    } else if (targetQuality.includes('720')) {
      formatCode = '720';
    } else if (targetQuality.includes('360')) {
      formatCode = '360';
    }

    // Route to direct loader download button card
    const gatewayUrl = `https://loader.to/api/button/?url=https://www.youtube.com/watch?v=${videoId}&f=${formatCode}`;
    return res.redirect(gatewayUrl);
  } catch (err: any) {
    console.error('Download proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to initiate media download.' });
    }
  }
});

// In-Memory User Fallback store
const inMemoryUsers = new Map<string, { email: string; name?: string; createdAt: number }>();

// API 4: User Registration / Sign-in Endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, name } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = typeof name === 'string' && name.trim() ? name.trim() : undefined;
    const now = Date.now();

    const userData = {
      email: cleanEmail,
      name: cleanName,
      createdAt: now,
      lastLoginAt: now,
    };

    if (db) {
      try {
        const userRef = db.collection('users').doc(cleanEmail);
        const doc = await userRef.get();
        if (!doc.exists) {
          await userRef.set(userData);
        } else {
          await userRef.update({
            lastLoginAt: now,
            ...(cleanName ? { name: cleanName } : {}),
          });
        }
      } catch (firestoreErr) {
        console.warn('Firestore write fallback:', firestoreErr);
      }
    }

    inMemoryUsers.set(cleanEmail, userData);
    return res.json({
      success: true,
      user: {
        email: cleanEmail,
        name: cleanName,
        createdAt: now,
      },
    });
  } catch (err: any) {
    console.error('Auth register error:', err);
    return res.status(500).json({ success: false, error: 'Failed to process account.' });
  }
});

// API 5: Verify User Session
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
          return res.json({
            success: true,
            user: {
              email: cleanEmail,
              name: data?.name,
              createdAt: data?.createdAt || Date.now(),
            },
          });
        }
      } catch (e) {
        console.warn('Firestore read error:', e);
      }
    }

    const localUser = inMemoryUsers.get(cleanEmail);
    if (localUser) {
      return res.json({ success: true, user: localUser });
    }

    return res.json({ success: true, user: { email: cleanEmail, createdAt: Date.now() } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Verification failed.' });
  }
});

// Local Development Server (only when not running in Vercel Serverless environment)
if (!process.env.VERCEL) {
  const bootstrap = async () => {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }

    const PORT = process.env.PORT || 3000;
    app.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`TubeDownloader Server running on http://0.0.0.0:${PORT}`);
    });
  };
  bootstrap();
}

export default app;
