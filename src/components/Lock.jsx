import { useState } from 'react'
import { t } from '../i18n.js'
import { checkPin } from '../pin.js'

export default function Lock({ user, onUnlock, onLogout }) {
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const go = async () => { if (await checkPin(user.login, v)) onUnlock(); else { setErr(t('lock_wrong')); setV('') } }
  return (
    <div className="login"><div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <h2 style={{ margin: '8px 0 4px' }}>{user.name}</h2>
      <p className="mut">{t('lock_title')}</p>
      <input type="password" inputMode="numeric" maxLength={6} autoFocus value={v} onChange={e => setV(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && go()} style={{ textAlign: 'center', fontSize: 22, letterSpacing: 8 }} />
      <div className="err">{err}</div>
      <button className="btn" onClick={go}>{t('lock_open')}</button>
      <button className="btn s" onClick={onLogout}>{t('logout')}</button>
    </div></div>
  )
}
