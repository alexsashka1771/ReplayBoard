import type { BoardObject } from '../../domain/types'
import { completeText, graphemes } from '../../playback/presentation'
import type { TextReveal } from '../../playback/presentation'

export function LiveText({ reveal }: { reveal: TextReveal }) {
  const characters = reveal.caret ? graphemes(reveal.before) : []
  return <>
    <span>{reveal.caret ? characters.slice(0, -1).join('') : reveal.before}</span>
    {reveal.caret ? <span className="caret-anchor">{characters.at(-1) ?? ''}<i className="typing-caret" aria-hidden="true" /></span> : null}
    {reveal.hidden ? <span className="text-pending" aria-hidden="true">{reveal.hidden}</span> : null}
    {reveal.after ? <span>{reveal.after}</span> : null}
  </>
}

export function BoardText({ object, reveal }: { object: BoardObject; reveal?: TextReveal }) {
  const text = reveal ?? completeText(object.text || (object.type === 'block' ? 'Блок' : 'Текст'))
  return <foreignObject width={object.width} height={object.height} pointerEvents="none">
    <div className={'object-copy object-copy-' + object.type + ' object-copy-' + object.color}>
      <div className="object-copy-content"><LiveText reveal={text} /></div>
    </div>
  </foreignObject>
}
