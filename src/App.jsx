import { useEffect, useRef, useState } from 'react'
import { Api } from './storage.js'
import Login from './components/Login.jsx'
import Home from './components/Home.jsx'
import Operations from './components/Operations.jsx'
import Debts from './components/Debts.jsx'
import Reports from './components/Reports.jsx'
import DayReport from './components/DayReport.jsx'
import Rates from './components/Rates.jsx'
import Profile from './components/Profile.jsx'
import Admin from './components/Admin.jsx'
import Ava from './components/Ava.jsx'
import Bell from './components/Bell.jsx'
import LangSwitch from './components/LangSwitch.jsx'
import { getLang, saveLang, setLangVar, t } from './i18n.js'
import { RatesCtx, cachedRates, loadRates } from './rates.js'
import Lock from './components/Lock.jsx'
import { hasPin } from './pin.js'
import { DEF_SET, genRec, norm, setPrivacy, today } from './utils.js'
import { installApp, useInstall } from './install.js'

// [ключ, иконка, подпись в меню, короткая подпись для нижней панели телефона]
const NAV = [['home', '🏠', 'n_home', 'n_home_s'], ['ops', '📋', 'n_ops', 'n_ops_s'], ['report', '📊', 'n_report', 'n_report'], ['daily', '🗓', 'n_daily', 'n_daily_s'], ['rates', '💱', 'n_rates', 'n_rates'], ['debts', '🤝', 'n_debts', 'n_debts'], ['profile', '👤', 'n_profile', 'n_profile']]
const lum = c => { const n = parseInt(c.slice(1), 16); return (((n >> 16) * 299) + (((n >> 8) & 255) * 587) + ((n & 255) * 114)) / 1000 }
const sig = d => JSON.stringify([d.tx, d.debts, d.rec, d.goal, d.settings, d.announce])
const S = x => JSON.stringify(x)

// Разница между старым и новым состоянием -> отдельные запросы (добавить/изменить/удалить запись)
function diffOps(a, b) {
  const ops = []
  for (const [col, key] of [['tx', 'tx'], ['debt', 'debts'], ['rec', 'rec']]) {
    const old = new Map(a[key].map(x => [x.id, S(x)])), cur = new Set()
    for (const x of b[key]) { cur.add(x.id); if (old.get(x.id) !== S(x)) ops.push(() => Api.item(col, x)) }
    for (const id of old.keys()) if (!cur.has(id)) ops.push(() => Api.delItem(col, id))
  }
  if (S(a.goal) !== S(b.goal)) ops.push(() => Api.saveProf({ goal: b.goal }))
  if (S(a.settings) !== S(b.settings)) ops.push(() => Api.saveProf({ settings: b.settings }))
  return ops
}

