import type { BoardCommand, BoardObject, BoardState, FrameCommand, FrameState } from './types'

const objectColors = new Set(['paper', 'blue', 'mint', 'peach', 'lavender'])

export function validateObject(object: BoardObject) {
  if (!object.id || !['block', 'text'].includes(object.type) ||
      ![object.x, object.y, object.width, object.height].every(Number.isFinite) ||
      object.width < 40 || object.height < 24 ||
      typeof object.text !== 'string' || !objectColors.has(object.color)) {
    throw new Error('Invalid board object')
  }
}

export function applyBoardCommand(state: BoardState, command: BoardCommand): BoardState {
  switch (command.type) {
    case 'object.created': {
      validateObject(command.object)
      if (Object.hasOwn(state.objects, command.object.id) || Object.hasOwn(state.connections, command.object.id)) {
        throw new Error('Object ID already exists')
      }
      return { ...state, objects: { ...state.objects, [command.object.id]: { ...command.object } } }
    }
    case 'object.updated': {
      const previous = state.objects[command.id]
      if (!previous) throw new Error('Object does not exist')
      const object = { ...previous, ...command.patch, id: previous.id, type: previous.type }
      validateObject(object)
      return { ...state, objects: { ...state.objects, [command.id]: object } }
    }
    case 'object.deleted':
      return {
        objects: Object.fromEntries(Object.entries(state.objects).filter(([id]) => id !== command.id)),
        connections: Object.fromEntries(Object.entries(state.connections).filter(
          ([, connection]) => connection.sourceId !== command.id && connection.targetId !== command.id,
        )),
      }
    case 'connection.created': {
      const connection = command.connection
      if (!connection.id || connection.sourceId === connection.targetId ||
          state.objects[connection.sourceId]?.type !== 'block' ||
          state.objects[connection.targetId]?.type !== 'block' ||
          Object.hasOwn(state.connections, connection.id) || Object.hasOwn(state.objects, connection.id) ||
          typeof connection.label !== 'string') {
        throw new Error('Invalid connection')
      }
      return { ...state, connections: { ...state.connections, [connection.id]: { ...connection } } }
    }
    case 'connection.updated': {
      const previous = state.connections[command.id]
      if (!previous || typeof command.patch.label !== 'string') throw new Error('Invalid connection update')
      return { ...state, connections: { ...state.connections, [command.id]: { ...previous, ...command.patch } } }
    }
    case 'connection.deleted':
      return { ...state, connections: Object.fromEntries(
        Object.entries(state.connections).filter(([id]) => id !== command.id),
      ) }
  }
}

export function applyFrameCommand(state: FrameState, command: FrameCommand): FrameState {
  switch (command.type) {
    case 'state.rebased':
      return structuredClone(command.state)
    case 'camera.changed':
      if (![command.camera.x, command.camera.y, command.camera.zoom].every(Number.isFinite) || command.camera.zoom <= 0) {
        throw new Error('Invalid camera')
      }
      return { ...state, camera: { ...command.camera } }
    case 'pointer.moved':
      if (command.point && ![command.point.x, command.point.y].every(Number.isFinite)) {
        throw new Error('Invalid pointer')
      }
      return { ...state, pointer: command.point ? { ...command.point } : null }
    case 'selection.changed':
      return { ...state, selection: [...new Set(command.ids)].filter(
        id => Object.hasOwn(state.board.objects, id) || Object.hasOwn(state.board.connections, id),
      ) }
    default: {
      const board = applyBoardCommand(state.board, command)
      return { ...state, board, selection: state.selection.filter(
        id => Object.hasOwn(board.objects, id) || Object.hasOwn(board.connections, id),
      ) }
    }
  }
}
