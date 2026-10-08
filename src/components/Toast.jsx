import { useEffect } from 'react'
import { t } from '../i18n.js'

export default function Toast({ msg, onUndo, onClose }) {
  useEffect(() => { const tm = setTimeout(onClose, 6000); return () => clearTimeout(tm) }, [msg])
  return <div className="toast"><span>{msg}</span><button onClick={() => { onUndo(); onClose() }}>{t('undo')}</button></div>
}
