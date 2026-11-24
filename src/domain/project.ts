import type { BoardObject, FrameCommand, FrameState, Project, RecordingSegment } from './types'
import { applyFrameCommand, validateObject } from './board'
import { reconstruct } from '../playback/reconstruct'

export class ProjectFormatError extends Error {
  constructor(message = 'Не удалось прочитать проект: данные повреждены.') {
    super(message)
    this.name = 'ProjectFormatError'
  }
}

function ensure(condition: unknown): asserts condition {
  if (!condition) throw new ProjectFormatError()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateFrame(value: unknown): asserts value is FrameState {
  ensure(isRecord(value) && isRecord(value.board) && isRecord(value.board.objects) && isRecord(value.board.connections))
  const board = value.board
  for (const [id, object] of Object.entries(board.objects as Record<string, unknown>)) {
    ensure(isRecord(object) && object.id === id && typeof object.id === 'string')
    validateObject(object as unknown as BoardObject)
  }
  for (const [id, connection] of Object.entries(board.connections as Record<string, unknown>)) {
    ensure(isRecord(connection) && connection.id === id && typeof connection.label === 'string' &&
      typeof connection.sourceId === 'string' && typeof connection.targetId === 'string' &&
      connection.sourceId !== connection.targetId)
    const objects = board.objects as Record<string, BoardObject>
    ensure(objects[connection.sourceId]?.type === 'block' && objects[connection.targetId]?.type === 'block')
  }
  ensure(isRecord(value.camera) && [value.camera.x, value.camera.y, value.camera.zoom].every(isFiniteNumber) &&
    isFiniteNumber(value.camera.zoom) && value.camera.zoom > 0)
  ensure(value.camera.viewportWidth === undefined || (isFiniteNumber(value.camera.viewportWidth) && value.camera.viewportWidth > 0))
  ensure(value.camera.viewportHeight === undefined || (isFiniteNumber(value.camera.viewportHeight) && value.camera.viewportHeight > 0))
  ensure(Array.isArray(value.selection) && value.selection.every(id => typeof id === 'string'))
  ensure(value.pointer === null || (isRecord(value.pointer) &&
    isFiniteNumber(value.pointer.x) && isFiniteNumber(value.pointer.y)))
}

function validateCommand(value: unknown): asserts value is FrameCommand {
  ensure(isRecord(value) && typeof value.type === 'string')
  switch (value.type) {
    case 'object.created':
      ensure(isRecord(value.object) && typeof value.object.id === 'string')
      break
    case 'object.updated':
      ensure(typeof value.id === 'string' && isRecord(value.patch) &&
        Object.keys(value.patch).every(key => ['x', 'y', 'width', 'height', 'text', 'color'].includes(key)))
      break
    case 'object.deleted':
    case 'connection.deleted':
      ensure(typeof value.id === 'string')
      break
    case 'connection.created':
      ensure(isRecord(value.connection) && typeof value.connection.id === 'string')
      break
    case 'connection.updated':
      ensure(typeof value.id === 'string' && isRecord(value.patch) && typeof value.patch.label === 'string')
      break
    case 'selection.changed':
      ensure(Array.isArray(value.ids) && value.ids.every(id => typeof id === 'string'))
      break
    case 'camera.changed':
      ensure(isRecord(value.camera))
      break
    case 'pointer.moved':
      ensure(value.point === null || isRecord(value.point))
      break
    case 'state.rebased':
      validateFrame(value.state)
      break
    default:
      throw new ProjectFormatError()
  }
}

function validateSegment(value: unknown, segmentId: string): asserts value is RecordingSegment {
  ensure(isRecord(value) && value.segmentId === segmentId && typeof value.title === 'string' &&
    isFiniteNumber(value.durationMs) && value.durationMs >= 0 &&
    ['recording', 'stopped', 'interrupted'].includes(String(value.status)) && Array.isArray(value.events))
  validateFrame(value.initialState)
  let frame = structuredClone(value.initialState)
  let previousTime = -1
  let previousSequence = -1
  const eventIds = new Set<string>()
  for (const event of value.events) {
    ensure(isRecord(event) && typeof event.eventId === 'string' && !eventIds.has(event.eventId) &&
      isFiniteNumber(event.tMs) && Number.isInteger(event.tMs) && event.tMs >= previousTime &&
      event.tMs <= value.durationMs && event.tMs >= 0 &&
      isFiniteNumber(event.seq) && Number.isInteger(event.seq) && event.seq > previousSequence)
    eventIds.add(event.eventId)
    validateCommand(event.command)
    frame = applyFrameCommand(frame, event.command)
    previousTime = event.tMs
    previousSequence = event.seq
  }
}

export function createProject(title: string, projectId: string = crypto.randomUUID(), now = Date.now()): Project {
  return {
    formatVersion: 1, projectId, title: title.trim() || 'Без названия', createdAt: now, updatedAt: now, revision: 0,
    workingState: { board: { objects: {}, connections: {} }, camera: { x: 0, y: 0, zoom: 1 }, selection: [], pointer: null },
    rootSegmentId: null, segments: {},
  }
}

export function parseProject(value: unknown): Project {
  if (!isRecord(value) || value.formatVersion !== 1) {
    throw new ProjectFormatError('Этот проект использует неподдерживаемую версию Replay Board.')
  }
  ensure(typeof value.projectId === 'string' && value.projectId.length > 0 && typeof value.title === 'string' &&
    isFiniteNumber(value.createdAt) && isFiniteNumber(value.updatedAt) &&
    isFiniteNumber(value.revision) && Number.isInteger(value.revision) && value.revision >= 0 &&
    isRecord(value.segments) && (value.rootSegmentId === null || typeof value.rootSegmentId === 'string'))
  validateFrame(value.workingState)
  for (const [id, segment] of Object.entries(value.segments)) validateSegment(segment, id)
  if (value.rootSegmentId !== null) ensure(Object.hasOwn(value.segments, value.rootSegmentId))
  return structuredClone(value) as unknown as Project
}

export function recoverProject(project: Project): { project: Project; interrupted: boolean } {
  const recovered = parseProject(project)
  const active = Object.values(recovered.segments).filter(segment => segment.status === 'recording')
  if (active.length === 0) return { project: recovered, interrupted: false }
  for (const segment of active) recovered.segments[segment.segmentId] = { ...segment, status: 'interrupted' }
  const root = recovered.rootSegmentId ? recovered.segments[recovered.rootSegmentId] : null
  if (root && active.some(segment => segment.segmentId === root.segmentId)) {
    recovered.workingState = reconstruct(root, root.durationMs)
  }
  recovered.revision++
  return { project: recovered, interrupted: true }
}
