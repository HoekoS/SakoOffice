import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  ROOM,
  MEETING_ROOM,
  PANTRY,
  PARTITION,
  MAIN_DESK_NAME,
  deskLayout,
  meetingSeats,
  pantrySeats,
  wallSpans,
} from './layout.js'
import { seatAgents, statusLook, rosterSummary } from './agents.js'
import { buildGraph, findPath } from './waypoints.js'
import { chooseActivity, shouldRedecide } from './behavior.js'
import { buildPerson, poseSeated, animatePerson, stepAlongPath, turnTowards } from './person.js'
import { buildNameplate, billboardNameplate } from './nameplate.js'
import { buildBubble } from './bubble.js'
import { bubbleText, refineStatus } from './activity.js'
import {
  OVERVIEW,
  FLIGHT_SECONDS,
  MIN_ORBIT_DISTANCE,
  deskView,
  easeInOutCubic,
  lerpPose,
} from './camera.js'

const COLORS = {
  floor: 0xd9d4cc,
  wall: 0xf2efe9,
  deskTop: 0xb98a5a,
  metal: 0x8a8f96,
  chair: 0x37424f,
  screen: 0x1b2733,
  screenOn: 0x4da3ff,
  plant: 0x4f7a44,
  table: 0xa8744a,
  highlight: 0x2f6fed,
  // Main agent's station: darker wood, warmer seat, amber screen.
  mainDeskTop: 0x4a3b2f,
  mainChair: 0x8a4b2a,
  mainScreenOn: 0xffb347,
  glass: 0xbcd6e0,
  frame: 0x6b7178,
  meetingFloor: 0xc7ced6,
  pantryFloor: 0xe6ded0,
  counter: 0x8f9498,
  counterTop: 0x3f4550,
  cabinet: 0xf0ece6,
  fridge: 0xd7dbde,
  sink: 0x2b3138,
}

// Shared materials — one instance reused across every mesh of that kind.
function makeMaterials() {
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, ...extra })
  return {
    floor: std(COLORS.floor, { roughness: 0.95 }),
    wall: std(COLORS.wall, { roughness: 1, side: THREE.DoubleSide }),
    deskTop: std(COLORS.deskTop, { roughness: 0.7 }),
    metal: std(COLORS.metal, { roughness: 0.4, metalness: 0.6 }),
    chair: std(COLORS.chair, { roughness: 0.8 }),
    screen: std(COLORS.screen, {
      roughness: 0.3,
      emissive: COLORS.screenOn,
      emissiveIntensity: 0.35,
    }),
    plant: std(COLORS.plant, { roughness: 1 }),
    table: std(COLORS.table, { roughness: 0.7 }),
    mainDeskTop: std(COLORS.mainDeskTop, { roughness: 0.45, metalness: 0.15 }),
    mainChair: std(COLORS.mainChair, { roughness: 0.6 }),
    mainScreen: std(COLORS.screen, {
      roughness: 0.25,
      emissive: COLORS.mainScreenOn,
      emissiveIntensity: 0.9,
    }),
    glass: std(COLORS.glass, {
      roughness: 0.05,
      metalness: 0.1,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    }),
    frame: std(COLORS.frame, { roughness: 0.5, metalness: 0.5 }),
    meetingFloor: std(COLORS.meetingFloor, { roughness: 0.9 }),
    pantryFloor: std(COLORS.pantryFloor, { roughness: 0.9 }),
    counter: std(COLORS.counter, { roughness: 0.6 }),
    counterTop: std(COLORS.counterTop, { roughness: 0.35, metalness: 0.2 }),
    cabinet: std(COLORS.cabinet, { roughness: 0.7 }),
    fridge: std(COLORS.fridge, { roughness: 0.35, metalness: 0.45 }),
    sink: std(COLORS.sink, { roughness: 0.25, metalness: 0.6 }),
  }
}

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function buildChair(m, seatMaterial = m.chair) {
  const chair = new THREE.Group()
  chair.add(box(0.5, 0.08, 0.5, seatMaterial, 0, 0.45, 0))
  chair.add(box(0.5, 0.55, 0.08, seatMaterial, 0, 0.75, -0.21))
  chair.add(box(0.08, 0.42, 0.08, m.metal, 0, 0.22, 0))
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16), m.metal)
  base.position.y = 0.03
  base.castShadow = true
  chair.add(base)
  return chair
}

