// Desk nameplates. The label is drawn into a canvas and used as a texture.
import * as THREE from 'three'

const WIDTH = 512
const HEIGHT = 128
const MAX_CHARS = 18

/** What the plate says: the session on this desk, or the desk's own name. */
export function plateLabel(deskName, agent) {
  const raw = agent?.name ?? deskName
  if (raw.length <= MAX_CHARS) return raw
  return `${raw.slice(0, MAX_CHARS - 1)}…`
}

function draw(canvas, label, occupied) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, WIDTH, HEIGHT)

  ctx.fillStyle = '#f4f1ec'
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  ctx.fillStyle = occupied ? '#2f6fed' : '#c3c7cc'
  ctx.fillRect(0, HEIGHT - 10, WIDTH, 10)

  ctx.fillStyle = occupied ? '#1b2733' : '#9aa0a6'
  ctx.font = 'bold 58px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, WIDTH / 2, HEIGHT / 2 - 6, WIDTH - 40)
}

/**
 * A small standing plate for the front edge of a desk.
 * Returns the mesh plus `setLabel` and `dispose`.
 */
export function buildNameplate(deskName) {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  draw(canvas, plateLabel(deskName, null), false)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4

  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), material)
  // Faces away from whoever sits here — nameplates are for the room to read.
  mesh.rotation.y = Math.PI
  mesh.rotation.x = 0.18

  return {
    mesh,
    setLabel(agent) {
      draw(canvas, plateLabel(deskName, agent), Boolean(agent))
      texture.needsUpdate = true
    },
    dispose() {
      texture.dispose()
      material.dispose()
      mesh.geometry.dispose()
    },
  }
}
