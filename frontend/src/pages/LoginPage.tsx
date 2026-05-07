import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import type { CredentialResponse } from '@react-oauth/google';
import { API_BASE_URL } from '../services/api';
import { trackEvent } from '../services/analytics';
import { REALTIME_AVAILABLE } from '../services/socket';

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
    <div className="lp-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

        * { box-sizing: border-box; }

        .lp-root {
          --sp-bg: #fffafb;
          --sp-bg-secondary: #fff1f6;
          --sp-surface: #ffffff;
          --sp-border: #f2d7e1;
          --sp-toolbar: #5a3e49;
          --sp-brand: #cc4b7a;
          --sp-brand-soft: #fbe3ec;
          --sp-text: #32232a;
          --sp-muted: #705761;

          min-height: 100dvh;
          background: linear-gradient(180deg, var(--sp-bg) 0%, var(--sp-bg-secondary) 100%);
          color: var(--sp-text);
          font-family: 'Inter', 'Segoe UI', sans-serif;
          position: relative;
          overflow-x: hidden;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }

        .lp-particle-layer {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }

        .lp-particle {
          position: absolute;
          top: -48px;
          color: #c55a83;
          user-select: none;
          animation-name: lp-fall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        @keyframes lp-fall {
          0% {
            transform: translateY(-10vh) rotate(0deg);
            opacity: 0;
          }
          12% {
            opacity: var(--op);
          }
          85% {
            opacity: var(--op);
          }
          100% {
            transform: translateY(110vh) rotate(14deg);
            opacity: 0;
          }
        }

        .lp-toolbar {
          height: 56px;
          background: var(--sp-toolbar);
          border-bottom: 1px solid #4f3640;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 20px;
          position: relative;
          z-index: 2;
          gap: 10px;
        }

        .lp-logo {
          margin: 0;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          white-space: nowrap;
        }

        .lp-grade-tag {
          font-size: 0.8rem;
          color: #d4d4d4;
        }

        .lp-toolbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .lp-mobile-connect-btn {
          display: none;
          border: 0;
          border-radius: 14px;
          background: linear-gradient(180deg, #22c55e 0%, #16a34a 100%);
          color: #ffffff;
          font-weight: 800;
          font-size: 0.9rem;
          padding: 10px 16px;
          box-shadow: 0 10px 24px rgba(22, 163, 74, 0.28);
        }

        .lp-mobile-connect-btn:active {
          transform: translateY(1px);
        }

        .lp-main {
          width: 100%;
          max-width: 1120px;
          margin: 0 auto;
          padding: 32px 20px 40px;
          position: relative;
          z-index: 2;
        }

        .lp-hero-wrap {
          display: flex;
          gap: 24px;
          align-items: stretch;
          margin-bottom: 24px;
        }

        .lp-intro {
          flex: 1 1 58%;
          border: 1px solid var(--sp-border);
          background: var(--sp-surface);
          padding: 32px;
          border-radius: 12px;
        }

        .lp-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid var(--sp-border);
          background: #fff5f8;
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 0.74rem;
          font-weight: 600;
          color: #7a4e5d;
          margin-bottom: 16px;
        }

        .lp-title {
          margin: 0;
          font-size: clamp(2rem, 4vw, 3.1rem);
          line-height: 1.06;
          letter-spacing: -0.02em;
          font-weight: 800;
        }

        .lp-title-mark {
          color: var(--sp-brand);
        }

        .lp-subtitle {
          margin: 12px 0 0;
          max-width: 56ch;
          color: var(--sp-muted);
          font-size: 1rem;
          line-height: 1.58;
        }

        .lp-points {
          margin: 18px 0 0;
          padding: 0;
          list-style: none;
          display: grid;
          gap: 8px;
        }

        .lp-points li {
          border: 1px solid var(--sp-border);
          border-radius: 8px;
          background: #fff8fa;
          padding: 12px;
          font-size: 0.92rem;
          color: #4c333d;
        }

        .lp-card {
          flex: 1 1 42%;
          border: 1px solid var(--sp-border);
          background: var(--sp-surface);
          border-radius: 12px;
          padding: 24px;
        }

        .lp-card-title {
          margin: 0;
          font-size: 1.2rem;
          font-weight: 700;
        }

        .lp-card-sub {
          margin: 8px 0 16px;
          color: var(--sp-muted);
          font-size: 0.92rem;
        }

        .lp-form {
          display: grid;
          gap: 12px;
          margin-bottom: 16px;
        }

        .lp-field {
          display: grid;
          gap: 6px;
        }

        .lp-label {
          margin: 0;
          font-size: 0.82rem;
          color: #5d4750;
          font-weight: 600;
        }

        .lp-input {
          width: 100%;
          border: 1px solid var(--sp-border);
          background: #fffcfd;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 0.92rem;
          color: var(--sp-text);
          outline: none;
          transition: border-color 0.16s ease, background 0.16s ease;
        }

        .lp-input:focus {
          border-color: #dd86a6;
          background: #ffffff;
        }

        .lp-submit-btn {
          width: 100%;
          border: 1px solid #c9688e;
          background: var(--sp-brand);
          color: #ffffff;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 0.92rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.16s ease;
        }

        .lp-submit-btn:hover {
          background: #b7406d;
        }

        .lp-submit-btn:disabled {
          background: #d99ab2;
          border-color: #d99ab2;
          cursor: not-allowed;
        }

        .lp-separator {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 12px 0;
        }

        .lp-separator::before,
        .lp-separator::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--sp-border);
        }

        .lp-separator span {
          font-size: 0.76rem;
          color: #7d626d;
        }

        .lp-error {
          margin-top: 12px;
          padding: 10px 12px;
          border: 1px solid #f5c2c7;
          background: #fdf2f2;
          color: #8a1c1c;
          border-radius: 8px;
          font-size: 0.86rem;
        }

        .lp-loading {
          margin-top: 10px;
          color: var(--sp-muted);
          font-size: 0.86rem;
        }

        .lp-terms {
          margin-top: 14px;
          color: #777;
          font-size: 0.75rem;
          line-height: 1.45;
        }

        .lp-google-wrap > div {
          width: 100% !important;
          display: flex !important;
          justify-content: center !important;
        }

        .lp-guest-btn {
          width: 100%;
          margin-top: 12px;
          border: 1px solid var(--sp-border);
          background: #fff3f7;
          color: #4b3440;
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.16s ease, background 0.16s ease;
        }
        .lp-guest-btn:hover {
          border-color: #e8bfd0;
          background: #ffeaf1;
        }

        .lp-signup-row {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid var(--sp-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .lp-signup-text {
          margin: 0;
          font-size: 0.82rem;
          color: #6a535d;
        }

        .lp-signup-btn {
          border: 1px solid var(--sp-border);
          background: #ffffff;
          color: #583a46;
          border-radius: 8px;
          padding: 8px 12px;
          font-size: 0.82rem;
          font-weight: 600;
          cursor: pointer;
          transition: border-color 0.16s ease, background 0.16s ease;
        }

        .lp-signup-btn:hover {
          border-color: #e0a8be;
          background: #fff7fa;
        }

        .lp-features {
          border: 1px solid var(--sp-border);
          background: var(--sp-surface);
          border-radius: 12px;
          padding: 24px;
        }

        .lp-features-title {
          margin: 0 0 14px;
          font-size: 1.05rem;
          font-weight: 700;
        }

        .lp-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
          gap: 12px;
        }

        .lp-feature-card {
          border: 1px solid var(--sp-border);
          background: #fff9fb;
          border-radius: 10px;
          padding: 12px;
        }

        .lp-feature-title {
          margin: 0 0 6px;
          font-size: 0.94rem;
          font-weight: 600;
          color: #202020;
        }

        .lp-feature-desc {
          margin: 0;
          font-size: 0.84rem;
          color: var(--sp-muted);
          line-height: 1.45;
        }

        .lp-footer {
          margin-top: 24px;
          border-top: 1px solid var(--sp-border);
          padding-top: 16px;
          font-size: 0.78rem;
          color: #6f6f6f;
          text-align: center;
        }

        @media (max-width: 920px) {
          .lp-hero-wrap {
            flex-direction: column;
          }
        }

        @media (max-width: 1024px) {
          .lp-toolbar {
            padding: 10px 12px;
            height: auto;
            min-height: 56px;
            flex-wrap: wrap;
          }

          .lp-toolbar-right {
            gap: 8px;
            margin-left: auto;
          }

          .lp-mobile-connect-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 0.82rem;
            padding: 8px 12px;
            border-radius: 12px;
          }

          .lp-grade-tag {
            display: none;
          }

          .lp-logo {
            font-size: 0.92rem;
          }

          .lp-mobile-connect-btn {
            min-height: 40px;
          }

          .lp-main {
            width: 100%;
          }
        }

        @media (max-width: 768px) {

          .lp-main {
            padding: 16px 12px 26px;
          }

          .lp-hero-wrap {
            gap: 14px;
            margin-bottom: 14px;
          }

          .lp-intro,
          .lp-card,
          .lp-features {
            padding: 16px;
            border-radius: 10px;
          }

          .lp-kicker {
            font-size: 0.68rem;
            padding: 4px 10px;
            margin-bottom: 12px;
          }

          .lp-title {
            font-size: clamp(1.45rem, 7vw, 2rem);
            line-height: 1.12;
          }

          .lp-subtitle {
            font-size: 0.9rem;
            line-height: 1.45;
          }

          .lp-signup-row {
            flex-direction: column;
            align-items: stretch;
          }

          .lp-signup-btn {
            width: 100%;
          }

          .lp-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <header className="lp-toolbar">
        <h1 className="lp-logo">SMART NVO ∑</h1>
        <div className="lp-toolbar-right">
          <span className="lp-grade-tag">5-7 клас</span>
          {REALTIME_AVAILABLE && (
            <button type="button" className="lp-mobile-connect-btn" onClick={() => navigate('/controller')}>
              Свържи телефон
            </button>
          )}
        </div>
      </header>

      <div className="lp-particle-layer" aria-hidden="true">
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

      <main className="lp-main">
        <section className="lp-hero-wrap">
          <article className="lp-intro">
            <span className="lp-kicker">Онлайн платформа по математика</span>
            <h2 className="lp-title">
              Подготовка за НВО с ясен план и <span className="lp-title-mark">точни резултати</span>
            </h2>
            <p className="lp-subtitle">
              Учи по теми за 5-7 клас, решавай задачи и следи напредъка си в една среда.
              Платформата е създадена за ежедневна работа и бърза подготовка.
            </p>
            <ul className="lp-points">
              <li>Персонализирани упражнения по ниво</li>
              <li>Пробни НВО формати с оценяване</li>
              <li>Анализ на грешките и насоки за следващи стъпки</li>
            </ul>
          </article>

          <article className="lp-card">
            <p className="lp-card-title">Вход в профила</p>
            <p className="lp-card-sub">Влез с имейл и парола или използвай Google</p>

            <form className="lp-form" onSubmit={handleManualSignIn}>
              <div className="lp-field">
                <label className="lp-label" htmlFor="email">Имейл</label>
                <input
                  id="email"
                  className="lp-input"
                  type="email"
                  autoComplete="email"
                  placeholder="ime@primer.bg"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>

              <div className="lp-field">
                <label className="lp-label" htmlFor="password">Парола</label>
                <input
                  id="password"
                  className="lp-input"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Въведи парола"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>

              <button type="submit" className="lp-submit-btn" disabled={manualLoading || loading}>
                {manualLoading ? 'Влизане...' : 'Вход'}
              </button>
            </form>

            <div className="lp-separator">
              <span>или</span>
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

            <button type="button" className="lp-guest-btn" onClick={handleGuestAccess}>
              Продължи като гост
            </button>

            <div className="lp-signup-row">
              <p className="lp-signup-text">Нямаш акаунт?</p>
              <button type="button" className="lp-signup-btn" onClick={() => navigate('/register')}>
                Регистрирай се
              </button>
            </div>

            {(loading || manualLoading) && <p className="lp-loading">Влизане...</p>}
            {error && <p className="lp-error">{error}</p>}

            <p className="lp-terms">
              С влизане приемаш условията за ползване.<br />
              Платформата е за образователни цели.
            </p>
          </article>
        </section>

        <section className="lp-features">
          <h3 className="lp-features-title">Какво получаваш</h3>
          <div className="lp-grid">
            {features.map((f) => (
              <div key={f.title} className="lp-feature-card">
                <p className="lp-feature-title">{f.title}</p>
                <p className="lp-feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="lp-footer">
          2026 SMART NVO. Всички права запазени.
        </footer>
      </main>
    </div>
  );
};

export default LoginPage;

