import { useId } from 'react'
import type { BoardState } from '../../domain/types'
import { connectionGeometry } from './geometry'
import { BoardText } from './BoardText'
import { completeText } from '../../playback/presentation'

export function BoardPreview({ board }: { board: BoardState }) {
  const id = useId()
  const objects = Object.values(board.objects)
  const left = objects.length ? Math.min(...objects.map(object => object.x)) - 50 : 0
  const top = objects.length ? Math.min(...objects.map(object => object.y)) - 50 : 0
  const width = objects.length ? Math.max(...objects.map(object => object.x + object.width)) - left + 50 : 600
  const height = objects.length ? Math.max(...objects.map(object => object.y + object.height)) - top + 50 : 300
  return <div className="board-preview">
    <svg viewBox={[left, top, width, height].join(' ')} aria-hidden="true">
      <defs><marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="#777a93" strokeWidth="2" />
      </marker></defs>
      {Object.values(board.connections).map(connection => {
        const source = board.objects[connection.sourceId]
        const target = board.objects[connection.targetId]
        return source && target ? <path key={connection.id} d={connectionGeometry(source, target).path}
          fill="none" stroke="#777a93" strokeWidth="3" markerEnd={'url(#' + id + ')'} /> : null
      })}
      {objects.map(object => <g key={object.id} transform={'translate(' + object.x + ' ' + object.y + ')'}>
        {object.type === 'block' ? <rect width={object.width} height={object.height}
          rx="15" className={'node-fill node-fill-' + object.color} stroke="#d6d3cb" strokeWidth="2" /> : null}
        <BoardText object={object} reveal={completeText(object.text)} />
      </g>)}
      {objects.length === 0 ? <g fill="none" stroke="#d9d5cc" strokeWidth="2">
        <rect x="185" y="100" width="100" height="75" rx="12" />
        <path d="M300 137h38m-10-8 10 8-10 8" />
        <rect x="355" y="100" width="65" height="75" rx="12" />
      </g> : null}
    </svg>
  </div>
}
