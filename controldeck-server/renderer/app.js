const COMMON_FIELDS = [
  { key: 'icon', labelKey: 'renderer.fields.icon', type: 'text', defaultValue: 'fa-square' },
  { key: 'imageDataUrl', labelKey: 'renderer.fields.image', type: 'image', defaultValue: '' },
  { key: 'text', labelKey: 'renderer.fields.text', type: 'text', defaultValue: '' },
  { key: 'color', labelKey: 'renderer.fields.color', type: 'color', defaultValue: '#ffffff' },
  { key: 'backgroundColor', labelKey: 'renderer.fields.background', type: 'color', defaultValue: '#2d2d2d' },
];

const DEFAULT_LOCALE = 'es';

const LEGACY_ACTIVE_VISUAL_KEYS = ['iconActive', 'textActive', 'colorActive', 'backgroundColorActive'];
const DEFAULT_ICON_CATALOG = ['fa-square', 'fa-circle', 'fa-microphone', 'fa-microphone-slash', 'fa-clock', 'fa-gear'];
const ICON_CATALOG = Array.isArray(globalThis.CONTROLSDECK_ICON_CATALOG) && globalThis.CONTROLSDECK_ICON_CATALOG.length
  ? globalThis.CONTROLSDECK_ICON_CATALOG
  : DEFAULT_ICON_CATALOG;
const ICON_RESULTS_LIMIT = 240;
const IMAGE_MAX_BYTES = 200 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
const BASIC_COLOR_SWATCHES = [
  '#000000', '#1F2937', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB', '#F3F4F6', '#FFFFFF',
  '#7F1D1D', '#B91C1C', '#DC2626', '#EF4444', '#F87171', '#FCA5A5',
  '#7C2D12', '#C2410C', '#EA580C', '#F97316', '#FB923C', '#FDBA74',
  '#78350F', '#A16207', '#CA8A04', '#EAB308', '#FACC15', '#FDE047',
  '#365314', '#4D7C0F', '#65A30D', '#84CC16', '#A3E635', '#BEF264',
  '#14532D', '#15803D', '#16A34A', '#22C55E', '#4ADE80', '#86EFAC',
  '#064E3B', '#047857', '#059669', '#10B981', '#34D399', '#6EE7B7',
  '#164E63', '#0E7490', '#0891B2', '#06B6D4', '#22D3EE', '#67E8F9',
  '#1E3A8A', '#1D4ED8', '#2563EB', '#3B82F6', '#60A5FA', '#93C5FD',
  '#312E81', '#4338CA', '#4F46E5', '#6366F1', '#818CF8', '#A5B4FC',
  '#581C87', '#7E22CE', '#9333EA', '#A855F7', '#C084FC', '#D8B4FE',
  '#831843', '#BE185D', '#DB2777', '#EC4899', '#F472B6', '#F9A8D4',
  '#7F1D1D', '#991B1B', '#B45309', '#047857', '#0369A1', '#4338CA', '#7E22CE', '#BE185D',
];
const ORDERED_BASIC_COLOR_SWATCHES = sortColorSwatches(BASIC_COLOR_SWATCHES);

const state = {
  locale: DEFAULT_LOCALE,
  i18n: {},
  config: null,
  plugins: [],
  selectedPageId: null,
  editingPageId: null,
  editingControl: null,
  draggingPageId: null,
  keypressCaptureActive: false,
  copiedControl: null,
  iconPicker: {
    targetInput: null,
    targetButton: null,
    selectedIcon: 'fa-square',
  },
  colorPicker: {
    targetInput: null,
    targetButton: null,
    selectedColor: '#ffffff',
    mode: 'basic',
  },
  imagePicker: {
    targetInput: null,
    targetButton: null,
    selectedImageDataUrl: '',
  },
};

const KEYPRESS_SPECIAL_KEYS = {
  ' ': 'Space',
  Enter: 'Enter',
  Escape: 'Esc',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
};

const KEYPRESS_SPECIAL_KEY_ALIASES = {
  ' ': 'Space',
  space: 'Space',
  spacebar: 'Space',
  enter: 'Enter',
  return: 'Enter',
  esc: 'Esc',
  escape: 'Esc',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  del: 'Delete',
  insert: 'Insert',
  ins: 'Insert',
  home: 'Home',
  end: 'End',
  pageup: 'PageUp',
  'page up': 'PageUp',
  pagedown: 'PageDown',
  'page down': 'PageDown',
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
};

const elements = {};

document.addEventListener('DOMContentLoaded', async () => {
  cacheElements();
  await hydrateI18n();
  applyStaticTranslations();
  bindStaticEvents();
  await hydrateRemoteAccess();
  await loadInitialData();
  renderAll();

  window.controlsDeckAPI.onConfigChanged((config) => {
    state.config = config;
    ensureSelectedPage();
    renderAll();
  });

  window.controlsDeckAPI.onControlStateUpdate((payload) => {
    applyControlStateUpdates(payload.updates || []);
    renderGrid();
  });
});

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

function applyTemplate(template, vars = {}) {
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return String(vars[key]);
    }
    return '';
  });
}

function t(keyPath, vars = {}, fallback = '') {
  const value = getByPath(state.i18n, keyPath);
  if (typeof value === 'string') {
    return applyTemplate(value, vars);
  }
  if (fallback) {
    return applyTemplate(fallback, vars);
  }
  return keyPath;
}

async function hydrateI18n() {
  try {
    const i18nPayload = await window.controlsDeckAPI.getI18n();
    state.locale = i18nPayload?.locale || DEFAULT_LOCALE;
    state.i18n = i18nPayload?.messages || {};
    return;
  } catch (error) {
    console.error('[i18n] No se pudo cargar catalogo desde main:', error);
  }

  state.locale = DEFAULT_LOCALE;
  state.i18n = {};
}

function applyStaticTranslations() {
  document.documentElement.lang = state.locale || DEFAULT_LOCALE;

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (!key) {
      return;
    }
    node.textContent = t(key);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    const key = node.getAttribute('data-i18n-placeholder');
    if (!key) {
      return;
    }
    node.setAttribute('placeholder', t(key));
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
    const key = node.getAttribute('data-i18n-aria-label');
    if (!key) {
      return;
    }
    node.setAttribute('aria-label', t(key));
  });
}

