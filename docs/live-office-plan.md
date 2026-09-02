# Live office — spec and plan

Bringing four ideas from [W17ant/Claude-Office](https://github.com/W17ant/Claude-Office)
into this 3D office. That project is 2D pixel art driven by Claude Code hooks;
this one is three.js driven by polling `~/.claude`. We are copying its *inputs
and behaviour*, not its art style.

## Goal

The office should show what agents are doing **as it happens**, and read as a
place people arrive at and leave — not a diorama that mutates every 3 seconds.

## Non-goals

- Pixel art sprites, Electron, the Slack chat panel and its AI replies. The
  chat panel is a project of its own; if we want it, it gets its own spec.
- Replacing polling. Hooks are additive: an office with no hooks installed
  keeps working exactly as it does today, just with less to say.

## The core decision: hooks *and* polling, layered

| | Polling `~/.claude` | Hooks |
|---|---|---|
| Latency | up to 3s | instant |
| Knows | session exists, transcript mtime | which tool is running, session start/stop |
| Works without setup | yes | needs a block in `~/.claude/settings.json` |
| Survives a container | yes (read-only mount) | yes (HTTP to a published port) |

Polling stays the source of truth for **who is in the room** (the roster and
which desk they take). Hooks add **what they are doing right now**. Neither can
do the other's job: hooks never fire for a session that is sitting idle, and
polling can never see a tool call.

Status resolution: the roster's `working`/`idle`/`away` is the floor; a hook
event newer than 45s overrides it (`refineStatus` in `src/activity.js`).

---

## Slice 1 — Hook + push events

**Status: done and verified against real hook events.**

- `hooks/office-hook.js` — reads the hook payload on stdin, POSTs a *reduced*
  copy to the office, exits 0 no matter what. Never blocks Claude: 400ms
  timeout, errors swallowed.
- `server/events.js` — `normalizeEvent` (validate + strip), `applyEvent`
  (fold into per-session phase), `createEventHub` (in-memory state + SSE
  fan-out), `readJsonBody` (size-capped).
- `POST /api/event` and `GET /api/stream` on both the production server and
  the Vite dev middleware, so dev and prod behave the same.
- Frontend subscribes with `EventSource`.

**Privacy:** `tool_input` carries file contents and shell commands. It is
dropped twice — once in the hook before it leaves the process, once in
`normalizeEvent` on the way in. Only the tool's *name* travels.

**SSE, not WebSocket:** the traffic is one-way and we have zero runtime
dependencies to protect. `ws` would be a dependency for nothing.

**Installed** in `~/.claude/settings.json` as its own matcher-less group per
event, alongside the rtk and daily-journal hooks, which were left untouched.
The previous file was copied to `settings.json.pre-sako-<timestamp>` first.
The block that was added:

```json
{
  "hooks": {
    "PreToolUse":  [{ "hooks": [{ "type": "command", "command": "node \"C:\\Users\\Formulatrix\\Documents\\Data\\Projek\\SakoOffice\\hooks\\office-hook.js\"" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "node \"C:\\Users\\Formulatrix\\Documents\\Data\\Projek\\SakoOffice\\hooks\\office-hook.js\"" }] }],
    "SessionStart":[{ "hooks": [{ "type": "command", "command": "node \"C:\\Users\\Formulatrix\\Documents\\Data\\Projek\\SakoOffice\\hooks\\office-hook.js\"" }] }],
    "SessionEnd":  [{ "hooks": [{ "type": "command", "command": "node \"C:\\Users\\Formulatrix\\Documents\\Data\\Projek\\SakoOffice\\hooks\\office-hook.js\"" }] }]
  }
}
```

**What the first real events settled:** the payload does carry
`hook_event_name` and `session_id` — the risk this plan flagged is closed.
Observed on the wire, in order, from this session:

```
SNAPSHOT    thinking/-
PreToolUse   Read   -> phase tool
PostToolUse  Read   -> phase thinking
PreToolUse   Grep   -> phase tool
PostToolUse  Grep   -> phase thinking
PreToolUse   Bash   -> phase tool
```

MCP tools arrive under their full `mcp__<server>__<tool>` name, which is far
too long for a bubble — hence `toolLabel`.

## Slice 2 — Status bubbles

**Status: done and verified in the running office.**

- `src/bubble.js` — rounded speech bubble with a tail, drawn into a canvas,
  billboarded like the nameplates. Reuses `billboardNameplate`.
- `src/activity.js` — `bubbleText` maps a phase to words: a running tool
  becomes a verb (`Edit` → "editing"), between tools is "thinking…", after
  `Stop` is "waiting for you".
- Only the session's own person gets one. Subagents have no hook stream of
  their own, so a bubble over them would be a guess.

Without hooks installed, bubbles simply never appear. That is the intended
degradation, not a bug.

## Slice 3 — Arrive and leave through a door

**Status: not started.**

Today people pop into existence at their desk and vanish. With `SessionStart`
and `SessionEnd` events we can do better:

- Add a `door` node to `src/waypoints.js` on the open (`+z`) edge of the room,
  and a short path stub outside it.
- `addPerson` spawns at the door and walks to the desk.
- On session end, walk desk → door, *then* remove. Needs a `leaving` activity
  kind in `src/behavior.js` that outranks everything and does not re-decide.
- Removal must survive the walk: if the office reloads mid-exit, the person is
  gone at the next poll anyway.

Test: a path from the door node to every desk exists and crosses no wall
(the existing `waypoints.test.js` pattern).

## Slice 4 — Day/night cycle

**Status: not started.**

Cheapest of the four, and the only one that needs no new data.

- One `dayNight(t)` function in a new `src/lighting.js`: given a 0–1 phase,
  return sun colour + intensity, hemisphere colours, fog colour, and a
  screen-glow multiplier.
- Drive it from real clock time so the office matches your day, with a
  `?hour=` override for looking at it.
- Screens stay bright at night — that is the whole point of a night shot.

Test: pure function, so assert dawn/noon/dusk/midnight give a monotonic
brightness curve and that fog and background never diverge (they share a
colour today and a mismatch reads as a seam at the horizon).

---

## Order and why

1. **Hooks** first — 3 and 4 both read better with it, and 2 is empty without it.
2. **Bubbles** — proves the event stream end to end with something visible.
3. **Door** — needs `SessionStart`/`SessionEnd` to fire.
4. **Day/night** — independent, can land any time.
5. **Kenney models** (below) — furniture any time; people only once a pack
   has been opened and its animation clips are known.

## Risks

- **Hook payload shape.** Field names (`hook_event_name`, `session_id`,
  `tool_name`, `cwd`) are taken from the existing daily-journal hook on this
  machine, which reads `tool_name`, `tool_input` and `cwd`. `session_id` and
  `hook_event_name` are *not* confirmed by anything on disk here — the first
  live event settles it. `normalizeEvent` rejects rather than guesses.
- **Hook cost.** Runs on every tool call. It is a bare `node` process with a
  400ms cap; if that shows up as lag, the fix is a persistent listener, not a
  faster hook.
- **Port coupling.** The hook posts to `SAKO_OFFICE_PORTS` (default
  `3000,5173,8081` — the container port is already in).

---

## Slice 5 — Real models from Kenney

**Status: not started.** Added after slices 1–4 were planned; it does not
block any of them and can land alongside 3 and 4.

Everything in the room today is a box with a colour. Kenney's 3D packs are
free, CC0 (no attribution required, though we will credit anyway), and ship
as **GLB** next to FBX and OBJ — GLB is the one we want: three.js loads it
with `GLTFLoader` from `three/examples/jsm`, which is already installed. No
new dependency, no build step, no converter.

What the site actually offers (checked, not guessed — Kenney has no "office
kit"):

| Pack | Use here | Notes |
|---|---|---|
| **Furniture Kit** (2018, 140 files) | desks, chairs, the meeting table, pantry counter, plants | tags: furniture, interior, table, chair, bed. The one pack that covers most of the room. |
| **Food Kit** | mugs, the coffee machine, pantry clutter | small props; pantry only |
| **Mini Characters** (2024, animated) | the people | tagged character / people / disability; animated, but *which* clips is not listed on the page |
| **Animated Characters Protagonists / Retro / Survivors** (2020) | alternative people | animations arrive as **separate FBX files** (`idle.fbx`, …) meant for a shared `characterMedium` rig — a Unity/Unreal workflow, not a drop-in GLB |
| Blocky Characters | alternative people | animated, 20 files |
| City Kit (Suburban / Commercial), Modular Buildings | exterior for slice 3's door, if we want a street outside | optional |

**Order of attack — furniture first, people last:**

1. **Furniture.** Swap `buildDesk`, `buildChair`, `buildMonitor`, `buildPlant`
   and the pantry pieces for loaded GLBs. `layout.js` does not change: it
   already owns every position and heading, and the models just stand where
   the boxes stood. Keep the box builders as the fallback while a model is
   still loading (and for any piece the kit does not have — a two-monitor
   arm, for instance).
2. **Pantry props** from Food Kit.
3. **People.** This is the risky one and the reason it goes last. Our person
   is a hand-made rig (`src/person.js`): pivot groups posed in code for
   walk / type / sit / stand, which is exactly what the office needs and
   exactly what a downloaded character may not provide. Mini Characters is
   the candidate — it is recent and animated — but the page does not say
   whether it has a *sitting* pose, and no Kenney character types. Until a
   downloaded pack is opened and its clips listed, this stays a plan, not a
   promise. If it lacks sit/type, we keep our rig and only borrow its look.

**Where files go:** `public/models/<pack>/…` with the pack's own `Textures`
folder beside it (Kenney's guide is explicit that colours go missing without
it). Vite copies `public/` into `dist/`, so the Docker image picks them up
through the existing `COPY dist ./dist` with no Dockerfile change.

**What has to stay true:**

- Clicking a desk still works: `deskTops` raycasts against the top mesh —
  after the swap it raycasts against the loaded group, with `userData.deskName`
  on it. One line moves.
- Seats stay where `layout.js` says, not where a model's origin happens to be.
  Kenney models are origin-at-base but the seat point of a chair is not the
  origin; `spots` keep coming from layout, not from geometry.
- Loading is async. The scene must render with boxes at t=0 and swap when a
  model arrives, or wait behind a loader — swap is the lazier and the nicer.
- Every model is CC0, but a `CREDITS.md` naming Kenney costs one file and is
  the decent thing.

**Test:** `layout.js` and `waypoints.js` are untouched, so their tests are
the regression net. Add one that loads each GLB in node (GLTFLoader runs
under node with a `FileReader` shim, or simply check the files exist and
parse as valid glTF JSON headers) so a missing texture folder or a renamed
file fails in CI, not on screen.

**Bundle size:** models load at runtime from `public/`, not from the JS
bundle, so the 731 KB bundle does not grow. The image does; Furniture Kit
is well under 20 MB.
