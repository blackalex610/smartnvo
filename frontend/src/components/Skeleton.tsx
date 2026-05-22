import React from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
   SKELETON SYSTEM
   Reusable shimmer primitives + page-level skeleton screens.
   Usage:
     <Bone className="h-4 w-32 rounded" />          ← single shimmer block
     <SkeletonText lines={3} />                      ← paragraph placeholder
     <SkeletonCard>…</SkeletonCard>                  ← card wrapper
     <NVODashboardSkeleton />                        ← full page skeleton
   ───────────────────────────────────────────────────────────────────────────── */

/* ── Shimmer animation injected once ───────────────────────────────────────── */
const SHIMMER_STYLE = `
@keyframes sk-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px  0; }
}
.sk-shimmer {
  background: linear-gradient(
    90deg,
    rgba(148,163,184,0.10) 25%,
    rgba(148,163,184,0.22) 50%,
    rgba(148,163,184,0.10) 75%
  );
  background-size: 800px 100%;
  animation: sk-shimmer 1.6s ease-in-out infinite;
}
.dark .sk-shimmer {
  background: linear-gradient(
    90deg,
    rgba(51,65,85,0.30) 25%,
    rgba(71,85,105,0.50) 50%,
    rgba(51,65,85,0.30) 75%
  );
  background-size: 800px 100%;
}
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.textContent = SHIMMER_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
}

/* ── Bone ── single shimmer block ─────────────────────────────────────────── */
export function Bone({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  injectStyle();
  return <div className={`sk-shimmer rounded ${className}`} style={style} />;
}

/* ── SkeletonText ── paragraph lines ─────────────────────────────────────── */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Bone
          key={i}
          className={`h-3 rounded-full ${i === lines - 1 ? 'w-3/5' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/* ── SkeletonCard ── card-shaped wrapper ──────────────────────────────────── */
export function SkeletonCard({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800/60 ${className}`}>
      {children}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   PAGE-LEVEL SKELETONS
   ════════════════════════════════════════════════════════════════════════════ */

/* ── NVO Dashboard skeleton ─────────────────────────────────────────────── */
export function NVODashboardSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-[fadeIn_0.3s_ease]">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <Bone className="h-7 w-64" />
        <div className="flex gap-3">
          <Bone className="h-10 w-28 rounded-xl" />
          <Bone className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Bone className="h-3 w-24 mb-3" />
            <Bone className="h-9 w-16" />
          </SkeletonCard>
        ))}
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left */}
        <SkeletonCard>
          <Bone className="h-5 w-40 mb-5" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-2">
                <div className="flex justify-between">
                  <Bone className="h-3 w-28" />
                  <Bone className="h-3 w-12" />
                </div>
                <div className="flex gap-2">
                  <Bone className="h-2.5 w-20" />
                  <Bone className="h-2.5 w-20" />
                  <Bone className="h-2.5 w-14" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>

        {/* Right */}
        <SkeletonCard>
          <Bone className="h-5 w-32 mb-5" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-700 p-4 space-y-2">
                <div className="flex justify-between">
                  <Bone className="h-3 w-36" />
                  <Bone className="h-3 w-8" />
                </div>
                <Bone className="h-2.5 w-full" />
              </div>
            ))}
          </div>
          <Bone className="mt-5 h-11 w-full rounded-xl" />
        </SkeletonCard>
      </div>
    </div>
  );
}

/* ── NVO Exam question skeleton ──────────────────────────────────────────── */
export function NVOExamSkeleton() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-[fadeIn_0.3s_ease]">
      {/* Module header */}
      <div className="mb-6 flex items-center gap-4">
        <Bone className="h-6 w-32" />
        <Bone className="h-6 w-24" />
        <Bone className="h-6 w-20 ml-auto" />
      </div>

      {/* Question number + text */}
      <SkeletonCard className="mb-6">
        <Bone className="h-3 w-20 mb-4" />
        <SkeletonText lines={4} className="mb-6" />

        {/* MCQ options */}
        <div className="space-y-3">
          {['A', 'B', 'C', 'D'].map((k) => (
            <div key={k} className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <Bone className="h-5 w-5 rounded-full shrink-0" />
              <Bone className="h-3 flex-1 rounded-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Bone className="h-10 w-24 rounded-xl" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bone key={i} className="h-8 w-8 rounded-lg" />
          ))}
        </div>
        <Bone className="h-10 w-24 rounded-xl" />
      </div>
    </div>
  );
}

/* ── Progress / Stats skeleton ──────────────────────────────────────────── */
export function ProgressSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-[fadeIn_0.3s_ease]">
      {/* Page title */}
      <div className="mb-8 space-y-2">
        <Bone className="h-8 w-52" />
        <Bone className="h-3 w-80" />
      </div>

      {/* Top stat row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Bone className="h-3 w-20 mb-3" />
            <Bone className="h-8 w-14 mb-1" />
            <Bone className="h-2 w-full rounded-full" />
          </SkeletonCard>
        ))}
      </div>

      {/* Chart placeholder */}
      <SkeletonCard className="mb-8">
        <Bone className="h-5 w-44 mb-6" />
        <div className="flex items-end gap-3 h-36">
          {[60, 80, 45, 90, 70, 55, 85].map((h, i) => (
            <Bone key={i} className="flex-1 rounded-t-lg" style={{ height: `${h}%` } as React.CSSProperties} />
          ))}
        </div>
      </SkeletonCard>

      {/* Topic rows */}
      <SkeletonCard>
        <Bone className="h-5 w-36 mb-5" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="flex justify-between">
                <Bone className="h-3 w-36" />
                <Bone className="h-3 w-10" />
              </div>
              <Bone className="h-2 w-full rounded-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </div>
  );
}

/* ── Topics page skeleton ────────────────────────────────────────────────── */
export function TopicsSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-transparent animate-[fadeIn_0.3s_ease]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8 space-y-2">
          <Bone className="h-8 w-48" />
          <Bone className="h-3 w-64" />
        </div>

        {/* Topic cards grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} className="space-y-3">
              <div className="flex items-center gap-3">
                <Bone className="h-9 w-9 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Bone className="h-3.5 w-3/4" />
                  <Bone className="h-2.5 w-1/2" />
                </div>
              </div>
              <Bone className="h-2 w-full rounded-full" />
              <div className="flex justify-between">
                <Bone className="h-2.5 w-20" />
                <Bone className="h-2.5 w-12" />
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── ActivityFeed skeleton ───────────────────────────────────────────────── */
export function ActivityFeedSkeleton() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800/60">
      <Bone className="h-4 w-28 mb-4" />
      <ul className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3">
            <Bone className="h-7 w-7 rounded-lg shrink-0" />
            <Bone className="h-3 flex-1" />
            <Bone className="h-3 w-14 shrink-0" />
            <Bone className="h-3 w-16 shrink-0" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Theory content skeleton ─────────────────────────────────────────────── */
export function TheoryContentSkeleton() {
  return (
    <div className="space-y-4 animate-[fadeIn_0.3s_ease]">
      <Bone className="h-4 w-3/4" />
      <SkeletonText lines={5} />
      <Bone className="h-4 w-1/2 mt-6" />
      <SkeletonText lines={4} />
      <Bone className="h-20 w-full rounded-xl" />
      <SkeletonText lines={3} />
    </div>
  );
}

/* ── Video grid skeleton ─────────────────────────────────────────────────── */
export function VideoGridSkeleton({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-[fadeIn_0.3s_ease]">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <Bone className="h-40 w-full rounded-none" />
          <div className="p-3 space-y-1.5">
            <Bone className="h-3 w-4/5" />
            <Bone className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}
