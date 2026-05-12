import React, { useRef, useState } from 'react';
import { analyzeMathImage, type MathAnalysisResult } from '../services/nvo';
import { renderMathText } from './MathRenderer';

type Status = 'idle' | 'analyzing' | 'done' | 'error';

const confidenceColor = {
  high: 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800',
  medium: 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800',
  low: 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/30 dark:border-red-800',
};

const confidenceLabel = { high: 'Висока точност', medium: 'Средна точност', low: 'Ниска точност' };

interface Props {
  /** If provided, this image is auto-loaded (from phone pairing) and analyzed */
  autoImage?: { dataUrl: string; deviceName: string; sentAt: string } | null;
}

const MathVisionPanel: React.FC<Props> = ({ autoImage }) => {
  const [image, setImage] = useState<string | null>(null);
  const [imageSource, setImageSource] = useState<'upload' | 'phone' | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [result, setResult] = useState<MathAnalysisResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const lastAutoUrlRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!autoImage) return;
    if (autoImage.dataUrl === lastAutoUrlRef.current) return;
    lastAutoUrlRef.current = autoImage.dataUrl;
    setImage(autoImage.dataUrl);
    setImageSource('phone');
    setResult(null);
    setStatus('idle');
    setErrorMsg('');
  }, [autoImage]);

  const runAnalysis = async (dataUrl: string) => {
    setStatus('analyzing');
    setResult(null);
    setErrorMsg('');
    try {
      const res = await analyzeMathImage(dataUrl);
      setResult(res);
      setStatus('done');
    } catch {
      setErrorMsg('Грешка при анализа. Опитайте отново.');
      setStatus('error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImage(reader.result);
        setImageSource('upload');
        setResult(null);
        setStatus('idle');
        setErrorMsg('');
      }
    };
    reader.readAsDataURL(file);
    e.currentTarget.value = '';
  };

  const clear = () => {
    setImage(null);
    setImageSource(null);
    setResult(null);
    setStatus('idle');
    setErrorMsg('');
    lastAutoUrlRef.current = null;
  };

  return (
    <div className="space-y-4">
      {/* Upload area */}
      {!image ? (
        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/60 px-6 py-10 text-center transition-colors hover:border-blue-400 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-blue-400">
          <span className="text-3xl">📷</span>
          <div>
            <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">Качи снимка на математически текст</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">JPG, PNG, HEIC · до 10 MB</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
        </label>
      ) : (
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <img src={image} alt="Снимка за анализ" className="max-h-72 w-full object-contain bg-slate-50 dark:bg-slate-950" />
            {imageSource === 'phone' && (
              <div className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                📱 От телефон
              </div>
            )}
            <button
              type="button"
              onClick={clear}
              className="absolute top-2 right-2 rounded-full bg-white/90 px-2 py-1 text-xs font-semibold text-slate-600 shadow hover:text-red-600 dark:bg-slate-800/90 dark:text-slate-300"
            >
              ✕ Изчисти
            </button>
          </div>

          <button
            type="button"
            onClick={() => runAnalysis(image)}
            disabled={status === 'analyzing'}
            className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {status === 'analyzing' ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                AI анализира...
              </span>
            ) : '🔍 Извлечи математически текст'}
          </button>
        </div>
      )}

      {/* Result */}
      {status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {status === 'done' && result && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">AI извличане</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${confidenceColor[result.confidence]}`}>
              {confidenceLabel[result.confidence]}
            </span>
          </div>
          <div className="min-h-[80px] rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 whitespace-pre-wrap">
            {renderMathText(result.extracted_text)}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(result.extracted_text)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              📋 Копирай
            </button>
            <button
              type="button"
              onClick={() => image && runAnalysis(image)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:border-blue-300 hover:text-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              🔄 Анализирай отново
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MathVisionPanel;
