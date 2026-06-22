module.exports = {
  getInitialState(config, helpers) {
    return {
      icon: config.icon || 'fa-arrow-right',
      text: config.text || helpers?.t('plugins.core.controls.pageSwitcher.defaultText'),
      color: config.color || '#ffffff',
      backgroundColor: config.backgroundColor || '#2d2d2d',
    };
  },
  onAction(config, payload, sendState, helpers) {
    sendState(this.getInitialState(config, helpers));
  },
};
