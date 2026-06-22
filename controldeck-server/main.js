const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const QRCode = require('qrcode');
const { WebSocketServer } = require('ws');

function getSharedRoot() {
  return app.isPackaged
    ? path.join(__dirname, 'shared')
    : path.join(__dirname, '..', 'shared');
}

const { MessageType, createMessage, parseMessage } = require(
  app.isPackaged ? './shared/protocol' : '../shared/protocol'
);

const WS_PORT = 8765;
const HTTP_PORT = 8766;
const DEFAULT_LOCALE = 'es';

let mainWindow = null;
let webSocketServer = null;
let httpServer = null;
let config = null;
let plugins = new Map();
let controlStateById = new Map();
let controlRuntimeEntries = [];
const webClients = new Set();
let activeLocale = DEFAULT_LOCALE;
let i18nCatalog = {};

function getLocalesDirectory() {
  return path.join(__dirname, 'locales');
}

function normalizeLocaleCode(rawLocale) {
  const value = String(rawLocale || '').trim().toLowerCase();
  if (!value) {
    return DEFAULT_LOCALE;
  }
  return value.split(/[-_]/)[0] || DEFAULT_LOCALE;
}

function resolveLocaleCode(rawLocale) {
  const candidate = normalizeLocaleCode(rawLocale);
  const candidatePath = path.join(getLocalesDirectory(), `${candidate}.json`);
  if (fs.existsSync(candidatePath)) {
    return candidate;
  }
  return DEFAULT_LOCALE;
}

function readLocaleCatalog(localeCode) {
  const targetPath = path.join(getLocalesDirectory(), `${localeCode}.json`);
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch {
    if (localeCode === DEFAULT_LOCALE) {
      return {};
    }
    return readLocaleCatalog(DEFAULT_LOCALE);
  }
}

function getByPath(source, keyPath) {
  const parts = String(keyPath || '').split('.').filter(Boolean);
  let cursor = source;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) {
      return undefined;
    }
    cursor = cursor[part];
  }
  return cursor;
}

function formatTemplate(template, vars = {}) {
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, varName) => {
    if (Object.prototype.hasOwnProperty.call(vars, varName)) {
      return String(vars[varName]);
    }
    return '';
  });
}

function t(keyPath, vars = {}, fallback = '') {
  const value = getByPath(i18nCatalog, keyPath);
  if (typeof value === 'string') {
    return formatTemplate(value, vars);
  }

  if (activeLocale !== DEFAULT_LOCALE) {
    const defaultCatalog = readLocaleCatalog(DEFAULT_LOCALE);
    const defaultValue = getByPath(defaultCatalog, keyPath);
    if (typeof defaultValue === 'string') {
      return formatTemplate(defaultValue, vars);
    }
  }

  if (fallback) {
    return formatTemplate(fallback, vars);
  }
  return keyPath;
}

function initI18n() {
  const localeCode = resolveLocaleCode(app.getLocale());
  activeLocale = localeCode;
  i18nCatalog = readLocaleCatalog(localeCode);
}

function resolveI18nTokens(value) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveI18nTokens(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveI18nTokens(item)]),
    );
  }

  if (typeof value === 'string' && value.startsWith('@')) {
    return t(value.slice(1), {}, value);
  }

  return value;
}

function createDefaultPage(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: t('main.defaults.pageName'),
    order: 0,
    backgroundColor: '#1a1a2e',
    columns: 4,
    rows: 3,
    controls: [],
    ...overrides,
  };
}

function createDefaultConfig() {
  return { pages: [createDefaultPage()] };
}

function getConfigFilePath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function normalizePage(page, index) {
  return {
    id: page.id || crypto.randomUUID(),
    name: page.name || t('main.defaults.pageNameIndexed', { index: index + 1 }),
    order: Number.isFinite(page.order) ? page.order : index,
    backgroundColor: page.backgroundColor || '#1a1a2e',
    columns: Math.max(1, Number(page.columns) || 4),
    rows: Math.max(1, Number(page.rows) || 3),
    controls: Array.isArray(page.controls)
      ? page.controls.map((control) => ({
          id: control.id || crypto.randomUUID(),
          pluginId: control.pluginId || '',
          controlTypeId: control.controlTypeId || '',
          column: Number.isFinite(control.column) ? control.column : 0,
          row: Number.isFinite(control.row) ? control.row : 0,
          columnSpan: Math.max(1, Number(control.columnSpan) || 1),
          rowSpan: Math.max(1, Number(control.rowSpan) || 1),
          config: control.config || {},
        }))
      : [],
  };
}

