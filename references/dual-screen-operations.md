# Safe Dual-Screen OBS Operations

Read this reference when composing or repairing multi-monitor OBS scenes, especially while a recording is active. The central rule is to keep a recoverable Program output while all uncertain work happens off-air.

## Contents

- Establish the live invariant
- Inventory OBS and the operating system
- Preserve a fallback scene
- Create and authorize display captures
- Compute and apply the layout
- Verify pixels before going live
- Add a privacy-safe camera variant
- Save, lock, and finish
- Failure modes and recovery

## Establish the live invariant

Start by translating the user's request into explicit state constraints. Examples:

- “Do not stop recording” forbids `StopRecord`, `ToggleRecord`, `PauseRecord`, `ResumeRecord`, output restarts, and risky video-setting changes.
- “Make both screens visible” authorizes scene/source/layout changes, not recording controls.
- “Add the camera without showing my room” requires off-air privacy validation before enabling the camera on Program.

When recording is active, read and retain:

- `GetRecordStatus`: active, paused, duration, and bytes.
- `GetCurrentProgramScene` and `GetSceneList`.
- `GetVideoSettings`: base canvas, output resolution, and FPS.
- `GetMonitorList` when supported.
- `GetSceneItemList` for the Program and staging scenes.
- `GetInputList` and settings for relevant display/audio/camera sources.

Repeat `GetRecordStatus` after every significant scene switch and at completion. Never use a toggle when a deterministic action exists.

## Inventory the system

OBS monitor enumeration and Linux portal labels may differ. Record both:

```text
OBS: HDMI-1(0), eDP-1(1)
Portal examples: VSC:VA2215, BOE:...
```

For cameras, enumerate nodes without guessing:

```bash
for node in /dev/video*; do
  test -e "$node" || continue
  printf '%s\n' "--- $node"
  udevadm info --query=property --name="$node" 2>/dev/null \
    | rg '^(DEVNAME|ID_V4L_PRODUCT|ID_MODEL|ID_VENDOR|ID_SERIAL)=' || true
done
```

One physical camera may expose multiple video nodes. Prefer the node whose product metadata matches the requested device, then confirm by an off-air screenshot.

Inspect available input and filter kinds before creating sources. OBS kinds can be versioned—for example, `color_source_v3` rather than `color_source`. Never assume a blur/background-removal filter exists merely because other OBS installations have one.

## Preserve a fallback scene

Do not rebuild the only working Program scene in place. Use one of these patterns:

- Duplicate the active scene, preserving source transforms and audio.
- Create a new named scene and add references to existing sources.
- Keep the original scene as a one-click fallback.

Use descriptive names such as:

```text
Scene
Codex Demo - Dual Screen
Codex Demo - Dual Screen + Private Camera
```

Enable Studio Mode when available. Keep the known-good scene on Program and the candidate scene in Preview. If Studio Mode is unavailable, build a separate scene and inspect screenshots before switching Program.

Avoid duplicating global and scene audio carelessly. A duplicated microphone or desktop source can double volume or introduce phase/echo. Compare the candidate scene's audio inputs with the original.

## Create and authorize PipeWire display captures

On Linux/Wayland, `pipewire-screen-capture-source` relies on the desktop portal. Creating the source with an empty `RestoreToken` usually creates a source object but not a valid capture.

Important distinctions:

- A request can succeed while source dimensions remain 0x0.
- `videoActive` or `videoShowing` can be true while the screenshot is entirely black.
- A token found in a portal database can be stale or bound to another source/session.
- Applying a stale token repeatedly does not repair it.

For each new monitor source:

1. Create the source in the staging scene.
2. Read its settings and scene-item transform.
3. If the token is empty, dimensions are zero, or the screenshot is black, open the input's Properties dialog.
4. Tell the user exactly: **Select Screen → choose the named monitor → Share → OK**.
5. Do not treat “I clicked OK” as sufficient; verify a new nonempty token, expected dimensions, and visible pixels.

Portal interaction can be the only unavoidable manual step. If native UI automation is unavailable, say so plainly and continue automatically after the user completes that one permission action.

Do not mine and apply every stored portal token as a primary strategy. At most, test a clearly mapped token once in Preview; if it yields 0x0/black, request a fresh portal grant.

## Compute a side-by-side layout

Let:

- Canvas size be `Cw × Ch`.
- Each source size be `Sw × Sh`.
- Each half-panel width be `Pw = Cw / 2`.

For equal side-by-side panels without cropping:

```text
scale = min(Pw / Sw, Ch / Sh)
render_width = Sw × scale
render_height = Sh × scale
left_x = (Pw - render_width) / 2
right_x = Pw + (Pw - render_width) / 2
y = (Ch - render_height) / 2
```

For two 1920x1080 displays on a 1920x1080 canvas:

```text
scale = 0.5
left  = x: 0,   y: 270, width: 960, height: 540
right = x: 960, y: 270, width: 960, height: 540
```

The black bands above and below are mathematically expected: two 16:9 screens side by side form a 32:9 composition inside a 16:9 canvas. Do not change base/output resolution during an active recording merely to eliminate those bands. A 3840x1080 canvas can represent both monitors at full resolution, but changing video settings may restart outputs and must be planned before recording or explicitly authorized afterward.

Use exact scene item IDs from a fresh `GetSceneItemList`. Apply transforms to the candidate scene only. After positioning, read the list back and verify:

- sourceWidth/sourceHeight are nonzero;
- width/height match the intended scale;
- x/y positions are inside the canvas;
- crop values are zero unless intentional;
- both items are enabled.