function cacheElements() {
  elements.pagesList = document.getElementById('pages-list');
  elements.pageGrid = document.getElementById('page-grid');
  elements.remoteUrl = document.getElementById('remote-url');
  elements.remoteQr = document.getElementById('remote-qr');
  elements.remoteQrImage = document.getElementById('remote-qr-image');
  elements.exportConfigButton = document.getElementById('export-config-button');
  elements.importConfigButton = document.getElementById('import-config-button');
  elements.addPageButton = document.getElementById('add-page-button');
  elements.pageModal = document.getElementById('page-modal');
  elements.pageForm = document.getElementById('page-form');
  elements.pageNameInput = document.getElementById('page-name-input');
  elements.pageColumnsInput = document.getElementById('page-columns-input');
  elements.pageRowsInput = document.getElementById('page-rows-input');
  elements.pageBackgroundColorInput = document.getElementById('page-background-color-input');
  elements.pageBackgroundColorTrigger = document.getElementById('page-background-color-trigger');
  elements.controlModal = document.getElementById('control-modal');
  elements.controlForm = document.getElementById('control-form');
  elements.pluginSelect = document.getElementById('plugin-select');
  elements.controlTypeSelect = document.getElementById('control-type-select');
  elements.commonFields = document.getElementById('common-fields');
  elements.pluginFields = document.getElementById('plugin-fields');
  elements.deleteControlButton = document.getElementById('delete-control-button');
  elements.iconPickerModal = document.getElementById('icon-picker-modal');
  elements.iconSearchInput = document.getElementById('icon-search-input');
  elements.iconResults = document.getElementById('icon-results');
  elements.iconEmptyState = document.getElementById('icon-empty-state');
  elements.colorPickerModal = document.getElementById('color-picker-modal');
  elements.colorModeBasicButton = document.getElementById('color-mode-basic');
  elements.colorModeAdvancedButton = document.getElementById('color-mode-advanced');
  elements.colorBasicPanel = document.getElementById('color-basic-panel');
  elements.colorAdvancedPanel = document.getElementById('color-advanced-panel');
  elements.colorBasicPalette = document.getElementById('color-basic-palette');
  elements.colorAdvancedInput = document.getElementById('color-advanced-input');
  elements.imagePickerModal = document.getElementById('image-picker-modal');
  elements.imagePreviewButton = document.getElementById('image-preview-button');
  elements.imagePreviewImage = document.getElementById('image-preview-image');
  elements.imagePreviewEmpty = document.getElementById('image-preview-empty');
  elements.imageFileInput = document.getElementById('image-file-input');
  elements.imageRemoveButton = document.getElementById('image-remove-button');
}

function bindStaticEvents() {
  elements.addPageButton.addEventListener('click', () => openPageModal());
  elements.exportConfigButton.addEventListener('click', onExportConfig);
  elements.importConfigButton.addEventListener('click', onImportConfig);

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
      closeModal(button.getAttribute('data-close'));
    });
  });

  elements.pageForm.addEventListener('submit', onPageSubmit);
  elements.pageBackgroundColorTrigger.addEventListener('click', () => {
    openColorPicker(elements.pageBackgroundColorInput, elements.pageBackgroundColorTrigger);
  });
  elements.controlForm.addEventListener('submit', onControlSubmit);
  elements.pluginSelect.addEventListener('change', () => {
    populateControlTypeOptions();
    renderControlFields();
  });
  elements.controlTypeSelect.addEventListener('change', renderControlFields);
  elements.controlForm.addEventListener('change', onControlFormChange);
  elements.controlForm.addEventListener('input', onControlFormChange);
  elements.iconSearchInput.addEventListener('input', renderIconSearchResults);
  elements.colorModeBasicButton.addEventListener('click', () => setColorPickerMode('basic'));
  elements.colorModeAdvancedButton.addEventListener('click', () => setColorPickerMode('advanced'));
  elements.colorAdvancedInput.addEventListener('input', () => selectColor(elements.colorAdvancedInput.value, false));
  elements.imagePreviewButton.addEventListener('click', () => {
    elements.imageFileInput.click();
  });
  elements.imageFileInput.addEventListener('change', onImageFileSelected);
  elements.imageRemoveButton.addEventListener('click', onRemoveImageSelection);
  elements.deleteControlButton.addEventListener('click', onDeleteControl);
  document.addEventListener('keydown', onGlobalKeydown);

  elements.remoteUrl.textContent = t('renderer.sidebar.remoteLabel', { url: 'http://localhost:8766' });
}

async function hydrateRemoteAccess() {
  const fallbackUrl = 'http://localhost:8766';
  elements.remoteUrl.textContent = t('renderer.sidebar.remoteLabel', { url: fallbackUrl });

  try {
    const remoteInfo = await window.controlsDeckAPI.getRemoteUrlInfo();
    const remoteUrl = remoteInfo?.httpUrl || fallbackUrl;
    elements.remoteUrl.textContent = t('renderer.sidebar.remoteLabel', { url: remoteUrl });

    if (remoteInfo?.qrDataUrl && elements.remoteQr && elements.remoteQrImage) {
      elements.remoteQrImage.src = remoteInfo.qrDataUrl;
      elements.remoteQrImage.alt = t('renderer.sidebar.remoteQrAlt', { url: remoteUrl });
      elements.remoteQr.classList.remove('hidden');
      return;
    }
  } catch (error) {
    console.error('[ui] No se pudo resolver la URL remota:', error);
  }

  if (elements.remoteQr) {
    elements.remoteQr.classList.add('hidden');
  }
}

async function loadInitialData() {
  const [config, plugins] = await Promise.all([
    window.controlsDeckAPI.getConfig(),
    window.controlsDeckAPI.getPlugins(),
  ]);
  state.config = config;
  state.plugins = plugins;
  ensureSelectedPage();
}

async function onExportConfig() {
  try {
    const result = await window.controlsDeckAPI.exportConfig();
    if (result?.canceled) {
      return;
    }
    if (result?.filePath) {
      window.alert(t('renderer.alerts.exportSuccess', { path: result.filePath }));
    }
  } catch (error) {
    console.error('[ui] Error exportando configuracion:', error);
    window.alert(t('renderer.alerts.exportFailure', { message: error.message }));
  }
}

async function onImportConfig() {
  const confirmed = window.confirm(t('renderer.confirm.importConfig'));
  if (!confirmed) {
    return;
  }

  try {
    const result = await window.controlsDeckAPI.importConfig();
    if (result?.canceled) {
      return;
    }
    if (result?.filePath) {
      window.alert(t('renderer.alerts.importSuccess', { path: result.filePath }));
    }
  } catch (error) {
    console.error('[ui] Error importando configuracion:', error);
    window.alert(t('renderer.alerts.importFailure', { message: error.message }));
  }
}

