#!/usr/bin/env python3
"""Export random, non-overlapping vertical clips from finalized OBS recordings."""

import argparse
import fcntl
import hashlib
import json
import math
import os
import queue
import random
import secrets
import subprocess
import tempfile
import time
import tomllib
from pathlib import Path


def run(command, *, script=None, timeout=900):
    result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        detail = (result.stderr.strip() or result.stdout.strip())[-1600:]
        raise RuntimeError(f"{Path(command[0]).name} failed: {detail}")
    return result.stdout


def probe(source):
    metadata = json.loads(run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type",
        "-of", "json", str(source),
    ], timeout=30))
    if not any(stream.get("codec_type") == "video" for stream in metadata.get("streams", [])):
        raise ValueError("The recording has no video track.")
    duration = float(metadata.get("format", {}).get("duration", "nan"))
    if not math.isfinite(duration) or duration < 1:
        raise ValueError("The recording needs a finalized duration of at least one second.")
    return duration


def sample_windows(duration, seconds, count, seed):
    # Allocate whole 30 FPS frames so project and export cuts share a grid.
    total = math.floor(duration * 30)
    length = min(seconds * 30, total)
    count = min(count, total // length)
    rng = random.Random(seed)
    windows = []
    for index in range(count):
        left = total * index // count
        right = total * (index + 1) // count
        windows.append((rng.randint(left, right - length), length))
    return windows


def filmcraft_run(cli, options, commands):
    script = "".join(json.dumps({"id": command, "params": params}) + "\n" for command, params in commands)
    responses = [json.loads(line) for line in run([cli, "--compact", *options, "run", "-"], script=script).splitlines()]
    if len(responses) != len(commands) or any(not response.get("ok") for response in responses):
        raise RuntimeError("FilmCraft did not complete all timeline commands.")
    return responses


def create_project(cli, source, directory, windows):
    project = directory / "shorts.fcproj"
    with tempfile.TemporaryDirectory(prefix="ps5-filmcraft-") as temp:
        imported = Path(temp) / "source.fcproj"
        [response] = filmcraft_run(cli, ["--save-as", str(imported)], [
            ("file.import", {"paths": [str(source)]}),
        ])
        items = response["result"].get("items", [])
        if len(items) != 1:
            raise RuntimeError("FilmCraft could not import the original recording.")
        commands = []
        for index, (start, length) in enumerate(windows, 1):
            commands.extend([
                ("file.newSequence", {
                    "name": f"Short {index:02d}", "width": 1080, "height": 1920,
                    "fps": 30, "video": 1, "audio": 1,
                }),
                ("timeline.place", {
                    "item": items[0], "track": "V1", "audioTrack": "A1", "seconds": 0,
                    "sourceIn": {"seconds": start / 30}, "duration": {"seconds": length / 30},
                }),
                ("clip.fitToFrame", {}),
            ])
        filmcraft_run(cli, ["--project", str(imported), "--save-as", str(project)], commands)
    return project.name


def export_clip(source, destination, start, length):
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-n",
        "-ss", f"{start / 30:.9f}", "-i", str(source), "-t", f"{length / 30:.9f}",
        "-map", "0:v:0", "-map", "0:a:0?",
        "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,"
               "setsar=1,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,fps=30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(destination),
    ])


