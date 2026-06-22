const timers = new Map();

function formatTime(format) {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  if (format === 'HH:mm') {
    return `${hh}:${mm}`;
  }
  if (format === 'hh:mm A') {
    const hours = now.getHours() % 12 || 12;
    return `${String(hours).padStart(2, '0')}:${mm} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;
  }
  return `${hh}:${mm}:${ss}`;
}

function buildState(config) {
  return {
    icon: config.icon || 'fa-clock',
    text: formatTime(config.format || 'HH:mm:ss'),
    color: config.color || '#ffffff',
    backgroundColor: config.backgroundColor || '#24304a',
  };
}

module.exports = {
  getInitialState(config) {
    return buildState(config);
  },
  onLoad(config, controlId, sendState) {
    const tick = () => sendState(buildState(config));
    tick();
    const timerId = setInterval(tick, 1000);
    timers.set(controlId, timerId);
  },
  onAction() {},
  onUnload(config, controlId) {
    if (timers.has(controlId)) {
      clearInterval(timers.get(controlId));
      timers.delete(controlId);
    }
  },
};
