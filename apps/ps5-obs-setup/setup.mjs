#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { connect, hasVisiblePixels } from './obs.mjs';

const sceneName = 'PS5 Capture';
const videoName = 'PS5 HDMI Video';
const audioName = 'PS5 HDMI Audio';
const windows = process.platform === 'win32';
const videoKind = windows ? 'dshow_input' : 'v4l2_input';
const videoProperty = windows ? 'video_device_id' : 'device_id';
const audioKind = windows ? 'wasapi_input_capture' : 'pulse_input_capture';

async function connectionSettings() {
  const roots = windows ? [process.env.APPDATA].filter(Boolean) : [
    process.env.XDG_CONFIG_HOME || join(homedir(), '.config'),
    join(homedir(), '.var', 'app', 'com.obsproject.Studio', 'config'),
    join(homedir(), 'snap', 'obs-studio', 'current', '.config'),
  ];
  const configs = [];
  for (const root of new Set(roots)) {
    const path = join(root, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json');
    try {
      const config = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
      if (config.server_enabled) configs.push(config);
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Could not read OBS WebSocket settings at ${path}.`, { cause: error });
    }
  }
  if (configs.length > 1 && process.env.OBS_WEBSOCKET_PASSWORD === undefined) {
    throw new Error('Found multiple enabled OBS configurations. Set OBS_WEBSOCKET_PORT and OBS_WEBSOCKET_PASSWORD for the running instance.');
  }
  const config = configs[0];
  const port = Number(process.env.OBS_WEBSOCKET_PORT ?? config?.server_port ?? 4455);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid OBS WebSocket port.');
  return { port, password: process.env.OBS_WEBSOCKET_PASSWORD ?? config?.server_password };
}

async function requireIdle(obs) {
  const optionalOutput = async request => {
    try {
      return await obs.call(request);
    } catch (error) {
      // OBS uses 604 (InvalidResourceState) when the output is unavailable.
      if (error.code === 604) return { outputActive: false };
      throw error;
    }
  };
  const [stream, record, replay, camera] = await Promise.all([
    obs.call('GetStreamStatus'), obs.call('GetRecordStatus'),
    optionalOutput('GetReplayBufferStatus'), optionalOutput('GetVirtualCamStatus'),
  ]);
  if ([stream, record, replay, camera].some(output => output.outputActive)) {
    throw new Error('Stop the active OBS outputs before setting up the PS5 scene. Use --check for read-only diagnostics.');
  }
}

async function getDevices(obs, inputName, propertyName) {
  const { propertyItems } = await obs.call('GetInputPropertiesListPropertyItems', { inputName, propertyName });
  return propertyItems.filter(item => item.itemEnabled && item.itemValue && item.itemValue !== 'default');
}

async function choose(prompt, title, devices, fallback) {
  if (fallback) console.log(`  0. ${fallback}`);
  devices.forEach((device, index) => console.log(`  ${index + 1}. ${device.itemName}`));
  while (true) {
    const answer = (await prompt.question(`${title} (q to cancel): `)).trim();
    if (answer.toLowerCase() === 'q') throw new Error('Setup canceled.');
    if (/^\d+$/.test(answer)) {
      const number = Number(answer);
      if (number === 0 && fallback) return null;
      if (number >= 1 && number <= devices.length) return devices[number - 1];
    }
    console.log('Enter one of the listed numbers.');
  }
}

async function configure(obs, { monitorAudio }) {
  if (!process.stdin.isTTY) throw new Error('Run setup in an interactive terminal.');
  await requireIdle(obs);
  const [{ inputKinds }, { scenes }, { inputs }, { baseWidth, baseHeight },
    { currentSceneCollectionName }] = await Promise.all([
    obs.call('GetInputKindList'), obs.call('GetSceneList'), obs.call('GetInputList'), obs.call('GetVideoSettings'),
    obs.call('GetSceneCollectionList'),
  ]);
  if (!inputKinds.includes(videoKind)) throw new Error(`This OBS build does not provide ${videoKind}.`);
  const exists = scenes.some(scene => scene.sceneName === sceneName);
  const { sceneItems } = exists ? await obs.call('GetSceneItemList', { sceneName }) : { sceneItems: [] };
  if (sceneItems.some(item => ![videoName, audioName].includes(item.sourceName))) {
    throw new Error(`The existing ${sceneName} scene has other sources. Rename it before running setup.`);
  }
  for (const [name, kind] of [[videoName, videoKind], [audioName, audioKind]]) {
    const input = inputs.find(item => item.inputName === name);
    const items = sceneItems.filter(item => item.sourceName === name);
    if (input && (input.inputKind !== kind || items.length !== 1)) {
      throw new Error(`The OBS source “${name}” is already in use. Rename it before running setup.`);
    }
    if (input) {
      for (const scene of scenes.filter(item => item.sceneName !== sceneName)) {
        const { sceneItems: itemsInScene } = await obs.call('GetSceneItemList', { sceneName: scene.sceneName });
        if (itemsInScene.some(item => item.sourceName === name)) {
          throw new Error(`“${name}” is shared with ${scene.sceneName}. Rename it before running setup.`);
        }
      }
    }
  }

  const created = [];
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  prompt.on('SIGINT', () => prompt.close());
  let createdScene = false;
  let applying = false;
  const ensureInput = async (inputName, inputKind) => {
    const existing = sceneItems.find(item => item.sourceName === inputName);
    if (existing) return existing.sceneItemId;
    const { sceneItemId } = await obs.call('CreateInput', { sceneName, inputName, inputKind, sceneItemEnabled: false });
    created.push(inputName);
    return sceneItemId;
  };
  try {
    if (!exists) {
      await obs.call('CreateScene', { sceneName });
      createdScene = true;
    }
    const videoId = await ensureInput(videoName, videoKind);
    const devices = await getDevices(obs, videoName, videoProperty);
    if (!devices.length) throw new Error('OBS found no video devices. Connect the capture card and check its driver or device permissions.');
    const video = await choose(prompt, 'Select the PS5 capture card', devices);
    let audio = null;
    let audioId = null;
    if (inputKinds.includes(audioKind)) {
      audioId = await ensureInput(audioName, audioKind);
      audio = await choose(prompt, 'Select PS5 game audio', await getDevices(obs, audioName, 'device_id'),
        windows ? 'Use audio from the video source' : 'Skip game audio for now');
    } else {
      console.log('This OBS build does not expose a separate audio capture source.');
    }

    if ((await obs.call('GetSceneCollectionList')).currentSceneCollectionName !== currentSceneCollectionName) {
      throw new Error('The OBS scene collection changed during setup. Return to the original collection and rerun setup.');
    }
    await requireIdle(obs);
    applying = true;
    await obs.call('SetInputSettings', {
      inputName: videoName, inputSettings: { [videoProperty]: video.itemValue }, overlay: true,
    });
    await obs.call('SetSceneItemTransform', {
      sceneName, sceneItemId: videoId,
      sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsAlignment: 0,
        boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsWidth: baseWidth, boundsHeight: baseHeight },
    });
    if (audio) {
      await obs.call('SetInputSettings', { inputName: audioName, inputSettings: { device_id: audio.itemValue }, overlay: true });
      await obs.call('SetInputMute', { inputName: audioName, inputMuted: false });
    }
    if (windows) await obs.call('SetInputMute', { inputName: videoName, inputMuted: Boolean(audio) });
    if (audioId !== null) {
      if (!audio && created.includes(audioName)) await obs.call('RemoveInput', { inputName: audioName });
      else await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: audioId, sceneItemEnabled: Boolean(audio) });
    }
    const playbackSource = audio ? audioName : windows ? videoName : null;
    if (monitorAudio && playbackSource) {
      await obs.call('SetInputAudioMonitorType', {
        inputName: playbackSource, monitorType: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT',
      });
    }
    await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: videoId, sceneItemEnabled: true });
    await requireIdle(obs);
    const { studioModeEnabled } = await obs.call('GetStudioModeEnabled');
    await obs.call(studioModeEnabled ? 'SetCurrentPreviewScene' : 'SetCurrentProgramScene', { sceneName });
  } catch (error) {
    const sameCollection = (await obs.call('GetSceneCollectionList').catch(() => ({})))
      .currentSceneCollectionName === currentSceneCollectionName;
    if (!applying && sameCollection) {
      for (const inputName of created.reverse()) await obs.call('RemoveInput', { inputName });
      if (createdScene) await obs.call('RemoveScene', { sceneName });
    }
    throw error;
  } finally {
    prompt.close();
  }
}

async function verify(obs, version) {
  const { sceneItems } = await obs.call('GetSceneItemList', { sceneName });
  const videoItem = sceneItems.find(item => item.sourceName === videoName && item.sceneItemEnabled);
  if (!videoItem) throw new Error(`No enabled PS5 video source in ${sceneName}. Run setup first.`);
  const separateAudio = sceneItems.some(item => item.sourceName === audioName && item.sceneItemEnabled);
  const audioInput = separateAudio ? audioName : windows ? videoName : null;
  const isMuted = audioInput && (await obs.call('GetInputMute', { inputName: audioInput })).inputMuted;
  let audioDetected = false;
  const onLevels = ({ inputs }) => {
    const input = inputs.find(item => item.inputName === audioInput);
    if (input?.inputLevelsMul.flat().some(level => level > 0.001)) audioDetected = true;
  };
  const canSampleVideo = version.supportedImageFormats.includes('bmp');
  let visible = null;
  console.log('Checking capture signal for several seconds. Play a visible, audible game scene on the PS5.');
  obs.events.on('InputVolumeMeters', onLevels);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      await delay(1200);
      if (!canSampleVideo || visible === true) continue;
      const { imageData } = await obs.call('GetSourceScreenshot', { sourceName: videoName, imageFormat: 'bmp', imageWidth: 320 });
      visible = hasVisiblePixels(imageData);
    }
  } finally {
    obs.events.off('InputVolumeMeters', onLevels);
  }
  const { sceneItemTransform: { sourceWidth, sourceHeight } } = await obs.call('GetSceneItemTransform', {
    sceneName, sceneItemId: videoItem.sceneItemId,
  });
  console.log(`Video ${sourceWidth}×${sourceHeight}. ${visible === true ? 'Visible pixels detected.'
    : visible === false ? 'Samples were black or very dark. Check PS5 power, HDMI, and HDCP.'
      : 'Pixel check unavailable. Inspect the OBS preview.'}`);
  const audioReady = audioDetected && !isMuted;
  console.log(audioReady ? 'Audio signal detected on the configured source.' :
    audioInput ? `Game audio ${isMuted ? 'is muted' : 'was not detected in the sample'}.` : 'No separate game audio device selected.');
  if (visible !== true || !audioReady) process.exitCode = 2;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node setup.mjs [--monitor-audio | --check]\nSet up a PS5 scene, optionally enabling local game audio, or check it without changes.');
    return;
  }
  const [mode] = args;
  if (args.length > 1 || (mode && !['--check', '--monitor-audio'].includes(mode))) {
    throw new Error('Use --help for usage.');
  }
  if (!windows && process.platform !== 'linux') throw new Error('This setup supports Windows and Linux.');
  const { port, password } = await connectionSettings();
  const obs = await connect(port, password);
  try {
    const version = await obs.call('GetVersion');
    console.log(`Connected to OBS ${version.obsVersion}.`);
    if (mode !== '--check') await configure(obs, { monitorAudio: mode === '--monitor-audio' });
    await verify(obs, version);
  } finally {
    obs.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
