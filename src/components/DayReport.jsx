import { useState } from 'react'
import AddModal from './AddModal.jsx'
import OpRow from './OpRow.jsx'
import Toast from './Toast.jsx'
import { catLabel, t } from '../i18n.js'
import { catsFor, dstr, fmt, monName, sortTx, today, wdName, ymd } from '../utils.js'

const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const sums = list => list.reduce((a, x) => { x.type === 'in' ? (a.inc += x.amount) : (a.exp += x.amount); return a }, { inc: 0, exp: 0 })

export default function DayReport({ data, updData, day, setDay }) {
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)
  const td = today(), d = parse(day), isToday = day >= td
  const shift = n => { const x = new Date(d); x.setDate(x.getDate() + n); const k = ymd(x); setDay(k > td ? td : k) }

  const list = sortTx(data.tx.filter(x => x.date === day))
  const { inc, exp } = sums(list), net = inc - exp
  const prev = ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))
  const pExp = sums(data.tx.filter(x => x.date === prev)).exp
  const ch = pExp ? Math.round(((exp - pExp) / pExp) * 100) : null

  // средний дневной расход за этот месяц (по прошедшим дням)
  const mk = day.slice(0, 7)
  const monthExp = data.tx.filter(x => x.type === 'out' && x.date.startsWith(mk)).reduce((a, x) => a + x.amount, 0)
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const passed = mk === td.slice(0, 7) ? +td.slice(8) : dim
  const avg = monthExp / passed
  const share = avg && exp ? Math.round((exp / avg) * 100) : null

  // категории расходов за день
  const cm = {}
  list.forEach(x => { if (x.type === 'out') cm[x.cat] = (cm[x.cat] || 0) + x.amount })
  const cats = Object.entries(cm).sort((a, b) => b[1] - a[1])
  const outCats = catsFor(data.settings, 'out')

  // неделя выбранного дня (Пн–Вс)
  const dow = (d.getDay() + 6) % 7
  const wk = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d); x.setDate(d.getDate() - dow + i)
    const k = ymd(x)
    return { k, n: x.getDate(), sum: data.tx.filter(y => y.type === 'out' && y.date === k).reduce((a, y) => a + y.amount, 0), has: data.tx.some(y => y.date === k), future: k > td }
  })
  const wmx = Math.max(...wk.map(x => x.sum), 1)

  const save = x => { updData(dd => { const i = dd.tx.findIndex(y => y.id === x.id); i >= 0 ? (dd.tx[i] = x) : dd.tx.push(x) }); setModal(null) }
  const del = x => { updData(dd => { dd.tx = dd.tx.filter(y => y.id !== x.id) }); setToast({ msg: t('op_deleted'), undo: () => updData(dd => { dd.tx.push(x) }) }) }

  return (
    <>
      <div className="card mnav">
        <button className="sm" onClick={() => shift(-1)} aria-label="−1">◀</button>
        <b>{wdName(dow)}, {d.getDate()} {monName(d.getMonth())} {d.getFullYear()}</b>
        <button className="sm" disabled={isToday} onClick={() => shift(1)} aria-label="+1">▶</button>
      </div>
      <div className="card dwk">
        {wk.map((x, i) => (
          <button key={x.k} disabled={x.future} className={(x.k === day ? 'on ' : '') + (x.k === td ? 'tdy' : '')} onClick={() => setDay(x.k)}>
            <small>{wdName(i)}</small>
            <span className="bw"><i style={{ height: Math.max(4, (x.sum / wmx) * 100) + '%', opacity: x.has ? 1 : .35 }} /></span>
            <b>{x.n}</b>
          </button>
        ))}
      </div>
      <div className="g4">
        <div className="card"><span className="mut">{t('income')}</span><div className="big pos">+{fmt(inc)}</div></div>
        <div className="card"><span className="mut">{t('expense')}</span><div className="big neg">−{fmt(exp)}</div></div>
        <div className="card"><span className="mut">{t('net')}</span><div className={'big ' + (net >= 0 ? 'pos' : 'neg')}>{net >= 0 ? '+' : '−'}{fmt(Math.abs(net))}</div></div>
        <div className="card"><span className="mut">{t('d_ops')}</span><div className="big">{list.length}</div></div>
      </div>
      <div className="insight card">
        {list.length === 0 ? t('d_none') : <>
          📊 {ch !== null && <>{t('d_vs_prev')}: <b className={ch > 0 ? 'neg' : 'pos'}>{ch > 0 ? '+' : ''}{ch}%</b>. </>}
          {share !== null && <>{t('avg_day')}: <b>{fmt(avg)} {t('unit')}</b> · <b className={share > 100 ? 'neg' : 'pos'}>{share}%</b> {t('d_share')}.</>}
        </>}
      </div>
      {cats.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="hd"><h3>{t('d_cats')}</h3><span className="mut">{dstr(day)}</span></div>
          {cats.map(([c, sum]) => {
            const pc = Math.round((sum / exp) * 100)
            return (
              <div key={c} className="budget">
                <div className="row"><span>{outCats[c] || '•'} {catLabel(c)}</span><span className="mut">{fmt(sum)} · {pc}%</span></div>
                <div className="bar"><i style={{ width: pc + '%' }} /></div>
              </div>
            )
          })}
        </div>
      )}
      <div className="card">
        <div className="hd"><h3>{t('d_list')}</h3><span className="mut">{dstr(day)}</span></div>
        {list.length
          ? list.map(x => <OpRow key={x.id} tx={x} cats={catsFor(data.settings, x.type)} onEdit={() => setModal({ initial: x })} onDelete={() => del(x)} />)
          : <div className="empty">{t('d_none')}</div>}
        <button className="btn" onClick={() => setModal({})}>{t('add_op')}</button>
      </div>
      {modal && <AddModal type="out" settings={data.settings} tx={data.tx} initial={modal.initial} defDate={day} onClose={() => setModal(null)} onSave={save} />}
      {toast && <Toast msg={toast.msg} onUndo={toast.undo} onClose={() => setToast(null)} />}
    </>
  )
}
