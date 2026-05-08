import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSocketClient,
  emitActiveTestData,
  emitCreateRoom,
  generatePairingCode,
  getStoredPairingUserId,
  REALTIME_AVAILABLE,
  type PairingImagePayload,
  type PairedDevice,
  type PairingSocket,
  type RoomState,
} from '../services/socket';
import {
  ACTIVE_TEST_DATA_EVENT,
  readActiveTestData,
  type ActiveTestProblem,
} from '../services/activeTest';
import { TEST_ANSWER_IMAGE_EVENT, type SubmitAnswerImageEventPayload } from '../services/testAnswerSync';

type PairingStatus = 'idle' | 'connecting' | 'waiting' | 'paired' | 'error';

type PairingContextValue = {
  roomCode: string;
  devices: PairedDevice[];
  status: PairingStatus;
  error: string;
  latestImage: PairingImagePayload | null;
  ensureRoom: () => Promise<void>;
  regenerateRoom: () => Promise<void>;
};

const PairingContext = createContext<PairingContextValue | null>(null);

const roomStateToStatus = (devices: PairedDevice[]): PairingStatus => (devices.length > 0 ? 'paired' : 'waiting');

export const PairingProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [roomCode, setRoomCode] = useState('');
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [status, setStatus] = useState<PairingStatus>('idle');
  const [error, setError] = useState('');
  const [latestImage, setLatestImage] = useState<PairingImagePayload | null>(null);
  const socketRef = useRef<PairingSocket | null>(null);

  const pushActiveTestData = useCallback(async (socket: PairingSocket, problems?: ActiveTestProblem[]) => {
    const payload = problems ?? readActiveTestData();
    if (!socket.connected) return;
    await emitActiveTestData(socket, payload);
  }, []);

  const attachSocketListeners = useCallback((socket: PairingSocket) => {
    socket.removeAllListeners('playerJoined');
    socket.removeAllListeners('playerLeft');
    socket.removeAllListeners('roomState');
    socket.removeAllListeners('roomClosed');
    socket.removeAllListeners('disconnect');
    socket.removeAllListeners('connect_error');
    socket.removeAllListeners('sendImage');
    socket.removeAllListeners('submitAnswerImage');

    socket.on('playerJoined', (device: PairedDevice) => {
      setDevices((current) => {
        const next = current.some((item) => item.id === device.id) ? current : [...current, device];
        setStatus(roomStateToStatus(next));
        return next;
      });
      setError('');
      void pushActiveTestData(socket);
    });

    socket.on('playerLeft', ({ id }: { id: string }) => {
      setDevices((current) => {
        const next = current.filter((item) => item.id !== id);
        setStatus(roomStateToStatus(next));
        return next;
      });
    });

    socket.on('roomState', (payload: RoomState) => {
      setRoomCode(payload.roomCode || '');
      setDevices(payload.devices || []);
      setStatus(roomStateToStatus(payload.devices || []));
      setError('');
    });

    socket.on('roomClosed', () => {
      setDevices([]);
      setStatus('error');
      setError('The pairing room was closed. Generate a new code to reconnect.');
      setRoomCode('');
    });

    socket.on('disconnect', () => {
      setDevices([]);
      setStatus('error');
      setError('Realtime connection lost. Re-open pairing to generate a fresh code.');
    });

    socket.on('sendImage', (payload: PairingImagePayload) => {
      setLatestImage(payload);
    });

    socket.on('submitAnswerImage', (payload: SubmitAnswerImageEventPayload) => {
      window.dispatchEvent(new CustomEvent<SubmitAnswerImageEventPayload>(TEST_ANSWER_IMAGE_EVENT, { detail: payload }));
    });

    socket.on('connect_error', () => {
      setStatus('error');
      setError('Unable to reach the realtime pairing server.');
    });
  }, [pushActiveTestData]);

  const createRoom = useCallback(async (forceNewCode: boolean) => {
    if (!REALTIME_AVAILABLE) {
      setStatus('error');
      setError('Realtime pairing is not configured. Set VITE_REALTIME_URL in frontend deployment settings.');
      return;
    }

    const ownerUserId = getStoredPairingUserId();
    if (!ownerUserId) {
      setStatus('error');
      setError('Desktop pairing requires a logged-in account. Please log in again and reopen Settings.');
      return;
    }

    setError('');
    setStatus('connecting');

    let socket = socketRef.current;
    if (!socket) {
      socket = createSocketClient();
      socketRef.current = socket;
      attachSocketListeners(socket);
    }

    if (!socket.connected) {
      const connected = await new Promise<boolean>((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 3500);
        socket!.once('connect', () => {
          window.clearTimeout(timeout);
          resolve(true);
        });
        socket!.once('connect_error', () => {
          window.clearTimeout(timeout);
          resolve(false);
        });
      });

      if (!connected) {
        setStatus('error');
        setError('Unable to reach the realtime pairing server.');
        return;
      }
    }

    let attempts = 0;
    while (attempts < 6) {
      const nextCode = forceNewCode || !roomCode ? generatePairingCode() : roomCode;
      const response = await emitCreateRoom(socket, nextCode, ownerUserId);
      if (response.ok) {
        const nextDevices = response.devices || [];
        setRoomCode(nextCode);
        setDevices(nextDevices);
        setStatus(roomStateToStatus(nextDevices));
        setError('');
        await pushActiveTestData(socket);
        return;
      }

      if (response.reason !== 'ROOM_EXISTS') {
        setStatus('error');
        if (response.reason === 'UNAUTHORIZED') {
          setError('Pairing was rejected because this device is not authenticated.');
        } else {
          setError('Failed to create a pairing room.');
        }
        return;
      }

      attempts += 1;
      forceNewCode = true;
    }

    setStatus('error');
    setError('Could not find a free pairing code. Please try again.');
  }, [attachSocketListeners, pushActiveTestData, roomCode]);

  const ensureRoom = useCallback(async () => {
    if (roomCode && status !== 'error') return;
    await createRoom(false);
  }, [createRoom, roomCode, status]);

  const regenerateRoom = useCallback(async () => {
    setDevices([]);
    setRoomCode('');
    setLatestImage(null);
    await createRoom(true);
  }, [createRoom]);

  useEffect(() => {
    const handleActiveTestDataUpdated = (event: Event) => {
      const socket = socketRef.current;
      if (!socket?.connected) return;

      const customEvent = event as CustomEvent<ActiveTestProblem[]>;
      const nextProblems = Array.isArray(customEvent.detail) ? customEvent.detail : readActiveTestData();
      void pushActiveTestData(socket, nextProblems);
    };

    window.addEventListener(ACTIVE_TEST_DATA_EVENT, handleActiveTestDataUpdated);

    return () => {
      window.removeEventListener(ACTIVE_TEST_DATA_EVENT, handleActiveTestDataUpdated);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [pushActiveTestData]);

  const value = useMemo<PairingContextValue>(
    () => ({ roomCode, devices, status, error, latestImage, ensureRoom, regenerateRoom }),
    [devices, ensureRoom, error, latestImage, regenerateRoom, roomCode, status]
  );

  return <PairingContext.Provider value={value}>{children}</PairingContext.Provider>;
};

export const usePairing = (): PairingContextValue => {
  const context = useContext(PairingContext);
  if (!context) {
    throw new Error('usePairing must be used within a PairingProvider');
  }
  return context;
};