function buildMonitor(m, screenMaterial, x, angle) {
  const monitor = new THREE.Group()
  monitor.add(box(0.34, 0.03, 0.2, m.metal, 0, 0.79, -0.3))
  monitor.add(box(0.06, 0.28, 0.06, m.metal, 0, 0.93, -0.3))
  const panel = box(0.9, 0.52, 0.04, screenMaterial, 0, 1.32, -0.3)
  panel.rotation.x = -0.08
  monitor.add(panel)
  monitor.position.x = x
  monitor.rotation.y = angle
  return monitor
}

function buildDesk(m, desk) {
  const group = new THREE.Group()
  group.position.set(desk.x, 0, desk.z)
  group.rotation.y = desk.rotation

  const width = desk.main ? 2.6 : 1.8
  const topMaterial = desk.main ? m.mainDeskTop : m.deskTop
  // Each desk owns its screen material so an agent's status can light it alone.
  const screenMaterial = (desk.main ? m.mainScreen : m.screen).clone()
  group.userData.screenMaterial = screenMaterial

  const top = box(width, 0.06, 0.9, topMaterial, 0, 0.74, 0)
  top.userData.deskName = desk.name
  top.userData.baseMaterial = topMaterial
  group.add(top)

  const legX = width / 2 - 0.1
  for (const [lx, lz] of [
    [-legX, -0.38],
    [legX, -0.38],
    [-legX, 0.38],
    [legX, 0.38],
  ]) {
    group.add(box(0.07, 0.74, 0.07, m.metal, lx, 0.37, lz))
  }

  // Main agent runs a two-screen setup, angled inward; everyone else gets one.
  if (desk.main) {
    group.add(buildMonitor(m, screenMaterial, -0.62, 0.28))
    group.add(buildMonitor(m, screenMaterial, 0.62, -0.28))
  } else {
    group.add(buildMonitor(m, screenMaterial, 0, 0))
  }

  // buildChair faces +z; the chair sits at +z and the monitors at -z, so turn it around.
  // Nameplate on the front edge, clear of the monitors.
  const plate = buildNameplate(desk.name)
  plate.mesh.position.set(width / 2 - 0.35, 0.84, -0.4)
  group.add(plate.mesh)
  group.userData.nameplate = plate

  const chair = buildChair(m, desk.main ? m.mainChair : m.chair)
  chair.position.set(0, 0, 0.85)
  chair.rotation.y = Math.PI
  if (desk.main) chair.scale.set(1.15, 1.15, 1.15)
  group.add(chair)

  return group
}

/**
 * A run of glass partition with an optional doorway, plus its head rail.
 * `axis` is the direction the wall runs; `fixed` is its position on the other axis.
 */
/**
 * A hinged glass leaf filling a doorway, left ajar into the room.
 * The leaf is modelled along its own +x and then swung to the wall's axis.
 */
function buildGlassDoor(m, axis, fixed, doorCenter, swing) {
  const { height, doorWidth } = PARTITION
  const leafHeight = height - 0.14
  const pivot = new THREE.Group()

  const hinge = doorCenter - doorWidth / 2
  pivot.position.set(...(axis === 'x' ? [hinge, 0, fixed] : [fixed, 0, hinge]))
  // Closed, the leaf must lie along the wall; +x maps onto +z at -90°.
  pivot.rotation.y = (axis === 'x' ? 0 : -Math.PI / 2) + swing

  const leaf = box(doorWidth - 0.06, leafHeight, 0.05, m.glass, doorWidth / 2, leafHeight / 2, 0)
  leaf.castShadow = false
  leaf.receiveShadow = false
  pivot.add(leaf)

  // Stile at the hinge, rail top and bottom, and a vertical pull handle.
  pivot.add(box(0.07, leafHeight, 0.08, m.frame, 0.03, leafHeight / 2, 0))
  pivot.add(box(doorWidth - 0.06, 0.07, 0.08, m.frame, doorWidth / 2, leafHeight - 0.035, 0))
  pivot.add(box(doorWidth - 0.06, 0.07, 0.08, m.frame, doorWidth / 2, 0.035, 0))
  pivot.add(box(0.04, 0.5, 0.04, m.frame, doorWidth - 0.16, 1.05, 0.09))

  return pivot
}

