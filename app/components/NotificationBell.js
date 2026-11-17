'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
const ICONS = {
  member_joined: 'fa-user-plus',
  order_placed: 'fa-bag-shopping',
  payment_submitted: 'fa-money-bill-wave',
  order_confirmed: 'fa-circle-check',
  order_rejected: 'fa-circle-xmark',
  payment_confirmed: 'fa-circle-check',
  payment_rejected: 'fa-triangle-exclamation',
  order_released: 'fa-truck-fast',
};

function ago(date) {
  const s = Math.max(0, (Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/**
 * The bell: unread count, list of notifications, live updates.
 * `wsToken` (sellers): the store's WebSocket token, so new orders and
 * customers show up the moment they happen.
 */
export default function NotificationBell({ wsToken, className = '', onUnread }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [permission, setPermission] = useState('unsupported');
  const [pos, setPos] = useState(null);
  const button = useRef(null);
  const panel = useRef(null);

  // Let the page know (e.g. the menu's Notifications badge).
  const onUnreadRef = useRef(onUnread);
  onUnreadRef.current = onUnread;
  useEffect(() => onUnreadRef.current?.(unread), [unread]);

  const refreshCount = useCallback(() => {
    api('notification_count').then((d) => d.success && setUnread(d.unread));
  }, []);
  const loadList = useCallback(async () => {
    const d = await api('list_notifications');
    if (d.success) {
      setItems(d.notifications);
      setUnread(d.unread);
    }
  }, []);

  // Count: now, every 45 s, and when you come back to the tab.
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 45000);
    const onFocus = () => refreshCount();
    window.addEventListener('focus', onFocus);
    // The Notifications page marked some as read.
    window.addEventListener('notifications:changed', onFocus);
    if (typeof Notification !== 'undefined') setPermission(Notification.permission);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('notifications:changed', onFocus);
    };
  }, [refreshCount]);

  // Live (sellers): the store's WebSocket channel.
  useEffect(() => {
    if (!wsToken) return undefined;
    let socket;
    let timer;
    let closed = false;
    let retry = 0;
    const connect = () => {
      socket = new WebSocket(WS_URL);
      socket.onopen = () => {
        retry = 0;
        socket.send(JSON.stringify({ type: 'subscribe', token: wsToken }));
      };
      socket.onmessage = (msg) => {
        let event;
        try { event = JSON.parse(msg.data); } catch { return; }
        if (event.type !== 'notification') return;
        const n = { id: `live-${Date.now()}`, ...event.payload, is_read: false, created_at: new Date().toISOString() };
        setUnread((u) => u + 1);
        setItems((list) => (list ? [n, ...list] : list));
        setToast(n);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
          const sys = new Notification(n.title, { body: n.body ?? '', tag: n.link ?? undefined });
          sys.onclick = () => { window.focus(); if (n.link) router.push(n.link); };
        }
      };
      socket.onclose = () => {
        if (closed) return;
        timer = setTimeout(connect, Math.min(15000, 1000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [wsToken, router]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Close when clicking elsewhere.
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (!panel.current?.contains(e.target) && !button.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) {
      loadList();
      // Open right under the bell, toward the middle of the screen.
      const r = button.current.getBoundingClientRect();
      setPos(r.left < window.innerWidth / 2 ? { top: r.bottom + 6, left: Math.max(8, r.left) } : { top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((o) => !o);
  };

  const go = async (n) => {
    setOpen(false);
    setToast(null);
    if (!n.is_read && typeof n.id === 'number') {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      const d = await api('mark_notifications_read', { ids: JSON.stringify([n.id]) });
      if (d.success) setUnread(d.unread);
    } else if (!n.is_read) {
      refreshCount();
    }
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    const d = await api('mark_notifications_read', { all: '1' });
    if (d.success) {
      setUnread(0);
      setItems((list) => list?.map((x) => ({ ...x, is_read: true })));
    }
  };

  const askPermission = async () => {
    const p = await Notification.requestPermission();
    setPermission(p);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`bell-btn ${className}${unread > 0 ? ' has-unread' : ''}`}
        onClick={toggle}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        title="Notifications"
      >
        <i className="fa-regular fa-bell" />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open &&
        createPortal(
          <div ref={panel} className="bell-panel" role="dialog" aria-label="Notifications" style={pos ?? undefined}>
            <header>
              <strong>Notifications</strong>
              {unread > 0 && <button type="button" className="link-btn" onClick={markAll}>Mark all read</button>}
            </header>
            <div className="bell-list">
              {items === null ? (
                <p className="bell-empty">Loading…</p>
              ) : items.length === 0 ? (
                <p className="bell-empty"><i className="fa-regular fa-bell-slash" /> Nothing yet.</p>
              ) : (
                items.map((n) => (
                  <button key={n.id} type="button" className={`bell-item${n.is_read ? '' : ' unread'}`} onClick={() => go(n)}>
                    <span className={`bell-ic ${n.type}`}><i className={`fa-solid ${ICONS[n.type] ?? 'fa-bell'}`} /></span>
                    <span className="bell-text">
                      <strong>{n.title}</strong>
                      {n.body && <small>{n.body}</small>}
                      <time>{ago(n.created_at)}</time>
                    </span>
                  </button>
                ))
              )}
            </div>
            {wsToken && permission === 'default' && (
              <footer>
                <button type="button" className="link-btn" onClick={askPermission}>
                  <i className="fa-solid fa-desktop" /> Also alert me on this computer
                </button>
              </footer>
            )}
          </div>,
          document.body
        )}

      {toast &&
        createPortal(
          <button type="button" className="bell-toast" onClick={() => go(toast)}>
            <span className={`bell-ic ${toast.type}`}><i className={`fa-solid ${ICONS[toast.type] ?? 'fa-bell'}`} /></span>
            <span className="bell-text">
              <strong>{toast.title}</strong>
              {toast.body && <small>{toast.body}</small>}
            </span>
          </button>,
          document.body
        )}
    </>
  );
}
