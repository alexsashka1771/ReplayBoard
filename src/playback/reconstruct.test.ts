import { describe, expect, it } from 'vitest'
import { reconstruct } from './reconstruct'
import { blockA, initialFrame, recordedSegment } from '../test/fixtures'
import type { RecordingSegment } from '../domain/types'

describe('state reconstruction', () => {
  it('restores additions at an intermediate time without future moves', () => {
    const frame = reconstruct(recordedSegment(), 1500)
    expect(frame.board.objects.note?.text).toBe('Retry')
    expect(frame.board.objects.a.x).toBe(100)
  })

  it('restores a moved object at its recorded position', () => {
    expect(reconstruct(recordedSegment(), 2500).board.objects.a.x).toBe(240)
  })

  it('restores deletions and their connected arrows at the end', () => {
    const frame = reconstruct(recordedSegment(), 4000)
    expect(frame.board.objects.b).toBeUndefined()
    expect(frame.board.connections.ab).toBeUndefined()
  })

  it('rewinds from the initial state and leaves the original recording unchanged', () => {
    const segment = recordedSegment()
    const original = structuredClone(segment)
    reconstruct(segment, 4000)
    expect(reconstruct(segment, 1500)).toEqual(reconstruct(segment, 1500))
    expect(reconstruct(segment, 0)).toEqual(initialFrame())
    expect(segment).toEqual(original)
  })

  it('uses sequence order for events with identical timestamps', () => {
    const segment: RecordingSegment = {
      ...recordedSegment(),
      events: [
        { eventId: 'delete', tMs: 1000, seq: 0, command: { type: 'object.deleted', id: 'a' } },
        { eventId: 'create', tMs: 1000, seq: 1, command: { type: 'object.created', object: { ...blockA, x: 180 } } },
        { eventId: 'move', tMs: 1000, seq: 2, command: { type: 'object.updated', id: 'a', patch: { x: 250 } } },
      ],
    }
    expect(reconstruct(segment, 1000).board.objects.a.x).toBe(250)
    expect(reconstruct(segment, 999).board.objects.a.x).toBe(100)
  })
})