function buildGlassWall(m, axis, fixed, from, to, doorCenter) {
  const group = new THREE.Group()
  const { height, thickness, doorWidth } = PARTITION

  for (const [a, b] of wallSpans(from, to, doorCenter, doorWidth)) {
    const length = b - a
    if (length <= 0.01) continue
    const mid = (a + b) / 2
    const [w, d] = axis === 'x' ? [length, thickness] : [thickness, length]
    const [x, z] = axis === 'x' ? [mid, fixed] : [fixed, mid]

    // Glass panes stay out of the shadow map — otherwise they read as solid walls.
    const pane = box(w, height - 0.12, d, m.glass, x, (height - 0.12) / 2, z)
    pane.castShadow = false
    pane.receiveShadow = false
    group.add(pane)

    group.add(box(w, 0.12, d * 1.6, m.frame, x, height - 0.06, z))
    // Mullion at each end of the pane, so door openings read as framed.
    for (const end of [a, b]) {
      const [mx, mz] = axis === 'x' ? [end, fixed] : [fixed, end]
      group.add(box(0.1, height, 0.1, m.frame, mx, height / 2, mz))
    }
  }

  if (doorCenter != null) {
    const [hx, hz] = axis === 'x' ? [doorCenter, fixed] : [fixed, doorCenter]
    const [hw, hd] = axis === 'x' ? [doorWidth, thickness * 1.6] : [thickness * 1.6, doorWidth]
    group.add(box(hw, 0.12, hd, m.frame, hx, height - 0.06, hz))
    group.add(buildGlassDoor(m, axis, fixed, doorCenter, 0.55))
  }
  return group
}

function floorPatch(material, x0, x1, z0, z1) {
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), material)
  patch.rotation.x = -Math.PI / 2
  patch.position.set((x0 + x1) / 2, 0.01, (z0 + z1) / 2)
  patch.receiveShadow = true
  return patch
}

function buildMeetingRoom(m) {
  const group = new THREE.Group()
  const { x0, x1, z0, z1, doorZ } = MEETING_ROOM
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2

  group.add(floorPatch(m.meetingFloor, x0, x1, z0, z1))
  group.add(buildGlassWall(m, 'z', x0, z0, z1, doorZ))
  group.add(buildGlassWall(m, 'z', x1, z0, z1, null))
  group.add(buildGlassWall(m, 'x', z1, x0, x1, null))

  group.add(box(3.6, 0.08, 1.6, m.table, cx, 0.74, cz))
  for (const [lx, lz] of [
    [-1.5, -0.6],
    [1.5, -0.6],
    [-1.5, 0.6],
    [1.5, 0.6],
  ]) {
    group.add(box(0.09, 0.74, 0.09, m.metal, cx + lx, 0.37, cz + lz))
  }
  for (const seat of meetingSeats(cx, cz, 3.6, 1.6, 3)) {
    const chair = buildChair(m)
    chair.position.set(seat.x, 0, seat.z)
    chair.rotation.y = seat.rotation
    group.add(chair)
  }

  // Wall-mounted display on the room's back wall.
  group.add(box(2.2, 1.2, 0.08, m.screen, cx, 1.7, z0 + 0.2))
  return group
}

/** Drip coffee machine standing on the counter, brew head facing the room (-x). */
function buildCoffeeMachine(m, x, z, counterTopY) {
  const group = new THREE.Group()
  const y = counterTopY

  group.add(box(0.3, 0.52, 0.26, m.metal, x + 0.08, y + 0.26, z))
  group.add(box(0.22, 0.1, 0.26, m.metal, x - 0.1, y + 0.47, z))
  group.add(box(0.24, 0.03, 0.28, m.counterTop, x - 0.1, y + 0.015, z))

  const carafe = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.17, 16), m.glass)
  carafe.position.set(x - 0.1, y + 0.12, z)
  group.add(carafe)
  const brew = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.062, 0.08, 16), m.sink)
  brew.position.set(x - 0.1, y + 0.075, z)
  group.add(brew)
  group.add(box(0.03, 0.11, 0.03, m.frame, x - 0.1, y + 0.13, z + 0.11))

  // Power light, small enough to read as an indicator rather than a screen.
  group.add(box(0.03, 0.025, 0.05, m.mainScreen, x - 0.08, y + 0.4, z + 0.06))

  group.traverse((o) => {
    if (o.isMesh && o.material !== m.glass) o.castShadow = true
  })
  return group
}

