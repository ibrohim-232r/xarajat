import { catLabel } from '../i18n.js'
import { fmtCur } from '../rates.js'
import { CAT, dstr, fmt } from '../utils.js'

export default function OpRow({ tx, cats, onDelete, onEdit }) {
  return (
    <div className={'op' + (onEdit ? ' click' : '')} onClick={onEdit}>
      <div className="ic">{(cats || CAT[tx.type])[tx.cat] || '•'}</div>
      <div className="t">
        <b>{catLabel(tx.cat)}</b><span>{dstr(tx.date)}</span>
        {tx.cur && <span className="n">{fmtCur(tx.orig, tx.cur)}</span>}
        {tx.note && <span className="n">{tx.note}</span>}
      </div>
      <strong className={tx.type === 'in' ? 'pos' : 'neg'}>{tx.type === 'in' ? '+' : '−'}{fmt(tx.amount)}</strong>
      {onDelete && <button className="x" onClick={e => { e.stopPropagation(); onDelete() }}>✕</button>}
    </div>
  )
}
