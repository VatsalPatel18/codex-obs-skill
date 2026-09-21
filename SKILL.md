---
name: obs-skill
description: Install, configure, validate, and troubleshoot a local OBS Studio MCP server for Codex, and safely build or repair multi-monitor OBS scenes. Use for OBS WebSocket/MCP setup, PipeWire display capture, dual-screen composition, recording-safe scene changes, and camera-privacy staging; not for offline video editing.
---

# OBS MCP and Multi-Monitor Operations

Use this skill to reach one of two outcomes:

1. Codex can connect to a local OBS Studio instance through a persistent MCP installation.
2. OBS has a verified, reusable multi-monitor scene without accidentally interrupting an active recording or exposing an unverified camera feed.

## Route the task

- For repository inspection, installation, Codex configuration, WebSocket setup, connection validation, upgrades, or removal, read [references/mcp-setup.md](references/mcp-setup.md).
- For live OBS inspection, PipeWire monitor capture, dual-screen geometry, Studio Mode staging, camera privacy, verification, or scene recovery, read [references/dual-screen-operations.md](references/dual-screen-operations.md).
- For combined requests, read both references, configure and validate MCP first, then operate OBS.
- Run [scripts/diagnose_obs_mcp.sh](scripts/diagnose_obs_mcp.sh) when local process, port, command, Codex registration, monitor, or camera-device facts are unclear. It is read-only and does not prove that an OBS source renders valid pixels.

## Shared operating contract

- Inspect before mutating. Establish the OBS process, WebSocket reachability, MCP availability, current Program scene, recording state, video settings, inputs, and scene items relevant to the request.
- Treat recording controls as high-impact. Never call stop, pause, resume, toggle, split, or start unless the user explicitly requests that specific action. A request to change a scene does not authorize changing recording state.
- If recording is active, preserve a known-good Program scene while constructing or repairing another scene in Preview. Prefer a duplicate or separate named scene so recovery is one scene switch away.
- Verify rendered output, not only API success. `videoActive: true`, `videoShowing: true`, a nonempty restore token, or a successful request can still produce a black or 0x0 source. Check source dimensions and obtain a screenshot of the source and composed scene.
- Do not expose a camera or untrusted source directly on Program for testing. Test it in an off-air scene or Preview, apply privacy transforms there, inspect a screenshot, and only then switch Program.
- Preserve user configuration and unrelated sources. Back up configuration before editing, use exact scene/input names and item IDs from fresh reads, and avoid deleting the original scene.
- Distinguish an OBS **profile** from a **scene collection**. Profiles store output/encoder settings; scene collections store scenes, sources, and layout. Saving a layout means preserving the scene collection and named scenes, even if the user casually calls it a profile.
- Keep credentials out of chat, command output, logs, and repositories. If WebSocket authentication is enabled, have the user enter the secret locally or store it in a protected local configuration with restrictive permissions.
- State required manual actions precisely. On Linux, the desktop portal may require the user to click **Select Screen**, choose a named monitor, click **Share**, and then click **OK**. Merely clicking **OK** does not grant a PipeWire capture token.
- Stop retrying stale PipeWire tokens after they repeatedly yield 0x0/black output. Open the source properties and request one fresh portal selection instead.

## Completion evidence

Do not declare success until evidence matches the requested outcome.

For MCP setup, confirm the executable is independent of any disposable checkout, Codex lists the server, OBS WebSocket is reachable, and a post-restart read-only OBS request succeeds.

For scene work, confirm the intended Program scene, each visible source's nonzero dimensions, a screenshot of the final composition, the requested recording state, and the retained named scene(s). Report any limitation honestly—for example, a crop over black is not background blur.
