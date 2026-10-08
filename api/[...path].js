// Единая серверная функция Vercel (весь API) + постоянная база Upstash Redis.
// Каждая запись (операция, долг) хранится отдельно -> добавление/удаление/правка синхронизируются между устройствами без перезаписи чужих изменений.
import crypto from 'node:crypto'

const SESSION_S = 30 * 86400

// ---------- Redis (Upstash REST) ----------
async function call(path, body) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !tok) throw new Error('NODB')
  const r = await fetch(url + path, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.json()
}
const R = async (...cmd) => { const j = await call('', cmd); if (j.error) throw new Error(j.error); return j.result }
const P = async cmds => { const j = await call('/pipeline', cmds); return j.map(x => { if (x.error) throw new Error(x.error); return x.result }) }
const J = s => { try { return JSON.parse(s) } catch { return null } }
const H = a => { const o = []; for (let i = 0; i < (a || []).length; i += 2) { const v = J(a[i + 1]); if (v) o.push(v) } return o }
const hset = async (key, items) => { for (let i = 0; i < items.length; i += 300) { const args = []; for (const x of items.slice(i, i + 300)) args.push(String(x.id), JSON.stringify(x)); if (args.length) await R('HSET', key, ...args) } }

// ---------- пароли ----------
const hashPw = pw => { const s = crypto.randomBytes(16).toString('hex'); return s + ':' + crypto.scryptSync(pw, s, 64).toString('hex') }
const checkPw = (pw, stored) => {
  const [s, h] = stored.split(':'), a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, s, 64)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
const validPass = p => typeof p === 'string' && p.length >= 6 && p.length <= 100

// ---------- валидация ----------
const num = v => typeof v === 'number' && Number.isFinite(v)
const DATE = /^\d{4}-\d{2}-\d{2}$/
// операция/долг в иностранной валюте: amount — всегда в сумах, плюс cur (код), orig (сумма в валюте), rate (сум за 1 ед. на момент записи)
const CUR = /^[A-Z]{3}$/
const curPart = t => (typeof t.cur === 'string' && CUR.test(t.cur) && t.cur !== 'UZS' && num(t.orig) && t.orig > 0 && t.orig <= 1e13 && num(t.rate) && t.rate > 0 ? { cur: t.cur, orig: t.orig, rate: t.rate } : {})
const cleanTx = t => {
  if (!t || !num(t.id) || !['in', 'out'].includes(t.type) || !num(t.amount) || t.amount <= 0 || t.amount > 1e13 || typeof t.cat !== 'string' || t.cat.length > 40 || !DATE.test(t.date)) return null
  return { id: t.id, type: t.type, amount: t.amount, cat: t.cat, date: t.date, note: String(t.note || '').slice(0, 80), ...curPart(t) }
}
const cleanDebt = d => {
  if (!d || !num(d.id) || !['in', 'out'].includes(d.dir) || !num(d.amount) || d.amount <= 0 || d.amount > 1e13 || typeof d.who !== 'string' || !d.who.trim()) return null
  return { id: d.id, dir: d.dir, who: d.who.trim().slice(0, 40), amount: d.amount, due: DATE.test(d.due || '') ? d.due : '', note: String(d.note || '').slice(0, 80), paid: !!d.paid, date: DATE.test(d.date || '') ? d.date : '', phone: String(d.phone || '').slice(0, 20), payments: (Array.isArray(d.payments) ? d.payments : []).filter(p => p && num(p.a) && p.a > 0 && p.a <= 1e13 && DATE.test(p.d || '')).slice(0, 60).map(p => ({ d: p.d, a: p.a })), ...curPart(d) }
}
// регулярный платёж (в сумах): каждый месяц в указанный день сам создаёт операцию
const cleanRec = r => {
  if (!r || !num(r.id) || !['in', 'out'].includes(r.type) || !num(r.amount) || r.amount <= 0 || r.amount > 1e13 || typeof r.cat !== 'string' || r.cat.length > 40 || !Number.isInteger(r.day) || r.day < 1 || r.day > 28) return null
  return { id: r.id, type: r.type, amount: r.amount, cat: r.cat, note: String(r.note || '').slice(0, 80), day: r.day, last: /^\d{4}-\d{2}$/.test(r.last || '') ? r.last : '' }
}
const CL = { tx: cleanTx, debt: cleanDebt, rec: cleanRec }
const cleanGoal = g => ({ target: num(g.target) && g.target > 0 ? g.target : 0, saved: num(g.saved) && g.saved > 0 ? g.saved : 0 })
const cleanCats = c => {
  const o = { in: {}, out: {} }
  for (const t of ['in', 'out']) {
    let n = 0
    for (const [k, v] of Object.entries((c && c[t] && typeof c[t] === 'object') ? c[t] : {})) {
      const name = String(k).trim().slice(0, 40)
      if (!name || name === '__proto__' || n >= 30) continue
      o[t][name] = typeof v === 'string' ? v.slice(0, 4) : ''; n++
    }
  }
  return o
}
const cleanLimits = l => {
  const o = {}; let n = 0
  for (const [k, v] of Object.entries(l && typeof l === 'object' ? l : {})) {
    const name = String(k).trim().slice(0, 40)
    if (name && name !== '__proto__' && num(v) && v > 0 && v <= 1e13 && n < 60) { o[name] = v; n++ }
  }
  return o
}
const cleanSet = st => ({
  budget: num(st.budget) && st.budget > 0 ? st.budget : 0,
  color: /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#4f46e5',
  theme: st.theme === 'dark' ? 'dark' : 'light',
  emoji: typeof st.emoji === 'string' ? st.emoji.slice(0, 4) : '',
  lang: st.lang === 'ru' || st.lang === 'uz' ? st.lang : '',
  favCur: Array.isArray(st.favCur) ? [...new Set(st.favCur.filter(c => typeof c === 'string' && CUR.test(c)))].slice(0, 12) : ['USD', 'EUR', 'RUB', 'KZT'],
  cats: cleanCats(st.cats),
  catLimits: cleanLimits(st.catLimits),
})

