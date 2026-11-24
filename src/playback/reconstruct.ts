import type { FrameState, RecordingSegment } from '../domain/types'
import { applyFrameCommand } from '../domain/board'

export function reconstruct(segment: RecordingSegment, positionMs: number): FrameState {
  if (!Number.isFinite(positionMs)) throw new Error('Invalid playback position')
  const position = Math.max(0, Math.min(segment.durationMs, positionMs))
  let frame = structuredClone(segment.initialState)
  for (const event of segment.events) {
    if (event.tMs > position) break
    frame = applyFrameCommand(frame, event.command)
  }
  return frame
}
