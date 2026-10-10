import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export const SKINS = {
  classic: { name: 'Классический', emoji: '🕴️', color: '#3b4a6b' },
  boss: { name: 'Крутой мафиози', emoji: '🎩', color: '#7a1f2b' },
  detective: { name: 'Детектив', emoji: '🕵️', color: '#5b4a2e' },
  ghost: { name: 'Призрак', emoji: '👻', color: '#4a5568' },
  ninja: { name: 'Ниндзя', emoji: '🥷', color: '#2d2d3a' },
  king: { name: 'Король', emoji: '👑', color: '#8a6d1a' },
};

export const ROLES = {
  mafia: { name: 'Мафия', emoji: '🔫', color: '#ff2d4d' },
  commissar: { name: 'Комиссар', emoji: '🕵️', color: '#4da3ff' },
  doctor: { name: 'Доктор', emoji: '💉', color: '#3ddc97' },
  civilian: { name: 'Мирный житель', emoji: '🙂', color: '#b8c2d9' },
};

export const MODE_LIST = [
  { id: 'classic', label: 'Классическая мафия', sub: 'Опытные игроки', min: 6, max: 12 },
  { id: 'quick', label: 'Быстрая игра', sub: 'На 10 минут', min: 5, max: 8 },
  { id: 'night', label: 'Ночная мафия', sub: 'Сложный режим', min: 6, max: 12 },
  { id: 'friends', label: 'С друзьями', sub: 'Своя компания', min: 4, max: 12 },
];

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;
const socket = io(SERVER_URL, { transports: ['websocket', 'polling'], autoConnect: true });

const load = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

let audioCtx = null;
export function beep(freq = 520, dur = 0.12, enabled = true) {
  if (!enabled) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = freq;
    o.type = 'sine';
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch {
    /* ignore */
  }
}

export function AppProvider({ children }) {
  const [connected, setConnected] = useState(socket.connected);
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [online, setOnline] = useState(0);
  const [room, setRoom] = useState(null);
  const [toast, setToast] = useState(null);
  const [sound, setSoundState] = useState(() => load('mafia.sound', true));
  const [installEvent, setInstallEvent] = useState(null);
  const toastTimer = useRef();

  const showToast = useCallback((text, kind = 'info') => {
    setToast({ text, kind, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const setSound = (v) => {
    setSoundState(v);
    save('mafia.sound', v);
  };

  // Промис-обёртка над ack-колбэками
  const call = useCallback(
    (event, ...args) =>
      new Promise((resolve) => {
        if (!socket.connected) return resolve({ ok: false, error: 'Нет соединения' });
        const t = setTimeout(() => resolve({ ok: false, error: 'Сервер не отвечает' }), 8000);
        socket.emit(event, ...args, (res) => {
          clearTimeout(t);
          resolve(res || { ok: true });
        });
      }),
    [],
  );

  useEffect(() => {
    const hello = () => {
      setConnected(true);
      socket.emit('hello', { token: load('mafia.token', null), name: load('mafia.name', null) }, (res) => {
        if (!res?.ok) return;
        save('mafia.token', res.token);
        setProfile(res.profile);
        setRooms(res.rooms);
        setOnline(res.online);
        setRoom(res.room);
        setReady(true);
      });
    };
    const onDisc = () => setConnected(false);
    socket.on('connect', hello);
    socket.on('disconnect', onDisc);
    socket.on('rooms', setRooms);
    socket.on('online', setOnline);
    socket.on('profile', setProfile);
    socket.on('room:state', setRoom);
    socket.on('room:kicked', () => {
      setRoom(null);
      showToast('Вас исключили из комнаты', 'error');
    });
    if (socket.connected) hello();

    const onInstall = (e) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => {
      socket.off('connect', hello);
      socket.off('disconnect', onDisc);
      socket.off('rooms', setRooms);
      socket.off('online', setOnline);
      socket.off('profile', setProfile);
      socket.off('room:state', setRoom);
      socket.off('room:kicked');
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, [showToast]);

  const wrap = useCallback(
    async (p, okMsg) => {
      const res = await p;
      if (!res.ok && res.error) showToast(res.error, 'error');
      else if (res.ok && okMsg) showToast(okMsg, 'ok');
      return res;
    },
    [showToast],
  );

  const api = useMemo(
    () => ({
      createRoom: async (data) => {
        const r = await wrap(call('room:create', data));
        if (r.ok) setRoom(r.room);
        return r;
      },
      joinRoom: async (id, password) => {
        const r = await call('room:join', { id, password });
        if (!r.ok && r.error && !r.needPassword) showToast(r.error, 'error');
        if (r.ok) setRoom(r.room);
        return r;
      },
      quick: async () => {
        const r = await wrap(call('room:quick'));
        if (r.ok) setRoom(r.room);
        return r;
      },
      leave: async () => {
        await call('room:leave');
        setRoom(null);
      },
      addBot: () => wrap(call('room:addBot')),
      fillBots: () => wrap(call('room:fillBots')),
      kick: (id) => wrap(call('room:kick', id)),
      start: () => wrap(call('room:start')),
      again: () => wrap(call('room:again')),
      act: (type, target) => wrap(call('game:act', { type, target })),
      send: (text) => call('chat:send', text),
      rename: async (name) => {
        const r = await wrap(call('profile:rename', name), 'Имя изменено');
        if (r.ok) save('mafia.name', name);
        return r;
      },
      buy: (id) => wrap(call('shop:buy', id), 'Покупка совершена'),
      selectSkin: (id) => wrap(call('shop:selectSkin', id)),
    }),
    [call, wrap, showToast],
  );

  const value = {
    connected,
    ready,
    profile,
    rooms,
    online,
    room,
    toast,
    sound,
    setSound,
    showToast,
    installEvent,
    clearInstall: () => setInstallEvent(null),
    ...api,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