// ---------- данные пользователя ----------
async function migrate(login, leg) {
  const d = J(leg)
  if (d && Array.isArray(d.tx)) {
    await hset('tx:' + login, d.tx.map(cleanTx).filter(Boolean))
    await R('SET', 'prof:' + login, JSON.stringify({ goal: cleanGoal(d.goal || {}), settings: cleanSet(d.settings || {}) }))
  }
  await R('DEL', 'data:' + login)
}
async function getData(login, touch) {
  const cmds = [['HGETALL', 'tx:' + login], ['HGETALL', 'debt:' + login], ['HGETALL', 'rec:' + login], ['GET', 'prof:' + login], ['GET', 'data:' + login], ['GET', 'announce']]
  if (touch) cmds.push(['SET', 'seen:' + login, String(Date.now())])
  let r = await P(cmds)
  if (r[4]) { await migrate(login, r[4]); r = await P(cmds) }
  const p = J(r[3]) || {}
  return { tx: H(r[0]), debts: H(r[1]), rec: H(r[2]), goal: cleanGoal(p.goal || {}), settings: cleanSet(p.settings || {}), announce: J(r[5]) }
}


// ---------- курсы валют ----------
// Основной источник — официальные курсы ЦБ Узбекистана (cbu.uz), запасной — рыночные курсы open.er-api.com.
// Результат кэшируется в Redis; обновляется при обращении не чаще раза в 3 часа и по ежедневному cron (vercel.json).
const RATES_TTL = 3 * 3600 * 1000
async function getJson(url, ms = 7000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal, headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error('http ' + r.status)
    return await r.json()
  } finally { clearTimeout(t) }
}
const cbuDate = s => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s || '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
function parseCbu(arr) {
  if (!Array.isArray(arr)) return null
  const r = {}, dt = {}
  let date = ''
  for (const x of arr) {
    const code = String((x && x.Ccy) || '').toUpperCase(), nom = Number(x && x.Nominal) || 1, v = Number(x && x.Rate) / nom
    if (!CUR.test(code) || !(v > 0) || !isFinite(v)) continue
    const d = cbuDate(x.Date)
    if (r[code] && dt[code] > d) continue
    dt[code] = d; if (d > date) date = d
    r[code] = { v: +v.toFixed(6), d: +((Number(x.Diff) || 0) / nom).toFixed(6) }
  }
  return r.USD && r.EUR ? { src: 'cbu', date, at: Date.now(), r } : null
}
function parseEr(j) {
  const rt = j && j.rates
  if (!rt || j.result !== 'success' || !(rt.UZS > 0)) return null
  const r = {}
  for (const [code, per] of Object.entries(rt)) {
    if (code === 'UZS' || !CUR.test(code) || !(per > 0)) continue
    const v = rt.UZS / per
    if (isFinite(v) && v > 0) r[code] = { v: +v.toFixed(6), d: 0 }
  }
  const date = j.time_last_update_unix ? new Date(j.time_last_update_unix * 1000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)
  return r.USD && r.EUR ? { src: 'er', date, at: Date.now(), r } : null
}
async function fetchRates() {
  try { const x = parseCbu(await getJson('https://cbu.uz/ru/arkhiv-kursov-valyut/json/')); if (x) return x } catch (e) { console.error('cbu', e.message) }
  try { const x = parseEr(await getJson('https://open.er-api.com/v6/latest/USD')); if (x) return x } catch (e) { console.error('er', e.message) }
  return null
}
async function loadRates(force) {
  const cached = J(await R('GET', 'rates'))
  if (cached && Date.now() - cached.at < (force ? 30 * 60 * 1000 : RATES_TTL)) return cached
  const got = await fetchRates()
  if (!got) return cached || null // источники недоступны — отдаём последние известные курсы
  if (got.src === 'er' && cached && cached.date && cached.date < got.date) { // у запасного источника нет «изменения за день» — считаем сами
    for (const [c, x] of Object.entries(got.r)) if (cached.r[c]) x.d = +(x.v - cached.r[c].v).toFixed(6)
  }
  await R('SET', 'rates', JSON.stringify(got))
  return got
}

