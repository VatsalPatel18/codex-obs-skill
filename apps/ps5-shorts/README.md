# PS5 Shorts

For an agent setting this up on Windows, see the [Windows handoff](WINDOWS.md).

OBS saves the full recording. After recording stops, this app samples up to three random 25-second excerpts spread through the recording. The excerpts do not overlap. A short recording yields fewer clips, and recordings under 25 seconds yield one clip. The app makes vertical 1080×1920 H.264 MP4s at 30 FPS with AAC from the first audio track, when present. It fits the full gameplay frame inside the vertical canvas with black padding to keep the HUD visible.

Each batch includes a manifest with source time ranges and the random seed. FilmCraft creates an editable project with a sequence for each excerpt, linked to the original recording. Keep the original recording at its saved path to open that project. FFmpeg renders the social MP4s. If FilmCraft cannot import or build a project, the MP4s and the manifest still save, and the manifest records the FilmCraft error. Review the random excerpts before uploading.

## Install and use

The current machine has OBS WebSocket and FilmCraft CLI installed. The native FilmCraft server is registered as `filmcraft` in Codex. A fresh Codex session can load it. The automated workflow calls the same FilmCraft engine via its CLI, so it can keep running without a Codex session. [FilmCraft source and setup](https://github.com/storytold/filmcraft)

For another machine, install Python 3.11 or later, FFmpeg with `libx264`, and FilmCraft. For watcher mode also install `obsws-python` in that Python environment. Configure the OBS WebSocket connection using the [OBS MCP setup](../../references/mcp-setup.md), or pass `--codex-config` to use another local config file with the same `mcp_servers.obs.env` structure.

Process an existing, finalized recording once:

```bash
python3 apps/ps5-shorts/shorts.py cut "/path/to/finished-recording.mkv"
```

Start watching future recordings from the `PS5` scene collection on this machine:

```bash
systemd-run --user --unit=ps5-shorts --collect \
  --working-directory=/home/prime/obs-skill \
  /home/prime/.local/share/uv/tools/obs-mcp/bin/python apps/ps5-shorts/shorts.py watch
```

After the listener connects, start and stop recording in OBS as usual. Keep the PS5 collection selected when stopping. The watcher handles stop events with a finalized output path and reads the active collection before queuing a recording. The existing OBS recording directory was `/home/prime/snap/obs-studio/common` at setup. The watcher uses the path received from OBS, including if that directory changes later. It reconnects if OBS restarts. Use the manual `cut` command for recordings finished while the watcher was offline or for manually split segments.

Outputs default to `~/Videos/PS5-Shorts/`, with one folder per source and settings combination. Pass global options before `cut` or `watch`, such as `--count 4 --seconds 15 --seed 42` or `--output /path/to/shorts`. Repeat runs with the same source and options reuse the saved batch. Use a different seed for a fresh set.

```bash
journalctl --user -u ps5-shorts -f
systemctl --user stop ps5-shorts
```
