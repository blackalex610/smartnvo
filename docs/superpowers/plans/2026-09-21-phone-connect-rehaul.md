# Phone Connect Rehaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace six-digit-code phone pairing with a LocalSend-style live device list plus an explicit on-phone confirmation, and turn the paired phone into a Kahoot-style companion that photographs solutions into specific NVO problems.

**Architecture:** The realtime Socket.IO server drops rooms and codes entirely in favour of a presence registry (`userId → devices`) and a link registry (confirmed desktop↔phone bindings). Phones announce themselves only while sitting on the connect screen; desktops subscribe to their own account's presence and send a link request that the phone must accept. Photos continue to travel as base64 data URLs over the socket into the desktop's existing `answerImages` state, so `NVOPracticeExamPage` is untouched.

**Tech Stack:** Node 18+ / Socket.IO 4 / Express 4 (realtime-server, CommonJS), React 19 / TypeScript / Vite / Tailwind (frontend), Vitest + Testing Library (frontend tests), Node built-in `node:test` + `socket.io-client` (server tests).

**Spec:** `docs/superpowers/specs/2026-09-21-phone-connect-rehaul-design.md`

## Global Constraints

- **Discovery is account-scoped.** A device is visible only to sockets whose verified JWT `sub` matches. Identity comes from `socket.data.authUserId` only — **never** from an event payload.
- **Companion-scoped tokens must stay rejected** at the handshake (`payload.type === 'companion'` or `payload.scope === 'companion'`). `POST /companion/pair` is unauthenticated and signs with the same `SECRET_KEY`; dropping this guard is a full auth bypass.
- **Image ceiling: `MAX_IMAGE_BYTES = 8 * 1024 * 1024`**, `maxHttpBufferSize: 10 * 1024 * 1024`.
- **Request TTL: 30 000 ms. Reconnect grace: 30 000 ms**, both sides.
- **One phone per desktop link.** Many devices may be listed; only one may be linked.
- **Phone and desktop UI copy is Bulgarian.**
- Server exits on boot if neither `REALTIME_JWT_SECRET` nor `SECRET_KEY` is set.
- The backend (`backend/`) is **not touched by any task in this plan**. Neither are `NVOPracticeExamPage.tsx`, `MathVisionPanel.tsx`, `activeTest.ts`, `testAnswerSync.ts`, `companion_pairing.py`, `mobile_uploads.py`, `MobileCapturePage.tsx`, `LiveUploadsPage.tsx`.
- Commit after every task. Frontend tests: `cd frontend && npm test`. Server tests: `cd realtime-server && npm test`.

### Deviation from the spec, deliberate

The spec writes `presence:subscribe { name }`. This plan uses **`presence:subscribe { desktopId, name }`**. A reconnecting desktop gets a fresh `socketId`, and two desktops on one account would be ambiguous, so reattach needs a stable client-minted id symmetric with the phone's `deviceId`. The spec is patched to match.

### Expected mid-plan breakage

Tasks 1–3 replace the server protocol while the old `PairingContext` still emits `createRoom`/`joinRoom`. **Between Task 3 and Task 10, phone pairing does not work at runtime**, although every test suite stays green and the frontend keeps compiling. This is expected on the branch and is resolved by Task 10.

---

## File Structure

**`realtime-server/src/` — `server.js` (458 lines) is split by responsibility:**

| File | Responsibility |
|---|---|
| `origins.js` | CORS allowlist + private-network origin regex |
| `auth.js` | HS256 JWT verification, companion-token rejection, the `io.use` guard |
| `deviceName.js` | user-agent → friendly device name / platform |
| `registry.js` | presence + link + pending-request state. Pure: no sockets, no timers, injected clock |
| `handlers.js` | socket event wiring; the only file that knows both `io` and `registry` |
| `server.js` | express + io bootstrap, sweep interval |

`registry.js` owns no `setTimeout`. It stores `expiresAt`/`graceUntil` and exposes `sweep*(now)`, so every expiry test is deterministic without fake timers.

**`frontend/src/`:**

| File | Responsibility |
|---|---|
| `utils/deviceIdentity.ts` | stable `deviceId`/`desktopId`, UA → name, nickname storage |
| `utils/imageCapture.ts` | HEIC + canvas → JPEG data URL (lifted out of `ControllerPage`) |
| `services/socket.ts` | connection config + typed emit helpers |
| `context/ConnectContext.tsx` | desktop connect state machine |
| `components/SettingsConnectionPanel.tsx` | desktop device list |
| `components/connect/PhoneVisibleScreen.tsx` | phone: announcing |
| `components/connect/PhoneConfirmSheet.tsx` | phone: incoming request |
| `components/connect/PhoneIdleScreen.tsx` | phone: linked, nothing to do |
| `components/connect/PhoneExamScreen.tsx` | phone: problem list + capture |
| `pages/ControllerPage.tsx` | phone state machine host |

---

## Task 1: Realtime registry and device naming

**Files:**
- Create: `realtime-server/src/deviceName.js`
- Create: `realtime-server/src/registry.js`
- Create: `realtime-server/test/registry.test.js`
- Modify: `realtime-server/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `describeDevice(userAgent) -> string`, `detectPlatform(userAgent) -> string`, and `createRegistry({ requestTtlMs, graceMs, newId }) -> Registry` with methods `announce`, `withdraw`, `removeSocketPresence`, `listDevices`, `getEntry`, `createRequest`, `resolveRequest`, `cancelRequest`, `sweepRequests`, `getLinkByDesktopId`, `getLinkByPhoneDeviceId`, `getLinkBySocketId`, `setExamProblems`, `endLink`, `markSocketGone`, `reattachDesktop`, `reattachPhone`, `sweepGrace`.

- [ ] **Step 1: Add the test script and dev dependency**

```bash
cd realtime-server
npm pkg set scripts.test="node --test test/"
npm install --save-dev socket.io-client@^4.8.1
```

- [ ] **Step 2: Write the failing device-name test**

Create `realtime-server/test/registry.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { describeDevice, detectPlatform } = require('../src/deviceName');

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const WINDOWS_EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

test('detectPlatform recognises the common platforms', () => {
  assert.equal(detectPlatform(IPHONE_SAFARI), 'iPhone');
  assert.equal(detectPlatform(ANDROID_CHROME), 'Android');
  assert.equal(detectPlatform(WINDOWS_EDGE), 'Windows');
  assert.equal(detectPlatform(''), 'Устройство');
});

test('describeDevice does not mistake Chrome for Safari or Edge for Chrome', () => {
  assert.equal(describeDevice(IPHONE_SAFARI), 'iPhone · Safari');
  assert.equal(describeDevice(ANDROID_CHROME), 'Android · Chrome');
  assert.equal(describeDevice(WINDOWS_EDGE), 'Windows · Edge');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd realtime-server && npm test`
Expected: FAIL — `Cannot find module '../src/deviceName'`.

- [ ] **Step 4: Implement `deviceName.js`**

Create `realtime-server/src/deviceName.js`:

```js
'use strict';

// Order matters in both tables: a Chrome UA contains "Safari", and an Edge UA
// contains "Chrome". Most specific match first.
const detectPlatform = (userAgent = '') => {
  const ua = String(userAgent);
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Устройство';
};

const detectBrowser = (userAgent = '') => {
  const ua = String(userAgent);
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua)) return 'Safari';
  return 'Браузър';
};

const describeDevice = (userAgent = '') =>
  `${detectPlatform(userAgent)} · ${detectBrowser(userAgent)}`;

module.exports = { describeDevice, detectPlatform, detectBrowser };
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd realtime-server && npm test`
Expected: PASS (2 tests).

- [ ] **Step 6: Write the failing registry tests**

Append to `realtime-server/test/registry.test.js`:

```js
const { createRegistry } = require('../src/registry');

// Deterministic ids keep assertions readable.
const makeRegistry = () => {
  let n = 0;
  return createRegistry({ newId: () => `id-${++n}` });
};

const announcePhone = (registry, overrides = {}) =>
  registry.announce({
    userId: 'u1',
    deviceId: 'dev-a',
    socketId: 'sock-phone',
    name: 'iPhone · Safari',
    platform: 'iPhone',
    userAgent: 'ua',
    at: 1000,
    ...overrides,
  });

test('announce then listDevices returns the device as free', () => {
  const registry = makeRegistry();
  announcePhone(registry);

  const devices = registry.listDevices('u1');
  assert.equal(devices.length, 1);
  assert.equal(devices[0].deviceId, 'dev-a');
  assert.equal(devices[0].name, 'iPhone · Safari');
  assert.equal(devices[0].busy, false);
});

test('re-announcing the same deviceId replaces rather than duplicates', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  announcePhone(registry, { socketId: 'sock-phone-2', at: 5000 });

  const devices = registry.listDevices('u1');
  assert.equal(devices.length, 1);
  // announcedAt is preserved across a reconnect so the UI does not reset "seen just now".
  assert.equal(devices[0].announcedAt, 1000);
  assert.equal(registry.getEntry('u1', 'dev-a').socketId, 'sock-phone-2');
});

test('devices are isolated per account', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  announcePhone(registry, { userId: 'u2', deviceId: 'dev-b', socketId: 'sock-other' });

  assert.equal(registry.listDevices('u1').length, 1);
  assert.equal(registry.listDevices('u2').length, 1);
  assert.equal(registry.listDevices('u1')[0].deviceId, 'dev-a');
  assert.equal(registry.getEntry('u1', 'dev-b'), undefined);
});

test('withdraw removes the device from its account list', () => {
  const registry = makeRegistry();
  announcePhone(registry);

  assert.equal(registry.withdraw({ userId: 'u1', deviceId: 'dev-a' }), true);
  assert.equal(registry.listDevices('u1').length, 0);
  assert.equal(registry.withdraw({ userId: 'u1', deviceId: 'dev-a' }), false);
});

test('removeSocketPresence finds the device by socket id', () => {
  const registry = makeRegistry();
  announcePhone(registry);

  assert.deepEqual(registry.removeSocketPresence('sock-phone'), {
    userId: 'u1',
    deviceId: 'dev-a',
  });
  assert.equal(registry.listDevices('u1').length, 0);
  assert.equal(registry.removeSocketPresence('sock-phone'), null);
});

test('createRequest marks the device busy and resolveRequest(accept) links it', () => {
  const registry = makeRegistry();
  announcePhone(registry);

  const created = registry.createRequest({
    userId: 'u1',
    desktopId: 'desk-1',
    desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a',
    at: 2000,
  });
  assert.equal(created.ok, true);
  assert.equal(created.request.expiresAt, 32000);
  assert.equal(registry.listDevices('u1')[0].busy, true);

  const resolved = registry.resolveRequest(created.request.requestId, true, 2500);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.accepted, true);
  assert.equal(resolved.link.phoneDeviceId, 'dev-a');
  assert.equal(resolved.link.phoneSocketId, 'sock-phone');
  assert.equal(resolved.link.desktopSocketId, 'sock-desk');
  // Still busy — now because it is linked, not because a request is pending.
  assert.equal(registry.listDevices('u1')[0].busy, true);
});

test('resolveRequest(decline) frees the device without creating a link', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  const created = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });

  const resolved = registry.resolveRequest(created.request.requestId, false, 2500);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.accepted, false);
  assert.equal(registry.listDevices('u1')[0].busy, false);
  assert.equal(registry.getLinkByPhoneDeviceId('dev-a'), undefined);
});

test('a second request for a busy device is refused', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });

  const second = registry.createRequest({
    userId: 'u1', desktopId: 'desk-2', desktopSocketId: 'sock-desk-2',
    phoneDeviceId: 'dev-a', at: 2100,
  });
  assert.deepEqual(second, { ok: false, reason: 'DEVICE_BUSY' });
});

test('a desktop that is already linked cannot request another device', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  announcePhone(registry, { deviceId: 'dev-b', socketId: 'sock-phone-b' });

  const first = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });
  registry.resolveRequest(first.request.requestId, true, 2100);

  const second = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-b', at: 2200,
  });
  assert.deepEqual(second, { ok: false, reason: 'ALREADY_LINKED' });
});

test('requesting an unknown device reports DEVICE_GONE', () => {
  const registry = makeRegistry();
  const result = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'nope', at: 2000,
  });
  assert.deepEqual(result, { ok: false, reason: 'DEVICE_GONE' });
});

test('a device belonging to another account cannot be requested', () => {
  const registry = makeRegistry();
  announcePhone(registry, { userId: 'u2', deviceId: 'dev-victim', socketId: 'sock-victim' });

  const result = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-victim', at: 2000,
  });
  assert.deepEqual(result, { ok: false, reason: 'DEVICE_GONE' });
});

test('sweepRequests expires pending requests and frees the device', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  const created = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });

  assert.deepEqual(registry.sweepRequests(31999), []);
  const expired = registry.sweepRequests(32000);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].requestId, created.request.requestId);
  assert.equal(registry.listDevices('u1')[0].busy, false);
  assert.deepEqual(registry.resolveRequest(created.request.requestId, true, 33000), {
    ok: false,
    reason: 'REQUEST_UNKNOWN',
  });
});

