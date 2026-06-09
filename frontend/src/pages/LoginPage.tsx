import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../services/api';
import { trackEvent } from '../services/analytics';
import DashboardPreviewMockup from '../components/DashboardPreviewMockup';

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

type Lang = 'bg' | 'en';

const T: Record<string, Record<Lang, string>> = {
  nav_grades:    { bg: '5–7 клас', en: 'Grades 5–7' },
  nav_login:     { bg: 'Вход', en: 'Sign in' },
  hero_h1_a:     { bg: 'Подготовка за НВО', en: 'Prepare for НВО' },
  hero_h1_b:     { bg: 'без стрес', en: 'without stress' },
  hero_sub:      { bg: 'Подробни уроци, интерактивни тестове и задачи по модела на НВО за 5.–7. клас.', en: 'Detailed lessons, interactive tests and tasks in the НВО format for grades 5–7.' },
  hero_cta:      { bg: 'Започни безплатно', en: 'Start for free' },
  feat_title:    { bg: 'Всичко необходимо за подготовка', en: 'Everything you need to prepare' },
  feat_sub:      { bg: 'Структурирана платформа, създадена от учители и технолози за ежедневна работа.', en: 'A structured platform built by teachers and engineers for daily practice.' },
  f1_t:          { bg: 'Пробни НВО изпити', en: 'Practice НВО exams' },
  f1_d:          { bg: 'Решавай пълни изпити по реалния формат с автоматично оценяване и обратна връзка.', en: 'Take full exams in the real format with automatic grading and feedback.' },
  f2_t:          { bg: 'Упражнения по теми', en: 'Topic exercises' },
  f2_d:          { bg: 'Целенасочена практика по всяка тема от учебната програма за 5–7 клас.', en: 'Targeted practice on every topic from the 5–7 grade curriculum.' },
  f3_t:          { bg: 'Анализ на прогреса', en: 'Progress analytics' },
  f3_d:          { bg: 'Детайлна статистика по теми, слаби зони и тенденции в представянето.', en: 'Detailed statistics by topic, weak areas, and performance trends.' },
  f4_t:          { bg: 'AI обяснения', en: 'AI explanations' },
  f4_d:          { bg: 'Получи стъпкови обяснения и насоки за всяка задача, 24/7.', en: 'Get step-by-step explanations and guidance for every problem, 24/7.' },
  f5_t:          { bg: 'Теория и уроци', en: 'Theory & lessons' },
  f5_d:          { bg: 'Цялата учебна програма, структурирана по теми с ясни обяснения.', en: 'The full curriculum, organized by topic with clear explanations.' },
  f6_t:          { bg: 'Снимай и реши', en: 'Snap & solve' },
  f6_d:          { bg: 'Фотографирай задача от учебник и получи решение веднага.', en: 'Photograph a textbook problem and get the solution instantly.' },
  how_title:     { bg: 'Как работи', en: 'How it works' },
  how_sub:       { bg: 'Три стъпки до по-добра подготовка за НВО.', en: 'Three steps to better НВО preparation.' },
  h1_t:          { bg: 'Създай профил', en: 'Create a profile' },
  h1_d:          { bg: 'Регистрация с Google за секунди. Без формуляри, без чакане.', en: 'Sign up with Google in seconds. No forms, no waiting.' },
  h2_t:          { bg: 'Избери тема или изпит', en: 'Choose a topic or exam' },
  h2_d:          { bg: 'Започни с пробно НВО или упражнения по конкретна тема.', en: 'Start with a practice НВО or exercises on a specific topic.' },
  h3_t:          { bg: 'Проследявай прогреса', en: 'Track your progress' },
  h3_d:          { bg: 'Виж резултатите си, анализирай грешките и подобрявай се всеки ден.', en: 'See your results, analyze mistakes, and improve every day.' },
  auth_h:        { bg: 'Започни подготовката', en: 'Start preparing' },
  auth_sub:      { bg: 'Подготви се уверено за Националното външно оценяване с тестове, практика и проследяване на прогреса.', en: 'Prepare confidently for the National External Assessment with tests, practice, and progress tracking.' },
  auth_google:   { bg: 'Продължи с Google', en: 'Continue with Google' },
  auth_loading:  { bg: 'Свързване...', en: 'Connecting...' },
  auth_guest:    { bg: 'Продължи като гост', en: 'Continue as guest' },
  auth_guest_h:  { bg: 'Разгледай платформата без регистрация.', en: 'Explore the platform without signing up.' },
  auth_login:    { bg: 'Вход', en: 'Sign in' },
  auth_register: { bg: 'Регистрация', en: 'Sign up' },
  auth_terms:    { bg: 'С продължаване приемаш условията за ползване. Платформата е за образователни цели.', en: 'By continuing you accept the terms of service. The platform is for educational purposes.' },
  footer:        { bg: '© 2026 SMART NVO. Всички права запазени.', en: '© 2026 SMART NVO. All rights reserved.' },
};


