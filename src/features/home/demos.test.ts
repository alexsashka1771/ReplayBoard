import { describe, expect, it } from 'vitest'
import { getDemos } from './demos'
import { parseProject } from '../../domain/project'
import { reconstruct } from '../../playback/reconstruct'

describe('sample stories', () => {
  it('provides two valid recordings that evolve from their starting state', () => {
    const demos = getDemos()
    expect(demos.map(demo => demo.project.title)).toEqual(['Почему заказ создался дважды?', 'Бинарный поиск'])
    for (const demo of demos) {
      const project = parseProject(demo.project)
      const segment = project.segments[project.rootSegmentId!]
      expect(segment.events.length).toBeGreaterThan(0)
      expect(reconstruct(segment, 0).board).not.toEqual(reconstruct(segment, segment.durationMs).board)
      expect(reconstruct(segment, segment.durationMs)).toEqual(project.workingState)
    }
  })
})
