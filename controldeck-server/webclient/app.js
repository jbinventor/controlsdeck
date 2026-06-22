const { MessageType, createMessage, parseMessage } = globalThis.ControlsDeckProtocol;

const WS_PORT = 8765;
const RECONNECT_MAX_MS = 30000;
const SLIDER_THROTTLE_MS = 50;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

const state = {
  socket: null,
  reconnectDelay: 1000,
  reconnectTimer: null,
  pages: [],
  activePage: null,
  controlsById: new Map(),
  sliderValues: new Map(),
  sliderSentAt: new Map(),
};

const elements = {};

window.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  registerServiceWorker();
  autoConnect();
});

function cacheElements() {
  elements.dashboardView = document.getElementById('dashboard-view');
  elements.pageTitle = document.getElementById('page-title');
  elements.pageTabs = document.getElementById('page-tabs');
  elements.controlsGrid = document.getElementById('controls-grid');
  elements.connectionBanner = document.getElementById('connection-banner');
}

function autoConnect() {
  const ip = window.location.hostname;
  console.log('[app] Auto-conectando a', ip);
  openSocket(ip).catch((err) => {
    console.error('[app] Error conectando:', err);
    scheduleReconnect(ip);
  });
}

function openSocket(ip) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(`ws://${ip}:${WS_PORT}`);
    state.socket = socket;

    const timer = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      socket.close();
      reject(new Error('timeout'));
    }, 5000);

    socket.addEventListener('open', () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      state.reconnectDelay = 1000;
      hideBanner();
      console.log('[ws] Conectado a', ip);
      resolve();
    });

    socket.addEventListener('message', (event) => {
      const message = parseMessage(event.data);
      console.log('[ws] Mensaje recibido:', message.type);
      handleMessage(message);
    });

    socket.addEventListener('close', () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('closed'));
        return;
      }
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(timer);
      reject(new Error('socket-error'));
    });
  });
}

function scheduleReconnect(ip) {
  clearTimeout(state.reconnectTimer);
  showBanner();
  state.reconnectTimer = window.setTimeout(async () => {
    const host = ip || window.location.hostname;
    try {
      await openSocket(host);
      hideBanner();
      if (state.activePage?.id) {
        sendPageSwitch(state.activePage.id);
      }
    } catch (error) {
      state.reconnectDelay = Math.min(RECONNECT_MAX_MS, state.reconnectDelay * 2);
      scheduleReconnect(host);
    }
  }, state.reconnectDelay);
}

function handleMessage(message) {
  switch (message.type) {
    case MessageType.PAGE_LIST:
      state.pages = message.payload.pages || [];
      console.log('[app] Páginas recibidas:', state.pages.length);
      renderPageTabs();
      break;
    case MessageType.PAGE_DATA:
      state.activePage = message.payload.page;
      console.log('[app] Datos de página recibidos:', state.activePage?.name, 'Controles:', state.activePage?.controls?.length);
      indexControls(state.activePage?.controls || []);
      renderDashboard();
      break;
    case MessageType.CONTROL_STATE_UPDATE:
      applyControlUpdates(message.payload.updates || []);
      renderControls();
      break;
    default:
      break;
  }
}

function indexControls(controls) {
  state.controlsById = new Map();
  for (const control of controls) {
    state.controlsById.set(control.id, control);
  }
}

function applyControlUpdates(updates) {
  for (const update of updates) {
    const control = state.controlsById.get(update.controlId);
    if (control) {
      control.state = update;
    }
  }
}

function renderDashboard() {
  elements.pageTitle.textContent = state.activePage?.name || '-';
  renderPageTabs();
  renderControls();
}

function renderPageTabs() {
  elements.pageTabs.replaceChildren();
  for (const page of state.pages) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `page-tab${page.id === state.activePage?.id ? ' active' : ''}`;
    button.textContent = page.name;
    button.addEventListener('click', () => sendPageSwitch(page.id));
    elements.pageTabs.append(button);
  }
}

function renderControls() {
  elements.controlsGrid.replaceChildren();
  const page = state.activePage;
  if (!page) {
    return;
  }

  elements.controlsGrid.style.background = page.backgroundColor;
  elements.controlsGrid.style.gridTemplateColumns = `repeat(${page.columns}, minmax(0, 1fr))`;
  elements.controlsGrid.style.gridTemplateRows = `repeat(${page.rows}, minmax(96px, 1fr))`;

  for (const control of page.controls) {
    const card = document.createElement('div');
    card.className = 'control-card';
    card.style.gridColumn = `${control.column + 1} / span ${control.columnSpan || 1}`;
    card.style.gridRow = `${control.row + 1} / span ${control.rowSpan || 1}`;
    applyControlCardBackground(card, control.config || {}, control.state || {});
    card.style.color = control.state?.color || control.config?.color || '#ffffff';

    if (control.controlType === 'slider-h' || control.controlType === 'slider-v') {
      renderSlider(card, control, control.controlType === 'slider-v');
    } else {
      renderButton(card, control);
    }

    elements.controlsGrid.append(card);
  }
}

