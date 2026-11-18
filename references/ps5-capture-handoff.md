# PS5 capture with OBS MCP

Use this handoff to reproduce the working Ubuntu setup from 2026-11-18 or to validate a replacement capture card. The goal is to show the PS5 fullscreen on the external monitor while OBS controls stay available on the laptop.

## Tools and prerequisites

- We used the connected `obs` MCP server from [xDarkzx/OBS_MCP](https://github.com/xDarkzx/OBS_MCP). Codex runs the local `obs-mcp` STDIO executable, which connects to the running OBS instance over obs-websocket v5 at `127.0.0.1:4455`. For a fresh installation, follow [MCP setup](mcp-setup.md). Confirm access with a read-only request before changing OBS.
- The local [OBS skill](../SKILL.md) provided the [scene staging and verification workflow](dual-screen-operations.md). Use OBS MCP for scene and projector operations. Use Ubuntu USB, V4L2, and audio diagnostics to identify hardware independently.
- The working signal path was PS5 HDMI OUT → capture card HDMI IN → USB to Ubuntu. OBS drew the fullscreen projector through the laptop’s HDMI output to the external monitor. The DualSense controlled the PS5 directly.
- The user disabled **Settings → System → HDMI → Enable HDCP** on the PS5. No console restart or console control command was used.

## Hardware and signal check

Run `lsusb`, inspect `/dev/v4l/by-id/`, and use `udevadm info -q property -n /dev/video2` to identify the video node if it still exists. The tested card was MacroSilicon `534d:2109`. Its image-producing node was `/dev/video2`, also reachable at `/dev/v4l/by-id/usb-MACROSILICON_2109-video-index0`. The adjacent `/dev/video3` node did not advertise capture capability. Discover the USB audio input with `wpctl status -n` or `arecord -l`.

With the card free, read a frame after the first 60 frames so the HDMI signal can settle. The first immediate sample was black even after HDCP was disabled. The later 1080p sample showed the PS5’s **Adjust Display Area** screen.

```bash
ffmpeg -hide_banner -f v4l2 -input_format mjpeg \
  -video_size 1920x1080 -framerate 30 \
  -i /dev/v4l/by-id/usb-MACROSILICON_2109-video-index0 \
  -vf 'select=eq(n\,60)' -frames:v 1 ps5-signal.jpg
```

Close the separate preview before opening the same device in OBS if the card reports that it is busy.

## OBS MCP calls used

1. Read `get_record_status({})`, `get_stream_status({})`, `get_current_program_scene({})`, `get_scene_collection_list({})`, and `get_input_list({})`. Both outputs were idle. The active collection was `Untitled` with no PS5 input.
2. Called `create_scene_collection({"name":"PS5"})`, which creates and selects the collection. OBS exited unexpectedly shortly after the switch. The collection was already saved, so we reopened OBS with `/snap/bin/obs-studio --collection PS5 --disable-missing-files-check`. We checked the active collection and default scene `Scene` before continuing. Reopen only if OBS has exited, and check for existing sources before retrying writes.
3. Added these two enabled inputs to `Scene` with `create_input`:

```json
{
  "scene_name": "Scene",
  "input_name": "PS5 HDMI",
  "input_kind": "v4l2_input",
  "input_settings": {
    "device_id": "/dev/video2",
    "pixelformat": 1196444237,
    "resolution": 125830200,
    "buffering": false
  }
}
```

```json
{
  "scene_name": "Scene",
  "input_name": "PS5 HDMI Audio",
  "input_kind": "pulse_input_capture",
  "input_settings": {
    "device_id": "alsa_input.usb-MACROSILICON_2109-02.analog-stereo"
  }
}
```

The numeric values represent MJPEG and 1920×1080. We did not set the OBS source frame rate explicitly. The FFmpeg probe requested 30 FPS. OBS reported a 1920×1080 canvas and a configured 1280×720 output at 30 FPS. The scene item already filled the canvas, so no transform was needed.

4. Called `get_scene_item_list({"scene_name":"Scene"})` and `get_source_screenshot({"source_name":"PS5 HDMI","image_format":"jpg","image_width":480})`. The item measured 1920×1080 and the screenshot showed the PS5. Checked the selected audio device against `get_input_properties_list_property_items({"input_name":"PS5 HDMI Audio","property_name":"device_id"})`. Sound and audio sync were not tested.
5. Called `get_monitor_list({})`. In that session, OBS reported `eDP-1` at index 0 and the external `HDMI-1` at index 1. Called `open_source_projector({"source_name":"PS5 HDMI","monitor_index":1})`. Re-read the monitor list on each setup. OBS monitor indices can change.
6. Verified the composed scene using `get_source_screenshot` for `Scene` and checked that recording was idle. Both PS5 sources were present in the saved scene collection. No separate OBS profile was created and no stream was started.

## Swapping hardware and comparing sharpness

- **Same card, different laptop USB port.** Recheck video and audio names. Linux can renumber `/dev/videoN`. Match the device using a by-id link when unique, or a by-path link when distinguishing identical cards by physical port. Moving the USB cable alone does not change the PS5’s HDMI peer, although power-cycling the card can trigger a fresh handshake.
- **New capture card.** Confirm the two HDMI ports are labeled IN and OUT before wiring for passthrough. Connect PS5 → card IN, card OUT → external monitor, and card USB → laptop. Verify the passthrough picture, then identify the new USB video and audio devices and add separately named sources. Check the card’s USB capture modes independently of the HDMI passthrough modes. Preserve the working card’s scene as a fallback.
- **Direct HDMI.** Connect the PS5 straight to the monitor for a reference picture. That path does not feed the computer. The PS5 can negotiate a different signal with a different HDMI device when video settings are on Automatic. Check **Settings → Screen and Video → Video Output** for both the current signal and the connected device’s capabilities. Compare the same PS5 menu or game scene over direct HDMI, the capture preview, and a short recording. The existing 720p OBS output can soften recordings and streams independently of the fullscreen source projector. The cause of the reported preview blur was not measured.
- **Windows.** Use the same wiring and add **Video Capture Device** in OBS. Choose the card from the device list and select a supported resolution, frame rate, and format. Use its embedded audio or select its USB audio input separately, then open the source’s fullscreen projector on the external display. Discover device names and monitor indices again on Windows. [OBS capture source documentation](https://obsproject.com/kb/video-capture-sources/) · [OBS projector documentation](https://obsproject.com/kb/power-of-projectors/)

[PlayStation video output settings](https://www.playstation.com/en-us/support/hardware/ps5-4k-resolution-guide/)
