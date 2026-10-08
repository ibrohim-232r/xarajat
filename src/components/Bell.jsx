import { useEffect, useRef, useState } from 'react'
import { catLabel, t } from '../i18n.js'
import { catSpent, monthKey, today } from '../utils.js'

const getSeen = () => { try { return JSON.parse(localStorage.getItem('fin_nf_seen') || '[]') } catch { return [] } }
const putSeen = a => { try { localStorage.setItem('fin_nf_seen', JSON.stringify(a.slice(-200))) } catch {} }

// Уведомления считаются на устройстве из ваших данных: долги, лимиты, регулярные платежи
function build(data) {
  const out = [], td = today(), n = new Date(), y = n.getFullYear(), m = n.getMonth()
  const st = data.settings || {}
  for (const d of data.debts || []) {
    if (d.paid || !d.due) continue
    const days = Math.round((new Date(d.due) - new Date(td)) / 864e5)
    if (days < 0) out.push({ key: 'o' + d.id + td, text: t('nf_overdue', { who: d.who, d: d.due }), view: 'debts', lvl: 2 })
    else if (days <= 3) out.push({ key: 'd' + d.id + td, text: t('nf_due', { who: d.who, d: d.due }), view: 'debts', lvl: 1 })
  }
  const mk = monthKey(y, m)
  const spent = (data.tx || []).filter(x => x.type === 'out' && x.date.startsWith(mk)).reduce((a, x) => a + x.amount, 0)
  if (st.budget > 0) {
    const p = Math.round((spent / st.budget) * 100)
    if (p >= 100) out.push({ key: 'b100' + mk + Math.floor(p / 25), text: t('nf_budget100', { p }), view: 'report', lvl: 2 })
    else if (p >= 80) out.push({ key: 'b80' + mk, text: t('nf_budget80', { p }), view: 'report', lvl: 1 })
  }
  for (const [c, lim] of Object.entries(st.catLimits || {})) {
    if (!(lim > 0)) continue
    const p = Math.round((catSpent(data.tx || [], c, y, m) / lim) * 100)
    if (p >= 80) out.push({ key: 'c' + c + mk + (p >= 100 ? 100 : 80), text: t('nf_cat', { c: catLabel(c), p }), view: 'report', lvl: p >= 100 ? 2 : 1 })
  }
  const last = new Date(y, m + 1, 0).getDate()
  for (const r of data.rec || []) {
    const diff = Math.min(r.day, last) - n.getDate()
    if (diff >= 1 && diff <= 3) out.push({ key: 'r' + r.id + td, text: t('nf_rec', { n: r.note || r.cat, d: diff === 1 ? t('nf_tomorrow') : t('nf_in_days', { n: diff }) }), view: 'profile', lvl: 0 })
  }
  return out.sort((a, b) => b.lvl - a.lvl)
}

export default function Bell({ data, go }) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(getSeen)
  const box = useRef(null)
  const items = build(data)
  const unread = items.filter(i => !seen.includes(i.key)).length

  useEffect(() => {
    if (!open) return
    const f = e => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', f)
    return () => document.removeEventListener('pointerdown', f)
  }, [open])

  const toggle = () => {
    if (!open) { const s = [...new Set([...seen, ...items.map(i => i.key)])]; setSeen(s); putSeen(s) }
    setOpen(o => !o)
  }

  return (
    <div className="bellw" ref={box}>
      <button className="eye" onClick={toggle} title={t('nf_title')} aria-label={t('nf_title')}>🔔{unread > 0 && <i className="dot">{unread}</i>}</button>
      {open && (
        <div className="nfp">
          <b>{t('nf_title')}</b>
          {items.length === 0 && <p className="mut">{t('nf_empty')}</p>}
          {items.map(i => <button key={i.key} className={'nfi l' + i.lvl} onClick={() => { go(i.view); setOpen(false) }}>{i.text}</button>)}
        </div>
      )}
    </div>
  )
}
