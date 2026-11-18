# PS5 Screen

PS5 Screen opens the OBS preview of a USB capture card on an external monitor. The Ubuntu dock launcher opens the preview. The GNOME top-bar menu shows or minimizes the projector and checks whether the capture card is connected. The PS5 stays connected and continues running while the monitor shows Ubuntu.

## Files

The originals were installed in three user directories. This folder collects copies for reuse.

| File | Installation path |
| --- | --- |
| `ps5-screen` | `~/.local/bin/ps5-screen` |
| `ps5-screen.desktop` | `~/.local/share/applications/ps5-screen.desktop` |
| `ps5-screen@local/extension.js` and `metadata.json` | `~/.local/share/gnome-shell/extensions/ps5-screen@local/` |

## Set up on Ubuntu

1. Set up OBS and its capture source using the [PS5 capture handoff](../../references/ps5-capture-handoff.md). Save a `PS5` scene collection with a video input named `PS5 HDMI`. Enable the WebSocket server under **Tools → WebSocket Server Settings**. The helper starts local OBS in the `PS5` collection when OBS is closed and waits for the source to load. If OBS is already open, select the `PS5` collection before opening the projector. The helper reads the `mcp_servers.obs.env` section in `~/.codex/config.toml` for the local OBS host, port, and password. See [OBS MCP setup](../../references/mcp-setup.md) for prerequisites and credential handling.
2. Inspect the target machine before installing. Set the helper’s first line to an absolute Python 3.11+ interpreter with `obsws_python` installed. The copy uses the interpreter from the `uv` OBS MCP environment on the original machine. In the desktop file, set `Exec` to the target user’s absolute path to the installed helper. The helper expects `notify-send` for error notifications.
3. Check `ls -l /dev/v4l/by-id/` and use the capture card’s image-producing node. Replace the device path in both `ps5-screen` and `extension.js` if it differs from `/dev/v4l/by-id/usb-MACROSILICON_2109-video-index0`. Check OBS’s `GetMonitorList` result and adjust the helper’s `HDMI-1` match if the display uses another connector. The helper resolves the current OBS monitor index at launch.
4. Run the commands below from this folder. The extension declares GNOME Shell 50 support. On other versions, verify the Shell APIs and update the compatibility metadata before enabling it. Check for existing files at the destinations before replacing a prior install.

```bash
install -Dm755 ps5-screen "$HOME/.local/bin/ps5-screen"
install -Dm644 ps5-screen.desktop "$HOME/.local/share/applications/ps5-screen.desktop"
install -Dm644 ps5-screen@local/extension.js \
  "$HOME/.local/share/gnome-shell/extensions/ps5-screen@local/extension.js"
install -Dm644 ps5-screen@local/metadata.json \
  "$HOME/.local/share/gnome-shell/extensions/ps5-screen@local/metadata.json"
gnome-extensions enable ps5-screen@local
```

If GNOME reports that the extension does not exist, it has not discovered the newly installed files in the running session. Log out and back in when convenient, then run the enable command again. Use `gnome-extensions info ps5-screen@local` to check its state. The launcher works independently in the meantime. Find **PS5 Screen** in **Show Applications**, then right-click it and choose **Pin to Dash** or **Add to Favorites**, depending on the desktop version.

## Use and recover

- **Dock launcher.** Click **PS5 Screen** to open the projector. Focus the projector and press **Esc** to close it and use Ubuntu on that monitor. Click the launcher again to reopen it.
- **Top-bar menu.** Choose **Show PS5 on monitor 2** to restore the projector or open it if closed. Choose **Use Ubuntu on monitor 2** to minimize it. The menu refreshes card presence when opened and disables **Show PS5** while the configured card is disconnected.
- **Launcher reports a missing device or source.** Confirm the USB node, check that OBS is running, and verify the exact source and monitor names. USB presence only confirms that Ubuntu sees the capture device. For a black picture, check the HDMI signal using the handoff linked above.
- **Menu is missing or causes trouble.** Use the dock and **Esc** workflow. To disable the menu, run `gnome-extensions disable ps5-screen@local`.

On the original machine, GNOME had not loaded the new extension in the current session. The user confirmed that **Esc** closed the existing projector. Validate the top-bar menu after login, including the disconnected-card state.

## Windows plan

The same workflow is possible on Windows using OBS WebSocket and a small C# WinForms app in the notification area. The Ubuntu files above implement the GNOME version. The Windows version is a design plan.

1. Set up the OBS scene with a **Video Capture Device** named `PS5 HDMI`. Enable the local OBS WebSocket server. In the tray app, let the user select the capture device and target display. Use a Windows device ID to match the card and handle USB arrivals and removals. [OBS Windows capture setup](https://obsproject.com/kb/video-capture-sources/) · [Windows device notifications](https://learn.microsoft.com/en-us/windows/win32/devio/registering-for-device-notification)
2. On **Show PS5**, resolve the display’s current OBS index with `GetMonitorList`. If the existing projector is minimized, restore it. Otherwise, open it with `OpenSourceProjector`. Keep the OBS WebSocket password in a local credential store. [OBS WebSocket protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)
3. On **Use Windows**, minimize only the projector. Find it with `EnumWindows` and confirm both the OBS process and the projector title for `PS5 HDMI` before calling `ShowWindowAsync`. Keep the tray action to return to Windows available whenever the projector is shown, including after USB unplug. [Windows window enumeration](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-enumwindows) · [Windows window state controls](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindowasync)
4. On the target Windows machine, verify open, minimize, restore, monitor reconnection, and USB removal. For immediate manual use, open **Fullscreen Projector (Source)** from OBS and press **Esc** to return to Windows. [OBS projector guide](https://obsproject.com/kb/power-of-projectors/)
