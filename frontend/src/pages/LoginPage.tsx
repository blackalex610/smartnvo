import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';

// ─── Feature card data ────────────────────────────────────────────────────────
const features = [
  {
    icon: '🧠',
    title: 'AI Учител',
    desc: 'Получи обяснения, подсказки и решения от изкуствен интелект, 24/7.',
  },
  {
    icon: '📝',
    title: 'НВО Подготовка',
    desc: 'Пълни пробни изпити по формата на реалното НВО с автоматична оценка.',
  },
  {
    icon: '📊',
    title: 'Личен Прогрес',
    desc: 'Следи напредъка си по теми, упражнения и оценки на едно място.',
  },
  {
    icon: '📸',
    title: 'Снимай & Реши',
    desc: 'Снимай задача с телефона си и получи решение веднага.',
  },
  {
    icon: '📚',
    title: 'Учебна Програма',
    desc: 'Цялата учебна програма за 5–7 клас, структурирана по теми и уроци.',
  },
];

// ─── Floating math symbols ────────────────────────────────────────────────────
const SYMBOLS = ['∑', '∫', '√', 'π', '±', '∞', '∆', '÷', '×', '²', '³', 'θ'];

interface Particle {
  id: number;
  symbol: string;
  x: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function useParticles(count: number): Particle[] {
  return useRef<Particle[]>(
    Array.from({ length: count }, (_, i) => ({
      id: i,
      symbol: SYMBOLS[i % SYMBOLS.length],
      x: Math.random() * 100,
      size: 14 + Math.random() * 20,
      duration: 12 + Math.random() * 18,
      delay: Math.random() * -20,
      opacity: 0.06 + Math.random() * 0.12,
    }))
  ).current;
}

// ─── Component ────────────────────────────────────────────────────────────────
const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const particles = useParticles(18);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const preferredGoogleOrigin = import.meta.env.VITE_GOOGLE_AUTH_ORIGIN || 'http://localhost:5173';
  const runtimeOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
  const [visibleCards, setVisibleCards] = useState<boolean[]>(
    new Array(features.length).fill(false)
  );
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Intersection observer for card entrance animations
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const currentHost = window.location.hostname;
    if (currentHost !== '127.0.0.1') return;
    try {
      const target = new URL(preferredGoogleOrigin);
      const nextUrl = `${target.origin}${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (window.location.origin !== target.origin) {
        window.location.replace(nextUrl);
      }
    } catch {
      // Keep page functional even if env value is malformed.
    }
  }, [preferredGoogleOrigin]);

  useEffect(() => {
    const observers = cardRefs.current.map((ref, idx) => {
      if (!ref) return null;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisibleCards((prev) => {
              const next = [...prev];
              next[idx] = true;
              return next;
            });
            obs.disconnect();
          }
        },
        { threshold: 0.15 }
      );
      obs.observe(ref);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, []);

  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });
      if (!res.ok) throw new Error('Неуспешна автентикация');
      const data = await res.json();
      // Store JWT token and user profile
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Нещо се обърка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* ── Injected keyframe styles ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .login-page {
          min-height: 100vh;
          font-family: 'Inter', system-ui, sans-serif;
          background: #0a0a0f;
          color: #f0f0f5;
          overflow-x: hidden;
        }

        /* Gradient background */
        .lp-bg {
          position: fixed;
          inset: 0;
          z-index: 0;
          background:
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.25) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 90% 80%, rgba(168,85,247,0.15) 0%, transparent 55%),
            radial-gradient(ellipse 40% 35% at 10% 70%, rgba(59,130,246,0.12) 0%, transparent 55%),
            #0a0a0f;
        }

        /* Floating particles */
        .lp-particles { position: fixed; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
        .lp-particle {
          position: absolute;
          bottom: -40px;
          animation: floatUp linear infinite;
          user-select: none;
        }
        @keyframes floatUp {
          0%   { transform: translateY(0) rotate(0deg); opacity: var(--op); }
          50%  { transform: translateY(-45vh) rotate(180deg); opacity: calc(var(--op) * 1.4); }
          100% { transform: translateY(-110vh) rotate(360deg); opacity: 0; }
        }

        /* Nav */
        .lp-nav {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 48px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          backdrop-filter: blur(12px);
          background: rgba(10,10,15,0.5);
        }
        .lp-logo {
          font-size: 1.35rem;
          font-weight: 700;
          background: linear-gradient(135deg, #818cf8, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.02em;
        }
        .lp-nav-badge {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.35);
        }

        /* Hero */
        .lp-hero {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          padding: 80px 24px 60px;
          gap: 24px;
        }
        .lp-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 100px;
          border: 1px solid rgba(129,140,248,0.3);
          background: rgba(129,140,248,0.08);
          font-size: 0.8rem;
          font-weight: 500;
          color: #a5b4fc;
          letter-spacing: 0.04em;
          animation: fadeSlideDown 0.7s ease both;
        }
        .lp-eyebrow-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #818cf8;
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(129,140,248,0.6); }
          50%      { box-shadow: 0 0 0 6px rgba(129,140,248,0); }
        }
        .lp-h1 {
          font-size: clamp(2.4rem, 6vw, 4.2rem);
          font-weight: 800;
          line-height: 1.08;
          letter-spacing: -0.03em;
          animation: fadeSlideDown 0.7s 0.1s ease both;
        }
        .lp-h1 span {
          background: linear-gradient(135deg, #818cf8 0%, #c084fc 50%, #f472b6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .lp-subtitle {
          max-width: 520px;
          font-size: 1.05rem;
          line-height: 1.65;
          color: rgba(255,255,255,0.5);
          font-weight: 400;
          animation: fadeSlideDown 0.7s 0.2s ease both;
        }

        /* Login card */
        .lp-card {
          position: relative;
          z-index: 10;
          margin: 0 auto 80px;
          width: 100%;
          max-width: 400px;
          padding: 36px 32px;
          border-radius: 20px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.035);
          backdrop-filter: blur(24px);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset;
          animation: fadeSlideDown 0.7s 0.3s ease both;
        }
        .lp-card-title {
          font-size: 1.1rem;
          font-weight: 600;
          text-align: center;
          margin-bottom: 6px;
          color: rgba(255,255,255,0.9);
        }
        .lp-card-sub {
          font-size: 0.82rem;
          text-align: center;
          color: rgba(255,255,255,0.35);
          margin-bottom: 28px;
        }
        .lp-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 20px 0;
        }
        .lp-divider-line {
          flex: 1;
          height: 1px;
          background: rgba(255,255,255,0.08);
        }
        .lp-divider-text {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.25);
          white-space: nowrap;
        }
        .lp-error {
          margin-top: 14px;
          padding: 10px 14px;
          border-radius: 10px;
          background: rgba(239,68,68,0.12);
          border: 1px solid rgba(239,68,68,0.25);
          font-size: 0.82rem;
          color: #fca5a5;
          text-align: center;
          animation: fadeSlideDown 0.3s ease both;
        }
        .lp-loading {
          text-align: center;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.4);
          margin-top: 14px;
        }
        .lp-terms {
          margin-top: 16px;
          font-size: 0.72rem;
          text-align: center;
          color: rgba(255,255,255,0.2);
          line-height: 1.6;
        }

        /* Google button override */
        .lp-google-wrap > div {
          width: 100% !important;
          display: flex !important;
          justify-content: center !important;
        }

        /* Features section */
        .lp-features {
          position: relative;
          z-index: 10;
          max-width: 1100px;
          margin: 0 auto 100px;
          padding: 0 24px;
        }
        .lp-features-label {
          text-align: center;
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.25);
          margin-bottom: 16px;
        }
        .lp-features-title {
          text-align: center;
          font-size: clamp(1.6rem, 3.5vw, 2.4rem);
          font-weight: 700;
          letter-spacing: -0.02em;
          margin-bottom: 52px;
          color: rgba(255,255,255,0.88);
        }
        .lp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px;
        }
        .lp-feature-card {
          padding: 28px 26px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.06);
          background: rgba(255,255,255,0.025);
          backdrop-filter: blur(12px);
          transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
          opacity: 0;
          transform: translateY(28px);
        }
        .lp-feature-card.visible {
          animation: cardIn 0.55s ease forwards;
        }
        @keyframes cardIn {
          to { opacity: 1; transform: translateY(0); }
        }
        .lp-feature-card:hover {
          transform: translateY(-4px) !important;
          border-color: rgba(129,140,248,0.25);
          box-shadow: 0 16px 48px rgba(99,102,241,0.12);
        }
        .lp-feature-icon {
          font-size: 2rem;
          margin-bottom: 14px;
          display: block;
        }
        .lp-feature-title {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 8px;
          color: rgba(255,255,255,0.88);
        }
        .lp-feature-desc {
          font-size: 0.875rem;
          line-height: 1.6;
          color: rgba(255,255,255,0.4);
        }

        /* Footer */
        .lp-footer {
          position: relative;
          z-index: 10;
          text-align: center;
          padding: 32px 24px;
          border-top: 1px solid rgba(255,255,255,0.05);
          font-size: 0.78rem;
          color: rgba(255,255,255,0.2);
        }

        /* Animations */
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 600px) {
          .lp-nav { padding: 16px 20px; }
          .lp-hero { padding: 56px 16px 40px; }
          .lp-card { margin: 0 16px 60px; padding: 28px 20px; }
        }
      `}</style>