/* ═══════════════════════════════════════════════════════════════════════════
   ANIMATION HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

const FEATURES = [
  { key: 'f1', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { key: 'f2', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
  { key: 'f3', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { key: 'f4', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { key: 'f5', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { key: 'f6', icon: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z' },
];

const STEPS = [
  { key: 'h1', num: '01' },
  { key: 'h2', num: '02' },
  { key: 'h3', num: '03' },
];

const BTN_SECONDARY_BASE =
  'flex h-11 w-full items-center justify-center rounded-[12px] border border-white/[0.1] bg-transparent text-sm font-medium text-white/50 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';
const BTN_SECONDARY = `${BTN_SECONDARY_BASE} hover:bg-white/[0.04] hover:text-white/70`;

type AuthGoogleButtonProps = {
  loading: boolean;
  loadingLabel: string;
  label: string;
  onSuccess: (credentialResponse: CredentialResponse) => void;
  onError: () => void;
};

function AuthGoogleButton({ loading, loadingLabel, label, onSuccess, onError }: AuthGoogleButtonProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(el.offsetWidth, 200));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} className="group relative h-11 w-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[12px] border border-white/[0.1] bg-[#0a0e1a]/90 backdrop-blur-sm">
          <svg className="h-5 w-5 animate-spin text-white/70" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
          <span className="ml-2 text-sm font-medium text-white/70">{loadingLabel}</span>
        </div>
      )}
      <div className={`pointer-events-none ${BTN_SECONDARY_BASE} group-hover:bg-white/[0.04] group-hover:text-white/70`} aria-hidden="true">
        {label}
      </div>
      <div className="lp-google-overlay absolute inset-0 z-[1]">
        <GoogleLogin
          onSuccess={onSuccess}
          onError={onError}
          theme="outline"
          size="large"
          shape="rectangular"
          width={String(width)}
          text="continue_with"
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('bg');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [formData, setFormData] = useState({ email: '', password: '', confirmPassword: '' });

  const t = useCallback((key: string) => T[key]?.[lang] ?? key, [lang]);

  // --- redirect 127.0.0.1 → localhost ---
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

  // --- auth handlers (unchanged logic) ---
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
    // Clear all user-specific caches to prevent data leakage from previous user
    localStorage.removeItem('dashboard_cache_v1');
    localStorage.removeItem('xp_summary_cache');
    localStorage.setItem('user', JSON.stringify({ id: guestUserId, name: 'Гост', email: 'guest@local', picture: '', plan: 'free', isGuest: true }));
    trackEvent('login', { method: 'guest' }, { userId: guestUserId });
    navigate('/dashboard');
  };

  // --- mouse-follow ambient light ---
  const heroRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50 });
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    setMousePos({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  }, []);

  const authRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-[#F8FAFC] font-[Inter,ui-sans-serif,system-ui,sans-serif] selection:bg-blue-600/30">
      <style>{`
        .lp-google-overlay { opacity: 0.011; overflow: hidden; cursor: pointer; }
        .lp-google-overlay > div { width: 100% !important; height: 100% !important; display: flex !important; }
        .lp-google-overlay iframe { width: 100% !important; min-height: 44px !important; }
        .lp-grid-bg {
          background-size: 48px 48px;
          background-image:
            linear-gradient(to right, rgba(148,163,184,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(148,163,184,0.03) 1px, transparent 1px);
        }
      `}</style>

      {/* ─── NAVBAR ──────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#0a0e1a]/80 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between px-6 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#2563EB] border border-[#2563EB]/30">
              <span className="text-sm font-semibold text-white">∑</span>
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white">SMART NVO</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Language switcher */}
            <div className="hidden sm:flex items-center rounded-[12px] border border-white/[0.08] bg-white/[0.04] p-0.5">
              {(['bg', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    lang === l
                      ? 'bg-white/[0.1] text-white shadow-sm'
                      : 'text-white/40 hover:text-white/60'
                  }`}
                >
                  {l === 'bg' ? 'Български' : 'English'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setAuthMode('login')}
              className="rounded-[12px] bg-gradient-to-r from-[#2563EB] to-[#7c3aed] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:from-[#1d4ed8] hover:to-[#6d28d9]"
            >
              {t('auth_login')}
            </button>
          </div>
        </div>
      </header>

      {/* ─── SPLIT SCREEN LAYOUT ──────────────────────────────────────── */}
      <div className="flex min-h-screen pt-16 lp-grid-bg">
        {/* ─── LEFT REGION: MARKETING & PRODUCT SHOWCASE ──────────────────── */}
        <div
          ref={heroRef}
          onMouseMove={handleMouseMove}
          className="hidden lg:flex lg:w-[62%] min-h-[calc(100vh-4rem)] flex-col justify-start px-12 xl:px-20 pt-16 pb-8"
        >
          {/* Ambient light follow */}
          <div
            className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-700"
            style={{
              background: `radial-gradient(600px circle at ${mousePos.x}% ${mousePos.y}%, rgba(37,99,235,0.05), transparent 60%)`,
            }}
          />

          <motion.div
            initial="hidden"
            animate="visible"
            className="relative z-10 flex flex-1 min-h-0 flex-col space-y-3"
          >
            {/* Main Headline */}
            <motion.h1
              variants={fadeUp}
              custom={1}
              className="text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-white"
            >
              {t('hero_h1_a')}{' '}
              <span className="text-white/40">{t('hero_h1_b')}</span>
            </motion.h1>

            {/* Supporting Description */}
            <motion.p
              variants={fadeUp}
              custom={2}
              className="max-w-xl text-sm leading-relaxed text-white/50"
            >
              {t('hero_sub')}
            </motion.p>

            {/* Dashboard Preview Mockup */}
            <motion.div variants={fadeUp} custom={3} className="mt-4 flex-1 min-h-[460px]">
              <DashboardPreviewMockup />
            </motion.div>
          </motion.div>
        </div>

        {/* ─── RIGHT REGION: AUTHENTICATION PANEL ──────────────────────────── */}
        <div className="flex-1 flex items-center justify-center px-6 lg:px-0 lg:pr-20">
          <motion.div
            ref={authRef}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="w-full max-w-md rounded-[16px] border border-white/[0.08] bg-[#111827]/60 p-8 backdrop-blur-xl shadow-2xl shadow-black/30"
          >
            {/* Logo */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#2563EB] border border-[#2563EB]/30 mb-3">
                <span className="text-lg font-semibold text-white">∑</span>
              </div>
              <h2 className="text-lg font-bold tracking-tight text-white">{t('auth_h')}</h2>
              <p className="mt-1.5 text-xs leading-relaxed text-white/40 max-w-xs">{t('auth_sub')}</p>
            </div>

            {/* Authentication Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 rounded-[10px] px-4 py-2 text-xs font-medium transition-all duration-150 ${
                  authMode === 'login'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/60'
                }`}
              >
                {t('auth_login')}
              </button>
              <button
                onClick={() => setAuthMode('register')}
                className={`flex-1 rounded-[10px] px-4 py-2 text-xs font-medium transition-all duration-150 ${
                  authMode === 'register'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/60'
                }`}
              >
                {t('auth_register')}
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 mb-6">
              <div>
                <input
                  type="email"
                  placeholder={lang === 'bg' ? 'Имейл' : 'Email'}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-colors duration-150 focus:border-[#2563EB]/50 focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder={lang === 'bg' ? 'Парола' : 'Password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-colors duration-150 focus:border-[#2563EB]/50 focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20"
                />
              </div>
              {authMode === 'register' && (
                <div>
                  <input
                    type="password"
                    placeholder={lang === 'bg' ? 'Потвърди парола' : 'Confirm password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-colors duration-150 focus:border-[#2563EB]/50 focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20"
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => {
                if (authMode === 'register') {
                  // Handle register
                  setError('Регистрацията все още не е имплементирана');
                } else {
                  // Handle login - for now just show error
                  setError('Моля, използвайте Google вход или продължи като гост');
                }
              }}
              className="mb-6 flex h-11 w-full items-center justify-center rounded-[12px] bg-gradient-to-r from-[#2563EB] to-[#7c3aed] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:from-[#1d4ed8] hover:to-[#6d28d9]"
            >
              {authMode === 'login' ? t('auth_login') : t('auth_register')}
            </button>

            {/* Divider */}
            <div className="my-6 flex items-center">
              <div className="flex-1 border-t border-white/[0.06]" />
              <span className="mx-4 text-[10px] text-white/30">{lang === 'bg' ? 'ИЛИ' : 'OR'}</span>
              <div className="flex-1 border-t border-white/[0.06]" />
            </div>

            {/* Google button */}
            <div className="space-y-3">
              <AuthGoogleButton
                loading={loading}
                loadingLabel={t('auth_loading')}
                label={t('auth_google')}
                onSuccess={handleGoogleSuccess}
                onError={() =>
                  setError(`Неуспешен Google вход за origin: ${runtimeOrigin}. Добави този origin в Google Cloud OAuth настройките.`)
                }
              />

              <button
                type="button"
                onClick={handleGuestAccess}
                className={BTN_SECONDARY}
              >
                {t('auth_guest')}
              </button>
              <p className="text-center text-[10px] text-white/25">{t('auth_guest_h')}</p>
            </div>

            {error && (
              <div className="mb-4 rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <p className="text-center text-[10px] leading-relaxed text-white/25">{t('auth_terms')}</p>
          </motion.div>
        </div>
      </div>

      {/* ─── FEATURES SECTION ────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 lg:px-10 py-20">
        <motion.div variants={fadeUp} className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('feat_title')}</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/40">{t('feat_sub')}</p>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.key}
              variants={fadeUp}
              custom={i}
              className="group rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-6 transition-colors duration-200 hover:bg-white/[0.04] hover:border-white/[0.1]"
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[10px] bg-[#2563EB]/10 border border-[#2563EB]/15">
                <svg className="h-5 w-5 text-[#2563EB]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-white">{t(`${f.key}_t`)}</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/35">{t(`${f.key}_d`)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── HOW IT WORKS SECTION ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 lg:px-10 py-20">
        <motion.div variants={fadeUp} className="mx-auto max-w-2xl text-center mb-16">
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{t('how_title')}</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/40">{t('how_sub')}</p>
        </motion.div>
        <div className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.key}
              variants={fadeUp}
              custom={i}
              className="relative rounded-[16px] border border-white/[0.06] bg-white/[0.02] p-6"
            >
              <span className="text-xs font-bold text-[#2563EB]/60 tracking-wider">{s.num}</span>
              <h3 className="mt-3 text-sm font-semibold text-white">{t(`${s.key}_t`)}</h3>
              <p className="mt-2 text-xs leading-relaxed text-white/35">{t(`${s.key}_d`)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ─── FOOTER ──────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-white/[0.06]">
              <span className="text-[10px] font-semibold text-white/60">∑</span>
            </div>
            <span className="text-xs text-white/30">{t('footer')}</span>
          </div>
        </div>
      </footer>

      {/* ─── MOBILE VERSION ────────────────────────────────────────────── */}
      <div className="lg:hidden flex flex-col items-center justify-center min-h-screen px-6 pt-16 pb-8">
        <motion.div
          initial="hidden"
          animate="visible"
          className="w-full max-w-md space-y-6"
        >
          {/* Logo */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#2563EB] border border-[#2563EB]/30 mb-4">
              <span className="text-xl font-semibold text-white">∑</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{t('hero_h1_a')}</h1>
            <p className="mt-2 text-sm text-white/50">{t('hero_sub')}</p>
          </div>

          {/* Auth Card */}
          <motion.div
            ref={authRef}
            variants={fadeUp}
            className="rounded-[16px] border border-white/[0.08] bg-[#111827]/60 p-6 backdrop-blur-xl shadow-2xl shadow-black/30"
          >
            {/* Authentication Tabs */}
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setAuthMode('login')}
                className={`flex-1 rounded-[10px] px-4 py-2 text-xs font-medium transition-all duration-150 ${
                  authMode === 'login'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/60'
                }`}
              >
                {t('auth_login')}
              </button>
              <button
                onClick={() => setAuthMode('register')}
                className={`flex-1 rounded-[10px] px-4 py-2 text-xs font-medium transition-all duration-150 ${
                  authMode === 'register'
                    ? 'bg-white/[0.08] text-white'
                    : 'text-white/40 hover:bg-white/[0.04] hover:text-white/60'
                }`}
              >
                {t('auth_register')}
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-4 mb-5">
              <div>
                <input
                  type="email"
                  placeholder={lang === 'bg' ? 'Имейл' : 'Email'}
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-colors duration-150 focus:border-[#2563EB]/50 focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20"
                />
              </div>
              <div>
                <input
                  type="password"
                  placeholder={lang === 'bg' ? 'Парола' : 'Password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-colors duration-150 focus:border-[#2563EB]/50 focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20"
                />
              </div>
              {authMode === 'register' && (
                <div>
                  <input
                    type="password"
                    placeholder={lang === 'bg' ? 'Потвърди парола' : 'Confirm password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 transition-colors duration-150 focus:border-[#2563EB]/50 focus:outline-none focus:ring-1 focus:ring-[#2563EB]/20"
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={() => {
                if (authMode === 'register') {
                  setError('Регистрацията все още не е имплементирана');
                } else {
                  setError('Моля, използвайте Google вход или продължи като гост');
                }
              }}
              className="mb-5 flex h-11 w-full items-center justify-center rounded-[12px] bg-gradient-to-r from-[#2563EB] to-[#7c3aed] px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:from-[#1d4ed8] hover:to-[#6d28d9]"
            >
              {authMode === 'login' ? t('auth_login') : t('auth_register')}
            </button>

            {/* Divider */}
            <div className="my-5 flex items-center">
              <div className="flex-1 border-t border-white/[0.06]" />
              <span className="mx-4 text-[10px] text-white/30">{lang === 'bg' ? 'ИЛИ' : 'OR'}</span>
              <div className="flex-1 border-t border-white/[0.06]" />
            </div>

            {/* Google button */}
            <div className="space-y-3">
              <AuthGoogleButton
                loading={loading}
                loadingLabel={t('auth_loading')}
                label={t('auth_google')}
                onSuccess={handleGoogleSuccess}
                onError={() =>
                  setError(`Неуспешен Google вход за origin: ${runtimeOrigin}. Добави този origin в Google Cloud OAuth настройките.`)
                }
              />

              <button
                type="button"
                onClick={handleGuestAccess}
                className={BTN_SECONDARY}
              >
                {t('auth_guest')}
              </button>
              <p className="text-center text-[10px] text-white/25">{t('auth_guest_h')}</p>
            </div>

            {error && (
              <div className="mb-4 rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <p className="text-center text-[10px] leading-relaxed text-white/25">{t('auth_terms')}</p>
          </motion.div>

          {/* Mobile language switcher */}
          <div className="flex items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.04] p-0.5 w-fit mx-auto">
            {(['bg', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`rounded-[8px] px-3 py-1 text-[11px] font-medium transition-all duration-150 ${
                  lang === l ? 'bg-white/[0.1] text-white' : 'text-white/40 hover:text-white/60'
                }`}
              >
                {l === 'bg' ? 'Български' : 'English'}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
