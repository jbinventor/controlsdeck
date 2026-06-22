const MessageType = Object.freeze({
  PAGE_LIST: 'PAGE_LIST',
  PAGE_SWITCH: 'PAGE_SWITCH',
  PAGE_DATA: 'PAGE_DATA',
  CONTROL_ACTION: 'CONTROL_ACTION',
  CONTROL_STATE_UPDATE: 'CONTROL_STATE_UPDATE',
});

function createMessage(type, payload = {}) {
  return JSON.stringify({ type, payload });
}

function parseMessage(raw) {
  const data = typeof raw === 'string' ? raw : raw.toString('utf8');
  return JSON.parse(data);
}

if (typeof globalThis !== 'undefined') {
  globalThis.ControlsDeckProtocol = { MessageType, createMessage, parseMessage };
}

if (typeof module !== 'undefined') {
  module.exports = { MessageType, createMessage, parseMessage };
}
