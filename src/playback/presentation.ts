import { applyFrameCommand } from '../domain/board'
import type { FrameState, RecordingSegment } from '../domain/types'
import { reconstruct } from './reconstruct'

export interface TextReveal {
  before: string
  hidden: string
  after: string
  caret: boolean
}

export interface ConnectionReveal {
  progress: number
  label: TextReveal
}

export interface PresentedFrame {
  frame: FrameState
  texts: Record<string, TextReveal>
  connections: Record<string, ConnectionReveal>
  focusId?: string
}

interface DrawCue {
  atMs: number
  endMs: number
}

interface TextCue extends DrawCue {
  startMs: number
  caretUntilMs: number
  graphemes: string[]
  prefix: number
  inserted: number
}

const segmenter = new Intl.Segmenter('ru', { granularity: 'grapheme' })
export function graphemes(text: string): string[] {
  return Array.from(segmenter.segment(text), part => part.segment)
}

export function completeText(text: string): TextReveal {
  return { before: text, hidden: '', after: '', caret: false }
}

function latest<T extends { atMs: number }>(cues: T[] | undefined, position: number): T | undefined {
  if (!cues) return undefined
  let low = 0
  let high = cues.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (cues[middle].atMs <= position) low = middle + 1
    else high = middle
  }
  return cues[low - 1]
}

function progressAt(start: number, end: number, position: number) {
  if (position >= end) return 1
  if (position <= start) return 0
  return (position - start) / (end - start)
}

function revealText(cue: TextCue | undefined, target: string, position: number): TextReveal {
  if (!cue) return completeText(target)
  const progress = progressAt(cue.startMs, cue.endMs, position)
  const caret = position >= cue.startMs && position < cue.caretUntilMs &&
    (position - cue.startMs) % 560 < 400
  if (progress === 1 && !caret) return completeText(target)
  const count = Math.floor(cue.inserted * progress)
  const boundary = cue.prefix + count
  return {
    before: cue.graphemes.slice(0, boundary).join(''),
    hidden: cue.graphemes.slice(boundary, cue.prefix + cue.inserted).join(''),
    after: cue.graphemes.slice(cue.prefix + cue.inserted).join(''),
    caret,
  }
}

/** Presentation is sampled from story time; it never writes to the recorded state. */
export class PlaybackPresentation {
  private texts = new Map<string, TextCue[]>()
  private labels = new Map<string, TextCue[]>()
  private drawings = new Map<string, DrawCue[]>()
  private focuses: { atMs: number; id: string }[] = []

  constructor(private segment: RecordingSegment) {
    let previous = structuredClone(segment.initialState)
    for (const event of segment.events) {
      const next = applyFrameCommand(previous, event.command)
      if (next.board !== previous.board) {
        for (const object of Object.values(next.board.objects)) {
          const old = previous.board.objects[object.id]
          if (!old || old.text !== object.text) {
            this.addText(this.texts, object.id, old?.text ?? '', object.text, event.tMs)
          }
        }
        for (const connection of Object.values(next.board.connections)) {
          const old = previous.board.connections[connection.id]
          if (!old || old.sourceId !== connection.sourceId || old.targetId !== connection.targetId) {
            const track = this.drawings.get(connection.id) ?? []
            const cue = { atMs: event.tMs, endMs: Math.min(event.tMs + 760, segment.durationMs) }
            this.cap(track, event.tMs)
            track.push(cue)
            this.drawings.set(connection.id, track)
            this.addText(this.labels, connection.id, '', connection.label, event.tMs,
              event.tMs + (cue.endMs - event.tMs) / 2)
          } else if (old.label !== connection.label) {
            this.addText(this.labels, connection.id, old.label, connection.label, event.tMs)
          }
        }
        for (const id of Object.keys(previous.board.objects)) {
          if (!next.board.objects[id]) this.cap(this.texts.get(id), event.tMs)
        }
        for (const id of Object.keys(previous.board.connections)) {
          if (!next.board.connections[id]) {
            this.cap(this.labels.get(id), event.tMs)
            this.cap(this.drawings.get(id), event.tMs)
          }
        }
      }
      previous = next
    }
  }

  private cap(cues: DrawCue[] | undefined, atMs: number) {
    const previous = cues?.at(-1)
    if (!previous) return
    previous.endMs = Math.min(previous.endMs, atMs)
    if ('caretUntilMs' in previous) {
      const text = previous as TextCue
      text.caretUntilMs = Math.min(text.caretUntilMs, atMs)
    }
  }

  private addText(tracks: Map<string, TextCue[]>, id: string, from: string, target: string, atMs: number, startMs = atMs) {
    this.focuses.push({ atMs, id })
    const track = tracks.get(id) ?? []
    const old = graphemes(from)
    const next = graphemes(target)
    let prefix = 0
    while (prefix < Math.min(old.length, next.length) && old[prefix] === next[prefix]) prefix++
    let suffix = 0
    while (suffix < Math.min(old.length, next.length) - prefix &&
      old[old.length - suffix - 1] === next[next.length - suffix - 1]) suffix++
    const inserted = next.length - prefix - suffix
    const duration = inserted <= 1 ? 0 : Math.min(1600, Math.max(180, inserted * 38))
    const endMs = Math.min(startMs + duration, this.segment.durationMs)
    this.cap(track, atMs)
    track.push({
      atMs, startMs, endMs, graphemes: next, prefix, inserted,
      caretUntilMs: Math.min(this.segment.durationMs, duration ? endMs : startMs + 300),
    })
    tracks.set(id, track)
  }

  at(positionMs: number, reducedMotion = false): PresentedFrame {
    const frame = reconstruct(this.segment, positionMs)
    const position = Math.max(0, Math.min(positionMs, this.segment.durationMs))
    const texts = Object.fromEntries(Object.values(frame.board.objects).map(object => [object.id,
      reducedMotion ? completeText(object.text) : revealText(latest(this.texts.get(object.id), position), object.text, position),
    ]))
    const connections = Object.fromEntries(Object.values(frame.board.connections).map(connection => {
      const cue = latest(this.drawings.get(connection.id), position)
      const progress = reducedMotion || !cue ? 1 : progressAt(cue.atMs, cue.endMs, position)
      return [connection.id, {
        progress: progress * progress * (3 - 2 * progress),
        label: reducedMotion ? completeText(connection.label) : revealText(
          latest(this.labels.get(connection.id), position), connection.label, position,
        ),
      }]
    }))
    let focusId = frame.selection[0]
    if (!focusId) {
      for (let index = this.focuses.length - 1; index >= 0; index--) {
        const candidate = this.focuses[index]
        if (candidate.atMs <= position &&
            (Object.hasOwn(frame.board.objects, candidate.id) || Object.hasOwn(frame.board.connections, candidate.id))) {
          focusId = candidate.id
          break
        }
      }
    }
    return { frame, texts, connections, focusId }
  }
}
