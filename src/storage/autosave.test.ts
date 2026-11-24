import { describe, expect, it, vi } from 'vitest'
import { Autosave } from './autosave'
import type { SaveState } from './autosave'
import { createProject } from '../domain/project'
import type { Project } from '../domain/types'

describe('autosave commit state', () => {
  it('serializes writes and reports saved only after the newest revision commits', async () => {
    const writes: Project[] = []
    const releases: (() => void)[] = []
    const states: SaveState[] = []
    const autosave = new Autosave(
      project => new Promise<void>(resolve => { writes.push(project); releases.push(resolve) }),
      state => states.push(state),
      60_000,
    )
    const base = createProject('Story', 'p', 0)
    autosave.schedule({ ...base, revision: 1 })
    const flushing = autosave.flush()
    expect(writes.map(project => project.revision)).toEqual([1])
    autosave.schedule({ ...base, revision: 2 })
    releases[0]()
    await new Promise(resolve => setImmediate(resolve))
    expect(states).not.toContain('saved')
    expect(writes.map(project => project.revision)).toEqual([1, 2])
    releases[1]()
    await flushing
    expect(states.at(-1)).toBe('saved')
    autosave.dispose()
  })

  it('keeps a failed draft pending and allows an explicit retry', async () => {
    let fail = true
    const states: SaveState[] = []
    const errors: (string | null)[] = []
    const autosave = new Autosave(
      async () => { if (fail) throw new DOMException('Storage is full', 'QuotaExceededError') },
      (state, error) => { states.push(state); errors.push(error) },
      60_000,
    )
    autosave.schedule(createProject('Story', 'p', 0))
    expect(await autosave.flush()).toBe(false)
    expect(states.at(-1)).toBe('error')
    expect(errors.at(-1)).toBeTruthy()
    fail = false
    expect(await autosave.flush()).toBe(true)
    expect(states.at(-1)).toBe('saved')
    autosave.dispose()
  })

  it('commits periodically during a continuous stream of edits', async () => {
    vi.useFakeTimers()
    const writes: number[] = []
    const autosave = new Autosave(async project => { writes.push(project.revision) }, () => {}, 250)
    try {
      const project = createProject('Continuous recording', 'p', 0)
      for (let revision = 1; revision <= 40; revision++) {
        autosave.schedule({ ...project, revision })
        await vi.advanceTimersByTimeAsync(20)
      }
      expect(writes.length).toBeGreaterThan(0)
      expect(writes.at(-1)).toBeGreaterThan(20)
      await autosave.flush()
      expect(writes.at(-1)).toBe(40)
    } finally {
      autosave.dispose()
      vi.useRealTimers()
    }
  })
})
