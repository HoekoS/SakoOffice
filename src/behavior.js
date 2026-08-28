// What a person does next, given the status of the agent sitting at their desk.

/** Weighted choices per status. Durations are seconds at the destination. */
export const ACTIVITIES = {
  working: [
    { kind: 'desk', weight: 4, min: 25, max: 70 },
    { kind: 'meeting', weight: 1, min: 40, max: 90 },
  ],
  loose: [
    { kind: 'pantry', weight: 3, min: 20, max: 45 },
    { kind: 'wander', weight: 4, min: 10, max: 30 },
    { kind: 'linger', weight: 2, min: 8, max: 20 },
  ],
}

/** Working agents are at their desk; anything else is free time. */
export function activitySet(status) {
  return status === 'working' ? ACTIVITIES.working : ACTIVITIES.loose
}

/**
 * Pick the next activity. `rng` returns [0, 1) — inject a stub to make it
 * deterministic in tests.
 */
export function chooseActivity(status, rng = Math.random) {
  const options = activitySet(status)
  const total = options.reduce((sum, o) => sum + o.weight, 0)
  let roll = rng() * total
  const picked = options.find((o) => (roll -= o.weight) < 0) ?? options[options.length - 1]
  return {
    kind: picked.kind,
    duration: picked.min + rng() * (picked.max - picked.min),
  }
}

/**
 * True when the person should drop what they are doing and re-decide: the agent
 * changed status, or the current activity has run out.
 */
export function shouldRedecide(person, status, now) {
  if (person.status !== status) return true
  return now >= person.busyUntil
}