function normalizeConfig(rawConfig) {
  const pages = Array.isArray(rawConfig?.pages) ? rawConfig.pages : [];
  const normalizedPages = (pages.length ? pages : [createDefaultPage()])
    .map((page, index) => normalizePage(page, index))
    .sort((left, right) => left.order - right.order)
    .map((page, index) => ({ ...page, order: index }));

  return { pages: normalizedPages };
}

function loadConfig() {
  const configPath = getConfigFilePath();
  if (!fs.existsSync(configPath)) {
    config = createDefaultConfig();
    saveConfig();
    return;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    config = normalizeConfig(JSON.parse(raw));
  } catch (error) {
    console.error('[config] Error leyendo config.json, se recrea el fichero.', error);
    config = createDefaultConfig();
    saveConfig();
  }
}

function saveConfig() {
  const configPath = getConfigFilePath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(normalizeConfig(config), null, 2), 'utf8');
}

function getDefaultExportPath() {
  return path.join(app.getPath('documents'), 'controldeck-config.json');
}

function getPluginsDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'plugins')
    : path.join(__dirname, 'plugins');
}

function getControlManifest(control) {
  const plugin = plugins.get(control.pluginId);
  if (!plugin) {
    return null;
  }
  return plugin.manifest.controls.find((item) => item.typeId === control.controlTypeId) || null;
}

function getControlImplementation(control) {
  const plugin = plugins.get(control.pluginId);
  return plugin?.implementation?.controls?.[control.controlTypeId] || null;
}

function createPluginHelpers(control, clientEntry) {
  return {
    controlId: control.id,
    locale: activeLocale,
    t: (keyPath, vars = {}, fallback = '') => t(keyPath, vars, fallback),
    getConfig: () => config,
    getPageById: (pageId) => config.pages.find((page) => page.id === pageId) || null,
    switchPageForClient: (pageId) => {
      if (!clientEntry) {
        return;
      }
      const nextPage = config.pages.find((page) => page.id === pageId);
      if (!nextPage) {
        return;
      }
      clientEntry.currentPageId = pageId;
      sendPageData(clientEntry, pageId);
    },
  };
}

function normalizeState(state, control) {
  return {
    icon: state?.icon || control.config.icon || 'fa-square',
    text: state?.text || control.config.text || '',
    color: state?.color || control.config.color || '#ffffff',
    backgroundColor: state?.backgroundColor || control.config.backgroundColor || '#2d2d2d',
  };
}

function broadcastRaw(rawMessage) {
  for (const clientEntry of webClients) {
    if (clientEntry.socket.readyState === 1) {
      clientEntry.socket.send(rawMessage);
    }
  }
}

function broadcast(type, payload) {
  broadcastRaw(createMessage(type, payload));
}

function notifyRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sendControlStateUpdate(controlId, state) {
  controlStateById.set(controlId, state);
  const payload = { updates: [{ controlId, ...state }] };
  broadcast(MessageType.CONTROL_STATE_UPDATE, payload);
  notifyRenderer('control-state-update', payload);
}

function clearControlRuntime() {
  for (const entry of controlRuntimeEntries) {
    try {
      if (typeof entry.implementation?.onUnload === 'function') {
        entry.implementation.onUnload(entry.control.config, entry.control.id);
      }
    } catch (error) {
      console.error('[plugin] Error en onUnload:', error);
    }
  }
  controlRuntimeEntries = [];
}

function getAllControls() {
  return config.pages.flatMap((page) => page.controls.map((control) => ({ page, control })));
}

function initializeControlRuntime() {
  clearControlRuntime();
  controlStateById = new Map();

  for (const { control } of getAllControls()) {
    const implementation = getControlImplementation(control);
    if (!implementation) {
      continue;
    }

    try {
      const helpers = createPluginHelpers(control, null);
      const initialState = typeof implementation.getInitialState === 'function'
        ? normalizeState(implementation.getInitialState(control.config || {}, helpers), control)
        : normalizeState(null, control);
      controlStateById.set(control.id, initialState);

      if (typeof implementation.onLoad === 'function') {
        implementation.onLoad(
          control.config || {},
          control.id,
          (nextState) => sendControlStateUpdate(control.id, normalizeState(nextState, control)),
          helpers,
        );
        controlRuntimeEntries.push({ implementation, control });
      }
    } catch (error) {
      console.error(`[plugin] Error inicializando control ${control.id}:`, error);
    }
  }
}

