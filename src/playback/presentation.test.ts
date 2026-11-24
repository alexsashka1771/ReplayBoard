import { describe, expect, it } from 'vitest'
import { PlaybackPresentation } from './presentation'
import { reconstruct } from './reconstruct'
import { initialFrame, note } from '../test/fixtures'
import type { FrameCommand, FrameState, RecordingSegment } from '../domain/types'
import { Recorder } from '../recording/recorder'

function recording(steps: [number, FrameCommand][], durationMs = 4000, initial = initialFrame()): RecordingSegment {
  let now = 0
  let seq = 0
  const recorder = new Recorder(() => now, () => 'event-' + seq++)
  recorder.start(initial, 'take', 'Live explanation')
  for (const [at, command] of steps) { now = at; recorder.record(command) }
  now = durationMs
  return recorder.stop()
}

function visible(view: { before: string; hidden: string; after: string }) { return view.before + view.after }

describe('playback presentation', () => {
  it('leaves objects and connections present before recording fully visible', () => {
    const view = new PlaybackPresentation(recording([])).at(0)
    expect(visible(view.texts.a)).toBe('Client')
    expect(view.texts.a.hidden).toBe('')
    expect(view.texts.a.caret).toBe(false)
    expect(view.connections.ab.progress).toBe(1)
    expect(visible(view.connections.ab.label)).toBe('Request')
  })

  it('draws a new connection over story time while leaving the canonical state intact', () => {
    const segment = recording([[1000, { type: 'connection.created', connection: { id: 'new', sourceId: 'a', targetId: 'b', label: 'Send' } }]])
    const presentation = new PlaybackPresentation(segment)
    expect(presentation.at(999).connections.new).toBeUndefined()
    expect(presentation.at(1000).connections.new.progress).toBe(0)
    expect(presentation.at(1300).connections.new.progress).toBeGreaterThan(0)
    expect(presentation.at(1300).connections.new.progress).toBeLessThan(1)
    expect(presentation.at(2200).connections.new.progress).toBe(1)
    expect(presentation.at(1300).frame).toEqual(reconstruct(segment, 1300))
  })

  it('starts typing an arrow label after its line reaches the middle', () => {
    const presentation = new PlaybackPresentation(recording([[1000, { type: 'connection.created', connection: {
      id: 'new', sourceId: 'a', targetId: 'b', label: 'Передать запрос',
    } }]]))
    expect(visible(presentation.at(1100).connections.new.label)).toBe('')
    const middle = presentation.at(1600).connections.new.label
    expect('Передать запрос'.startsWith(visible(middle))).toBe(true)
    expect(visible(middle).length).toBeGreaterThan(0)
    expect(middle.hidden.length).toBeGreaterThan(0)
    expect(visible(presentation.at(2500).connections.new.label)).toBe('Передать запрос')
  })

  it('reveals a pasted text in place without changing its final layout content', () => {
    const presentation = new PlaybackPresentation(recording([[1000, { type: 'object.created', object: { ...note, text: 'Два заказа\nвместо одного' } }]]))
    expect(visible(presentation.at(1000).texts.note)).toBe('')
    const text = presentation.at(1300).texts.note
    expect(visible(text)).toMatch(/^Два /)
    expect(text.hidden.length).toBeGreaterThan(0)
    expect(text.before + text.hidden + text.after).toBe('Два заказа\nвместо одного')
    expect(text.caret).toBe(true)
    expect(visible(presentation.at(2500).texts.note)).toBe('Два заказа\nвместо одного')
  })

  it('keeps the unchanged prefix and suffix when inserting text in the middle', () => {
    const initial = initialFrame()
    initial.board.objects.a.text = 'Клиент → сервер'
    const presentation = new PlaybackPresentation(recording([[1000, { type: 'object.updated', id: 'a', patch: { text: 'Клиент → наш новый сервер' } }]], 4000, initial))
    const text = presentation.at(1000).texts.a
    expect(text.before).toBe('Клиент → ')
    expect(text.after).toBe('сервер')
    expect(text.hidden).toBe('наш новый ')
    expect(visible(presentation.at(2500).texts.a)).toBe('Клиент → наш новый сервер')
  })

  it('preserves the recorded rhythm of individual keys and backspace', () => {
    const initial = initialFrame()
    initial.board.objects.a.text = ''
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'object.updated', id: 'a', patch: { text: 'А' } }],
      [1170, { type: 'object.updated', id: 'a', patch: { text: 'Аб' } }],
      [1420, { type: 'object.updated', id: 'a', patch: { text: 'А' } }],
    ], 4000, initial))
    expect(visible(presentation.at(1000).texts.a)).toBe('А')
    expect(visible(presentation.at(1169).texts.a)).toBe('А')
    expect(visible(presentation.at(1170).texts.a)).toBe('Аб')
    expect(visible(presentation.at(1420).texts.a)).toBe('А')
    expect(presentation.at(1170).texts.a.caret).toBe(true)
  })

  it('never splits emoji, combining marks or joined graphemes', () => {
    const content = '👩🏽‍💻е́🙂'
    const presentation = new PlaybackPresentation(recording([[1000, { type: 'object.created', object: { ...note, text: content } }]]))
    const allowed = ['', '👩🏽‍💻', '👩🏽‍💻е́', content]
    for (let time = 1000; time <= 1800; time += 17) {
      expect(allowed).toContain(visible(presentation.at(time).texts.note))
    }
  })

  it('keeps individual keys immediate even when the recorder gives them the same millisecond', () => {
    const initial = initialFrame()
    initial.board.objects.a.text = ''
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'object.updated', id: 'a', patch: { text: 'А' } }],
      [1000, { type: 'object.updated', id: 'a', patch: { text: 'Аб' } }],
    ], 4000, initial))
    expect(visible(presentation.at(1000).texts.a)).toBe('Аб')
    expect(presentation.at(1000).texts.a.hidden).toBe('')
  })

  it('returns the same intermediate drawing and typing when seeking backwards', () => {
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'object.created', object: { ...note, text: 'Постепенное объяснение' } }],
      [1000, { type: 'connection.created', connection: { id: 'new', sourceId: 'a', targetId: 'b', label: '' } }],
    ]))
    const middle = presentation.at(1250)
    presentation.at(4000)
    expect(presentation.at(1250)).toEqual(middle)
    expect(presentation.at(0).texts.note).toBeUndefined()
  })

  it('finishes an effect before the next text replacement', () => {
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'object.created', object: { ...note, text: 'Длинная вставленная надпись' } }],
      [1200, { type: 'object.updated', id: 'note', patch: { text: 'Длинная вставленная надпись!' } }],
    ]))
    expect(visible(presentation.at(1200).texts.note)).toBe('Длинная вставленная надпись!')
    expect(presentation.at(1200).texts.note.hidden).toBe('')
  })

  it('honors the last command at identical timestamps without showing a discarded label', () => {
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'object.created', object: { ...note, text: 'Первый текст' } }],
      [1000, { type: 'object.updated', id: 'note', patch: { text: 'Окончательный текст' } }],
      [1000, { type: 'connection.created', connection: { id: 'new', sourceId: 'a', targetId: 'b', label: 'Старый' } }],
      [1100, { type: 'connection.updated', id: 'new', patch: { label: 'Новый' } }],
    ]))
    const object = presentation.at(1000).texts.note
    expect(object.before + object.hidden + object.after).toBe('Окончательный текст')
    expect(visible(presentation.at(2000).connections.new.label)).toBe('Новый')
  })

  it('does not show removed objects or connections, including links deleted with a node', () => {
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'connection.created', connection: { id: 'new', sourceId: 'a', targetId: 'b', label: 'Link' } }],
      [1100, { type: 'object.deleted', id: 'b' }],
    ]))
    expect(presentation.at(1100).texts.b).toBeUndefined()
    expect(presentation.at(1100).connections.new).toBeUndefined()
    expect(presentation.at(1050).connections.new.progress).toBeLessThan(1)
  })

  it('animates objects restored by undo/rebase while preserving unchanged initial objects', () => {
    const restored: FrameState = initialFrame()
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'object.deleted', id: 'b' }],
      [2000, { type: 'state.rebased', state: restored }],
    ]))
    const view = presentation.at(2200)
    expect(view.connections.ab.progress).toBeGreaterThan(0)
    expect(view.connections.ab.progress).toBeLessThan(1)
    expect(visible(view.texts.a)).toBe('Client')
    expect(view.texts.a.caret).toBe(false)
  })

  it('finishes drawing and typing at the recording end, even for a command at its last millisecond', () => {
    const segment = recording([
      [3950, { type: 'object.created', object: { ...note, text: 'Полностью готовый текст' } }],
      [4000, { type: 'connection.created', connection: { id: 'new', sourceId: 'a', targetId: 'b', label: 'Готово' } }],
    ])
    const view = new PlaybackPresentation(segment).at(4000)
    expect(visible(view.texts.note)).toBe('Полностью готовый текст')
    expect(view.texts.note.caret).toBe(false)
    expect(view.connections.new.progress).toBe(1)
    expect(visible(view.connections.new.label)).toBe('Готово')
    expect(view.frame).toEqual(reconstruct(segment, 4000))
  })

  it('shows completed commands and no caret when reduced motion is requested', () => {
    const segment = recording([
      [1000, { type: 'object.created', object: { ...note, text: 'Без движения' } }],
      [1000, { type: 'connection.created', connection: { id: 'new', sourceId: 'a', targetId: 'b', label: 'Запрос' } }],
    ])
    const view = new PlaybackPresentation(segment).at(1001, true)
    expect(visible(view.texts.note)).toBe('Без движения')
    expect(view.texts.note.caret).toBe(false)
    expect(view.connections.new.progress).toBe(1)
    expect(visible(view.connections.new.label)).toBe('Запрос')
  })

  it('does not mutate the recording or retain viewer edits to a returned frame', () => {
    const segment = recording([[1000, { type: 'object.created', object: note }]])
    const before = structuredClone(segment)
    const presentation = new PlaybackPresentation(segment)
    const view = presentation.at(1200)
    view.frame.board.objects.a.x = -500
    view.texts.note.before = 'Viewer edit'
    expect(presentation.at(1200).frame.board.objects.a.x).toBe(100)
    expect(presentation.at(1200).texts.note.before).not.toBe('Viewer edit')
    expect(segment).toEqual(before)
  })

  it('keeps the latest explanation in focus for compact viewers until another action', () => {
    const presentation = new PlaybackPresentation(recording([
      [1000, { type: 'object.created', object: note }],
      [2000, { type: 'connection.created', connection: { id: 'new', sourceId: 'a', targetId: 'b', label: '' } }],
      [3000, { type: 'selection.changed', ids: ['a'] }],
    ]))
    expect(presentation.at(1300).focusId).toBe('note')
    expect(presentation.at(1900).focusId).toBe('note')
    expect(presentation.at(2300).focusId).toBe('new')
    expect(presentation.at(3100).focusId).toBe('a')
    expect(presentation.at(1300).focusId).toBe('note')
  })
})
