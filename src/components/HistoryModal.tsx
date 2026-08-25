import React from 'react';
import { HistoryItem } from '../types';
import { X, Trash2, ArrowUpRight, Clock, Tv, Smartphone } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelect: (url: string) => void;
  onClear: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onClear,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-2xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 dark:text-red-400" />
            <h3 className="font-bold text-base sm:text-lg text-zinc-900 dark:text-white">Recent Extractions</h3>
            <span className="text-[11px] sm:text-xs font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 rounded-full">
              {history.length}
            </span>
          </div>
          <button
            id="close-history-modal-btn"
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 divide-y divide-zinc-100 dark:divide-zinc-800">
          {history.length === 0 ? (
            <div className="text-center py-10 sm:py-12">
              <Tv className="w-10 h-10 sm:w-12 sm:h-12 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
              <p className="font-semibold text-zinc-800 dark:text-zinc-200 text-sm">No recent downloads yet</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Paste any YouTube video or Shorts URL to download and your history will appear here.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className="py-3 flex items-center justify-between gap-2.5 sm:gap-3 group hover:bg-zinc-50/80 dark:hover:bg-zinc-800/60 -mx-1 sm:-mx-2 px-1 sm:px-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div className="relative w-16 h-10 sm:w-20 sm:h-12 rounded-lg overflow-hidden bg-zinc-900 shrink-0 border border-zinc-200 dark:border-zinc-700">
                    <img
                      src={item.cover}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {item.isShorts && (
                      <span className="absolute bottom-1 left-1 bg-red-600 px-1 py-0.2 rounded text-[8px] font-bold text-white uppercase">
                        Shorts
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
                      {item.title || 'YouTube Video'}
                    </p>
                    <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{item.author}</p>
                    <span className="text-[9px] sm:text-[10px] text-zinc-400 dark:text-zinc-500">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <button
                  id={`history-reselect-${item.id}`}
                  onClick={() => {
                    onSelect(item.url);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/70 hover:bg-red-100 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/50 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  <span>Re-open</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        {history.length > 0 && (
          <div className="px-4 sm:px-6 py-3 bg-zinc-50 dark:bg-zinc-800/80 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <button
              id="clear-all-history-btn"
              onClick={onClear}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50 px-2.5 sm:px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
            <button
              onClick={onClose}
              className="text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white px-3 sm:px-4 py-1.5 cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
