import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
import { motion } from 'framer-motion';
import { API_BASE_URL } from '../services/api';
import { trackEvent } from '../services/analytics';

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

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>('bg');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    <div className="min-h-screen bg-[#0a0e1a] text-[#F8FAFC] font-[Inter,ui-sans-serif,system-ui,sans-serif] overflow-hidden selection:bg-blue-600/30">
      <style>{`
        .lp-google-wrap > div { width: 100% !important; display: flex !important; justify-content: center !important; }
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
              onClick={() => navigate('/register')}
              className="rounded-[12px] border border-white/[0.1] bg-transparent px-4 py-2 text-sm font-medium text-white/70 transition-colors duration-150 hover:bg-white/[0.05] hover:text-white"
            >
              {t('auth_register')}
            </button>
            <button
              onClick={() => navigate('/login')}
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
          className="hidden lg:flex lg:w-[62%] flex-col justify-center px-12 xl:px-20"
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
            className="relative z-10 space-y-8"
          >
            {/* Category Badge */}
            <motion.div
              variants={fadeUp}
              custom={1}
              className="inline-flex items-center rounded-full border border-[#2563EB]/30 bg-[#2563EB]/10 px-4 py-1.5"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#60a5fa]">
                {lang === 'bg' ? 'ПОДГОТОВКА ЗА НВО' : 'NVO PREPARATION'}
              </span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              variants={fadeUp}
              custom={2}
              className="text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.1] tracking-tight text-white"
            >
              {t('hero_h1_a')}{' '}
              <span className="text-white/40">{t('hero_h1_b')}</span>
            </motion.h1>

            {/* Supporting Description */}
            <motion.p
              variants={fadeUp}
              custom={3}
              className="max-w-xl text-sm leading-relaxed text-white/50"
            >
              {t('hero_sub')}
            </motion.p>

            {/* Dashboard Preview Mockup */}
            <motion.div
              variants={fadeUp}
              custom={4}
              className="mt-8 overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0d1424] shadow-2xl shadow-black/40"
            >
              {/* Browser Chrome */}
              <div className="flex items-center gap-2 border-b border-white/[0.06] bg-[#111827] px-4 py-3">
                {/* Window Controls */}
                <div className="flex gap-1.5">
                  <span className="h-3 w-3 rounded-full bg-red-500/80" />
                  <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
                  <span className="h-3 w-3 rounded-full bg-green-500/80" />
                </div>
                {/* Address Bar */}
                <div className="ml-4 flex-1 rounded-md bg-white/[0.05] border border-white/[0.06] px-4 py-1.5">
                  <span className="text-[11px] text-white/20 font-medium">smartnvo.vercel.app/dashboard</span>
                </div>
                {/* Utility Indicators */}
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-white/10" />
                  <span className="h-2 w-2 rounded-full bg-white/10" />
                  <span className="h-2 w-2 rounded-full bg-white/10" />
                </div>
              </div>

              {/* Dashboard Body */}
              <div className="flex" style={{ minHeight: 320 }}>
                {/* Sidebar Navigation */}
                <div className="hidden sm:flex w-14 flex-col items-center gap-3 border-r border-white/[0.05] bg-[#0F172A] py-5 px-2">
                  {['🏠','📖','✏️','📝','📈'].map((ic, i) => (
                    <div key={i} className={`flex h-9 w-9 items-center justify-center rounded-[10px] text-base ${
                      i === 0 ? 'bg-[#2563EB]/20 text-[#2563EB]' : 'text-white/20'
                    }`}>{ic}</div>
                  ))}
                  <div className="mt-auto h-2 w-2 rounded-full bg-white/10" />
                </div>

                {/* Main Content Area */}
                <div className="flex-1 overflow-hidden p-5 space-y-4">
                  {/* Featured Banner Card */}
                  <div className="rounded-[12px] bg-gradient-to-r from-[#2563EB] to-[#7c3aed] p-5">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <div className="h-2 w-32 rounded-full bg-white/30" />
                        <div className="h-1.5 w-48 rounded-full bg-white/20" />
                        <div className="h-1.5 w-24 rounded-full bg-white/20" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-6 w-16 rounded-full bg-white/20" />
                        <div className="h-6 w-16 rounded-full bg-white/20" />
                      </div>
                    </div>
                  </div>

                  {/* Statistics / Summary Cards */}
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { color: 'bg-[#2563EB]' },
                      { color: 'bg-[#60a5fa]' },
                      { color: 'bg-[#2563EB]' },
                      { color: 'bg-[#f59e0b]' },
                    ].map((c, i) => (
                      <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-3">
                        <div className={`h-2 w-6 rounded-full ${c.color} mb-2`} />
                        <div className="h-1.5 w-full rounded-full bg-white/10 mb-1" />
                        <div className="h-1.5 w-3/4 rounded-full bg-white/10" />
                      </div>
                    ))}
                  </div>

                  {/* Lower Dashboard Cards */}
                  <div className="grid grid-cols-3 gap-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="rounded-[10px] border border-white/[0.06] bg-white/[0.03] p-4">
                        <div className="h-2 w-8 rounded-full bg-white/15 mb-3" />
                        <div className="space-y-2">
                          <div className="h-1.5 w-full rounded-full bg-white/08" />
                          <div className="h-1.5 w-5/6 rounded-full bg-white/08" />
                          <div className="h-1.5 w-4/6 rounded-full bg-white/08" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
              <button className="flex-1 rounded-[10px] bg-white/[0.08] px-4 py-2 text-xs font-medium text-white">
                {t('auth_login')}
              </button>
              <button
                onClick={() => navigate('/register')}
                className="flex-1 rounded-[10px] px-4 py-2 text-xs font-medium text-white/40 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white/60"
              >
                {t('auth_register')}
              </button>
            </div>

            {/* Google button */}
            <div className="space-y-3">
              <div className="lp-google-wrap relative">
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[12px] bg-white">
                    <svg className="h-5 w-5 animate-spin text-[#0F172A]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="ml-2 text-sm font-medium text-[#0F172A]">{t('auth_loading')}</span>
                  </div>
                )}
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
                className="flex h-11 w-full items-center justify-center rounded-[12px] border border-white/[0.1] bg-transparent text-sm font-medium text-white/50 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                {t('auth_guest')}
              </button>
              <p className="text-center text-[10px] text-white/25">{t('auth_guest_h')}</p>
            </div>

            {/* Divider */}
            <div className="my-6 flex items-center">
              <div className="flex-1 border-t border-white/[0.06]" />
              <span className="mx-4 text-[10px] text-white/30">{lang === 'bg' ? 'ИЛИ' : 'OR'}</span>
              <div className="flex-1 border-t border-white/[0.06]" />
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
              <button className="flex-1 rounded-[10px] bg-white/[0.08] px-4 py-2 text-xs font-medium text-white">
                {t('auth_login')}
              </button>
              <button
                onClick={() => navigate('/register')}
                className="flex-1 rounded-[10px] px-4 py-2 text-xs font-medium text-white/40 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white/60"
              >
                {t('auth_register')}
              </button>
            </div>

            {/* Google button */}
            <div className="space-y-3">
              <div className="lp-google-wrap relative">
                {loading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[12px] bg-white">
                    <svg className="h-5 w-5 animate-spin text-[#0F172A]" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    <span className="ml-2 text-sm font-medium text-[#0F172A]">{t('auth_loading')}</span>
                  </div>
                )}
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
                className="flex h-11 w-full items-center justify-center rounded-[12px] border border-white/[0.1] bg-transparent text-sm font-medium text-white/50 transition-colors duration-150 hover:bg-white/[0.04] hover:text-white/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
              >
                {t('auth_guest')}
              </button>
              <p className="text-center text-[10px] text-white/25">{t('auth_guest_h')}</p>
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center">
              <div className="flex-1 border-t border-white/[0.06]" />
              <span className="mx-4 text-[10px] text-white/30">{lang === 'bg' ? 'ИЛИ' : 'OR'}</span>
              <div className="flex-1 border-t border-white/[0.06]" />
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