function buildPantry(m) {
  const group = new THREE.Group()
  const { x0, x1, z0, z1, doorZ } = PANTRY

  group.add(floorPatch(m.pantryFloor, x0, x1, z0, z1))
  group.add(buildGlassWall(m, 'z', x0, z0, z1, doorZ))
  group.add(buildGlassWall(m, 'z', x1, z0, z1, null))
  group.add(buildGlassWall(m, 'x', z1, x0, x1, null))

  // Counter run against the far wall, with sink, coffee machine and cabinets.
  const counterX = x1 - 0.45
  group.add(box(0.6, 0.9, 5, m.counter, counterX, 0.45, 3.5))
  group.add(box(0.68, 0.06, 5.1, m.counterTop, counterX, 0.93, 3.5))
  group.add(box(0.46, 0.1, 0.7, m.sink, counterX, 0.97, 2.2))
  group.add(buildCoffeeMachine(m, counterX, 4.6, 0.96))
  group.add(box(0.4, 0.7, 3, m.cabinet, x1 - 0.3, 1.95, 3.5))
  group.add(box(0.75, 1.9, 0.8, m.fridge, x1 - 0.5, 0.95, 6.8))

  // Round table with four chairs turned toward it.
  const cx = x0 + 2.6
  const cz = (z0 + z1) / 2
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.07, 24), m.table)
  top.position.set(cx, 0.74, cz)
  top.castShadow = true
  top.receiveShadow = true
  group.add(top)
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.71, 12), m.metal)
  post.position.set(cx, 0.36, cz)
  post.castShadow = true
  group.add(post)
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.05, 20), m.metal)
  foot.position.set(cx, 0.03, cz)
  foot.castShadow = true
  group.add(foot)

  for (const seat of pantrySeats(cx, cz, 1.45, 4)) {
    const chair = buildChair(m)
    chair.position.set(seat.x, 0, seat.z)
    chair.rotation.y = seat.rotation
    group.add(chair)
  }

  group.add(buildPlant(m, x0 + 0.9, z1 - 1.2))
  return group
}

function buildPlant(m, x, z) {
  const group = new THREE.Group()
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.35, 12), m.metal)
  pot.position.set(x, 0.175, z)
  pot.castShadow = true
  group.add(pot)
  // ponytail: cone stack instead of foliage geometry — reads as a plant at this scale.
  for (let i = 0; i < 3; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.34 - i * 0.08, 0.5, 8), m.plant)
    leaf.position.set(x, 0.55 + i * 0.28, z)
    leaf.castShadow = true
    group.add(leaf)
  }
  return group
}

function buildRoom(m) {
  const group = new THREE.Group()
  const { width, depth, height, wallThickness: t } = ROOM

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), m.floor)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  group.add(floor)

  // Back and left walls only — the open sides keep the camera's view clear.
  group.add(box(width, height, t, m.wall, 0, height / 2, -depth / 2))
  group.add(box(t, height, depth, m.wall, -width / 2, height / 2, 0))

  return group
}

function since(timestamp) {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  return `${Math.round(seconds / 3600)}h ago`
}

