import { useContext, useState } from 'react'
import Modal from './Modal.jsx'
import Toast from './Toast.jsx'
import { t } from '../i18n.js'
import { RatesCtx, choices, debtBase, debtLeft, debtLeftUzs, debtPaid, fmtCur, fmtRate, rateOf } from '../rates.js'
import { fmt, today } from '../utils.js'

const money = (n, cur) => (cur && cur !== 'UZS' ? fmtCur(n, cur) : fmt(n) + ' ' + t('unit'))
const remindText = (who, amount, due) => t('remind_txt', { who, n: amount, due: due ? t('remind_due', { d: due }) : '' })
async function copy(text) { try { await navigator.clipboard.writeText(text); alert(t('copied')) } catch { prompt(t('copy_prompt'), text) } }

function DebtModal({ initial: i, settings, onSave, onClose }) {
  const rates = useContext(RatesCtx)
  const [dir, setDir] = useState(i ? i.dir : 'in')
  const [who, setWho] = useState(i ? i.who : '')
  const [phone, setPhone] = useState(i ? i.phone || '' : '')
  const [cur, setCur] = useState(i && i.cur ? i.cur : 'UZS')
  const [amount, setAmount] = useState(i ? String(i.cur ? i.orig : i.amount) : '')
  const [due, setDue] = useState(i ? i.due : '')
  const [note, setNote] = useState(i ? i.note : '')
  const [pays, setPays] = useState(i ? i.payments || [] : [])
  const [pa, setPa] = useState('')
  const [err, setErr] = useState('')
  const a = +amount
  const rate = cur === 'UZS' ? 1 : rateOf(rates, cur) || (i && i.cur === cur ? i.rate : 0)
  const sum = pays.reduce((x, p) => x + p.a, 0), left = Math.max(0, a - sum)
  const addPay = () => { const v = +pa; if (!(v > 0)) return; setPays([...pays, { d: today(), a: v }]); setPa('') }
  const save = () => {
    if (!who.trim()) return setErr(t('enter_name'))
    if (!(a > 0)) return setErr(t('bad_sum'))
    if (cur !== 'UZS' && !rate) return setErr(t('no_rate'))
    const full = sum >= a
    const base = { id: i ? i.id : Date.now(), dir, who: who.trim(), phone: phone.trim(), due, note: note.trim(), payments: pays, paid: full || !!(i && i.paid && pays.length === (i.payments || []).length), date: i ? i.date : today() }
    onSave(cur === 'UZS' ? { ...base, amount: a } : { ...base, amount: Math.max(1, Math.round(a * rate)), cur, orig: a, rate })
  }
  return (
    <Modal onClose={onClose}>
      <h3>{i ? t('debt_edit') : t('debt_add')}</h3>
      <div className="seg"><button className={dir === 'in' ? 'on' : ''} onClick={() => setDir('in')}>{t('debt_in')}</button><button className={dir === 'out' ? 'on' : ''} onClick={() => setDir('out')}>{t('debt_out')}</button></div>
      <label>{t('who')}</label><input value={who} onChange={e => setWho(e.target.value)} maxLength={40} />
      <label>{t('debt_phone')}</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} placeholder="+998..." />
      <label>{t('amount')}</label>
      <div className="amt">
        <input type="number" inputMode={cur === 'UZS' ? 'numeric' : 'decimal'} step="any" min="0" value={amount} onChange={e => setAmount(e.target.value)} />
        <select value={cur} disabled={pays.length > 0} onChange={e => setCur(e.target.value)} aria-label={t('currency')}>
          {choices(settings, rates, i && i.cur).map(c => <option key={c} value={c}>{c === 'UZS' ? t('unit') : c}</option>)}
        </select>
      </div>
      {cur !== 'UZS' && a > 0 && rate > 0 && <div className="hint">{t('conv_prev', { n: fmt(Math.round(a * rate)), c: cur, r: fmtRate(rate) })}</div>}
      <label>{t('due_opt')}</label><input type="date" value={due} onChange={e => setDue(e.target.value)} />
      <label>{t('note')}</label><input value={note} onChange={e => setNote(e.target.value)} maxLength={80} />
      {i && <>
        <h4 className="sec">{t('debt_pays', { n: money(left, cur) })}</h4>
        {pays.map((p, k) => <div className="lrow" key={k}><span>{p.d}</span><div>{money(p.a, cur)} <button className="x" onClick={() => setPays(pays.filter((_, j) => j !== k))}>✕</button></div></div>)}
        <div className="two" style={{ marginTop: 8 }}>
          <input type="number" inputMode="decimal" step="any" min="0" placeholder={t('debt_pay_ph')} value={pa} onChange={e => setPa(e.target.value)} style={{ marginTop: 0 }} />
          <button className="btn s" style={{ marginTop: 0 }} onClick={addPay}>{t('debt_pay_btn')}</button>
        </div>
        {dir === 'in' && left > 0 && <div className="two" style={{ marginTop: 8 }}>
          <button className="btn s" style={{ marginTop: 0 }} onClick={() => copy(remindText(who, money(left, cur), due))}>{t('debt_remind')}</button>
          {phone && <a className="btn s" style={{ marginTop: 0, textAlign: 'center', textDecoration: 'none' }} href={`sms:${phone.replace(/\s/g, '')}?body=${encodeURIComponent(remindText(who, money(left, cur), due))}`}>💬 SMS</a>}
        </div>}
      </>}
      <div className="err">{err}</div>
      <button className="btn" onClick={save}>{t('save')}</button>
    </Modal>
  )
}

