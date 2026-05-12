import React from 'react';
import { useNavigate } from 'react-router-dom';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#e8f8f0] flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-20 bg-white border-b border-[#d4eae2]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex h-16 items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="text-lg font-bold tracking-tight text-[#1c4270] hover:text-[#2a7a8c] transition-colors"
          >
            SMART NVO ∑
          </button>
          <span className="hidden sm:block text-xs font-medium text-[#7ab5a0]">5–7 клас</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-xl border border-[#d4eae2] shadow-sm p-8">
          <h1 className="text-2xl font-bold text-[#1c4270] mb-1">Регистрация</h1>
          <p className="text-sm text-[#3d6b5e] mb-6">Създай профил, за да следиш напредъка си</p>

          <form className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#2a7a8c] mb-1">Име</label>
              <input
                type="text"
                placeholder="Иван Иванов"
                className="w-full rounded-lg border border-[#c8e8d8] bg-[#f0fbf6] px-3 py-2.5 text-sm text-[#1c4270] placeholder-[#7ab5a0] outline-none focus:border-[#5bba8e] focus:ring-2 focus:ring-[#5bba8e]/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2a7a8c] mb-1">Имейл</label>
              <input
                type="email"
                placeholder="ime@primer.bg"
                className="w-full rounded-lg border border-[#c8e8d8] bg-[#f0fbf6] px-3 py-2.5 text-sm text-[#1c4270] placeholder-[#7ab5a0] outline-none focus:border-[#5bba8e] focus:ring-2 focus:ring-[#5bba8e]/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2a7a8c] mb-1">Парола</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#c8e8d8] bg-[#f0fbf6] px-3 py-2.5 text-sm text-[#1c4270] placeholder-[#7ab5a0] outline-none focus:border-[#5bba8e] focus:ring-2 focus:ring-[#5bba8e]/20 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#2a7a8c] mb-1">Потвърди парола</label>
              <input
                type="password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-[#c8e8d8] bg-[#f0fbf6] px-3 py-2.5 text-sm text-[#1c4270] placeholder-[#7ab5a0] outline-none focus:border-[#5bba8e] focus:ring-2 focus:ring-[#5bba8e]/20 transition-colors"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-[#1c4270] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2a7a8c] transition-colors"
            >
              Регистрирай се
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#d4eae2] flex items-center justify-between gap-3">
            <p className="text-xs text-[#7ab5a0]">Вече имаш акаунт?</p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="rounded-lg border border-[#b8ddd0] bg-white px-3 py-1.5 text-xs font-semibold text-[#2a7a8c] hover:bg-[#e8f8f0] hover:border-[#5bba8e] transition-colors"
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
