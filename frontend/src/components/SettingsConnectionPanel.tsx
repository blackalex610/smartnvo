import React from 'react';
import { Link } from 'react-router-dom';
import { usePairing } from '../context/PairingContext';

const statusLabel: Record<string, string> = {
  idle: 'Idle',
  connecting: 'Connecting...',
  waiting: 'Waiting for a phone to join',
  paired: 'Device connected',
  error: 'Connection issue',
};

const SettingsConnectionPanel: React.FC = () => {
  const { roomCode, devices, status, error, latestImage, ensureRoom, regenerateRoom } = usePairing();

  React.useEffect(() => {
    void ensureRoom();
  }, [ensureRoom]);

  const primaryDevice = devices[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-slate-50 p-5 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Pairing code</p>
            <div className="mt-2 flex items-center gap-2">
              {roomCode ? roomCode.split('').map((letter, index) => (
                <div
                  key={`${letter}-${index}`}
                  className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-200 bg-white text-xl font-black tracking-wide text-slate-900 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                >
                  {letter}
                </div>
              )) : (
                <p className="text-sm text-gray-500 dark:text-slate-400">Generating code...</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void regenerateRoom()}
            className="rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-900 dark:text-blue-300 dark:hover:border-blue-400 dark:hover:bg-slate-800"
          >
            New code
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full bg-white px-3 py-1 font-medium text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
            {statusLabel[status]}
          </span>
          {primaryDevice ? (
            <span className="text-gray-700 dark:text-slate-300">Paired with {primaryDevice.name}</span>
          ) : null}
        </div>

        {error ? <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p> : null}

        <p className="text-sm text-gray-500 dark:text-slate-400">
          On your phone, open <Link to="/controller" className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-300">/controller</Link> and enter this 6-digit code.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-gray-900 dark:text-slate-100">Connected devices</h4>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Devices join in real time and disappear automatically on disconnect.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {devices.length}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {devices.length ? devices.map((device) => (
            <div
              key={device.id}
              className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
            >
              <p className="font-semibold text-gray-900 dark:text-slate-100">{device.name}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Connected at {new Date(device.joinedAt).toLocaleTimeString()}</p>
            </div>
          )) : (
            <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500 dark:border-slate-600 dark:text-slate-400">
              No phones paired yet. Enter the code on a phone to connect.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-4 shadow-sm dark:border-emerald-900/40 dark:from-emerald-950/30 dark:via-slate-900 dark:to-teal-950/30">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Latest phone photo</h4>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Real-time image transfer appears here after a paired phone sends a photo.</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              latestImage
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {latestImage ? 'Image received' : 'Waiting'}
          </span>
        </div>

        {latestImage ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900/30 dark:bg-slate-900">
            <img src={latestImage.dataUrl} alt="Phone upload preview" className="max-h-80 w-full object-contain bg-slate-100 dark:bg-slate-950" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-emerald-100 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <span className="font-semibold">From {latestImage.deviceName}</span>
              <span>{new Date(latestImage.sentAt).toLocaleTimeString()}</span>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-emerald-300/80 bg-white/80 px-4 py-8 text-center text-sm text-slate-600 dark:border-emerald-900/50 dark:bg-slate-900/50 dark:text-slate-300">
            Open <span className="font-semibold">/controller</span> on a phone, connect with code, then tap Take Photo.
          </div>
        )}
      </div>
    </div>
  );
};

export default SettingsConnectionPanel;