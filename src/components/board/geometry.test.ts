import { describe, expect, it } from 'vitest'
import { connectionGeometry, displayCamera, fitCamera, toBoardPoint } from './geometry'
import { blockA, blockB, initialFrame } from '../../test/fixtures'

describe('board geometry', () => {
  it('anchors an arrow to the current bounds of both connected objects', () => {
    const first = connectionGeometry(blockA, blockB)
    expect(first.from).toEqual({ x: 280, y: 170 })
    expect(first.to).toEqual({ x: 400, y: 170 })
    const moved = connectionGeometry(blockA, { ...blockB, x: 500, width: 220 })
    expect(moved.to).toEqual({ x: 500, y: 170 })
  })

  it('maps pointer coordinates back through the camera transform', () => {
    expect(toBoardPoint({ x: 300, y: 250 }, { x: 100, y: 50, zoom: 2 })).toEqual({ x: 100, y: 100 })
  })

  it('draws only the first half of a connection and places its tip on that curve', () => {
    const half = connectionGeometry(blockA, blockB, 0.5)
    expect(half.tip).toEqual({ x: 340, y: 170 })
    expect(half.path).not.toBe(connectionGeometry(blockA, blockB).path)
    expect(half.path).toContain('340 170')
    expect(half.to).toEqual({ x: 400, y: 170 })
  })

  it('updates a partially drawn connection when its target moves', () => {
    const partial = connectionGeometry(blockA, { ...blockB, x: 500, y: 210 }, 0.5)
    expect(partial.tip).toEqual({ x: 390, y: 215 })
    expect(connectionGeometry(blockA, blockB, 0).tip).toEqual({ x: 280, y: 170 })
    expect(connectionGeometry(blockA, blockB, 1).tip).toEqual({ x: 400, y: 170 })
  })

  it('fits the complete board into the viewport with space around objects', () => {
    const camera = fitCamera(initialFrame().board, 1000, 600)
    const left = blockA.x * camera.zoom + camera.x
    const right = (blockB.x + blockB.width) * camera.zoom + camera.x
    expect(left).toBeGreaterThanOrEqual(40)
    expect(right).toBeLessThanOrEqual(960)
    expect((left + right) / 2).toBeCloseTo(500)
  })

  it('preserves the author camera when replaying in a different viewport', () => {
    const camera = displayCamera({ x: 50, y: 20, zoom: 1.2, viewportWidth: 900, viewportHeight: 600 }, initialFrame().board, 450, 400)
    expect(camera.x).toBe(25)
    expect(camera.y).toBe(60)
    expect(camera.zoom).toBe(0.6)
  })

  it('reserves a tools rail without placing fitted objects under it', () => {
    const camera = fitCamera(initialFrame().board, 644, 536, { left: 100 })
    expect(blockA.x * camera.zoom + camera.x).toBeGreaterThanOrEqual(100)
    expect((blockB.x + blockB.width) * camera.zoom + camera.x).toBeLessThanOrEqual(584)
  })

  it('keeps the current object readable and centered in a compact viewer', () => {
    const camera = displayCamera({ x: 0, y: 0, zoom: 1 }, initialFrame().board, 360, 340, { readable: true, focusId: 'a' })
    expect(17 * camera.zoom).toBeGreaterThanOrEqual(12)
    expect((blockA.x + blockA.width / 2) * camera.zoom + camera.x).toBeCloseTo(180)
    expect((blockA.y + blockA.height / 2) * camera.zoom + camera.y).toBeCloseTo(170)
  })
})
