import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: 'Can I download YouTube videos in 4K or 1080p Full HD?',
    a: 'Yes! When a video has 4K (2160p), 2K (1440p), or 1080p available, TubeDownloader will automatically display those resolution options so you can save the highest quality possible.',
  },
  {
    q: 'Does it support YouTube Shorts (9:16 vertical videos)?',
    a: 'Yes! TubeDownloader fully supports YouTube Shorts links (e.g. youtube.com/shorts/...). It detects vertical 9:16 aspect ratio automatically and delivers full HD MP4 downloads.',
  },
  {
    q: 'Can I extract and download only the audio (MP3) from a YouTube video?',
    a: 'Yes! Every YouTube video includes a dedicated "Download Audio (MP3)" button to download high-fidelity 320kbps MP3 audio for offline listening.',
  },
  {
    q: 'Do I need to install any apps or browser extensions?',
    a: 'No installation is needed! TubeDownloader works completely in your web browser on mobile phones, tablets, Mac, Windows, and Linux.',
  },
  {
    q: 'Where are the downloaded videos and MP3 files saved?',
    a: 'Files are saved directly to your device\'s default "Downloads" folder. On iPhones/iPads, you can find them in the Files app under Downloads.',
  },
];

export const FaqSection: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section className="w-full max-w-4xl mx-auto pt-8 sm:pt-12 pb-[80px] px-3.5 sm:px-6">
      <div className="text-center max-w-xl mx-auto mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/70 px-3 py-1 rounded-full border border-red-200 dark:border-red-800/60 mb-7">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Frequently Asked Questions</span>
        </div>
        <h2 className="text-xl sm:text-3xl font-extrabold text-zinc-900 dark:text-white tracking-tight">
          Got Questions? We’ve Got Answers.
        </h2>
      </div>

      <div className="space-y-2.5 sm:space-y-3">
        {FAQS.map((faq, idx) => {
          const isOpen = openIndex === idx;
          return (
            <div
              key={idx}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden transition-all shadow-sm"
            >
              <button
                id={`faq-toggle-${idx}`}
                onClick={() => toggle(idx)}
                className="w-full px-4 sm:px-6 py-3.5 sm:py-4 text-left flex items-center justify-between gap-3 font-semibold text-zinc-900 dark:text-zinc-100 hover:text-red-600 dark:hover:text-red-400 transition-colors cursor-pointer"
              >
                <span className="text-xs sm:text-sm md:text-base leading-snug">{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-red-600 dark:text-red-400' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-4 sm:px-6 pb-4 text-xs sm:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed border-t border-zinc-100 dark:border-zinc-800 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
