export default function Ava({ user, settings, size = 44, onClick }) {
  return (
    <button className="ava" onClick={onClick} style={{ width: size, height: size, fontSize: size * 0.45, background: settings.emoji ? 'var(--soft)' : 'var(--acc)', color: settings.emoji ? 'inherit' : 'var(--acc-ink)' }}>
      {settings.emoji || (user.name[0] || '?').toUpperCase()}
    </button>
  )
}
