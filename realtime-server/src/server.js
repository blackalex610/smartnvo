const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 3001);
const app = express();

app.use(cors({ origin: true, credentials: true }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'realtime-pairing' });
});

// Keep-alive endpoint — point an uptime monitor (e.g. UptimeRobot) at this
// URL on a 5-minute interval so Render's free tier never spins down.
app.get('/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

const rooms = new Map();
// Pending room-close timers keyed by roomCode.  When the desktop disconnects
// we wait ROOM_GRACE_MS before actually tearing down the room so a brief
// page reload / network blip doesn't instantly kill every joined phone.
const roomCloseTimers = new Map();
const ROOM_GRACE_MS = 30_000;

const normalizeRoomCode = (value = '') => value.trim();
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const normalizeActiveTestProblems = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: Number(item.id),
      label: String(item.label || '').trim(),
      type: item.type,
    }))
    .filter((item) => Number.isFinite(item.id) && item.label.length > 0 && item.type === 'open')
    .map((item) => ({ id: item.id, label: item.label, type: 'open' }));
};

const getPublicDevice = (device) => ({
  id: device.id,
  name: device.name,
  joinedAt: device.joinedAt,
  userAgent: device.userAgent,
});

const getRoomState = (roomCode) => {
  const room = rooms.get(roomCode);
  if (!room) return { devices: [] };
  return {
    roomCode,
    devices: Array.from(room.devices.values()).map(getPublicDevice),
  };
};

