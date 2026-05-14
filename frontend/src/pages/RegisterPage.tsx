import React from 'react';
import { useNavigate } from 'react-router-dom';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-lg font-bold tracking-tight text-[#1c4270] hover:text-slate-600 transition-colors"
          >
            SMART NVO ∑
          </button>
          <span className="hidden sm:block text-xs font-medium text-slate-400">5–7 клас</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <h1 className="text-2xl font-bold text-[#1c4270] mb-1">Регистрация</h1>
          <p className="text-sm text-slate-500 mb-6">Създай профил, за да следиш напредъка си</p>

          <form className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#1c4270] mb-1">Име</label>
              <input
                type="text"
                placeholder="Иван Иванов"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#1c4270] placeholder-slate-400 outline-none focus:border-[#1c4270] focus:ring-2 focus:ring-[#1c4270]/10 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1c4270] mb-1">Имейл</label>
              <input
                type="email"
                placeholder="ime@primer.bg"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#1c4270] placeholder-slate-400 outline-none focus:border-[#1c4270] focus:ring-2 focus:ring-[#1c4270]/10 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1c4270] mb-1">Парола</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#1c4270] placeholder-slate-400 outline-none focus:border-[#1c4270] focus:ring-2 focus:ring-[#1c4270]/10 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#1c4270] mb-1">Потвърди парола</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-[#1c4270] placeholder-slate-400 outline-none focus:border-[#1c4270] focus:ring-2 focus:ring-[#1c4270]/10 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#1c4270] px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
            >
              Регистрирай се
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-400">Вече имаш акаунт?</p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#1c4270] hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              Влез
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RegisterPage;