test('phone disconnect holds the link and a re-announce reattaches it', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  const created = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });
  const { link } = registry.resolveRequest(created.request.requestId, true, 2100);

  const gone = registry.markSocketGone('sock-phone', 3000);
  assert.equal(gone.side, 'phone');
  assert.equal(gone.link.phoneGraceUntil, 33000);
  // Presence disappears immediately even though the link is held.
  registry.removeSocketPresence('sock-phone');
  assert.equal(registry.listDevices('u1').length, 0);

  announcePhone(registry, { socketId: 'sock-phone-2', at: 4000 });
  const reattached = registry.reattachPhone({
    userId: 'u1', deviceId: 'dev-a', socketId: 'sock-phone-2',
  });
  assert.equal(reattached.linkId, link.linkId);
  assert.equal(reattached.phoneSocketId, 'sock-phone-2');
  assert.equal(reattached.phoneGraceUntil, null);
  assert.deepEqual(registry.sweepGrace(99999), []);
});

test('desktop disconnect past the grace window ends the link', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  const created = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });
  registry.resolveRequest(created.request.requestId, true, 2100);

  registry.markSocketGone('sock-desk', 3000);
  assert.deepEqual(registry.sweepGrace(32999), []);

  const ended = registry.sweepGrace(33000);
  assert.equal(ended.length, 1);
  assert.equal(ended[0].side, 'desktop');
  assert.equal(registry.getLinkByPhoneDeviceId('dev-a'), undefined);
  assert.equal(registry.listDevices('u1')[0].busy, false);
});

test('reattachDesktop restores a link inside the grace window', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  const created = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });
  registry.resolveRequest(created.request.requestId, true, 2100);
  registry.markSocketGone('sock-desk', 3000);

  const link = registry.reattachDesktop({
    userId: 'u1', desktopId: 'desk-1', socketId: 'sock-desk-2',
  });
  assert.equal(link.desktopSocketId, 'sock-desk-2');
  assert.equal(link.desktopGraceUntil, null);
  assert.deepEqual(registry.sweepGrace(99999), []);
});

test('reattachDesktop refuses a desktopId belonging to another account', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  const created = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });
  registry.resolveRequest(created.request.requestId, true, 2100);
  registry.markSocketGone('sock-desk', 3000);

  assert.equal(
    registry.reattachDesktop({ userId: 'u2', desktopId: 'desk-1', socketId: 'sock-evil' }),
    null
  );
});

test('setExamProblems is stored on the link and endLink clears every index', () => {
  const registry = makeRegistry();
  announcePhone(registry);
  const created = registry.createRequest({
    userId: 'u1', desktopId: 'desk-1', desktopSocketId: 'sock-desk',
    phoneDeviceId: 'dev-a', at: 2000,
  });
  const { link } = registry.resolveRequest(created.request.requestId, true, 2100);

  registry.setExamProblems(link.linkId, [{ id: 17, label: 'Задача 17', type: 'open' }]);
  assert.equal(registry.getLinkByDesktopId('desk-1').examProblems[0].id, 17);

  assert.equal(registry.endLink(link.linkId).linkId, link.linkId);
  assert.equal(registry.getLinkByDesktopId('desk-1'), undefined);
  assert.equal(registry.getLinkByPhoneDeviceId('dev-a'), undefined);
  assert.equal(registry.getLinkBySocketId('sock-desk'), undefined);
  assert.equal(registry.listDevices('u1')[0].busy, false);
  assert.equal(registry.endLink(link.linkId), null);
});
```

- [ ] **Step 7: Run to verify the registry tests fail**

Run: `cd realtime-server && npm test`
Expected: FAIL — `Cannot find module '../src/registry'`.

- [ ] **Step 8: Implement `registry.js`**

Create `realtime-server/src/registry.js`:

```js
'use strict';

const crypto = require('crypto');

const DEFAULT_REQUEST_TTL_MS = 30_000;
const DEFAULT_GRACE_MS = 30_000;

/**
 * Presence + link state for the phone-connect feature.
 *
 * Deliberately owns no timers and no sockets: expiry is expressed as an
 * `expiresAt`/`graceUntil` stamp and driven by `sweepRequests`/`sweepGrace`,
 * which the caller runs on an interval. That keeps every expiry path testable
 * with a plain number instead of fake timers.
 *
 * `busy` is *derived*, never stored, so it cannot drift out of sync with the
 * link and pending-request indexes the way a cached flag would.
 */
const createRegistry = ({
  requestTtlMs = DEFAULT_REQUEST_TTL_MS,
  graceMs = DEFAULT_GRACE_MS,
  newId = () => crypto.randomUUID(),
} = {}) => {
  const presenceByUser = new Map();        // userId -> Map<deviceId, entry>
  const presenceBySocket = new Map();      // socketId -> { userId, deviceId }
  const links = new Map();                 // linkId -> link
  const linkByDesktopId = new Map();       // desktopId -> linkId
  const linkByPhoneDeviceId = new Map();   // deviceId -> linkId
  const linkBySocketId = new Map();        // socketId -> linkId
  const pendingRequests = new Map();       // requestId -> request
  const pendingByDevice = new Map();       // deviceId -> requestId
  const pendingByDesktopId = new Map();    // desktopId -> requestId

  const devicesFor = (userId) => {
    let map = presenceByUser.get(userId);
    if (!map) {
      map = new Map();
      presenceByUser.set(userId, map);
    }
    return map;
  };

  const isBusy = (deviceId) =>
    linkByPhoneDeviceId.has(deviceId) || pendingByDevice.has(deviceId);

  const publicDevice = (entry) => ({
    deviceId: entry.deviceId,
    name: entry.name,
    platform: entry.platform,
    announcedAt: entry.announcedAt,
    busy: isBusy(entry.deviceId),
  });

  const announce = ({ userId, deviceId, socketId, name, platform, userAgent, at }) => {
    const map = devicesFor(userId);
    const existing = map.get(deviceId);

    if (existing && existing.socketId !== socketId) {
      presenceBySocket.delete(existing.socketId);
    }

    const entry = {
      deviceId,
      socketId,
      name,
      platform,
      userAgent,
      // Preserved across reconnects so the desktop list does not flicker back
      // to "seen just now" every time the phone's screen wakes.
      announcedAt: existing ? existing.announcedAt : at,
    };
    map.set(deviceId, entry);
    presenceBySocket.set(socketId, { userId, deviceId });
    return entry;
  };

  const withdraw = ({ userId, deviceId }) => {
    const map = presenceByUser.get(userId);
    const entry = map && map.get(deviceId);
    if (!entry) return false;
    map.delete(deviceId);
    presenceBySocket.delete(entry.socketId);
    return true;
  };

  const removeSocketPresence = (socketId) => {
    const located = presenceBySocket.get(socketId);
    if (!located) return null;
    presenceBySocket.delete(socketId);
    const map = presenceByUser.get(located.userId);
    const entry = map && map.get(located.deviceId);
    // Only drop the entry if it still points at this socket: a reconnect may
    // already have replaced it with a newer one.
    if (entry && entry.socketId === socketId) map.delete(located.deviceId);
    return located;
  };

  const listDevices = (userId) =>
    Array.from(devicesFor(userId).values()).map(publicDevice);

  const getEntry = (userId, deviceId) => devicesFor(userId).get(deviceId);

  const dropRequest = (request) => {
    pendingRequests.delete(request.requestId);
    pendingByDevice.delete(request.phoneDeviceId);
    pendingByDesktopId.delete(request.desktopId);
  };

  const createRequest = ({ userId, desktopId, desktopSocketId, phoneDeviceId, at }) => {
    const entry = devicesFor(userId).get(phoneDeviceId);
    // A device on another account is indistinguishable from one that does not
    // exist — deliberately, so the reason code cannot be used to probe for
    // other accounts' devices.
    if (!entry) return { ok: false, reason: 'DEVICE_GONE' };
    if (linkByDesktopId.has(desktopId)) return { ok: false, reason: 'ALREADY_LINKED' };
    if (pendingByDesktopId.has(desktopId)) return { ok: false, reason: 'ALREADY_LINKED' };
    if (isBusy(phoneDeviceId)) return { ok: false, reason: 'DEVICE_BUSY' };

    const request = {
      requestId: newId(),
      userId,
      desktopId,
      desktopSocketId,
      phoneDeviceId,
      phoneSocketId: entry.socketId,
      expiresAt: at + requestTtlMs,
    };
    pendingRequests.set(request.requestId, request);
    pendingByDevice.set(phoneDeviceId, request.requestId);
    pendingByDesktopId.set(desktopId, request.requestId);
    return { ok: true, request };
  };

  const indexLink = (link) => {
    links.set(link.linkId, link);
    linkByDesktopId.set(link.desktopId, link.linkId);
    linkByPhoneDeviceId.set(link.phoneDeviceId, link.linkId);
    linkBySocketId.set(link.desktopSocketId, link.linkId);
    linkBySocketId.set(link.phoneSocketId, link.linkId);
  };

  const resolveRequest = (requestId, accept, at) => {
    const request = pendingRequests.get(requestId);
    if (!request) return { ok: false, reason: 'REQUEST_UNKNOWN' };
    dropRequest(request);

    if (!accept) return { ok: true, accepted: false, request };

    const entry = devicesFor(request.userId).get(request.phoneDeviceId);
    if (!entry) return { ok: false, reason: 'DEVICE_GONE' };

    const link = {
      linkId: newId(),
      userId: request.userId,
      desktopId: request.desktopId,
      desktopSocketId: request.desktopSocketId,
      phoneDeviceId: request.phoneDeviceId,
      phoneSocketId: entry.socketId,
      examProblems: [],
      createdAt: at,
      desktopGraceUntil: null,
      phoneGraceUntil: null,
    };
    indexLink(link);
    return { ok: true, accepted: true, link, request };
  };

  const cancelRequest = (requestId) => {
    const request = pendingRequests.get(requestId);
    if (!request) return null;
    dropRequest(request);
    return request;
  };

  const sweepRequests = (at) => {
    const expired = [];
    for (const request of pendingRequests.values()) {
      if (request.expiresAt <= at) expired.push(request);
    }
    expired.forEach(dropRequest);
    return expired;
  };

  const getLink = (linkId) => links.get(linkId);
  const getLinkByDesktopId = (desktopId) => links.get(linkByDesktopId.get(desktopId));
  const getLinkByPhoneDeviceId = (deviceId) => links.get(linkByPhoneDeviceId.get(deviceId));
  const getLinkBySocketId = (socketId) => links.get(linkBySocketId.get(socketId));

  const setExamProblems = (linkId, problems) => {
    const link = links.get(linkId);
    if (!link) return null;
    link.examProblems = problems;
    return link;
  };

  const endLink = (linkId) => {
    const link = links.get(linkId);
    if (!link) return null;
    links.delete(linkId);
    linkByDesktopId.delete(link.desktopId);
    linkByPhoneDeviceId.delete(link.phoneDeviceId);
    linkBySocketId.delete(link.desktopSocketId);
    linkBySocketId.delete(link.phoneSocketId);
    return link;
  };

  const markSocketGone = (socketId, at) => {
    const link = getLinkBySocketId(socketId);
    if (!link) return null;
    if (link.desktopSocketId === socketId) {
      link.desktopGraceUntil = at + graceMs;
      return { link, side: 'desktop' };
    }
    link.phoneGraceUntil = at + graceMs;
    return { link, side: 'phone' };
  };

  const reattachDesktop = ({ userId, desktopId, socketId }) => {
    const link = getLinkByDesktopId(desktopId);
    if (!link || link.userId !== userId) return null;
    linkBySocketId.delete(link.desktopSocketId);
    link.desktopSocketId = socketId;
    link.desktopGraceUntil = null;
    linkBySocketId.set(socketId, link.linkId);
    return link;
  };

  const reattachPhone = ({ userId, deviceId, socketId }) => {
    const link = getLinkByPhoneDeviceId(deviceId);
    if (!link || link.userId !== userId) return null;
    linkBySocketId.delete(link.phoneSocketId);
    link.phoneSocketId = socketId;
    link.phoneGraceUntil = null;
    linkBySocketId.set(socketId, link.linkId);
    return link;
  };

  const sweepGrace = (at) => {
    const ended = [];
    for (const link of Array.from(links.values())) {
      const desktopExpired = link.desktopGraceUntil !== null && link.desktopGraceUntil <= at;
      const phoneExpired = link.phoneGraceUntil !== null && link.phoneGraceUntil <= at;
      if (!desktopExpired && !phoneExpired) continue;
      endLink(link.linkId);
      ended.push({ link, side: desktopExpired ? 'desktop' : 'phone' });
    }
    return ended;
  };

  return {
    announce,
    withdraw,
    removeSocketPresence,
    listDevices,
    getEntry,
    createRequest,
    resolveRequest,
    cancelRequest,
    sweepRequests,
    getLink,
    getLinkByDesktopId,
    getLinkByPhoneDeviceId,
    getLinkBySocketId,
    setExamProblems,
    endLink,
    markSocketGone,
    reattachDesktop,
    reattachPhone,
    sweepGrace,
  };
};

