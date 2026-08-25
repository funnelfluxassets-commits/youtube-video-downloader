import React, { useState, useMemo } from 'react';
import { YouTubeMediaResult, DownloadOption } from '../types';
import {
  Download,
  Play,
  Pause,
  Music,
  Eye,
  ThumbsUp,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Film,
  CheckCircle2,
  FileVideo,
  FileAudio,
  AlertCircle,
  FileEdit,
  RotateCcw,
  Tag,
  Tv,
  Smartphone,
} from 'lucide-react';

interface ResultCardProps {
  result: YouTubeMediaResult;
  onDownloadAttempt?: () => boolean;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, onDownloadAttempt }) => {
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedDownloadId, setSelectedDownloadId] = useState<string | null>(
    () => result.downloads.find((d) => d.recommend)?.id || result.downloads[0]?.id || null
  );

  const cleanForFilename = (str: string): string => {
    return str
      .replace(/[^\w\s-]/gi, '')
      .replace(/[\s_]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80);
  };

  const titleSlug = useMemo(() => {
    const raw = result.title || '';
    const cleaned = cleanForFilename(raw);
    return cleaned || 'youtube_video';
  }, [result.title]);

  const authorSlug = useMemo(() => {
    return cleanForFilename(result.author.name || 'youtube_creator');
  }, [result.author.name]);

  const presetCreatorCaption = useMemo(() => {
    return `${authorSlug}_${titleSlug}`;
  }, [authorSlug, titleSlug]);

  const [customFilename, setCustomFilename] = useState<string>(presetCreatorCaption);
  const [isEditingFilename, setIsEditingFilename] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
    return num.toLocaleString();
  };

  const handleCopyCaption = () => {
    if (result.title) {
      navigator.clipboard.writeText(result.title);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  const handleTriggerDownload = async (option: DownloadOption) => {
    if (onDownloadAttempt && !onDownloadAttempt()) {
      return;
    }
    setDownloadingId(option.id);
    setDownloadError(null);
    try {
      const baseName = cleanForFilename(customFilename.trim()) || presetCreatorCaption;
      let suffix = '';
      if (option.type === 'audio') {
        suffix = '_audio';
      } else if (option.type === 'thumbnail') {
        suffix = '_thumbnail';
      } else if (option.quality) {
        suffix = `_${option.quality.replace(/\s+/g, '')}`;
      }

      const safeTitle = `${baseName}${suffix}`;
      const downloadEndpoint = `/api/proxy-download?url=${encodeURIComponent(option.url)}&filename=${encodeURIComponent(safeTitle)}&ext=${option.extension}`;
      
      const response = await fetch(downloadEndpoint);
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Download server returned status ${response.status}`);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const tempLink = document.createElement('a');
      tempLink.href = blobUrl;
      tempLink.download = `${safeTitle}.${option.extension}`;
      document.body.appendChild(tempLink);
      tempLink.click();
      document.body.removeChild(tempLink);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadError(err?.message || 'Download failed. Please try an alternative resolution.');
    } finally {
      setDownloadingId(null);
    }
  };

  const activeOption = useMemo(() => {
    return result.downloads.find((d) => d.id === selectedDownloadId) || result.downloads[0];
  }, [result.downloads, selectedDownloadId]);

  return (
    <div className="w-full max-w-4xl mx-auto bg-white dark:bg-zinc-900 rounded-3xl p-4 sm:p-7 shadow-2xl border border-zinc-200 dark:border-zinc-800 transition-all space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {result.isShorts ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                <Smartphone className="w-3 h-3" />
                YouTube Shorts (9:16)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                <Tv className="w-3 h-3" />
                Landscape Video (16:9)
              </span>
            )}

            {result.downloads.some((d) => d.quality.includes('2160p') || d.type === 'video_4k') && (
              <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 animate-pulse">
                <Sparkles className="w-3 h-3" />
                4K Ultra HD Available
              </span>
            )}
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug">
            {result.title}
          </h2>

          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {result.author.name}
            </span>
            {result.durationFormatted && (
              <>
                <span>•</span>
                <span>{result.durationFormatted}</span>
              </>
            )}
            {result.stats?.views !== undefined && result.stats.views > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  {formatNumber(result.stats.views)} views
                </span>
              </>
            )}
          </div>
        </div>

        <button
          onClick={handleCopyCaption}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:text-red-600 dark:hover:text-red-400 bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700/80 px-3 py-1.5 rounded-xl transition-colors shrink-0 cursor-pointer self-start"
          title="Copy video title"
        >
          {copiedCaption ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copiedCaption ? 'Copied' : 'Copy Title'}</span>
        </button>
      </div>

      {/* Media Preview & Download Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Preview Thumbnail / Player (Responsive 9:16 or 16:9) */}
        <div className={`md:col-span-5 relative rounded-2xl overflow-hidden bg-black shadow-lg border border-zinc-200 dark:border-zinc-800 ${result.isShorts ? 'aspect-[9/16] max-h-[460px] mx-auto' : 'aspect-video w-full'}`}>
          <img
            src={result.cover}
            alt={result.title}
            className="w-full h-full object-cover"
          />

          <a
            href={result.originalUrl}
            target="_blank"
            rel="noreferrer"
            className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-black/60 hover:bg-black/80 backdrop-blur-md px-2 py-1 rounded-lg transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Open on YouTube</span>
          </a>
        </div>

        {/* Resolution Selector & Download Options */}
        <div className="md:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              <Film className="w-4 h-4 text-red-500" />
              <span>Select Download Quality:</span>
            </h3>
            <span className="text-xs text-zinc-400">MP4 / MP3</span>
          </div>

          {/* List of Formats */}
          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {result.downloads.map((option) => {
              const isSelected = selectedDownloadId === option.id;
              const isDownloading = downloadingId === option.id;

              return (
                <div
                  key={option.id}
                  onClick={() => setSelectedDownloadId(option.id)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 ring-2 ring-red-500/20'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${option.type === 'audio' ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400' : 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'}`}>
                      {option.type === 'audio' ? <FileAudio className="w-4 h-4" /> : <FileVideo className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white truncate">
                          {option.label}
                        </span>
                        {option.badge && (
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                            option.badge.includes('4K')
                              ? 'bg-amber-500 text-zinc-950'
                              : option.badge.includes('FULL HD')
                              ? 'bg-red-600 text-white'
                              : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200'
                          }`}>
                            {option.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                        {option.description || `${option.quality} • .${option.extension}`}
                      </p>
                    </div>
                  </div>

                  <button
                    id={`dl-btn-${option.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTriggerDownload(option);
                    }}
                    disabled={isDownloading}
                    className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer shadow-sm ${
                      option.recommend || isSelected
                        ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-red-600/20'
                        : 'bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isDownloading ? 'Downloading...' : 'Save'}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Custom Filename Section */}
          <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-zinc-400" />
                <span>Save File As:</span>
              </span>
              <button
                onClick={() => setCustomFilename(presetCreatorCaption)}
                className="text-[11px] text-red-600 dark:text-red-400 hover:underline flex items-center gap-1"
                title="Reset to default title"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>

            <input
              type="text"
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              placeholder="Enter custom download filename..."
              className="w-full text-xs sm:text-sm px-3 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 outline-none focus:border-red-500"
            />
          </div>

          {downloadError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{downloadError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
