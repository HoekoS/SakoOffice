import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPerson, animatePerson } from './person.js'

test('office characters have a rounded body, dark visor and luminous eyes', () => {
  const person = buildPerson('session-a')
  const parts = []
  person.root.traverse((part) => { if (part.isMesh) parts.push(part) })
  assert.ok(parts.some((part) => part.geometry.type === 'CapsuleGeometry'))
  assert.ok(parts.some((part) => part.name === 'visor'))
  assert.equal(parts.filter((part) => part.name.startsWith('eye-')).length, 2)
})

test('coffee prop appears only during the coffee activity', () => {
  const person = buildPerson('session-b')
  animatePerson(person, 'type', 0)
  assert.equal(person.cup.visible, false)
  animatePerson(person, 'coffee', 1)
  assert.equal(person.cup.visible, true)
  animatePerson(person, 'walk', 2)
  assert.equal(person.cup.visible, false)
})
