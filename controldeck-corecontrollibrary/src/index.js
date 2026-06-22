const pageSwitcher = require('./controls/page-switcher');
const clock = require('./controls/clock');
const microphoneToggle = require('./controls/microphone-toggle');
const keypress = require('./controls/keypress');

module.exports = {
  controls: {
    'page-switcher': pageSwitcher,
    clock,
    'microphone-toggle': microphoneToggle,
    keypress,
  },
};
