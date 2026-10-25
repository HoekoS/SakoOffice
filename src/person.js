// Rounded little office bots, posed by the same pivots as the original workers.
import * as THREE from 'three'

const THIGH = 0.28
const SHIN = 0.28
const HIP_Y = THIGH + SHIN
const WALK_SPEED = 1.5

const SHIRTS = [0x4d9dec, 0xf0ad38, 0x88c983, 0x9887d9, 0xee8d82, 0x5cc5bd, 0xd699cf, 0x6d9bd3]

/** Same session always gets the same shirt, so people stay recognisable. */
export function shirtColor(seed) {
  let hash = 0
  for (const ch of String(seed)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return SHIRTS[hash % SHIRTS.length]
}

function capsule(radius, length, material, y) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 12), material)
  mesh.position.y = y
  mesh.castShadow = true
  return mesh
}

export function buildPerson(seed) {
  const shell = new THREE.MeshStandardMaterial({ color: shirtColor(seed), roughness: 0.42, metalness: 0.06 })
  const trim = new THREE.MeshStandardMaterial({ color: 0xf8fafb, roughness: 0.5 })
  const visorMaterial = new THREE.MeshStandardMaterial({ color: 0x142334, roughness: 0.2, metalness: 0.12 })
  const eyes = new THREE.MeshStandardMaterial({ color: 0xa7f5ff, emissive: 0x4bdeff, emissiveIntensity: 1.6 })
  const cupMaterial = new THREE.MeshStandardMaterial({ color: 0xfffaf0, roughness: 0.65 })
  const coffee = new THREE.MeshStandardMaterial({ color: 0x674536, roughness: 0.9 })

  const root = new THREE.Group()
  const body = new THREE.Group()
  body.position.y = HIP_Y
  root.add(body)

  body.add(capsule(0.27, 0.52, shell, 0.34))
  const faceRim = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), trim)
  faceRim.scale.set(0.245, 0.17, 0.075)
  faceRim.position.set(0, 0.54, 0.24)
  body.add(faceRim)
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), visorMaterial)
  visor.name = 'visor'
  visor.scale.set(0.215, 0.137, 0.066)
  visor.position.set(0, 0.54, 0.288)
  body.add(visor)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 8), eyes)
    eye.name = side < 0 ? 'eye-left' : 'eye-right'
    eye.position.set(side * 0.075, 0.552, 0.348)
    body.add(eye)
  }

  const arms = []
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.30, 0.52, 0)
    shoulder.add(capsule(0.065, 0.17, shell, -0.12))
    const elbow = new THREE.Group()
    elbow.position.y = -0.24
    elbow.add(capsule(0.057, 0.15, shell, -0.11))
    shoulder.add(elbow)
    body.add(shoulder)
    arms.push({ shoulder, elbow, side })
  }

  const cup = new THREE.Group()
  const vessel = new THREE.Mesh(new THREE.CylinderGeometry(0.077, 0.065, 0.15, 14), cupMaterial)
  vessel.position.y = -0.23
  cup.add(vessel)
  const surface = new THREE.Mesh(new THREE.CircleGeometry(0.065, 14), coffee)
  surface.rotation.x = -Math.PI / 2
  surface.position.y = -0.149
  cup.add(surface)
  cup.position.set(0, -0.18, 0.065)
  arms[1].elbow.add(cup)
  cup.visible = false

  const legs = []
  for (const side of [-1, 1]) {
    const hip = new THREE.Group()
    hip.position.set(side * 0.12, 0, 0)
    hip.add(capsule(0.085, THIGH - 0.12, shell, -THIGH / 2))
    const knee = new THREE.Group()
    knee.position.y = -THIGH
    knee.add(capsule(0.078, SHIN - 0.12, shell, -SHIN / 2))
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), trim)
    foot.position.set(0, -SHIN + 0.02, 0.055)
    knee.add(foot)
    hip.add(knee)
    root.add(hip)
    legs.push({ hip, knee, side })
  }

  return {
    root,
    body,
    arms,
    legs,
    cup,
    materials: [shell, trim, visorMaterial, eyes, cupMaterial, coffee],
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
  person.cup.visible = mode === 'coffee'

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
    } else if (mode === 'read' || mode === 'think') {
      arm.shoulder.rotation.x = arm.side > 0 ? -0.7 : -0.25
      arm.shoulder.rotation.z = arm.side * (mode === 'think' ? 0.14 : 0.05)
      arm.elbow.rotation.x = arm.side > 0 ? -1.15 : -0.35
    } else if (mode === 'coffee') {
      arm.shoulder.rotation.x = arm.side > 0 ? -0.8 + Math.sin(t * 1.2) * 0.08 : -0.1
      arm.shoulder.rotation.z = arm.side * 0.08
      arm.elbow.rotation.x = arm.side > 0 ? -1.3 : -0.15
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
