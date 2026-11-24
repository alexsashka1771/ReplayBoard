import { describe, expect, it } from 'vitest'
import { applyBoardCommand, applyFrameCommand } from './board'
import { initialFrame, note } from '../test/fixtures'

describe('board commands', () => {
  it('creates an object without mutating the source board', () => {
    const before = initialFrame().board
    const after = applyBoardCommand(before, { type: 'object.created', object: note })
    expect(after.objects.note).toEqual(note)
    expect(before.objects.note).toBeUndefined()
  })

  it('moves a block while preserving ID-based connections', () => {
    const before = initialFrame().board
    const after = applyBoardCommand(before, { type: 'object.updated', id: 'a', patch: { x: 260 } })
    expect(after.objects.a.x).toBe(260)
    expect(after.connections.ab.sourceId).toBe('a')
    expect(before.objects.a.x).toBe(100)
  })

  it('removes incident connections atomically when a block is deleted', () => {
    const after = applyBoardCommand(initialFrame().board, { type: 'object.deleted', id: 'b' })
    expect(after.objects.b).toBeUndefined()
    expect(after.connections.ab).toBeUndefined()
  })

  it('rejects connections whose target does not exist', () => {
    expect(() => applyBoardCommand(initialFrame().board, { type: 'connection.created', connection: {
      id: 'bad', sourceId: 'a', targetId: 'missing', label: '',
    } })).toThrow()
  })

  it('rejects non-finite positions and invalid object sizes', () => {
    expect(() => applyBoardCommand(initialFrame().board, { type: 'object.updated', id: 'a', patch: { x: NaN } })).toThrow()
    expect(() => applyBoardCommand(initialFrame().board, { type: 'object.updated', id: 'a', patch: { width: -10 } })).toThrow()
  })

  it('filters selection after a selected object is deleted', () => {
    const frame = initialFrame()
    frame.selection = ['b', 'ab']
    expect(applyFrameCommand(frame, { type: 'object.deleted', id: 'b' }).selection).toEqual([])
  })
})
