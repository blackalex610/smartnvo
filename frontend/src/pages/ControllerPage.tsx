import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ActiveTestProblem } from '../services/activeTest';
import {
  createSocketClient,
  emitJoinRoom,
  emitSendImage,
  emitSubmitAnswerImage,
  REALTIME_AVAILABLE,
  SOCKET_SERVER_URL,
  type PairedDevice,
  type PairingSocket,
} from '../services/socket';

type ProblemUploadState = {
  image: string;
  status: 'empty' | 'uploaded';
};

const ControllerPage: React.FC = () => {
  const navigate = useNavigate();
  const [controllerState, setControllerState] = React.useState<'pairing' | 'waiting' | 'test'>('pairing');
  const [pairingCode, setPairingCode] = React.useState('');
  const [status, setStatus] = React.useState<
    'idle' | 'connecting' | 'connected' | 'invalid-code' | 'server-unavailable' | 'disconnected' | 'room-closed'
  >('idle');
  const [activeTestProblems, setActiveTestProblems] = React.useState<ActiveTestProblem[]>([]);
  const [problemUploads, setProblemUploads] = React.useState<Record<number, ProblemUploadState>>({});
  const [device, setDevice] = React.useState<PairedDevice | null>(null);
  const [quickPhotoStatus, setQuickPhotoStatus] = React.useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [autoPromptedQuickPhoto, setAutoPromptedQuickPhoto] = React.useState(false);
  const [statusDetail, setStatusDetail] = React.useState('');
  const socketRef = React.useRef<PairingSocket | null>(null);
  const fileInputRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
  const quickPhotoInputRef = React.useRef<HTMLInputElement | null>(null);

  const access = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return { allowed: false, reason: 'login' as const };
      const user = JSON.parse(raw) as { id?: string | number; isGuest?: boolean };
      if (!user?.id) return { allowed: false, reason: 'login' as const };
      if (user.isGuest) return { allowed: false, reason: 'guest' as const };
      return { allowed: true, reason: null };
    } catch {
      return { allowed: false, reason: 'login' as const };
    }
  }, []);

  React.useEffect(() => {
    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    if (controllerState !== 'waiting' || status !== 'connected' || autoPromptedQuickPhoto) {
      return;
    }

    setAutoPromptedQuickPhoto(true);
    // Trigger a one-time quick camera prompt after pairing for Settings preview testing.
    window.setTimeout(() => {
      quickPhotoInputRef.current?.click();
    }, 150);
  }, [autoPromptedQuickPhoto, controllerState, status]);

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
      setStatus('disconnected');
      setDevice(null);
      setActiveTestProblems([]);
      setProblemUploads({});
    });
    socket.on('roomClosed', () => {
      setControllerState('pairing');
      setStatus('room-closed');
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
    if (!REALTIME_AVAILABLE) {
      setStatus('server-unavailable');
      setStatusDetail(`No realtime URL configured. Set VITE_REALTIME_URL or VITE_SOCKET_URL. Current SOCKET_SERVER_URL: ${String(SOCKET_SERVER_URL ?? 'null')}`);
      return;
    }

    const normalizedCode = pairingCode.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setStatus('invalid-code');
      setStatusDetail(`"${normalizedCode}" is not a valid 6-digit code (${normalizedCode.length} char${normalizedCode.length !== 1 ? 's' : ''}, digits only).`);
      return;
    }

    setStatus('connecting');
    setStatusDetail('');

    const socket = ensureSocket();
    if (!socket.connected) {
      // Allow up to 15 s for Render free-tier cold start (can take 30-60 s on first wake-up;
      // 15 s covers the typical 10-12 s case and keeps UX tolerable).
      const connected = await new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 15000);
        socket.once('connect', () => {
          window.clearTimeout(timeout);
          resolve(true);
        });
        socket.once('connect_error', () => {
          window.clearTimeout(timeout);
          resolve(false);
        });
        socket.connect();
      });

      if (!connected) {
        setStatus('server-unavailable');
        setStatusDetail(`Socket could not connect within 15 s. Realtime URL: ${String(SOCKET_SERVER_URL ?? 'not configured')}. Check network and server.`);
        return;
      }
    }

    // Add a 10 s timeout for the join acknowledgement in case the server
    // accepts the socket but drops the event mid-flight (e.g. cold restart).
    const response = await Promise.race([
      emitJoinRoom(socket, normalizedCode),
      new Promise<{ ok: false; reason: 'TIMEOUT' }>((resolve) =>
        window.setTimeout(() => resolve({ ok: false, reason: 'TIMEOUT' }), 10000)
      ),
    ]);
    if (!response.ok || !('device' in response) || !response.device) {
      setStatus('invalid-code');
      const reason = (response as { reason?: string }).reason ?? 'UNKNOWN';
      if (reason === 'TIMEOUT') {
        setStatusDetail(`Join request timed out (10 s). Server may be cold-starting. URL: ${String(SOCKET_SERVER_URL ?? 'not configured')}`);
      } else if (reason === 'ROOM_NOT_FOUND') {
        setStatusDetail(`No open room found for code "${normalizedCode}". Make sure the desktop has an active pairing session.`);
      } else if (reason === 'INVALID_CODE') {
        setStatusDetail(`Server rejected code format. Code sent: "${normalizedCode}" (${normalizedCode.length} chars).`);
      } else {
        setStatusDetail(`Join failed — reason: ${reason}. Response: ${JSON.stringify(response)}`);
      }
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

  const openQuickPhotoCapture = () => {
    quickPhotoInputRef.current?.click();
  };

  const handleQuickPhotoSelected = async (file: File | null) => {
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setQuickPhotoStatus('sending');

      const socket = socketRef.current;
      if (!socket?.connected) {
        setQuickPhotoStatus('failed');
        return;
      }

      const response = await emitSendImage(socket, dataUrl);
      setQuickPhotoStatus(response.ok ? 'sent' : 'failed');
    } catch {
      setQuickPhotoStatus('failed');
    }
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
        : status === 'invalid-code'
          ? 'Invalid code'
          : status === 'server-unavailable'
            ? 'Realtime server unavailable'
            : status === 'disconnected'
              ? 'Connection lost'
              : status === 'room-closed'
                ? 'Desktop session ended'
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
            : status === 'invalid-code' || status === 'server-unavailable' || status === 'disconnected' || status === 'room-closed'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
              : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
        }`}
      >
          {statusText}
        {statusDetail && (
          <div className="mt-1 text-xs font-normal opacity-80 break-all">{statusDetail}</div>
        )}
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

      <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Quick test photo (Settings preview)</p>
        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
          After sending, check Settings on desktop. The image should appear under Latest phone photo.
        </p>
        <button
          type="button"
          onClick={openQuickPhotoCapture}
          className="mt-3 h-12 w-full rounded-2xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-emerald-700 active:scale-[0.99]"
        >
          Take Test Photo
        </button>
        <input
          ref={quickPhotoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void handleQuickPhotoSelected(file);
            event.currentTarget.value = '';
          }}
        />
        <p
          className={`mt-3 text-xs font-medium ${
            quickPhotoStatus === 'sent'
              ? 'text-emerald-700 dark:text-emerald-300'
              : quickPhotoStatus === 'failed'
                ? 'text-red-700 dark:text-red-300'
                : 'text-slate-600 dark:text-slate-300'
          }`}
        >
          {quickPhotoStatus === 'sending'
            ? 'Sending photo...'
            : quickPhotoStatus === 'sent'
              ? 'Photo sent successfully.'
              : quickPhotoStatus === 'failed'
                ? 'Failed to send photo. Try again.'
                : 'Camera opens automatically once after connect; you can retake anytime.'}
        </p>
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
          {!access.allowed && (
            <div className="space-y-4 text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Свързване не е разрешено</h1>
              <p className="text-sm text-gray-600 dark:text-slate-300">
                {access.reason === 'guest'
                  ? 'Гост профилите не могат да се свързват с desktop сесия. Влез с профил.'
                  : 'Трябва да влезеш в профил, за да свържеш телефона.'}
              </p>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="h-12 w-full rounded-2xl bg-emerald-600 px-4 text-base font-semibold text-white hover:bg-emerald-700"
              >
                Към вход
              </button>
            </div>
          )}
          {access.allowed && (
            <>
          {controllerState === 'pairing' && renderPairingScreen()}
          {controllerState === 'waiting' && renderWaitingScreen()}
          {controllerState === 'test' && renderTestScreen()}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ControllerPage;