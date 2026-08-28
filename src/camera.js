// Camera poses and the easing used to fly between them.

export const OVERVIEW = {
  position: { x: 14, y: 12, z: 16 },
  target: { x: 0, y: 1, z: 0 },
}

export const FLIGHT_SECONDS = 0.9

/**
 * Closest the orbit controls may sit to their target. Every pose below has to
 * clear it — the controls re-clamp the camera the moment they take over again,
 * which would shove it back out of a landing that broke this.
 */
export const MIN_ORBIT_DISTANCE = 3

/** Slow at both ends, quick through the middle. */
export function easeInOutCubic(t) {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped < 0.5 ? 4 * clamped ** 3 : 1 - (-2 * clamped + 2) ** 3 / 2
}

export function lerpPose(from, to, k) {
  const mix = (a, b) => a + (b - a) * k
  return {
    position: {
      x: mix(from.position.x, to.position.x),
      y: mix(from.position.y, to.position.y),
      z: mix(from.position.z, to.position.z),
    },
    target: {
      x: mix(from.target.x, to.target.x),
      y: mix(from.target.y, to.target.y),
      z: mix(from.target.z, to.target.z),
    },
  }
}

/**
 * Over-the-shoulder view of one desk: the camera sits behind the seat and
 * looks the way the person at that desk is looking.
 * `rotation` is the desk group's Y rotation; a desk looks down its own -z.
 */
export function deskView(x, z, rotation, { distance = 3.8, height = 2.5 } = {}) {
  const front = { x: -Math.sin(rotation), z: -Math.cos(rotation) }
  return {
    position: {
      x: x - front.x * distance,
      y: height,
      z: z - front.z * distance,
    },
    target: { x: x + front.x * 0.6, y: 1, z: z + front.z * 0.6 },
  }
}
