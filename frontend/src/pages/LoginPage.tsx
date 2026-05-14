import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
import { API_BASE_URL } from '../services/api';
import { trackEvent } from '../services/analytics';

const features = [
  {
    title: 'AI Учител',
    desc: 'Получи обяснения, подсказки и решения от изкуствен интелект, 24/7.',
  },
  {
    title: 'НВО Подготовка',
    desc: 'Пълни пробни изпити по формата на реалното НВО с автоматична оценка.',
  },
  {
    title: 'Личен Прогрес',
    desc: 'Следи напредъка си по теми, упражнения и оценки на едно място.',
  },
  {
    title: 'Снимай & Реши',
    desc: 'Снимай задача с телефона си и получи решение веднага.',
  },
  {
    title: 'Учебна Програма',
    desc: 'Цялата учебна програма за 5–7 клас, структурирана по теми и уроци.',
  },
];

const SYMBOLS = ['∑', '∫', '√', 'π', '∞', 'θ', 'Δ', '÷', '×', '²', '³'];

interface Particle {
  id: number;
  symbol: string;
  left: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function useFallingParticles(count: number): Particle[] {
  return useRef<Particle[]>(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      symbol: SYMBOLS[i % SYMBOLS.length],
      left: Math.random() * 100,
      size: 14 + Math.random() * 18,
      duration: 9 + Math.random() * 14,
      delay: Math.random() * -18,
      opacity: 0.08 + Math.random() * 0.14,
    }))
  ).current;
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const particles = useFallingParticles(20);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [manualLoading, setManualLoading] = useState(false);
  const preferredGoogleOrigin = import.meta.env.VITE_GOOGLE_AUTH_ORIGIN || 'http://localhost:5173';
  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentHost = window.location.hostname;
    if (currentHost !== '127.0.0.1') return;
    // Prevent infinite redirect loops
    if (sessionStorage.getItem('login_redirect_done')) return;
    try {
      const target = new URL(preferredGoogleOrigin);
      const nextUrl = `${target.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (window.location.origin !== target.origin) {
        sessionStorage.setItem('login_redirect_done', '1');
        window.location.replace(nextUrl);
      }
    } catch {
      // Keep page functional even if env value is malformed.
    }
  }, [preferredGoogleOrigin]);

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });
      if (!res.ok) throw new Error('Неуспешна автентикация');
      const data = await res.json();
      // Store JWT token and user profile
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      trackEvent('login', { method: 'google' }, { userId: String(data?.user?.id ?? '') || undefined });
      navigate('/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Нещо се обърка');
    } finally {
      setLoading(false);
    }
  };

  const handleGuestAccess = () => {
    const guestUserId = 'guest-local';
    localStorage.removeItem('token');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: guestUserId,
        name: 'Гост',
        email: 'guest@local',
        picture: '',
        plan: 'free',
        isGuest: true,
      })
    );
    trackEvent('login', { method: 'guest' }, { userId: guestUserId });
    navigate('/dashboard');
  };

  const handleManualSignIn = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = formEmail.trim();
    const password = formPassword.trim();

    if (!email || !password) {
      setError('Моля, попълни имейл и парола.');
      return;
    }

    setError('');
    setManualLoading(true);

    const displayName = email.includes('@') ? email.split('@')[0] : 'Ученик';
    const localUserId = `local-${Date.now()}`;
    localStorage.removeItem('token');
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: localUserId,
        name: displayName,
        email,
        picture: '',
        plan: 'free',
        isGuest: false,
      })
    );

    trackEvent('login', { method: 'manual' }, { userId: localUserId });
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Falling math symbols — kept as-is */}
      <style>{`
        @keyframes lp-fall {
          0%   { transform: translateY(-10vh) rotate(0deg); opacity: 0; }
          12%  { opacity: var(--op); }
          85%  { opacity: var(--op); }
          100% { transform: translateY(110vh) rotate(14deg); opacity: 0; }
        }
        .lp-particle {
          position: absolute; top: -48px;
          color: #94a3b8;
          user-select: none;
          animation-name: lp-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        .lp-google-wrap > div {
          width: 100% !important;
          display: flex !important;
          justify-content: center !important;
        }
      `}</style>

      {/* Particle layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden="true">
        {particles.map((particle) => (
          <span
            key={particle.id}
            className="lp-particle"
            style={{
              left: `${particle.left}%`,
              fontSize: `${particle.size}px`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
              ['--op' as string]: particle.opacity,
            }}
          >
            {particle.symbol}
          </span>
        ))}
      </div>

      {/* Navbar — matches AppNavbar style */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-lg font-bold tracking-tight text-[#1c4270] hover:text-slate-600 transition-colors"
          >
            SMART NVO ∑
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs font-medium text-slate-400">5–7 клас</span>
            <button
              type="button"
              onClick={() => navigate('/controller')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-[#1c4270] hover:bg-slate-100 hover:border-slate-300 transition-colors"
            >
              📱 Свържи телефон
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero + login card row */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch mb-8">

          {/* Left — intro */}
          <article className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm p-8">
            <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-[#1c4270] mb-4">
              Онлайн платформа по математика
            </span>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[#1c4270] leading-tight">
              Подготовка за НВО с ясен план и{' '}
              <span className="text-[#1c4270]">
                точни резултати
              </span>
            </h1>
            <p className="mt-4 text-base text-slate-600 leading-relaxed max-w-prose">
              Учи по теми за 5–7 клас, решавай задачи и следи напредъка си в една среда.
              Платформата е създадена за ежедневна работа и бърза подготовка.
            </p>
            <ul className="mt-5 space-y-2">
              {['Персонализирани упражнения по ниво', 'Пробни НВО формати с оценяване', 'Анализ на грешките и насоки за следващи стъпки'].map((point) => (
                <li key={point} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-[#1c4270]">
                  <span className="mt-0.5 text-[#1c4270] shrink-0">✓</span>
                  {point}
                </li>
              ))}
            </ul>
          </article>

          {/* Right — login card */}
          <article className="w-full lg:w-[400px] shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-xl font-bold text-[#1c4270]">Вход в профила</h2>
            <p className="mt-1 mb-5 text-sm text-slate-500">Влез с имейл и парола или използвай Google</p>

            <form className="space-y-3 mb-4" onSubmit={handleManualSignIn}>
              <div>
                <label className="block text-xs font-semibold text-[#1c4270] mb-1" htmlFor="email">Имейл</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="ime@primer.bg"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#1c4270] placeholder-slate-400 outline-none focus:border-[#1c4270] focus:ring-2 focus:ring-[#1c4270]/10 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#1c4270] mb-1" htmlFor="password">Парола</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Въведи парола"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#1c4270] placeholder-slate-400 outline-none focus:border-[#1c4270] focus:ring-2 focus:ring-[#1c4270]/10 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={manualLoading || loading}
                className="w-full rounded-lg bg-[#1c4270] px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {manualLoading ? 'Влизане...' : 'Вход'}
              </button>
            </form>

            <div className="flex items-center gap-2 my-4">
              <span className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">или</span>
              <span className="flex-1 h-px bg-slate-200" />
            </div>

            <div className="lp-google-wrap">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() =>
                  setError(
                    `Неуспешен Google вход за origin: ${runtimeOrigin}. Добави този origin в Google Cloud OAuth настройките.`
                  )
                }
                theme="outline"
                size="large"
                shape="rectangular"
                text="signin_with"
              />
            </div>

            <button
              type="button"
              onClick={handleGuestAccess}
              className="mt-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-[#1c4270] hover:bg-slate-100 hover:border-slate-300 transition-colors"
            >
              Продължи като гост
            </button>

            <div className="mt-5 pt-4 border-t border-slate-200 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400">Нямаш акаунт?</p>
              <button
                type="button"
                onClick={() => navigate('/register')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1c4270] hover:bg-slate-50 hover:border-slate-300 transition-colors"
              >
                Регистрирай се
              </button>
            </div>

            {(loading || manualLoading) && (
              <p className="mt-3 text-xs text-slate-400">Влизане...</p>
            )}
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                {error}
              </div>
            )}

            <p className="mt-4 text-xs text-slate-400 leading-relaxed">
              С влизане приемаш условията за ползване.<br />
              Платформата е за образователни цели.
            </p>
          </article>
        </div>

        {/* Features grid */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-base font-bold text-[#1c4270] mb-4">Какво получаваш</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-[#1c4270] mb-1">{f.title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-6 text-center text-xs text-slate-400 border-t border-slate-200 pt-5">
          2026 SMART NVO. Всички права запазени.
        </footer>
      </main>
    </div>
  );
};

export default LoginPage;

