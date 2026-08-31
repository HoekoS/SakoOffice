import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { plateLabel, billboardNameplate } from './nameplate.js'

test('an empty desk shows its own name', () => {
  assert.equal(plateLabel('Desk B2', null), 'Desk B2')
  assert.equal(plateLabel('Main Agent', undefined), 'Main Agent')
})

test('an occupied desk shows the session name', () => {
  assert.equal(plateLabel('Desk B2', { name: 'sakooffice-e9' }), 'sakooffice-e9')
})

test('a long session name is truncated with an ellipsis, not wrapped', () => {
  const label = plateLabel('Desk B2', { name: 'rover-dashboard-playground-worktree' })
  assert.equal(label.length, 18)
  assert.ok(label.endsWith('…'))
  assert.ok(label.startsWith('rover-dashboard-p'))
})

test('a name that exactly fills the plate is left alone', () => {
  const exact = 'x'.repeat(18)
  assert.equal(plateLabel('Desk B2', { name: exact }), exact)
})

test('billboarding turns the readable +Z face toward the camera, in world space', () => {
  const deskGroup = new THREE.Group()
  deskGroup.position.set(-8, 0, 0)
  deskGroup.rotation.y = Math.PI / 2 // desk rotated, as real desks are

  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125))
  deskGroup.add(plate)
  deskGroup.updateWorldMatrix(true, true)

  const camera = new THREE.Vector3(-8, 1, 5) // off to the side, not straight ahead
  billboardNameplate(plate, camera)
  deskGroup.updateWorldMatrix(true, true)

  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(plate.getWorldQuaternion(new THREE.Quaternion()))
  const worldPos = plate.getWorldPosition(new THREE.Vector3())
  const towardCamera = camera.clone().sub(worldPos).normalize()

  assert.ok(normal.dot(towardCamera) > 0.999, `plate faces away from camera: ${normal.dot(towardCamera)}`)
})
