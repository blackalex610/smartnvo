from pathlib import Path
path = Path(r'c:\Users\pc\Desktop\matematika hristov\frontend\src\pages\LoginPage.tsx')
content = '''import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { API_BASE_URL } from '../services/api';
import { trackEvent } from '../services/analytics';

type Lang = 'bg' | 'en';

const T: Record<string, Record<Lang, string>> = {
  nav_grades:    { bg: '5–7 клас', en: 'Grades 5–7' },
  nav_login:     { bg: 'Вход', en: 'Sign in' },
  hero_h1_a:     { bg: 'Подготовка за НВО', en: 'Prepare for НВО' },
  hero_h1_b:     { bg: 'без стрес', en: 'without stress' },
  hero_sub:      { bg: 'Подробни уроци, интерактивни тестове и задачи по модела на НВО за 5.–7. клас.', en: 'Detailed lessons, interactive tests and tasks in the НВО format for grades 5–7.' },
  hero_cta:      { bg: 'Започни безплатно', en: 'Start for free' },
  auth_h:        { bg: 'Започни подготовката', en: 'Start preparing' },
  auth_sub:      { bg: 'Подготви се уверено за Националното външно оценяване с тестове, практика и проследяване на прогреса.', en: 'Prepare confidently with tests, practice, and progress tracking.' },
  auth_loading:  { bg: 'Свързване...', en: 'Connecting...' },
  auth_guest:    { bg: 'Продължи като гост', en: 'Continue as guest' },
  auth_guest_h:  { bg: 'Разгледай платформата без регистрация.', en: 'Explore the platform without signing up.' },
  auth_login:    { bg: 'Вход', en: 'Sign in' },
  auth_register: { bg: 'Регистрация', en: 'Sign up' },
  auth_terms:    { bg: 'С продължаване приемаш условията за ползване. Платформата е за образователни цели.', en: 'By continuing you accept the terms of service. The platform is for educational purposes.' },
  footer:        { bg: '© 2026 SMART NVO. Всички права запазени.', en: '© 2026 SMART NVO. All rights reserved.' },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-64px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      variants={{ visible: { transition: { staggerChildren: 0.06 } }, hidden: {} }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('bg');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const t = useCallback((key: string) => T[key]?.[lang] ?? key, [lang]);

  const preferredGoogleOrigin = import.meta.env.VITE_GOOGLE_AUTH_ORIGIN || 'http://localhost:5173';
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hostname !== '127.0.0.1') return;
    if (window.location.hash.includes('noredirect')) return;
    try {
      const target = new URL(preferredGoogleOrigin);
      const nextUrl = `${target.origin}${window.location.pathname}${window.location.search}#noredirect`;
      if (window.location.origin !== target.origin) window.location.replace(nextUrl);
    } catch { /* keep functional */ }
  }, [preferredGoogleOrigin]);

  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';

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
    localStorage.removeItem('dashboard_cache_v1');
    localStorage.removeItem('xp_summary_cache');
    localStorage.setItem('user', JSON.stringify({ id: guestUserId, name: 'Гост', email: 'guest@local', picture: '', plan: 'free', isGuest: true }));
    trackEvent('login', { method: 'guest' }, { userId: guestUserId });
    navigate('/dashboard');
  };

  const handleEmailAuthSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('Email/password login is not available yet. Use Google login or guest access.');
  };

  const heroRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setMousePos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  }, []);

  const { scrollYProgress } = useScroll();
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -40]);

  const authRef = useRef<HTMLDivElement>(null);
  const scrollToAuth = () => authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="min-h-screen bg-[#090B12] text-white font-[Inter,ui-sans-serif,system-ui,sans-serif] overflow-hidden selection:bg-blue-600/30">
      <style>{`
        .lp-google-wrap > div { width: 100% !important; display: flex !important; justify-content: center !important; }
        .lp-grid-bg {
          background-size: 48px 48px;
          background-image:
            linear-gradient(to right, rgba(148,163,184,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148,163,184,0.04) 1px, transparent 1px);
        }
      `}</style>

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#0A0F1F]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#2563EB] border border-white/[0.08] shadow-[0_10px_30px_-24px_rgba(37,99,235,0.85)]">
              <span className="text-base font-semibold text-white">M</span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-white/90">MathPlatform</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-xs font-medium text-white/60 transition hover:border-white/[0.16] hover:text-white">
              Features
            </button>
            <button className="rounded-full bg-[#8b5cf6] px-4 py-2 text-xs font-semibold text-white shadow-[0_12px_40px_-24px_rgba(139,92,246,0.9)] transition hover:bg-[#7c3aed]">
              Get started
            </button>
          </div>
        </div>
      </header>

      <main className="relative pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(168,85,247,0.16),_transparent_24%)] opacity-90" />
        <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-[1600px] px-6 py-8 lg:px-10">
          <div className="grid w-full gap-8 lg:grid-cols-[1.6fr_1fr]">
            <Section className="space-y-10">
              <div className="space-y-6 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs uppercase tracking-[0.26em] text-sky-200 shadow-[0_0_0_1px_rgba(148,163,184,0.08)]">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_0_10px_rgba(56,189,248,0.25)]" />
                  Progress-first learning
                </div>
                <h1 className="text-[clamp(2.7rem,4vw,4rem)] font-semibold leading-[0.92] tracking-[-0.04em] text-white">
                  The math platform built for real progress.
                </h1>
                <p className="max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
                  Adaptive practice, instant feedback, and clear progress tracking — all in one modern learning experience designed for students and schools.
                </p>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    className="inline-flex h-14 items-center justify-center rounded-[16px] bg-[#8b5cf6] px-8 text-sm font-semibold text-white shadow-[0_18px_45px_-22px_rgba(139,92,246,0.9)] transition hover:bg-[#7c3aed]"
                  >
                    Get started
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-14 items-center justify-center rounded-[16px] border border-white/[0.08] bg-white/[0.03] px-8 text-sm text-white/70 transition hover:border-white/[0.16] hover:text-white"
                  >
                    Learn more
                  </button>
                </div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                className="overflow-hidden rounded-[30px] border border-white/[0.08] bg-[#0d1126]/90 shadow-[0_35px_90px_-50px_rgba(15,23,42,0.9)]"
              >
                <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#0c1327] px-5 py-4">
                  <div className="flex gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                  </div>
                  <div className="mx-auto max-w-[260px] rounded-full bg-white/[0.05] px-3 py-1 text-[11px] text-white/30">
                    mathplatform.app/dashboard
                  </div>
                  <div className="flex gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.12]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/[0.08]" />
                  </div>
                </div>
                <div className="flex min-h-[440px]">
                  <div className="hidden w-16 flex-col items-center gap-4 border-r border-white/[0.04] bg-[#0a101f] py-6 px-2 sm:flex">
                    {['🏠', '📘', '✏️', '📈', '⚙️'].map((icon, index) => (
                      <div
                        key={index}
                        className={`flex h-11 w-11 items-center justify-center rounded-[16px] text-base ${
                          index === 0 ? 'bg-[#2563EB]/20 text-[#60a5fa]' : 'text-white/20'
                        }`}
                      >
                        {icon}
                      </div>
                    ))}
                    <div className="mt-auto h-3 w-3 rounded-full bg-[#60a5fa] shadow-[0_0_15px_rgba(96,165,250,0.35)]" />
                  </div>

                  <div className="flex-1 overflow-hidden p-5 sm:p-6">
                    <div className="grid gap-4">
                      <div className="grid gap-4 rounded-[24px] bg-gradient-to-r from-violet-600 via-indigo-600 to-sky-500 p-5 text-white shadow-[0_30px_60px_-30px_rgba(59,130,246,0.8)] sm:grid-cols-[1fr_auto]">
                        <div className="space-y-4">
                          <div className="h-3.5 w-48 rounded-full bg-white/30" />
                          <div className="h-2.5 w-36 rounded-full bg-white/25" />
                          <div className="h-2 w-40 rounded-full bg-white/20" />
                          <div className="flex flex-wrap gap-2 pt-2">
                            <span className="h-8 rounded-full bg-white/15 px-3 text-[11px] font-medium text-white/90">Progress</span>
                            <span className="h-8 rounded-full bg-white/15 px-3 text-[11px] font-medium text-white/90">Focus path</span>
                          </div>
                        </div>
                        <div className="grid gap-2 justify-items-end">
                          <span className="h-3 w-14 rounded-full bg-white/20" />
                          <div className="flex items-center gap-2">
                            <span className="h-3.5 w-14 rounded-full bg-white/20" />
                            <span className="h-3.5 w-8 rounded-full bg-white/20" />
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-4">
                        {['#60A5FA', '#F7C948', '#34D399', '#C084FC'].map((color, index) => (
                          <div key={index} className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-4">
                            <div className="h-2.5 w-10 rounded-full" style={{ backgroundColor: color }} />
                            <div className="mt-4 h-3 w-20 rounded-full bg-white/[0.14]" />
                            <div className="mt-2 h-2.5 w-14 rounded-full bg-white/[0.08]" />
                          </div>
                        ))}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        {[1, 2, 3].map((item) => (
                          <div key={item} className="rounded-[22px] border border-white/[0.06] bg-white/[0.03] p-5">
                            <div className="flex items-center justify-between">
                              <span
                                className={`h-3 w-3 rounded-full ${
                                  item === 1 ? 'bg-sky-400' : item === 2 ? 'bg-amber-400' : 'bg-cyan-400'
                                }`}
                              />
                              <div className="h-2 w-16 rounded-full bg-white/[0.1]" />
                            </div>
                            <div className="mt-5 space-y-3">
                              <div className="h-3 w-24 rounded-full bg-white/[0.12]" />
                              <div className="h-2.5 w-full rounded-full bg-white/[0.08]" />
                              <div className="h-2.5 w-[80%] rounded-full bg-white/[0.08]" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </Section>

            <Section ref={authRef} className="flex items-center justify-center">
              <div className="w-full max-w-md rounded-[32px] border border-white/[0.08] bg-[#0f172a]/95 p-8 shadow-2xl shadow-black/30 backdrop-blur-sm">
                <div className="mb-8">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#2563EB]/10 text-[#60a5fa] shadow-[0_10px_30px_-16px_rgba(96,165,250,0.65)]">
                      <span className="text-lg font-semibold">∑</span>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.24em] text-sky-300/80">Student access</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">Log in to continue</h2>
                    </div>
                  </div>
                </div>

                <div className="mb-6 flex items-center gap-2 rounded-[16px] bg-white/[0.04] p-1.5">
                  {(['login', 'signup'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setAuthTab(tab)}
                      className={`flex-1 rounded-[14px] px-4 py-3 text-sm font-semibold transition ${
                        authTab === tab
                          ? 'bg-[#111827] text-white shadow-inner shadow-white/5'
                          : 'text-white/50 hover:text-white'
                      }`}
                    >
                      {tab === 'login' ? 'Log in' : 'Sign up'}
                    </button>
                  ))}
                </div>

                <form className="space-y-5" onSubmit={handleEmailAuthSubmit}>
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Email address</label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40">📧</span>
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-[18px] border border-white/[0.08] bg-[#111827] py-4 pl-12 pr-4 text-sm text-white outline-none transition focus:border-[#8b5cf6]/70 focus:ring-2 focus:ring-[#8b5cf6]/15"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Password</label>
                      <button type="button" className="text-xs text-sky-300/80 hover:text-sky-200">
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/40">🔒</span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-[18px] border border-white/[0.08] bg-[#111827] py-4 pl-12 pr-12 text-sm text-white outline-none transition focus:border-[#8b5cf6]/70 focus:ring-2 focus:ring-[#8b5cf6]/15"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/50 hover:text-white"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full rounded-[18px] bg-[#8b5cf6] py-4 text-sm font-semibold text-white transition hover:bg-[#7c3aed]"
                  >
                    Continue
                  </button>
                </form>

                <div className="my-6 flex items-center gap-3 text-xs text-white/40">
                  <span className="h-px flex-1 bg-white/[0.08]" />
                  <span>or continue with</span>
                  <span className="h-px flex-1 bg-white/[0.08]" />
                </div>

                <div className="space-y-4">
                  <div className="lp-google-wrap relative">
                    <GoogleLogin
                      onSuccess={handleGoogleSuccess}
                      onError={() =>
                        setError(`Неуспешен Google вход за origin: ${runtimeOrigin}. Добави този origin в Google Cloud OAuth настройките.`)
                      }
                      theme="outline"
                      size="large"
                      shape="rectangular"
                      width="360"
                      text="continue_with"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGuestAccess}
                    className="w-full rounded-[18px] border border-white/[0.08] bg-white/[0.04] py-4 text-sm font-semibold text-white/75 transition hover:bg-white/[0.06]"
                  >
                    Continue as guest
                  </button>
                </div>

                {error && (
                  <div className="mt-6 rounded-[18px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {error}
                  </div>
                )}

                <p className="mt-6 text-center text-[11px] leading-relaxed text-white/25">
                  {t('auth_terms')}
                </p>
              </div>
            </Section>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
'''
path.write_text(content, encoding='utf-8')
