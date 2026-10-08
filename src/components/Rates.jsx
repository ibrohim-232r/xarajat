import { useContext, useState } from 'react'
import { t } from '../i18n.js'
import { RatesCtx, convert, curName, flag, fmtD, fmtRate } from '../rates.js'
import { ago } from '../utils.js'

const lab = c => (c === 'UZS' ? t('unit') : c)

export default function Rates({ data, updData, reload, loading }) {
  const rates = useContext(RatesCtx)
  const fav = data.settings.favCur || []
  const [amt, setAmt] = useState('100')
  const [from, setFrom] = useState('USD')
  const [to, setTo] = useState('UZS')
  const [all, setAll] = useState(false)
  const [q, setQ] = useState('')

  if (!rates) {
    return (
      <div className="card">
        <div className="empty">{t('r_fail')}</div>
        <button className="btn" onClick={() => reload(true)} disabled={loading}>{loading ? '...' : t('r_refresh')}</button>
      </div>
    )
  }

  const codes = Object.keys(rates.r).sort()
  const res = convert(+amt || 0, from, to, rates)
  const toggle = c => updData(d => {
    const f = d.settings.favCur || []
    d.settings.favCur = f.includes(c) ? f.filter(x => x !== c) : [...f, c].slice(0, 12)
  })
  const ql = q.trim().toLowerCase()
  const shown = all ? codes.filter(c => !ql || c.toLowerCase().includes(ql) || curName(c).toLowerCase().includes(ql)) : fav.filter(c => rates.r[c])

  const row = c => {
    const x = rates.r[c]
    return (
      <div className="op" key={c}>
        <div className="ic">{flag(c)}</div>
        <div className="t"><b>{c}</b><span>{curName(c)}</span></div>
        <div style={{ textAlign: 'right' }}>
          <strong>{fmtRate(x.v)}</strong>
          {x.d ? <span className={'dl ' + (x.d > 0 ? 'pos' : 'neg')}>{x.d > 0 ? '▲' : '▼'} {fmtRate(Math.abs(x.d))}</span> : null}
        </div>
        <button className="x" title={t('r_star')} onClick={() => toggle(c)}>{fav.includes(c) ? '★' : '☆'}</button>
      </div>
    )
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="hd"><h3>{t('r_conv')}</h3></div>
        <div className="conv">
          <div>
            <label style={{ marginTop: 0 }}>{t('amount')}</label>
            <input type="number" inputMode="decimal" step="any" min="0" value={amt} onChange={e => setAmt(e.target.value)} />
          </div>
          <div>
            <label style={{ marginTop: 0 }}>{t('r_from')}</label>
            <select value={from} onChange={e => setFrom(e.target.value)}>{['UZS', ...codes].map(c => <option key={c} value={c}>{c === 'UZS' ? t('unit') : c}</option>)}</select>
          </div>
          <div>
            <label style={{ marginTop: 0 }}>{t('r_to')}</label>
            <select value={to} onChange={e => setTo(e.target.value)}>{['UZS', ...codes].map(c => <option key={c} value={c}>{c === 'UZS' ? t('unit') : c}</option>)}</select>
          </div>
        </div>
        <div className="convres">
          <button className="sm" onClick={() => { setFrom(to); setTo(from) }} aria-label="⇄">⇄</button>
          <b>{fmtD(+amt || 0, 4)} {lab(from)} = {fmtD(res, to === 'UZS' ? 0 : 2)} {lab(to)}</b>
        </div>
      </div>

      <div className="card">
        <div className="hd">
          <h3>{all ? t('r_all') : t('r_mine')}</h3>
          <button className="link" onClick={() => setAll(!all)}>{all ? t('r_hide') : t('r_all')}</button>
        </div>
        {all && <input placeholder={t('r_find')} value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8 }} />}
        {shown.map(row)}
        <div className="hint" style={{ marginTop: 12 }}>
          {rates.src === 'cbu' ? t('r_src_cbu') : t('r_src_er')} · {t('r_date', { d: rates.date })}<br />
          {t('r_updated', { a: ago(rates.at) })} · {t('r_auto')}
        </div>
        <button className="btn s" onClick={() => reload(true)} disabled={loading}>{loading ? '...' : '🔄 ' + t('r_refresh')}</button>
      </div>
    </>
  )
}
