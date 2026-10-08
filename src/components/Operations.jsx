import { useState } from 'react'
import AddModal from './AddModal.jsx'
import OpRow from './OpRow.jsx'
import Toast from './Toast.jsx'
import { catLabel, t } from '../i18n.js'
import { catsFor, monName, sortTx } from '../utils.js'

export default function Operations({ data, updData }) {
  const [filt, setFilt] = useState('all')
  const [q, setQ] = useState('')
  const [mon, setMon] = useState('all')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)
  const months = [...new Set(data.tx.map(x => x.date.slice(0, 7)))].sort().reverse()
  const ql = q.toLowerCase()
  const list = sortTx(data.tx).filter(x => (filt === 'all' || x.type === filt) && (mon === 'all' || x.date.startsWith(mon)) && (!q || (x.cat + ' ' + catLabel(x.cat) + ' ' + x.note).toLowerCase().includes(ql)))
  const save = x => { updData(d => { const i = d.tx.findIndex(y => y.id === x.id); i >= 0 ? (d.tx[i] = x) : d.tx.push(x) }); setModal(null) }
  const del = x => { updData(d => { d.tx = d.tx.filter(y => y.id !== x.id) }); setToast({ msg: t('op_deleted'), undo: () => updData(d => { d.tx.push(x) }) }) }
  return (
    <div className="card fitcard">
      <div className="seg">
        {[['all', t('all')], ['in', t('income')], ['out', t('expense')]].map(([k, n]) => (
          <button key={k} className={filt === k ? 'on' : ''} onClick={() => setFilt(k)}>{n}</button>
        ))}
      </div>
      <div className="two">
        <input placeholder={t('search')} value={q} onChange={e => setQ(e.target.value)} />
        <select value={mon} onChange={e => setMon(e.target.value)}>
          <option value="all">{t('all_months')}</option>
          {months.map(m => <option key={m} value={m}>{monName(+m.slice(5) - 1)} {m.slice(0, 4)}</option>)}
        </select>
      </div>
      <p className="mut" style={{ margin: '8px 0 2px' }}>{t('n_items', { n: list.length })}</p>
      <div className="scrollbox">
        {list.length
          ? list.map(x => <OpRow key={x.id} tx={x} cats={catsFor(data.settings, x.type)} onEdit={() => setModal({ initial: x })} onDelete={() => del(x)} />)
          : <div className="empty">{t('not_found')}</div>}
      </div>
      <button className="btn" onClick={() => setModal({})}>{t('add_op')}</button>
      {modal && <AddModal type="out" settings={data.settings} tx={data.tx} initial={modal.initial} onClose={() => setModal(null)} onSave={save} />}
      {toast && <Toast msg={toast.msg} onUndo={toast.undo} onClose={() => setToast(null)} />}
    </div>
  )
}