module.exports = { createRegistry, DEFAULT_REQUEST_TTL_MS, DEFAULT_GRACE_MS };
```

- [ ] **Step 9: Run to verify all tests pass**

Run: `cd realtime-server && npm test`
Expected: PASS — 19 tests.

- [ ] **Step 10: Commit**

```bash
git add realtime-server/src/deviceName.js realtime-server/src/registry.js realtime-server/test/registry.test.js realtime-server/package.json realtime-server/package-lock.json
git commit -m "feat(realtime): add presence/link registry and device naming"
```

---

## Task 2: Extract origin and auth modules

Pure refactor. `server.js` keeps working identically; the logic just moves somewhere testable.

**Files:**
- Create: `realtime-server/src/origins.js`
- Create: `realtime-server/src/auth.js`
- Create: `realtime-server/test/auth.test.js`
- Modify: `realtime-server/src/server.js` (replace the inlined blocks with requires)

**Interfaces:**
- Consumes: nothing.
- Produces: `buildOriginCheck({ corsOrigins, allowLocalNetwork }) -> { isOriginAllowed(origin), corsOriginCheck(origin, cb) }`; `verifyJwtHs256(token, secret) -> payload | null`; `createAuthMiddleware(secret) -> (socket, next) => void`.

- [ ] **Step 1: Write the failing tests**

Create `realtime-server/test/auth.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { buildOriginCheck } = require('../src/origins');
const { verifyJwtHs256, createAuthMiddleware } = require('../src/auth');

const SECRET = 'test-secret';

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

