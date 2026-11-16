'use client';

import { useEffect, useRef, useState } from 'react';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

const describe = (event) => {
  const name = event.payload?.name ?? 'Someone';
  switch (event.type) {
    case 'order_placed':
      return `${name} placed order ${event.payload?.invoice_no ?? ''} (₱${Number(event.payload?.total ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}). Waiting for your approval`;
    case 'member_joined':
      return `${name} joined your store`;
    case 'member_logged_in':
      return `${name} logged in`;
    default:
      return event.type;
  }
};

/**
 * Live feed for one store. `token` is the store's signed ws_token from the `me`
 * API; the WebSocket server only sends this store's events to it.
 */
export default function LiveActivity({ token, onEvent }) {
  const [status, setStatus] = useState('connecting');
  const [online, setOnline] = useState(0);
  const [events, setEvents] = useState([]);
  const retryRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return undefined;
    let socket;
    let timer;
    let closed = false;

    const connect = () => {
      setStatus('connecting');
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        retryRef.current = 0;
        socket.send(JSON.stringify({ type: 'subscribe', token }));
      };

      socket.onmessage = (msg) => {
        let event;
        try { event = JSON.parse(msg.data); } catch { return; }

        if (event.type === 'subscribed') setStatus('live');
        else if (event.type === 'error') setStatus('offline');
        else if (event.type === 'presence') setOnline(event.payload?.online ?? 0);
        else if (event.type !== 'pong') {
          setEvents((prev) => [event, ...prev].slice(0, 8));
          onEventRef.current?.(event);
        }
      };

      socket.onclose = () => {
        if (closed) return;
        setStatus('offline');
        // Reconnect with backoff (1s, 2s, 4s ... max 15s).
        const delay = Math.min(15000, 1000 * 2 ** retryRef.current++);
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [token]);

  return (
    <article className="card live-card">
      <div className="live-head">
        <h3>Live Activity</h3>
        <span className={`live-pill ${status}`}>
          {status === 'live' ? `● Live · ${online} viewing` : status === 'connecting' ? 'Connecting…' : 'Offline'}
        </span>
      </div>
      {events.length === 0 ? (
        <p className="live-empty">Waiting for customer activity…</p>
      ) : (
        <ul>
          {events.map((event, i) => (
            <li key={`${event.at}-${i}`}>
              {describe(event)} <small>{new Date(event.at).toLocaleTimeString()}</small>
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .live-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .live-pill { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; background: #f3eef1; color: #8e808b; white-space: nowrap; }
        .live-pill.live { background: #e6f6ec; color: #2f9e59; }
        .live-pill.offline { background: #fdeaea; color: #c0392b; }
        .live-empty { color: #8e808b; margin: 8px 0 0; }
        small { color: #9b8e98; margin-left: 6px; }
      `}</style>
    </article>
  );
}
