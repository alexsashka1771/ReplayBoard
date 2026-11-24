import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Copy, MicOff, Pause, Play, RotateCcw, X } from 'lucide-react'
import { Brand } from '../../components/ui/Brand'
import { Board } from '../../components/board/Board'
import type { BoardObject, Camera, RecordingSegment } from '../../domain/types'
import { PlaybackPresentation } from '../../playback/presentation'
import { PlaybackClock } from '../../playback/player'
import { useReducedMotion } from '../../components/ui/useReducedMotion'
import { formatTime } from '../../utils/format'

interface Props {
  title: string
  segment: RecordingSegment
  description?: string
  onHome: () => void
  onBack?: () => void
  onCopy?: () => void
}

export function PlayerScreen({ title, segment, description, onHome, onBack, onCopy }: Props) {
  const [player] = useState(() => new PlaybackClock(segment.durationMs))
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [viewCamera, setViewCamera] = useState<Camera | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const reducedMotion = useReducedMotion()
  const presentation = useMemo(() => new PlaybackPresentation(segment), [segment])
  const view = useMemo(() => presentation.at(position, reducedMotion), [presentation, position, reducedMotion])
  const frame = view.frame
  const inspected = selected ? frame.board.objects[selected] : null
  const marks = useMemo(() => segment.events.filter(event =>
    event.command.type === 'object.created' || event.command.type === 'connection.created' ||
    (event.command.type === 'object.updated' && event.command.patch.text !== undefined),
  ), [segment])
  const drawing = Object.values(view.connections).some(connection => connection.progress > 0 && connection.progress < 1)
  const typing = Object.values(view.texts).some(text => text.hidden.length > 0)

  const toggle = useCallback(() => {
    if (player.isPlaying()) player.pause()
    else { setViewCamera(null); setSelected(null); player.play() }
    setPosition(player.position())
    setPlaying(player.isPlaying())
  }, [player])

  useEffect(() => {
    if (!playing) return
    let animation = 0
    const tick = () => {
      setPosition(player.position())
      if (player.isPlaying()) animation = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    animation = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animation)
  }, [player, playing])

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (event.defaultPrevented || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' ||
          (target instanceof HTMLInputElement && target.type !== 'range') ||
          target.tagName === 'BUTTON') return
      if (event.key === ' ') { event.preventDefault(); toggle() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [toggle])

  function seek(next: number) {
    player.seek(next)
    setPosition(player.position())
    setPlaying(player.isPlaying())
    setViewCamera(null)
    setSelected(null)
  }

  const explore = useCallback((camera: Camera) => {
    player.pause()
    setPlaying(false)
    setPosition(player.position())
    setViewCamera(camera)
  }, [player])

  const inspect = useCallback((object: BoardObject | null) => {
    player.pause()
    setPlaying(false)
    setPosition(player.position())
    setSelected(object?.id ?? null)
  }, [player])

  return <div className="player-page">
    <header className="player-header"><Brand onClick={onHome} />
      <button className="text-button player-back" aria-label={onBack ? 'Вернуться в редактор' : 'Все истории'} onClick={onBack ?? onHome}><ArrowLeft size={15} /> {onBack ? 'Вернуться в редактор' : 'Все истории'}</button>
      {onCopy ? <button className="button secondary small copy-story" aria-label="Создать свою версию" title="Создать свою версию" onClick={onCopy}><Copy size={14} /><span>Создать свою версию</span></button> : <span className="player-header-label">Просмотр истории</span>}
    </header>
    <main className="player-content">
      <div className="player-intro"><div><h1>{title}</h1>
        <p className="story-summary">{description ?? 'Ход объяснения — в каждом действии. Остановитесь, чтобы рассмотреть детали.'}</p></div>
        <div className="player-story-meta"><span>{formatTime(segment.durationMs)}</span><span><MicOff size={12} /> Без голоса</span></div></div>
      <section className="player-stage" aria-label="Воспроизведение истории">
      <div className="player-board-shell">
        <Board frame={{ ...frame, camera: viewCamera ?? frame.camera, selection: selected ? [selected] : frame.selection }} effects={view}
          autoFit={viewCamera === null} focusId={view.focusId} onCameraChange={explore} onInspect={inspect} />
        <div className={'player-board-state' + (playing ? ' is-playing' : '')}>
          {playing ? <><span className="tiny-dot" /> {drawing ? 'Рисуем связь' : typing ? 'Пишем объяснение' : 'Воспроизведение'}</>
            : position === 0 ? <><Play size={12} /> Готово к просмотру</>
            : position >= segment.durationMs ? <><span className="tiny-dot" /> История завершена</>
            : <><Pause size={12} /> Пауза · можно исследовать</>}
        </div>
        {inspected ? <aside className="object-detail"><div><span>{inspected.type === 'block' ? 'Блок' : 'Пояснение'}</span>
          <button className="icon-button" aria-label="Скрыть детали объекта" onClick={() => setSelected(null)}><X size={14} /></button></div>
          <p>{inspected.text}</p></aside> : null}
      </div>
      <div className="player-transport">
        <div className="player-progress"><span>{formatTime(position)}</span><div className="player-scrubber">
          <div className="player-event-markers" aria-hidden="true">{marks.map(event => <i key={event.eventId}
            style={{ left: 100 * event.tMs / Math.max(segment.durationMs, 1) + '%' }} />)}</div>
          <input type="range" min="0" max={Math.max(segment.durationMs, 1)} step="1"
          value={Math.round(position)} aria-label="Позиция воспроизведения" onChange={event => seek(Number(event.target.value))}
          style={{ background: 'linear-gradient(to right, var(--transport-active) ' + 100 * position / Math.max(segment.durationMs, 1) + '%, var(--transport-line) 0%)' }} /></div><span>{formatTime(segment.durationMs)}</span></div>
        <div className="player-controls"><div className="transport-help"><kbd>Пробел</kbd><span>Воспроизведение / пауза</span></div>
          <div className="transport-buttons"><button className="icon-button restart-player" aria-label="К началу" title="К началу" onClick={() => seek(0)}><RotateCcw size={17} /></button>
            <button className="player-play" aria-label={playing ? 'Пауза' : 'Воспроизвести'} onClick={toggle}>
              {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
              <span>{playing ? 'Пауза' : position >= segment.durationMs && segment.durationMs > 0 ? 'Ещё раз' : 'Воспроизвести'}</span>
            </button></div>
          <label className="playback-rate"><span>Скорость</span><select aria-label="Скорость воспроизведения" value={rate} onChange={event => {
            const next = Number(event.target.value)
            player.setRate(next); setRate(next); setPosition(player.position())
          }}><option value=".5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        </div>
      </div>
      </section>
    </main>
    <footer className="player-footer"><span>replay board</span><span>Схему можно исследовать в своём темпе.</span></footer>
  </div>
}
