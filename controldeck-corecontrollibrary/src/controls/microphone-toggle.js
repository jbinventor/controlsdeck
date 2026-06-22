const { exec } = require('child_process');
const path = require('path');

const mutedByControl = new Map();

const NIRCMD = path.join(__dirname, 'nircmd.exe');
const PS_SCRIPT = path.join(__dirname, 'windows-mic.ps1');
const PS_BASE = `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${PS_SCRIPT}"`;

function readWindowsMuteState(callback) {
  exec(`${PS_BASE}`, (err, stdout) => {
    if (err) return callback(false);
    callback(stdout.trim().toLowerCase() === 'true');
  });
}

function buildState(config, muted, helpers) {
  if (muted) {
    return {
      icon: 'fa-microphone-slash',
      text: helpers?.t('plugins.core.controls.microphone.off'),
      color: '#ffd4d4',
      backgroundColor: '#7f1d1d',
    };
  }

  return {
    icon: config.icon || 'fa-microphone',
    text: config.text || helpers?.t('plugins.core.controls.microphone.on'),
    color: config.color || '#ffffff',
    backgroundColor: config.backgroundColor || '#14532d',
  };
}

function buildCommand(muted) {
  if (process.platform === 'win32') {
    return `"${NIRCMD}" mutesysvolume ${muted ? '1' : '0'} default_record`;
  }

  if (process.platform === 'darwin') {
    return muted
      ? "osascript -e 'set volume input volume 0'"
      : "osascript -e 'set volume input volume 100'";
  }

  if (process.platform === 'linux') {
    return muted
      ? 'pactl set-source-mute @DEFAULT_SOURCE@ 1'
      : 'pactl set-source-mute @DEFAULT_SOURCE@ 0';
  }

  return null;
}

module.exports = {
  getInitialState(config, helpers) {
    return buildState(config, false, helpers);
  },
  onLoad(config, controlId, sendState, helpers) {
    if (process.platform !== 'win32') return;
    readWindowsMuteState((muted) => {
      mutedByControl.set(controlId, muted);
      sendState(buildState(config, muted, helpers));
    });
  },
  onAction(config, payload, sendState, helpers) {
    const controlId = helpers?.controlId;
    const muted = !(mutedByControl.get(controlId) || false);
    mutedByControl.set(controlId, muted);
    const command = buildCommand(muted);
    if (command) {
      exec(command, () => {});
    }
    sendState(buildState(config, muted, helpers));
  },
  onUnload(config, controlId) {
    mutedByControl.delete(controlId);
  },
};