const signToken = (payload, { secret = SECRET, alg = 'HS256' } = {}) => {
  const head = b64({ alg, typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};

test('origin check allows the configured list and private networks', () => {
  const { isOriginAllowed } = buildOriginCheck({
    corsOrigins: ['https://app.example.com'],
    allowLocalNetwork: true,
  });

  assert.equal(isOriginAllowed(undefined), true, 'non-browser clients send no Origin');
  assert.equal(isOriginAllowed('https://app.example.com'), true);
  assert.equal(isOriginAllowed('http://192.168.1.40:5173'), true);
  assert.equal(isOriginAllowed('https://evil.example.net'), false);
});

test('origin check can refuse private networks', () => {
  const { isOriginAllowed } = buildOriginCheck({
    corsOrigins: ['https://app.example.com'],
    allowLocalNetwork: false,
  });
  assert.equal(isOriginAllowed('http://192.168.1.40:5173'), false);
});

test('verifyJwtHs256 accepts a well-formed token and returns its payload', () => {
  const payload = verifyJwtHs256(signToken({ sub: '42' }), SECRET);
  assert.equal(payload.sub, '42');
});

test('verifyJwtHs256 rejects tampering, alg confusion, expiry and missing sub', () => {
  assert.equal(verifyJwtHs256(signToken({ sub: '42' }, { secret: 'wrong' }), SECRET), null);
  assert.equal(verifyJwtHs256(signToken({ sub: '42' }, { alg: 'none' }), SECRET), null);
  assert.equal(verifyJwtHs256(signToken({ sub: '42', exp: 1 }), SECRET), null);
  assert.equal(verifyJwtHs256(signToken({ nosub: true }), SECRET), null);
  assert.equal(verifyJwtHs256('not.a.jwt', SECRET), null);
  assert.equal(verifyJwtHs256('', SECRET), null);
});

const runMiddleware = (token) =>
  new Promise((resolve) => {
    const socket = { id: 's1', handshake: { auth: { token }, headers: {} }, data: {} };
    createAuthMiddleware(SECRET)(socket, (err) => resolve({ err, socket }));
  });

test('auth middleware sets authUserId from the verified token only', async () => {
  const { err, socket } = await runMiddleware(signToken({ sub: '42' }));
  assert.equal(err, undefined);
  assert.equal(socket.data.authUserId, '42');
});

test('auth middleware rejects companion-scoped tokens', async () => {
  // POST /companion/pair is unauthenticated and signs with the same secret, so
  // a companion token must never buy a real user identity here.
  const byType = await runMiddleware(signToken({ sub: '42', type: 'companion' }));
  assert.match(byType.err.message, /UNAUTHORIZED/);

  const byScope = await runMiddleware(signToken({ sub: '42', scope: 'companion' }));
  assert.match(byScope.err.message, /UNAUTHORIZED/);
});

test('auth middleware rejects a missing token', async () => {
  const { err } = await runMiddleware('');
  assert.match(err.message, /UNAUTHORIZED/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd realtime-server && npm test`
Expected: FAIL — `Cannot find module '../src/origins'`.

- [ ] **Step 3: Implement `origins.js`**

Create `realtime-server/src/origins.js`:

```js
'use strict';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// Phones on the LAN reach the desktop by private IP during local testing.
const LOCAL_NETWORK_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/;

const buildOriginCheck = ({ corsOrigins = [], allowLocalNetwork = true } = {}) => {
  const configured = corsOrigins.filter(Boolean);
  const allowed = configured.length ? configured : DEFAULT_ALLOWED_ORIGINS;

  const isOriginAllowed = (origin) => {
    // Same-origin and non-browser clients send no Origin header.
    if (!origin) return true;
    if (allowed.includes(origin)) return true;
    return allowLocalNetwork && LOCAL_NETWORK_ORIGIN.test(origin);
  };

  const corsOriginCheck = (origin, callback) => {
    if (isOriginAllowed(origin)) return callback(null, true);
    console.warn(`❌ Blocked disallowed origin: ${origin}`);
    return callback(new Error('Origin not allowed'));
  };

  return { isOriginAllowed, corsOriginCheck, allowedOrigins: allowed };
};

module.exports = { buildOriginCheck, DEFAULT_ALLOWED_ORIGINS, LOCAL_NETWORK_ORIGIN };
```

- [ ] **Step 4: Implement `auth.js`**

Create `realtime-server/src/auth.js`:

```js
'use strict';

const crypto = require('crypto');

/** Verify an HS256 JWT with the built-in crypto module (no extra dependency). */
const verifyJwtHs256 = (token, secret) => {
  if (!token || !secret) return null;
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  let header;
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  // Reject alg:none and algorithm-confusion attempts outright.
  if (!header || header.alg !== 'HS256') return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerPart}.${payloadPart}`)
    .digest('base64url');
  const given = Buffer.from(signaturePart);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null;
  if (!payload.sub) return null;
  return payload;
};

/**
 * Every socket must present a valid backend user token before it can emit.
 *
 * The backend also mints a *companion* JWT (type/scope "companion") from
 * POST /companion/pair, which requires no authentication at all and is signed
 * with the same SECRET_KEY. Both verify identically above, so without the
 * explicit rejection below anyone could obtain one and authenticate here as a
 * real user.
 */
const createAuthMiddleware = (secret) => (socket, next) => {
  const token =
    socket.handshake.auth?.token ||
    String(socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');

  const payload = verifyJwtHs256(token, secret);
  if (!payload) {
    console.warn(`❌ Rejected unauthenticated socket ${socket.id}`);
    return next(new Error('UNAUTHORIZED'));
  }

  if (payload.type === 'companion' || payload.scope === 'companion') {
    console.warn(`❌ Rejected companion-scoped token on identity socket ${socket.id}`);
    return next(new Error('UNAUTHORIZED'));
  }

  // Authoritative identity — never read from an event payload again.
  socket.data.authUserId = String(payload.sub);
  return next();
};

module.exports = { verifyJwtHs256, createAuthMiddleware };
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd realtime-server && npm test`
Expected: PASS — 8 new tests, 19 existing.

- [ ] **Step 6: Point `server.js` at the new modules**

In `realtime-server/src/server.js`, delete the inline `DEFAULT_ALLOWED_ORIGINS`, `ALLOWED_ORIGINS`, `LOCAL_NETWORK_ORIGIN`, `isOriginAllowed`, `corsOriginCheck`, `verifyJwtHs256` definitions and the body of the `io.use(...)` callback, replacing them with:

```js
const { buildOriginCheck } = require('./origins');
const { createAuthMiddleware } = require('./auth');

const { corsOriginCheck } = buildOriginCheck({
  corsOrigins: String(process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()),
  allowLocalNetwork: process.env.ALLOW_LOCAL_NETWORK !== 'false',
});
```

and, after the `io` is constructed:

```js
io.use(createAuthMiddleware(JWT_SECRET));
```

Leave the `JWT_SECRET` resolution and the exit-on-missing-secret block where they are. Leave every `io.on('connection', ...)` handler untouched — Task 3 replaces them.

- [ ] **Step 7: Verify the server still boots**

Run: `cd realtime-server && REALTIME_JWT_SECRET=dev node -e "process.env.PORT=0; require('./src/server.js'); setTimeout(() => process.exit(0), 500);"`
Expected: prints the listening line, exits 0, no stack trace.

- [ ] **Step 8: Commit**

```bash
git add realtime-server/src/origins.js realtime-server/src/auth.js realtime-server/src/server.js realtime-server/test/auth.test.js
git commit -m "refactor(realtime): extract origin allowlist and JWT auth into modules"
```

---

## Task 3: Replace the socket protocol

**Files:**
- Create: `realtime-server/src/handlers.js`
- Create: `realtime-server/test/protocol.test.js`
- Modify: `realtime-server/src/server.js` (bootstrap only)

**Interfaces:**
- Consumes: `createRegistry` (Task 1), `describeDevice` (Task 1), `buildOriginCheck`, `createAuthMiddleware` (Task 2).
- Produces: `registerHandlers({ io, registry, now }) -> void`, `createApp() -> { app, server, io, registry }` exported from `server.js` for tests, `MAX_IMAGE_BYTES`.

- [ ] **Step 1: Write the failing protocol test**

Create `realtime-server/test/protocol.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { io: ioClient } = require('socket.io-client');

process.env.REALTIME_JWT_SECRET = 'test-secret';
process.env.ALLOW_LOCAL_NETWORK = 'true';

const { createApp } = require('../src/server');

const SECRET = 'test-secret';
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const signToken = (payload) => {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
};

const withServer = async (fn) => {
  const { server, io, registry } = createApp();
  await new Promise((resolve) => server.listen(0, resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const connect = (userId) =>
    new Promise((resolve, reject) => {
      const socket = ioClient(url, {
        auth: { token: signToken({ sub: userId }) },
        transports: ['websocket'],
        reconnection: false,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });

  try {
    await fn({ connect, registry, url });
  } finally {
    sockets.forEach((s) => s.close());
    io.close();
    await new Promise((resolve) => server.close(resolve));
  }
};

const emit = (socket, event, payload) =>
  new Promise((resolve) => socket.emit(event, payload, resolve));

const once = (socket, event, timeoutMs = 2000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

test('a phone that announces appears in its owner desktop list', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', {
      deviceId: 'dev-a', name: 'iPhone · Safari', platform: 'iPhone',
    });

    const desktop = await connect('u1');
    const ack = await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows · Chrome' });
    assert.equal(ack.ok, true);
    assert.equal(ack.devices.length, 1);
    assert.equal(ack.devices[0].deviceId, 'dev-a');
  });
});

test('a desktop never sees another account devices', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });

    const stranger = await connect('u2');
    const ack = await emit(stranger, 'presence:subscribe', { desktopId: 'desk-x', name: 'Mac' });
    assert.deepEqual(ack.devices, []);

    const denied = await emit(stranger, 'link:request', { deviceId: 'dev-a' });
    assert.deepEqual(denied, { ok: false, reason: 'DEVICE_GONE' });
  });
});

test('presence:list is pushed to subscribed desktops as devices come and go', async () => {
  await withServer(async ({ connect }) => {
    const desktop = await connect('u1');
    await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows' });

    const arrival = once(desktop, 'presence:list');
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });
    assert.equal((await arrival).devices.length, 1);

    const departure = once(desktop, 'presence:list');
    await emit(phone, 'presence:withdraw', {});
    assert.equal((await departure).devices.length, 0);
  });
});

test('request, accept, link established on both sides', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });
    const desktop = await connect('u1');
    await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows · Chrome' });

    const incoming = once(phone, 'link:incoming');
    const ack = await emit(desktop, 'link:request', { deviceId: 'dev-a' });
    assert.equal(ack.ok, true);

    const request = await incoming;
    assert.equal(request.desktopName, 'Windows · Chrome');
    assert.equal(request.expiresInMs, 30000);

    const desktopLinked = once(desktop, 'link:established');
    const phoneLinked = once(phone, 'link:established');
    await emit(phone, 'link:respond', { requestId: request.requestId, accept: true });

    assert.equal((await desktopLinked).peer.deviceId, 'dev-a');
    assert.deepEqual((await phoneLinked).examProblems, []);
  });
});

test('declining tells the desktop and frees the device', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });
    const desktop = await connect('u1');
    await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows' });

    const incoming = once(phone, 'link:incoming');
    await emit(desktop, 'link:request', { deviceId: 'dev-a' });
    const { requestId } = await incoming;

    const rejected = once(desktop, 'link:rejected');
    await emit(phone, 'link:respond', { requestId, accept: false });
    assert.equal((await rejected).deviceId, 'dev-a');

    const refreshed = await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows' });
    assert.equal(refreshed.devices[0].busy, false);
  });
});

test('exam problems reach the phone, and a photo reaches the desktop', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });
    const desktop = await connect('u1');
    await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows' });

    const incoming = once(phone, 'link:incoming');
    await emit(desktop, 'link:request', { deviceId: 'dev-a' });
    const { requestId } = await incoming;
    const phoneLinked = once(phone, 'link:established');
    await emit(phone, 'link:respond', { requestId, accept: true });
    await phoneLinked;

    const problems = once(phone, 'exam:problems');
    await emit(desktop, 'exam:problems', {
      problems: [{ id: 17, label: 'Задача 17', type: 'open' }],
    });
    assert.equal((await problems).problems[0].label, 'Задача 17');

    const image = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const arrived = once(desktop, 'answer:submit');
    const received = once(phone, 'answer:received');
    const ack = await emit(phone, 'answer:submit', { problemId: 17, image });
    assert.equal(ack.ok, true);

    const delivered = await arrived;
    assert.equal(delivered.problemId, 17);
    assert.equal(delivered.image, image);
    assert.equal((await received).problemId, 17);
  });
});

test('a phone linking mid-exam immediately receives the cached problems', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });
    const desktop = await connect('u1');
    await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows' });

    // Desktop publishes before any phone is linked; the value is held on the
    // desktop session and replayed when a link is formed.
    await emit(desktop, 'exam:problems', { problems: [{ id: 3, label: 'Задача 3', type: 'open' }] });

    const incoming = once(phone, 'link:incoming');
    await emit(desktop, 'link:request', { deviceId: 'dev-a' });
    const { requestId } = await incoming;
    const phoneLinked = once(phone, 'link:established');
    await emit(phone, 'link:respond', { requestId, accept: true });

    assert.equal((await phoneLinked).examProblems[0].id, 3);
  });
});

test('an oversized photo is refused', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });
    const desktop = await connect('u1');
    await emit(desktop, 'presence:subscribe', { desktopId: 'desk-1', name: 'Windows' });
    const incoming = once(phone, 'link:incoming');
    await emit(desktop, 'link:request', { deviceId: 'dev-a' });
    const { requestId } = await incoming;
    const linked = once(phone, 'link:established');
    await emit(phone, 'link:respond', { requestId, accept: true });
    await linked;

    const huge = `data:image/jpeg;base64,${'A'.repeat(9 * 1024 * 1024)}`;
    assert.deepEqual(await emit(phone, 'answer:submit', { problemId: 1, image: huge }), {
      ok: false,
      reason: 'TOO_LARGE',
    });
  });
});

test('an unlinked phone cannot submit a photo', async () => {
  await withServer(async ({ connect }) => {
    const phone = await connect('u1');
    await emit(phone, 'presence:announce', { deviceId: 'dev-a', name: 'iPhone', platform: 'iPhone' });
    assert.deepEqual(
      await emit(phone, 'answer:submit', { problemId: 1, image: 'data:image/jpeg;base64,AA==' }),
      { ok: false, reason: 'NOT_LINKED' }
    );
  });
});

test('a companion-scoped token cannot open a socket', async () => {
  await withServer(async ({ url }) => {
    const head = b64({ alg: 'HS256', typ: 'JWT' });
    const body = b64({ sub: '1', type: 'companion', scope: 'companion' });
    const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');

    const socket = ioClient(url, {
      auth: { token: `${head}.${body}.${sig}` },
      transports: ['websocket'],
      reconnection: false,
    });
    const error = await new Promise((resolve) => socket.on('connect_error', resolve));
    assert.match(error.message, /UNAUTHORIZED/);
    socket.close();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd realtime-server && npm test`
Expected: FAIL — `createApp is not a function`.

- [ ] **Step 3: Implement `handlers.js`**

Create `realtime-server/src/handlers.js`:

```js
'use strict';

const { describeDevice, detectPlatform } = require('./deviceName');

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const REQUEST_TTL_MS = 30_000;

const presenceRoom = (userId) => `presence:${userId}`;

const normalizeProblems = (value) => {
  if (!Array.isArray(value)) return null;
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ id: Number(item.id), label: String(item.label || '').trim(), type: item.type }))
    .filter((item) => Number.isFinite(item.id) && item.label.length > 0 && item.type === 'open')
    .map((item) => ({ id: item.id, label: item.label, type: 'open' }));
};

const approxBytes = (dataUrl) => {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.floor((base64.length * 3) / 4);
};

const registerHandlers = ({ io, registry, now = () => Date.now() }) => {
  const broadcastPresence = (userId) => {
    io.to(presenceRoom(userId)).emit('presence:list', { devices: registry.listDevices(userId) });
  };

  const endLinkAndNotify = (link, reason) => {
    if (!link) return;
    registry.endLink(link.linkId);
    io.to(link.desktopSocketId).emit('link:ended', { reason });
    io.to(link.phoneSocketId).emit('link:ended', { reason });
    broadcastPresence(link.userId);
  };

  io.on('connection', (socket) => {
    const userId = socket.data.authUserId;

    socket.on('presence:subscribe', (payload = {}, callback) => {
      const desktopId = String(payload.desktopId || '').trim();
      if (!desktopId) return callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });

      socket.data.role = 'desktop';
      socket.data.desktopId = desktopId;
      socket.data.desktopName =
        String(payload.name || '').trim() ||
        describeDevice(socket.handshake.headers['user-agent'] || '');
      socket.join(presenceRoom(userId));

      // A desktop that reloaded within the grace window keeps its link.
      const reattached = registry.reattachDesktop({ userId, desktopId, socketId: socket.id });
      if (reattached) {
        socket.emit('link:established', {
          linkId: reattached.linkId,
          peer: registry.getEntry(userId, reattached.phoneDeviceId) ?? { deviceId: reattached.phoneDeviceId },
          examProblems: reattached.examProblems,
        });
      }

      callback?.({ ok: true, devices: registry.listDevices(userId) });
    });

    socket.on('presence:unsubscribe', (_payload, callback) => {
      socket.leave(presenceRoom(userId));
      callback?.({ ok: true });
    });

    socket.on('presence:announce', (payload = {}, callback) => {
      const deviceId = String(payload.deviceId || '').trim();
      if (!deviceId) return callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });

      const userAgent = socket.handshake.headers['user-agent'] || '';
      socket.data.role = 'phone';
      socket.data.deviceId = deviceId;

      registry.announce({
        userId,
        deviceId,
        socketId: socket.id,
        name: String(payload.name || '').trim() || describeDevice(userAgent),
        platform: String(payload.platform || '').trim() || detectPlatform(userAgent),
        userAgent,
        at: now(),
      });

      // A phone whose screen slept keeps its link if it comes back in time.
      const reattached = registry.reattachPhone({ userId, deviceId, socketId: socket.id });
      if (reattached) {
        socket.emit('link:established', {
          linkId: reattached.linkId,
          peer: { desktopId: reattached.desktopId },
          examProblems: reattached.examProblems,
        });
        io.to(reattached.desktopSocketId).emit('link:peer-reconnected', { deviceId });
      }

      broadcastPresence(userId);
      callback?.({ ok: true, deviceId });
    });

    socket.on('presence:withdraw', (_payload, callback) => {
      if (socket.data.deviceId) {
        registry.withdraw({ userId, deviceId: socket.data.deviceId });
        broadcastPresence(userId);
      }
      callback?.({ ok: true });
    });

    socket.on('link:request', (payload = {}, callback) => {
      if (socket.data.role !== 'desktop') return callback?.({ ok: false, reason: 'UNAUTHORIZED' });
      const deviceId = String(payload.deviceId || '').trim();
      if (!deviceId) return callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });

      const created = registry.createRequest({
        userId,
        desktopId: socket.data.desktopId,
        desktopSocketId: socket.id,
        phoneDeviceId: deviceId,
        at: now(),
      });
      if (!created.ok) return callback?.(created);

      io.to(created.request.phoneSocketId).emit('link:incoming', {
        requestId: created.request.requestId,
        desktopName: socket.data.desktopName,
        expiresInMs: REQUEST_TTL_MS,
      });
      broadcastPresence(userId);
      // Remembered so this socket's own request — and only its own — is
      // cancelled if it disconnects before the phone answers.
      socket.data.pendingRequestId = created.request.requestId;
      callback?.({ ok: true, requestId: created.request.requestId });
    });

    socket.on('link:cancel', (payload = {}, callback) => {
      const request = registry.cancelRequest(String(payload.requestId || ''));
      delete socket.data.pendingRequestId;
      if (request) {
        io.to(request.phoneSocketId).emit('link:expired', { requestId: request.requestId });
        broadcastPresence(userId);
      }
      callback?.({ ok: true });
    });

    socket.on('link:respond', (payload = {}, callback) => {
      const requestId = String(payload.requestId || '');
      const resolved = registry.resolveRequest(requestId, Boolean(payload.accept), now());
      if (!resolved.ok) return callback?.(resolved);

      const desktopSocketForRequest = io.sockets.sockets.get(resolved.request.desktopSocketId);
      if (desktopSocketForRequest) delete desktopSocketForRequest.data.pendingRequestId;

      if (!resolved.accepted) {
        io.to(resolved.request.desktopSocketId).emit('link:rejected', {
          deviceId: resolved.request.phoneDeviceId,
        });
        broadcastPresence(userId);
        return callback?.({ ok: true });
      }

      const { link } = resolved;
      // Replay whatever the desktop published before the link existed, so a
      // phone that joins mid-exam gets the problem list without a republish.
      const desktopSocket = io.sockets.sockets.get(link.desktopSocketId);
      const pendingProblems = desktopSocket?.data.pendingExamProblems;
      if (Array.isArray(pendingProblems) && pendingProblems.length) {
        registry.setExamProblems(link.linkId, pendingProblems);
      }

      io.to(link.desktopSocketId).emit('link:established', {
        linkId: link.linkId,
        peer: registry.getEntry(userId, link.phoneDeviceId) ?? { deviceId: link.phoneDeviceId },
        examProblems: link.examProblems,
      });
      socket.emit('link:established', {
        linkId: link.linkId,
        peer: { desktopId: link.desktopId },
        examProblems: link.examProblems,
      });
      broadcastPresence(userId);
      callback?.({ ok: true });
    });

    socket.on('link:leave', (_payload, callback) => {
      endLinkAndNotify(registry.getLinkBySocketId(socket.id), 'peer-left');
      callback?.({ ok: true });
    });

    socket.on('link:end', (_payload, callback) => {
      endLinkAndNotify(registry.getLinkBySocketId(socket.id), 'peer-left');
      callback?.({ ok: true });
    });

    socket.on('exam:problems', (payload = {}, callback) => {
      if (socket.data.role !== 'desktop') return callback?.({ ok: false, reason: 'UNAUTHORIZED' });
      const problems = normalizeProblems(payload.problems);
      if (problems === null) return callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });

      // Held on the session so it survives until a link exists.
      socket.data.pendingExamProblems = problems;

      const link = registry.getLinkBySocketId(socket.id);
      if (link) {
        registry.setExamProblems(link.linkId, problems);
        io.to(link.phoneSocketId).emit('exam:problems', { problems });
      }
      callback?.({ ok: true });
    });

    socket.on('answer:submit', (payload = {}, callback) => {
      const link = registry.getLinkBySocketId(socket.id);
      if (!link || link.phoneSocketId !== socket.id) {
        return callback?.({ ok: false, reason: 'NOT_LINKED' });
      }

      const problemId = Number(payload.problemId);
      const image = payload.image;
      if (
        !Number.isFinite(problemId) ||
        typeof image !== 'string' ||
        !image.startsWith('data:image/')
      ) {
        return callback?.({ ok: false, reason: 'INVALID_PAYLOAD' });
      }
      if (approxBytes(image) > MAX_IMAGE_BYTES) {
        return callback?.({ ok: false, reason: 'TOO_LARGE' });
      }

      const entry = registry.getEntry(userId, link.phoneDeviceId);
      io.to(link.desktopSocketId).emit('answer:submit', {
        problemId,
        image,
        deviceId: link.phoneDeviceId,
        deviceName: entry?.name || 'Телефон',
        submittedAt: new Date().toISOString(),
      });
      socket.emit('answer:received', { problemId });
      callback?.({ ok: true });
    });

    socket.on('disconnect', () => {
      const removed = registry.removeSocketPresence(socket.id);
      // The link is *held*, not ended — the grace sweep decides.
      registry.markSocketGone(socket.id, now());
      if (removed) broadcastPresence(removed.userId);

      // Cancel only this socket's own pending request. Sweeping every pending
      // request here would cancel other users' in-flight pairings.
      const ownRequestId = socket.data.pendingRequestId;
      if (ownRequestId) {
        const request = registry.cancelRequest(ownRequestId);
        if (request) {
          io.to(request.desktopSocketId).emit('link:expired', { requestId: ownRequestId });
          io.to(request.phoneSocketId).emit('link:expired', { requestId: ownRequestId });
        }
      }
      broadcastPresence(userId);
    });
  });

  const sweep = () => {
    const at = now();
    for (const request of registry.sweepRequests(at)) {
      io.to(request.desktopSocketId).emit('link:expired', { requestId: request.requestId });
      io.to(request.phoneSocketId).emit('link:expired', { requestId: request.requestId });
      broadcastPresence(request.userId);
    }
    for (const { link } of registry.sweepGrace(at)) {
      io.to(link.desktopSocketId).emit('link:ended', { reason: 'peer-gone' });
      io.to(link.phoneSocketId).emit('link:ended', { reason: 'peer-gone' });
      broadcastPresence(link.userId);
    }
  };

  return { sweep, broadcastPresence };
};

module.exports = { registerHandlers, MAX_IMAGE_BYTES, REQUEST_TTL_MS, normalizeProblems };
```

- [ ] **Step 4: Rewrite `server.js` as bootstrap only**

Replace the whole of `realtime-server/src/server.js` with:

```js
'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const { buildOriginCheck } = require('./origins');
const { createAuthMiddleware } = require('./auth');
const { createRegistry } = require('./registry');
const { registerHandlers } = require('./handlers');

const JWT_SECRET = process.env.REALTIME_JWT_SECRET || process.env.SECRET_KEY || '';

if (!JWT_SECRET) {
  console.error(
    '❌ REALTIME_JWT_SECRET (or SECRET_KEY) is not set. It must match the backend ' +
    'SECRET_KEY. Exiting rather than running as a black hole that rejects every socket.'
  );
  process.exit(1);
}

const SWEEP_INTERVAL_MS = 5_000;

const createApp = () => {
  const { corsOriginCheck } = buildOriginCheck({
    corsOrigins: String(process.env.CORS_ORIGINS || '').split(',').map((v) => v.trim()),
    allowLocalNetwork: process.env.ALLOW_LOCAL_NETWORK !== 'false',
  });

  const app = express();
  app.use(cors({ origin: corsOriginCheck, credentials: true }));
  app.get('/health', (_req, res) => res.json({ ok: true, service: 'realtime-pairing' }));
  // Keep-alive endpoint — point an uptime monitor at this URL on a 5-minute
  // interval so Render's free tier never spins down.
  app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }));

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: corsOriginCheck, credentials: true },
    maxHttpBufferSize: 10 * 1024 * 1024,
  });

  io.use(createAuthMiddleware(JWT_SECRET));

  const registry = createRegistry();
  const { sweep } = registerHandlers({ io, registry });
  const sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  sweepTimer.unref?.();
  io.on('close', () => clearInterval(sweepTimer));

  return { app, server, io, registry, sweep };
};

module.exports = { createApp };

if (require.main === module) {
  const PORT = Number(process.env.PORT || 3001);
  const { server } = createApp();
  server.listen(PORT, () => {
    console.log(`Realtime pairing server listening on http://127.0.0.1:${PORT}`);
  });
}
```

- [ ] **Step 5: Run the protocol tests**

Run: `cd realtime-server && npm test`
Expected: PASS — all registry, auth and protocol tests.

- [ ] **Step 6: Commit**

```bash
git add realtime-server/src/handlers.js realtime-server/src/server.js realtime-server/test/protocol.test.js
git commit -m "feat(realtime): replace room/code pairing with presence + link handshake"
```

---

## Task 4: Frontend device identity and image capture utilities

**Files:**
- Create: `frontend/src/utils/deviceIdentity.ts`
- Create: `frontend/src/utils/deviceIdentity.test.ts`
- Create: `frontend/src/utils/imageCapture.ts`
- Create: `frontend/src/utils/imageCapture.test.ts`

**Interfaces:**
- Consumes: `withUserScope` from `frontend/src/utils/userIdentity`.
- Produces: `getDeviceId()`, `getDesktopId()`, `getNickname()`, `setNickname(name)`, `describeDevice(ua?)`, `detectPlatform(ua?)` from `deviceIdentity`; `isImageFile(file)`, `isHeicFile(file)`, `fileToJpegDataUrl(file)` from `imageCapture`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/deviceIdentity.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { describeDevice, detectPlatform, getDesktopId, getDeviceId, getNickname, setNickname } from './deviceIdentity';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';

describe('deviceIdentity', () => {
  beforeEach(() => localStorage.clear());

  it('names devices without confusing Chrome for Safari or Edge for Chrome', () => {
    expect(detectPlatform(IPHONE)).toBe('iPhone');
    expect(describeDevice(IPHONE)).toBe('iPhone · Safari');
    expect(describeDevice(EDGE)).toBe('Windows · Edge');
  });

  it('mints a stable device id that survives repeat calls', () => {
    const first = getDeviceId();
    expect(first).toBeTruthy();
    expect(getDeviceId()).toBe(first);
  });

  it('keeps device and desktop ids distinct', () => {
    expect(getDeviceId()).not.toBe(getDesktopId());
  });

  it('round-trips a nickname and falls back to empty', () => {
    expect(getNickname()).toBe('');
    setNickname('Телефонът на Иван');
    expect(getNickname()).toBe('Телефонът на Иван');
  });
});
```

Create `frontend/src/utils/imageCapture.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isHeicFile, isImageFile } from './imageCapture';

const file = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });

describe('imageCapture detection', () => {
  it('accepts images by MIME type', () => {
    expect(isImageFile(file('a.png', 'image/png'))).toBe(true);
  });

  it('accepts images by extension when the MIME type is missing', () => {
    // iOS routinely hands over an empty type for camera captures.
    expect(isImageFile(file('IMG_0001.HEIC', ''))).toBe(true);
    expect(isImageFile(file('photo.JPG', ''))).toBe(true);
  });

  it('rejects non-images', () => {
    expect(isImageFile(file('notes.pdf', 'application/pdf'))).toBe(false);
  });

  it('detects HEIC by both MIME type and extension', () => {
    expect(isHeicFile(file('a.heic', ''))).toBe(true);
    expect(isHeicFile(file('a.jpg', 'image/heif'))).toBe(true);
    expect(isHeicFile(file('a.jpg', 'image/jpeg'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- deviceIdentity imageCapture`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `deviceIdentity.ts`**

Create `frontend/src/utils/deviceIdentity.ts`:

```ts
import { withUserScope } from './userIdentity';

const DEVICE_ID_KEY = 'connect-device-id-v1';
const DESKTOP_ID_KEY = 'connect-desktop-id-v1';
const NICKNAME_KEY = 'connect-device-nickname-v1';

const mintId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
};

// Falls back to a fresh id rather than throwing: a phone in private mode still
// pairs, it just will not survive a reload.
const stableId = (key: string): string => {
  const scoped = withUserScope(key);
  try {
    const existing = localStorage.getItem(scoped);
    if (existing) return existing;
    const minted = mintId();
    localStorage.setItem(scoped, minted);
    return minted;
  } catch {
    return mintId();
  }
};

export const getDeviceId = (): string => stableId(DEVICE_ID_KEY);
export const getDesktopId = (): string => stableId(DESKTOP_ID_KEY);

export const getNickname = (): string => {
  try {
    return localStorage.getItem(withUserScope(NICKNAME_KEY)) ?? '';
  } catch {
    return '';
  }
};

export const setNickname = (name: string): void => {
  try {
    localStorage.setItem(withUserScope(NICKNAME_KEY), name.trim());
  } catch {
    // Non-fatal: the nickname is a convenience, not state the protocol needs.
  }
};

// Order matters in both tables: a Chrome UA contains "Safari", an Edge UA
// contains "Chrome".
export const detectPlatform = (userAgent: string = navigator.userAgent): string => {
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone/i.test(userAgent)) return 'iPhone';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Устройство';
};

const detectBrowser = (userAgent: string): string => {
  if (/Edg\//i.test(userAgent)) return 'Edge';
  if (/OPR\/|Opera/i.test(userAgent)) return 'Opera';
  if (/Chrome\//i.test(userAgent) && !/Chromium/i.test(userAgent)) return 'Chrome';
  if (/Firefox\//i.test(userAgent)) return 'Firefox';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Браузър';
};

export const describeDevice = (userAgent: string = navigator.userAgent): string =>
  `${detectPlatform(userAgent)} · ${detectBrowser(userAgent)}`;

/** The nickname if the user set one, otherwise the derived name. */
export const getDisplayName = (): string => getNickname() || describeDevice();
```

- [ ] **Step 4: Implement `imageCapture.ts`**

Create `frontend/src/utils/imageCapture.ts`. This is the conversion logic lifted verbatim from `ControllerPage.tsx` — it handles real iOS camera behaviour and is not being redesigned:

```ts
import heic2any from 'heic2any';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif'];

const HEIC_TIMEOUT_MS = 30_000;
const STANDARD_TIMEOUT_MS = 10_000;

/** iOS often reports an empty MIME type for camera captures, so check both. */
export const isImageFile = (file: File): boolean => {
  if ((file.type || '').startsWith('image/')) return true;
  const name = file.name.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
};

export const isHeicFile = (file: File): boolean => {
  const type = file.type || '';
  if (type === 'image/heic' || type === 'image/heif') return true;
  const name = file.name.toLowerCase();
  return name.endsWith('.heic') || name.endsWith('.heif');
};

const canvasFromBlob = (blob: Blob): Promise<HTMLCanvasElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    const blobUrl = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      URL.revokeObjectURL(blobUrl);
      if (!context) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      context.drawImage(image, 0, 0);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error('Failed to load image'));
    };
    image.src = blobUrl;
  });

const toCanvas = async (file: File): Promise<HTMLCanvasElement> => {
  if (isHeicFile(file)) {
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.95 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return canvasFromBlob(blob as Blob);
  }
  const effectiveMime = file.type && file.type.startsWith('image/') ? file.type : 'image/jpeg';
  return canvasFromBlob(new Blob([file], { type: effectiveMime }));
};

/**
 * Normalise any camera capture to a JPEG data URL.
 *
 * Everything is re-encoded, not just HEIC: it is the only way to get a
 * predictable MIME type and size out of the range of formats phones produce.
 */
export const fileToJpegDataUrl = async (file: File): Promise<string> => {
  if (!isImageFile(file)) throw new Error('Файлът не е изображение');

  const timeoutMs = isHeicFile(file) ? HEIC_TIMEOUT_MS : STANDARD_TIMEOUT_MS;
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Обработката на снимката отне твърде дълго (${timeoutMs} ms)`)), timeoutMs)
  );

  const canvas = await Promise.race([toCanvas(file), timeout]);
  return canvas.toDataURL('image/jpeg', 0.95);
};
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npm test -- deviceIdentity imageCapture`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/deviceIdentity.ts frontend/src/utils/deviceIdentity.test.ts frontend/src/utils/imageCapture.ts frontend/src/utils/imageCapture.test.ts
git commit -m "feat(connect): add device identity and image capture utilities"
```

