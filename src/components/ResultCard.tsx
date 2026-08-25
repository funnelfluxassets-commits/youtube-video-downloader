import React, { useState, useMemo } from 'react';
import { YouTubeMediaResult, DownloadOption } from '../types';
import {
  Download,
  Play,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Film,
  FileVideo,
  FileAudio,
  AlertCircle,
  RotateCcw,
  Tag,
  Tv,
  Smartphone,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

interface ResultCardProps {
  result: YouTubeMediaResult;
  canDownload: () => boolean;
  onSuccessfulDownload: () => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, canDownload, onSuccessfulDownload }) => {
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadSuccessId, setDownloadSuccessId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
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

  const handleCopyCaption = () => {
    if (result.title) {
      navigator.clipboard.writeText(result.title);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    }
  };

  const handleTriggerDownload = async (option: DownloadOption) => {
    if (!canDownload()) {
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
        suffix = `_${option.quality.replace(/[\s()]/g, '')}`;
      }

      const safeTitle = `${baseName}${suffix}`;

      if (option.type === 'thumbnail') {
        // Direct HD Thumbnail Download
        const endpoint = `/api/proxy-download?url=${encodeURIComponent(result.cover)}&filename=${encodeURIComponent(safeTitle)}&ext=jpg`;
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('Failed to download thumbnail.');
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${safeTitle}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 2000);
      } else {
        // Video / Audio High-Speed Download Trigger
        const downloadUrl = `/api/proxy-download?id=${result.id}&quality=${encodeURIComponent(option.quality)}&type=${option.type}&filename=${encodeURIComponent(safeTitle)}&ext=${option.extension}`;
        
        // Trigger download via hidden iframe / direct anchor
        const tempLink = document.createElement('a');
        tempLink.href = downloadUrl;
        tempLink.download = `${safeTitle}.${option.extension}`;
        tempLink.target = '_blank';
        document.body.appendChild(tempLink);
        tempLink.click();
        document.body.removeChild(tempLink);
      }

      // Record successful download count
      onSuccessfulDownload();
      setDownloadSuccessId(option.id);
      setTimeout(() => setDownloadSuccessId(null), 3000);
    } catch (err: any) {
      console.error('Download error:', err);
      setDownloadError(err?.message || 'Download could not start. Please try another resolution.');
    } finally {
      setDownloadingId(null);
    }
  };

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

            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              <Sparkles className="w-3 h-3" />
              4K Ultra HD & 1080p Ready
            </span>
          </div>

          <h2 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-white line-clamp-2 leading-snug">
            {result.title}
          </h2>

          <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
              {result.author.name}
            </span>
            <span>•</span>
            <span className="text-emerald-500 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Direct Download Available
            </span>
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
        {/* Responsive Interactive Video Player Preview (9:16 Shorts or 16:9 Landscape) */}
        <div className={`md:col-span-5 relative rounded-2xl overflow-hidden bg-black shadow-lg border border-zinc-200 dark:border-zinc-800 ${result.isShorts ? 'aspect-[9/16] max-h-[440px] mx-auto w-full max-w-[260px]' : 'aspect-video w-full'}`}>
          {isPlayingVideo ? (
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${result.id}?autoplay=1&rel=0&modestbranding=1`}
              title={result.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : (
            <div className="relative w-full h-full group cursor-pointer" onClick={() => setIsPlayingVideo(true)}>
              <img
                src={result.cover}
                alt={result.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-black/35 flex items-center justify-center group-hover:bg-black/50 transition-colors">
                <button
                  id="play-video-preview-btn"
                  className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer"
                  title="Click to Play Video"
                >
                  <Play className="w-6 h-6 fill-white translate-x-0.5" />
                </button>
              </div>

              <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 text-[10px] font-semibold text-white bg-black/70 backdrop-blur-md px-2 py-1 rounded-lg">
                <Play className="w-3 h-3 fill-white" />
                <span>Click to Play</span>
              </span>
            </div>
          )}
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
              const isSuccess = downloadSuccessId === option.id;

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
                      isSuccess
                        ? 'bg-emerald-600 text-white'
                        : option.recommend || isSelected
                        ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white shadow-red-600/20'
                        : 'bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900'
                    }`}
                  >
                    {isDownloading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : isSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Saved!</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </>
                    )}
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
                className="text-[11px] text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer"
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
