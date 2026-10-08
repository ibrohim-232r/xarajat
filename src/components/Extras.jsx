import { useState } from 'react'
import Modal from './Modal.jsx'
import { catLabel, t } from '../i18n.js'
import { catsFor, fmt, monthKey } from '../utils.js'
import { clearPin, hasPin, setPin } from '../pin.js'
import { installApp, useInstall } from '../install.js'

function RecModal({ settings, onSave, onClose }) {
  const [type, setType] = useState('out')
  const [amount, setAmount] = useState('')
  const [cat, setCat] = useState(Object.keys(catsFor(settings, 'out'))[0])
  const [day, setDay] = useState('1')
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const cats = catsFor(settings, type)
  const pick = k => { setType(k); setCat(Object.keys(catsFor(settings, k))[0]) }
  const save = () => {
    const d = Math.round(+day)
    if (!(+amount > 0)) return setErr(t('bad_sum'))
    if (!(d >= 1 && d <= 28)) return setErr(t('rec_bad_day'))
    const n = new Date(), y = n.getFullYear(), m = n.getMonth()
    const cur = monthKey(y, m), prev = m ? monthKey(y, m - 1) : monthKey(y - 1, 11)
    onSave({ id: Date.now(), type, amount: Math.round(+amount), cat, day: d, note: note.trim(), last: d <= n.getDate() ? cur : prev })
  }
  return (
    <Modal onClose={onClose}>
      <h3>{t('rec_title')}</h3>
      <p className="mut">{t('rec_hint')}</p>
      <div className="seg"><button className={type === 'in' ? 'on' : ''} onClick={() => pick('in')}>{t('income')}</button><button className={type === 'out' ? 'on' : ''} onClick={() => pick('out')}>{t('expense')}</button></div>
      <label>{t('amount')}</label><input type="number" inputMode="numeric" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
      <label>{t('category')}</label><select value={cat} onChange={e => setCat(e.target.value)}>{Object.keys(cats).map(c => <option key={c} value={c}>{cats[c]} {catLabel(c)}</option>)}</select>
      <label>{t('rec_day_lbl')}</label><input type="number" min="1" max="28" value={day} onChange={e => setDay(e.target.value)} />
      <label>{t('note')}</label><input value={note} onChange={e => setNote(e.target.value)} maxLength={80} />
      <div className="err">{err}</div>
      <button className="btn" onClick={save}>{t('save')}</button>
    </Modal>
  )
}

export default function Extras({ user, data, updData }) {
  const st = data.settings
  const [rm, setRm] = useState(false)
  const [pin, setPinV] = useState('')
  const [pinOn, setPinOn] = useState(hasPin(user.login))
  const [msg, setMsg] = useState('')
  const inst = useInstall()
  const flash = m => { setMsg(m); setTimeout(() => setMsg(''), 2500) }
  const savePin = async () => { if (!/^\d{4,6}$/.test(pin)) return flash(t('pin_bad')); await setPin(user.login, pin); setPinV(''); setPinOn(true); flash(t('pin_on')) }

  return (
    <>
      <div className="card">
        <div className="hd" style={{ marginBottom: 4 }}><h3 className="h" style={{ margin: 0 }}>{t('rec_title')}</h3><button className="sm" onClick={() => setRm(true)}>+ {t('add')}</button></div>
        {data.rec.length ? data.rec.map(r => (
          <div className="op" key={r.id}>
            <div className="ic">{catsFor(st, r.type)[r.cat] || '•'}</div>
            <div className="t"><b>{catLabel(r.cat)}</b><span>{t('rec_day', { d: r.day })}{r.note ? ' · ' + r.note : ''}</span></div>
            <strong className={r.type === 'in' ? 'pos' : 'neg'}>{r.type === 'in' ? '+' : '−'}{fmt(r.amount)}</strong>
            <button className="x" onClick={() => confirm(t('rec_del_q')) && updData(d => { d.rec = d.rec.filter(x => x.id !== r.id) })}>✕</button>
          </div>
        )) : <p className="mut" style={{ marginTop: 8 }}>{t('rec_none')}</p>}
      </div>
      <div className="card">
        <h3 className="h">{t('inst_title')}</h3>
        {inst.standalone ? <p className="mut">{t('inst_done')}</p> : <>
          <p className="mut">{t('inst_hint')}</p>
          {inst.canPrompt
            ? <button className="btn" onClick={installApp}>{t('inst_btn')}</button>
            : <p className="mut">{inst.ios ? t('inst_ios') : t('inst_manual')}</p>}
        </>}
      </div>
      <div className="card">
        <h3 className="h">{t('pin_title')}</h3>
        <p className="mut">{t('pin_hint')}</p>
        {pinOn
          ? <button className="btn s" onClick={() => { clearPin(user.login); setPinOn(false); flash(t('pin_off')) }}>{t('pin_remove')}</button>
          : <><input type="password" inputMode="numeric" maxLength={6} placeholder={t('pin_ph')} value={pin} onChange={e => setPinV(e.target.value.replace(/\D/g, ''))} /><button className="btn" onClick={savePin}>{t('pin_set')}</button></>}
      </div>
      {msg && <div className="toast" style={{ bottom: 90 }}><span>{msg}</span></div>}
      {rm && <RecModal settings={st} onClose={() => setRm(false)} onSave={r => { updData(d => { d.rec.push(r) }); setRm(false) }} />}
    </>
  )
}