function serializeControl(control) {
  const manifest = getControlManifest(control);
  const state = controlStateById.get(control.id) || normalizeState(null, control);
  return {
    id: control.id,
    pluginId: control.pluginId,
    controlTypeId: control.controlTypeId,
    controlType: manifest?.controlType || 'button',
    column: control.column,
    row: control.row,
    columnSpan: control.columnSpan || 1,
    rowSpan: control.rowSpan || 1,
    config: control.config || {},
    state,
  };
}

function serializePage(page) {
  return {
    id: page.id,
    name: page.name,
    order: page.order,
    backgroundColor: page.backgroundColor,
    columns: page.columns,
    rows: page.rows,
    controls: page.controls.map(serializeControl),
  };
}

function sendPageList(clientEntry) {
  const payload = {
    pages: config.pages
      .slice()
      .sort((left, right) => left.order - right.order)
      .map((page) => ({ id: page.id, name: page.name, order: page.order })),
  };

  clientEntry.socket.send(createMessage(MessageType.PAGE_LIST, payload));
}

function sendPageData(clientEntry, pageId) {
  const page = config.pages.find((item) => item.id === pageId) || config.pages[0];
  if (!page) {
    return;
  }

  clientEntry.currentPageId = page.id;
  clientEntry.socket.send(
    createMessage(MessageType.PAGE_DATA, {
      page: serializePage(page),
    }),
  );
}

function refreshClients() {
  for (const clientEntry of webClients) {
    if (clientEntry.socket.readyState !== 1) {
      continue;
    }
    sendPageList(clientEntry);
    sendPageData(clientEntry, clientEntry.currentPageId || config.pages[0]?.id);
  }
}

function notifyConfigChanged() {
  notifyRenderer('config-changed', normalizeConfig(config));
  refreshClients();
}

function findControlById(controlId) {
  for (const page of config.pages) {
    const control = page.controls.find((item) => item.id === controlId);
    if (control) {
      return { page, control };
    }
  }
  return null;
}

function loadPlugins() {
  plugins = new Map();
  const pluginsDir = getPluginsDirectory();
  fs.mkdirSync(pluginsDir, { recursive: true });
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  for (const entry of entries) {
    const pluginDir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(pluginDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const bundlePath = path.join(pluginDir, manifest.bundleFile || 'bundle.js');
      delete require.cache[bundlePath];
      const implementation = require(bundlePath);
      plugins.set(manifest.id, { manifest, implementation, pluginDir });
    } catch (error) {
      console.error(`[plugin] No se pudo cargar ${entry.name}:`, error);
    }
  }
}

function getAvailablePlugins() {
  return Array.from(plugins.values()).map((plugin) => ({
    id: plugin.manifest.id,
    name: resolveI18nTokens(plugin.manifest.name),
    version: plugin.manifest.version,
    description: resolveI18nTokens(plugin.manifest.description),
    author: plugin.manifest.author,
    controls: resolveI18nTokens(plugin.manifest.controls),
  }));
}

function savePage(inputPage) {
  const nextPage = normalizePage(inputPage, config.pages.length);
  const existingIndex = config.pages.findIndex((page) => page.id === nextPage.id);

  if (existingIndex >= 0) {
    const existing = config.pages[existingIndex];
    config.pages[existingIndex] = {
      ...existing,
      ...nextPage,
      controls: existing.controls,
    };
  } else {
    nextPage.order = config.pages.length;
    config.pages.push(nextPage);
  }

  config = normalizeConfig(config);
  saveConfig();
  initializeControlRuntime();
  notifyConfigChanged();
  return config;
}

function deletePage(pageId) {
  config.pages = config.pages.filter((page) => page.id !== pageId);
  if (!config.pages.length) {
    config.pages = [createDefaultPage()];
  }
  config = normalizeConfig(config);
  saveConfig();
  initializeControlRuntime();
  notifyConfigChanged();
  return config;
}

