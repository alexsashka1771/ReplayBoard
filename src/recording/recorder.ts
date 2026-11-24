import type { FrameCommand, FrameState, RecordingSegment } from '../domain/types'

export class Recorder {
  private segment: RecordingSegment | null = null
  private startedAt = 0
  constructor(
    private clock: () => number = () => performance.now(),
    private createId: () => string = () => crypto.randomUUID(),
  ) {}

  start(state: FrameState, segmentId: string, title: string) {
    if (this.segment?.status === 'recording') throw new Error('Recording is already active')
    this.startedAt = this.clock()
    this.segment = {
      segmentId, title, initialState: structuredClone(state),
      events: [], durationMs: 0, status: 'recording',
    }
  }
  record(command: FrameCommand) {
    const current = this.snapshot()
    if (current.status !== 'recording') throw new Error('Recording is not active')
    this.segment = {
      ...current,
      events: [...current.events, {
        eventId: this.createId(), tMs: current.durationMs, seq: current.events.length,
        command: structuredClone(command),
      }],
    }
  }

  snapshot(): RecordingSegment {
    if (!this.segment) throw new Error('Recording has not started')
    if (this.segment.status !== 'recording') return this.segment
    const previousTime = this.segment.events.at(-1)?.tMs ?? 0
    return { ...this.segment, durationMs: Math.max(previousTime, Math.round(this.clock() - this.startedAt), 0) }
  }

  stop(): RecordingSegment {
    this.segment = { ...this.snapshot(), status: 'stopped' }
    return this.segment
  }
}
