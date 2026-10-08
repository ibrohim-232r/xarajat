import { useContext, useState } from 'react'
import Modal from './Modal.jsx'
import AddModal from './AddModal.jsx'
import OpRow from './OpRow.jsx'
import { t } from '../i18n.js'
import { RatesCtx, flag, fmtRate } from '../rates.js'
import { catsFor, fmt, monName, sortTx, stats, week, wdName } from '../utils.js'

export default function Home({ data, updData, go }) {
  const rates = useContext(RatesCtx)
  const [add, setAdd] = useState(null)
  const [goalOpen, setGoalOpen] = useState(false)
  const [depOpen, setDepOpen] = useState(false)
  const [f, setF] = useState({ target: '', saved: '' })
  const [dep, setDep] = useState('')
  const s = stats(data.tx), w = week(data.tx), mx = Math.max(...w.map(x => x.sum), 1)
  const g = data.goal, pc = g.target ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0
  const last = sortTx(data.tx).slice(0, 4)
  const b = data.settings.budget, bp = b ? (s.exp / b) * 100 : 0
  const strip = rates ? (data.settings.favCur || []).filter(c => rates.r[c]).slice(0, 3) : []

  return (
    <div className="home">
      <div className="card hero">
        <div><small>{t('total_bal', { m: monName(s.m), y: s.y })}</small><b>{fmt(s.bal)} {t('unit')}</b></div>
        <div className="hs">
          <div><small>▲ {t('incomes')}</small><strong>+{fmt(s.inc)}</strong></div>
          <div><small>▼ {t('expenses')}</small><strong>−{fmt(s.exp)}</strong></div>
        </div>
        {strip.length > 0 && (
          <div className="rs" onClick={() => go('rates')}>
            {strip.map(c => {
              const x = rates.r[c]
              return <span key={c}>{flag(c)} {c} <span className="v">{fmtRate(x.v)}</span> {x.d ? <em className={x.d > 0 ? 'pos' : 'neg'}>{x.d > 0 ? '▲' : '▼'}</em> : null}</span>
            })}
          </div>
        )}
      </div>
      <div className="g3 mid">
        <div className="card col">
          <div className="hd"><h3>{t('expenses')}</h3><span className="mut">{t('this_week')}</span></div>
          <div className="chart">
            {w.map((x, i) => (
              <div key={x.k} className={x.now ? 'on' : ''} title={fmt(x.sum)}>
                <i style={{ height: Math.max(4, (x.sum / mx) * 100) + '%' }} />{wdName(i)}
              </div>
            ))}
          </div>
        </div>
        <div className="card col">
          <div className="hd"><h3>{t('recent_ops')}</h3><button className="link" onClick={() => go('ops')}>{t('all')}</button></div>
          <div className="recent">{last.length ? last.map(x => <OpRow key={x.id} tx={x} cats={catsFor(data.settings, x.type)} />) : <div className="empty">{t('no_ops_yet')}</div>}</div>
          <button className="btn" onClick={() => setAdd('out')}>{t('add_op')}</button>
        </div>
      </div>
      <div className="low">
        <div className="card goal">
          <div className="hd" style={{ margin: 0 }}>
            <h3>{t('savings')}</h3>
            <button className="link" onClick={() => { setF({ target: g.target || '', saved: g.saved || '' }); setGoalOpen(true) }}>{g.target ? t('change') : t('goal_word')}</button>
          </div>
          <p style={{ marginTop: 6 }}>{fmt(g.saved)} / {fmt(g.target)}</p>
          <div className="bar"><i style={{ width: pc + '%' }} /></div>
          <div className="row mut"><span>{pc}%</span>{g.target > 0 && <button className="link" onClick={() => setDepOpen(true)}>{t('add_plus')}</button>}</div>
        </div>
        <div className={'card budget limit' + (bp >= 100 ? ' over' : bp >= 80 ? ' warn' : '')}>
          <div className="hd" style={{ margin: 0 }}><h3>{t('month_limit')}</h3><button className="link" onClick={() => go('profile')}>{b ? t('change') : t('set_it')}</button></div>
          {b ? <>
            <p style={{ marginTop: 6 }}>{fmt(s.exp)} / {fmt(b)}</p>
            <div className="bar"><i style={{ width: Math.min(100, bp) + '%' }} /></div>
            <div className="mut">{bp >= 100 ? <b className="neg">{t('over_by', { n: fmt(s.exp - b) })}</b> : t('left_n', { n: fmt(b - s.exp) })}</div>
          </> : <p className="mut" style={{ marginTop: 6 }}>{t('no_limit')}</p>}
        </div>
        <div className="card qcard">
          <h3 style={{ fontWeight: 500, fontSize: 17 }}>{t('quick_add')}</h3>
          <div className="qa">
            <button className="btn in" onClick={() => setAdd('in')}>{t('plus_in')}</button>
            <button className="btn out" onClick={() => setAdd('out')}>{t('minus_out')}</button>
          </div>
        </div>
      </div>

      {add && <AddModal type={add} settings={data.settings} tx={data.tx} onClose={() => setAdd(null)} onSave={x => { updData(d => d.tx.push(x)); setAdd(null) }} />}
      {goalOpen && (
        <Modal onClose={() => setGoalOpen(false)}>
          <h3>{t('goal_title')}</h3>
          <label>{t('goal_sum')}</label><input type="number" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} />
          <label>{t('goal_saved')}</label><input type="number" value={f.saved} onChange={e => setF({ ...f, saved: e.target.value })} />
          <button className="btn" onClick={() => { updData(d => { d.goal = { target: Math.max(0, +f.target || 0), saved: Math.max(0, +f.saved || 0) } }); setGoalOpen(false) }}>{t('save')}</button>
        </Modal>
      )}
      {depOpen && (
        <Modal onClose={() => setDepOpen(false)}>
          <h3>{t('goal_topup')}</h3>
          <label>{t('sum')}</label><input type="number" value={dep} onChange={e => setDep(e.target.value)} />
          <button className="btn" onClick={() => { updData(d => { d.goal.saved += Math.max(0, +dep || 0) }); setDep(''); setDepOpen(false) }}>{t('add')}</button>
        </Modal>
      )}
    </div>
  )
}
