import { useState } from 'react'
import LangSwitch from './LangSwitch.jsx'
import { t } from '../i18n.js'

export default function Login({ onLogin, notice, lang, onLang }) {
  const [l, setL] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true); setErr('')
    try { await onLogin(l.trim().toLowerCase(), p) } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="login"><div className="card" style={{ position: 'relative' }}>
      <div style={{ position: 'absolute', top: 14, right: 14 }}><LangSwitch lang={lang} onLang={onLang} /></div>
      <h1 style={{ marginBottom: 6 }}>{t('app')}</h1>
      <p className="mut">{t('login_sub')}</p>
      <label>{t('login')}</label><input value={l} onChange={e => setL(e.target.value)} autoComplete="username" />
      <label>{t('password')}</label><input type="password" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} autoComplete="current-password" />
      <div className="err">{err || notice}</div>
      <button className="btn" onClick={submit} disabled={busy}>{busy ? '...' : t('sign_in')}</button>
      <p className="mut" style={{ marginTop: 12, fontSize: 12, textAlign: 'center' }}>{t('consent')}</p>
    </div></div>
  )
}
