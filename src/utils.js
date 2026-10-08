import { t, MONTHS, MONTHS_S, WEEKDAYS } from './i18n.js'

export const CAT = {
  out: { Ovqat: '🍔', Transport: '🚕', Kommunal: '💡', Xaridlar: '🛍️', "Sog'liq": '💊', "Ko'ngilochar": '🎬', Boshqa: '📦' },
  in: { "Ish haqi": '💼', Ish: '🧾', "Sovg'a": '🎁', Boshqa: '💰' },
}
export const monName = i => MONTHS()[i]
export const wdName = i => WEEKDAYS()[i]
let HIDE = false
export const setPrivacy = v => { HIDE = !!v }
export const fmt = n => (HIDE ? '••••' : Math.round(n).toLocaleString('ru-RU').replace(/\s/g, ' '))
// Даты считаем по местному времени (toISOString даёт UTC и сдвигает день после полуночи)
export const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const today = () => ymd(new Date())
export const dstr = d => {
  const yd = new Date(); yd.setDate(yd.getDate() - 1)
  if (d === today()) return t('today')
  if (d === ymd(yd)) return t('yesterday')
  const [, mm, dd] = d.split('-').map(Number)
  return dd + ' ' + MONTHS_S()[mm - 1] + '.'
}
export const sortTx = tx => [...tx].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
export function stats(tx) {
  const n = new Date(), m = n.getMonth(), y = n.getFullYear()
  let inc = 0, exp = 0, bal = 0
  tx.forEach(t => {
    const s = t.type === 'in' ? 1 : -1
    bal += s * t.amount
    if (t.date.startsWith(monthKey(y, m))) s > 0 ? (inc += t.amount) : (exp += t.amount)
  })
  return { inc, exp, bal, m, y }
}
export function week(tx) {
  const n = new Date(), dow = (n.getDay() + 6) % 7
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(n); d.setDate(n.getDate() - dow + i)
    const k = ymd(d)
    return { k, now: i === dow, sum: tx.filter(t => t.type === 'out' && t.date === k).reduce((a, t) => a + t.amount, 0) }
  })
}

export const DEF_SET = { budget: 0, color: '#4f46e5', theme: 'light', emoji: '', lang: '', favCur: ['USD', 'EUR', 'RUB', 'KZT'], cats: { in: {}, out: {} }, catLimits: {} }
// встроенные + свои категории: { название: эмодзи }
export const catsFor = (st, type) => ({ ...CAT[type], ...(((st && st.cats) || {})[type] || {}) })
export const catSpent = (tx, cat, y, m) => tx.filter(t => t.type === 'out' && t.cat === cat && t.date.startsWith(monthKey(y, m))).reduce((a, t) => a + t.amount, 0)
export const norm = d => ({ tx: [], debts: [], rec: [], goal: { target: 0, saved: 0 }, ...d, settings: { ...DEF_SET, ...(d.settings || {}), cats: { in: {}, out: {}, ...((d.settings || {}).cats || {}) }, catLimits: { ...((d.settings || {}).catLimits || {}) } } })
export const PAL = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#64748b']
export const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`
export function report(tx, y, m) {
  const list = tx.filter(t => t.date.startsWith(monthKey(y, m)))
  let inc = 0, exp = 0
  const cats = {}, days = new Array(new Date(y, m + 1, 0).getDate()).fill(0)
  list.forEach(t => {
    if (t.type === 'in') inc += t.amount
    else { exp += t.amount; cats[t.cat] = (cats[t.cat] || 0) + t.amount; days[+t.date.slice(8, 10) - 1] += t.amount }
  })
  return {
    list, inc, exp, net: inc - exp, days,
    cats: Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, sum]) => ({ name, sum })),
    top: list.filter(t => t.type === 'out').sort((a, b) => b.amount - a.amount).slice(0, 5),
  }
}

export const ago = ts => { if (!ts) return '—'; const s = (Date.now() - ts) / 1000; if (s < 120) return t('ago_now'); if (s < 3600) return t('ago_m', { n: Math.floor(s / 60) }); if (s < 86400) return t('ago_h', { n: Math.floor(s / 3600) }); return t('ago_d', { n: Math.floor(s / 86400) }) }
export const dtm = ts => (ts ? new Date(ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
export const online = t => Date.now() - t < 120000

// Автоматически создаёт операции по регулярным платежам. id детерминированный -> на разных устройствах дублей не будет.
export function genRec(d) {
  const n = new Date(), cy = n.getFullYear(), cm = n.getMonth(), td = n.getDate()
  for (const r of d.rec || []) {
    let [y, m] = r.last ? [+r.last.slice(0, 4), +r.last.slice(5)] : [cy, cm] // m = номер последнего месяца (1..12) = индекс следующего
    for (let g = 0; g < 24; g++) {
      if (m > 11) { m = 0; y++ }
      if (y > cy || (y === cy && m > cm)) break
      const day = Math.min(r.day, new Date(y, m + 1, 0).getDate())
      if (y === cy && m === cm && td < day) break
      const key = monthKey(y, m), id = r.id + (y * 12 + m)
      if (!d.tx.some(x => x.id === id)) d.tx.push({ id, type: r.type, amount: r.amount, cat: r.cat, date: `${key}-${String(day).padStart(2, '0')}`, note: r.note || '🔁' })
      r.last = key; m++
    }
  }
}

// Калькулятор для поля суммы: "12000+35000", "50 000 - 7500", "(2+3)*1000"; без eval
export function calc(src) {
  const s = String(src).replace(/[\s\u00a0]/g, '').replace(/,/g, '.').replace(/\u2212/g, '-').replace(/\u00d7/g, '*').replace(/\u00f7/g, '/')
  if (!s || !/^[0-9+\-*/().]+$/.test(s)) return NaN
  let i = 0
  const expr = () => { let v = term(); while (s[i] === '+' || s[i] === '-') { const o = s[i++], r = term(); v = o === '+' ? v + r : v - r } return v }
  const term = () => { let v = factor(); while (s[i] === '*' || s[i] === '/') { const o = s[i++], r = factor(); v = o === '*' ? v * r : v / r } return v }
  const factor = () => {
    if (s[i] === '-') { i++; return -factor() }
    if (s[i] === '(') { i++; const v = expr(); if (s[i] !== ')') throw 0; i++; return v }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (!m) throw 0
    i += m[0].length; return parseFloat(m[0])
  }
  try { const v = expr(); return i === s.length && isFinite(v) ? v : NaN } catch { return NaN }
}
