export default function LangSwitch({ lang, onLang }) {
  return (
    <div className="langsw">
      <button className={lang === 'uz' ? 'on' : ''} onClick={() => onLang('uz')}>UZ</button>
      <button className={lang === 'ru' ? 'on' : ''} onClick={() => onLang('ru')}>RU</button>
    </div>
  )
}