function ensureSelectedPage() {
  const pages = getSortedPages();
  if (!pages.length) {
    state.selectedPageId = null;
    return;
  }
  const exists = pages.some((page) => page.id === state.selectedPageId);
  if (!exists) {
    state.selectedPageId = pages[0].id;
  }
}

function getSortedPages() {
  return (state.config?.pages || []).slice().sort((left, right) => left.order - right.order);
}

function getSelectedPage() {
  return getSortedPages().find((page) => page.id === state.selectedPageId) || null;
}

function renderAll() {
  renderPagesList();
  renderGrid();
}

function renderPagesList() {
  elements.pagesList.replaceChildren();

  for (const page of getSortedPages()) {
    const item = document.createElement('div');
    item.className = `page-item${page.id === state.selectedPageId ? ' active' : ''}`;
    item.draggable = true;
    item.dataset.pageId = page.id;
    item.style.setProperty('--page-item-background', page.backgroundColor || '#1a1a2e');

    item.addEventListener('dragstart', () => {
      state.draggingPageId = page.id;
      item.classList.add('dragging');
    });

    item.addEventListener('dragend', () => {
      state.draggingPageId = null;
      item.classList.remove('dragging');
    });

    item.addEventListener('dragover', (event) => {
      event.preventDefault();
    });

    item.addEventListener('drop', async (event) => {
      event.preventDefault();
      if (!state.draggingPageId || state.draggingPageId === page.id) {
        return;
      }
      const ids = getSortedPages().map((entry) => entry.id);
      const fromIndex = ids.indexOf(state.draggingPageId);
      const toIndex = ids.indexOf(page.id);
      ids.splice(toIndex, 0, ids.splice(fromIndex, 1)[0]);
      await window.controlsDeckAPI.reorderPages(ids);
    });

    const nameButton = document.createElement('button');
    nameButton.className = 'page-name-button';
    nameButton.textContent = page.name;
    nameButton.addEventListener('click', () => {
      state.selectedPageId = page.id;
      renderAll();
    });

    const editButton = createIconButton('fa-pen', t('renderer.actions.editPage'), () => openPageModal(page));
    const deleteButton = createIconButton('fa-trash', t('renderer.actions.deletePage'), async () => {
      const confirmed = window.confirm(t('renderer.confirm.deletePage', { name: page.name }));
      if (!confirmed) {
        return;
      }
      await window.controlsDeckAPI.deletePage(page.id);
    });

    item.append(nameButton, editButton, deleteButton);
    elements.pagesList.append(item);
  }
}

function renderGrid() {
  const page = getSelectedPage();
  elements.pageGrid.replaceChildren();

  if (!page) {
    return;
  }
  elements.pageGrid.style.background = page.backgroundColor;
  elements.pageGrid.style.gridTemplateColumns = `repeat(${page.columns}, minmax(0, 1fr))`;
  elements.pageGrid.style.gridTemplateRows = `repeat(${page.rows}, minmax(92px, 1fr))`;

  const occupied = new Set();
  for (const control of page.controls) {
    for (let rowOffset = 0; rowOffset < control.rowSpan; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < control.columnSpan; columnOffset += 1) {
        occupied.add(`${control.column + columnOffset}:${control.row + rowOffset}`);
      }
    }
  }

  for (let row = 0; row < page.rows; row += 1) {
    for (let column = 0; column < page.columns; column += 1) {
      if (occupied.has(`${column}:${row}`)) {
        continue;
      }
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.style.gridColumn = String(column + 1);
      cell.style.gridRow = String(row + 1);

      const button = document.createElement('button');
      button.className = 'grid-add-button';
      button.innerHTML = '<i class="fa-solid fa-gear"></i>';
      button.title = t('renderer.actions.addControl');
      button.addEventListener('click', () => openControlModal({ pageId: page.id, column, row }));
      
      const buttonsPair = document.createElement('div');
      buttonsPair.className = 'grid-buttons-pair';
      buttonsPair.append(button);
      
      if (state.copiedControl) {
        const pasteButton = document.createElement('button');
        pasteButton.className = 'grid-add-button';
        pasteButton.innerHTML = '<i class="fa-solid fa-paste"></i>';
        pasteButton.title = t('renderer.actions.pasteControl');
        pasteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          onPasteControl(page.id, column, row);
        });
        buttonsPair.append(pasteButton);
      }
      
      cell.append(buttonsPair);
      elements.pageGrid.append(cell);
    }
  }

  for (const control of page.controls) {
    const controlElement = document.createElement('div');
    controlElement.className = 'control-card';
    controlElement.style.gridColumn = `${control.column + 1} / span ${control.columnSpan}`;
    controlElement.style.gridRow = `${control.row + 1} / span ${control.rowSpan}`;
    applyControlCardBackground(controlElement, control.config || {}, control.state || {});
    controlElement.style.color = control.state?.color || control.config.color || '#ffffff';

    const content = document.createElement('div');
    content.className = 'control-content';
    const icon = document.createElement('i');
    icon.className = `fa-solid ${control.state?.icon || control.config.icon || 'fa-square'}`;
    const text = document.createElement('div');
    text.textContent = control.state?.text || control.config.text || control.controlTypeId;
    content.append(icon, text);

    controlElement.append(content);
    
    const actions = document.createElement('div');
    actions.className = 'control-actions';
    const copyButton = createIconButton('fa-copy', t('renderer.actions.copyControl'), (event) => {
      event.stopPropagation();
      onCopyControl(control);
    });
    actions.append(copyButton);
    controlElement.append(actions);
    
    controlElement.addEventListener('click', () => openControlModal({ pageId: page.id, control }));
    elements.pageGrid.append(controlElement);
  }
}

function createIconButton(iconClass, title, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-button';
  button.title = title;
  const icon = document.createElement('i');
  icon.className = `fa-solid ${iconClass}`;
  button.append(icon);
  button.addEventListener('click', onClick);
  return button;
}

function openPageModal(page = null) {
  state.editingPageId = page?.id || null;
  elements.pageNameInput.value = page?.name || '';
  elements.pageColumnsInput.value = page?.columns || 4;
  elements.pageRowsInput.value = page?.rows || 3;
  const pageBackgroundColor = normalizeColorHex(page?.backgroundColor || '#1a1a2e', '#1a1a2e');
  elements.pageBackgroundColorInput.value = pageBackgroundColor;
  updateColorTriggerPreview(elements.pageBackgroundColorTrigger, pageBackgroundColor);
  elements.pageModal.classList.remove('hidden');
  elements.pageNameInput.focus();
}

