import type { BoardObject, FrameState, RecordingSegment } from '../domain/types'

export const blockA: BoardObject = {
  id: 'a', type: 'block', x: 100, y: 120, width: 180, height: 100, text: 'Client', color: 'blue',
}
export const blockB: BoardObject = {
  id: 'b', type: 'block', x: 400, y: 120, width: 180, height: 100, text: 'Server', color: 'mint',
}
export const note: BoardObject = {
  id: 'note', type: 'text', x: 100, y: 300, width: 220, height: 70, text: 'Retry', color: 'paper',
}

export function initialFrame(): FrameState {
  return {
    board: { objects: { a: { ...blockA }, b: { ...blockB } }, connections: {
      ab: { id: 'ab', sourceId: 'a', targetId: 'b', label: 'Request' },
    } },
    camera: { x: 0, y: 0, zoom: 1 },
    selection: [],
    pointer: null,
  }
}

export function recordedSegment(): RecordingSegment {
  return {
    segmentId: 'take-1',
    title: 'Take 1',
    initialState: initialFrame(),
    durationMs: 4000,
    status: 'stopped',
    events: [
      { eventId: 'e1', tMs: 1000, seq: 0, command: { type: 'object.created', object: { ...note } } },
      { eventId: 'e2', tMs: 2000, seq: 1, command: { type: 'object.updated', id: 'a', patch: { x: 240 } } },
      { eventId: 'e3', tMs: 3000, seq: 2, command: { type: 'object.deleted', id: 'b' } },
    ],
  }
}
