// BeautyHub WebSocket server.
//  - Browsers connect to ws://localhost:WS_PORT, then send
//      {"type":"subscribe","token":"<ws_token from the `me` API>"}
//    to join their store's channel. Only sellers get a token, signed by PHP.
//  - The PHP backend POSTs {store_id, type, payload} to /broadcast (header
//    X-Broadcast-Secret) and the event goes ONLY to that store's subscribers.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

// Minimal .env loader so this script shares config with Next.js / docker compose.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const PORT = Number(process.env.WS_PORT || 3001);
const SECRET = process.env.WS_BROADCAST_SECRET || 'change-me';

/** Returns the store id if the token was signed by the PHP backend, else null. */
function verifyStoreToken(token) {
  if (typeof token !== 'string') return null;
  const [storeId, signature] = token.split('.');
  if (!/^\d+$/.test(storeId) || !signature) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(`store:${storeId}`).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? Number(storeId) : null;
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, clients: wss.clients.size }));
    return;
  }

  if (req.method === 'POST' && req.url === '/broadcast') {
    if (req.headers['x-broadcast-secret'] !== SECRET) {
      res.writeHead(401).end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const { store_id: storeId, type, payload } = JSON.parse(body);
        if (!type || !Number.isInteger(storeId)) throw new Error('missing store_id/type');
        sendToStore(storeId, { type, payload: payload ?? {}, at: new Date().toISOString() });
        res.writeHead(204).end();
      } catch {
        res.writeHead(400).end();
      }
    });
    return;
  }

  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server });

function sendToStore(storeId, message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.storeId === storeId && client.readyState === WebSocket.OPEN) client.send(data);
  }
}

function storePresence(storeId) {
  if (storeId == null) return;
  let online = 0;
  for (const client of wss.clients) if (client.storeId === storeId) online++;
  sendToStore(storeId, { type: 'presence', payload: { online }, at: new Date().toISOString() });
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.storeId = null;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('close', () => storePresence(socket.storeId));

  socket.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'subscribe') {
      const storeId = verifyStoreToken(msg.token);
      if (storeId == null) {
        socket.send(JSON.stringify({ type: 'error', payload: { message: 'invalid token' } }));
        return;
      }
      const previous = socket.storeId;
      socket.storeId = storeId;
      socket.send(JSON.stringify({ type: 'subscribed', payload: {}, at: new Date().toISOString() }));
      if (previous !== storeId) storePresence(previous);
      storePresence(storeId);
    } else if (msg.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong', at: new Date().toISOString() }));
    }
  });
});

// Drop dead connections every 30s.
const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[ws] WebSocket server listening on ws://localhost:${PORT}`);
});
