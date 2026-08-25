import React from 'react';
import { Zap, Music2, Smartphone, Sparkles, Tv, CheckCircle2 } from 'lucide-react';

export const FeatureHighlights: React.FC = () => {
  const features = [
    {
      icon: Sparkles,
      title: '4K & 1080p Ultra HD',
      desc: 'Save YouTube videos in full original resolution up to 4K Ultra HD (2160p), 2K, and 1080p Full HD with rich color depth.',
      badge: '4K / 1080p / 720p',
    },
    {
      icon: Tv,
      title: 'Shorts & Long-Form',
      desc: 'Seamlessly download vertical 9:16 YouTube Shorts or standard 16:9 widescreen long-form videos with zero limits.',
      badge: '9:16 & 16:9',
    },
    {
      icon: Music2,
      title: 'Extract 320kbps MP3',
      desc: 'Extract pristine background music, speeches, and podcasts into standalone high-bitrate MP3 audio files.',
      badge: 'HQ Audio',
    },
    {
      icon: Zap,
      title: 'Instant & Direct Speed',
      desc: 'Zero waiting queues, zero adware. Ultra-fast download streams directly to your phone, tablet, or desktop.',
      badge: 'High Speed',
    },
  ];

  return (
    <section className="w-full max-w-5xl mx-auto py-8 sm:py-12 px-3.5 sm:px-6">
      <div className="text-center max-w-xl mx-auto mb-8 sm:mb-10">
        <h2 className="text-xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Why Use TubeDownloader?
        </h2>
        <p className="text-xs sm:text-base text-zinc-600 dark:text-zinc-400 mt-2">
          The fastest and cleanest YouTube video & Shorts downloader for creators, researchers, and viewers.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 max-w-4xl mx-auto">
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={i}
              className="bg-white dark:bg-zinc-900 p-5 sm:p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-red-300 dark:hover:border-red-800 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/70 text-red-600 dark:text-red-400 flex items-center justify-center border border-red-100 dark:border-red-900/50">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] sm:text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/60 dark:border-zinc-700/60 px-2 py-0.5 rounded">
                    {f.badge}
                  </span>
                </div>
                <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-white mb-1.5">{f.title}</h3>
                <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">{f.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
