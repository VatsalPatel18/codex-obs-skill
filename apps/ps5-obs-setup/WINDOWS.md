# PS5 capture and fullscreen play on Windows

This setup was verified with OBS Studio 32.2.2 on Windows. The laptop simultaneously showed the OBS controls and projected the PS5 feed fullscreen on the external display. Game audio played through speakers connected to the monitor’s AUX output.

## Wiring

1. Connect PS5 HDMI OUT to the capture card’s HDMI IN. Connect the card to the laptop by USB.
2. Connect the laptop’s HDMI OUT to the external monitor. In Windows display settings, use **Extend these displays**.
3. Connect the monitor’s AUX output to the speakers. In Windows Sound, choose the external monitor’s HDMI audio output. On the tested setup, it appeared as **VA2215 100Hz (NVIDIA High Definition Audio)**.
4. On the PS5, turn off **Settings → System → HDMI → Enable HDCP** for gameplay capture. Start a game to verify both picture and sound.

## Profile, scene collection, and sources

OBS has separate **Profile** and **Scene Collection** menus. A profile stores output settings such as canvas resolution, encoder settings, and recording options. A scene collection stores scenes and their sources. The tested machine has `Untitled` and `YouTube_Shorts_Live` entries in both menus. For this setup, the active profile and scene collection were both `Untitled`. The active scene in that collection was `PS5 Capture`. On another machine, the collection and profile can have different names.

| Setting | Verified Windows configuration |
| --- | --- |
| OBS canvas and output | 1920 × 1080, 60 FPS output |
| `PS5 HDMI Video` | **Video Capture Device**, selected **USB Video** |
| Capture card signal to OBS | 1920 × 1080 at 30 FPS, MJPEG on the tested MacroSilicon card |
| Video layout | Center the source and fit it to the canvas without cropping |
| `PS5 HDMI Audio` | **Audio Input Capture**, selected **Digital Audio Interface (USB Digital Audio)** |
| Game audio source | Unmuted, 0 dB, included on recording and streaming tracks |
| Audio monitoring | **Monitor and Output** on `PS5 HDMI Audio` |
| Monitoring device | **Default** in OBS, with the monitor selected in Windows Sound |

Select the capture devices by their displayed names or use the setup tool to pick the devices on your machine. With the separate USB audio input selected, mute the audio from `PS5 HDMI Video` to avoid a duplicate capture path.

```powershell
node apps/ps5-obs-setup/setup.mjs --monitor-audio
node apps/ps5-obs-setup/setup.mjs --check
```

The first command sets up the scene in the active collection. The second checks the existing scene while the PS5 is connected. To enable local audio by hand, open **Advanced Audio Properties** from the OBS mixer and select **Monitor and Output** for `PS5 HDMI Audio`. Then check that the source meter moves with game audio and confirm sound through the monitor’s speakers or AUX output.

## Fullscreen preview and recovery

- In OBS, right-click the **PS5 HDMI Video** source and choose **Fullscreen Projector (Source)**, then select the external monitor. Keep OBS on the laptop display. The fullscreen projector and the stream use the same capture feed.
- Press **Esc** in the fullscreen projector to reveal the extended Windows desktop. The PS5 scene remains available in OBS.
- If Windows sees the card after startup but OBS shows a blank source or reports 0 × 0, open the video source’s properties, select the current **USB Video** device, and use **Deactivate** then **Activate** to reopen it. After a restart on the tested machine, reopening the source restored a visible PS5 frame. If the source has dimensions but the picture is black, check that the PS5 is awake and that the HDMI signal reaches the card.
- Local monitoring, capture, recording, and streaming can be checked independently. Before broadcasting, verify the OBS mixer and stream destination. For automatic clips from finished recordings, see the [PS5 Shorts workflow](../ps5-shorts/README.md).
