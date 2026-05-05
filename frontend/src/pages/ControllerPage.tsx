import React from 'react';
import type { ActiveTestProblem } from '../services/activeTest';
import { createSocketClient, emitJoinRoom, emitSubmitAnswerImage, type PairedDevice, type PairingSocket } from '../services/socket';

type ProblemUploadState = {
  image: string;
  status: 'empty' | 'uploaded';
};

const ControllerPage: React.FC = () => {
  const [controllerState, setControllerState] = React.useState<'pairing' | 'waiting' | 'test'>('pairing');
  const [pairingCode, setPairingCode] = React.useState('');
  const [status, setStatus] = React.useState<'idle' | 'connecting' | 'connected' | 'invalid'>('idle');
  const [activeTestProblems, setActiveTestProblems] = React.useState<ActiveTestProblem[]>([]);
  const [problemUploads, setProblemUploads] = React.useState<Record<number, ProblemUploadState>>({});
  const [device, setDevice] = React.useState<PairedDevice | null>(null);
  const socketRef = React.useRef<PairingSocket | null>(null);
  const fileInputRefs = React.useRef<Record<number, HTMLInputElement | null>>({});

  React.useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    setProblemUploads((current) => {
      const next: Record<number, ProblemUploadState> = {};
      activeTestProblems.forEach((problem) => {
        next[problem.id] = current[problem.id] ?? { image: '', status: 'empty' };
      });
      return next;
    });
  }, [activeTestProblems]);

  const ensureSocket = React.useCallback(() => {
    if (socketRef.current) return socketRef.current;

    const socket = createSocketClient();
    socket.on('disconnect', () => {
      setControllerState('pairing');
      setStatus('invalid');
      setDevice(null);
      setActiveTestProblems([]);
      setProblemUploads({});
    });
    socket.on('roomClosed', () => {
      setControllerState('pairing');
      setStatus('invalid');
      setDevice(null);
      setActiveTestProblems([]);
      setProblemUploads({});
    });
    socket.on('activeTestData', (payload: { problems?: ActiveTestProblem[] }) => {
      const nextProblems = Array.isArray(payload?.problems) ? payload.problems : [];
      setActiveTestProblems(nextProblems);
      setControllerState(nextProblems.length > 0 ? 'test' : 'waiting');
    });
    socket.on('answerReceived', (payload: { problemId?: number }) => {
      if (!Number.isFinite(payload?.problemId)) return;
      const problemId = Number(payload.problemId);
      setProblemUploads((current) => {
        const currentItem = current[problemId] ?? { image: '', status: 'empty' as const };
        return {
          ...current,
          [problemId]: {
            ...currentItem,
            status: 'uploaded',
          },
        };
      });
    });
    socketRef.current = socket;
    return socket;
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedCode = pairingCode.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setStatus('invalid');
      return;
    }

    setStatus('connecting');

    const socket = ensureSocket();
    if (!socket.connected) {
      await new Promise<void>((resolve) => {
        socket.once('connect', () => resolve());
      });
    }

    const response = await emitJoinRoom(socket, normalizedCode);
    if (!response.ok || !response.device) {
      setStatus('invalid');
      setDevice(null);
      return;
    }

    setDevice(response.device);
    setStatus('connected');
    setControllerState('waiting');
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }
        reject(new Error('Invalid file result'));
      };
      reader.onerror = () => reject(new Error('Failed to read image'));
      reader.readAsDataURL(file);
    });
  };

  const openPhotoCapture = (problemId: number) => {
    fileInputRefs.current[problemId]?.click();
  };

  const handleFileSelected = async (problemId: number, file: File | null) => {
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProblemUploads((current) => ({
        ...current,
        [problemId]: {
          image: dataUrl,
          status: 'uploaded',
        },
      }));

      const socket = socketRef.current;
      if (socket?.connected) {
        const response = await emitSubmitAnswerImage(socket, { problemId, image: dataUrl });
        if (response.ok) {
          setProblemUploads((current) => ({
            ...current,
            [problemId]: {
              image: dataUrl,
              status: 'uploaded',
            },
          }));
          return;
        }
      }

      setProblemUploads((current) => ({
        ...current,
        [problemId]: {
          image: '',
          status: 'empty',
        },
      }));
    } catch {
      setProblemUploads((current) => ({
        ...current,
        [problemId]: {
          image: '',
          status: 'empty',
        },
      }));
    }
  };

  const statusText =
    status === 'connecting'
      ? 'Connecting...'
      : status === 'connected'
        ? 'Connected'
        : status === 'invalid'
          ? 'Invalid code'
          : 'Enter your 6-digit code to join';

  const renderPairingScreen = () => (
    <>
      <h1 className="text-center text-2xl font-bold text-gray-900 dark:text-slate-100">Enter Pairing Code</h1>
      <p className="mt-2 text-center text-sm text-gray-500 dark:text-slate-400">Use the 6-digit code shown on desktop.</p>

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        <input
          inputMode="numeric"
          pattern="[0-9]*"
          value={pairingCode}
          onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="123456"
          className="h-16 w-full rounded-2xl border border-gray-200 bg-white px-4 text-center text-3xl font-black tracking-[0.35em] text-slate-900 outline-none transition-all duration-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/20"
        />

        <button
          type="submit"
          disabled={status === 'connecting'}
          className="h-14 w-full rounded-2xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === 'connecting' ? 'Connecting...' : 'Join'}
        </button>
      </form>

      <div
        className={`mt-5 rounded-2xl border px-4 py-3 text-center text-sm font-semibold transition-all duration-200 ${
          status === 'connected'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
            : status === 'invalid'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
        {statusText}
      </div>
    </>
  );

  const renderWaitingScreen = () => (
    <>
      <h1 className="text-center text-2xl font-bold text-gray-900 dark:text-slate-100">Connected</h1>
      <p className="mt-2 text-center text-sm text-gray-500 dark:text-slate-400">Waiting for test to start...</p>
      <div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-center dark:border-blue-900/40 dark:bg-blue-950/30">
        <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Waiting for test to start...</p>
        {device ? <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">{device.name}</p> : null}
      </div>
    </>
  );

  const renderTestScreen = () => (
    <>
      <h1 className="text-center text-2xl font-bold text-gray-900 dark:text-slate-100">Test Mode</h1>
      <div className="mt-5 space-y-4">
        {activeTestProblems.map((problem) => {
          const upload = problemUploads[problem.id] ?? { image: '', status: 'empty' as const };
          return (
            <div key={problem.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">Problem {problem.id}</p>
              {upload.status === 'uploaded' ? (
                <div className="mt-3 space-y-3">
                  <img src={upload.image} alt={`Problem ${problem.id}`} className="w-full rounded-xl border border-slate-200 object-cover dark:border-slate-700" />
                  <button
                    type="button"
                    onClick={() => openPhotoCapture(problem.id)}
                    className="h-14 w-full rounded-2xl bg-emerald-600 px-4 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 active:scale-[0.99]"
                  >
                    Retake
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openPhotoCapture(problem.id)}
                  className="mt-3 h-14 w-full rounded-2xl bg-blue-600 px-4 text-base font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 active:scale-[0.99]"
                >
                  Take Photo
                </button>
              )}
              <input
                ref={(element) => {
                  fileInputRefs.current[problem.id] = element;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleFileSelected(problem.id, file);
                  event.currentTarget.value = '';
                }}
              />
            </div>
          );
        })}
        {activeTestProblems.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Waiting for test to start...
          </div>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-6 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm items-center justify-center">
        <div className="w-full rounded-3xl border border-gray-200 bg-white p-6 shadow-xl shadow-slate-900/10 transition-all duration-300 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30">
          {controllerState === 'pairing' && renderPairingScreen()}
          {controllerState === 'waiting' && renderWaitingScreen()}
          {controllerState === 'test' && renderTestScreen()}
        </div>
      </div>
    </div>
  );
};

export default ControllerPage;