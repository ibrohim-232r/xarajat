import { useContext, useState } from 'react'
import Modal from './Modal.jsx'
import { catLabel, t } from '../i18n.js'
import { RatesCtx, choices, fmtRate, rateOf } from '../rates.js'
import { calc, catsFor, catSpent, fmt, today } from '../utils.js'

export default function AddModal({ type: t0, initial, settings, tx = [], onSave, onClose }) {
  const rates = useContext(RatesCtx)
  const i = initial
  const [type, setType] = useState(i ? i.type : t0)
  const [cur, setCur] = useState(i && i.cur ? i.cur : 'UZS')
  const [amount, setAmount] = useState(i ? String(i.cur ? i.orig : i.amount) : '')
  const [cat, setCat] = useState(i ? i.cat : Object.keys(catsFor(settings, t0))[0])
  const [date, setDate] = useState(i ? i.date : today())
  const [note, setNote] = useState(i ? i.note : '')
  const [err, setErr] = useState('')
  const pick = k => { setType(k); setCat(Object.keys(catsFor(settings, k))[0]) }

  const cats = catsFor(settings, type)
  if (!(cat in cats)) cats[cat] = '•' // категория удалена, но у записи она осталась

  // валюта: если запись не менялась, сохраняем её исходный курс; иначе берём актуальный
  const v = calc(amount)
  const a = cur === 'UZS' ? Math.round(v) : Math.round(v * 100) / 100
  const isExpr = /[+\-\u2212\u00d7\u00f7*/()]/.test(amount.replace(/^\s*-/, ''))
  const frozen = !!(i && i.cur && i.cur === cur && a === i.orig)
  const rate = cur === 'UZS' ? 1 : frozen ? i.rate : rateOf(rates, cur)
  const uzs = a > 0 && rate ? (frozen ? i.amount : cur === 'UZS' ? a : Math.max(1, Math.round(a * rate))) : 0

  // подсказка по лимиту категории
  const limit = type === 'out' && settings ? (settings.catLimits || {})[cat] : 0
  let hint = null
  if (limit) {
    const d = date || today()
    const spent = catSpent(tx.filter(x => !i || x.id !== i.id), cat, +d.slice(0, 4), +d.slice(5, 7) - 1) + uzs
    const pc = Math.round((spent / limit) * 100)
    hint = <div className={'budget' + (pc >= 100 ? ' over' : pc >= 80 ? ' warn' : '')} style={{ marginTop: 8 }}><span className={'mut' + (pc >= 100 ? ' neg' : '')}>{catLabel(cat)}: {fmt(spent)} / {fmt(limit)} ({pc}%)</span><div className="bar"><i style={{ width: Math.min(100, pc) + '%' }} /></div></div>
  }

  const save = () => {
    if (!(a > 0)) return setErr(t('bad_sum'))
    if (cur !== 'UZS' && !rate) return setErr(t('no_rate'))
    const base = { id: i ? i.id : Date.now(), type, cat, date: date || today(), note: note.trim() }
    onSave(cur === 'UZS' ? { ...base, amount: a } : { ...base, amount: uzs, cur, orig: a, rate })
  }

  return (
    <Modal onClose={onClose}>
      <h3>{i ? t('op_edit') : t('op_add')}</h3>
      <div className="seg">
        <button className={type === 'in' ? 'on' : ''} onClick={() => pick('in')}>{t('income')}</button>
        <button className={type === 'out' ? 'on' : ''} onClick={() => pick('out')}>{t('expense')}</button>
      </div>
      <label>{t('amount')}</label>
      <div className="amt">
        <input type="text" inputMode={cur === 'UZS' ? 'numeric' : 'decimal'} placeholder="0  /  12000+35000" autoComplete="off" value={amount} onChange={e => setAmount(e.target.value)} onBlur={() => isExpr && a > 0 && setAmount(String(a))} />
        <select value={cur} onChange={e => setCur(e.target.value)} aria-label={t('currency')}>
          {choices(settings, rates, i && i.cur).map(c => <option key={c} value={c}>{c === 'UZS' ? t('unit') : c}</option>)}
        </select>
      </div>
      <div className="calcrow">
        {['+', '\u2212', '\u00d7', '\u00f7'].map(o => <button type="button" className="chip" key={o} onClick={() => setAmount(x => x + (o === '\u2212' ? '-' : o))}>{o}</button>)}
        {isExpr && <button type="button" className="chip on" onClick={() => a > 0 && setAmount(String(a))}>= {a > 0 ? a.toLocaleString('ru-RU') : '?'}</button>}
      </div>
      {cur !== 'UZS' && a > 0 && rate > 0 && <div className="hint">{t('conv_prev', { n: fmt(uzs), c: cur, r: fmtRate(rate) })}</div>}
      <label>{t('category')}</label>
      <select value={cat} onChange={e => setCat(e.target.value)}>{Object.keys(cats).map(c => <option key={c} value={c}>{cats[c]} {catLabel(c)}</option>)}</select>
      {hint}
      <label>{t('date')}</label><input type="date" value={date} onChange={e => setDate(e.target.value)} />
      <label>{t('note')}</label><input maxLength={80} value={note} onChange={e => setNote(e.target.value)} />
      <div className="err">{err}</div>
      <button className="btn" onClick={save}>{t('save')}</button>
    </Modal>
  )
}
