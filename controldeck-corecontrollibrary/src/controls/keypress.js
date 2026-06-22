const { execFile } = require('child_process');
const path = require('path');

const NIRCMD = path.join(__dirname, 'nircmd.exe');

const SPECIAL_KEYS = {
  ' ': 'spc',
  space: 'spc',
  spacebar: 'spc',
  enter: 'enter',
  return: 'enter',
  esc: 'esc',
  escape: 'esc',
  tab: 'tab',
  backspace: 'backspace',
  delete: 'delete',
  del: 'delete',
  insert: 'insert',
  ins: 'insert',
  home: 'home',
  end: 'end',
  pageup: 'pageup',
  'page up': 'pageup',
  pagedown: 'pagedown',
  'page down': 'pagedown',
  left: 'left',
  arrowleft: 'left',
  right: 'right',
  arrowright: 'right',
  up: 'up',
  arrowup: 'up',
  down: 'down',
  arrowdown: 'down',
  plus: 'plus',
  '+': 'plus',
  comma: 'comma',
  ',': 'comma',
  minus: 'minus',
  '-': 'minus',
  period: 'period',
  '.': 'period',
  apps: 'apps',
  printscreen: 'printscreen',
  'print screen': 'printscreen',
  pause: 'pause',
  capslock: 'capslock',
  'caps lock': 'capslock',
  numlock: 'numlock',
  'num lock': 'numlock',
  scroll: 'scroll',
  scrolllock: 'scroll',
  'scroll lock': 'scroll',
};

function normalizeKey(rawKey) {
  const value = String(rawKey || '').trim();
  if (!value) {
    return null;
  }

  if (value.length === 1 && /[a-z0-9]/i.test(value)) {
    return value.toLowerCase();
  }

  const normalized = value.toLowerCase();
  if (/^f([1-9]|1\d|2[0-4])$/.test(normalized)) {
    return normalized.toUpperCase();
  }

  return SPECIAL_KEYS[normalized] || null;
}

function buildChord(config) {
  const key = normalizeKey(config.key);
  if (!key) {
    return null;
  }

  const chord = [];
  if (config.ctrl) {
    chord.push('ctrl');
  }
  if (config.shift) {
    chord.push('shift');
  }
  if (config.alt) {
    chord.push('alt');
  }
  if (config.windows) {
    chord.push('lwin');
  }
  chord.push(key);
  return chord.join('+');
}

function buildSummary(config, helpers) {
  const parts = [];
  if (config.ctrl) {
    parts.push(helpers?.t('renderer.keypress.summary.ctrl'));
  }
  if (config.shift) {
    parts.push(helpers?.t('renderer.keypress.summary.shift'));
  }
  if (config.alt) {
    parts.push(helpers?.t('renderer.keypress.summary.alt'));
  }
  if (config.windows) {
    parts.push(helpers?.t('renderer.keypress.summary.win'));
  }

  const key = normalizeKey(config.key);
  if (!key) {
    return '';
  }
  parts.push(key === 'spc'
    ? helpers?.t('renderer.keypress.summary.space')
    : key.toUpperCase());
  return parts.join('+');
}

module.exports = {
  getInitialState(config, helpers) {
    return {
      icon: config.icon || 'fa-keyboard',
      text: config.text || buildSummary(config, helpers) || helpers?.t('plugins.core.controls.keypress.defaultText'),
      color: config.color || '#ffffff',
      backgroundColor: config.backgroundColor || '#1f3a5f',
    };
  },
  onAction(config, payload, sendState, helpers) {
    const chord = buildChord(config);
    if (!chord || process.platform !== 'win32') {
      sendState(this.getInitialState(config, helpers));
      return;
    }

    execFile(NIRCMD, ['sendkeypress', chord], () => {});
    sendState(this.getInitialState(config, helpers));
  },
};