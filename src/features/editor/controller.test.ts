import { describe, expect, it } from 'vitest'
import { EditorController } from './controller'
import { createProject } from '../../domain/project'
import { initialFrame, note } from '../../test/fixtures'
import { reconstruct } from '../../playback/reconstruct'
import type { Project } from '../../domain/types'

function fixture() {
  const project = createProject('Story', 'story', 0)
  project.workingState = initialFrame()
  return project
}

describe('editor recording and saving', () => {
  it('records the same commands that change the working board and saves the stopped take', async () => {
    let now = 0
    let id = 0
    const saved: Project[] = []
    const editor = new EditorController(fixture(), async project => { saved.push(structuredClone(project)) }, {
      clock: () => now, createId: () => 'id-' + id++, saveDelay: 60_000,
    })
    editor.startRecording()
    now = 1000
    editor.dispatch({ type: 'object.created', object: note })
    now = 2000
    editor.dispatch({ type: 'object.updated', id: 'a', patch: { x: 300 } })
    now = 3000
    editor.stopRecording()
    await editor.flush()
    const project = saved.at(-1)
    expect(project?.rootSegmentId).toBeTruthy()
    const segment = project?.rootSegmentId ? project.segments[project.rootSegmentId] : null
    expect(segment?.events.map(event => event.tMs)).toEqual([1000, 2000])
    expect(segment?.durationMs).toBe(3000)
    expect(editor.getSnapshot().project.workingState.board.objects.a.x).toBe(300)
    expect(editor.getSnapshot().saveState).toBe('saved')
    editor.dispose()
  })

  it('groups a drag into a single undo action and records undo as a new transition', () => {
    let id = 0
    const editor = new EditorController(fixture(), async () => {}, {
      clock: () => 0, createId: () => 'id-' + id++, saveDelay: 60_000,
    })
    editor.startRecording()
    expect(editor.getSnapshot().isRecording).toBe(true)
    editor.beginGesture()
    editor.dispatch({ type: 'object.updated', id: 'a', patch: { x: 200 } })
    editor.dispatch({ type: 'object.updated', id: 'a', patch: { x: 300 } })
    editor.endGesture()
    editor.undo()
    editor.stopRecording()
    const snapshot = editor.getSnapshot()
    const segment = snapshot.project.segments[snapshot.project.rootSegmentId!]
    expect(snapshot.project.workingState.board.objects.a.x).toBe(100)
    expect(reconstruct(segment, segment.durationMs).board.objects.a.x).toBe(100)
    expect(snapshot.canUndo).toBe(false)
    expect(snapshot.canRedo).toBe(true)
    editor.dispose()
  })

  it('keeps previously recorded takes when a new recording starts', () => {
    let id = 0
    const editor = new EditorController(fixture(), async () => {}, {
      createId: () => 'id-' + id++, saveDelay: 60_000,
    })
    editor.startRecording()
    editor.stopRecording()
    const firstId = editor.getSnapshot().project.rootSegmentId
    editor.startRecording()
    editor.stopRecording()
    expect(Object.keys(editor.getSnapshot().project.segments)).toHaveLength(2)
    expect(editor.getSnapshot().project.segments[firstId!]).toBeDefined()
    editor.dispose()
  })

  it('returns stable snapshots until a real state change', () => {
    const editor = new EditorController(fixture(), async () => {}, { saveDelay: 60_000 })
    const initial = editor.getSnapshot()
    expect(editor.getSnapshot()).toBe(initial)
    editor.setTitle('Renamed')
    expect(editor.getSnapshot()).not.toBe(initial)
    expect(editor.getSnapshot().project.title).toBe('Renamed')
    editor.dispose()
  })

  it('captures the author viewport in the initial camera without an artificial event', () => {
    const editor = new EditorController(fixture(), async () => {}, { saveDelay: 60_000 })
    editor.startRecording({ width: 900, height: 600 })
    const project = editor.getSnapshot().project
    expect(project.segments[project.rootSegmentId!].initialState.camera.viewportWidth).toBe(900)
    expect(project.segments[project.rootSegmentId!].initialState.camera.viewportHeight).toBe(600)
    expect(project.segments[project.rootSegmentId!].events).toHaveLength(0)
    editor.dispose()
  })

  it('uses the last committed revision as the base for batched writes', async () => {
    const expected: (number | undefined)[] = []
    const editor = new EditorController(fixture(), async (_project, revision?: number) => { expected.push(revision) }, { saveDelay: 60_000 })
    editor.dispatch({ type: 'object.updated', id: 'a', patch: { x: 200 } })
    editor.dispatch({ type: 'object.updated', id: 'a', patch: { x: 250 } })
    await editor.flush()
    editor.dispatch({ type: 'object.updated', id: 'b', patch: { text: 'Changed' } })
    await editor.flush()
    expect(expected).toEqual([0, 2])
    editor.dispose()
  })

  it('preserves the current author camera and viewport when undo crosses recording start', () => {
    let id = 0
    const editor = new EditorController(fixture(), async () => {}, {
      clock: () => 0, createId: () => 'id-' + id++, saveDelay: 60_000,
    })
    editor.dispatch({ type: 'object.updated', id: 'a', patch: { x: 240 } })
    editor.startRecording({ width: 900, height: 600 })
    editor.dispatch({ type: 'camera.changed', camera: { x: 50, y: 20, zoom: 1.2, viewportWidth: 900, viewportHeight: 600 } })
    const camera = editor.getSnapshot().project.workingState.camera
    editor.undo()
    expect(editor.getSnapshot().project.workingState.camera).toEqual(camera)
    editor.redo()
    expect(editor.getSnapshot().project.workingState.camera).toEqual(camera)
    editor.stopRecording()
    const project = editor.getSnapshot().project
    const segment = project.segments[project.rootSegmentId!]
    expect(reconstruct(segment, segment.durationMs).camera).toEqual(camera)
    editor.dispose()
  })
})
