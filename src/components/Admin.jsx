import { useEffect, useState } from 'react'
import { Api } from '../storage.js'
import Modal from './Modal.jsx'
import OpRow from './OpRow.jsx'
import { t } from '../i18n.js'
import { fmtCur } from '../rates.js'
import { ago, catsFor, dtm, fmt, online, sortTx, stats } from '../utils.js'

const evLabel = e => { const s = t('ev_' + e); return s === 'ev_' + e ? e : s }
const LogRow = ({ x, who }) => (
  <div className="lrow"><span className="mut">{dtm(x.t)}</span><div><b>{who && x.u + ' · '}{evLabel(x.e)}</b>{x.d && <div className="mut">{x.d}</div>}</div></div>
)

function UserView({ login, onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { Api.adminData(login).then(setD).catch(e => setErr(e.message)) }, [login])
  const s = d && stats(d.tx)
  return (
    <Modal onClose={onClose} wide>
      <h3>{d ? d.user.name : login} <span className="mut">@{login}</span></h3>
      {err && <div className="err">{err}</div>}
      {!d && !err && <div className="empty">{t('loading')}</div>}
      {d && <>
        <p className="mut">{t('a_last', { d: dtm(d.user.lastLogin), n: d.user.logins, a: ago(d.user.lastSeen) })}</p>
        <div className="stats">
          <div><span className="mut">{t('a_bal')}</span><b>{fmt(s.bal)}</b></div>
          <div><span className="mut">{t('a_minc')}</span><b className="pos">+{fmt(s.inc)}</b></div>
          <div><span className="mut">{t('a_mexp')}</span><b className="neg">−{fmt(s.exp)}</b></div>
          <div><span className="mut">{t('p_ops')}</span><b>{d.tx.length}</b></div>
        </div>
        {d.goal.target > 0 && <p className="mut" style={{ marginTop: 10 }}>{t('savings')}: {fmt(d.goal.saved)} / {fmt(d.goal.target)}</p>}
        <h4 className="sec">{t('recent_ops')}</h4>
        <div className="mscroll">{d.tx.length ? sortTx(d.tx).slice(0, 30).map(x => <OpRow key={x.id} tx={x} cats={catsFor(d.settings, x.type)} />) : <div className="empty">{t('none')}</div>}</div>
        {d.debts.length > 0 && <>
          <h4 className="sec">{t('a_debts_h')}</h4>
          {d.debts.map(x => <div className="lrow" key={x.id}><span>{x.dir === 'in' ? '📥' : '📤'}</span><div><b>{x.who}</b> · {x.cur ? fmtCur(x.orig, x.cur) + ' ≈ ' : ''}{fmt(x.amount)} {t('unit')}{x.paid ? ' ' + t('a_paid') : ''}{x.due ? ' · ' + x.due : ''}</div></div>)}
        </>}
        <h4 className="sec">{t('a_hist')}</h4>
        <div className="mscroll">{d.log.length ? d.log.map((x, i) => <LogRow key={i} x={x} />) : <div className="empty">{t('none')}</div>}</div>
      </>}
    </Modal>
  )
}

