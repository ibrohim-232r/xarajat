// Хранилище профилей. Если задан DATABASE_URL (Neon/Postgres) — профили лежат в Postgres,
// иначе — в JSON-файле (для локальной разработки). Все профили держим в памяти (синхронный API),
// а изменения сохраняем в БД в фоне (write-through, с небольшой задержкой).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'users.json');
const PERSIST = process.env.NO_PERSIST !== '1';

// pg не поддерживает channel_binding из строки Neon — убираем этот параметр
function dbUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return null;
  try {
    const u = new URL(raw);
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch {
    return raw;
  }
}

const DATABASE_URL = PERSIST ? dbUrl() : null;
const pool = DATABASE_URL
  ? new pg.Pool({ connectionString: DATABASE_URL, max: 5, ssl: { rejectUnauthorized: true } })
  : null;
if (pool) pool.on('error', (e) => console.error('Postgres pool error:', e.message));

let db = { users: {} };
const dirty = new Set();

// ---------- загрузка ----------
if (pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id         uuid PRIMARY KEY,
    token      text NOT NULL UNIQUE,
    data       jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await pool.query('SELECT data FROM users');
  for (const r of rows) db.users[r.data.id] = r.data;
  console.log(`Postgres: загружено профилей — ${rows.length}`);
} else {
  try {
    if (PERSIST && fs.existsSync(FILE)) db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    console.error('Не удалось прочитать users.json, начинаем с пустой базы', e.message);
  }
}

