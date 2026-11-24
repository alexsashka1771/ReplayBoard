export type ObjectColor = 'paper' | 'blue' | 'mint' | 'peach' | 'lavender'

export interface BoardObject {
  id: string
  type: 'block' | 'text'
  x: number
  y: number
  width: number
  height: number
  text: string
  color: ObjectColor
}

export interface Connection {
  id: string
  sourceId: string
  targetId: string
  label: string
}

export interface BoardState {
  objects: Record<string, BoardObject>
  connections: Record<string, Connection>
}

export interface Camera {
  x: number
  y: number
  zoom: number
  viewportWidth?: number
  viewportHeight?: number
}

export interface Point {
  x: number
  y: number
}

export interface FrameState {
  board: BoardState
  camera: Camera
  selection: string[]
  pointer: Point | null
}

export type BoardCommand =
  | { type: 'object.created'; object: BoardObject }
  | { type: 'object.updated'; id: string; patch: Partial<Omit<BoardObject, 'id' | 'type'>> }
  | { type: 'object.deleted'; id: string }
  | { type: 'connection.created'; connection: Connection }
  | { type: 'connection.updated'; id: string; patch: { label: string } }
  | { type: 'connection.deleted'; id: string }

export type FrameCommand =
  | BoardCommand
  | { type: 'selection.changed'; ids: string[] }
  | { type: 'camera.changed'; camera: Camera }
  | { type: 'pointer.moved'; point: Point | null }
  | { type: 'state.rebased'; state: FrameState }

export interface RecordedEvent {
  eventId: string
  tMs: number
  seq: number
  command: FrameCommand
}

export interface RecordingSegment {
  segmentId: string
  title: string
  initialState: FrameState
  events: RecordedEvent[]
  durationMs: number
  status: 'recording' | 'stopped' | 'interrupted'
}

export interface Project {
  formatVersion: 1
  projectId: string
  title: string
  createdAt: number
  updatedAt: number
  revision: number
  workingState: FrameState
  rootSegmentId: string | null
  segments: Record<string, RecordingSegment>
}