export default function Admin() {
  const [tab, setTab] = useState('users')
  const [users, setUsers] = useState([])
  const [log, setLog] = useState([])
  const [view, setView] = useState(null)
  const [n, setN] = useState('')
  const [l, setL] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [ann, setAnn] = useState('')
  const [annCur, setAnnCur] = useState(null)
  const load = () => Api.users().then(setUsers).catch(e => setErr(e.message))
  useEffect(() => { load(); const tm = setInterval(load, 30000); return () => clearInterval(tm) }, [])
  useEffect(() => { if (tab === 'log') { const f = () => Api.adminLog('', 150).then(setLog).catch(e => setErr(e.message)); f(); const tm = setInterval(f, 30000); return () => clearInterval(tm) } }, [tab])

  useEffect(() => { if (tab === 'ann') Api.getAnnounce().then(a => { setAnnCur(a); setAnn(a ? a.text : '') }).catch(e => setErr(e.message)) }, [tab])
  const sendAnn = async clear => { try { await Api.setAnnounce(clear ? '' : ann); setAnnCur(clear ? null : { text: ann }); if (clear) setAnn(''); setErr(''); alert(clear ? t('a_ann_off') : t('a_ann_sent')) } catch (e) { setErr(e.message) } }
  const create = async () => {
    try { await Api.createUser({ name: n, login: l, password: p }); setN(''); setL(''); setP(''); setErr(''); load() } catch (e) { setErr(e.message) }
  }
  const reset = async login => {
    const pw = prompt(t('a_newpass_q')); if (!pw) return
    try { await Api.resetPassword(login, pw); alert(t('pass_ok')) } catch (e) { alert(e.message) }
  }
  const block = async u => { try { await Api.blockUser(u.login, !u.disabled); load() } catch (e) { alert(e.message) } }
  const del = async login => {
    if (!confirm(t('a_del_q', { l: login }))) return
    try { await Api.deleteUser(login); load() } catch (e) { alert(e.message) }
  }
  const on = users.filter(u => online(u.lastSeen)).length
  const day = users.filter(u => Date.now() - u.lastSeen < 864e5).length

  return (
    <>
      <div className="g4">
        <div className="card"><span className="mut">{t('a_users')}</span><div className="big">{users.length}</div></div>
        <div className="card"><span className="mut">{t('a_online')}</span><div className="big pos">{on}</div></div>
        <div className="card"><span className="mut">{t('a_24h')}</span><div className="big">{day}</div></div>
        <div className="card"><span className="mut">{t('a_total_ops')}</span><div className="big">{users.reduce((a, u) => a + u.txCount, 0)}</div></div>
      </div>
      <div className="seg"><button className={tab === 'users' ? 'on' : ''} onClick={() => setTab('users')}>{t('a_users')}</button><button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>{t('a_activity')}</button><button className={tab === 'ann' ? 'on' : ''} onClick={() => setTab('ann')}>{t('a_ann')}</button><button className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>{t('a_new')}</button></div>
      {err && tab !== 'new' && <div className="err">{err}</div>}
      {tab === 'new' && (
        <div className="card">
          <label style={{ margin: 0 }}>{t('name')}</label><input value={n} onChange={e => setN(e.target.value)} />
          <label>{t('login')}</label><input value={l} onChange={e => setL(e.target.value)} />
          <label>{t('a_pass_lbl')}</label><input value={p} onChange={e => setP(e.target.value)} />
          <div className="err">{err}</div>
          <button className="btn" onClick={create}>{t('a_create')}</button>
        </div>
      )}
      {tab === 'ann' && (
        <div className="card">
          <p className="mut">{t('a_ann_hint')}</p>
          <textarea className="ta" maxLength={300} value={ann} onChange={e => setAnn(e.target.value)} placeholder={t('a_ann_ph')} />
          <div className="two"><button className="btn" onClick={() => sendAnn(false)}>{t('a_ann_send')}</button><button className="btn s" onClick={() => sendAnn(true)}>{t('delete')}</button></div>
          {annCur && <p className="mut" style={{ marginTop: 10 }}>{t('a_ann_cur', { t: annCur.text })}</p>}
        </div>
      )}
      {tab === 'users' && (
        <div className="card">
          {users.map(u => (
            <div className="urow" key={u.login}>
              <i className={'udot' + (online(u.lastSeen) ? ' on' : '')} />
              <div className="uinfo">
                <b>{u.name}</b> {u.disabled && <em className="neg">{t('a_blocked')}</em>}<br />
                <span className="mut">@{u.login}{u.role === 'admin' ? ' · admin' : ''} · {t('a_row1', { d: dtm(u.lastLogin), n: u.logins, a: ago(u.lastSeen) })}</span><br />
                <span className="mut">{t('a_row2', { n: u.txCount, b: fmt(u.balance) })}</span>
              </div>
              <div className="uact">
                <button className="sm" onClick={() => setView(u.login)}>{t('a_open')}</button>
                <button className="sm" onClick={() => reset(u.login)}>{t('a_pass')}</button>
                {u.role !== 'admin' && <button className="sm" onClick={() => block(u)}>{u.disabled ? t('a_unblock') : t('a_block')}</button>}
                {u.role !== 'admin' && <button className="sm" onClick={() => del(u.login)}>{t('delete')}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'log' && <div className="card">{log.length ? log.map((x, i) => <LogRow key={i} x={x} who />) : <div className="empty">{t('a_nolog')}</div>}</div>}
      {view && <UserView login={view} onClose={() => setView(null)} />}
    </>
  )
}