// ---------- сохранение ----------
let saveTimer = null;
async function flush() {
  if (!PERSIST) return;
  if (!pool) {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(db));
    } catch (e) {
      console.error('Ошибка сохранения', e.message);
    }
    return;
  }
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    const u = db.users[id];
    if (!u) continue;
    try {
      await pool.query(
        `INSERT INTO users (id, token, data, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [u.id, u.token, JSON.stringify(u)],
      );
    } catch (e) {
      console.error('Ошибка сохранения в Postgres', e.message);
      dirty.add(id); // повторим в следующий раз
    }
  }
}

function save(user) {
  if (!PERSIST) return;
  if (user) dirty.add(user.id);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}

/** Дописать всё несохранённое (вызывается при остановке сервера и в тестах). */
export async function flushNow() {
  clearTimeout(saveTimer);
  await flush();
}

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, async () => {
    await flushNow().catch(() => {});
    process.exit(0);
  });
}

// ---------- Каталог магазина ----------
export const SKINS = {
  classic: { name: 'Классический', emoji: '🕴️', color: '#3b4a6b' },
  boss: { name: 'Крутой мафиози', emoji: '🎩', color: '#7a1f2b' },
  detective: { name: 'Детектив', emoji: '🕵️', color: '#5b4a2e' },
  ghost: { name: 'Призрак', emoji: '👻', color: '#4a5568' },
  ninja: { name: 'Ниндзя', emoji: '🥷', color: '#2d2d3a' },
  king: { name: 'Король', emoji: '👑', color: '#8a6d1a' },
};

export const SHOP = [
  { id: 'classic', cat: 'skins', name: 'Классический', price: 0, emoji: '🕴️', desc: 'Бесплатно' },
  { id: 'boss', cat: 'skins', name: 'Крутой мафиози', price: 500, emoji: '🎩', desc: 'Шляпа и стиль' },
  { id: 'detective', cat: 'skins', name: 'Детектив', price: 800, emoji: '🕵️', desc: 'Всё видит' },
  { id: 'ghost', cat: 'skins', name: 'Призрак', price: 1200, emoji: '👻', desc: 'Появился из ниоткуда' },
  { id: 'ninja', cat: 'skins', name: 'Ниндзя', price: 1500, emoji: '🥷', desc: 'Тихо и незаметно' },
  { id: 'king', cat: 'skins', name: 'Король', price: 2500, emoji: '👑', desc: 'Для настоящих лидеров' },

  { id: 'e_evil', cat: 'emotes', name: 'Хитрая улыбка', price: 100, emoji: '😈', desc: 'Эмоция в чате' },
  { id: 'e_think', cat: 'emotes', name: 'Сомнение', price: 100, emoji: '🤔', desc: 'Эмоция в чате' },
  { id: 'e_knife', cat: 'emotes', name: 'Нож', price: 150, emoji: '🔪', desc: 'Эмоция в чате' },
  { id: 'e_pray', cat: 'emotes', name: 'Пощади', price: 100, emoji: '🙏', desc: 'Эмоция в чате' },
  { id: 'e_skull', cat: 'emotes', name: 'Череп', price: 150, emoji: '💀', desc: 'Эмоция в чате' },

  { id: 't_commissar', cat: 'roles', name: 'Билет комиссара', price: 200, emoji: '🕵️', desc: 'Следующая игра — комиссар (если роль есть в режиме)' },
  { id: 't_doctor', cat: 'roles', name: 'Билет доктора', price: 200, emoji: '💉', desc: 'Следующая игра — доктор (режим «Ночная мафия»)' },
  { id: 't_mafia', cat: 'roles', name: 'Билет мафии', price: 200, emoji: '🔫', desc: 'Следующая игра — мафия' },

  { id: 'b_coins', cat: 'bonuses', name: 'x2 монеты', price: 300, emoji: '🪙', desc: 'Двойные монеты на 3 игры' },
  { id: 'b_xp', cat: 'bonuses', name: 'x2 опыт', price: 300, emoji: '⭐', desc: 'Двойной опыт на 3 игры' },
];

export const FREE_EMOTES = ['👍', '😂', '❓'];
export const XP_PER_LEVEL = 300;

const ACHIEVEMENTS = [
  { id: 'first', name: 'Первая игра', emoji: '🏅', check: (u) => u.games >= 1 },
  { id: 'team', name: 'Командный игрок', emoji: '🤝', check: (u) => u.wins >= 3 },
  { id: 'master', name: 'Мастер аргументации', emoji: '🛡️', check: (u) => u.wins >= 10 },
  { id: 'mafioso', name: 'Крёстный отец', emoji: '🎩', check: (u) => (u.winsAsMafia || 0) >= 3 },
  { id: 'streak', name: 'Серия побед', emoji: '🔥', check: (u) => u.bestStreak >= 3 },
];

function randomName() {
  return 'Игрок' + Math.floor(1000 + Math.random() * 9000);
}

export function cleanName(name) {
  const s = String(name ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return s;
}

export function getOrCreateUser(token, name) {
  let user = token ? Object.values(db.users).find((u) => u.token === token) : null;
  if (!user) {
    user = {
      id: randomUUID(),
      token: token || randomUUID(),
      name: cleanName(name) || randomName(),
      coins: 1250,
      xp: 0,
      games: 0,
      wins: 0,
      losses: 0,
      winsAsMafia: 0,
      streak: 0,
      bestStreak: 0,
      skins: ['classic'],
      skin: 'classic',
      emotes: [],
      tickets: { commissar: 0, doctor: 0, mafia: 0 },
      bonuses: { coins: 0, xp: 0 },
      createdAt: Date.now(),
    };
    db.users[user.id] = user;
    save(user);
  }
  return user;
}

export function getUser(id) {
  return db.users[id] || null;
}

export function publicProfile(u) {
  const level = Math.floor(u.xp / XP_PER_LEVEL) + 1;
  return {
    id: u.id,
    name: u.name,
    coins: u.coins,
    xp: u.xp,
    level,
    xpInLevel: u.xp % XP_PER_LEVEL,
    xpForLevel: XP_PER_LEVEL,
    games: u.games,
    wins: u.wins,
    losses: u.losses,
    streak: u.streak,
    bestStreak: u.bestStreak,
    skins: u.skins,
    skin: u.skin,
    emotes: [...FREE_EMOTES, ...u.emotes.map((id) => SHOP.find((s) => s.id === id)?.emoji).filter(Boolean)],
    ownedEmoteIds: u.emotes,
    tickets: u.tickets,
    bonuses: u.bonuses,
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, emoji: a.emoji, unlocked: a.check(u) })),
  };
}

export function rename(user, name) {
  const n = cleanName(name);
  if (n.length < 2) return { ok: false, error: 'Имя слишком короткое' };
  user.name = n;
  save(user);
  return { ok: true };
}

export function buy(user, itemId) {
  const item = SHOP.find((s) => s.id === itemId);
  if (!item) return { ok: false, error: 'Товар не найден' };
  if (item.cat === 'skins' && user.skins.includes(item.id)) return { ok: false, error: 'Уже куплено' };
  if (item.cat === 'emotes' && user.emotes.includes(item.id)) return { ok: false, error: 'Уже куплено' };
  if (user.coins < item.price) return { ok: false, error: 'Недостаточно монет' };
  user.coins -= item.price;
  if (item.cat === 'skins') user.skins.push(item.id);
  else if (item.cat === 'emotes') user.emotes.push(item.id);
  else if (item.cat === 'roles') user.tickets[item.id.replace('t_', '')] += 1;
  else if (item.id === 'b_coins') user.bonuses.coins += 3;
  else if (item.id === 'b_xp') user.bonuses.xp += 3;
  save(user);
  return { ok: true };
}

export function selectSkin(user, skinId) {
  if (!user.skins.includes(skinId)) return { ok: false, error: 'Скин не куплен' };
  user.skin = skinId;
  save(user);
  return { ok: true };
}

/** Забрать билет роли (вызывается при раздаче ролей). Возвращает true, если билет был. */
export function consumeTicket(user, role) {
  if ((user.tickets[role] || 0) > 0) {
    user.tickets[role] -= 1;
    save(user);
    return true;
  }
  return false;
}

export function hasTicket(user, role) {
  return (user.tickets[role] || 0) > 0;
}

export function recordGame(user, { won, role }) {
  let coins = won ? 50 : 15;
  let xp = won ? 30 : 10;
  if (user.bonuses.coins > 0) {
    coins *= 2;
    user.bonuses.coins -= 1;
  }
  if (user.bonuses.xp > 0) {
    xp *= 2;
    user.bonuses.xp -= 1;
  }
  user.coins += coins;
  user.xp += xp;
  user.games += 1;
  if (won) {
    user.wins += 1;
    user.streak += 1;
    user.bestStreak = Math.max(user.bestStreak, user.streak);
    if (role === 'mafia') user.winsAsMafia = (user.winsAsMafia || 0) + 1;
  } else {
    user.losses += 1;
    user.streak = 0;
  }
  save(user);
  return { coins, xp };
}

export function shopCatalog() {
  return SHOP;
}
