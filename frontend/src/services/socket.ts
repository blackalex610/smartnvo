import { io, type Socket } from 'socket.io-client';
import type { ActiveTestProblem } from './activeTest';

export type PairedDevice = {
  id: string;
  name: string;
  joinedAt: string;
  userAgent: string;
};

export type RoomState = {
  roomCode: string;
  devices: PairedDevice[];
};

export type PairingImagePayload = {
  dataUrl: string;
  sentAt: string;
  deviceId: string;
  deviceName: string;
};

export type ActiveTestDataPayload = {
  problems: ActiveTestProblem[];
};

export type SubmitAnswerImagePayload = {
  problemId: number;
  image: string;
};

type PairingAck = {
  ok: boolean;
  reason?: 'INVALID_CODE' | 'ROOM_EXISTS' | 'ROOM_NOT_FOUND';
  roomCode?: string;
  devices?: PairedDevice[];
  device?: PairedDevice;
};

type SendImageAck = {
  ok: boolean;
  reason?: 'NOT_PAIRED' | 'TOO_LARGE' | 'INVALID_PAYLOAD';
};

type ActiveTestDataAck = {
  ok: boolean;
  reason?: 'NOT_PAIRED' | 'INVALID_PAYLOAD';
};

type SubmitAnswerImageAck = {
  ok: boolean;
  reason?: 'NOT_PAIRED' | 'TOO_LARGE' | 'INVALID_PAYLOAD';
};

export type PairingSocket = Socket;

const buildSocketBaseUrl = (): string | null => {
  const configured = String(
    import.meta.env.VITE_SOCKET_URL ?? import.meta.env.VITE_REALTIME_URL ?? ''
  ).trim();

  if (configured) {
    const lowered = configured.toLowerCase();
    // Reject values that point back to the Vite dev server or same origin.
    const isSameOrigin = lowered === window.location.origin.toLowerCase();
    const isViteDev = lowered.includes(':5173');
    const isPath = lowered === '/socket.io';
    if (!isSameOrigin && !isViteDev && !isPath) {
      return configured;
    }
  }

  if (import.meta.env.DEV) {
    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
    const host = window.location.hostname || '127.0.0.1';
    return `${protocol}//${host}:3001`;
  }

  // Production with no env var configured — realtime is unavailable.
  return null;
};

export const SOCKET_SERVER_URL = buildSocketBaseUrl();

/** True only when a realtime server URL is configured. Use this to guard UI. */
export const REALTIME_AVAILABLE: boolean = SOCKET_SERVER_URL !== null;

export const createSocketClient = (): PairingSocket => {
  if (!SOCKET_SERVER_URL) {
    // Return a permanently-disconnected socket so callers don't need null checks.
    return io('http://localhost:0', {
      autoConnect: false,
      reconnection: false,
    });
  }
  return io(SOCKET_SERVER_URL, {
    autoConnect: true,
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 20,
    reconnectionDelay: 1000,
  });
};

export const emitCreateRoom = (socket: PairingSocket, roomCode: string): Promise<PairingAck> => {
  return new Promise((resolve) => {
    socket.emit('createRoom', { roomCode }, (response: PairingAck) => resolve(response));
  });
};

export const emitJoinRoom = (socket: PairingSocket, roomCode: string): Promise<PairingAck> => {
  return new Promise((resolve) => {
    socket.emit('joinRoom', { roomCode }, (response: PairingAck) => resolve(response));
  });
};

export const emitSendImage = (socket: PairingSocket, dataUrl: string): Promise<SendImageAck> => {
  return new Promise((resolve) => {
    socket.emit('sendImage', { dataUrl }, (response: SendImageAck) => resolve(response));
  });
};

export const emitActiveTestData = (socket: PairingSocket, problems: ActiveTestProblem[]): Promise<ActiveTestDataAck> => {
  return new Promise((resolve) => {
    socket.emit('activeTestData', { problems }, (response: ActiveTestDataAck) => resolve(response));
  });
};

export const emitSubmitAnswerImage = (
  socket: PairingSocket,
  payload: SubmitAnswerImagePayload
): Promise<SubmitAnswerImageAck> => {
  return new Promise((resolve) => {
    socket.emit('submitAnswerImage', payload, (response: SubmitAnswerImageAck) => resolve(response));
  });
};

export const generatePairingCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};