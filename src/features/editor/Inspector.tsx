import { useState } from 'react'
import { ArrowUpRight, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react'
import type { BoardObject, Connection, FrameCommand, ObjectColor } from '../../domain/types'

const colors: { color: ObjectColor; label: string }[] = [
  { color: 'paper', label: 'Песочный' }, { color: 'blue', label: 'Кобальтовый' },
  { color: 'mint', label: 'Зелёный' }, { color: 'peach', label: 'Персиковый' }, { color: 'lavender', label: 'Лавандовый' },
]

function NumberField({ label, value, minimum, onChange }: { label: string; value: number; minimum?: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return <label className="number-field">{label}<input type="number" aria-label={label} value={draft ?? String(Math.round(value))}
    onFocus={() => setDraft(String(Math.round(value)))} onChange={event => setDraft(event.target.value)}
    onBlur={() => {
      const next = Number(draft)
      if (draft !== null && draft.trim() && Number.isFinite(next) && (minimum === undefined || next >= minimum)) onChange(next)
      setDraft(null)
    }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
}

export function Inspector({ object, connection, dispatch }: { object?: BoardObject; connection?: Connection; dispatch: (command: FrameCommand) => void }) {
  if (!object && !connection) return <aside className="inspector inspector-empty">
    <div className="panel-heading"><SlidersHorizontal size={14} /> Свойства</div>
    <div className="inspector-empty-copy"><div className="inspector-empty-icon"><ArrowUpRight size={23} strokeWidth={1.2} /></div>
      <h3>У каждой детали<br />есть своё место</h3><p>Выберите объект на доске,<br />чтобы изменить текст, цвет<br />и размеры.</p></div>
    <div className="inspector-tip"><Sparkles size={14} /><p>Начните с простого.<br />Одна мысль — один блок.</p></div>
  </aside>
  if (connection) return <aside className="inspector">
    <div className="panel-heading"><SlidersHorizontal size={14} /> Связь</div>
    <div className="inspector-fields">
      <label className="field-label">Подпись связи<input value={connection.label} onChange={event => dispatch({
        type: 'connection.updated', id: connection.id, patch: { label: event.target.value },
      })} placeholder="Например, запрос" /></label>
      <p className="inspector-description">Стрелка останется связана с блоками, даже если их переместить.</p>
      <button className="delete-object" onClick={() => dispatch({ type: 'connection.deleted', id: connection.id })}><Trash2 size={14} /> Удалить связь</button>
    </div>
  </aside>
  const selected = object!
  const update = (patch: Partial<Omit<BoardObject, 'id' | 'type'>>) => dispatch({ type: 'object.updated', id: selected.id, patch })
  return <aside className="inspector">
    <div className="panel-heading"><SlidersHorizontal size={14} /> {selected.type === 'block' ? 'Блок' : 'Текст'}</div>
    <div className="inspector-fields">
      <label className="field-label">Текст объекта<textarea rows={4} value={selected.text} onChange={event => update({ text: event.target.value })}
        placeholder="Что вы хотите объяснить?" maxLength={5000} /></label>
      <div className="field-label color-field">Цвет<div className="color-options">
        {colors.map(item => <button key={item.color} className={'color-swatch swatch-' + item.color + (item.color === selected.color ? ' active' : '')}
          aria-label={'Цвет: ' + item.label} aria-pressed={item.color === selected.color} title={item.label} onClick={() => update({ color: item.color })} />)}
      </div></div>
      <div className="inspector-section-label">Положение</div>
      <div className="number-fields"><NumberField label="Позиция X" value={selected.x} onChange={x => update({ x })} />
        <NumberField label="Позиция Y" value={selected.y} onChange={y => update({ y })} /></div>
      <div className="inspector-section-label">Размер</div>
      <div className="number-fields"><NumberField label="Ширина" value={selected.width} minimum={40} onChange={width => update({ width })} />
        <NumberField label="Высота" value={selected.height} minimum={24} onChange={height => update({ height })} /></div>
      <div className="inspector-bottom"><span>Изменения сохраняются автоматически</span>
        <button className="delete-object" onClick={() => dispatch({ type: 'object.deleted', id: selected.id })}><Trash2 size={14} /> Удалить объект</button></div>
    </div>
  </aside>
}