export default function App() {
  const [user, setUser] = useState(null)
  const [data, setData] = useState(null)
  const [ready, setReady] = useState(false)
  const [view, setView] = useState('home')
  const [day, setDay] = useState(today())
  const openDay = k => { setDay(k); setView('daily') }
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [lang, setLang] = useState(getLang())
  const [rates, setRates] = useState(cachedRates)
  const [rLoading, setRLoading] = useState(false)
  const [locked, setLocked] = useState(false)
  const inst = useInstall()
  const [hide, setHide] = useState(() => { try { return localStorage.getItem('fin_hide') === '1' } catch { return false } })
  setPrivacy(hide)
  const toggleHide = () => setHide(h => { const n = !h; try { localStorage.setItem('fin_hide', n ? '1' : '0') } catch {} return n })
  const [annSeen, setAnnSeen] = useState(() => localStorage.getItem('fin_ann_seen') || '')
  const hiddenAt = useRef(0)
  const dataRef = useRef(null), ver = useRef(0), pending = useRef(0), queue = useRef(Promise.resolve())

  setLangVar(lang) // модуль переводов читает язык при отрисовке
  useEffect(() => { saveLang(lang) }, [lang])

  const apply = d => { dataRef.current = d; setData(d); if (d.settings.lang === 'uz' || d.settings.lang === 'ru') setLang(d.settings.lang) }
  const reset = () => { setUser(null); setData(null); dataRef.current = null }
  const enter = async u => { const d = norm(await Api.getData()); ver.current++; apply(d); setUser(u); setView('home'); updData(genRec) }

  useEffect(() => {
    Api.init().then(() => {
      if (!Api.hasToken()) return
      return Api.me().then(async u => { await enter(u); if (hasPin(u.login)) setLocked(true) }).catch(async e => { if (e.status === 401 || e.status === 403) { await Api.logout(); setNotice(e.message) } else setNotice(e.message) })
    }).finally(() => setReady(true))
  }, [])

  // курсы валют: при входе, потом каждые 30 минут (сервер сам обновляет их раз в день)
  const reloadRates = async (force = false) => { setRLoading(true); const r = await loadRates(Api, force === true); if (r) setRates(r); setRLoading(false) }
  const uid = user && user.login
  useEffect(() => {
    if (!uid) return
    reloadRates()
    const tm = setInterval(reloadRates, 30 * 60 * 1000)
    return () => clearInterval(tm)
  }, [uid])

  // тема и акцентный цвет
  const st = data ? data.settings : DEF_SET
  useEffect(() => {
    const dark = st.theme === 'dark', acc = dark && lum(st.color) < 80 ? '#e5e7ee' : st.color, r = document.documentElement
    r.dataset.theme = st.theme
    r.style.setProperty('--acc', acc)
    r.style.setProperty('--acc-ink', lum(acc) > 160 ? '#111214' : '#ffffff')
  }, [st.theme, st.color])

  const onFail = e => {
    if (e.status === 401 || e.status === 403) { Api.logout(); reset(); setNotice(e.message) } else setErr(t('save_fail', { m: e.message }))
  }
  const run = op => { pending.current++; queue.current = queue.current.then(op).then(() => setErr('')).catch(onFail).finally(() => { pending.current-- }) }
  const updData = fn => {
    const cur = dataRef.current, n = structuredClone(cur)
    fn(n)
    const ops = diffOps(cur, n)
    if (!ops.length) return
    ver.current++; apply(n); ops.forEach(run)
  }
  const replaceData = d => { const n = norm(d); ver.current++; apply(n); run(() => Api.replaceAll(n)) }
  // язык: сохраняется в настройках аккаунта (на всех устройствах) и в браузере (для экрана входа)
  const changeLang = l => { setLang(l); if (dataRef.current) updData(d => { d.settings.lang = l }) }

  // подтягиваем изменения с других устройств (при возврате на вкладку и раз в 45 секунд)
  useEffect(() => {
    if (!user) return
    const refresh = async () => {
      if (document.hidden || pending.current > 0) return
      const v = ver.current
      try {
        const d = norm(await Api.getData())
        if (v !== ver.current || pending.current > 0) return
        if (sig(d) !== sig(dataRef.current)) { apply(d); updData(genRec) }
      } catch (e) { if (e.status === 401 || e.status === 403) onFail(e) }
    }
    const tm = setInterval(refresh, 45000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(tm); document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [user])

  // PIN: блокируем после 2 минут в фоне
  useEffect(() => {
    if (!user) return
    const f = () => {
      if (document.hidden) hiddenAt.current = Date.now()
      else if (hasPin(user.login) && hiddenAt.current && Date.now() - hiddenAt.current > 120000) setLocked(true)
    }
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [user])

  const login = async (l, p) => { await enter(await Api.login(l, p)); setNotice('') }
  const logout = async () => { await Api.logout(); reset() }

  if (!ready) return <div className="empty" style={{ marginTop: '30vh' }}>{t('loading')}</div>
  if (!user) return <Login onLogin={login} notice={notice} lang={lang} onLang={changeLang} />

  if (locked) return <Lock user={user} onUnlock={() => setLocked(false)} onLogout={async () => { setLocked(false); await logout() }} />
  const ann = data.announce && String(data.announce.id) !== annSeen ? data.announce : null
  const nav = user.role === 'admin' ? [...NAV, ['admin', '🛠', 'n_admin', 'n_admin']] : NAV
  const titles = { home: t('hello', { name: user.name }), ops: t('n_ops'), report: t('h_report'), daily: t('h_daily'), rates: t('h_rates'), debts: t('n_debts'), profile: t('n_profile'), admin: t('h_admin') }

  return (
    <RatesCtx.Provider value={rates}>
      <div className="shell">
        {err && <div className="banner">{err}</div>}
        <aside className="side">
          <div className="logo">💸 {t('app')}</div>
          {nav.map(([k, i, n]) => <button key={k} className={'nv' + (view === k ? ' on' : '')} onClick={() => setView(k)}><span>{i}</span>{t(n)}</button>)}
          {inst.canPrompt && !inst.standalone && <button className="nv" onClick={installApp}><span>📲</span>{t('inst_btn')}</button>}
          <div className="me" onClick={() => setView('profile')}>
            <Ava user={user} settings={st} size={38} />
            <div><b>{user.name}</b><br /><span className="mut">@{user.login}</span></div>
          </div>
        </aside>
        <main className="main">
          <div className={'wrap' + (view === 'home' ? ' fit' : '')} key={view}>
            <div className="top">
              <h1>{titles[view]}</h1>
              <div className="tr">
                <Bell data={data} go={setView} />
                <button className={'eye' + (hide ? ' on' : '')} title={hide ? t('show_amt') : t('hide_amt')} aria-label={hide ? t('show_amt') : t('hide_amt')} onClick={toggleHide}>{hide ? '🙈' : '👁'}</button>
                <LangSwitch lang={lang} onLang={changeLang} />
                <button className="lo" title={t('logout')} aria-label={t('logout')} onClick={() => confirm(t('logout') + '?') && logout()}>⎋</button>
                <Ava user={user} settings={st} onClick={() => setView('profile')} />
              </div>
            </div>
            {ann && <div className="annc"><span>📢 {ann.text}</span><button onClick={() => { localStorage.setItem('fin_ann_seen', String(ann.id)); setAnnSeen(String(ann.id)) }}>✕</button></div>}
            {view === 'home' && <Home data={data} updData={updData} go={setView} openDay={openDay} />}
            {view === 'ops' && <Operations data={data} updData={updData} />}
            {view === 'report' && <Reports data={data} />}
            {view === 'daily' && <DayReport data={data} updData={updData} day={day} setDay={setDay} />}
            {view === 'rates' && <Rates data={data} updData={updData} reload={reloadRates} loading={rLoading} />}
            {view === 'debts' && <Debts data={data} updData={updData} />}
            {view === 'profile' && <Profile user={user} data={data} lang={lang} onLang={changeLang} setUser={setUser} updData={updData} replaceData={replaceData} logout={logout} />}
            {view === 'admin' && user.role === 'admin' && <Admin />}
          </div>
        </main>
        <nav className="bottom">
          {nav.map(([k, i, , s]) => <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}><span>{i}</span>{t(s)}</button>)}
        </nav>
      </div>
    </RatesCtx.Provider>
  )
}
