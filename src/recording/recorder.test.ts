import { describe, expect, it } from 'vitest'
import { Recorder } from './recorder'
import { initialFrame, note } from '../test/fixtures'

describe('live recording', () => {
  it('records elapsed timestamps and the final duration from the supplied clock', () => {
    let now = 500
    const recorder = new Recorder(() => now, () => 'event')
    recorder.start(initialFrame(), 'take', 'Take')
    now = 1500
    recorder.record({ type: 'object.created', object: note })
    now = 2500
    recorder.record({ type: 'object.updated', id: 'a', patch: { x: 220 } })
    now = 3500
    const segment = recorder.stop()
    expect(segment.events.map(event => event.tMs)).toEqual([1000, 2000])
    expect(segment.durationMs).toBe(3000)
    expect(segment.status).toBe('stopped')
  })

  it('assigns stable sequence numbers even when the clock does not advance', () => {
    const recorder = new Recorder(() => 0, () => 'event')
    recorder.start(initialFrame(), 'take', 'Take')
    recorder.record({ type: 'object.created', object: note })
    recorder.record({ type: 'object.updated', id: 'note', patch: { x: 200 } })
    expect(recorder.snapshot().events.map(event => event.seq)).toEqual([0, 1])
  })

  it('copies the starting state and recorded payloads', () => {
    const frame = initialFrame()
    const payload = { ...note }
    const recorder = new Recorder(() => 0, () => 'event')
    recorder.start(frame, 'take', 'Take')
    recorder.record({ type: 'object.created', object: payload })
    frame.board.objects.a.x = 999
    payload.text = 'Changed outside recorder'
    expect(recorder.snapshot().initialState.board.objects.a.x).toBe(100)
    const command = recorder.snapshot().events[0].command
    expect(command.type === 'object.created' ? command.object.text : null).toBe('Retry')
  })

  it('exposes an up-to-date recoverable snapshot while recording', () => {
    let now = 0
    const recorder = new Recorder(() => now, () => 'event')
    recorder.start(initialFrame(), 'take', 'Take')
    now = 1200
    expect(recorder.snapshot().durationMs).toBe(1200)
    expect(recorder.snapshot().status).toBe('recording')
  })
})
