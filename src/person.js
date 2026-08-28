// Low-poly office worker: a few boxes on pivot groups, posed by code.
import * as THREE from 'three'

const THIGH = 0.42
const SHIN = 0.42
const TORSO = 0.55
const HIP_Y = THIGH + SHIN
const WALK_SPEED = 1.5

const SHIRTS = [0x3d6ea8, 0x8a4b6a, 0x3f7a5c, 0xa8703d, 0x5a5f9e, 0x8a8f4b, 0x9e4b4b, 0x407f86]

/** Same session always gets the same shirt, so people stay recognisable. */
export function shirtColor(seed) {
  let hash = 0
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return SHIRTS[hash % SHIRTS.length]
}

function limb(w, h, d, material, y) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.y = y
  mesh.castShadow = true
  return mesh
}

export function buildPerson(seed) {
  const shirt = new THREE.MeshStandardMaterial({ color: shirtColor(seed), roughness: 0.85 })
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a67e, roughness: 0.9 })
  const trousers = new THREE.MeshStandardMaterial({ color: 0x3a4049, roughness: 0.9 })

  const root = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = HIP_Y
  root.add(body)

  body.add(limb(0.38, TORSO, 0.24, shirt, TORSO / 2))
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin)
  head.position.y = TORSO + 0.15
  head.castShadow = true
  body.add(head)

  const arms = []
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.24, TORSO - 0.06, 0)
    shoulder.add(limb(0.11, 0.3, 0.11, shirt, -0.15))
    const elbow = new THREE.Group()
    elbow.position.y = -0.3
    elbow.add(limb(0.1, 0.28, 0.1, skin, -0.14))
    shoulder.add(elbow)
    body.add(shoulder)
    arms.push({ shoulder, elbow, side })
  }

  const legs = []
  for (const side of [-1, 1]) {
    const hip = new THREE.Group()
    hip.position.set(side * 0.11, 0, 0)
    hip.add(limb(0.14, THIGH, 0.16, trousers, -THIGH / 2))
    const knee = new THREE.Group()
    knee.position.y = -THIGH
    knee.add(limb(0.13, SHIN, 0.14, trousers, -SHIN / 2))
    hip.add(knee)
    root.add(hip)
    legs.push({ hip, knee, side })
  }

  return {
    root,
    body,
    arms,
    legs,
    materials: [shirt, skin, trousers],
    phase: Math.random() * Math.PI * 2,
  }
}

/** Sitting drops the hips to seat height and folds the legs forward. */
export function poseSeated(person, seated) {
  person.body.position.y = seated ? 0.46 : HIP_Y
  for (const leg of person.legs) {
    leg.hip.position.y = seated ? 0.46 : 0
    leg.hip.rotation.x = seated ? -Math.PI / 2 : 0
    leg.knee.rotation.x = seated ? Math.PI / 2 : 0
  }
}

/**
 * Advance the pose. `mode` is 'walk' | 'type' | 'sit' | 'stand'.
 * Returns nothing; it only touches rotations, never world position.
 */
export function animatePerson(person, mode, elapsed) {
  const t = elapsed + person.phase
  const swing = mode === 'walk' ? Math.sin(t * 7) * 0.55 : 0

  for (const leg of person.legs) {
    if (mode === 'walk') {
      leg.hip.rotation.x = swing * leg.side
      leg.knee.rotation.x = Math.max(0, -swing * leg.side) * 0.8
    }
  }

  for (const arm of person.arms) {
    if (mode === 'walk') {
      arm.shoulder.rotation.x = -swing * arm.side
      arm.shoulder.rotation.z = 0
      arm.elbow.rotation.x = 0.25
    } else if (mode === 'type') {
      // Forearms up on the desk, fingers going.
      arm.shoulder.rotation.x = -0.5
      arm.shoulder.rotation.z = arm.side * 0.12
      arm.elbow.rotation.x = -0.9 + Math.sin(t * 11 + arm.side) * 0.12
    } else {
      arm.shoulder.rotation.x = mode === 'sit' ? -0.25 : Math.sin(t * 1.2) * 0.05
      arm.shoulder.rotation.z = 0
      arm.elbow.rotation.x = mode === 'sit' ? -0.6 : 0.1
    }
  }

  // A little vertical bob while walking sells the steps.
  person.body.rotation.z = mode === 'walk' ? Math.sin(t * 7) * 0.04 : 0
}

/**
 * Move along `person.path` (world points). Returns true once the end is reached.
 * Heading turns toward travel; the caller owns what happens on arrival.
 */
export function stepAlongPath(person, delta) {
  const target = person.path[person.pathIndex]
  if (!target) return true

  const dx = target.x - person.root.position.x
  const dz = target.z - person.root.position.z
  const distance = Math.hypot(dx, dz)
  const stride = WALK_SPEED * delta

  if (distance <= stride) {
    person.root.position.set(target.x, 0, target.z)
    person.pathIndex += 1
    return person.pathIndex >= person.path.length
  }

  person.root.position.x += (dx / distance) * stride
  person.root.position.z += (dz / distance) * stride
  turnTowards(person, Math.atan2(dx, dz), delta)
  return false
}

/** Ease the body around to `heading` rather than snapping. */
export function turnTowards(person, heading, delta) {
  const current = person.root.rotation.y
  const diff = Math.atan2(Math.sin(heading - current), Math.cos(heading - current))
  person.root.rotation.y = current + diff * Math.min(1, delta * 8)
}

export { WALK_SPEED, HIP_Y }