function parseImageDataUrl(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) {
    return null;
  }
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=]+)$/.exec(text);
  if (!match) {
    return null;
  }
  return {
    mimeType: match[1].toLowerCase(),
    dataUrl: text,
  };
}

function normalizeImageDataUrl(rawValue) {
  const parsed = parseImageDataUrl(rawValue);
  if (!parsed || !ALLOWED_IMAGE_MIME_TYPES.has(parsed.mimeType)) {
    return '';
  }
  return parsed.dataUrl;
}

function applyControlCardBackground(card, config, controlState) {
  const fallbackColor = controlState?.backgroundColor || config?.backgroundColor || '#2d2d2d';
  const imageDataUrl = normalizeImageDataUrl(config?.imageDataUrl || '');
  card.style.backgroundColor = fallbackColor;

  if (imageDataUrl) {
    card.style.backgroundImage = `url(${JSON.stringify(imageDataUrl)})`;
    card.style.backgroundSize = 'contain';
    card.style.backgroundPosition = 'center';
    card.style.backgroundRepeat = 'no-repeat';
  } else {
    card.style.backgroundImage = 'none';
    card.style.backgroundSize = '';
    card.style.backgroundPosition = '';
    card.style.backgroundRepeat = '';
  }
}

function renderButton(card, control) {
  const inner = document.createElement('div');
  inner.className = 'control-inner';
  const icon = document.createElement('i');
  icon.className = `fa-solid ${control.state?.icon || control.config.icon || 'fa-square'}`;
  const text = document.createElement('div');
  text.textContent = control.state?.text || control.config.text || '';
  inner.append(icon, text);
  card.append(inner);

  const activate = () => sendControlAction(control.id, null);
  attachPressEffect(card, activate);
}

function renderSlider(card, control, vertical) {
  const inner = document.createElement('div');
  inner.className = 'control-inner';
  inner.style.width = '100%';
  inner.style.height = '100%';

  const text = document.createElement('div');
  text.textContent = control.state?.text || control.config.text || '';

  const track = document.createElement('div');
  track.className = `slider-track${vertical ? ' vertical' : ''}`;
  const fill = document.createElement('div');
  fill.className = `slider-fill${vertical ? ' vertical' : ''}`;
  const ratio = state.sliderValues.get(control.id) ?? 0.5;
  if (vertical) {
    fill.style.height = `${ratio * 100}%`;
  } else {
    fill.style.width = `${ratio * 100}%`;
  }
  track.append(fill);
  inner.append(text, track);
  card.append(inner);

  const onMove = (event) => {
    const rect = track.getBoundingClientRect();
    let ratioValue;
    if (vertical) {
      ratioValue = 1 - ((event.clientY - rect.top) / rect.height);
    } else {
      ratioValue = (event.clientX - rect.left) / rect.width;
    }
    const normalized = Math.max(0, Math.min(1, ratioValue));
    state.sliderValues.set(control.id, normalized);
    if (vertical) {
      fill.style.height = `${normalized * 100}%`;
    } else {
      fill.style.width = `${normalized * 100}%`;
    }
    sendSliderValue(control.id, normalized);
  };

  track.addEventListener('pointerdown', (event) => {
    track.setPointerCapture(event.pointerId);
    onMove(event);
  });
  track.addEventListener('pointermove', (event) => {
    if (event.buttons === 0) {
      return;
    }
    onMove(event);
  });
  track.addEventListener('pointerup', (event) => {
    onMove(event);
    sendControlAction(control.id, state.sliderValues.get(control.id) ?? 0);
  });
}

function sendSliderValue(controlId, value) {
  const now = Date.now();
  const lastSentAt = state.sliderSentAt.get(controlId) || 0;
  if (now - lastSentAt < SLIDER_THROTTLE_MS) {
    return;
  }
  state.sliderSentAt.set(controlId, now);
  sendControlAction(controlId, value);
}

function attachPressEffect(card, handler) {
  const press = () => card.classList.add('pressed');
  const release = () => card.classList.remove('pressed');

  card.addEventListener('pointerdown', press);
  card.addEventListener('pointerup', () => {
    release();
    handler();
  });
  card.addEventListener('pointerleave', release);
  card.addEventListener('pointercancel', release);
}

function sendControlAction(controlId, value) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  state.socket.send(createMessage(MessageType.CONTROL_ACTION, { controlId, value }));
}

function sendPageSwitch(pageId) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }
  state.socket.send(createMessage(MessageType.PAGE_SWITCH, { pageId }));
}

function showBanner() {
  elements.connectionBanner.classList.remove('hidden');
}

function hideBanner() {
  elements.connectionBanner.classList.add('hidden');
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
