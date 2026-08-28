import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deskView, easeInOutCubic, lerpPose, OVERVIEW, MIN_ORBIT_DISTANCE } from './camera.js'
import { deskLayout } from './layout.js'

test('the ease starts still, ends still, and passes through the middle', () => {
  assert.equal(easeInOutCubic(0), 0)
  assert.equal(easeInOutCubic(1), 1)
  assert.equal(easeInOutCubic(0.5), 0.5)
  assert.equal(easeInOutCubic(-3), 0)
  assert.equal(easeInOutCubic(4), 1)
  let previous = -1
  for (let t = 0; t <= 1; t += 0.05) {
    const value = easeInOutCubic(t)
    assert.ok(value >= previous, `ease went backwards at ${t}`)
    previous = value
  }
})

test('lerp hits both ends exactly and the midpoint in between', () => {
  const a = { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }
  const b = { position: { x: 10, y: 4, z: -2 }, target: { x: 2, y: 1, z: 6 } }
  assert.deepEqual(lerpPose(a, b, 0), a)
  assert.deepEqual(lerpPose(a, b, 1), b)
  assert.deepEqual(lerpPose(a, b, 0.5).position, { x: 5, y: 2, z: -1 })
})

test('the camera sits behind the seat and looks the way the desk faces', () => {
  for (const desk of deskLayout()) {
    const view = deskView(desk.x, desk.z, desk.rotation)
    const front = { x: -Math.sin(desk.rotation), z: -Math.cos(desk.rotation) }

    // Looking direction matches the desk's own heading.
    const dx = view.target.x - view.position.x
    const dz = view.target.z - view.position.z
    const length = Math.hypot(dx, dz)
    assert.ok((front.x * dx + front.z * dz) / length > 0.999, `${desk.name} looks the wrong way`)

    // And it stands behind the desk, not on top of it.
    const back = Math.hypot(view.position.x - desk.x, view.position.z - desk.z)
    assert.ok(Math.abs(back - 3.8) < 1e-9, `${desk.name} camera distance ${back}`)
    assert.equal(view.position.y, 2.5)
  }
})

test('every pose clears the orbit minimum, or the controls shove it back out', () => {
  const clearance = (view) =>
    Math.hypot(
      view.position.x - view.target.x,
      view.position.y - view.target.y,
      view.position.z - view.target.z
    )
  assert.ok(clearance(OVERVIEW) > MIN_ORBIT_DISTANCE)
  for (const desk of deskLayout()) {
    const view = deskView(desk.x, desk.z, desk.rotation)
    assert.ok(
      clearance(view) > MIN_ORBIT_DISTANCE,
      `${desk.name} lands at ${clearance(view).toFixed(2)}, inside the ${MIN_ORBIT_DISTANCE} minimum`
    )
  }
})

test('distance and height are adjustable', () => {
  const view = deskView(0, 0, 0, { distance: 6, height: 9 })
  assert.deepEqual(view.position, { x: 0, y: 9, z: 6 })
})

test('the overview pose is the one the scene opens with', () => {
  assert.deepEqual(OVERVIEW.position, { x: 14, y: 12, z: 16 })
  assert.deepEqual(OVERVIEW.target, { x: 0, y: 1, z: 0 })
})
