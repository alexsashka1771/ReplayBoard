import type { FrameCommand, FrameState, Project } from '../../domain/types'
import type { SaveState } from '../../storage/autosave'
import { Autosave } from '../../storage/autosave'
import { recoverProject } from '../../domain/project'
import { applyFrameCommand } from '../../domain/board'
import { Recorder } from '../../recording/recorder'

export interface EditorSnapshot {
  project: Project
  isRecording: boolean
  saveState: SaveState
  saveError: string | null
  recovered: boolean
  canUndo: boolean
  canRedo: boolean
}

export interface EditorOptions {
  clock?: () => number
  createId?: () => string
  saveDelay?: number
}

export class EditorController {
  private snapshot: EditorSnapshot
  private listeners = new Set<() => void>()
  private autosave: Autosave
  private recorder: Recorder | null = null
  private undoStack: FrameState[] = []
  private redoStack: FrameState[] = []
  private gestureStart: FrameState | null = null
  private clock: () => number
  private createId: () => string
  private committedRevision: number

  constructor(project: Project, writer: (project: Project, expectedRevision: number) => Promise<void>, options: EditorOptions = {}) {
    const recovered = recoverProject(project)
    this.snapshot = {
      project: recovered.project, isRecording: false, saveState: 'saved', saveError: null,
      recovered: recovered.interrupted, canUndo: false, canRedo: false,
    }
    this.clock = options.clock ?? (() => performance.now())
    this.createId = options.createId ?? (() => crypto.randomUUID())
    this.committedRevision = project.revision
    this.autosave = new Autosave(async value => {
      await writer(value, this.committedRevision)
      this.committedRevision = value.revision
    }, (saveState, saveError) => {
      this.snapshot = { ...this.snapshot, saveState, saveError }
      this.emit()
    }, options.saveDelay)
    if (recovered.interrupted) this.autosave.schedule(this.snapshot.project)
  }

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit() { for (const listener of this.listeners) listener() }

  private commit(project: Project, extra: Partial<EditorSnapshot> = {}) {
    this.snapshot = {
      ...this.snapshot, ...extra,
      project: { ...project, revision: this.snapshot.project.revision + 1, updatedAt: Date.now() },
      canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0,
    }
    this.autosave.schedule(this.snapshot.project)
  }

  dispatch(command: FrameCommand, remember = true) {
    const project = this.snapshot.project
    const workingState = applyFrameCommand(project.workingState, command)
    const changesBoard = command.type.startsWith('object.') || command.type.startsWith('connection.')
    if (remember && changesBoard && !this.gestureStart) {
      this.undoStack.push(project.workingState)
      this.redoStack = []
    }
    let segments = project.segments
    if (this.snapshot.isRecording && this.recorder) {
      this.recorder.record(command)
      const segment = this.recorder.snapshot()
      segments = { ...segments, [segment.segmentId]: segment }
    }
    this.commit({ ...project, workingState, segments })
  }

  startRecording(viewport?: { width: number; height: number }) {
    if (this.snapshot.isRecording) return
    const project = this.snapshot.project
    const initialState = viewport ? { ...project.workingState, camera: {
      ...project.workingState.camera, viewportWidth: viewport.width, viewportHeight: viewport.height,
    } } : project.workingState
    this.recorder = new Recorder(this.clock, this.createId)
    this.recorder.start(initialState, this.createId(), 'Запись ' + (Object.keys(project.segments).length + 1))
    const segment = this.recorder.snapshot()
    this.commit({ ...project, workingState: initialState, rootSegmentId: segment.segmentId, segments: { ...project.segments, [segment.segmentId]: segment } }, {
      isRecording: true, recovered: false,
    })
  }

  stopRecording() {
    if (!this.snapshot.isRecording || !this.recorder) return
    this.endGesture()
    const segment = this.recorder.stop()
    this.commit({ ...this.snapshot.project, segments: { ...this.snapshot.project.segments, [segment.segmentId]: segment } }, {
      isRecording: false,
    })
  }

  beginGesture() { this.gestureStart ??= this.snapshot.project.workingState }

  endGesture() {
    if (this.gestureStart && this.gestureStart.board !== this.snapshot.project.workingState.board) {
      this.undoStack.push(this.gestureStart)
      this.redoStack = []
    }
    this.gestureStart = null
    this.snapshot = { ...this.snapshot, canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 }
    this.emit()
  }

  undo() {
    const previous = this.undoStack.pop()
    if (!previous) return
    this.redoStack.push(this.snapshot.project.workingState)
    this.restoreBoard(previous)
  }

  redo() {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(this.snapshot.project.workingState)
    this.restoreBoard(next)
  }

  private restoreBoard(frame: FrameState) {
    this.dispatch({ type: 'state.rebased', state: {
      ...this.snapshot.project.workingState, board: frame.board, selection: frame.selection,
    } }, false)
  }

  setTitle(title: string) {
    this.commit({ ...this.snapshot.project, title: title.trim() || 'Без названия' })
  }

  selectTake(segmentId: string) {
    if (this.snapshot.isRecording || !Object.hasOwn(this.snapshot.project.segments, segmentId)) return
    this.commit({ ...this.snapshot.project, rootSegmentId: segmentId })
  }

  elapsed() {
    if (this.snapshot.isRecording && this.recorder) return this.recorder.snapshot().durationMs
    const id = this.snapshot.project.rootSegmentId
    return id ? this.snapshot.project.segments[id].durationMs : 0
  }

  heartbeat() {
    if (!this.snapshot.isRecording || !this.recorder) return
    const segment = this.recorder.snapshot()
    this.commit({ ...this.snapshot.project, segments: { ...this.snapshot.project.segments, [segment.segmentId]: segment } })
  }

  flush() { return this.autosave.flush() }

  dispose() {
    this.autosave.dispose()
    void this.autosave.flush()
  }
}
