import { useEffect, useState } from 'react';

interface XpToastProps {
  xp: number;
  onDone: () => void;
}

/**
 * Floating "+N XP" popup that rises and fades out over ~1.4 seconds.
 * Mount it with a key so each new award gets a fresh animation.
 */
export default function XpToast({ xp, onDone }: XpToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 300);
    }, 1100);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className={`pointer-events-none fixed bottom-28 right-6 z-[9999] transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-8 opacity-0'
      }`}
      style={{ animation: 'xp-float-up 1.1s ease-out forwards' }}
    >
      <div className="flex items-center gap-1.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 shadow-lg shadow-blue-500/30">
        <span className="text-lg">⭐</span>
        <span className="text-base font-black text-white">+{xp} XP</span>
      </div>
    </div>
  );
}
