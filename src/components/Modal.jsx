export default function Modal({ onClose, children, wide }) {
  return (
    <div className="ov" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={'md' + (wide ? ' wide' : '')}>{children}</div>
    </div>
  )
}
