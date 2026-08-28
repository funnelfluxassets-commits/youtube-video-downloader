/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { YouTubeMediaResult, HistoryItem, UserAccount } from './types';
import { Navbar } from './components/Navbar';
import { UrlInputBar } from './components/UrlInputBar';
import { ResultCard } from './components/ResultCard';
import { HowToGuide } from './components/HowToGuide';
import { FeatureHighlights } from './components/FeatureHighlights';
import { FaqSection } from './components/FaqSection';
import { HistoryModal } from './components/HistoryModal';
import { AuthModal } from './components/AuthModal';
import { AlertCircle, Play, Sparkles, CheckCircle, ShieldCheck, Heart } from 'lucide-react';

const STORAGE_KEY = 'tubedownloader_history_v1';
const THEME_KEY = 'tubedownloader_theme_v1';
const USER_KEY = 'tubedownloader_user_v1';
const DOWNLOADS_KEY = 'tubedownloader_visitor_downloads_v1';
const MAX_FREE_DOWNLOADS = 3;

export default function App() {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<YouTubeMediaResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // User Authentication & Visitor Quota State
  const [user, setUser] = useState<UserAccount | null>(() => {
    try {
      const savedUser = localStorage.getItem(USER_KEY);
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });

  const [downloadCount, setDownloadCount] = useState<number>(() => {
    try {
      const savedCount = localStorage.getItem(DOWNLOADS_KEY);
      return savedCount ? parseInt(savedCount, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authReason, setAuthReason] = useState<'limit_reached' | 'manual'>('manual');
  
  // Theme state: default to dark mode or saved preference
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme) {
        return savedTheme === 'dark';
      }
      return true;
    } catch {
      return true;
    }
  });

  // Apply dark class to documentElement
  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem(THEME_KEY, 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem(THEME_KEY, 'light');
      }
    } catch {
      // Ignore storage errors
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode((prev) => !prev);
  };

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const saveToHistory = (item: YouTubeMediaResult) => {
    try {
      const historyEntry: HistoryItem = {
        id: item.id,
        title: item.title,
        author: item.author.name,
        authorUsername: item.author.username,
        cover: item.cover || item.originCover || '',
        timestamp: Date.now(),
        url: item.originalUrl,
        isShorts: item.isShorts,
        durationFormatted: item.durationFormatted,
      };

      setHistory((prev) => {
        const filtered = prev.filter((p) => p.id !== item.id);
        const updated = [historyEntry, ...filtered].slice(0, 20);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        return updated;
      });
    } catch (e) {
      console.warn('Could not save history:', e);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  // Handle Login & Logout
  const handleLoginSuccess = (account: UserAccount) => {
    setUser(account);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(account));
    } catch (e) {
      console.warn('Could not save user:', e);
    }
  };

  const handleLogout = () => {
    setUser(null);
    try {
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.warn('Could not remove user:', e);
    }
  };

  const openAuthModal = (reason: 'limit_reached' | 'manual' = 'manual') => {
    setAuthReason(reason);
    setIsAuthModalOpen(true);
  };

  // Check quota before downloading
  const canDownload = (): boolean => {
    if (user) {
      return true;
    }

    if (downloadCount >= MAX_FREE_DOWNLOADS) {
      openAuthModal('limit_reached');
      return false;
    }

    return true;
  };

  // Only increment quota after successful download start
  const handleSuccessfulDownload = () => {
    if (user) return;
    const nextCount = downloadCount + 1;
    setDownloadCount(nextCount);
    try {
      localStorage.setItem(DOWNLOADS_KEY, String(nextCount));
    } catch (e) {
      console.warn('Could not save download count:', e);
    }
  };

  const handleExtract = async (targetUrl: string) => {
    if (!targetUrl.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim() }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Could not process the video. Please verify the YouTube URL and try again.");
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract video. Please check the URL.');
      }

      setResult(data.data);
      saveToHistory(data.data);

      setTimeout(() => {
        const resultElem = document.getElementById('extraction-result-section');
        if (resultElem) {
          resultElem.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while extracting the video.');
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-zinc-950 text-zinc-100' : 'bg-stone-50 text-zinc-900'} flex flex-col font-sans selection:bg-red-600 selection:text-white transition-colors duration-200`}>
      {/* Top Navigation */}
      <Navbar
        user={user}
        onOpenLogin={() => openAuthModal('manual')}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        onToggleTheme={toggleTheme}
      />

      {/* Main Hero & Extractor Container */}
      <main className="flex-1">
        <section className="relative pt-[104px] sm:pt-[120px] md:pt-[136px] pb-10 sm:pb-16 px-3.5 sm:px-6 overflow-hidden">
          {/* Subtle Background Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[320px] sm:w-[700px] h-[220px] sm:h-[350px] bg-gradient-to-tr from-red-600/15 via-rose-500/10 to-amber-500/15 blur-3xl pointer-events-none rounded-full" />

          <div className="max-w-4xl mx-auto text-center relative z-10">
            {/* Headline */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-zinc-950 dark:text-zinc-50 tracking-tight leading-[1.18] sm:leading-[1.15] mb-3 sm:mb-4 px-1">
              YouTube Video & Shorts{' '}
              <span className="bg-gradient-to-r from-red-600 via-rose-600 to-orange-500 dark:from-red-500 dark:via-rose-400 dark:to-orange-400 bg-clip-text text-transparent block sm:inline mt-1 sm:mt-0">
                Downloader (4K & HD)
              </span>
            </h1>

            {/* Description */}
            <p className="text-xs sm:text-base md:text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto mb-6 sm:mb-8 font-normal leading-relaxed px-2">
              Download YouTube videos and vertical Shorts in 4K Ultra HD, 1080p Full HD MP4 or extract 320kbps MP3 audio with zero API keys.
            </p>

            {/* Input Extractor Component */}
            <UrlInputBar
              url={url}
              setUrl={setUrl}
              onSubmit={handleExtract}
              isLoading={isLoading}
              onSelectSample={(sampleUrl) => handleExtract(sampleUrl)}
              downloadCount={downloadCount}
              maxFreeDownloads={MAX_FREE_DOWNLOADS}
              isLoggedIn={!!user}
              onOpenAuth={() => openAuthModal(downloadCount >= MAX_FREE_DOWNLOADS ? 'limit_reached' : 'manual')}
              historyCount={history.length}
              onOpenHistory={() => setIsHistoryOpen(true)}
            />

            {/* Error Message Box */}
            {error && (
              <div className="mt-5 max-w-2xl mx-auto bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-2xl p-3.5 sm:p-4 flex items-start gap-2.5 sm:gap-3 text-left animate-in fade-in slide-in-from-top-2 shadow-sm">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs sm:text-sm font-bold text-red-900 dark:text-red-200">Extraction Error</h4>
                  <p className="text-[11px] sm:text-xs text-red-700 dark:text-red-300 mt-0.5 break-words">{error}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Extraction Result Showcase */}
        {result && (
          <section id="extraction-result-section" className="py-4 sm:py-8 px-3 sm:px-6">
            <ResultCard
              result={result}
              canDownload={canDownload}
              onSuccessfulDownload={handleSuccessfulDownload}
            />
          </section>
        )}

        {/* How It Works Guide */}
        <HowToGuide />

        {/* Core Feature Highlights */}
        <FeatureHighlights />

        {/* FAQ Section */}
        <FaqSection />
      </main>

      {/* History Modal */}
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={history}
        onSelect={(savedUrl) => {
          setUrl(savedUrl);
          handleExtract(savedUrl);
        }}
        onClear={clearHistory}
      />

      {/* Auth / Email Capture Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
        initialReason={authReason}
        downloadCount={downloadCount}
      />

      {/* Clean Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 py-8 px-4 text-xs text-zinc-500 dark:text-zinc-400 transition-colors">
        <div className="max-w-5xl mx-auto space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-red-600 via-rose-600 to-orange-500 p-[1.5px] shadow-sm flex items-center justify-center">
                <div className="w-full h-full bg-zinc-950 rounded-[6.5px] flex items-center justify-center">
                  <Play className="w-4 h-4 text-red-500 fill-red-500 translate-x-0.5" />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1 sm:gap-1.5 whitespace-nowrap text-center">
                <span className="font-bold text-xs sm:text-sm text-zinc-900 dark:text-white tracking-tight">TubeDownloader</span>
                <span className="text-[11px] sm:text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">• Zero Watermarks • 100% Free</span>
              </div>
            </div>
            <p className="text-[11px] text-zinc-400">Built for content creators</p>
          </div>

          <div className="pt-4 border-t border-zinc-200/60 dark:border-zinc-800/60 text-[11px] text-zinc-400 dark:text-zinc-500 leading-relaxed text-center sm:text-left">
            <p>
              <strong>Disclaimer:</strong> TubeDownloader is an independent utility tool and is not affiliated, associated, authorized, endorsed by, or in any way officially connected with YouTube, Google LLC, Alphabet Inc., or any of their subsidiaries or affiliates. The official YouTube website can be found at <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-600 dark:hover:text-zinc-300">youtube.com</a>. The name "YouTube" as well as related names, marks, emblems, and images are registered trademarks of their respective owners.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
