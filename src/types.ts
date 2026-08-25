export interface AuthorInfo {
  id?: string;
  name: string;
  username?: string;
  avatar?: string;
  channelUrl?: string;
  verified?: boolean;
}

export interface VideoStats {
  views?: number;
  likes?: number;
  comments?: number;
}

export interface DownloadOption {
  id: string;
  label: string;
  quality: string; // '2160p (4K)' | '1440p (2K)' | '1080p' | '720p' | '480p' | '360p' | '320kbps'
  resolutionNumber?: number; // 2160, 1440, 1080, 720, 480, 360
  description?: string;
  badge?: string; // '4K ULTRA HD' | '2K QHD' | '1080p FULL HD' | 'HD' | 'MP3 AUDIO'
  type: 'video_4k' | 'video_2k' | 'video_1080p' | 'video_720p' | 'video_480p' | 'video_360p' | 'audio' | 'thumbnail';
  url: string;
  sizeFormatted?: string;
  extension: 'mp4' | 'mp3' | 'webm' | 'jpg';
  hasAudio?: boolean;
  recommend?: boolean;
}

export interface YouTubeMediaResult {
  id: string;
  title: string;
  duration: number; // in seconds
  durationFormatted?: string;
  cover: string;
  originCover?: string;
  author: AuthorInfo;
  stats?: VideoStats;
  isShorts: boolean;
  aspectRatio: '9:16' | '16:9';
  downloads: DownloadOption[];
  originalUrl: string;
  extractedAt: number;
}

// Backward compatibility alias if needed
export type TikTokMediaResult = YouTubeMediaResult;

export interface HistoryItem {
  id: string;
  title: string;
  author: string;
  authorUsername?: string;
  cover: string;
  timestamp: number;
  url: string;
  isShorts: boolean;
  durationFormatted?: string;
}

export interface UserAccount {
  email: string;
  name?: string;
  createdAt: number;
}