io.on('connection', (socket) => {
  socket.on('createRoom', ({ roomCode }, callback) => {
    const normalizedCode = normalizeRoomCode(roomCode);
    if (!/^\d{6}$/.test(normalizedCode)) {
      callback?.({ ok: false, reason: 'INVALID_CODE' });
      return;
    }

    const existingRoom = rooms.get(normalizedCode);
    if (existingRoom && existingRoom.desktopId && existingRoom.desktopId !== socket.id) {
      // Allow re-claim if there is a pending grace-period timer (desktop was
      // briefly disconnected and is now reconnecting with the same code).
      if (!roomCloseTimers.has(normalizedCode)) {
        callback?.({ ok: false, reason: 'ROOM_EXISTS' });
        return;
      }
      // Clear the pending close — desktop is back.
      clearTimeout(roomCloseTimers.get(normalizedCode));
      roomCloseTimers.delete(normalizedCode);
    }

    const room = existingRoom || {
      desktopId: socket.id,
      devices: new Map(),
      nextDeviceNumber: 1,
      activeTestProblems: [],
    };

    room.desktopId = socket.id;
    rooms.set(normalizedCode, room);
    socket.data.role = 'desktop';
    socket.data.roomCode = normalizedCode;
    socket.join(normalizedCode);

    callback?.({ ok: true, roomCode: normalizedCode, devices: getRoomState(normalizedCode).devices });
    socket.emit('roomState', getRoomState(normalizedCode));
  });

  socket.on('joinRoom', ({ roomCode }, callback) => {
    const normalizedCode = normalizeRoomCode(roomCode);
    const room = rooms.get(normalizedCode);

    if (!room || !room.desktopId) {
      callback?.({ ok: false, reason: 'ROOM_NOT_FOUND' });
      return;
    }

    const device = {
      id: socket.id,
      name: `Phone ${room.nextDeviceNumber++}`,
      joinedAt: new Date().toISOString(),
      userAgent: socket.handshake.headers['user-agent'] || 'unknown',
    };

    room.devices.set(socket.id, device);
    socket.data.role = 'player';
    socket.data.roomCode = normalizedCode;
    socket.data.deviceId = device.id;
    socket.join(normalizedCode);

    const payload = getPublicDevice(device);
    callback?.({ ok: true, roomCode: normalizedCode, device: payload });
    io.to(room.desktopId).emit('playerJoined', payload);
    io.to(room.desktopId).emit('roomState', getRoomState(normalizedCode));
    socket.emit('roomState', getRoomState(normalizedCode));
    if (room.activeTestProblems.length > 0) {
      socket.emit('activeTestData', { problems: room.activeTestProblems });
    }
  });

  socket.on('activeTestData', ({ problems }, callback) => {
    const roomCode = socket.data.roomCode;
    if (socket.data.role !== 'desktop' || !roomCode) {
      callback?.({ ok: false, reason: 'NOT_PAIRED' });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room) {
      callback?.({ ok: false, reason: 'NOT_PAIRED' });
      return;
    }

    const normalizedProblems = normalizeActiveTestProblems(problems);
    if (!Array.isArray(problems)) {
      callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });
      return;
    }

    room.activeTestProblems = normalizedProblems;
    io.to(roomCode).emit('activeTestData', { problems: normalizedProblems });
    callback?.({ ok: true });
  });

  socket.on('sendImage', ({ dataUrl }, callback) => {
    const roomCode = socket.data.roomCode;
    if (socket.data.role !== 'player' || !roomCode || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room || !room.desktopId) {
      callback?.({ ok: false, reason: 'NOT_PAIRED' });
      return;
    }

    const base64Payload = dataUrl.split(',')[1] || '';
    const approxBytes = Math.floor((base64Payload.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      callback?.({ ok: false, reason: 'TOO_LARGE' });
      return;
    }

    const device = room.devices.get(socket.id);
    io.to(room.desktopId).emit('sendImage', {
      dataUrl,
      sentAt: new Date().toISOString(),
      deviceId: socket.id,
      deviceName: device?.name || 'Phone',
    });
    callback?.({ ok: true });
  });

  socket.on('submitAnswerImage', ({ problemId, image }, callback) => {
    const roomCode = socket.data.roomCode;
    if (
      socket.data.role !== 'player' ||
      !roomCode ||
      !Number.isFinite(Number(problemId)) ||
      typeof image !== 'string' ||
      !image.startsWith('data:image/')
    ) {
      callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });
      return;
    }

    const room = rooms.get(roomCode);
    if (!room || !room.desktopId) {
      callback?.({ ok: false, reason: 'NOT_PAIRED' });
      return;
    }

    const base64Payload = image.split(',')[1] || '';
    const approxBytes = Math.floor((base64Payload.length * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      callback?.({ ok: false, reason: 'TOO_LARGE' });
      return;
    }

    const normalizedProblemId = Number(problemId);
    const device = room.devices.get(socket.id);
    io.to(room.desktopId).emit('submitAnswerImage', {
      problemId: normalizedProblemId,
      image,
      deviceId: socket.id,
      deviceName: device?.name || 'Phone',
      submittedAt: new Date().toISOString(),
    });

    socket.emit('answerReceived', { problemId: normalizedProblemId });
    callback?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode;
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    if (socket.data.role === 'desktop') {
      // Don't tear down the room immediately — give the desktop ROOM_GRACE_MS
      // to reconnect (e.g. page reload, brief network drop) before we evict
      // all joined phones.
      if (roomCloseTimers.has(roomCode)) {
        clearTimeout(roomCloseTimers.get(roomCode));
      }
      const timer = setTimeout(() => {
        roomCloseTimers.delete(roomCode);
        const liveRoom = rooms.get(roomCode);
        if (liveRoom && liveRoom.desktopId === socket.id) {
          io.to(roomCode).emit('roomClosed', { roomCode });
          rooms.delete(roomCode);
        }
      }, ROOM_GRACE_MS);
      roomCloseTimers.set(roomCode, timer);
      return;
    }

    if (socket.data.role === 'player') {
      room.devices.delete(socket.id);
      if (room.desktopId) {
        io.to(room.desktopId).emit('playerLeft', { id: socket.id });
        io.to(room.desktopId).emit('roomState', getRoomState(roomCode));
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Realtime pairing server listening on http://127.0.0.1:${PORT}`);
});