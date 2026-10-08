import { useRef, useState } from 'react'
import { Api } from '../storage.js'
import Ava from './Ava.jsx'
import Extras from './Extras.jsx'
import { catLabel, t } from '../i18n.js'
import { MONTHS_S } from '../i18n.js'
import { catsFor, fmt, report, today } from '../utils.js'

const EMOJI = ['', '😎', '🦁', '🐼', '🦊', '🚀', '💎', '🌟', '🔥', '🍀']
const COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#a855f7', '#ec4899', '#1a1b1f']

export default function Profile({ user, data, lang, onLang, setUser, updData, replaceData, logout }) {
  const st = data.settings
  const [name, setName] = useState(user.name)
  const [budget, setBudget] = useState(st.budget || '')
  const [op, setOp] = useState('')
  const [np, setNp] = useState('')
  const [err, setErr] = useState('')
  const file = useRef()
  const [ct, setCt] = useState('out')
  const [cn, setCn] = useState('')
  const [ce, setCe] = useState('')
  const outCats = catsFor(st, 'out')
  const [lim, setLim] = useState(() => ({ ...(st.catLimits || {}) }))
  const set = patch => updData(d => { Object.assign(d.settings, patch) })

  const n = new Date(), r = report(data.tx, n.getFullYear(), n.getMonth())
  const first = data.tx.length ? data.tx.map(x => x.date).sort()[0] : null
  const big = data.tx.filter(x => x.type === 'out').sort((a, b) => b.amount - a.amount)[0]
  const unit = t('unit')
  const stat = [
    [t('p_ops'), data.tx.length],
    [t('p_first'), first || '—'],
    [t('p_avg', { m: MONTHS_S()[n.getMonth()] }), fmt(r.exp / n.getDate()) + ' ' + unit],
    [t('p_big'), big ? fmt(big.amount) + ' ' + unit : '—'],
    [t('p_topcat'), r.cats[0] ? catLabel(r.cats[0].name) : '—'],
    [t('savings'), data.goal.target ? Math.min(100, Math.round((data.goal.saved / data.goal.target) * 100)) + '%' : '—'],
  ]

  const addCat = () => {
    const nm = cn.trim().slice(0, 40)
    if (!nm) return
    if (nm in catsFor(st, ct)) return alert(t('cat_exists'))
    set({ cats: { ...st.cats, [ct]: { ...st.cats[ct], [nm]: ce.trim().slice(0, 4) || '🏷️' } } })
    setCn(''); setCe('')
  }
  const delCat = (type, nm) => {
    if (!confirm(t('cat_del_q', { n: nm }))) return
    const o = { ...st.cats[type] }; delete o[nm]
    const l = { ...(st.catLimits || {}) }; if (type === 'out') delete l[nm]
    set({ cats: { ...st.cats, [type]: o }, catLimits: l })
  }
  const saveLim = () => {
    const o = {}
    for (const [k, v] of Object.entries(lim)) if (+v > 0 && k in outCats) o[k] = +v
    set({ catLimits: o })
  }
  const saveName = async () => { if (name.trim()) try { setUser(await Api.saveName(name.trim())) } catch (e) { alert(e.message) } }
  const changePass = async () => { try { await Api.changePassword(op, np); setOp(''); setNp(''); setErr(''); alert(t('pass_ok')) } catch (e) { setErr(e.message) } }
  const exportJson = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    a.download = `moliya-${user.login}-${today()}.json`; a.click()
  }
  const importJson = e => {
    const f = e.target.files[0]; if (!f) return
    const rd = new FileReader()
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result); if (!Array.isArray(j.tx)) throw 0
        if (confirm(t('restore_q'))) replaceData({ tx: j.tx, debts: j.debts || [], rec: j.rec || [], goal: j.goal || { target: 0, saved: 0 }, settings: { ...st, ...(j.settings || {}), lang: st.lang } })
      } catch { alert(t('bad_file')) }
    }
    rd.readAsText(f)
    e.target.value = ''
  }

  return (
    <div className="pgrid">
      <div className="col">
        <div className="card phead">
          <Ava user={user} settings={st} size={72} />
          <div><h2>{user.name}</h2><span className="mut">@{user.login}{user.role === 'admin' ? ' · admin' : ''}</span></div>
        </div>
        <div className="card">
          <h3 className="h">{t('personal')}</h3>
          <label>{t('name')}</label><input value={name} onChange={e => setName(e.target.value)} />
          <button className="btn" onClick={saveName}>{t('save_name')}</button>
        </div>
        <div className="card">
          <h3 className="h">{t('look')}</h3>
          <label>{t('language')}</label>
          <div className="seg"><button className={lang === 'uz' ? 'on' : ''} onClick={() => onLang('uz')}>O'zbekcha</button><button className={lang === 'ru' ? 'on' : ''} onClick={() => onLang('ru')}>Русский</button></div>
          <label>{t('avatar')}</label>
          <div className="chips">{EMOJI.map(e => <button key={e} className={'chip' + (st.emoji === e ? ' on' : '')} onClick={() => set({ emoji: e })}>{e || 'Aa'}</button>)}</div>
          <label>{t('accent')}</label>
          <div className="chips">{COLORS.map(c => <button key={c} className={'sw' + (st.color === c ? ' on' : '')} style={{ background: c }} onClick={() => set({ color: c })} />)}</div>
          <label>{t('theme')}</label>
          <div className="seg"><button className={st.theme === 'light' ? 'on' : ''} onClick={() => set({ theme: 'light' })}>{t('light')}</button><button className={st.theme === 'dark' ? 'on' : ''} onClick={() => set({ theme: 'dark' })}>{t('dark')}</button></div>
        </div>
        <div className="card">
          <h3 className="h">{t('month_budget')}</h3>
          <label>{t('budget_lbl')}</label><input type="number" value={budget} onChange={e => setBudget(e.target.value)} />
          <button className="btn" onClick={() => set({ budget: Math.max(0, +budget || 0) })}>{t('save_limit')}</button>
        </div>
        <div className="card">
          <h3 className="h">{t('categories')}</h3>
          <div className="seg"><button className={ct === 'out' ? 'on' : ''} onClick={() => setCt('out')}>{t('expense')}</button><button className={ct === 'in' ? 'on' : ''} onClick={() => setCt('in')}>{t('income')}</button></div>
          <label>{t('new_cat')}</label>
          <div className="two"><input placeholder={t('cat_name')} maxLength={40} value={cn} onChange={e => setCn(e.target.value)} /><input placeholder="😀" maxLength={4} value={ce} onChange={e => setCe(e.target.value)} /></div>
          <button className="btn" onClick={addCat}>+ {t('add')}</button>
          {Object.keys((st.cats || {})[ct] || {}).length > 0 && <div className="chips" style={{ marginTop: 10 }}>
            {Object.entries(st.cats[ct]).map(([nm, e]) => <button key={nm} className="chip" title={t('delete')} onClick={() => delCat(ct, nm)}>{e} {nm} ✕</button>)}
          </div>}
        </div>
        <div className="card">
          <h3 className="h">{t('cat_lim_title')}</h3>
          <p className="mut" style={{ marginTop: 4 }}>{t('cat_lim_hint')}</p>
          {Object.entries(outCats).map(([c, e]) => (
            <div className="two" key={c} style={{ marginTop: 8, alignItems: 'center' }}>
              <span>{e} {catLabel(c)}</span>
              <input type="number" inputMode="numeric" min="0" placeholder="0" value={lim[c] || ''} onChange={ev => setLim({ ...lim, [c]: ev.target.value })} />
            </div>
          ))}
          <button className="btn" onClick={saveLim}>{t('cat_lim_save')}</button>
        </div>
      </div>
      <div className="col">
        <div className="card">
          <h3 className="h">{t('stats')}</h3>
          <div className="stats">{stat.map(([k, v]) => <div key={k}><span className="mut">{k}</span><b>{v}</b></div>)}</div>
        </div>
        <Extras user={user} data={data} updData={updData} />
        <div className="card">
          <h3 className="h">{t('pass_change')}</h3>
          <label>{t('pass_cur')}</label><input type="password" value={op} onChange={e => setOp(e.target.value)} />
          <label>{t('pass_new')}</label><input type="password" value={np} onChange={e => setNp(e.target.value)} />
          <div className="err">{err}</div>
          <button className="btn" onClick={changePass}>{t('update')}</button>
        </div>
        <div className="card">
          <h3 className="h">{t('data_title')}</h3>
          <p className="mut" style={{ marginTop: 4 }}>ℹ️ {t('admin_sees')}</p>
          <p className="mut" style={{ marginTop: 4 }}>{t('server_mode')}</p>
          <button className="btn s" onClick={exportJson}>{t('backup')}</button>
          <button className="btn s" onClick={() => file.current.click()}>{t('restore')}</button>
          <input type="file" accept=".json" hidden ref={file} onChange={importJson} />
        </div>
        <button className="btn danger" onClick={logout}>{t('logout')}</button>
      </div>
    </div>
  )
}
