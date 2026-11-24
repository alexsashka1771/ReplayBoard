import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { Maximize2, Minus, Plus, Square } from 'lucide-react'
import type { BoardObject, Camera, FrameCommand, FrameState, Point } from '../../domain/types'
import { connectionGeometry, displayCamera, fitCamera, toBoardPoint } from './geometry'
import { BoardText, LiveText } from './BoardText'
import { completeText } from '../../playback/presentation'
import type { PresentedFrame } from '../../playback/presentation'

export type BoardTool = 'select' | 'connect' | 'pan'
interface Props {
  frame: FrameState
  effects?: Pick<PresentedFrame, 'texts' | 'connections'>
  editable?: boolean
  tool?: BoardTool
  autoFit?: boolean
  focusId?: string
  onCommand?: (command: FrameCommand) => void
  onCameraChange?: (camera: Camera) => void
  onToolChange?: (tool: BoardTool) => void
  onGestureStart?: () => void
  onGestureEnd?: () => void
  onSizeChange?: (size: { width: number; height: number }) => void
  onAdd?: () => void
  onInspect?: (object: BoardObject | null) => void
}

interface Drag {
  id: string
  origin: Point
  start: Point
  last: Point
}
interface Pan { start: Point; camera: Camera }

export function Board({
  frame, effects, editable = false, tool = 'select', autoFit = false, focusId, onCommand, onCameraChange,
  onToolChange, onGestureStart, onGestureEnd, onSizeChange, onAdd, onInspect,
}: Props) {
  const host = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ width: 800, height: 500 })
  const [dragging, setDragging] = useState(false)
  const camera = autoFit ? displayCamera(frame.camera, frame.board, size.width, size.height, {
    readable: size.width <= 600, focusId,
  }) : frame.camera
  const cameraRef = useRef<Camera>(camera)
  const drag = useRef<Drag | null>(null)
  const pan = useRef<Pan | null>(null)
  const pending = useRef<Point | null>(null)
  const animation = useRef<number>(0)
  const space = useRef(false)
  const id = useId()
  const objects = Object.values(frame.board.objects)

  useLayoutEffect(() => { cameraRef.current = camera }, [camera])

  useEffect(() => {
    const element = host.current
    if (!element) return
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect
      if (rect.width > 0 && rect.height > 0) {
        const next = { width: rect.width, height: rect.height }
        setSize(previous => previous.width === next.width && previous.height === next.height ? previous : next)
        onSizeChange?.(next)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [onSizeChange])

  useEffect(() => {
    const element = svg.current
    if (!element || !onCameraChange) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
      const current = cameraRef.current
      const world = toBoardPoint(point, current)
      const zoom = Math.max(0.15, Math.min(3, current.zoom * Math.exp(-event.deltaY * 0.0015)))
      onCameraChange({ ...current, x: point.x - world.x * zoom, y: point.y - world.y * zoom, zoom })
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [onCameraChange])

  useEffect(() => () => { cancelAnimationFrame(animation.current) }, [])

  function screenPoint(event: { clientX: number; clientY: number }): Point {
    const rect = svg.current?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  function select(object: BoardObject) {
    if (!editable) { onInspect?.(object); return }
    if (tool === 'connect') {
      if (object.type !== 'block') return
      const source = frame.selection[0]
      if (source && source !== object.id && frame.board.objects[source]?.type === 'block') {
        const connectionId = crypto.randomUUID()
        onCommand?.({ type: 'connection.created', connection: {
          id: connectionId, sourceId: source, targetId: object.id, label: '',
        } })
        onCommand?.({ type: 'selection.changed', ids: [connectionId] })
        onToolChange?.('select')
      } else onCommand?.({ type: 'selection.changed', ids: [object.id] })
    } else onCommand?.({ type: 'selection.changed', ids: [object.id] })
  }

  function startNode(event: PointerEvent<SVGGElement>, object: BoardObject) {
    event.stopPropagation()
    if (event.button !== 0 && event.button !== 1) return
    svg.current?.focus()
    if (tool === 'pan' || space.current || event.button === 1 || !editable) {
      if (!editable && event.button === 0) onInspect?.(object)
      pan.current = { start: screenPoint(event), camera }
      svg.current?.setPointerCapture(event.pointerId)
      setDragging(true)
      return
    }
    select(object)
    if (tool === 'connect') return
    drag.current = { id: object.id, origin: { x: object.x, y: object.y }, start: toBoardPoint(screenPoint(event), camera),
      last: { x: object.x, y: object.y } }
    onGestureStart?.()
    svg.current?.setPointerCapture(event.pointerId)
    setDragging(true)
  }

  function startBackground(event: PointerEvent<SVGSVGElement>) {
    svg.current?.focus()
    if (event.button === 1 || tool === 'pan' || space.current || !editable) {
      if (!editable) onInspect?.(null)
      pan.current = { start: screenPoint(event), camera }
      svg.current?.setPointerCapture(event.pointerId)
      setDragging(true)
    } else onCommand?.({ type: 'selection.changed', ids: [] })
  }

  function flushDrag() {
    animation.current = 0
    const current = drag.current
    const point = pending.current
    if (!current || !point) return
    pending.current = null
    const next = {
      x: Math.round(current.origin.x + point.x - current.start.x),
      y: Math.round(current.origin.y + point.y - current.start.y),
    }
    if (next.x !== current.last.x || next.y !== current.last.y) {
      current.last = next
      onCommand?.({ type: 'object.updated', id: current.id, patch: next })
    }
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (drag.current) {
      pending.current = toBoardPoint(screenPoint(event), cameraRef.current)
      if (!animation.current) animation.current = requestAnimationFrame(flushDrag)
    } else if (pan.current) {
      const point = screenPoint(event)
      onCameraChange?.({ ...pan.current.camera,
        x: pan.current.camera.x + point.x - pan.current.start.x,
        y: pan.current.camera.y + point.y - pan.current.start.y,
      })
    }
  }

  function end(event: PointerEvent<SVGSVGElement>) {
    cancelAnimationFrame(animation.current)
    flushDrag()
    if (drag.current) onGestureEnd?.()
    drag.current = null
    pan.current = null
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId)
    setDragging(false)
  }

  function keyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'Escape') {
      onCommand?.({ type: 'selection.changed', ids: [] })
      onToolChange?.('select')
    }
    if (event.key === ' ' && editable) { event.preventDefault(); space.current = true }
    const object = frame.board.objects[frame.selection[0]]
    if (editable && object && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault()
      const step = event.shiftKey ? 24 : 8
      onCommand?.({ type: 'object.updated', id: object.id, patch: {
        x: object.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0),
        y: object.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0),
      } })
    }
  }

  function zoomBy(factor: number) {
    const point = { x: size.width / 2, y: size.height / 2 }
    const world = toBoardPoint(point, camera)
    const zoom = Math.max(0.15, Math.min(3, camera.zoom * factor))
    onCameraChange?.({ ...camera, x: point.x - world.x * zoom, y: point.y - world.y * zoom, zoom })
  }

  return <div ref={host} className={'board-surface' + (dragging ? ' is-dragging' : '') + (tool === 'pan' || !editable ? ' can-pan' : '')}
    style={{ backgroundSize: 24 * camera.zoom + 'px ' + 24 * camera.zoom + 'px', backgroundPosition: camera.x + 'px ' + camera.y + 'px' }}>
    <svg ref={svg} className="board-svg" width="100%" height="100%" role="application" aria-label="Доска" tabIndex={0}
      onPointerDown={startBackground} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
      onKeyDown={keyDown} onKeyUp={event => { if (event.key === ' ') space.current = false }} onBlur={() => { space.current = false }}>
      <defs>
        <marker id={id + '-arrow'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M1 1L9 5L1 9" fill="none" stroke="#89847c" strokeWidth="1.5" strokeLinejoin="round" />
        </marker>
        <marker id={id + '-selected-arrow'} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M1 1L9 5L1 9" fill="none" stroke="#4056D6" strokeWidth="1.5" strokeLinejoin="round" />
        </marker>
        <filter id={id + '-shadow'} x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#292724" floodOpacity=".045" /></filter>
      </defs>
      <g transform={'translate(' + camera.x + ' ' + camera.y + ') scale(' + camera.zoom + ')'}>
        {Object.values(frame.board.connections).map(connection => {
          const source = frame.board.objects[connection.sourceId]
          const target = frame.board.objects[connection.targetId]
          if (!source || !target) return null
          const reveal = effects?.connections[connection.id]
          const progress = reveal?.progress ?? 1
          const geometry = connectionGeometry(source, target, progress)
          const selected = frame.selection.includes(connection.id)
          return <g key={connection.id} data-connection-id={connection.id} data-draw-progress={progress}
            className={'board-connection' + (selected ? ' selected' : '') + (progress < 1 ? ' drawing' : '')}>
            <path d={geometry.path} fill="none" stroke="transparent" strokeWidth="18" className="connection-hit"
              onPointerDown={event => { event.stopPropagation(); onCommand?.({ type: 'selection.changed', ids: [connection.id] }) }} />
            <path d={geometry.path} fill="none" className="connection-line" strokeWidth="2" strokeLinecap="round"
              markerEnd={progress === 1 ? 'url(#' + id + (selected ? '-selected-arrow' : '-arrow') + ')' : undefined} pointerEvents="none" />
            {progress > 0 && progress < 1 ? <circle cx={geometry.tip.x} cy={geometry.tip.y} r="2.8" className="drawing-tip" pointerEvents="none" /> : null}
            {connection.label ? <foreignObject x={(geometry.from.x + geometry.to.x) / 2 - 140}
              y={(geometry.from.y + geometry.to.y) / 2 - 36} width="280" height="28" pointerEvents="none">
              <div className="connection-copy" style={{ visibility: reveal && !(reveal.label.before || reveal.label.after) ? 'hidden' : undefined }}>
                <span><LiveText reveal={reveal?.label ?? completeText(connection.label)} /></span></div>
            </foreignObject> : null}
          </g>
        })}
        {objects.map(object => {
          const selected = frame.selection.includes(object.id)
          const label = (object.type === 'block' ? 'Блок: ' : 'Текст: ') + (object.text || 'Без названия')
          return <g key={object.id} transform={'translate(' + object.x + ' ' + object.y + ')'} data-object-id={object.id}
            role="button" tabIndex={0} aria-label={label} aria-pressed={selected}
            className={'board-node board-node-' + object.type + (selected ? ' selected' : '')}
            onPointerDown={event => startNode(event, object)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); select(object) } }}>
            <rect width={object.width} height={object.height} rx={object.type === 'block' ? 13 : 5}
              className={object.type === 'block' ? 'node-fill node-fill-' + object.color : 'text-hitbox'}
              filter={object.type === 'block' ? 'url(#' + id + '-shadow)' : undefined} />
            {selected ? <rect x="-4" y="-4" width={object.width + 8} height={object.height + 8}
              rx={object.type === 'block' ? 17 : 8} className="selection-outline" pointerEvents="none" /> : null}
            <BoardText object={object} reveal={effects?.texts[object.id]} />
          </g>
        })}
      </g>
    </svg>
    {editable && objects.length === 0 ? <div className="board-empty">
      <div className="board-empty-art"><Square size={34} strokeWidth={1} /><span /><Square size={25} strokeWidth={1} /></div>
      <h2>Начните с одного блока</h2><p>Добавьте мысль, свяжите её с другой.<br />А потом включите запись.</p>
      <button className="button secondary" onClick={onAdd}><Plus size={16} /> Добавить первый блок</button>
    </div> : null}
    {onCameraChange ? <div className="zoom-controls">
      <button aria-label="Уменьшить масштаб" onClick={() => zoomBy(1 / 1.2)}><Minus size={14} /></button>
      <span>{Math.round(camera.zoom * 100)}%</span>
      <button aria-label="Увеличить масштаб" onClick={() => zoomBy(1.2)}><Plus size={14} /></button>
      <i />
      <button aria-label="Вписать доску" title="Вписать доску" onClick={() => onCameraChange(fitCamera(frame.board, size.width, size.height,
        editable ? window.matchMedia('(max-width: 640px)').matches ? { top: 84 } : { left: 100 } : {},
      ))}><Maximize2 size={14} /></button>
    </div> : null}
    <div className="board-navigation-hint">{editable ? 'Перетаскивайте объекты · Пробел — перемещение доски' : 'Перемещайте схему или приблизьте интересующий блок'}</div>
  </div>
}