      {/* Background */}
      <div className="lp-bg" />

      {/* Floating particles */}
      <div className="lp-particles">
        {particles.map((p) => (
          <div
            key={p.id}
            className="lp-particle"
            style={{
              left: `${p.x}%`,
              fontSize: `${p.size}px`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              ['--op' as string]: p.opacity,
              color: 'rgba(129,140,248,1)',
            }}
          >
            {p.symbol}
          </div>
        ))}
      </div>

      {/* Nav */}
      <nav className="lp-nav">
        <span className="lp-logo">SMART NVO ∑</span>
        <span className="lp-nav-badge">5 – 7 клас</span>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-eyebrow">
          <span className="lp-eyebrow-dot" />
          AI-Powered платформа за математика
        </div>
        <h1 className="lp-h1">
          Математиката е<br />
          <span>по-лесна с AI</span>
        </h1>
        <p className="lp-subtitle">
          Интерактивно учене, НВО подготовка и персонален AI учител —
          всичко на едно място за ученици 5–7 клас.
        </p>
      </section>

      {/* Login card */}
      <div className="lp-card">
        <p className="lp-card-title">Добре дошъл 👋</p>
        <p className="lp-card-sub">Влез с Google за да започнеш</p>

        <div className="lp-google-wrap">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() =>
              setError(
                `Google login failed for origin: ${runtimeOrigin}. Add this exact origin in Google Cloud -> OAuth Client -> Authorized JavaScript origins.`
              )
            }
            theme="filled_black"
            size="large"
            shape="pill"
            text="continue_with"
          />
        </div>

        {loading && <p className="lp-loading">Влизаш…</p>}
        {error && <p className="lp-error">{error}</p>}

        <p className="lp-terms">
          Влизайки, приемаш условията за ползване.<br />
          Платформата е предназначена за образователни цели.
        </p>
      </div>

      {/* Features grid */}
      <section className="lp-features">
        <p className="lp-features-label">Функционалности</p>
        <h2 className="lp-features-title">Всичко, от което се нуждаеш</h2>
        <div className="lp-grid">
          {features.map((f, i) => (
            <div
              key={f.title}
              ref={(el) => { cardRefs.current[i] = el; }}
              className={`lp-feature-card${visibleCards[i] ? ' visible' : ''}`}
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span className="lp-feature-icon">{f.icon}</span>
              <p className="lp-feature-title">{f.title}</p>
              <p className="lp-feature-desc">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        © 2026 SMART NVO · Всички права запазени
      </footer>
    </div>
  );
};

export default LoginPage;

