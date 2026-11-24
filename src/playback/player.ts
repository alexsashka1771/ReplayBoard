export class PlaybackClock {
  private basePosition = 0
  private anchorTime = 0
  private active = false
  private rate = 1

  constructor(private durationMs: number, private clock: () => number = () => performance.now()) {}

  play() {
    if (this.active) return
    if (this.basePosition >= this.durationMs) this.basePosition = 0
    this.anchorTime = this.clock()
    this.active = this.durationMs > 0
  }

  pause() {
    this.basePosition = this.position()
    this.active = false
  }

  seek(positionMs: number) {
    if (!Number.isFinite(positionMs)) throw new Error('Invalid playback position')
    this.basePosition = Math.max(0, Math.min(positionMs, this.durationMs))
    this.anchorTime = this.clock()
    if (this.basePosition >= this.durationMs) this.active = false
  }

  setRate(rate: number) {
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid playback rate')
    this.basePosition = this.position()
    this.anchorTime = this.clock()
    this.rate = rate
  }

  position() {
    if (!this.active) return this.basePosition
    const position = Math.min(this.durationMs, this.basePosition + (this.clock() - this.anchorTime) * this.rate)
    if (position >= this.durationMs) {
      this.basePosition = this.durationMs
      this.active = false
    }
    return position
  }

  isPlaying() {
    this.position()
    return this.active
  }
}