def cut(source, settings):
    source = source.expanduser().resolve(strict=True)
    metadata = source.stat()
    identity = (str(source), metadata.st_size, metadata.st_mtime_ns, settings.count, settings.seconds, settings.seed)
    key = hashlib.sha256(repr(identity).encode()).hexdigest()[:12]
    output = settings.output.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    destination = output / f"{source.stem[:90]}-{key}"
    if (destination / "manifest.json").is_file():
        return destination

    seed = settings.seed if settings.seed is not None else secrets.randbits(64)
    windows = sample_windows(probe(source), settings.seconds, settings.count, seed)
    with tempfile.TemporaryDirectory(prefix=".working-", dir=output) as temp:
        staging = Path(temp)
        clips = []
        for index, (start, length) in enumerate(windows, 1):
            name = f"short-{index:02d}.mp4"
            export_clip(source, staging / name, start, length)
            clips.append({"file": name, "start_frame": start, "duration_frames": length})
        project = None
        project_error = None
        try:
            project = create_project(settings.filmcraft, source, staging, windows)
        except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
            project_error = str(error)
            print(f"FilmCraft project skipped: {project_error}", flush=True)
        (staging / "manifest.json").write_text(json.dumps({
            "source": str(source), "fps": 30, "seed": seed, "clips": clips,
            "filmcraft_project": project, "filmcraft_error": project_error,
        }, indent=2) + "\n")
        # Check the source again before publishing the finished batch.
        final_stat = source.stat()
        if (metadata.st_size, metadata.st_mtime_ns) != (final_stat.st_size, final_stat.st_mtime_ns):
            raise RuntimeError("The source is still changing. Retry after OBS finishes writing it.")
        try:
            staging.rename(destination)
        except OSError:
            if not (destination / "manifest.json").is_file():
                raise
    return destination


def watch(settings):
    import obsws_python
    from obsws_python.subs import Subs

    with settings.codex_config.expanduser().open("rb") as file:
        env = tomllib.load(file)["mcp_servers"]["obs"].get("env", {})
    connection = {
        "host": env.get("OBS_HOST", "127.0.0.1"),
        "port": int(env.get("OBS_PORT", "4455")),
        "password": env.get("OBS_PASSWORD", ""),
        "timeout": 3,
    }
    pending = queue.Queue()

    def on_record_state_changed(event):
        if event.output_state != "OBS_WEBSOCKET_OUTPUT_STOPPED" or not event.output_path:
            return
        try:
            with obsws_python.ReqClient(**connection) as request:
                collection = request.send("GetSceneCollectionList", raw=True)["currentSceneCollectionName"]
        except Exception as error:
            print(f"Could not confirm the recording collection ({type(error).__name__}). Use cut to retry.", flush=True)
            return
        if collection == settings.collection:
            pending.put(Path(event.output_path))

    output = settings.output.expanduser()
    output.mkdir(parents=True, exist_ok=True)
    with (output / ".watch.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("A watcher is already running for this output folder.") from error
        client = None
        try:
            while True:
                if client is None or not client.worker.is_alive():
                    if client is not None:
                        client.disconnect()
                        client = None
                    try:
                        client = obsws_python.EventClient(**connection, subs=Subs.OUTPUTS)
                        client.callback.register(on_record_state_changed)
                        print("Listening for finished OBS recordings.", flush=True)
                    except Exception as error:
                        print(f"OBS connection unavailable ({type(error).__name__}). Retrying.", flush=True)
                try:
                    source = pending.get(timeout=2)
                except queue.Empty:
                    continue
                try:
                    print(cut(source, settings), flush=True)
                except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
                    print(f"Could not process {source.name}: {error}", flush=True)
        finally:
            if client is not None:
                client.disconnect()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path.home() / "Videos/PS5-Shorts")
    parser.add_argument("--count", type=int, default=3)
    parser.add_argument("--seconds", type=int, default=25)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--filmcraft", default=str(Path.home() / ".local/bin/filmcraft-cli"))
    parser.add_argument("--codex-config", type=Path, default=Path(
        os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))
    ) / "config.toml")
    modes = parser.add_subparsers(dest="mode", required=True)
    modes.add_parser("cut", help="Process one completed recording.").add_argument("source", type=Path)
    watcher = modes.add_parser("watch", help="Wait for future OBS recording stops.")
    watcher.add_argument("--collection", default="PS5")
    settings = parser.parse_args()
    if settings.count < 1 or settings.seconds < 1:
        parser.error("--count and --seconds must be positive")
    try:
        if settings.mode == "watch":
            watch(settings)
        else:
            print(cut(settings.source, settings))
    except KeyboardInterrupt:
        pass
    except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
