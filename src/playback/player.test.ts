import { describe, expect, it } from 'vitest'
import { PlaybackClock } from './player'

describe('audio-independent playback clock', () => {
  it('advances from elapsed real time', () => {
    let now = 1000
    const player = new PlaybackClock(5000, () => now)
    player.play()
    now = 1600
    expect(player.position()).toBe(600)
  })

  it('does not include wall time spent on pause', () => {
    let now = 0
    const player = new PlaybackClock(5000, () => now)
    player.play()
    now = 600
    player.pause()
    now = 2600
    expect(player.position()).toBe(600)
    player.play()
    now = 2800
    expect(player.position()).toBe(800)
  })

  it('changes rate without a discontinuity', () => {
    let now = 0
    const player = new PlaybackClock(5000, () => now)
    player.play()
    now = 500
    player.setRate(2)
    expect(player.position()).toBe(500)
    now = 1000
    expect(player.position()).toBe(1500)
  })

  it('clamps seeking and stops at the end', () => {
    let now = 0
    const player = new PlaybackClock(2000, () => now)
    player.seek(-100)
    expect(player.position()).toBe(0)
    player.seek(5000)
    expect(player.position()).toBe(2000)
    player.seek(1800)
    player.play()
    now = 300
    expect(player.position()).toBe(2000)
    expect(player.isPlaying()).toBe(false)
  })
})
