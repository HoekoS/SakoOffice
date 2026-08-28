import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plateLabel } from './nameplate.js'

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
