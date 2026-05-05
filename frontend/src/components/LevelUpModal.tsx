import { useEffect } from 'react';

interface LevelUpModalProps {
  newLevel: number;
  onClose: () => void;
}

/**
 * Full-screen celebration modal shown when the student levels up.
 * Auto-closes after 4 seconds or on user click.
 */
export default function LevelUpModal({ newLevel, onClose }: LevelUpModalProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-500 to-amber-400 p-1 shadow-2xl shadow-blue-500/40"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'level-up-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) both' }}
      >
        <div className="flex flex-col items-center gap-4 rounded-[calc(1.5rem-4px)] bg-slate-900 px-12 py-10">
          {/* Starburst */}
          <div className="relative flex items-center justify-center">
            <div className="absolute h-32 w-32 rounded-full bg-amber-400/20 blur-2xl" />
            <span
              className="text-7xl"
              style={{ filter: 'drop-shadow(0 0 16px rgba(250,204,21,0.8))' }}
            >
              🎉
            </span>
          </div>

          <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">
            Ниво горе!
          </p>
          <p className="text-center text-6xl font-black text-white">
            Ниво {newLevel}
          </p>
          <p className="text-center text-sm text-slate-400">
            Продължавай да решаваш задачи,<br />за да отключиш нови теми!
          </p>

          <button
            onClick={onClose}
            className="mt-2 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-8 py-3 text-sm font-bold text-white transition hover:scale-105 active:scale-95"
          >
            Продължи →
          </button>
        </div>
      </div>
    </div>
  );
}