export default function Debts({ data, updData }) {
  const rates = useContext(RatesCtx)
  const [tab, setTab] = useState('active')
  const [modal, setModal] = useState(null)
  const [toast, setToast] = useState(null)
  const act = data.debts.filter(d => !d.paid)
  const list = data.debts.filter(d => (tab === 'paid' ? d.paid : !d.paid)).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
  const sum = dir => act.filter(d => d.dir === dir).reduce((a, d) => a + debtLeftUzs(d, rates), 0)
  const people = Object.values(act.reduce((m, d) => {
    const k = d.who.toLowerCase(), o = m[k] || (m[k] = { who: d.who, inn: 0, out: 0, n: 0, due: '' }), v = debtLeftUzs(d, rates)
    d.dir === 'in' ? (o.inn += v) : (o.out += v); o.n++; if (d.due && (!o.due || d.due < o.due)) o.due = d.due
    return m
  }, {})).map(o => ({ ...o, net: o.inn - o.out })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net))
  const save = d => { updData(x => { const i = x.debts.findIndex(y => y.id === d.id); i >= 0 ? (x.debts[i] = d) : x.debts.push(d) }); setModal(null) }
  const togglePaid = d => updData(x => { const y = x.debts.find(z => z.id === d.id); if (y) y.paid = !y.paid })
  const del = d => { updData(x => { x.debts = x.debts.filter(y => y.id !== d.id) }); setToast({ msg: t('debt_deleted'), undo: () => updData(x => { x.debts.push(d) }) }) }

  return (
    <>
      <div className="g2" style={{ marginBottom: 14 }}>
        <div className="card"><span className="mut">{t('debt_in')}</span><div className="big pos">{fmt(sum('in'))}</div></div>
        <div className="card"><span className="mut">{t('debt_out')}</span><div className="big neg">{fmt(sum('out'))}</div></div>
      </div>
      <div className="card fitcard dcard">
        <div className="seg">
          <button className={tab === 'active' ? 'on' : ''} onClick={() => setTab('active')}>{t('active')}</button>
          <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>{t('tab_people')}</button>
          <button className={tab === 'paid' ? 'on' : ''} onClick={() => setTab('paid')}>{t('paid_tab')}</button>
        </div>
        <div className="scrollbox">
          {tab === 'people' ? (people.length ? people.map(o => (
            <div className="op" key={o.who}>
              <div className="ic">{o.who[0].toUpperCase()}</div>
              <div className="t"><b>{o.who}</b><span>{t('p_cnt', { n: o.n })}{o.inn ? ' · ' + t('p_in', { v: fmt(o.inn) }) : ''}{o.out ? ' · ' + t('p_out', { v: fmt(o.out) }) : ''}{o.due ? ' · ' + o.due : ''}</span></div>
              <strong className={o.net >= 0 ? 'pos' : 'neg'}>{o.net >= 0 ? '+' : '−'}{fmt(Math.abs(o.net))}</strong>
              {o.net > 0 && <button className="sm" onClick={() => copy(remindText(o.who, fmt(o.net) + ' ' + t('unit'), o.due))}>📋</button>}
            </div>
          )) : <div className="empty">{t('no_active_debts')}</div>) : list.length ? list.map(d => {
            const late = !d.paid && d.due && d.due < today(), ps = debtPaid(d), pc = Math.min(100, Math.round((ps / debtBase(d)) * 100))
            return (
              <div className="op click" key={d.id} onClick={() => setModal({ initial: d })}>
                <div className="ic">{d.dir === 'in' ? '📥' : '📤'}</div>
                <div className="t"><b>{d.who}</b><span className={late ? 'neg' : ''}>{d.dir === 'in' ? t('debt_in_s') : t('debt_out_s')}{d.due ? ' · ' + d.due : ''}{late ? ' · ' + t('overdue') : ''}</span>
                  {ps > 0 && !d.paid && <div className="mbar"><i style={{ width: pc + '%' }} /></div>}
                  {d.note && <span className="n">{d.note}</span>}</div>
                <div style={{ textAlign: 'right' }}>
                  <strong className={d.dir === 'in' ? 'pos' : 'neg'}>{d.cur ? fmtCur(d.paid ? d.orig : debtLeft(d), d.cur) : fmt(d.paid ? d.amount : debtLeft(d))}</strong>
                  {d.cur && !d.paid && <span className="dl mut" title={t('debt_live')}>≈ {fmt(debtLeftUzs(d, rates))} {t('unit')}</span>}
                </div>
                <button className="sm" onClick={e => { e.stopPropagation(); togglePaid(d) }}>{d.paid ? '↩' : '✓'}</button>
                <button className="x" onClick={e => { e.stopPropagation(); del(d) }}>✕</button>
              </div>
            )
          }) : <div className="empty">{tab === 'active' ? t('no_active_debts') : t('no_paid_debts')}</div>}
        </div>
        <button className="btn" onClick={() => setModal({})}>{t('debt_add_btn')}</button>
      </div>
      {modal && <DebtModal initial={modal.initial} settings={data.settings} onClose={() => setModal(null)} onSave={save} />}
      {toast && <Toast msg={toast.msg} onUndo={toast.undo} onClose={() => setToast(null)} />}
    </>
  )
}