function closeModal(id) {
  if (id === 'control-modal') {
    stopKeypressCapture();
  }
  if (id === 'icon-picker-modal') {
    state.iconPicker.targetInput = null;
    state.iconPicker.targetButton = null;
    state.iconPicker.selectedIcon = 'fa-square';
    elements.iconSearchInput.value = '';
    elements.iconResults.replaceChildren();
    elements.iconEmptyState.classList.add('hidden');
  }
  if (id === 'color-picker-modal') {
    state.colorPicker.targetInput = null;
    state.colorPicker.targetButton = null;
    state.colorPicker.selectedColor = '#ffffff';
    state.colorPicker.mode = 'basic';
    setColorPickerMode('basic');
    elements.colorAdvancedInput.value = '#ffffff';
    elements.colorBasicPalette.replaceChildren();
  }
  if (id === 'image-picker-modal') {
    state.imagePicker.targetInput = null;
    state.imagePicker.targetButton = null;
    state.imagePicker.selectedImageDataUrl = '';
    renderImagePickerPreview('');
    elements.imageFileInput.value = '';
  }
  document.getElementById(id).classList.add('hidden');
}

async function onPageSubmit(event) {
  event.preventDefault();
  const payload = {
    id: state.editingPageId || undefined,
    name: elements.pageNameInput.value.trim(),
    columns: Number(elements.pageColumnsInput.value),
    rows: Number(elements.pageRowsInput.value),
    backgroundColor: elements.pageForm.backgroundColor.value,
  };

  await window.controlsDeckAPI.savePage(payload);
  closeModal('page-modal');
}

function openControlModal({ pageId, column = 0, row = 0, control = null }) {
  const controlColumn = control?.column ?? column;
  const controlRow = control?.row ?? row;
  state.editingControl = {
    pageId,
    controlId: control?.id || null,
    column: controlColumn,
    row: controlRow,
    existingControl: control,
  };

  populatePluginOptions(control?.pluginId);
  populateControlTypeOptions(control?.controlTypeId);

  elements.controlForm.columnSpan.value = control?.columnSpan || 1;
  elements.controlForm.rowSpan.value = control?.rowSpan || 1;
  elements.deleteControlButton.classList.toggle('hidden', !control?.id);
  renderControlFields(control?.config || {});
  elements.controlModal.classList.remove('hidden');
}

function populatePluginOptions(selectedPluginId) {
  elements.pluginSelect.replaceChildren();
  for (const plugin of state.plugins) {
    const option = document.createElement('option');
    option.value = plugin.id;
    option.textContent = plugin.name;
    if (selectedPluginId && selectedPluginId === plugin.id) {
      option.selected = true;
    }
    elements.pluginSelect.append(option);
  }
}

function getSelectedPlugin() {
  return state.plugins.find((plugin) => plugin.id === elements.pluginSelect.value) || state.plugins[0] || null;
}

function populateControlTypeOptions(selectedControlTypeId) {
  elements.controlTypeSelect.replaceChildren();
  const plugin = getSelectedPlugin();
  if (!plugin) {
    return;
  }

  for (const control of plugin.controls) {
    const option = document.createElement('option');
    option.value = control.typeId;
    option.textContent = control.name;
    if (selectedControlTypeId && selectedControlTypeId === control.typeId) {
      option.selected = true;
    }
    elements.controlTypeSelect.append(option);
  }
}

function getSelectedControlDefinition() {
  const plugin = getSelectedPlugin();
  return plugin?.controls.find((control) => control.typeId === elements.controlTypeSelect.value) || null;
}

function renderControlFields(existingConfig = {}) {
  stopKeypressCapture();
  elements.commonFields.replaceChildren();
  elements.pluginFields.replaceChildren();

  elements.commonFields.append(createVisualAssetsField(existingConfig));

  for (const field of COMMON_FIELDS) {
    if (field.key === 'icon' || field.key === 'imageDataUrl') {
      continue;
    }
    elements.commonFields.append(createField(field, existingConfig[field.key] ?? field.defaultValue));
  }

  const definition = getSelectedControlDefinition();
  const specificFields = definition?.configSchema || [];
  for (const field of specificFields) {
    elements.pluginFields.append(createField(field, existingConfig[field.key] ?? field.defaultValue));
  }

  if (definition?.typeId === 'keypress') {
    elements.pluginFields.append(createKeypressCapturePanel(existingConfig));
    updateKeypressPreview();
    updateKeypressCaptureStatus();
  }
}

function createField(field, value) {
  if (field.type === 'color') {
    return createColorPickerField(field, value);
  }

  if (field.key === 'icon') {
    return createIconPickerField(field, value);
  }

  const wrapper = document.createElement('label');
  wrapper.className = field.type === 'boolean' ? 'checkbox-field' : '';
  const label = document.createElement('span');
  const resolvedLabel = field.labelKey ? t(field.labelKey) : field.label;
  label.textContent = field.required ? `${resolvedLabel} *` : resolvedLabel;

  let input;
  if (field.type === 'select' || field.type === 'page') {
    wrapper.append(label);
    input = document.createElement('select');
    const options = field.type === 'page'
      ? getSortedPages().map((page) => ({ value: page.id, label: page.name }))
      : field.options || [];

    for (const optionData of options) {
      const option = document.createElement('option');
      option.value = String(optionData.value);
      option.textContent = optionData.label;
      if (String(value ?? '') === String(optionData.value)) {
        option.selected = true;
      }
      input.append(option);
    }
  } else if (field.type === 'boolean') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    wrapper.append(input, label);
  } else {
    wrapper.append(label);
    input = document.createElement('input');
    input.type = field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text';
    input.value = value ?? '';
  }

  input.name = `config:${field.key}`;
  if (field.required) {
    input.required = true;
  }
  if (field.type !== 'boolean') {
    wrapper.append(input);
  }
  return wrapper;
}

function normalizeIconName(rawValue) {
  const text = String(rawValue || '').trim();
  if (!text) {
    return 'fa-square';
  }

  const tokens = text.split(/\s+/).filter(Boolean);
  const iconToken = tokens.find((token) => token.startsWith('fa-') && token !== 'fa-solid' && token !== 'fa-regular' && token !== 'fa-brands');
  const base = iconToken || text;

  if (base.startsWith('fa-')) {
    return base.toLowerCase();
  }

  return `fa-${base.replace(/^fa/i, '').replace(/^-+/, '').toLowerCase()}`;
}

