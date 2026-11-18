# PS5 Shorts on Windows

This handoff describes how to reproduce the Ubuntu workflow on Windows. The capture and projector steps use standard OBS controls. The checked-in Shorts script still needs a Windows file-lock adapter. The Ubuntu implementation has been tested with synthetic footage and a simulated OBS stop event. Verify the port on the destination PC before enabling automatic clipping.

## 1. Clone and prepare the tools

```powershell
ssh -T git@github.com
git clone git@github.com:VatsalPatel18/codex-obs-skill.git
Set-Location codex-obs-skill
py -3.13 -m venv .venv
$Python = (Resolve-Path .\.venv\Scripts\python.exe).Path
& $Python -m pip install obsws-python
& $Python -m pip check
ffmpeg -version
ffprobe -version
ffmpeg -hide_banner -encoders | Select-String libx264
```

Use Python 3.11 or later with a version available on the target. Install Git, OBS Studio, FFmpeg with `libx264`, and the official FilmCraft Windows installer as needed. For a typical per-user FilmCraft install:

```powershell
$Film = Join-Path $env:LOCALAPPDATA 'Programs\ArtCraft\FilmCraft\filmcraft-cli.exe'
Test-Path -LiteralPath $Film
& $Film --version
codex mcp add filmcraft -- "$Film" mcp
codex mcp list
```

For a system-wide or portable install, resolve the actual CLI path first. Restart Codex if needed, then verify that it can list FilmCraft commands. The watcher uses FilmCraft CLI directly. Its runtime does not require an active Codex session. [FilmCraft releases and MCP setup](https://github.com/storytold/filmcraft/blob/main/docs/agents.md)

## 2. Configure OBS and verify the PS5 feed

1. Connect PS5 HDMI OUT to the card’s HDMI IN. Connect USB to the PC. If the card has HDMI OUT, connect it to the external monitor for passthrough. Disable **Enable HDCP** on the PS5 for gameplay capture.
2. In OBS, create or select scene collection `PS5`. Add **Video Capture Device** named `PS5 HDMI`. Select the card, start with a supported 1080p30 mode, fit it to the canvas, and confirm a visible moving PS5 picture.
3. Select the capture card’s audio and check the mixer while a game makes sound. Confirm that the intended mix goes to the first audio track in the recording. The Shorts script takes the first audio track when present. Set **Settings → Output → Recording** to a known folder and choose MKV for the test.
4. Enable **Tools → WebSocket Server Settings**. Record the port and enter the password locally in the user’s protected configuration. Verify `GetRecordStatus`, `GetRecordDirectory`, and `GetSceneCollectionList` before using the watcher. The watcher only needs OBS WebSocket. Reuse the OBS MCP setup if the user also wants interactive Codex controls. [OBS capture setup](https://obsproject.com/kb/video-capture-sources/) · [OBS WebSocket protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md) · [OBS MCP installation](../../references/mcp-setup.md)

For preview on monitor 2, use OBS’s fullscreen source projector or HDMI passthrough. The existing Windows tray app design is documented separately. [PS5 Screen Windows plan](../ps5-screen/README.md#windows-plan)

## 3. Port the worker

- Remove the unconditional `fcntl` import from `shorts.py`. Move the single-watcher lock into a platform helper. Keep `fcntl.flock` on Linux. On Windows, open a binary lock file, ensure it contains a byte, seek to offset zero, and acquire a single byte with `msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)`. Hold the handle for the entire watcher lifetime. Translate lock contention into a clear “watcher already running” error. Closing the handle releases the lock. Keep the lock file in place.
- Resolve executable paths explicitly. Pass `--filmcraft "$Film"`. Ensure `ffmpeg.exe` and `ffprobe.exe` are on the watcher’s PATH, including inside Task Scheduler, or add support for explicit paths. Use subprocess argument lists so spaces and Unicode in recording paths work.
- Pass `--codex-config` if the user’s settings are outside `%USERPROFILE%\.codex\config.toml`. The watcher reads `mcp_servers.obs.env` with `OBS_HOST`, `OBS_PORT`, and `OBS_PASSWORD`. A separate private TOML with that same layout also works. Use the current user’s file permissions and keep the password out of process arguments and the repository.
- Preserve the event contract. Subscribe to OBS Outputs and process `RecordStateChanged` only after `OBS_WEBSOCKET_OUTPUT_STOPPED` supplies an output path. Guard for a missing path, confirm the `PS5` collection, and pass that exact path to the cutter. Keep OBS in control of recording and preserve the original. [OBS recording events](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md#recordstatechanged)
- Verify that staging and publication work on NTFS. Render under the final output directory and publish the batch only after rendering and writing the manifest. Check reruns and existing output folders. FilmCraft must link the original recording using an absolute Windows path.

## 4. Validate before enabling

Make a test MKV with video and sound, then run the cutter with a fixed seed:

```powershell
$Scratch = Join-Path $env:TEMP ("ps5-shorts-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Scratch | Out-Null
$Sample = Join-Path $Scratch 'PS5 sample.mkv'
ffmpeg -f lavfi -i 'testsrc2=size=640x360:rate=30' `
  -f lavfi -i 'sine=frequency=440:sample_rate=48000' `
  -t 22 -c:v libx264 -preset ultrafast -c:a aac "$Sample"
& $Python .\apps\ps5-shorts\shorts.py --filmcraft "$Film" `
  --output "$Scratch\out" --seconds 6 --count 3 --seed 42 cut "$Sample"
```

Use FFprobe to confirm that all three exports are approximately six seconds, 1080×1920 at 30 FPS, and contain H.264 and AAC. Play a sample to check framing and audio. Inspect the batch manifest for non-overlapping source ranges and a FilmCraft project with no error. Open `shorts.fcproj` and confirm the three sequences resolve the source. Rerun with identical options and confirm that it reuses the existing batch.

With permission to test recording, start the watcher in a PowerShell window and wait for its listening message:

```powershell
$Output = Join-Path $env:USERPROFILE 'Videos\PS5-Shorts'
& $Python .\apps\ps5-shorts\shorts.py --filmcraft "$Film" --output "$Output" watch
```

Record and stop a short PS5 clip from OBS. Confirm that exactly one batch appears, the original remains intact, and a recording from a different collection is ignored. Check reconnect after reopening OBS while no recording is running. Use Ctrl+C to stop the foreground watcher. Recordings that finish while the watcher is offline can be processed with `cut`.

After activation is authorized, keep the foreground session or create a per-user Windows scheduled task. Use absolute paths for the venv Python, script, FilmCraft CLI, and output folder. Set the working directory to the repository and configure the task to ignore a new launch if already running. Use an on-demand trigger for manual activation or an at-logon trigger if the user requests startup automation. Record the task name and verify how to stop or disable it. [Windows Task Scheduler triggers](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger)
