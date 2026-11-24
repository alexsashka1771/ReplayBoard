import type { BoardObject, BoardState, Camera, Point } from '../../domain/types'

export function connectionGeometry(source: BoardObject, target: BoardObject, progress = 1) {
  const dx = target.x + target.width / 2 - source.x - source.width / 2
  const dy = target.y + target.height / 2 - source.y - source.height / 2
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const direction = Math.sign(horizontal ? dx : dy) || 1
  const from = horizontal
    ? { x: source.x + (direction > 0 ? source.width : 0), y: source.y + source.height / 2 }
    : { x: source.x + source.width / 2, y: source.y + (direction > 0 ? source.height : 0) }
  const to = horizontal
    ? { x: target.x + (direction > 0 ? 0 : target.width), y: target.y + target.height / 2 }
    : { x: target.x + target.width / 2, y: target.y + (direction > 0 ? 0 : target.height) }
  const bend = Math.max(48, Math.abs(horizontal ? to.x - from.x : to.y - from.y) / 2) * direction
  const first = horizontal ? { x: from.x + bend, y: from.y } : { x: from.x, y: from.y + bend }
  const second = horizontal ? { x: to.x - bend, y: to.y } : { x: to.x, y: to.y - bend }
  const amount = Math.max(0, Math.min(1, progress))
  const mix = (a: Point, b: Point): Point => ({ x: a.x + (b.x - a.x) * amount, y: a.y + (b.y - a.y) * amount })
  const control1 = mix(from, first)
  const between = mix(first, second)
  const control2 = mix(control1, between)
  const tip = mix(control2, mix(between, mix(second, to)))
  const path = 'M ' + from.x + ' ' + from.y + ' C ' + control1.x + ' ' + control1.y + ', ' +
    control2.x + ' ' + control2.y + ', ' + tip.x + ' ' + tip.y
  return { from, to, tip, path }
}

export function toBoardPoint(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom }
}

export function displayCamera(camera: Camera, board: BoardState, width: number, height: number, options: { readable?: boolean; focusId?: string } = {}): Camera {
  if (options.readable) {
    const object = options.focusId ? board.objects[options.focusId] : undefined
    const connection = options.focusId ? board.connections[options.focusId] : undefined
    let focus: Point | undefined
    if (object) focus = { x: object.x + object.width / 2, y: object.y + object.height / 2 }
    if (connection) {
      const source = board.objects[connection.sourceId]
      const target = board.objects[connection.targetId]
      if (source && target) focus = { x: (source.x + source.width / 2 + target.x + target.width / 2) / 2,
        y: (source.y + source.height / 2 + target.y + target.height / 2) / 2 }
    }
    if (!focus) {
      focus = camera.viewportWidth && camera.viewportHeight
        ? toBoardPoint({ x: camera.viewportWidth / 2, y: camera.viewportHeight / 2 }, camera)
        : toBoardPoint({ x: width / 2, y: height / 2 }, fitCamera(board, width, height))
    }
    const zoom = Math.max(0.15, Math.min(3, camera.zoom * 0.8))
    return { x: width / 2 - focus.x * zoom, y: height / 2 - focus.y * zoom, zoom }
  }
  if (!camera.viewportWidth || !camera.viewportHeight) return fitCamera(board, width, height)
  const scale = Math.min(width / camera.viewportWidth, height / camera.viewportHeight)
  return {
    x: camera.x * scale + (width - camera.viewportWidth * scale) / 2,
    y: camera.y * scale + (height - camera.viewportHeight * scale) / 2,
    zoom: camera.zoom * scale,
  }
}

export function fitCamera(board: BoardState, width: number, height: number,
  padding: { left?: number; right?: number; top?: number; bottom?: number } = {},
): Camera {
  const objects = Object.values(board.objects)
  if (objects.length === 0) return { x: 0, y: 0, zoom: 1 }
  const left = Math.min(...objects.map(object => object.x))
  const right = Math.max(...objects.map(object => object.x + object.width))
  const top = Math.min(...objects.map(object => object.y))
  const bottom = Math.max(...objects.map(object => object.y + object.height))
  const { left: insetLeft = 60, right: insetRight = 60, top: insetTop = 60, bottom: insetBottom = 60 } = padding
  const zoom = Math.max(0.1, Math.min(1.1, (width - insetLeft - insetRight) / Math.max(right - left, 1),
    (height - insetTop - insetBottom) / Math.max(bottom - top, 1)))
  return { x: (width + insetLeft - insetRight) / 2 - (left + right) / 2 * zoom,
    y: (height + insetTop - insetBottom) / 2 - (top + bottom) / 2 * zoom, zoom }
}