function normalizeColorHex(rawValue, fallback = '#ffffff') {
  const text = String(rawValue || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) {
    return text.toLowerCase();
  }
  if (/^#[0-9a-fA-F]{3}$/.test(text)) {
    const expanded = text.slice(1).split('').map((char) => `${char}${char}`).join('');
    return `#${expanded}`.toLowerCase();
  }
  return fallback;
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
    base64: match[2],
    dataUrl: text,
  };
}

function estimateBase64Bytes(base64Text) {
  const padding = base64Text.endsWith('==') ? 2 : base64Text.endsWith('=') ? 1 : 0;
  return Math.floor((base64Text.length * 3) / 4) - padding;
}

function normalizeImageDataUrl(rawValue) {
  const parsed = parseImageDataUrl(rawValue);
  if (!parsed || !ALLOWED_IMAGE_MIME_TYPES.has(parsed.mimeType)) {
    return '';
  }
  return parsed.dataUrl;
}

function validateImageDataUrl(dataUrl) {
  const normalized = normalizeImageDataUrl(dataUrl);
  if (!normalized) {
    return dataUrl ? t('renderer.alerts.imageUnsupported') : '';
  }

  const parsed = parseImageDataUrl(normalized);
  if (!parsed) {
    return t('renderer.alerts.imageUnsupported');
  }

  const bytes = estimateBase64Bytes(parsed.base64);
  if (bytes > IMAGE_MAX_BYTES) {
    return t('renderer.alerts.imageTooLarge', { limitKb: String(Math.floor(IMAGE_MAX_BYTES / 1024)) });
  }

  return '';
}

function applyControlCardBackground(cardElement, controlConfig, controlState) {
  const fallbackColor = controlState?.backgroundColor || controlConfig?.backgroundColor || '#2d2d2d';
  const imageDataUrl = normalizeImageDataUrl(controlConfig?.imageDataUrl || '');
  cardElement.style.backgroundColor = fallbackColor;

  if (imageDataUrl) {
    cardElement.style.backgroundImage = `url(${JSON.stringify(imageDataUrl)})`;
    cardElement.style.backgroundSize = 'contain';
    cardElement.style.backgroundPosition = 'center';
    cardElement.style.backgroundRepeat = 'no-repeat';
  } else {
    cardElement.style.backgroundImage = 'none';
    cardElement.style.backgroundSize = '';
    cardElement.style.backgroundPosition = '';
    cardElement.style.backgroundRepeat = '';
  }
}

function createVisualAssetsField(existingConfig = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'visual-assets-field';

  const row = document.createElement('div');
  row.className = 'visual-assets-row';

  const iconTile = document.createElement('label');
  iconTile.className = 'visual-asset-tile';
  const iconCaption = document.createElement('span');
  iconCaption.textContent = t('renderer.fields.icon');

  const iconInput = document.createElement('input');
  iconInput.type = 'hidden';
  iconInput.name = 'config:icon';
  iconInput.value = normalizeIconName(existingConfig.icon || 'fa-square');

  const iconButton = document.createElement('button');
  iconButton.type = 'button';
  iconButton.className = 'icon-trigger';
  iconButton.setAttribute('aria-label', t('renderer.aria.selectIcon'));
  updateIconButtonPreview(iconButton, iconInput.value);
  iconButton.addEventListener('click', () => openIconPicker(iconInput, iconButton));

  iconTile.append(iconCaption, iconInput, iconButton);

  const imageTile = document.createElement('label');
  imageTile.className = 'visual-asset-tile';
  const imageCaption = document.createElement('span');
  imageCaption.textContent = t('renderer.fields.image');

  const imageInput = document.createElement('input');
  imageInput.type = 'hidden';
  imageInput.name = 'config:imageDataUrl';
  imageInput.value = normalizeImageDataUrl(existingConfig.imageDataUrl || '');

  const imageButton = document.createElement('button');
  imageButton.type = 'button';
  imageButton.className = 'image-trigger';
  imageButton.setAttribute('aria-label', t('renderer.aria.selectImage'));
  updateImageButtonPreview(imageButton, imageInput.value);
  imageButton.addEventListener('click', () => openImagePicker(imageInput, imageButton));

  imageTile.append(imageCaption, imageInput, imageButton);
  row.append(iconTile, imageTile);
  wrapper.append(row);
  return wrapper;
}

function updateImageButtonPreview(button, dataUrl) {
  const normalized = normalizeImageDataUrl(dataUrl);
  button.replaceChildren();
  button.classList.toggle('has-image', Boolean(normalized));
  if (!normalized) {
    return;
  }

  const image = document.createElement('img');
  image.src = normalized;
  image.alt = '';
  button.append(image);
}

function openImagePicker(input, button) {
  state.imagePicker.targetInput = input;
  state.imagePicker.targetButton = button;
  state.imagePicker.selectedImageDataUrl = normalizeImageDataUrl(input.value);
  elements.imagePickerModal.classList.remove('hidden');
  renderImagePickerPreview(state.imagePicker.selectedImageDataUrl);
}

function renderImagePickerPreview(dataUrl) {
  const normalized = normalizeImageDataUrl(dataUrl);
  const hasImage = Boolean(normalized);

  if (hasImage) {
    elements.imagePreviewImage.src = normalized;
    elements.imagePreviewImage.classList.remove('hidden');
  } else {
    elements.imagePreviewImage.removeAttribute('src');
    elements.imagePreviewImage.classList.add('hidden');
  }

  elements.imagePreviewEmpty.classList.toggle('hidden', hasImage);
  elements.imageRemoveButton.classList.toggle('hidden', !hasImage);
}

function onImageFileSelected(event) {
  const file = event.target.files?.[0];
  if (!file || !state.imagePicker.targetInput) {
    return;
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(String(file.type || '').toLowerCase())) {
    window.alert(t('renderer.alerts.imageUnsupported'));
    elements.imageFileInput.value = '';
    return;
  }

  if (file.size > IMAGE_MAX_BYTES) {
    window.alert(t('renderer.alerts.imageTooLarge', { limitKb: String(Math.floor(IMAGE_MAX_BYTES / 1024)) }));
    elements.imageFileInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const dataUrl = normalizeImageDataUrl(reader.result || '');
    const validationError = validateImageDataUrl(dataUrl);
    if (validationError) {
      window.alert(validationError);
      return;
    }

    state.imagePicker.selectedImageDataUrl = dataUrl;
    state.imagePicker.targetInput.value = dataUrl;
    if (state.imagePicker.targetButton) {
      updateImageButtonPreview(state.imagePicker.targetButton, dataUrl);
    }
    renderImagePickerPreview(dataUrl);
    elements.imageFileInput.value = '';
  });
  reader.addEventListener('error', () => {
    window.alert(t('renderer.alerts.imageReadFailure'));
    elements.imageFileInput.value = '';
  });
  reader.readAsDataURL(file);
}

