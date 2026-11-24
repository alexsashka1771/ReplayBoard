import { describe, expect, it } from 'vitest'
import { DraftRepository } from './drafts'
import { createProject } from '../domain/project'
import { recordedSegment } from '../test/fixtures'

describe('local drafts in IndexedDB', () => {
  it('restores the board and full recording after closing and reopening storage', async () => {
    const name = 'draft-test-' + crypto.randomUUID()
    const project = createProject('Persistent story', 'story', 1000)
    const segment = recordedSegment()
    project.rootSegmentId = segment.segmentId
    project.segments[segment.segmentId] = segment
    project.workingState = segment.initialState
    const first = new DraftRepository(name)
    await first.save(project, null)
    first.close()
    const reopened = new DraftRepository(name)
    expect(await reopened.load('story')).toEqual(project)
    reopened.close()
  })

  it('lists real saved projects in descending update order', async () => {
    const store = new DraftRepository('draft-test-' + crypto.randomUUID())
    await store.save(createProject('Older', 'old', 1000), null)
    await store.save(createProject('Newer', 'new', 2000), null)
    expect((await store.list()).map(project => project.title)).toEqual(['Newer', 'Older'])
    store.close()
  })

  it('does not overwrite a newer committed revision with a stale write', async () => {
    const store = new DraftRepository('draft-test-' + crypto.randomUUID())
    const project = createProject('Story', 'story', 1000)
    await store.save({ ...project, revision: 2, title: 'New revision' }, null)
    await expect(store.save({ ...project, revision: 1 }, 2)).rejects.toThrow()
    expect((await store.load('story'))?.title).toBe('New revision')
    store.close()
  })

  it('rejects conflicting content at the same revision', async () => {
    const store = new DraftRepository('draft-test-' + crypto.randomUUID())
    const project = createProject('Story', 'story', 1000)
    await store.save(project, null)
    await expect(store.save({ ...project, title: 'Different tab' }, 0)).rejects.toThrow()
    store.close()
  })

  it('rejects a stale branch even when its local edit count is higher', async () => {
    const name = 'draft-test-' + crypto.randomUUID()
    const first = new DraftRepository(name)
    const second = new DraftRepository(name)
    const base = createProject('Shared story', 'shared', 0)
    await first.save(base, null)
    const stale = await second.load('shared')
    const segment = recordedSegment()
    const recorded = { ...base, revision: 4, rootSegmentId: segment.segmentId, segments: { [segment.segmentId]: segment } }
    await first.save(recorded, 0)
    await expect(second.save({ ...stale!, revision: 8, title: 'Stale branch' }, 0)).rejects.toThrow()
    expect((await first.load('shared'))?.segments[segment.segmentId]).toEqual(segment)
    first.close()
    second.close()
  })
})