function reorderPages(orderedIds) {
  const orderMap = new Map(orderedIds.map((id, index) => [id, index]));
  config.pages = config.pages
    .slice()
    .sort((left, right) => {
      const leftOrder = orderMap.has(left.id) ? orderMap.get(left.id) : left.order;
      const rightOrder = orderMap.has(right.id) ? orderMap.get(right.id) : right.order;
      return leftOrder - rightOrder;
    })
    .map((page, index) => ({ ...page, order: index }));

  saveConfig();
  notifyConfigChanged();
  return config;
}

function saveControl(input) {
  const page = config.pages.find((item) => item.id === input.pageId);
  if (!page) {
    throw new Error(t('main.errors.pageNotFound'));
  }

  const control = {
    id: input.control.id || crypto.randomUUID(),
    pluginId: input.control.pluginId,
    controlTypeId: input.control.controlTypeId,
    column: Number(input.control.column) || 0,
    row: Number(input.control.row) || 0,
    columnSpan: Math.max(1, Number(input.control.columnSpan) || 1),
    rowSpan: Math.max(1, Number(input.control.rowSpan) || 1),
    config: input.control.config || {},
  };

  const existingIndex = page.controls.findIndex((item) => item.id === control.id);
  if (existingIndex >= 0) {
    page.controls[existingIndex] = control;
  } else {
    page.controls.push(control);
  }

  saveConfig();
  initializeControlRuntime();
  notifyConfigChanged();
  return serializePage(page);
}

function deleteControl(input) {
  const page = config.pages.find((item) => item.id === input.pageId);
  if (!page) {
    throw new Error(t('main.errors.pageNotFound'));
  }
  page.controls = page.controls.filter((control) => control.id !== input.controlId);
  saveConfig();
  initializeControlRuntime();
  notifyConfigChanged();
  return serializePage(page);
}

async function exportConfig() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: t('main.dialogs.exportTitle'),
    defaultPath: getDefaultExportPath(),
    filters: [
      { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  fs.writeFileSync(result.filePath, JSON.stringify(normalizeConfig(config), null, 2), 'utf8');
  return { canceled: false, filePath: result.filePath };
}

async function importConfig() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('main.dialogs.importTitle'),
    properties: ['openFile'],
    filters: [
      { name: 'JSON', extensions: ['json'] },
    ],
  });

  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true };
  }

  const [filePath] = result.filePaths;
  const importedConfig = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!importedConfig || !Array.isArray(importedConfig.pages)) {
    throw new Error(t('main.errors.invalidImportedConfig'));
  }

  config = normalizeConfig(importedConfig);
  saveConfig();
  initializeControlRuntime();
  notifyConfigChanged();

  return { canceled: false, filePath };
}

function handleControlAction(clientEntry, payload) {
  const result = findControlById(payload.controlId);
  if (!result) {
    return;
  }

  const { control } = result;
  if (control.controlTypeId === 'page-switcher' && control.config?.targetPageId) {
    clientEntry.currentPageId = control.config.targetPageId;
    sendPageData(clientEntry, control.config.targetPageId);
  }

  const implementation = getControlImplementation(control);
  if (!implementation || typeof implementation.onAction !== 'function') {
    return;
  }

  try {
    implementation.onAction(
      control.config || {},
      payload.value,
      (nextState) => sendControlStateUpdate(control.id, normalizeState(nextState, control)),
      createPluginHelpers(control, clientEntry),
    );
  } catch (error) {
    console.error(`[plugin] Error en onAction para ${control.id}:`, error);
  }
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

function serveFile(response, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    response.end(content);
  });
}

