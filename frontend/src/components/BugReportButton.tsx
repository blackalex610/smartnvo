import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Category = 'bug' | 'suggestion' | 'wrong_answer' | 'other';

const CATEGORIES: { value: Category; label: string; emoji: string }[] = [
  { value: 'bug',          label: 'Нещо не работи',    emoji: '🐛' },
  { value: 'wrong_answer', label: 'Грешен отговор',    emoji: '❌' },
  { value: 'suggestion',   label: 'Идея/предложение',  emoji: '💡' },
  { value: 'other',        label: 'Друго',              emoji: '📝' },
];

// ─── Context collector ────────────────────────────────────────────────────────

function collectContext(route: string) {
  return {
    route,
    timestamp: new Date().toISOString(),
    user_agent: navigator.userAgent,
    screen_size: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    user_id: localStorage.getItem('userId') ?? undefined,
    console_errors: (window as any).__bugReportErrors ?? [],
  };
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface BugReportModalProps {
  onClose: () => void;
  currentRoute: string;
}

const BugReportModal: React.FC<BugReportModalProps> = ({ onClose, currentRoute }) => {
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleScreenshot = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400_000) {
      alert('Снимката е прекалено голяма (макс. 400KB). Моля, изберете по-малка.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      setScreenshotPreview(result);
      setScreenshotBase64(result.split(',')[1]);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5) return;

    setStatus('sending');
    const ctx = collectContext(currentRoute);

    try {
      await axios.post(`${API_BASE_URL}/bug-report`, {
        message: message.trim(),
        category,
        screenshot_base64: screenshotBase64,
        ...ctx,
      });
      setStatus('success');
      setTimeout(onClose, 2000);
    } catch {
      setStatus('error');
    }
  };

  const isSuccess = status === 'success';
  const isSending = status === 'sending';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl p-6 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🐛</span>
            <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              Докладвай проблем
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {isSuccess ? (
          /* Success state */
          <div className="flex flex-col items-center gap-3 py-6">
            <span className="text-4xl">✅</span>
            <p className="font-bold text-slate-800 dark:text-slate-100">Изпратено!</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
              Благодарим! Ще разгледаме проблема скоро.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Category chips */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">
                Вид проблем
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setCategory(cat.value)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      category === cat.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-transparent text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                    }`}
                  >
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">
                Опиши проблема *
              </label>
              <textarea
                required
                minLength={5}
                maxLength={2000}
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Какво се случи? Какво очаквахте да се случи?"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
              />
              <span className="text-[11px] text-slate-400 float-right">{message.length}/2000</span>
            </div>

            {/* Screenshot upload */}
            <div>
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2 block">
                Снимка (по желание)
              </label>
              {screenshotPreview ? (
                <div className="relative">
                  <img
                    src={screenshotPreview}
                    alt="Screenshot preview"
                    className="rounded-xl border border-slate-200 dark:border-slate-700 max-h-32 object-cover w-full"
                  />
                  <button
                    type="button"
                    onClick={() => { setScreenshotPreview(null); setScreenshotBase64(null); }}
                    className="absolute top-1.5 right-1.5 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 py-3 text-sm text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors"
                >
                  📷 Добави снимка
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScreenshot}
              />
            </div>

            {/* Context badge */}
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-[11px] text-slate-400 dark:text-slate-500">
              📍 Страница: <span className="font-mono">{currentRoute}</span>
            </div>

            {/* Error state */}
            {status === 'error' && (
              <p className="text-xs text-red-500 text-center">
                Нещо се обърка. Провери интернет и опитай пак.
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSending || message.trim().length < 5}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 text-sm transition-all"
            >
              {isSending ? '📡 Изпращане...' : '📤 Изпрати доклад'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ─── Floating button ──────────────────────────────────────────────────────────

const BugReportButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setIsOpen(true)}
        title="Докладвай проблем"
        className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-50 w-11 h-11 rounded-full bg-slate-700 hover:bg-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-110 active:scale-95"
      >
        <span className="text-base">🐛</span>
      </button>

      {isOpen && (
        <BugReportModal
          onClose={() => setIsOpen(false)}
          currentRoute={location.pathname}
        />
      )}
    </>
  );
};

// ─── Error capture (call once in app root) ───────────────────────────────────

export function installBugReportErrorCapture() {
  if (typeof window === 'undefined') return;
  (window as any).__bugReportErrors = [];
  const originalError = console.error.bind(console);
  console.error = (...args: any[]) => {
    const msg = args.map(String).join(' ').slice(0, 500);
    const store: string[] = (window as any).__bugReportErrors;
    store.push(`[${new Date().toISOString()}] ${msg}`);
    if (store.length > 20) store.shift();
    originalError(...args);
  };
}

export default BugReportButton;