---

## Task 5: Rewrite the socket service

**Files:**
- Modify: `frontend/src/services/socket.ts` (full rewrite of the event surface; keep `resolveSocketConfig`, `SOCKET_SERVER_URL`, `REALTIME_AVAILABLE`, `createSocketClient`, `getStoredPairingUserId` exactly as they are)

**Interfaces:**
- Consumes: `deviceIdentity` (Task 4).
- Produces: types `DiscoveredDevice`, `LinkEstablished`, `IncomingLinkRequest`, `AnswerSubmitPayload`, `PairingImagePayload`, `ConnectAck`; helpers `emitPresenceSubscribe`, `emitPresenceAnnounce`, `emitPresenceWithdraw`, `emitLinkRequest`, `emitLinkCancel`, `emitLinkRespond`, `emitLinkEnd`, `emitExamProblems`, `emitAnswerSubmit`.

- [ ] **Step 1: Replace the event surface**

In `frontend/src/services/socket.ts`, delete `PairedDevice`, `RoomState`, `ActiveTestDataPayload`, `SubmitAnswerImagePayload`, `PairingAck`, `SendImageAck`, `ActiveTestDataAck`, `SubmitAnswerImageAck`, `emitCreateRoom`, `emitJoinRoom`, `emitSendImage`, `emitActiveTestData`, `emitSubmitAnswerImage` and `generatePairingCode`. Keep `PairingImagePayload` (`MathVisionPanel` still consumes it). Add:

