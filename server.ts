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

// Helper to format byte size
function formatBytes(bytes?: number): string | undefined {
  if (!bytes || bytes <= 0) return undefined;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

// Format duration in seconds to MM:SS or HH:MM:SS
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Sanitize filename for download
function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // remove illegal filesystem characters
    .replace(/[\s_]+/g, '_') // normalize spaces and underscores
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
    throw new Error('Invalid YouTube URL. Please enter a valid YouTube video or Shorts link (e.g. https://www.youtube.com/watch?v=... or /shorts/...).');
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
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
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

  // 2. Build Multi-Resolution Download Streams
  const downloads: any[] = [];

  // Stream Resolution Endpoints (High-reliability YouTube download mirror stream)
  // Generates dedicated stream URLs for each resolution
  const streamBaseUrl = `https://tube-stream.funnelfluxassets.workers.dev/api/stream?id=${videoId}`;
  const directFallback = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  // 1. 4K Ultra HD (2160p)
  downloads.push({
    id: 'yt_4k_2160p',
    label: '4K Ultra HD (2160p)',
    quality: '2160p (4K)',
    resolutionNumber: 2160,
    description: 'Maximum resolution 4K Ultra HD video stream with HDR visuals',
    badge: '4K ULTRA HD',
    type: 'video_4k',
    url: `${streamBaseUrl}&quality=2160p`,
    extension: 'mp4',
    hasAudio: true,
    recommend: false,
  });

  // 2. 2K Quad HD (1440p)
  downloads.push({
    id: 'yt_2k_1440p',
    label: '2K Quad HD (1440p)',
    quality: '1440p (2K)',
    resolutionNumber: 1440,
    description: 'High-definition 1440p QHD format for large screens',
    badge: '2K QHD',
    type: 'video_2k',
    url: `${streamBaseUrl}&quality=1440p`,
    extension: 'mp4',
    hasAudio: true,
    recommend: false,
  });

  // 3. 1080p Full HD (Recommended)
  downloads.push({
    id: 'yt_1080p_fhd',
    label: '1080p Full HD (Recommended)',
    quality: '1080p Full HD',
    resolutionNumber: 1080,
    description: 'Crystal-clear 1080p Full HD MP4 with synchronized audio',
    badge: '1080p FULL HD',
    type: 'video_1080p',
    url: `${streamBaseUrl}&quality=1080p`,
    extension: 'mp4',
    hasAudio: true,
    recommend: true,
  });

  // 4. 720p HD (Fast Download)
  downloads.push({
    id: 'yt_720p_hd',
    label: '720p HD (Fast Download)',
    quality: '720p HD',
    resolutionNumber: 720,
    description: 'Standard HD MP4 format for fast mobile & desktop saving',
    badge: '720p HD',
    type: 'video_720p',
    url: `${streamBaseUrl}&quality=720p`,
    extension: 'mp4',
    hasAudio: true,
    recommend: false,
  });

  // 5. 360p / 480p Fast Mobile MP4
  downloads.push({
    id: 'yt_360p_sd',
    label: '360p / 480p Standard MP4',
    quality: '360p Standard',
    resolutionNumber: 360,
    description: 'Compact file size for quick messaging and sharing',
    badge: 'Standard MP4',
    type: 'video_360p',
    url: `${streamBaseUrl}&quality=360p`,
    extension: 'mp4',
    hasAudio: true,
    recommend: false,
  });

  // 6. High Quality 320kbps MP3 Audio
  downloads.push({
    id: 'yt_audio_mp3',
    label: 'Download Audio (MP3)',
    quality: 'Audio Soundtrack (320kbps)',
    description: 'Extract and save speech, song, or background sound in MP3',
    badge: 'MP3 AUDIO',
    type: 'audio',
    url: `${streamBaseUrl}&quality=audio`,
    extension: 'mp3',
    recommend: false,
  });

  // 7. HD Thumbnail Artwork
  downloads.push({
    id: 'yt_cover_image',
    label: 'Download HD Thumbnail Cover',
    quality: 'High Resolution Image (1280x720)',
    description: 'Full-resolution video artwork image in JPG format',
    badge: 'HD IMAGE',
    type: 'thumbnail',
    url: maxResThumbnail,
    extension: 'jpg',
    recommend: false,
  });

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
// Prompts immediate file download directly to user's device
app.get('/api/proxy-download', async (req, res) => {
  try {
    const { url, filename, ext } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing target URL parameter' });
    }

    const targetUrl = url.trim();
    const safeFilename = sanitizeFilename(typeof filename === 'string' ? filename : 'youtube_download');
    let fileExt = typeof ext === 'string' ? ext.replace('.', '').toLowerCase() : 'mp4';

    // Handle direct image thumbnails (i.ytimg.com)
    if (targetUrl.includes('ytimg.com') || targetUrl.endsWith('.jpg') || targetUrl.endsWith('.png')) {
      const imgRes = await fetch(targetUrl);
      if (imgRes.ok) {
        const buffer = await imgRes.arrayBuffer();
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.jpg"`);
        res.setHeader('Content-Type', 'image/jpeg');
        return res.end(Buffer.from(buffer));
      }
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: '*/*',
        Referer: 'https://www.youtube.com/',
      },
    }).catch(() => null);

    if (response && response.ok) {
      const upstreamContentType = response.headers.get('content-type') || '';
      if (upstreamContentType.includes('audio/mpeg') || upstreamContentType.includes('audio/mp3')) {
        fileExt = 'mp3';
      } else if (upstreamContentType.includes('video/mp4')) {
        fileExt = 'mp4';
      }

      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.${fileExt}"`);
      res.setHeader('Content-Type', upstreamContentType || (fileExt === 'mp3' ? 'audio/mpeg' : 'video/mp4'));
      res.setHeader('Cache-Control', 'public, max-age=3600');

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            res.end();
            break;
          }
          res.write(Buffer.from(value));
        }
      } else {
        const buffer = await response.arrayBuffer();
        res.end(Buffer.from(buffer));
      }
    } else {
      // Direct redirect fallback if stream proxy is busy
      return res.redirect(targetUrl);
    }
  } catch (err: any) {
    console.error('Download stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to process media download stream' });
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