export default function Office3D() {
  const mountRef = useRef(null)
  const [selected, setSelected] = useState(null)
  const [roster, setRoster] = useState([])
  const [feedError, setFeedError] = useState(null)

  useEffect(() => {
    const mount = mountRef.current
    const materials = makeMaterials()

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xeef1f5)
    scene.fog = new THREE.Fog(0xeef1f5, 30, 70)

    const camera = new THREE.PerspectiveCamera(
      50,
      mount.clientWidth / mount.clientHeight,
      0.1,
      200
    )
    camera.position.set(14, 12, 16)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = Math.PI / 2.1
    controls.minDistance = MIN_ORBIT_DISTANCE
    controls.maxDistance = 45
    controls.target.set(0, 1, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3ad, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(12, 18, 10)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.camera.left = -20
    sun.shadow.camera.right = 20
    sun.shadow.camera.top = 20
    sun.shadow.camera.bottom = -20
    scene.add(sun)

    scene.add(buildRoom(materials))
    scene.add(buildMeetingRoom(materials))
    scene.add(buildPantry(materials))
    scene.add(buildPlant(materials, -10.5, 7))
    scene.add(buildPlant(materials, 1.4, -7.5))

    const deskTops = []
    const stations = new Map()
    // Every place a person can stand or sit, keyed by its graph node id.
    const spots = new Map()

    for (const desk of deskLayout()) {
      const group = buildDesk(materials, desk)
      scene.add(group)
      group.updateWorldMatrix(true, true)
      deskTops.push(group.children[0])

      const chair = group.children[group.children.length - 1]
      const seat = new THREE.Vector3()
      chair.getWorldPosition(seat)
      const nodeId = `seat:${desk.name}`
      const heading = desk.rotation + Math.PI
      spots.set(nodeId, { x: seat.x, z: seat.z, heading, sit: true })

      // Standing room either side of the chair, where subagents gather.
      const asideX = Math.cos(heading)
      const asideZ = -Math.sin(heading)
      for (const [i, side] of [-1, 1].entries()) {
        spots.set(`huddle:${desk.name}:${i}`, {
          x: seat.x + asideX * side * 1.15,
          z: seat.z + asideZ * side * 1.15,
          heading,
          sit: false,
        })
      }
      stations.set(desk.name, {
        screenMaterial: group.userData.screenMaterial,
        nameplate: group.userData.nameplate,
        agent: null,
        seatNode: nodeId,
        view: deskView(desk.x, desk.z, desk.rotation),
      })
    }

    const meetingCentre = { x: (MEETING_ROOM.x0 + MEETING_ROOM.x1) / 2, z: (MEETING_ROOM.z0 + MEETING_ROOM.z1) / 2 }
    meetingSeats(meetingCentre.x, meetingCentre.z, 3.6, 1.6, 3).forEach((seat, i) => {
      spots.set(`mseat:${i}`, { x: seat.x, z: seat.z, heading: seat.rotation, sit: true })
    })
    pantrySeats(PANTRY.x0 + 2.6, (PANTRY.z0 + PANTRY.z1) / 2, 1.45, 4).forEach((seat, i) => {
      spots.set(`pseat:${i}`, { x: seat.x, z: seat.z, heading: seat.rotation, sit: true })
    })

    const graph = buildGraph(
      [...spots].map(([id, spot]) => ({
        id,
        x: spot.x,
        z: spot.z,
        area: id.startsWith('mseat') ? 'meeting' : id.startsWith('pseat') ? 'pantry' : 'office',
      }))
    )
    const officeNodes = [...graph.nodes.values()].filter(
      (node) => node.area === 'office' && !node.id.startsWith('seat:') && !node.id.startsWith('huddle:')
    )
    const pointOf = (nodeId) => spots.get(nodeId) ?? graph.nodes.get(nodeId)

    // Click-to-select: raycast the desk tops only, tint the hit one.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let highlighted = null

    const highlight = (mesh) => {
      if (highlighted === mesh) return
      if (highlighted) {
        highlighted.material.dispose()
        highlighted.material = highlighted.userData.baseMaterial
      }
      highlighted = mesh
      if (mesh) {
        mesh.material = mesh.userData.baseMaterial.clone()
        mesh.material.color.setHex(COLORS.highlight)
      }
      const deskName = mesh ? mesh.userData.deskName : null
      setSelected(deskName && { deskName, agent: stations.get(deskName)?.agent ?? null })
      flyTo(deskName ? stations.get(deskName).view : OVERVIEW)
    }

    // Camera flight: hand control back to OrbitControls once it lands.
    let flight = null
    const flyTo = (to) => {
      flight = {
        from: {
          position: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
          target: { x: controls.target.x, y: controls.target.y, z: controls.target.z },
        },
        to,
        elapsed: 0,
      }
      controls.enabled = false
    }

    const updateFlight = (delta) => {
      if (!flight) return
      flight.elapsed += delta
      const k = easeInOutCubic(flight.elapsed / FLIGHT_SECONDS)
      const pose = lerpPose(flight.from, flight.to, k)
      camera.position.set(pose.position.x, pose.position.y, pose.position.z)
      controls.target.set(pose.target.x, pose.target.y, pose.target.z)
      if (flight.elapsed >= FLIGHT_SECONDS) {
        flight = null
        controls.enabled = true
      }
    }

    // One person per occupied desk, wandering the floor between tasks.
    const people = new Map()
    const claims = new Map() // node id -> desk name, so two people never share a seat

    const release = (person) => {
      if (person.claim && claims.get(person.claim) === person.key) claims.delete(person.claim)
      person.claim = null
    }

    const freeSpot = (prefix) => {
      for (const id of spots.keys()) {
        if (id.startsWith(prefix) && !claims.has(id)) return id
      }
      return null
    }

    /** Subagents shadow whoever spawned them: beside the desk, or into the meeting. */
    const followMode = (person) =>
      people.get(person.parentDesk)?.kind === 'meeting' ? 'meeting' : 'home'

    /** Where the chosen activity wants this person to be. */
    const targetFor = (person, kind) => {
      if (person.parentDesk) {
        return followMode(person) === 'meeting'
          ? (freeSpot('mseat:') ?? person.homeNode)
          : person.homeNode
      }
      if (kind === 'desk') return person.homeNode
      if (kind === 'meeting') return freeSpot('mseat:') ?? person.homeNode
      if (kind === 'pantry') return freeSpot('pseat:') ?? 'pantry:counter'
      if (kind === 'wander') return officeNodes[Math.floor(Math.random() * officeNodes.length)].id
      return person.at
    }

    const arrive = (person, now) => {
      person.at = person.goal
      const spot = pointOf(person.at)
      person.root.position.set(spot.x, 0, spot.z)
      const seated = Boolean(spot.sit)
      poseSeated(person, seated)
      person.root.rotation.y = spot.heading ?? person.root.rotation.y
      person.mode = seated ? (person.kind === 'desk' ? 'type' : 'sit') : 'stand'
      person.busyUntil = now + person.duration
    }

    const decide = (person, status, now) => {
      release(person)
      // Subagents don't get a life of their own; they check on their agent often.
      const { kind, duration } = person.parentDesk
        ? { kind: 'follow', duration: 8 + Math.random() * 6 }
        : chooseActivity(status)
      person.status = status
      person.kind = kind
      person.duration = duration

      const goal = targetFor(person, kind)
      person.goal = goal
      person.follows = person.parentDesk ? followMode(person) : null
      if (goal !== person.at && spots.has(goal)) claims.set(goal, person.key)
      person.claim = spots.has(goal) ? goal : null

      if (goal === person.at) {
        arrive(person, now)
        return
      }
      const route = findPath(graph, person.at, goal)
      if (!route) {
        // Nowhere to walk — stay put rather than teleport through a wall.
        person.busyUntil = now + duration
        return
      }
      person.path = route.slice(1).map((id) => pointOf(id))
      person.pathIndex = 0
      person.mode = 'walk'
      // The clock only starts once they get there; arriving sets the deadline.
      person.busyUntil = Infinity
      poseSeated(person, false)
    }

    const addPerson = (key, deskName, agent, { parentDesk = null, index = 0 } = {}) => {
      const homeNode = parentDesk ? `huddle:${deskName}:${index}` : stations.get(deskName).seatNode
      const rig = buildPerson(parentDesk ? `${agent.sessionId}#${index}` : agent.sessionId)
      const spot = pointOf(homeNode)
      rig.root.position.set(spot.x, 0, spot.z)
      rig.root.rotation.y = spot.heading
      poseSeated(rig, Boolean(spot.sit))
      if (parentDesk) rig.root.scale.setScalar(0.85)
      // Only the session's own person speaks; subagents have no hook stream.
      const bubble = parentDesk ? null : buildBubble()
      if (bubble) rig.root.add(bubble.mesh)
      scene.add(rig.root)

      Object.assign(rig, {
        key,
        deskName,
        parentDesk,
        bubble,
        homeNode,
        at: homeNode,
        goal: homeNode,
        claim: homeNode,
        kind: parentDesk ? 'follow' : 'desk',
        mode: spot.sit ? 'type' : 'stand',
        status: agent.status,
        busyUntil: 0,
        duration: 0,
        path: [],
        pathIndex: 0,
      })
      claims.set(homeNode, key)
      people.set(key, rig)
    }

    const removePerson = (key) => {
      const person = people.get(key)
      if (!person) return
      release(person)
      scene.remove(person.root)
      person.bubble?.dispose()
      person.root.traverse((obj) => {
        if (obj.isMesh) obj.geometry.dispose()
      })
      person.materials.forEach((material) => material.dispose())
      people.delete(key)
    }

    // Live activity from Claude Code hooks, keyed by session id. Polling still
    // owns the roster; this only sharpens status and puts words in bubbles.
    const activity = new Map()
    const effectiveStatus = (station) =>
      station.agent
        ? refineStatus(station.agent.status, activity.get(station.agent.sessionId), Date.now())
        : 'away'

    /** Screen colour and bubble for one desk, from roster plus live activity. */
    const refreshStation = (deskName) => {
      const station = stations.get(deskName)
      const look = statusLook(station.agent ? effectiveStatus(station) : 'empty')
      station.screenMaterial.emissive.setHex(look.color)
      station.screenMaterial.emissiveIntensity = look.intensity
      people.get(deskName)?.bubble?.setText(
        station.agent ? bubbleText(activity.get(station.agent.sessionId)) : null
      )
    }

    const deskOfSession = (sessionId) => {
      for (const [deskName, station] of stations) {
        if (station.agent?.sessionId === sessionId) return deskName
      }
      return null
    }

    const stream = new EventSource('/api/stream')
    stream.onmessage = (message) => {
      let data
      try {
        data = JSON.parse(message.data)
      } catch {
        return
      }
      if (data.type === 'snapshot') {
        activity.clear()
        for (const record of data.activity ?? []) activity.set(record.sessionId, record)
        for (const deskName of stations.keys()) refreshStation(deskName)
      } else if (data.type === 'event' && data.activity) {
        activity.set(data.activity.sessionId, data.activity)
        const deskName = deskOfSession(data.activity.sessionId)
        if (deskName) refreshStation(deskName)
      }
    }

    /** Desk gets one person for the agent plus one per running subagent. */
    const HUDDLE_SPACES = 2
    const syncPeople = (deskName, agent) => {
      const wanted = new Set()
      if (agent) {
        wanted.add(deskName)
        const helpers = Math.min(agent.subagents ?? 0, HUDDLE_SPACES)
        for (let i = 0; i < helpers; i++) wanted.add(`${deskName}#${i}`)
      }
      for (const key of [...people.keys()]) {
        if ((key === deskName || key.startsWith(`${deskName}#`)) && !wanted.has(key)) removePerson(key)
      }
      for (const key of wanted) {
        if (people.has(key)) continue
        const index = key.includes('#') ? Number(key.split('#')[1]) : 0
        addPerson(key, deskName, agent, { parentDesk: key.includes('#') ? deskName : null, index })
      }
    }

    // Live Claude sessions drive the screens: one session per desk.
    const applyAgents = (agents) => {
      const seating = seatAgents(agents, [...stations.keys()], MAIN_DESK_NAME)
      for (const [deskName, station] of stations) {
        const previous = station.agent
        station.agent = seating.get(deskName) ?? null
        if (previous?.name !== station.agent?.name) station.nameplate.setLabel(station.agent)
        syncPeople(deskName, station.agent)
        refreshStation(deskName)
      }
      setRoster(agents)
      setSelected((prev) =>
        prev ? { deskName: prev.deskName, agent: stations.get(prev.deskName)?.agent ?? null } : prev
      )
    }

    let stopped = false
    const poll = async () => {
      try {
        const response = await fetch('/api/agents')
        const body = await response.json()
        if (stopped) return
        setFeedError(null)
        applyAgents(body.agents ?? [])
      } catch (error) {
        if (stopped) return
        setFeedError(String(error))
        applyAgents([])
      }
    }
    poll()
    const pollTimer = setInterval(poll, 3000)

    // Orbiting ends in a click event too, so only a press that barely moved counts.
    let pressAt = null
    const onPointerDown = (event) => {
      pressAt = { x: event.clientX, y: event.clientY }
    }

    const onClick = (event) => {
      const moved = pressAt ? Math.hypot(event.clientX - pressAt.x, event.clientY - pressAt.y) : 0
      pressAt = null
      if (moved > 5) return

      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(deskTops, false)[0]
      highlight(hit ? hit.object : null)
    }
    const onMouseMove = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(pointer, camera)
      const hovering = raycaster.intersectObjects(deskTops, false).length > 0
      renderer.domElement.style.cursor = hovering ? 'pointer' : 'auto'
    }
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    renderer.domElement.addEventListener('click', onClick)
    renderer.domElement.addEventListener('mousemove', onMouseMove)

    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    window.addEventListener('resize', onResize)

    let frame
    const clock = new THREE.Clock()
    const animate = () => {
      frame = requestAnimationFrame(animate)
      const delta = Math.min(clock.getDelta(), 0.1)
      const now = clock.elapsedTime

      for (const person of people.values()) {
        const status = effectiveStatus(stations.get(person.deskName))
        // A plan can go stale at any moment — the agent started working, or a
        // subagent's parent left for a meeting. React now, don't finish the trip.
        const followStale = person.parentDesk && person.follows !== followMode(person)

        if (followStale || shouldRedecide(person, status, now)) {
          decide(person, status, now)
        } else if (person.mode === 'walk') {
          if (stepAlongPath(person, delta)) arrive(person, now)
        }
        animatePerson(person, person.mode, now)
        if (person.bubble?.mesh.visible) billboardNameplate(person.bubble.mesh, camera.position)
      }

      for (const station of stations.values()) {
        billboardNameplate(station.nameplate.mesh, camera.position)
      }

      updateFlight(delta)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      stopped = true
      stream.close()
      clearInterval(pollTimer)
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
      renderer.domElement.removeEventListener('click', onClick)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('mousemove', onMouseMove)
      controls.dispose()
      highlight(null)
      scene.traverse((obj) => {
        if (obj.isMesh) obj.geometry.dispose()
      })
      Object.values(materials).forEach((mat) => mat.dispose())
      stations.forEach((station) => {
        station.screenMaterial.dispose()
        station.nameplate.dispose()
      })
      people.forEach((person) => {
        person.bubble?.dispose()
        person.materials.forEach((material) => material.dispose())
      })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          padding: '10px 14px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.85)',
          font: '14px system-ui, sans-serif',
          color: '#1b2733',
          pointerEvents: 'none',
        }}
      >
        <strong>Sako Office</strong>
        <div style={{ marginTop: 4, opacity: 0.75 }}>
          {feedError ? 'Agent feed unavailable — run `npm run dev`' : rosterSummary(roster)}
        </div>

        {selected ? (
          <div style={{ marginTop: 10, borderTop: '1px solid rgba(0,0,0,0.12)', paddingTop: 8 }}>
            <div style={{ fontWeight: 600 }}>{selected.deskName}</div>
            {selected.agent ? (
              <div style={{ marginTop: 4, opacity: 0.8, lineHeight: 1.5 }}>
                <div>
                  {selected.agent.name} · {selected.agent.status}
                </div>
                <div>{selected.agent.project}</div>
                <div>active {since(selected.agent.lastActive)}</div>
                {selected.agent.subagents > 0 && (
                  <div>
                    {selected.agent.subagents} subagent
                    {selected.agent.subagents === 1 ? '' : 's'} running
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 4, opacity: 0.6 }}>Empty desk</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 6, opacity: 0.55 }}>
            Click a desk · drag to orbit · scroll to zoom
          </div>
        )}
      </div>
    </div>
  )
}