Lock finalized visual items to prevent accidental dragging.

## Verify pixels before switching Program

Use two levels of screenshots:

1. Each display source separately, to prove that it renders the intended monitor.
2. The candidate scene, to prove geometry and stacking.

Inspect rather than merely collecting Base64. Confirm recognizable content—for example, terminal/Codex on one side and OBS on the other. A recursive OBS preview on the OBS monitor is expected.

Before switching Program, check:

- Program is still the fallback scene.
- Candidate screenshot shows both monitors.
- No privacy cover or camera layer obscures a monitor.
- Audio sources are as intended.
- Recording is still active/unpaused if it must remain so.

Switch with a deterministic Program-scene action or Studio Mode transition. Immediately read back the Program scene and recording status, then take a screenshot of the live scene.

If the candidate is wrong after switching, return to the known-good scene first; repair the candidate in Preview afterward. Do not leave a mostly black scene live while experimenting.

## Add a privacy-safe camera variant

Treat camera work as a separate variant after the screen-only scene is proven. This preserves a reusable screen-only fallback.

### Check real capabilities

List source filter kinds. If no background-removal or blur filter is present, say so. Chroma key, luma key, color key, crop, and mask filters are not semantic background removal. Never label a crop or black rectangle as “blur.”

A black source behind an ordinary rectangular camera does not hide the room; the opaque camera pixels remain on top. A black source placed over the camera hides the person too. Without a real segmentation/blur plugin, practical privacy options are:

- Keep the camera disabled.
- Crop tightly to face/upper body and place that small crop over black.
- Use a user-provided physical background.
- Install a compatible background-removal plugin later, outside an active recording and with restart/testing planned.

### Stage off-air

Create a temporary test scene or a new camera variant. Add a black color source below the camera and keep that scene in Preview. Inspect a camera-source screenshot to locate the person, then apply crop and scale in the test scene.

Crop coordinates are source-pixel values, not canvas pixels. For a 1920x1080 camera:

```text
visible_width  = 1920 - cropLeft - cropRight
visible_height = 1080 - cropTop - cropBottom
canvas_width   = visible_width × scaleX
canvas_height  = visible_height × scaleY
```

Iterate screenshots until the person is visible and the room is minimized. Keep the test off Program. When satisfactory:

1. Duplicate the proven dual-screen scene into a named private-camera variant.
2. Apply the tested crop/position to its camera item.
3. Put a black panel below the camera if needed.
4. Move the camera above the displays in z-order; item index 0 is the bottom of the source list.
5. Place the camera in unused letterbox space when possible so it does not cover either screen.
6. Screenshot the full variant and inspect it.
7. Switch Program only after privacy is visually verified.

If the person's movement can escape the tight crop or reveal the room, explain the limitation. Cropping is not robust background removal.

## Save, lock, and finish

OBS normally auto-saves scene collections. Verify persistence by listing scenes and reading transforms after the final switch. Retain:

- The original fallback scene.
- A named screen-only dual scene.
- A separate private-camera scene when requested.

Lock finalized display and camera items. Remove only temporary test scenes that the agent created and that are not active in Program or Preview.

If the user asks to “save the profile,” clarify through action:

- Preserve named scenes in the current scene collection for layout.
- Create or select a named OBS profile only if they also want output/encoder settings grouped under that name.
- Do not create a new empty scene collection and switch to it while a recording is active.

At completion, report:

- Current Program scene.
- Recording active/stopped/paused state.
- Which monitors are visible and where.
- Camera visibility and the exact privacy method.
- Names of saved scenes/profile/scene collection.
- Any remaining limitation or manual dependency.

## Failure modes and recovery

### Second display is 0x0 or black

Keep or restore the fallback Program scene. Open the new source's Properties, obtain a fresh portal selection, then verify dimensions and screenshots before switching back.

### Portal dialog was accepted but token is still empty

The user likely clicked only **OK**. Re-open Properties and instruct them to click **Select Screen**, choose the monitor, **Share**, then **OK**.

### Both sources show the same monitor

Compare source screenshots and restore tokens. Reauthorize the incorrect source through the portal with the other monitor selected.

### Most of the canvas is black

Determine whether the source is black versus legitimate letterboxing. A valid 32:9 dual-monitor composition inside 16:9 has top/bottom bars, but both 960x540 panels should still show pixels.

### Camera is active but absent

Check scene-item enabled state, crop, transform, z-order, and whether another source covers it. Validate in Preview before changing Program.

### Camera covers the room or person incorrectly

Return to the screen-only Program scene immediately if privacy is at risk. Repair crop/mask/filter behavior off-air. Never use a full black overlay as proof that a camera setup is complete if the user asked to remain visible.

### Audio becomes doubled

Inspect global audio and scene audio sources. Disable/remove only the duplicate introduced in the candidate scene; preserve the known-good source.

### Recording state is uncertain after a command

Wait briefly and query `GetRecordStatus` again. Output stop can be asynchronous, and an immediate read may show stale values. Do not send a second stop/toggle blindly.

## Final verification checklist

- [ ] Program scene is the intended named scene.
- [ ] Each requested display has nonzero dimensions and recognizable screenshot content.
- [ ] Layout positions/scales match the canvas math.
- [ ] Recording state exactly matches the user's latest instruction.
- [ ] Camera is disabled or privacy-verified off-air before activation.
- [ ] Original fallback scene remains available.
- [ ] Final visual items are locked where appropriate.
- [ ] Named scenes remain in the current scene collection.
- [ ] Final status report distinguishes profile, scene collection, and scenes.
