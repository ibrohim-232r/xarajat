import { useState } from 'react'
import OpRow from './OpRow.jsx'
import { catLabel, list as tl, t } from '../i18n.js'
import { PAL, catsFor, fmt, monName, report } from '../utils.js'

const csvCell = s => '"' + (/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"' // защита от формул в Excel

export default function Reports({ data }) {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const { y, m } = ym
  const r = report(data.tx, y, m)
  const pm = m ? { y, m: m - 1 } : { y: y - 1, m: 11 }
  const p = report(data.tx, pm.y, pm.m)
  const isNow = y === now.getFullYear() && m === now.getMonth()
  const shift = d => { const n = new Date(y, m + d, 1); setYm({ y: n.getFullYear(), m: n.getMonth() }) }
  const rate = r.inc ? Math.round((r.net / r.inc) * 100) : 0
  const ch = p.exp ? Math.round(((r.exp - p.exp) / p.exp) * 100) : null
  const dn = isNow ? now.getDate() : r.days.length
  const mx = Math.max(...r.days, 1)
  const proj = isNow && r.exp > 0 ? (r.exp / now.getDate()) * r.days.length : 0
  const bud = data.settings.budget
  let acc = 0
  const cats = catsFor(data.settings, 'out')
  const limRows = Object.entries(data.settings.catLimits || {}).filter(([c]) => c in cats).map(([c, lim]) => [c, lim, (r.cats.find(x => x.name === c) || { sum: 0 }).sum])
  const csv = () => {
    const rows = [tl('csv_cols'), ...r.list.map(x => [x.date, x.type === 'in' ? t('income') : t('expense'), csvCell(catLabel(x.cat)), x.amount, csvCell(x.note), x.cur || 'UZS', x.cur ? x.orig : x.amount])]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map(x => x.join(';')).join('\n')], { type: 'text/csv' }))
    a.download = `hisobot-${y}-${String(m + 1).padStart(2, '0')}.csv`; a.click()
  }

  return (
    <>
      <div className="card mnav">
        <button className="sm" onClick={() => shift(-1)}>◀</button>
        <b>{monName(m)} {y}</b>
        <button className="sm" disabled={isNow} onClick={() => shift(1)}>▶</button>
      </div>
      <div className="g4">
        <div className="card"><span className="mut">{t('income')}</span><div className="big pos">+{fmt(r.inc)}</div></div>
        <div className="card"><span className="mut">{t('expense')}</span><div className="big neg">−{fmt(r.exp)}</div></div>
        <div className="card"><span className="mut">{t('net')}</span><div className={'big ' + (r.net >= 0 ? 'pos' : 'neg')}>{r.net >= 0 ? '+' : '−'}{fmt(Math.abs(r.net))}</div></div>
        <div className="card"><span className="mut">{t('save_rate')}</span><div className="big">{rate}%</div></div>
      </div>
      <div className="insight card">
        {r.list.length === 0 ? t('no_ops_month') : <>
          📊 {t('avg_day')}: <b>{fmt(r.exp / dn)} {t('unit')}</b>.
          {ch !== null && <> {t('vs_prev')} <b className={ch > 0 ? 'neg' : 'pos'}>{ch > 0 ? '+' : ''}{ch}%</b>.</>}
          {proj > 0 && <> 📈 {t('forecast', { n: fmt(proj), u: t('unit') })}{bud > 0 && (proj > bud ? <b className="neg">{t('forecast_over', { n: fmt(proj - bud) })}</b> : <span className="pos">{t('forecast_ok')}</span>)}.</>}
          {r.cats[0] && <> {t('top_cat')}: <b>{catLabel(r.cats[0].name)}</b> ({Math.round((r.cats[0].sum / r.exp) * 100)}%).</>}
        </>}
      </div>
      {limRows.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd"><h3>{t('cat_limits')}</h3><span className="mut">{monName(m)}</span></div>
          {limRows.map(([c, lim, sum]) => {
            const pc = Math.round((sum / lim) * 100)
            return (
              <div key={c} className={'budget' + (pc >= 100 ? ' over' : pc >= 80 ? ' warn' : '')}>
                <div className="row"><span>{cats[c] || '•'} {catLabel(c)}</span><span className={pc >= 100 ? 'neg' : 'mut'}>{fmt(sum)} / {fmt(lim)} · {pc}%</span></div>
                <div className="bar"><i style={{ width: Math.min(100, pc) + '%' }} /></div>
              </div>
            )
          })}
        </div>
      )}
      <div className="g3">
        <div className="card">
          <div className="hd"><h3>{t('categories')}</h3></div>
          {r.cats.length ? (
            <div className="donutw">
              <svg viewBox="0 0 42 42" className="donut">
                <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--soft)" strokeWidth="6" />
                {r.cats.map((c, i) => { const pc = (c.sum / r.exp) * 100, off = 25 - acc; acc += pc; return <circle key={c.name} cx="21" cy="21" r="15.9155" fill="none" stroke={PAL[i % PAL.length]} strokeWidth="6" strokeDasharray={`${pc} ${100 - pc}`} strokeDashoffset={off} /> })}
              </svg>
              <div className="leg">
                {r.cats.map((c, i) => <div key={c.name}><i style={{ background: PAL[i % PAL.length] }} /><span>{catLabel(c.name)}</span><b>{fmt(c.sum)}</b><em>{Math.round((c.sum / r.exp) * 100)}%</em></div>)}
              </div>
            </div>
          ) : <div className="empty">{t('no_expenses')}</div>}
        </div>
        <div className="card">
          <div className="hd"><h3>{t('biggest')}</h3></div>
          {r.top.length ? r.top.map(x => <OpRow key={x.id} tx={x} cats={catsFor(data.settings, x.type)} />) : <div className="empty">{t('no_expenses')}</div>}
        </div>
      </div>
      <div className="card">
        <div className="hd"><h3>{t('daily')}</h3><span className="mut">{monName(m)}</span></div>
        <div className="chart days">
          {r.days.map((v, i) => <div key={i} className={isNow && i + 1 === now.getDate() ? 'on' : ''} title={fmt(v)}><i style={{ height: Math.max(3, (v / mx) * 100) + '%' }} />{i + 1}</div>)}
        </div>
      </div>
      <div className="two noprint" style={{ marginTop: 14 }}>
        <button className="btn s" onClick={csv}>{t('csv_btn')}</button>
        <button className="btn s" onClick={() => window.print()}>{t('print_btn')}</button>
      </div>
    </>
  )
}