```ts
import type { ActiveTestProblem } from './activeTest';

export type ConnectReason =
  | 'UNAUTHORIZED'
  | 'INVALID_PAYLOAD'
  | 'DEVICE_GONE'
  | 'DEVICE_BUSY'
  | 'ALREADY_LINKED'
  | 'NOT_LINKED'
  | 'TOO_LARGE'
  | 'REQUEST_EXPIRED'
  | 'REQUEST_UNKNOWN';

export type ConnectAck<T = unknown> = ({ ok: true } & T) | { ok: false; reason?: ConnectReason };

export type DiscoveredDevice = {
  deviceId: string;
  name: string;
  platform: string;
  announcedAt: number;
  busy: boolean;
};

export type IncomingLinkRequest = {
  requestId: string;
  desktopName: string;
  expiresInMs: number;
};

export type LinkEstablished = {
  linkId: string;
  peer: { deviceId?: string; desktopId?: string; name?: string };
  examProblems: ActiveTestProblem[];
};

export type AnswerSubmitPayload = {
  problemId: number;
  image: string;
  deviceId: string;
  deviceName: string;
  submittedAt: string;
};

const request = <T,>(socket: PairingSocket, event: string, payload: unknown): Promise<ConnectAck<T>> =>
  new Promise((resolve) => {
    socket.emit(event, payload, (response: ConnectAck<T>) => resolve(response));
  });

export const emitPresenceSubscribe = (socket: PairingSocket, desktopId: string, name: string) =>
  request<{ devices: DiscoveredDevice[] }>(socket, 'presence:subscribe', { desktopId, name });

export const emitPresenceAnnounce = (
  socket: PairingSocket,
  deviceId: string,
  name: string,
  platform: string
) => request<{ deviceId: string }>(socket, 'presence:announce', { deviceId, name, platform });

export const emitPresenceWithdraw = (socket: PairingSocket) =>
  request(socket, 'presence:withdraw', {});

export const emitLinkRequest = (socket: PairingSocket, deviceId: string) =>
  request<{ requestId: string }>(socket, 'link:request', { deviceId });

export const emitLinkCancel = (socket: PairingSocket, requestId: string) =>
  request(socket, 'link:cancel', { requestId });

export const emitLinkRespond = (socket: PairingSocket, requestId: string, accept: boolean) =>
  request(socket, 'link:respond', { requestId, accept });

export const emitLinkEnd = (socket: PairingSocket) => request(socket, 'link:end', {});

export const emitLinkLeave = (socket: PairingSocket) => request(socket, 'link:leave', {});

export const emitExamProblems = (socket: PairingSocket, problems: ActiveTestProblem[]) =>
  request(socket, 'exam:problems', { problems });

export const emitAnswerSubmit = (socket: PairingSocket, problemId: number, image: string) =>
  request(socket, 'answer:submit', { problemId, image });
```

- [ ] **Step 2: Verify the type build fails only where expected**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: errors confined to `PairingContext.tsx` and `ControllerPage.tsx` (they still import the deleted helpers). Those are replaced in Tasks 6 and 10. No errors anywhere else.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/socket.ts
git commit -m "feat(connect): replace room socket helpers with presence/link protocol"
```

---

## Task 6: ConnectContext

Created alongside the existing `PairingContext.tsx`, which stays until Task 10 so the build never breaks.

**Files:**
- Create: `frontend/src/context/ConnectContext.tsx`
- Create: `frontend/src/context/ConnectContext.test.tsx`

**Interfaces:**
- Consumes: `socket.ts` (Task 5), `deviceIdentity` (Task 4), `activeTest.ts`, `testAnswerSync.ts`.
- Produces: `ConnectProvider`, `useConnect(): ConnectContextValue`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/context/ConnectContext.test.tsx`:

```tsx
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handlers = new Map<string, (payload: unknown) => void>();
const emitted: Array<{ event: string; payload: unknown }> = [];

const fakeSocket = {
  connected: true,
  on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
  once: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
  off: (event: string) => handlers.delete(event),
  removeAllListeners: (event?: string) => (event ? handlers.delete(event) : handlers.clear()),
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: (event: string, payload: unknown, ack?: (r: unknown) => void) => {
    emitted.push({ event, payload });
    if (event === 'presence:subscribe') ack?.({ ok: true, devices: [] });
    else if (event === 'link:request') ack?.({ ok: true, requestId: 'req-1' });
    else ack?.({ ok: true });
  },
};

vi.mock('../services/socket', async () => {
  const actual = await vi.importActual<typeof import('../services/socket')>('../services/socket');
  return {
    ...actual,
    REALTIME_AVAILABLE: true,
    SOCKET_SERVER_URL: 'http://localhost:3001',
    createSocketClient: () => fakeSocket,
    getStoredPairingUserId: () => '42',
  };
});

import { ConnectProvider, useConnect } from './ConnectContext';
import { TEST_ANSWER_IMAGE_EVENT } from '../services/testAnswerSync';

const Probe = () => {
  const { status, devices, linkedDevice, pendingRequest, requestLink } = useConnect();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="device-count">{devices.length}</span>
      <span data-testid="linked">{linkedDevice?.name ?? 'none'}</span>
      <span data-testid="pending">{pendingRequest?.deviceId ?? 'none'}</span>
      <button onClick={() => void requestLink('dev-a')}>connect</button>
    </div>
  );
};

const fire = (event: string, payload: unknown) =>
  act(() => {
    handlers.get(event)?.(payload);
  });

describe('ConnectContext', () => {
  beforeEach(() => {
    handlers.clear();
    emitted.length = 0;
    localStorage.clear();
  });

  it('subscribes to presence on mount', async () => {
    render(<ConnectProvider><Probe /></ConnectProvider>);
    await waitFor(() =>
      expect(emitted.some((e) => e.event === 'presence:subscribe')).toBe(true)
    );
    expect(screen.getByTestId('status').textContent).toBe('discovering');
  });

  it('renders devices pushed by presence:list', async () => {
    render(<ConnectProvider><Probe /></ConnectProvider>);
    await waitFor(() => expect(handlers.has('presence:list')).toBe(true));

    fire('presence:list', {
      devices: [{ deviceId: 'dev-a', name: 'iPhone · Safari', platform: 'iPhone', announcedAt: 1, busy: false }],
    });
    expect(screen.getByTestId('device-count').textContent).toBe('1');
  });

  it('moves to requesting, then linked, then back on link:ended', async () => {
    render(<ConnectProvider><Probe /></ConnectProvider>);
    await waitFor(() => expect(handlers.has('link:established')).toBe(true));

    await userEvent.click(screen.getByText('connect'));
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('dev-a'));
    expect(screen.getByTestId('status').textContent).toBe('requesting');

    fire('link:established', {
      linkId: 'l1',
      peer: { deviceId: 'dev-a', name: 'iPhone · Safari' },
      examProblems: [],
    });
    expect(screen.getByTestId('status').textContent).toBe('linked');
    expect(screen.getByTestId('linked').textContent).toBe('iPhone · Safari');

    fire('link:ended', { reason: 'peer-left' });
    expect(screen.getByTestId('status').textContent).toBe('discovering');
    expect(screen.getByTestId('linked').textContent).toBe('none');
  });

  it('clears the pending request when the phone declines', async () => {
    render(<ConnectProvider><Probe /></ConnectProvider>);
    await waitFor(() => expect(handlers.has('link:rejected')).toBe(true));

    await userEvent.click(screen.getByText('connect'));
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('dev-a'));

    fire('link:rejected', { deviceId: 'dev-a' });
    expect(screen.getByTestId('pending').textContent).toBe('none');
    expect(screen.getByTestId('status').textContent).toBe('discovering');
  });

  it('re-dispatches an inbound photo as the NVO answer-image event', async () => {
    render(<ConnectProvider><Probe /></ConnectProvider>);
    await waitFor(() => expect(handlers.has('answer:submit')).toBe(true));

    const received = vi.fn();
    window.addEventListener(TEST_ANSWER_IMAGE_EVENT, received);
    fire('answer:submit', {
      problemId: 17,
      image: 'data:image/jpeg;base64,AA==',
      deviceId: 'dev-a',
      deviceName: 'iPhone',
      submittedAt: '2026-09-21T00:00:00.000Z',
    });

    expect(received).toHaveBeenCalledTimes(1);
    const detail = (received.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.problemId).toBe(17);
    window.removeEventListener(TEST_ANSWER_IMAGE_EVENT, received);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- ConnectContext`
Expected: FAIL — `Failed to resolve import "./ConnectContext"`.

- [ ] **Step 3: Implement `ConnectContext.tsx`**

Create `frontend/src/context/ConnectContext.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  createSocketClient,
  emitExamProblems,
  emitLinkCancel,
  emitLinkEnd,
  emitLinkRequest,
  emitPresenceSubscribe,
  getStoredPairingUserId,
  REALTIME_AVAILABLE,
  type AnswerSubmitPayload,
  type DiscoveredDevice,
  type LinkEstablished,
  type PairingImagePayload,
  type PairingSocket,
} from '../services/socket';
import { ACTIVE_TEST_DATA_EVENT, readActiveTestData, type ActiveTestProblem } from '../services/activeTest';
import { TEST_ANSWER_IMAGE_EVENT, type SubmitAnswerImageEventPayload } from '../services/testAnswerSync';
import { describeDevice, getDesktopId } from '../utils/deviceIdentity';

export type ConnectStatus = 'idle' | 'connecting' | 'discovering' | 'requesting' | 'linked' | 'error';

export type LinkedDevice = { deviceId: string; name: string };

export type PendingRequest = { deviceId: string; requestId: string; expiresAt: number };

type ConnectContextValue = {
  status: ConnectStatus;
  error: string;
  devices: DiscoveredDevice[];
  linkedDevice: LinkedDevice | null;
  pendingRequest: PendingRequest | null;
  latestImage: PairingImagePayload | null;
  refreshDevices: () => Promise<void>;
  requestLink: (deviceId: string) => Promise<void>;
  cancelRequest: () => Promise<void>;
  endLink: () => Promise<void>;
};

const ConnectContext = createContext<ConnectContextValue | null>(null);

const REQUEST_TTL_MS = 30_000;

const reasonMessage: Record<string, string> = {
  DEVICE_GONE: 'Устройството вече не е налично.',
  DEVICE_BUSY: 'Устройството вече е свързано другаде.',
  ALREADY_LINKED: 'Вече имаш свързан телефон. Прекъсни връзката първо.',
  UNAUTHORIZED: 'Свързването беше отказано — влез отново в профила си.',
};

export const ConnectProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [status, setStatus] = useState<ConnectStatus>('idle');
  const [error, setError] = useState('');
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [linkedDevice, setLinkedDevice] = useState<LinkedDevice | null>(null);
  const [pendingRequest, setPendingRequest] = useState<PendingRequest | null>(null);
  const [latestImage, setLatestImage] = useState<PairingImagePayload | null>(null);
  const socketRef = useRef<PairingSocket | null>(null);

  const pushExamProblems = useCallback(async (problems?: ActiveTestProblem[]) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    await emitExamProblems(socket, problems ?? readActiveTestData());
  }, []);

  const subscribe = useCallback(async (socket: PairingSocket) => {
    const ack = await emitPresenceSubscribe(socket, getDesktopId(), describeDevice());
    if (!ack.ok) {
      setStatus('error');
      setError(reasonMessage[ack.reason ?? ''] ?? 'Неуспешно свързване със сървъра.');
      return;
    }
    setDevices(ack.devices);
    setStatus((current) => (current === 'linked' ? current : 'discovering'));
    setError('');
    await pushExamProblems();
  }, [pushExamProblems]);

  const attachListeners = useCallback((socket: PairingSocket) => {
    socket.on('presence:list', (payload: { devices: DiscoveredDevice[] }) => {
      setDevices(payload?.devices ?? []);
    });

    socket.on('link:established', (payload: LinkEstablished) => {
      setLinkedDevice({
        deviceId: payload.peer?.deviceId ?? '',
        name: payload.peer?.name ?? 'Телефон',
      });
      setPendingRequest(null);
      setStatus('linked');
      setError('');
      // Re-push in case the exam started while this link was forming.
      void pushExamProblems();
    });

    socket.on('link:rejected', () => {
      setPendingRequest(null);
      setStatus('discovering');
      setError('Заявката беше отказана от устройството.');
    });

    socket.on('link:expired', () => {
      setPendingRequest(null);
      setStatus((current) => (current === 'linked' ? current : 'discovering'));
      setError('Заявката изтече без отговор.');
    });

    socket.on('link:ended', () => {
      setLinkedDevice(null);
      setPendingRequest(null);
      setStatus('discovering');
    });

    socket.on('link:peer-reconnected', () => setError(''));

    socket.on('answer:submit', (payload: AnswerSubmitPayload) => {
      const detail: SubmitAnswerImageEventPayload = {
        problemId: payload.problemId,
        image: payload.image,
        deviceId: payload.deviceId,
        deviceName: payload.deviceName,
        submittedAt: payload.submittedAt,
      };
      window.dispatchEvent(new CustomEvent<SubmitAnswerImageEventPayload>(TEST_ANSWER_IMAGE_EVENT, { detail }));
    });

    // Retained so MathVisionPanel keeps working. No phone entry point emits
    // this today — see "Known dead path" in the design spec.
    socket.on('sendImage', (payload: PairingImagePayload) => setLatestImage(payload));

    socket.on('disconnect', () => {
      setDevices([]);
      setStatus('connecting');
    });

    socket.on('connect', () => {
      void subscribe(socket);
    });

    socket.on('connect_error', () => {
      setStatus('error');
      setError('Няма връзка със сървъра за свързване на телефон.');
    });
  }, [pushExamProblems, subscribe]);

  useEffect(() => {
    if (!REALTIME_AVAILABLE) {
      setStatus('error');
      setError('Свързването с телефон не е конфигурирано (VITE_REALTIME_URL).');
      return;
    }
    if (!getStoredPairingUserId()) {
      setStatus('error');
      setError('Свързването с телефон изисква вписан профил.');
      return;
    }

    setStatus('connecting');
    const socket = createSocketClient();
    socketRef.current = socket;
    attachListeners(socket);
    if (socket.connected) void subscribe(socket);
    else socket.connect();

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [attachListeners, subscribe]);

  useEffect(() => {
    const onExamDataUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ActiveTestProblem[]>).detail;
      void pushExamProblems(Array.isArray(detail) ? detail : undefined);
    };
    window.addEventListener(ACTIVE_TEST_DATA_EVENT, onExamDataUpdated);
    return () => window.removeEventListener(ACTIVE_TEST_DATA_EVENT, onExamDataUpdated);
  }, [pushExamProblems]);

  const refreshDevices = useCallback(async () => {
    const socket = socketRef.current;
    if (socket?.connected) await subscribe(socket);
  }, [subscribe]);

  const requestLink = useCallback(async (deviceId: string) => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    setError('');
    const ack = await emitLinkRequest(socket, deviceId);
    if (!ack.ok) {
      setError(reasonMessage[ack.reason ?? ''] ?? 'Заявката не беше приета.');
      return;
    }
    setPendingRequest({ deviceId, requestId: ack.requestId, expiresAt: Date.now() + REQUEST_TTL_MS });
    setStatus('requesting');
  }, []);

  const cancelRequest = useCallback(async () => {
    const socket = socketRef.current;
    const current = pendingRequest;
    setPendingRequest(null);
    setStatus('discovering');
    if (socket?.connected && current) await emitLinkCancel(socket, current.requestId);
  }, [pendingRequest]);

  const endLink = useCallback(async () => {
    const socket = socketRef.current;
    setLinkedDevice(null);
    setStatus('discovering');
    if (socket?.connected) await emitLinkEnd(socket);
  }, []);

  const value = useMemo<ConnectContextValue>(
    () => ({
      status, error, devices, linkedDevice, pendingRequest, latestImage,
      refreshDevices, requestLink, cancelRequest, endLink,
    }),
    [cancelRequest, devices, endLink, error, latestImage, linkedDevice, pendingRequest, refreshDevices, requestLink, status]
  );

  return <ConnectContext.Provider value={value}>{children}</ConnectContext.Provider>;
};

export const useConnect = (): ConnectContextValue => {
  const context = useContext(ConnectContext);
  if (!context) throw new Error('useConnect must be used within a ConnectProvider');
  return context;
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- ConnectContext`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/ConnectContext.tsx frontend/src/context/ConnectContext.test.tsx
git commit -m "feat(connect): add ConnectContext presence and link state machine"
```

---

## Task 7: Desktop device list

**Files:**
- Modify: `frontend/src/components/SettingsConnectionPanel.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useConnect` (Task 6), `MathVisionPanel`.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Rewrite the panel**

Replace the whole of `frontend/src/components/SettingsConnectionPanel.tsx`:

```tsx
import React from 'react';
import { useConnect } from '../context/ConnectContext';
import MathVisionPanel from './MathVisionPanel';

