import type { BoardObject, FrameCommand, FrameState, Project } from '../../domain/types'
import { createProject } from '../../domain/project'
import { applyFrameCommand } from '../../domain/board'
import { Recorder } from '../../recording/recorder'
import { reconstruct } from '../../playback/reconstruct'

export interface DemoStory {
  id: string
  kind: 'engineering' | 'learning'
  description: string
  project: Project
}

function block(id: string, text: string, x: number, y: number, color: BoardObject['color'], width = 180): BoardObject {
  return { id, type: 'block', text, x, y, width, height: 90, color }
}

function makeDemo(
  id: string, title: string, objects: BoardObject[],
  steps: { at: number; command: FrameCommand }[], duration: number,
): Project {
  let project = createProject(title, id, 1000)
  let state: FrameState = project.workingState
  for (const object of objects) state = applyFrameCommand(state, { type: 'object.created', object })
  let now = 0
  let sequence = 0
  const recorder = new Recorder(() => now, () => id + '-event-' + sequence++)
  recorder.start(state, id + '-take', 'Основное объяснение')
  for (const step of steps) {
    now = step.at
    recorder.record(step.command)
  }
  now = duration
  const segment = recorder.stop()
  project = { ...project, rootSegmentId: segment.segmentId, segments: { [segment.segmentId]: segment },
    workingState: reconstruct(segment, duration) }
  return project
}

const demos: DemoStory[] = [
  {
    id: 'orders',
    kind: 'engineering',
    description: 'Повторный запрос может создать второй заказ. Разбираемся, почему защиту стоит строить на сервере.',
    project: makeDemo('demo-orders', 'Почему заказ создался дважды?', [
      block('user', 'Пользователь', 100, 160, 'paper'),
      block('server', 'Сервер', 440, 160, 'blue', 190),
      block('database', 'База данных', 800, 160, 'mint'),
    ], [
      { at: 1000, command: { type: 'connection.created', connection: { id: 'request', sourceId: 'user', targetId: 'server', label: 'POST /orders' } } },
      { at: 2500, command: { type: 'connection.created', connection: { id: 'insert', sourceId: 'server', targetId: 'database', label: 'создать заказ' } } },
      { at: 4500, command: { type: 'object.created', object: block('retry', 'Повторный запрос', 100, 355, 'peach') } },
      { at: 6000, command: { type: 'connection.created', connection: { id: 'retry-request', sourceId: 'retry', targetId: 'server', label: 'ещё раз' } } },
      { at: 7500, command: { type: 'object.created', object: { id: 'duplicate', type: 'text', x: 795, y: 365, width: 195, height: 72, text: 'Два заказа\nвместо одного', color: 'peach' } } },
      { at: 9000, command: { type: 'object.created', object: block('key', 'Ключ идемпотентности', 440, 355, 'lavender', 190) } },
      { at: 10500, command: { type: 'connection.created', connection: { id: 'deduplication', sourceId: 'key', targetId: 'server', label: 'проверить' } } },
      { at: 11500, command: { type: 'selection.changed', ids: ['key'] } },
    ], 13_000),
  },
  {
    id: 'binary-search',
    kind: 'learning',
    description: 'Ищем число 12 в отсортированном массиве: каждое сравнение сокращает область поиска.',
    project: makeDemo('demo-search', 'Бинарный поиск', [
      ...[2, 5, 8, 12, 16].map((value, index) => ({ ...block('value-' + index, String(value), 100 + index * 145, 180, 'paper', 110), height: 100 })),
      { id: 'search-title', type: 'text', x: 100, y: 60, width: 420, height: 60, text: 'Ищем число 12', color: 'paper' },
    ], [
      { at: 1200, command: { type: 'object.updated', id: 'value-2', patch: { color: 'blue' } } },
      { at: 1800, command: { type: 'selection.changed', ids: ['value-2'] } },
      { at: 3500, command: { type: 'object.created', object: { id: 'comparison', type: 'text', x: 180, y: 360, width: 410, height: 70, text: '12 > 8\nОставляем правую половину', color: 'paper' } } },
      { at: 5500, command: { type: 'object.updated', id: 'value-0', patch: { color: 'lavender' } } },
      { at: 5500, command: { type: 'object.updated', id: 'value-1', patch: { color: 'lavender' } } },
      { at: 5500, command: { type: 'object.updated', id: 'value-2', patch: { color: 'lavender' } } },
      { at: 7500, command: { type: 'object.updated', id: 'value-3', patch: { color: 'mint', text: '12 ✓' } } },
      { at: 8500, command: { type: 'selection.changed', ids: ['value-3'] } },
      { at: 9500, command: { type: 'object.created', object: { id: 'found', type: 'text', x: 650, y: 360, width: 210, height: 70, text: 'Найдено\nза 2 сравнения', color: 'mint' } } },
    ], 11_000),
  },
]

export function getDemos(): DemoStory[] { return demos }