// ---------- помощники ----------
const pub = (login, u) => ({ login, name: u.name, role: u.role })
const fmt = n => Math.round(n).toLocaleString('ru-RU')
const dev = ua => {
  ua = String(ua || '')
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Brauzer'
  const o = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''
  return o ? `${b} / ${o}` : b
}
const logE = (u, e, d = '') => {
  const s = JSON.stringify({ t: Date.now(), u, e, d: String(d).slice(0, 120) })
  return P([['LPUSH', 'log:all', s], ['LTRIM', 'log:all', 0, 299], ['LPUSH', 'log:' + u, s], ['LTRIM', 'log:' + u, 0, 99]]).catch(() => {})
}
let adminReady = false
async function ensureAdmin() {
  if (adminReady) return
  if (!(await R('EXISTS', 'user:admin'))) {
    const u = { name: 'Admin', pass: hashPw(process.env.ADMIN_PASSWORD || 'admin123'), role: 'admin', created: Date.now() }
    if ((await R('SET', 'user:admin', JSON.stringify(u), 'NX')) === 'OK') await R('SADD', 'users', 'admin')
  }
  adminReady = true
}
async function dropSessions(login, keep) {
  const toks = (await R('SMEMBERS', 'usess:' + login)) || []
  const del = toks.filter(t => t !== keep)
  if (del.length) { await R('DEL', ...del.map(t => 'sess:' + t)); await R('SREM', 'usess:' + login, ...del) }
}
const txText = t => `${t.type === 'in' ? '+' : '−'}${fmt(t.amount)} · ${t.cat}${t.cur ? ` (${t.orig} ${t.cur})` : ''}`
const debtText = d => `${d.dir === 'in' ? '📥' : '📤'} ${d.who} · ${fmt(d.amount)}${d.cur ? ` (${d.orig} ${d.cur})` : ''}${d.paid ? ' ✓' : ''}`
const recText = r => `🔁 ${r.type === 'in' ? '+' : '−'}${fmt(r.amount)} · ${r.cat} (${r.day})`
const TXT = { tx: txText, debt: debtText, rec: recText }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const send = (code, obj) => res.status(code).json(obj)
  const url = new URL(req.url, 'http://x'), q = url.searchParams
  const path = url.pathname.replace(/^\/api/, '').replace(/\/$/, '') || '/'
  const m = req.method
  let b = req.body
  if (typeof b === 'string') b = J(b)
  b = b && typeof b === 'object' ? b : {}

  try {
    if (path === '/ping' && m === 'GET') return send(200, { ok: true, db: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) })
    if (path === '/rates' && m === 'GET') {
      const x = await loadRates(q.get('refresh') === '1')
      return x ? send(200, x) : send(503, { error: 'Kurslar mavjud emas' })
    }
    await ensureAdmin()
    const ip = String(req.headers['x-forwarded-for'] || 'x').split(',')[0].trim()

    // ----- вход -----
    if (path === '/login' && m === 'POST') {
      if (Number(await R('GET', 'rl:' + ip)) >= 10) return send(429, { error: "Juda ko'p urinish. 15 daqiqadan keyin urinib ko'ring" })
      const login = String(b.login || '').trim().toLowerCase()
      const u = login ? J(await R('GET', 'user:' + login)) : null
      if (!u || !checkPw(String(b.password || ''), u.pass)) {
        if ((await R('INCR', 'rl:' + ip)) === 1) await R('EXPIRE', 'rl:' + ip, 900)
        return send(401, { error: "Login yoki parol noto'g'ri" })
      }
      if (u.disabled) return send(403, { error: 'Hisob bloklangan. Administrator bilan bog\'laning' })
      await R('DEL', 'rl:' + ip)
      const token = crypto.randomBytes(32).toString('hex')
      u.lastLogin = Date.now(); u.logins = (u.logins || 0) + 1
      await P([['SET', 'sess:' + token, login, 'EX', SESSION_S], ['SADD', 'usess:' + login, token], ['SET', 'user:' + login, JSON.stringify(u)], ['SET', 'seen:' + login, String(Date.now())]])
      await logE(login, 'login', `${dev(req.headers['user-agent'])} · ${ip}`)
      return send(200, { token, user: pub(login, u) })
    }

    // ----- авторизация -----
    const tok = String(req.headers.authorization || '').replace('Bearer ', '')
    const login = tok ? await R('GET', 'sess:' + tok) : null
    const user = login ? J(await R('GET', 'user:' + login)) : null
    if (!user) return send(401, { error: 'Sessiya tugagan' })
    if (user.disabled) return send(403, { error: 'Hisob bloklangan. Administrator bilan bog\'laning' })
    const saveUser = () => R('SET', 'user:' + login, JSON.stringify(user))

    if (path === '/logout' && m === 'POST') { await P([['DEL', 'sess:' + tok], ['SREM', 'usess:' + login, tok]]); await logE(login, 'logout', dev(req.headers['user-agent'])); return send(200, { ok: true }) }
    if (path === '/me' && m === 'GET') return send(200, pub(login, user))
    if (path === '/me' && m === 'PUT') {
      const name = String(b.name || '').trim().slice(0, 40)
      if (!name) return send(400, { error: "Ism bo'sh" })
      user.name = name; await saveUser(); return send(200, pub(login, user))
    }
    if ((path === '/me-password' || path === '/me/password') && m === 'POST') {
      if (!checkPw(String(b.oldPassword || ''), user.pass)) return send(400, { error: "Joriy parol noto'g'ri" })
      if (!validPass(b.newPassword)) return send(400, { error: 'Parol kamida 6 ta belgi' })
      user.pass = hashPw(b.newPassword); await saveUser(); await dropSessions(login, tok); await logE(login, 'pass'); return send(200, { ok: true })
    }

    // ----- данные -----
    if (path === '/data' && m === 'GET') return send(200, await getData(login, true))
    if (path === '/data' && m === 'PUT') { // полная замена (восстановление из резервной копии)
      const tx = (Array.isArray(b.tx) ? b.tx : []).map(cleanTx), debts = (Array.isArray(b.debts) ? b.debts : []).map(cleanDebt), rec = (Array.isArray(b.rec) ? b.rec : []).map(cleanRec)
      if (tx.length > 20000 || debts.length > 5000 || rec.length > 200 || tx.includes(null) || debts.includes(null) || rec.includes(null)) return send(400, { error: "Ma'lumotlar formati noto'g'ri" })
      await R('DEL', 'tx:' + login, 'debt:' + login, 'rec:' + login)
      await hset('tx:' + login, tx); await hset('debt:' + login, debts); await hset('rec:' + login, rec)
      await R('SET', 'prof:' + login, JSON.stringify({ goal: cleanGoal(b.goal || {}), settings: cleanSet(b.settings || {}) }))
      await logE(login, 'import', `${tx.length} ta amal`)
      return send(200, { ok: true })
    }
    if (path === '/item' && m === 'POST') {
      const f = CL[b.col], it = f && f(b.item)
      if (!it) return send(400, { error: "Ma'lumot noto'g'ri" })
      const key = b.col + ':' + login, ex = await R('HEXISTS', key, String(it.id))
      await P([['HSET', key, String(it.id), JSON.stringify(it)], ['SET', 'seen:' + login, String(Date.now())]])
      await logE(login, b.col + (ex ? '~' : '+'), TXT[b.col](it))
      return send(200, { ok: true })
    }
    if (path === '/item' && m === 'DELETE') {
      const col = q.get('col'), id = q.get('id')
      if (!CL[col] || !id) return send(400, { error: "So'rov noto'g'ri" })
      const key = col + ':' + login, old = J(await R('HGET', key, id))
      await R('HDEL', key, id)
      if (old) await logE(login, col + '-', TXT[col](old))
      return send(200, { ok: true })
    }
    if (path === '/prof' && m === 'PUT') {
      const cur = J(await R('GET', 'prof:' + login)) || {}
      await R('SET', 'prof:' + login, JSON.stringify({ goal: cleanGoal(b.goal || cur.goal || {}), settings: cleanSet(b.settings || cur.settings || {}) }))
      return send(200, { ok: true })
    }

    // ----- админ -----
    if (path.startsWith('/admin')) {
      if (user.role !== 'admin') return send(403, { error: "Ruxsat yo'q" })
      if (path === '/admin-users' && m === 'GET') {
        const logins = ((await R('SMEMBERS', 'users')) || []).sort()
        const out = []
        if (logins.length) {
          const rows = await P(logins.flatMap(l => [['GET', 'user:' + l], ['HVALS', 'tx:' + l], ['GET', 'seen:' + l], ['GET', 'data:' + l]]))
          for (let i = 0; i < logins.length; i++) {
            const l = logins[i], u = J(rows[i * 4]); if (!u) continue
            let txs = rows[i * 4 + 1] || []
            if (rows[i * 4 + 3]) { await migrate(l, rows[i * 4 + 3]); txs = (await R('HVALS', 'tx:' + l)) || [] }
            const tx = txs.map(J).filter(Boolean)
            out.push({ ...pub(l, u), created: u.created, lastLogin: u.lastLogin || 0, logins: u.logins || 0, lastSeen: Number(rows[i * 4 + 2]) || 0, disabled: !!u.disabled, txCount: tx.length, balance: tx.reduce((a, t) => a + (t.type === 'in' ? t.amount : -t.amount), 0) })
          }
        }
        return send(200, out)
      }
      if (path === '/admin-users' && m === 'POST') {
        const l = String(b.login || '').trim().toLowerCase(), name = String(b.name || '').trim().slice(0, 40)
        if (!name || !/^[a-z0-9_.]{3,30}$/.test(l)) return send(400, { error: 'Login: lotin harf/raqam, kamida 3 belgi' })
        if (!validPass(b.password)) return send(400, { error: 'Parol kamida 6 ta belgi' })
        const u = { name, pass: hashPw(b.password), role: 'user', created: Date.now() }
        if ((await R('SET', 'user:' + l, JSON.stringify(u), 'NX')) !== 'OK') return send(409, { error: 'Bunday login mavjud' })
        await R('SADD', 'users', l); await logE(l, 'create', 'admin yaratdi'); return send(200, pub(l, u))
      }
      const target = String(b.login || q.get('login') || '').toLowerCase()
      if (path === '/admin-data' && m === 'GET') {
        const u = J(await R('GET', 'user:' + target))
        if (!u) return send(404, { error: 'Topilmadi' })
        const [data, lg] = await Promise.all([getData(target), R('LRANGE', 'log:' + target, 0, 29)])
        return send(200, { user: { ...pub(target, u), lastLogin: u.lastLogin || 0, logins: u.logins || 0, lastSeen: Number(await R('GET', 'seen:' + target)) || 0 }, ...data, log: (lg || []).map(J).filter(Boolean) })
      }
      if (path === '/admin-log' && m === 'GET') {
        const lim = Math.min(300, Math.max(1, Number(q.get('limit')) || 100))
        return send(200, ((await R('LRANGE', q.get('login') ? 'log:' + target : 'log:all', 0, lim - 1)) || []).map(J).filter(Boolean))
      }
      if (path === '/admin-announce' && m === 'GET') return send(200, J(await R('GET', 'announce')))
      if (path === '/admin-announce' && m === 'POST') {
        const text = String(b.text || '').trim().slice(0, 300)
        if (!text) { await R('DEL', 'announce'); return send(200, { ok: true }) }
        await R('SET', 'announce', JSON.stringify({ id: Date.now(), text, t: Date.now() })); return send(200, { ok: true })
      }
      if (path === '/admin-password' && m === 'PATCH') {
        const u = J(await R('GET', 'user:' + target))
        if (!u) return send(404, { error: 'Topilmadi' })
        if (!validPass(b.password)) return send(400, { error: 'Parol kamida 6 ta belgi' })
        u.pass = hashPw(b.password); await R('SET', 'user:' + target, JSON.stringify(u)); await dropSessions(target, tok); return send(200, { ok: true })
      }
      if (path === '/admin-block' && m === 'POST') {
        const u = J(await R('GET', 'user:' + target))
        if (!u) return send(404, { error: 'Topilmadi' })
        if (u.role === 'admin') return send(400, { error: "Adminni bloklab bo'lmaydi" })
        u.disabled = !!b.disabled; await R('SET', 'user:' + target, JSON.stringify(u)); if (u.disabled) await dropSessions(target)
        return send(200, { ok: true })
      }
      if (path === '/admin-user' && m === 'DELETE') {
        const u = J(await R('GET', 'user:' + target))
        if (!u) return send(404, { error: 'Topilmadi' })
        if (u.role === 'admin') return send(400, { error: "Adminni o'chirib bo'lmaydi" })
        await dropSessions(target)
        await R('DEL', 'user:' + target, 'tx:' + target, 'debt:' + target, 'rec:' + target, 'prof:' + target, 'data:' + target, 'usess:' + target, 'seen:' + target, 'log:' + target)
        await R('SREM', 'users', target)
        return send(200, { ok: true })
      }
    }
    return send(404, { error: 'Not found' })
  } catch (e) {
    if (e.message === 'NODB') return send(500, { error: "Baza ulanmagan: Vercel → Storage → Upstash Redis qo'shing va qayta deploy qiling" })
    console.error(e)
    return send(500, { error: 'Server xatosi' })
  }
}
