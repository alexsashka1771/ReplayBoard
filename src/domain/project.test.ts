import { describe, expect, it } from 'vitest'
import { createProject, parseProject, recoverProject } from './project'
import { recordedSegment } from '../test/fixtures'

describe('project format', () => {
  it('creates a versioned independent blank project', () => {
    const project = createProject('Architecture', 'project', 1000)
    expect(project.formatVersion).toBe(1)
    expect(project.projectId).toBe('project')
    expect(project.createdAt).toBe(1000)
    expect(project.workingState.board.objects).toEqual({})
  })

  it('rejects unsupported versions instead of partially loading them', () => {
    expect(() => parseProject({ ...createProject('Test', 'p', 0), formatVersion: 99 })).toThrow()
  })

  it('rejects invalid timelines and broken object references', () => {
    const project = createProject('Test', 'p', 0)
    const segment = recordedSegment()
    segment.events[0].tMs = 5000
    project.segments = { [segment.segmentId]: segment }
    project.rootSegmentId = segment.segmentId
    expect(() => parseProject(project)).toThrow()
  })

  it('returns an independent validated document', () => {
    const project = createProject('Test', 'p', 0)
    expect(parseProject(project)).not.toBe(project)
  })

  it('marks a persisted running take as interrupted without losing its events', () => {
    const project = createProject('Test', 'p', 0)
    const segment = { ...recordedSegment(), status: 'recording' as const }
    project.segments = { [segment.segmentId]: segment }
    project.rootSegmentId = segment.segmentId
    const recovered = recoverProject(project)
    expect(recovered.interrupted).toBe(true)
    expect(recovered.project.segments[segment.segmentId].status).toBe('interrupted')
    expect(recovered.project.segments[segment.segmentId].events).toEqual(segment.events)
    expect(segment.status).toBe('recording')
  })
})
