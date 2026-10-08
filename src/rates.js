import { createContext } from 'react'
import { getLang } from './i18n.js'

// Курсы: { src: 'cbu'|'er', date: 'YYYY-MM-DD', at: мс, r: { USD: { v: сум за 1 единицу, d: изменение за день } } }
export const RatesCtx = createContext(null)

const CACHE = 'fin_rates'
export const cachedRates = () => { try { return JSON.parse(localStorage.getItem(CACHE)) } catch { return null } }
export const cacheRates = r => { try { localStorage.setItem(CACHE, JSON.stringify(r)) } catch {} }

export const FLAG = { UZS: '🇺🇿', USD: '🇺🇸', EUR: '🇪🇺', RUB: '🇷🇺', KZT: '🇰🇿', GBP: '🇬🇧', CNY: '🇨🇳', TRY: '🇹🇷', JPY: '🇯🇵', CHF: '🇨🇭', KRW: '🇰🇷', AED: '🇦🇪', KGS: '🇰🇬', TJS: '🇹🇯', AZN: '🇦🇿', UAH: '🇺🇦', BYN: '🇧🇾', INR: '🇮🇳', CAD: '🇨🇦', AUD: '🇦🇺', PLN: '🇵🇱', SAR: '🇸🇦', GEL: '🇬🇪' }
export const flag = c => FLAG[c] || '💱'

// сум за 1 единицу валюты
export const rateOf = (rates, code) => (code === 'UZS' ? 1 : (rates && rates.r && rates.r[code] && rates.r[code].v) || 0)
export const convert = (n, from, to, rates) => {
  const a = rateOf(rates, from), b = rateOf(rates, to)
  return a && b ? (n * a) / b : 0
}

const ws = s => s.replace(/\s/g, ' ')
// число с копейками для валют (до 2 знаков), целое для сум
export const fmtD = (n, max = 2) => ws(Number(n).toLocaleString('ru-RU', { maximumFractionDigits: max }))
export const fmtCur = (n, code) => `${fmtD(n)} ${code}`
// курс: для мелких валют больше знаков (IDR, VND ...)
export const fmtRate = v => (v >= 100 ? fmtD(v, 2) : v >= 1 ? fmtD(v, 2) : fmtD(v, 4))

export const curName = code => {
  try { const n = new Intl.DisplayNames([getLang() === 'ru' ? 'ru' : 'uz'], { type: 'currency' }).of(code); return n || code } catch { return code }
}

// долг в валюте пересчитываем по текущему курсу (долг в $ остаётся $)
export const debtUzs = (d, rates) => {
  const r = d.cur ? rateOf(rates, d.cur) : 0
  return r ? Math.round(d.orig * r) : d.amount
}

// ---------- загрузка ----------
const pd = s => { const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(s || '')); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
// ответ cbu.uz -> наш формат (тот же разбор, что и на сервере)
export function parseCbu(arr) {
  if (!Array.isArray(arr)) return null
  const r = {}, dt = {}
  let date = ''
  for (const x of arr) {
    const code = String((x && x.Ccy) || '').toUpperCase(), nom = Number(x && x.Nominal) || 1, v = Number(x && x.Rate) / nom
    if (!/^[A-Z]{3}$/.test(code) || !(v > 0) || !isFinite(v)) continue
    const d = pd(x.Date)
    if (r[code] && dt[code] > d) continue
    dt[code] = d; if (d > date) date = d
    r[code] = { v: +v.toFixed(6), d: +((Number(x.Diff) || 0) / nom).toFixed(6) }
  }
  return r.USD && r.EUR ? { src: 'cbu', date, at: Date.now(), r } : null
}

export async function loadRates(Api, force = false) {
  try { const r = await Api.rates(force); if (r && r.r) { cacheRates(r); return r } } catch {}
  // запасной вариант: браузер пользователя спрашивает ЦБ напрямую
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 6000)
    const resp = await fetch('https://cbu.uz/ru/arkhiv-kursov-valyut/json/', { signal: c.signal }); clearTimeout(t)
    const r = parseCbu(await resp.json())
    if (r) { cacheRates(r); return r }
  } catch {}
  return cachedRates()
}

// валюты для выбора в форме: сум + избранные (+ валюта редактируемой записи), только те, для которых есть курс
export const choices = (settings, rates, extra) =>
  [...new Set(['UZS', ...((settings && settings.favCur) || []), ...(extra ? [extra] : [])])].filter(c => c === 'UZS' || rateOf(rates, c) || c === extra)

// ---------- долги: частичные оплаты (суммы платежей — в валюте самого долга) ----------
export const debtBase = d => (d.cur ? d.orig : d.amount)
export const debtPaid = d => (d.payments || []).reduce((a, p) => a + p.a, 0)
export const debtLeft = d => (d.paid ? 0 : Math.max(0, debtBase(d) - debtPaid(d)))
export const debtLeftUzs = (d, rates) => { const l = debtLeft(d); if (!d.cur) return l; const r = rateOf(rates, d.cur) || d.rate || 0; return Math.round(l * r) }