const relativeTime = (announcedAt: number): string => {
  const seconds = Math.max(0, Math.round((Date.now() - announcedAt) / 1000));
  if (seconds < 60) return 'преди малко';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `преди ${minutes} мин`;
  return `преди ${Math.round(minutes / 60)} ч`;
};

const Countdown: React.FC<{ expiresAt: number }> = ({ expiresAt }) => {
  const [left, setLeft] = React.useState(() => Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
  React.useEffect(() => {
    const timer = window.setInterval(
      () => setLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000))),
      1000
    );
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  return <span className="tnum">{left} с</span>;
};

const SettingsConnectionPanel: React.FC = () => {
  const { status, error, devices, linkedDevice, pendingRequest, latestImage, refreshDevices, requestLink, cancelRequest, endLink } =
    useConnect();

  React.useEffect(() => {
    void refreshDevices();
  }, [refreshDevices]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-ink">Свързване с телефон</h4>
            <p className="mt-1 text-sm text-ink-faint">
              Телефоните се появяват тук, докато са отворили раздел „Свързване“.
            </p>
          </div>
          <span className="rounded-full bg-surface-sunken px-3 py-1 text-xs font-semibold text-ink-faint">
            {devices.length}
          </span>
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null}

        {linkedDevice ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
            <div>
              <p className="font-semibold text-emerald-900 dark:text-emerald-200">{linkedDevice.name}</p>
              <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-400">Свързан</p>
            </div>
            <button
              type="button"
              onClick={() => void endLink()}
              className="rounded-xl border border-emerald-300 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
            >
              Прекъсни
            </button>
          </div>
        ) : null}

        {pendingRequest ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/30">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
              Изчаква потвърждение от телефона · <Countdown expiresAt={pendingRequest.expiresAt} />
            </p>
            <button
              type="button"
              onClick={() => void cancelRequest()}
              className="rounded-xl border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:text-blue-200"
            >
              Откажи
            </button>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {devices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
              {status === 'connecting'
                ? 'Свързване със сървъра…'
                : 'Отвори приложението на телефона си и влез в раздел „Свързване“.'}
            </div>
          ) : (
            devices.map((device) => {
              const isLinked = linkedDevice?.deviceId === device.deviceId;
              const isPending = pendingRequest?.deviceId === device.deviceId;
              return (
                <div
                  key={device.deviceId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-sunken px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{device.name}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {device.platform} · {relativeTime(device.announcedAt)}
                      {device.busy && !isLinked && !isPending ? ' · заето' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={device.busy || Boolean(pendingRequest) || Boolean(linkedDevice)}
                    onClick={() => void requestLink(device.deviceId)}
                    className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isLinked ? 'Свързан' : isPending ? 'Изчаква…' : 'Свържи'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3">
          <h4 className="text-sm font-bold text-ink">Математическо разпознаване</h4>
          <p className="mt-0.5 text-xs text-ink-faint">
            Качи снимка — AI ще извлече уравненията и текста.
          </p>
        </div>
        <MathVisionPanel autoImage={latestImage} />
      </div>
    </div>
  );
};

export default SettingsConnectionPanel;
```

- [ ] **Step 2: Verify the existing settings test still passes**

Run: `cd frontend && npm test -- SettingsModal`
Expected: PASS. If it fails because the modal renders this panel without a `ConnectProvider`, wrap the panel usage in the test's existing provider stack — do not add a fallback to `useConnect`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SettingsConnectionPanel.tsx
git commit -m "feat(connect): rebuild settings panel as a live device list"
```

---

## Task 8: Navbar chip

**Files:**
- Modify: `frontend/src/components/AppNavbar.tsx` (the `PairingChip` component and its import)

**Interfaces:**
- Consumes: `useConnect` (Task 6), `useSettings` (already imported in this file).
- Produces: nothing.

- [ ] **Step 1: Replace the chip**

In `frontend/src/components/AppNavbar.tsx`, change the import `import { usePairing } from '../context/PairingContext';` to `import { useConnect } from '../context/ConnectContext';`, drop the now-unused `ArrowsClockwiseIcon` import if nothing else uses it, and replace the whole `PairingChip` component with:

```tsx
/**
 * Phone connection status. Shows the linked device, or a button that opens the
 * settings panel where the device list lives.
 */
const PairingChip: React.FC = () => {
  const { linkedDevice, status } = useConnect();
  const { openSettings } = useSettings();

  if (linkedDevice) {
    return (
      <Badge variant="brand" className="hidden h-9 gap-1.5 px-2.5 xl:inline-flex">
        <DeviceMobileIcon weight="fill" />
        <span className="max-w-24 truncate normal-case">{linkedDevice.name}</span>
      </Badge>
    );
  }

  return (
    <button
      type="button"
      onClick={() => openSettings()}
      className="hidden h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-2 text-caption text-ink-faint transition-colors hover:text-ink xl:flex"
    >
      <DeviceMobileIcon className="size-4" />
      <span>{status === 'connecting' ? 'Свързване' : 'Свържи телефон'}</span>
    </button>
  );
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: remaining errors confined to `PairingContext.tsx` and `ControllerPage.tsx` only.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AppNavbar.tsx
git commit -m "feat(connect): show linked device in the navbar instead of a pairing code"
```

---

## Task 9: Phone screen components

**Files:**
- Create: `frontend/src/components/connect/PhoneVisibleScreen.tsx`
- Create: `frontend/src/components/connect/PhoneConfirmSheet.tsx`
- Create: `frontend/src/components/connect/PhoneIdleScreen.tsx`
- Create: `frontend/src/components/connect/PhoneExamScreen.tsx`

**Interfaces:**
- Consumes: `deviceIdentity` (Task 4), `ActiveTestProblem`.
- Produces: four default-exported components with the props below, consumed only by Task 10.

- [ ] **Step 1: Create `PhoneVisibleScreen.tsx`**

```tsx
import React from 'react';
import { getNickname, setNickname } from '../../utils/deviceIdentity';

type Props = { deviceName: string; onNicknameChange: (name: string) => void };

const PhoneVisibleScreen: React.FC<Props> = ({ deviceName, onNicknameChange }) => {
  const [draft, setDraft] = React.useState(() => getNickname());

  const commit = () => {
    setNickname(draft);
    onNicknameChange(draft.trim());
  };

  return (
    <div className="text-center">
      <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
        <span className="size-3 animate-pulse rounded-full bg-blue-600" aria-hidden />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-slate-100">Видим си</h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">
        Компютърът ти може да те види като
      </p>
      <p className="mt-1 text-base font-semibold text-gray-900 dark:text-slate-100">{deviceName}</p>

      <label className="mt-6 block text-left">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Име на устройството
        </span>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, 40))}
          onBlur={commit}
          placeholder="напр. Телефонът на Иван"
          className="mt-1 h-12 w-full rounded-2xl border border-gray-200 bg-white px-4 text-base text-slate-900 outline-none focus:border-blue-400 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
        />
      </label>

      <p className="mt-6 text-sm text-gray-500 dark:text-slate-400">
        Избери това устройство на компютъра, за да се свържеш.
      </p>
    </div>
  );
};

export default PhoneVisibleScreen;
```

- [ ] **Step 2: Create `PhoneConfirmSheet.tsx`**

```tsx
import React from 'react';

type Props = {
  desktopName: string;
  expiresAt: number;
  onAccept: () => void;
  onDecline: () => void;
};

const PhoneConfirmSheet: React.FC<Props> = ({ desktopName, expiresAt, onAccept, onDecline }) => {
  const [left, setLeft] = React.useState(() => Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));

  React.useEffect(() => {
    const timer = window.setInterval(
      () => setLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000))),
      1000
    );
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Заявка за свързване" className="text-center">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Заявка за свързване</h1>
      <p className="mt-3 text-base text-gray-700 dark:text-slate-300">
        <span className="font-semibold">{desktopName}</span> иска да се свърже с този телефон.
      </p>
      <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Остават {left} с</p>

      <div className="mt-6 space-y-3">
        <button
          type="button"
          onClick={onAccept}
          className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white active:scale-[0.99]"
        >
          Приеми
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="h-14 w-full rounded-2xl border border-gray-200 text-base font-semibold text-gray-700 dark:border-slate-600 dark:text-slate-200"
        >
          Откажи
        </button>
      </div>
    </div>
  );
};

export default PhoneConfirmSheet;
```

- [ ] **Step 3: Create `PhoneIdleScreen.tsx`**

```tsx
import React from 'react';

type Props = { deviceName: string; onDisconnect: () => void };

/**
 * The Kahoot screen: the phone is a controller, so there is deliberately
 * nothing to read here. Everything happens on the desktop.
 */
const PhoneIdleScreen: React.FC<Props> = ({ deviceName, onDisconnect }) => (
  <div className="text-center">
    <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
      <svg viewBox="0 0 24 24" className="size-10 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
        <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
    <h1 className="mt-4 text-2xl font-bold text-gray-900 dark:text-slate-100">Свързан</h1>
    <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{deviceName}</p>
    <p className="mt-6 text-base font-medium text-gray-700 dark:text-slate-300">
      Погледни екрана на компютъра.
    </p>
    <button
      type="button"
      onClick={onDisconnect}
      className="mt-8 h-12 w-full rounded-2xl border border-gray-200 text-sm font-semibold text-gray-700 dark:border-slate-600 dark:text-slate-200"
    >
      Прекъсни
    </button>
  </div>
);

export default PhoneIdleScreen;
```

- [ ] **Step 4: Create `PhoneExamScreen.tsx`**

```tsx
import React from 'react';
import type { ActiveTestProblem } from '../../services/activeTest';

export type ProblemUpload = { image: string; status: 'empty' | 'sending' | 'sent' | 'failed' };

type Props = {
  problems: ActiveTestProblem[];
  uploads: Record<number, ProblemUpload>;
  error: string | null;
  onDismissError: () => void;
  onCapture: (problemId: number, file: File) => void;
};

const PhoneExamScreen: React.FC<Props> = ({ problems, uploads, error, onDismissError, onCapture }) => {
  const inputRefs = React.useRef<Record<number, HTMLInputElement | null>>({});
  const sentCount = problems.filter((p) => uploads[p.id]?.status === 'sent').length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-slate-100">Задачи</h1>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
          {sentCount} от {problems.length} изпратени
        </span>
      </div>

      {error ? (
        <div className="mt-3 flex items-start justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={onDismissError} aria-label="Затвори" className="shrink-0 font-bold">
            ✕
          </button>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {problems.map((problem) => {
          const upload = uploads[problem.id] ?? { image: '', status: 'empty' as const };
          const sent = upload.status === 'sent';
          return (
            <div key={problem.id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{problem.label}</p>
                {sent ? <span className="text-sm font-semibold text-emerald-600">✓ Изпратена</span> : null}
              </div>

              {upload.image ? (
                <img
                  src={upload.image}
                  alt={`Решение за ${problem.label}`}
                  className="mt-3 w-full rounded-xl border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : null}

              <button
                type="button"
                disabled={upload.status === 'sending'}
                onClick={() => inputRefs.current[problem.id]?.click()}
                className={`mt-3 h-14 w-full rounded-2xl px-4 text-base font-semibold text-white active:scale-[0.99] disabled:opacity-60 ${
                  sent ? 'bg-emerald-600' : 'bg-blue-600'
                }`}
              >
                {upload.status === 'sending' ? 'Изпраща…' : sent ? 'Снимай отново' : 'Снимай решението'}
              </button>

              <input
                ref={(element) => {
                  inputRefs.current[problem.id] = element;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onCapture(problem.id, file);
                  event.currentTarget.value = '';
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PhoneExamScreen;
```

- [ ] **Step 5: Verify it type-checks**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: remaining errors confined to `PairingContext.tsx` and `ControllerPage.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/connect/
git commit -m "feat(connect): add phone companion screens"
```

---

## Task 10: Phone state machine, routing, and provider swap

This is the task that removes the old code and makes runtime pairing work again.

**Files:**
- Modify: `frontend/src/pages/ControllerPage.tsx` (full rewrite)
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/context/PairingContext.tsx`

**Interfaces:**
- Consumes: Tasks 4, 5, 6, 9.
- Produces: the `/connect` route.

- [ ] **Step 1: Rewrite `ControllerPage.tsx`**

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { ActiveTestProblem } from '../services/activeTest';
import {
  createSocketClient,
  emitAnswerSubmit,
  emitLinkLeave,
  emitLinkRespond,
  emitPresenceAnnounce,
  emitPresenceWithdraw,
  REALTIME_AVAILABLE,
  type IncomingLinkRequest,
  type LinkEstablished,
  type PairingSocket,
} from '../services/socket';
import { describeDevice, detectPlatform, getDeviceId, getDisplayName } from '../utils/deviceIdentity';
import { fileToJpegDataUrl } from '../utils/imageCapture';
import PhoneVisibleScreen from '../components/connect/PhoneVisibleScreen';
import PhoneConfirmSheet from '../components/connect/PhoneConfirmSheet';
import PhoneIdleScreen from '../components/connect/PhoneIdleScreen';
import PhoneExamScreen, { type ProblemUpload } from '../components/connect/PhoneExamScreen';

type PhoneState = 'connecting' | 'visible' | 'confirming' | 'linked' | 'offline';

const ControllerPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [phoneState, setPhoneState] = React.useState<PhoneState>('connecting');
  const [deviceName, setDeviceName] = React.useState(() => getDisplayName());
  const [incoming, setIncoming] = React.useState<(IncomingLinkRequest & { expiresAt: number }) | null>(null);
  const [problems, setProblems] = React.useState<ActiveTestProblem[]>([]);
  const [uploads, setUploads] = React.useState<Record<number, ProblemUpload>>({});
  const [error, setError] = React.useState<string | null>(null);
  const socketRef = React.useRef<PairingSocket | null>(null);

  const announce = React.useCallback(async (socket: PairingSocket, name: string) => {
    const ack = await emitPresenceAnnounce(socket, getDeviceId(), name, detectPlatform());
    if (ack.ok) setPhoneState((current) => (current === 'linked' ? current : 'visible'));
  }, []);

  React.useEffect(() => {
    if (!user) return;
    if (!REALTIME_AVAILABLE) {
      setPhoneState('offline');
      setError('Свързването не е конфигурирано на този сървър.');
      return;
    }

    const socket = createSocketClient();
    socketRef.current = socket;

    socket.on('connect', () => void announce(socket, getDisplayName()));
    socket.on('connect_error', () => {
      setPhoneState('offline');
      setError('Няма връзка със сървъра.');
    });
    socket.on('disconnect', () => setPhoneState('connecting'));

    socket.on('link:incoming', (payload: IncomingLinkRequest) => {
      setIncoming({ ...payload, expiresAt: Date.now() + payload.expiresInMs });
      setPhoneState('confirming');
    });

    socket.on('link:expired', () => {
      setIncoming(null);
      setPhoneState((current) => (current === 'linked' ? current : 'visible'));
    });

    socket.on('link:established', (payload: LinkEstablished) => {
      setIncoming(null);
      setProblems(payload.examProblems ?? []);
      setPhoneState('linked');
      setError(null);
    });

    socket.on('link:ended', () => {
      setPhoneState('visible');
      setProblems([]);
      setUploads({});
    });

    socket.on('exam:problems', (payload: { problems?: ActiveTestProblem[] }) => {
      setProblems(Array.isArray(payload?.problems) ? payload.problems : []);
    });

    socket.on('answer:received', (payload: { problemId?: number }) => {
      const problemId = Number(payload?.problemId);
      if (!Number.isFinite(problemId)) return;
      setUploads((current) => ({
        ...current,
        [problemId]: { ...(current[problemId] ?? { image: '' }), status: 'sent' },
      }));
    });

    if (socket.connected) void announce(socket, getDisplayName());
    else socket.connect();

    const withdrawOnHide = () => {
      if (document.visibilityState === 'hidden' && socket.connected) void emitPresenceWithdraw(socket);
      if (document.visibilityState === 'visible' && socket.connected) void announce(socket, getDisplayName());
    };
    document.addEventListener('visibilitychange', withdrawOnHide);

    return () => {
      document.removeEventListener('visibilitychange', withdrawOnHide);
      // Leaving the connect screen must remove this phone from the desktop list.
      if (socket.connected) void emitPresenceWithdraw(socket);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [announce, user]);

  const handleNicknameChange = (name: string) => {
    const next = name || describeDevice();
    setDeviceName(next);
    const socket = socketRef.current;
    if (socket?.connected) void announce(socket, next);
  };

  const respond = async (accept: boolean) => {
    const socket = socketRef.current;
    const request = incoming;
    setIncoming(null);
    if (!accept) setPhoneState('visible');
    if (socket?.connected && request) await emitLinkRespond(socket, request.requestId, accept);
  };

  const disconnect = async () => {
    const socket = socketRef.current;
    setPhoneState('visible');
    setProblems([]);
    setUploads({});
    if (socket?.connected) await emitLinkLeave(socket);
  };

  const capture = async (problemId: number, file: File) => {
    setError(null);
    setUploads((current) => ({ ...current, [problemId]: { image: '', status: 'sending' } }));

    try {
      const dataUrl = await fileToJpegDataUrl(file);
      setUploads((current) => ({ ...current, [problemId]: { image: dataUrl, status: 'sending' } }));

      const socket = socketRef.current;
      if (!socket?.connected) throw new Error('Няма връзка с компютъра.');

      const ack = await emitAnswerSubmit(socket, problemId, dataUrl);
      if (!ack.ok) {
        const message =
          ack.reason === 'TOO_LARGE'
            ? 'Снимката е твърде голяма. Опитай отново.'
            : 'Изпращането не успя. Опитай отново.';
        throw new Error(message);
      }
      // 'sent' is confirmed by the answer:received event, not assumed here.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Възникна грешка.');
      setUploads((current) => ({ ...current, [problemId]: { image: '', status: 'failed' } }));
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-6 dark:from-slate-950 dark:to-slate-900">
        <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm items-center justify-center">
          <div className="w-full space-y-4 rounded-3xl border border-gray-200 bg-white p-6 text-center shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Нужен е профил</h1>
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Влез в същия профил като на компютъра, за да свържеш телефона.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="h-12 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700"
            >
              Към вход
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-6 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-sm items-center justify-center">
        <div className="w-full rounded-3xl border border-gray-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {phoneState === 'connecting' ? (
            <p className="text-center text-sm text-gray-500 dark:text-slate-400">Свързване…</p>
          ) : null}

          {phoneState === 'offline' ? (
            <p className="text-center text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
          ) : null}

          {phoneState === 'visible' ? (
            <PhoneVisibleScreen deviceName={deviceName} onNicknameChange={handleNicknameChange} />
          ) : null}

          {phoneState === 'confirming' && incoming ? (
            <PhoneConfirmSheet
              desktopName={incoming.desktopName}
              expiresAt={incoming.expiresAt}
              onAccept={() => void respond(true)}
              onDecline={() => void respond(false)}
            />
          ) : null}

          {phoneState === 'linked' && problems.length === 0 ? (
            <PhoneIdleScreen deviceName={deviceName} onDisconnect={() => void disconnect()} />
          ) : null}

          {phoneState === 'linked' && problems.length > 0 ? (
            <PhoneExamScreen
              problems={problems}
              uploads={uploads}
              error={error}
              onDismissError={() => setError(null)}
              onCapture={(problemId, file) => void capture(problemId, file)}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ControllerPage;
```

- [ ] **Step 2: Swap the provider and add the route in `App.tsx`**

Change `import { PairingProvider } from './context/PairingContext';` to `import { ConnectProvider } from './context/ConnectContext';`, rename the `<PairingProvider>` element to `<ConnectProvider>` (both tags), and add the alias route next to the existing controller route:

```tsx
<Route path="connect" element={<ControllerPage />} />
```

Place it beside the existing `controller` route so it inherits the same layout and guard.

- [ ] **Step 3: Delete the old context**

```bash
git rm frontend/src/context/PairingContext.tsx
```

- [ ] **Step 4: Verify the build is clean**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

Run: `cd frontend && npm test`
Expected: PASS — all suites.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ControllerPage.tsx frontend/src/App.tsx
git commit -m "feat(connect): rebuild the phone companion and retire code pairing"
```

---

## Task 11: Full verification

**Files:** none modified unless a check fails.

- [ ] **Step 1: Server suite**

Run: `cd realtime-server && npm test`
Expected: PASS, no skipped tests.

- [ ] **Step 2: Frontend suite**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `cd frontend && npm run build`
Expected: succeeds. `tsc -b` runs first, so a type error fails the build.

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors relative to the branch point. Fix any introduced by this work.

- [ ] **Step 5: Confirm no stale references survive**

```bash
grep -rn "usePairing\|PairingProvider\|generatePairingCode\|createRoom\|joinRoom\|roomCode\|activeTestData\|submitAnswerImage" frontend/src realtime-server/src
```
Expected: no matches. Any hit is a leftover from the old protocol and must be removed.

- [ ] **Step 6: Manual smoke test on a real phone**

Start the realtime server (`cd realtime-server && npm run dev`) and the frontend (`cd frontend && npm run dev -- --host`). Note that `backend/.env` points at a dead Supabase instance; set `DATABASE_URL=sqlite:///./local.db` and `ENVIRONMENT=development` and run `python -m alembic upgrade head` before starting uvicorn, or log in will fail.

Walk the flow: log into the same account on desktop and phone → phone opens `/connect` → device appears on desktop within a second → desktop clicks Свържи → phone shows the confirm sheet → accept → phone shows the Kahoot screen → start an NVO practice exam on the desktop → phone shows the open problems → photograph one → it appears as that problem's answer image on the desktop. Then: navigate the phone away from `/connect` and confirm it disappears from the desktop list.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix(connect): address verification findings"
```

---

## Self-Review

**Spec coverage.** Every spec section maps to a task: presence registry and link lifecycle → Tasks 1, 3; security invariants → Task 2 (extraction, with tests) and Task 3 (wiring); desktop context and panel → Tasks 6, 7; navbar → Task 8; phone screens and state machine → Tasks 9, 10; NVO integration → preserved by Task 6's `TEST_ANSWER_IMAGE_EVENT` dispatch and verified in Task 11 Step 6; the dead `sendImage` path → retained in Task 6 with a comment pointing at the spec; testing → Tasks 1, 2, 3, 4, 6 and 11.

**Naming consistency.** `deviceId` (phone) and `desktopId` (desktop) are used identically across `registry.js`, `handlers.js`, `socket.ts`, `ConnectContext.tsx` and `ControllerPage.tsx`. `examProblems` is the server-side field name throughout; the wire event is `exam:problems`; the frontend keeps the existing `ActiveTestProblem` type unchanged. `ProblemUpload.status` is the four-value union `'empty' | 'sending' | 'sent' | 'failed'` in both `PhoneExamScreen` and `ControllerPage`.

**Placeholder scan.** No `TBD`, `TODO`, "add error handling", or "similar to Task N" survives. Every code step carries the code it asks for; every test step carries the assertions.

**Watch items for the implementer.**
- `socket.data.pendingRequestId` is written in `link:request` and cleared in three places (`link:cancel`, `link:respond`, and implicitly on disconnect). If a fourth path to resolving a request is ever added, it must clear it too, or a stale id will cancel an unrelated later request.
- `handlers.js` `disconnect` calls `markSocketGone` before the grace sweep runs, so a link is never torn down synchronously on disconnect. Tests that assert "link gone after disconnect" must drive `sweep()` or wait for the interval — Task 3's tests deliberately assert the *held* behaviour instead.