function onRemoveImageSelection(event) {
  event.stopPropagation();
  state.imagePicker.selectedImageDataUrl = '';
  if (state.imagePicker.targetInput) {
    state.imagePicker.targetInput.value = '';
  }
  if (state.imagePicker.targetButton) {
    updateImageButtonPreview(state.imagePicker.targetButton, '');
  }
  renderImagePickerPreview('');
}

function hexToRgb(hexColor) {
  const normalizedHex = normalizeColorHex(hexColor, '#000000').slice(1);
  const parsed = parseInt(normalizedHex, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgbToHsl(rgbColor) {
  const r = rgbColor.r / 255;
  const g = rgbColor.g / 255;
  const b = rgbColor.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness };
  }

  const saturation = lightness > 0.5
    ? delta / (2 - max - min)
    : delta / (max + min);

  let hue;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  hue /= 6;
  return { hue, saturation, lightness };
}

function sortColorSwatches(swatches) {
  const uniqueHexColors = [...new Set(swatches.map((color) => normalizeColorHex(color)))];

  return uniqueHexColors
    .map((color) => {
      const hslColor = rgbToHsl(hexToRgb(color));
      return {
        color,
        hue: hslColor.hue,
        saturation: hslColor.saturation,
        lightness: hslColor.lightness,
      };
    })
    .sort((leftColor, rightColor) => {
      const leftIsNeutral = leftColor.saturation < 0.08;
      const rightIsNeutral = rightColor.saturation < 0.08;

      if (leftIsNeutral !== rightIsNeutral) {
        return leftIsNeutral ? -1 : 1;
      }

      if (leftIsNeutral && rightIsNeutral) {
        return leftColor.lightness - rightColor.lightness;
      }

      if (leftColor.hue !== rightColor.hue) {
        return leftColor.hue - rightColor.hue;
      }

      return leftColor.lightness - rightColor.lightness;
    })
    .map((entry) => entry.color);
}

