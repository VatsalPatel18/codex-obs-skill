import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const hash = value => createHash('sha256').update(value).digest('base64');
const timeoutMs = 8000;

export async function connect(port, password) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  const events = new EventEmitter();
  const pending = new Map();
  let sequence = 0;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('OBS connection timed out.')), timeoutMs);
      const fail = message => {
        clearTimeout(timer);
        reject(new Error(message));
        for (const request of pending.values()) request.reject(new Error(message));
      };
      socket.addEventListener('error', () => fail(`Could not connect to OBS on port ${port}.`));
      socket.addEventListener('close', ({ code }) => fail(code === 4009
        ? 'OBS rejected the WebSocket password.'
        : `OBS WebSocket closed (${code}).`));
      socket.addEventListener('message', ({ data }) => {
        const { op, d } = JSON.parse(data);
        if (op === 0) {
          const auth = d.authentication;
          if (auth && !password) {
            fail('OBS requires a password. Set OBS_WEBSOCKET_PASSWORD for this process.');
            return;
          }
          const authentication = auth ? hash(hash(password + auth.salt) + auth.challenge) : undefined;
          socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication, eventSubscriptions: 1 << 16 } }));
        } else if (op === 2) {
          clearTimeout(timer);
          resolve();
        } else if (op === 5) {
          events.emit(d.eventType, d.eventData);
        } else if (op === 7) {
          const request = pending.get(d.requestId);
          if (!request) return;
          if (d.requestStatus.result) request.resolve(d.responseData);
          else request.reject(Object.assign(
            new Error(`${d.requestType}: ${d.requestStatus.comment ?? d.requestStatus.code}`),
            { code: d.requestStatus.code },
          ));
        }
      });
    });
  } catch (error) {
    socket.close();
    throw error;
  }

  return {
    events,
    async call(requestType, requestData) {
      const requestId = String(++sequence);
      let timer;
      try {
        return await new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`${requestType} timed out.`)), timeoutMs);
          pending.set(requestId, { resolve, reject });
          socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
        });
      } finally {
        clearTimeout(timer);
        pending.delete(requestId);
      }
    },
    close: () => socket.close(),
  };
}

export function hasVisiblePixels(imageData) {
  const bmp = Buffer.from(imageData.split(',', 2)[1], 'base64');
  if (bmp.length < 54 || bmp.toString('ascii', 0, 2) !== 'BM') return null;
  const offset = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const height = Math.abs(bmp.readInt32LE(22));
  const bits = bmp.readUInt16LE(28);
  const stride = Math.ceil(width * bits / 32) * 4;
  if (width < 1 || height < 1 || ![24, 32].includes(bits) || bmp.readUInt32LE(30) !== 0
    || offset + stride * height > bmp.length) return null;
  let litPixels = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const pixel = offset + row * stride + col * bits / 8;
      if (Math.max(bmp[pixel], bmp[pixel + 1], bmp[pixel + 2]) > 24) litPixels++;
    }
  }
  return litPixels >= width * height * 0.005;
}