function startHttpServer() {
  const webRoot = path.join(__dirname, 'webclient');
  const sharedRoot = getSharedRoot();
  const localesRoot = getLocalesDirectory();

  httpServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    let targetPath;

    if (requestUrl.pathname === '/' || requestUrl.pathname === '') {
      targetPath = path.join(webRoot, 'index.html');
    } else if (requestUrl.pathname.startsWith('/locales/')) {
      targetPath = path.join(localesRoot, requestUrl.pathname.replace('/locales/', ''));
      if (!targetPath.startsWith(localesRoot)) {
        response.writeHead(400);
        response.end('Bad request');
        return;
      }
    } else if (requestUrl.pathname.startsWith('/shared/')) {
      targetPath = path.join(sharedRoot, requestUrl.pathname.replace('/shared/', ''));
      if (!targetPath.startsWith(sharedRoot)) {
        response.writeHead(400);
        response.end('Bad request');
        return;
      }
    } else {
      targetPath = path.join(webRoot, requestUrl.pathname.replace(/^\//, ''));
      if (!targetPath.startsWith(webRoot)) {
        response.writeHead(400);
        response.end('Bad request');
        return;
      }
    }

    serveFile(response, targetPath);
  });

  httpServer.listen(HTTP_PORT, () => {
    console.log(`[http] Cliente remoto disponible en http://${getLocalIp()}:${HTTP_PORT}`);
  });
}

function startWebSocketServer() {
  webSocketServer = new WebSocketServer({ host: '0.0.0.0', port: WS_PORT });
  webSocketServer.on('connection', (socket) => {
    console.log('[ws] Cliente conectado');
    const clientEntry = {
      socket,
      currentPageId: config.pages[0]?.id || null,
    };
    webClients.add(clientEntry);
    console.log('[ws] Enviando PAGE_LIST a cliente');
    sendPageList(clientEntry);
    if (clientEntry.currentPageId) {
      console.log('[ws] Enviando PAGE_DATA para página', clientEntry.currentPageId);
      sendPageData(clientEntry, clientEntry.currentPageId);
    } else {
      console.error('[ws] No hay páginas disponibles');
    }

    socket.on('message', (raw) => {
      try {
        const message = parseMessage(raw);
        if (message.type === MessageType.PAGE_SWITCH) {
          clientEntry.currentPageId = message.payload.pageId;
          sendPageData(clientEntry, clientEntry.currentPageId);
          return;
        }
        if (message.type === MessageType.CONTROL_ACTION) {
          handleControlAction(clientEntry, message.payload);
        }
      } catch (error) {
        console.error('[ws] Error procesando mensaje:', error);
      }
    });

    socket.on('close', () => {
      webClients.delete(clientEntry);
    });
  });

  webSocketServer.on('listening', () => {
    console.log(`[ws] Servidor WebSocket escuchando en ws://${getLocalIp()}:${WS_PORT}`);
  });
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (item.family === 'IPv4' && !item.internal) {
        return item.address;
      }
    }
  }
  return 'localhost';
}

async function getRemoteUrlInfo() {
  const host = getLocalIp();
  const httpUrl = `http://${host}:${HTTP_PORT}`;
  let qrDataUrl = '';

  try {
    qrDataUrl = await QRCode.toDataURL(httpUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 160,
      color: {
        dark: '#0f0f23',
        light: '#ffffffff',
      },
    });
  } catch (error) {
    console.error('[qr] Error generando QR de acceso remoto:', error);
  }

  return {
    host,
    port: HTTP_PORT,
    httpUrl,
    qrDataUrl,
  };
}

function registerIpc() {
  ipcMain.handle('config:get', () => normalizeConfig(config));
  ipcMain.handle('plugins:get', () => getAvailablePlugins());
  ipcMain.handle('i18n:get', () => ({
    locale: activeLocale,
    messages: i18nCatalog,
    defaultLocale: DEFAULT_LOCALE,
  }));
  ipcMain.handle('server:get-remote-url-info', async () => getRemoteUrlInfo());
  ipcMain.handle('config:export', async () => exportConfig());
  ipcMain.handle('config:import', async () => importConfig());
  ipcMain.handle('page:save', (_, page) => savePage(page));
  ipcMain.handle('page:delete', (_, pageId) => deletePage(pageId));
  ipcMain.handle('pages:reorder', (_, orderedIds) => reorderPages(orderedIds));
  ipcMain.handle('control:save', (_, payload) => saveControl(payload));
  ipcMain.handle('control:delete', (_, payload) => deleteControl(payload));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      zoomFactor: 0.85,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(0.85);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function bootstrap() {
  initI18n();
  loadPlugins();
  loadConfig();
  initializeControlRuntime();
  registerIpc();
  Menu.setApplicationMenu(null);
  createWindow();
  startWebSocketServer();
  startHttpServer();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  clearControlRuntime();
  saveConfig();
  if (webSocketServer) {
    webSocketServer.close();
  }
  if (httpServer) {
    httpServer.close();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