function createColorPickerField(field, value) {
  const wrapper = document.createElement('label');
  wrapper.className = 'color-field';

  const label = document.createElement('span');
  const resolvedLabel = field.labelKey ? t(field.labelKey) : field.label;
  label.textContent = field.required ? `${resolvedLabel} *` : resolvedLabel;

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = `config:${field.key}`;
  input.value = normalizeColorHex(value ?? field.defaultValue, '#ffffff');
  if (field.required) {
    input.required = true;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'color-trigger';
  button.setAttribute('aria-label', t('renderer.aria.selectColor'));
  updateColorTriggerPreview(button, input.value);
  button.addEventListener('click', () => openColorPicker(input, button));

  wrapper.append(label, input, button);
  return wrapper;
}

function updateColorTriggerPreview(button, colorValue) {
  button.style.backgroundColor = normalizeColorHex(colorValue, '#ffffff');
}

function openColorPicker(input, button) {
  const selectedColor = normalizeColorHex(input.value, '#ffffff');
  state.colorPicker.targetInput = input;
  state.colorPicker.targetButton = button;
  state.colorPicker.selectedColor = selectedColor;
  elements.colorPickerModal.classList.remove('hidden');
  setColorPickerMode(state.colorPicker.mode || 'basic');
  elements.colorAdvancedInput.value = selectedColor;
  renderBasicColorPalette();
}

function setColorPickerMode(mode) {
  state.colorPicker.mode = mode === 'advanced' ? 'advanced' : 'basic';
  const isBasicMode = state.colorPicker.mode === 'basic';
  elements.colorModeBasicButton.classList.toggle('active', isBasicMode);
  elements.colorModeAdvancedButton.classList.toggle('active', !isBasicMode);
  elements.colorBasicPanel.classList.toggle('hidden', !isBasicMode);
  elements.colorAdvancedPanel.classList.toggle('hidden', isBasicMode);

  if (!isBasicMode) {
    elements.colorAdvancedInput.focus();
    try {
      if (typeof elements.colorAdvancedInput.showPicker === 'function') {
        elements.colorAdvancedInput.showPicker();
      }
    } catch {
      // Some platforms require stricter user-gesture contexts for showPicker.
    }
  }
}

function renderBasicColorPalette() {
  elements.colorBasicPalette.replaceChildren();
  for (const paletteColor of ORDERED_BASIC_COLOR_SWATCHES) {
    const swatchButton = document.createElement('button');
    swatchButton.type = 'button';
    swatchButton.className = `color-swatch${normalizeColorHex(paletteColor) === state.colorPicker.selectedColor ? ' selected' : ''}`;
    swatchButton.style.backgroundColor = paletteColor;
    swatchButton.setAttribute('aria-label', t('renderer.aria.selectColor'));
    swatchButton.addEventListener('click', () => selectColor(paletteColor));
    elements.colorBasicPalette.append(swatchButton);
  }
}

function selectColor(colorValue, closeAfterSelection = true) {
  const normalizedColor = normalizeColorHex(colorValue, '#ffffff');
  state.colorPicker.selectedColor = normalizedColor;
  elements.colorAdvancedInput.value = normalizedColor;

  if (state.colorPicker.targetInput) {
    state.colorPicker.targetInput.value = normalizedColor;
  }
  if (state.colorPicker.targetButton) {
    updateColorTriggerPreview(state.colorPicker.targetButton, normalizedColor);
  }

  renderBasicColorPalette();

  if (closeAfterSelection) {
    closeModal('color-picker-modal');
  }
}

function createIconPickerField(field, value) {
  const wrapper = document.createElement('label');
  wrapper.className = 'icon-field';

  const label = document.createElement('span');
  const resolvedLabel = field.labelKey ? t(field.labelKey) : field.label;
  label.textContent = field.required ? `${resolvedLabel} *` : resolvedLabel;

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = `config:${field.key}`;
  input.value = normalizeIconName(value ?? field.defaultValue);
  if (field.required) {
    input.required = true;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'icon-trigger';
  button.setAttribute('aria-label', t('renderer.aria.selectIcon'));
  updateIconButtonPreview(button, input.value);
  button.addEventListener('click', () => openIconPicker(input, button));

  wrapper.append(label, input, button);
  return wrapper;
}

function updateIconButtonPreview(button, iconName) {
  const normalizedIcon = normalizeIconName(iconName);
  button.replaceChildren();
  const icon = document.createElement('i');
  icon.className = `fa-solid ${normalizedIcon}`;
  button.append(icon);
}

function openIconPicker(input, button) {
  state.iconPicker.targetInput = input;
  state.iconPicker.targetButton = button;
  state.iconPicker.selectedIcon = normalizeIconName(input.value);
  elements.iconPickerModal.classList.remove('hidden');
  renderIconSearchResults();
  elements.iconSearchInput.focus();
}

function renderIconSearchResults() {
  if (!state.iconPicker.targetInput) {
    return;
  }

  const query = String(elements.iconSearchInput.value || '').trim().toLowerCase();
  const matchingIcons = ICON_CATALOG
    .filter((iconName) => iconName.includes(query))
    .slice(0, ICON_RESULTS_LIMIT);

  elements.iconResults.replaceChildren();

  for (const iconName of matchingIcons) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `icon-result${iconName === state.iconPicker.selectedIcon ? ' selected' : ''}`;
    button.setAttribute('aria-label', t('renderer.aria.selectIcon'));

    const icon = document.createElement('i');
    icon.className = `fa-solid ${iconName}`;
    button.append(icon);

    button.addEventListener('click', () => selectIcon(iconName));
    elements.iconResults.append(button);
  }

  elements.iconEmptyState.classList.toggle('hidden', matchingIcons.length > 0);
}

function selectIcon(iconName) {
  const normalizedIcon = normalizeIconName(iconName);
  state.iconPicker.selectedIcon = normalizedIcon;
  if (state.iconPicker.targetInput) {
    state.iconPicker.targetInput.value = normalizedIcon;
  }
  if (state.iconPicker.targetButton) {
    updateIconButtonPreview(state.iconPicker.targetButton, normalizedIcon);
  }
  closeModal('icon-picker-modal');
}

function onGlobalKeydown(event) {
  if (event.key === 'Escape' && !elements.colorPickerModal.classList.contains('hidden')) {
    closeModal('color-picker-modal');
    return;
  }

  if (event.key === 'Escape' && !elements.imagePickerModal.classList.contains('hidden')) {
    closeModal('image-picker-modal');
    return;
  }

  if (event.key === 'Escape' && !elements.iconPickerModal.classList.contains('hidden')) {
    closeModal('icon-picker-modal');
    return;
  }

  onKeypressCapture(event);
}

function createKeypressCapturePanel(existingConfig = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'keypress-panel';

  const title = document.createElement('strong');
  title.textContent = t('renderer.keypress.title');

  const hint = document.createElement('p');
  hint.className = 'field-hint';
  hint.textContent = t('renderer.keypress.hint');

  const preview = document.createElement('div');
  preview.className = 'keypress-preview';
  preview.id = 'keypress-preview';
  preview.textContent = buildKeypressSummary(existingConfig) || t('renderer.keypress.none');

  const status = document.createElement('p');
  status.className = 'field-hint';
  status.id = 'keypress-capture-status';
  status.textContent = state.keypressCaptureActive ? t('renderer.keypress.listening') : t('renderer.keypress.ready');

  const actions = document.createElement('div');
  actions.className = 'keypress-actions';

  const recordButton = document.createElement('button');
  recordButton.type = 'button';
  recordButton.className = 'ghost-button';
  recordButton.textContent = state.keypressCaptureActive ? t('renderer.keypress.listening') : t('renderer.keypress.record');
  recordButton.addEventListener('click', () => {
    state.keypressCaptureActive = true;
    updateKeypressCaptureStatus();
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'ghost-button';
  clearButton.textContent = t('renderer.keypress.clear');
  clearButton.addEventListener('click', clearKeypressFields);

  actions.append(recordButton, clearButton);
  wrapper.append(title, hint, preview, status, actions);
  return wrapper;
}

function onControlFormChange(event) {
  if (!event.target.name?.startsWith('config:')) {
    return;
  }

  const definition = getSelectedControlDefinition();
  if (definition?.typeId !== 'keypress') {
    return;
  }

  if (event.target.name === 'config:mode') {
    updateKeypressCaptureStatus();
  }

  updateKeypressPreview();
}

function getConfigInput(name) {
  return elements.controlForm.elements.namedItem(`config:${name}`);
}

function getKeypressConfigFromForm() {
  return {
    mode: getConfigInput('mode')?.value || 'basic',
    key: getConfigInput('key')?.value || '',
    ctrl: Boolean(getConfigInput('ctrl')?.checked),
    shift: Boolean(getConfigInput('shift')?.checked),
    alt: Boolean(getConfigInput('alt')?.checked),
    windows: Boolean(getConfigInput('windows')?.checked),
  };
}

function normalizeKeypressKey(rawKey) {
  if (!rawKey) {
    return '';
  }

  const trimmedKey = String(rawKey).trim();
  if (!trimmedKey) {
    return '';
  }

  if (trimmedKey.length === 1 && /[a-z0-9]/i.test(trimmedKey)) {
    return trimmedKey.toUpperCase();
  }

  if (/^F([1-9]|1\d|2[0-4])$/i.test(trimmedKey)) {
    return trimmedKey.toUpperCase();
  }

  return KEYPRESS_SPECIAL_KEYS[trimmedKey] || KEYPRESS_SPECIAL_KEY_ALIASES[trimmedKey.toLowerCase()] || trimmedKey;
}

function buildKeypressSummary(config) {
  const parts = [];
  if (config.ctrl) {
    parts.push(t('renderer.keypress.summary.ctrl'));
  }
  if (config.shift) {
    parts.push(t('renderer.keypress.summary.shift'));
  }
  if (config.alt) {
    parts.push(t('renderer.keypress.summary.alt'));
  }
  if (config.windows) {
    parts.push(t('renderer.keypress.summary.win'));
  }

  const key = normalizeKeypressKey(String(config.key || '').trim());
  if (!key) {
    return '';
  }

  parts.push(key === 'Space' ? t('renderer.keypress.summary.space') : key);
  return parts.join('+');
}

function updateKeypressPreview() {
  const preview = document.getElementById('keypress-preview');
  if (!preview) {
    return;
  }

  preview.textContent = buildKeypressSummary(getKeypressConfigFromForm()) || t('renderer.keypress.none');
}

function updateKeypressCaptureStatus() {
  const status = document.getElementById('keypress-capture-status');
  const recordButton = document.querySelector('.keypress-actions .ghost-button');
  const mode = getConfigInput('mode')?.value || 'basic';
  if (status) {
    if (mode !== 'advanced') {
      status.textContent = t('renderer.keypress.manualBasic');
    } else {
      status.textContent = state.keypressCaptureActive ? t('renderer.keypress.listening') : t('renderer.keypress.ready');
    }
  }
  if (recordButton) {
    recordButton.textContent = state.keypressCaptureActive ? t('renderer.keypress.listening') : t('renderer.keypress.record');
    recordButton.disabled = mode !== 'advanced';
  }
}

function stopKeypressCapture() {
  state.keypressCaptureActive = false;
}

function clearKeypressFields() {
  const keyInput = getConfigInput('key');
  if (keyInput) {
    keyInput.value = '';
  }
  ['ctrl', 'shift', 'alt', 'windows'].forEach((name) => {
    const input = getConfigInput(name);
    if (input) {
      input.checked = false;
    }
  });
  stopKeypressCapture();
  updateKeypressPreview();
  updateKeypressCaptureStatus();
}

function onKeypressCapture(event) {
  if (!state.keypressCaptureActive || elements.controlModal.classList.contains('hidden')) {
    return;
  }

  const definition = getSelectedControlDefinition();
  if (definition?.typeId !== 'keypress' || getConfigInput('mode')?.value !== 'advanced') {
    return;
  }

  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const keyInput = getConfigInput('key');
  if (keyInput) {
    keyInput.value = normalizeKeypressKey(event.key);
  }
  const ctrl = getConfigInput('ctrl');
  const shift = getConfigInput('shift');
  const alt = getConfigInput('alt');
  const windows = getConfigInput('windows');
  if (ctrl) {
    ctrl.checked = event.ctrlKey;
  }
  if (shift) {
    shift.checked = event.shiftKey;
  }
  if (alt) {
    alt.checked = event.altKey;
  }
  if (windows) {
    windows.checked = event.metaKey;
  }

  stopKeypressCapture();
  updateKeypressPreview();
  updateKeypressCaptureStatus();
}

function validateKeypressConfig(config) {
  const key = normalizeKeypressKey(String(config.key || '').trim());
  if (!key) {
    return t('renderer.alerts.keypressRequired');
  }

  if (!/^[A-Z0-9]$/.test(key) && !/^F([1-9]|1\d|2[0-4])$/.test(key) && !Object.values(KEYPRESS_SPECIAL_KEYS).includes(key)) {
    return t('renderer.alerts.keypressUnsupported', { key: config.key });
  }

  return '';
}

function sanitizeControlConfig(config) {
  const sanitizedConfig = { ...config };
  for (const key of LEGACY_ACTIVE_VISUAL_KEYS) {
    delete sanitizedConfig[key];
  }

  sanitizedConfig.icon = normalizeIconName(sanitizedConfig.icon || 'fa-square');
  sanitizedConfig.color = normalizeColorHex(sanitizedConfig.color || '#ffffff', '#ffffff');
  sanitizedConfig.backgroundColor = normalizeColorHex(sanitizedConfig.backgroundColor || '#2d2d2d', '#2d2d2d');
  const normalizedImage = normalizeImageDataUrl(sanitizedConfig.imageDataUrl || '');
  if (normalizedImage) {
    sanitizedConfig.imageDataUrl = normalizedImage;
  } else {
    delete sanitizedConfig.imageDataUrl;
  }

  return sanitizedConfig;
}

async function onControlSubmit(event) {
  event.preventDefault();
  const plugin = getSelectedPlugin();
  const definition = getSelectedControlDefinition();
  if (!plugin || !definition || !state.editingControl) {
    return;
  }

  const formData = new FormData(elements.controlForm);
  const config = {};
  const fields = [...COMMON_FIELDS, ...(definition.configSchema || [])];
  for (const field of fields) {
    if (field.type !== 'boolean') {
      continue;
    }
    const input = elements.controlForm.elements.namedItem(`config:${field.key}`);
    config[field.key] = Boolean(input?.checked);
  }

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith('config:')) {
      continue;
    }
    config[key.replace('config:', '')] = value;
  }

  if (definition.typeId === 'keypress') {
    const errorMessage = validateKeypressConfig(config);
    if (errorMessage) {
      window.alert(errorMessage);
      return;
    }
    config.key = normalizeKeypressKey(String(config.key || '').trim());
  }

  const imageValidationError = validateImageDataUrl(config.imageDataUrl || '');
  if (imageValidationError) {
    window.alert(imageValidationError);
    return;
  }

  const sanitizedConfig = sanitizeControlConfig(config);

  await window.controlsDeckAPI.saveControl({
    pageId: state.editingControl.pageId,
    control: {
      id: state.editingControl.controlId || undefined,
      pluginId: plugin.id,
      controlTypeId: definition.typeId,
      column: Number(state.editingControl.column),
      row: Number(state.editingControl.row),
      columnSpan: Number(elements.controlForm.columnSpan.value),
      rowSpan: Number(elements.controlForm.rowSpan.value),
      config: sanitizedConfig,
    },
  });

  closeModal('control-modal');
}

async function onDeleteControl() {
  if (!state.editingControl?.controlId) {
    return;
  }
  await window.controlsDeckAPI.deleteControl({
    pageId: state.editingControl.pageId,
    controlId: state.editingControl.controlId,
  });
  closeModal('control-modal');
}

function applyControlStateUpdates(updates) {
  const updateMap = new Map(updates.map((item) => [item.controlId, item]));
  for (const page of state.config?.pages || []) {
    for (const control of page.controls) {
      if (updateMap.has(control.id)) {
        control.state = updateMap.get(control.id);
      }
    }
  }
}

function onCopyControl(control) {
  state.copiedControl = {
    pluginId: control.pluginId,
    controlTypeId: control.controlTypeId,
    config: sanitizeControlConfig(control.config || {}),
    columnSpan: control.columnSpan,
    rowSpan: control.rowSpan,
  };
  renderGrid();
}

async function onPasteControl(pageId, column, row) {
  if (!state.copiedControl) {
    return;
  }

  await window.controlsDeckAPI.saveControl({
    pageId,
    control: {
      pluginId: state.copiedControl.pluginId,
      controlTypeId: state.copiedControl.controlTypeId,
      column,
      row,
      columnSpan: state.copiedControl.columnSpan,
      rowSpan: state.copiedControl.rowSpan,
      config: sanitizeControlConfig(state.copiedControl.config || {}),
    },
  });
}
