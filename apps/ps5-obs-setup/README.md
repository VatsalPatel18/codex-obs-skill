# PS5 OBS Setup

This command-line tool sets up a dedicated **PS5 Capture** scene in the active OBS scene collection. It lists the capture devices reported by OBS, lets you choose video and game audio, and checks a few video frames and audio levels. On Windows it uses DirectShow and optionally a separate WASAPI input. On Linux it uses V4L2 and a PulseAudio-compatible input.

## Run or install

You need Node.js 22 or newer, OBS Studio 28 or newer with WebSocket enabled under **Tools → WebSocket Server Settings**, and a capture card that works with your OBS build. Keep authentication enabled. The tool connects to the local OBS instance and reads its standard per-user WebSocket settings when available. For portable installations or several enabled configurations, set `OBS_WEBSOCKET_PORT` and `OBS_WEBSOCKET_PASSWORD` in your local terminal environment.

Connect the PS5 HDMI output to the capture card and the card to the laptop by USB. On the PS5, turn off **Settings → System → HDMI → Enable HDCP** for gameplay capture. Leave a visible, audible game scene open while checking the capture.

From this folder on Windows or Linux:

```sh
node setup.mjs
node setup.mjs --check
```

To hear game audio on the device selected in OBS under **Settings → Audio → Advanced → Monitoring Device**, run `node setup.mjs --monitor-audio` when setting up the scene. It enables **Monitor and Output** for the selected PS5 audio path. See the [verified Windows settings](WINDOWS.md) for fullscreen play and the external-monitor speaker wiring.

To install the command for later use, run `npm install --global .` from this folder. Run `ps5-obs-setup` for setup or `ps5-obs-setup --check` for diagnostics. Use `npm uninstall --global ps5-obs-setup` to remove the command. The package has no external Node dependencies.

## Verify the scene

1. Pick the capture card from OBS’s video device list. Select its USB audio endpoint if it appears. On Windows you can also test audio from the video source. On Linux, select the USB audio input when the PulseAudio-compatible source is available.
2. Look at the OBS preview to confirm it shows the PS5. The automated pixel check distinguishes a lit sample from a dark one. A capture-card test pattern can also pass the pixel check. Confirm the audio by playing a game and watching the PS5 source meter respond. An audio level by itself can also be incidental noise.
3. If video is dark, confirm the console is awake, HDCP is disabled, and HDMI runs from the console to the card’s input. If needed, choose a mode the card supports in the OBS source properties. For the card previously tested on Ubuntu, the [PS5 capture handoff](../../references/ps5-capture-handoff.md) records a working 1080p MJPEG setup. If the console routes audio to a controller headset, check its audio output settings and confirm HDMI carries game audio.
4. Before going live, check OBS’s stream destination, output settings, and mixer. OBS global microphones and desktop audio can carry into the PS5 scene, depending on the current setup. The tool sets up the scene while outputs are idle and leaves starting the broadcast to you.

`--check` reads the existing scene without changing OBS. Select **PS5 Capture** in OBS first so the devices are active. Exit status `2` means the sample did not verify both picture and audio. Exit status `1` means the command encountered a setup or connection error.

For fullscreen play from the USB feed, use OBS’s **Fullscreen Projector (Source)** on **PS5 HDMI Video** and press **Esc** to return to the desktop. For HDMI play through a passthrough-capable capture card, connect the card’s HDMI OUT to the monitor and choose that input. The OBS scene continues to use the card’s USB feed.
