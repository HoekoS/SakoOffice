// Speech bubble floating over a person's head. Same recipe as the nameplate:
// text drawn into a canvas, shown on a billboarded plane.
import * as THREE from 'three'

const WIDTH = 512
const HEIGHT = 160
const HEIGHT_ABOVE_HEAD = 2.05

function draw(canvas, text) {
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  if (!text) return

  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const paddingX = 36
  const boxWidth = Math.min(WIDTH - 8, ctx.measureText(text).width + paddingX * 2)
  const boxHeight = 88
  const x = (WIDTH - boxWidth) / 2
  const y = 8
  const radius = 22

  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.beginPath()
  ctx.roundRect(x, y, boxWidth, boxHeight, radius)
  ctx.fill()
  // Little tail pointing down at the speaker.
  ctx.beginPath()
  ctx.moveTo(WIDTH / 2 - 18, y + boxHeight - 1)
  ctx.lineTo(WIDTH / 2, y + boxHeight + 26)
  ctx.lineTo(WIDTH / 2 + 18, y + boxHeight - 1)
  ctx.fill()

  ctx.fillStyle = '#1b2733'
  ctx.fillText(text, WIDTH / 2, y + boxHeight / 2 + 2, boxWidth - paddingX)
}

export function buildBubble() {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1 * (HEIGHT / WIDTH)), material)
  mesh.position.y = HEIGHT_ABOVE_HEAD
  mesh.visible = false

  let current = null
  return {
    mesh,
    setText(text) {
      if (text === current) return
      current = text
      draw(canvas, text)
      texture.needsUpdate = true
      mesh.visible = Boolean(text)
    },
    dispose() {
      texture.dispose()
      material.dispose()
      mesh.geometry.dispose()
    },
  }
}
