import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertCircle, ArrowLeft, CircleCheck, Clock3, Hand, MicOff, MousePointer2, MoveUpRight, Play, Plus, Redo2, Square, Type, Undo2 } from 'lucide-react'
import { Brand } from '../../components/ui/Brand'
import { Board } from '../../components/board/Board'
import type { BoardTool } from '../../components/board/Board'
import type { BoardObject, Camera, FrameCommand, ObjectColor } from '../../domain/types'
import { toBoardPoint } from '../../components/board/geometry'
import { formatTime } from '../../utils/format'
import type { EditorController } from './controller'
import { Inspector } from './Inspector'
import { PlayerScreen } from '../player/PlayerScreen'

const saveLabels = { saved: 'Сохранено', saving: 'Сохраняем', dirty: 'Есть изменения', error: 'Не сохранено' }
const blockColors: ObjectColor[] = ['blue', 'mint', 'paper', 'peach', 'lavender']

function RecordingTime({ controller, running }: { controller: EditorController; running: boolean }) {
  const [time, setTime] = useState(() => controller.elapsed())
  useEffect(() => {
    if (!running) return
    let frame = 0
    const tick = () => { setTime(controller.elapsed()); frame = requestAnimationFrame(tick) }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [controller, running])
  return <span className="time-value">{formatTime(running ? time : controller.elapsed())}</span>
}

export function EditorScreen({ controller, onHome }: { controller: EditorController; onHome: () => Promise<void> }) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { project, isRecording, saveState } = snapshot
  const [tool, setTool] = useState<BoardTool>('select')
  const [preview, setPreview] = useState(false)
  const size = useRef({ width: 900, height: 600 })
  const currentId = project.rootSegmentId
  const segment = currentId ? project.segments[currentId] : null
  const selectedId = project.workingState.selection[0]
  const object = project.workingState.board.objects[selectedId]
  const connection = project.workingState.board.connections[selectedId]

  const dispatch = useCallback((command: FrameCommand) => controller.dispatch(command), [controller])
  const changeCamera = useCallback((camera: Camera) => {
    controller.dispatch({ type: 'camera.changed', camera: { ...camera,
      viewportWidth: size.current.width, viewportHeight: size.current.height,
    } })
  }, [controller])
  const updateSize = useCallback((next: { width: number; height: number }) => {
    size.current = next
    const current = controller.getSnapshot()
    if (current.isRecording && (current.project.workingState.camera.viewportWidth !== next.width ||
        current.project.workingState.camera.viewportHeight !== next.height)) {
      controller.dispatch({ type: 'camera.changed', camera: { ...current.project.workingState.camera,
        viewportWidth: next.width, viewportHeight: next.height,
      } })
    }
  }, [controller])

  const addObject = useCallback((type: BoardObject['type']) => {
    const current = controller.getSnapshot().project
    const count = Object.values(current.workingState.board.objects).filter(item => item.type === 'block').length
    const screen = type === 'block'
      ? { x: size.current.width / 2 - 250 + (count % 3) * 250, y: size.current.height / 2 - 100 + Math.floor(count / 3) * 145 }
      : { x: size.current.width / 2 - 120, y: size.current.height / 2 + 120 }
    const point = toBoardPoint(screen, current.workingState.camera)
    const next: BoardObject = {
      id: crypto.randomUUID(), type, ...point, width: type === 'block' ? 190 : 240,
      height: type === 'block' ? 100 : 72, text: type === 'block' ? 'Новый блок' : 'Новое пояснение',
      color: type === 'block' ? blockColors[count % blockColors.length] : 'paper',
    }
    controller.dispatch({ type: 'object.created', object: next })
    controller.dispatch({ type: 'selection.changed', ids: [next.id] })
    setTool('select')
  }, [controller])

  useEffect(() => {
    if (!isRecording) return
    const timer = setInterval(() => controller.heartbeat(), 1000)
    return () => clearInterval(timer)
  }, [controller, isRecording])

  useEffect(() => {
    if (preview) return
    const handle = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable || document.querySelector('dialog[open]')) return
      const modifier = event.ctrlKey || event.metaKey
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) controller.redo(); else controller.undo()
      } else if (modifier && event.key.toLowerCase() === 'y') { event.preventDefault(); controller.redo() }
      else if (!modifier && event.key.toLowerCase() === 'b') { event.preventDefault(); addObject('block') }
      else if (!modifier && event.key.toLowerCase() === 't') { event.preventDefault(); addObject('text') }
      else if (!modifier && event.key.toLowerCase() === 'v') setTool('select')
      else if (!modifier && event.key.toLowerCase() === 'c') {
        controller.dispatch({ type: 'selection.changed', ids: [] })
        setTool('connect')
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        const frame = controller.getSnapshot().project.workingState
        for (const id of frame.selection) {
          if (frame.board.objects[id]) controller.dispatch({ type: 'object.deleted', id })
          else if (frame.board.connections[id]) controller.dispatch({ type: 'connection.deleted', id })
        }
      }
    }
    document.addEventListener('keydown', handle)
    return () => document.removeEventListener('keydown', handle)
  }, [controller, addObject, preview])

  if (preview && segment) return <PlayerScreen title={project.title} segment={segment}
    onHome={() => { void onHome() }} onBack={() => setPreview(false)} />

  return <div className="editor-page">
    <header className="editor-header">
      <Brand onClick={() => { void onHome() }} />
      <span className="header-divider" />
      <button className="icon-button back-stories" aria-label="Мои истории" title="Мои истории" onClick={() => { void onHome() }}><ArrowLeft size={16} /></button>
      <input className="project-title-input" aria-label="Название истории" defaultValue={project.title} maxLength={140}
        onBlur={event => {
          const title = event.currentTarget.value.trim() || 'Без названия'
          event.currentTarget.value = title
          if (title !== project.title) controller.setTitle(title)
        }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} />
      <span role="status" aria-label="Состояние сохранения" className={'save-status save-' + saveState}>
        {saveState === 'saved' ? <CircleCheck size={13} /> : saveState === 'error' ? <AlertCircle size={13} /> : saveState === 'saving' ? <span className="spinner" /> : <Clock3 size={13} />}
        {saveLabels[saveState]}
      </span>
      <div className="editor-header-actions">
        <button className="button secondary small" aria-label="Просмотр" disabled={!segment || isRecording} onClick={() => setPreview(true)}><Play size={13} /> <span>Просмотр</span></button>
        {isRecording ? <button className="button stop-button small" aria-label="Остановить запись" onClick={() => { controller.stopRecording(); void controller.flush() }}>
          <Square size={11} fill="currentColor" /> Остановить</button>
          : <button className="button primary small" aria-label="Записать" onClick={() => controller.startRecording(size.current)}><span className="record-dot" /> Записать</button>}
      </div>
    </header>

    <div className="editor-workspace">
      <aside className="story-sidebar">
        <div className="sidebar-heading"><span>История</span><span className="draft-label">Черновик</span></div>
        <div className="sidebar-section-title">Ваши записи <span>{Object.keys(project.segments).length}</span></div>
        {Object.keys(project.segments).length ? <div className="take-list">
          {Object.values(project.segments).map(take => <button key={take.segmentId} disabled={isRecording} className={'take-item' + (take.segmentId === currentId ? ' active' : '')}
            onClick={() => controller.selectTake(take.segmentId)} aria-pressed={take.segmentId === currentId}>
            <span className="take-symbol"><Play size={13} /></span><span><strong>{take.title}</strong><small>{formatTime(take.durationMs)} · {take.events.length} действий</small></span>
            {take.status === 'recording' ? <span className="take-recording-dot" /> : null}
          </button>)}
        </div> : <div className="sidebar-no-recording"><Play size={18} /><h3>Пока без записи</h3><p>Подготовьте доску<br />и нажмите «Записать».</p></div>}
        <div className="sidebar-bottom"><div className="sidebar-shortcut"><span>B</span> блок <span>T</span> текст</div>
          <p>Мысли можно менять.<br />Ход мысли — записывать.</p><div className="local-storage-note"><span className="tiny-dot" /> Хранится в этом браузере</div></div>
      </aside>

      <main className="editor-main">
        <div className="canvas-heading"><span>Доска</span><span>{Object.keys(project.workingState.board.objects).length} объектов</span>
          <span className="canvas-heading-help">Сначала схема. Потом объяснение.</span></div>
        <div className="editor-canvas">
          <Board frame={project.workingState} editable tool={tool} onCommand={dispatch} onCameraChange={changeCamera}
            onToolChange={setTool} onGestureStart={() => controller.beginGesture()} onGestureEnd={() => controller.endGesture()}
            onSizeChange={updateSize} onAdd={() => addObject('block')} />
          <div className="board-toolbar" role="toolbar" aria-label="Инструменты доски">
            <button aria-label="Выбрать" title="Выбрать · V" aria-pressed={tool === 'select'} className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
            <span />
            <button aria-label="Блок" title="Блок · B" onClick={() => addObject('block')}><Square size={17} /><span className="tool-label">Блок</span></button>
            <button aria-label="Текст" title="Текст · T" onClick={() => addObject('text')}><Type size={18} /><span className="tool-label">Текст</span></button>
            <button aria-label="Связь" title="Связь · C" aria-pressed={tool === 'connect'} className={tool === 'connect' ? 'active' : ''}
              onClick={() => { dispatch({ type: 'selection.changed', ids: [] }); setTool('connect') }}><MoveUpRight size={18} /><span className="tool-label">Связь</span></button>
            <span />
            <button aria-label="Перемещать доску" title="Перемещать доску" aria-pressed={tool === 'pan'} className={tool === 'pan' ? 'active' : ''} onClick={() => setTool('pan')}><Hand size={17} /></button>
          </div>
          <div className="history-tools"><button aria-label="Отменить" title="Отменить · Ctrl+Z" disabled={!snapshot.canUndo} onClick={() => controller.undo()}><Undo2 size={16} /></button>
            <button aria-label="Повторить" title="Повторить · Ctrl+Shift+Z" disabled={!snapshot.canRedo} onClick={() => controller.redo()}><Redo2 size={16} /></button></div>
          {tool === 'connect' ? <div className="connection-instruction" role="status">{object?.type === 'block' ? 'Теперь выберите второй блок' : 'Выберите первый блок для связи'}</div> : null}
          {snapshot.recovered ? <div className="recovery-banner"><CircleCheck size={16} /><div><strong>Запись была прервана</strong><span>Восстановлен последний сохранённый фрагмент. Можно посмотреть его или начать новую запись.</span></div></div> : null}
          {snapshot.saveError ? <div className="save-error-banner" role="alert"><AlertCircle size={16} /><span>{snapshot.saveError}</span>
            <button onClick={() => { void controller.flush() }}>Повторить</button></div> : null}
        </div>
        <footer className={'editor-timeline' + (isRecording ? ' recording' : '')}>
          <div className="timeline-heading"><span className={'timeline-state-dot' + (isRecording ? ' recording' : '')} /><strong>{isRecording ? 'Идёт запись' : segment?.title ?? 'Ваша первая запись'}</strong>
            <span>{segment ? segment.events.length + ' действий' : 'Начните, когда будете готовы'}</span>
            <div className="microphone-status"><MicOff size={13} /> Без голоса</div><RecordingTime controller={controller} running={isRecording} />
          </div>
          <div className="timeline-row"><button className="timeline-play" aria-label="Открыть воспроизведение" disabled={!segment || isRecording} onClick={() => setPreview(true)}><Play size={15} fill="currentColor" /></button>
            <div className="event-timeline"><div className="timeline-ruler"><span>00:00</span><span>{segment ? formatTime(segment.durationMs / 2) : ''}</span><span>{segment ? formatTime(segment.durationMs) : ''}</span></div>
              <div className="timeline-track">{segment ? <div className="timeline-events">
                {segment.events.filter(event => event.command.type !== 'selection.changed').map(event => <i key={event.eventId}
                  style={{ left: 100 * event.tMs / Math.max(segment.durationMs, 1) + '%' }} />)}
                <span className="timeline-track-label">События доски</span><span className="timeline-end-marker" />
              </div> : <div className="timeline-placeholder"><Plus size={11} /> Действия появятся здесь во время записи</div>}</div>
            </div>
          </div>
        </footer>
      </main>
      <Inspector object={object} connection={connection} dispatch={dispatch} />
    </div>
  </div>
}
