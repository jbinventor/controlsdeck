var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/controls/page-switcher.js
var require_page_switcher = __commonJS({
  "src/controls/page-switcher.js"(exports2, module2) {
    module2.exports = {
      getInitialState(config, helpers) {
        return {
          icon: config.icon || "fa-arrow-right",
          text: config.text || helpers?.t("plugins.core.controls.pageSwitcher.defaultText"),
          color: config.color || "#ffffff",
          backgroundColor: config.backgroundColor || "#2d2d2d"
        };
      },
      onAction(config, payload, sendState, helpers) {
        sendState(this.getInitialState(config, helpers));
      }
    };
  }
});

// src/controls/clock.js
var require_clock = __commonJS({
  "src/controls/clock.js"(exports2, module2) {
    var timers = /* @__PURE__ */ new Map();
    function formatTime(format) {
      const now = /* @__PURE__ */ new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      if (format === "HH:mm") {
        return `${hh}:${mm}`;
      }
      if (format === "hh:mm A") {
        const hours = now.getHours() % 12 || 12;
        return `${String(hours).padStart(2, "0")}:${mm} ${now.getHours() >= 12 ? "PM" : "AM"}`;
      }
      return `${hh}:${mm}:${ss}`;
    }
    function buildState(config) {
      return {
        icon: config.icon || "fa-clock",
        text: formatTime(config.format || "HH:mm:ss"),
        color: config.color || "#ffffff",
        backgroundColor: config.backgroundColor || "#24304a"
      };
    }
    module2.exports = {
      getInitialState(config) {
        return buildState(config);
      },
      onLoad(config, controlId, sendState) {
        const tick = () => sendState(buildState(config));
        tick();
        const timerId = setInterval(tick, 1e3);
        timers.set(controlId, timerId);
      },
      onAction() {
      },
      onUnload(config, controlId) {
        if (timers.has(controlId)) {
          clearInterval(timers.get(controlId));
          timers.delete(controlId);
        }
      }
    };
  }
});

// src/controls/microphone-toggle.js
var require_microphone_toggle = __commonJS({
  "src/controls/microphone-toggle.js"(exports2, module2) {
    var { exec } = require("child_process");
    var path = require("path");
    var mutedByControl = /* @__PURE__ */ new Map();
    var NIRCMD = path.join(__dirname, "nircmd.exe");
    var PS_SCRIPT = path.join(__dirname, "windows-mic.ps1");
    var PS_BASE = `powershell -NonInteractive -NoProfile -ExecutionPolicy Bypass -File "${PS_SCRIPT}"`;
    function readWindowsMuteState(callback) {
      exec(`${PS_BASE}`, (err, stdout) => {
        if (err) return callback(false);
        callback(stdout.trim().toLowerCase() === "true");
      });
    }
    function buildState(config, muted, helpers) {
      if (muted) {
        return {
          icon: "fa-microphone-slash",
          text: helpers?.t("plugins.core.controls.microphone.off"),
          color: "#ffd4d4",
          backgroundColor: "#7f1d1d"
        };
      }
      return {
        icon: config.icon || "fa-microphone",
        text: config.text || helpers?.t("plugins.core.controls.microphone.on"),
        color: config.color || "#ffffff",
        backgroundColor: config.backgroundColor || "#14532d"
      };
    }
    function buildCommand(muted) {
      if (process.platform === "win32") {
        return `"${NIRCMD}" mutesysvolume ${muted ? "1" : "0"} default_record`;
      }
      if (process.platform === "darwin") {
        return muted ? "osascript -e 'set volume input volume 0'" : "osascript -e 'set volume input volume 100'";
      }
      if (process.platform === "linux") {
        return muted ? "pactl set-source-mute @DEFAULT_SOURCE@ 1" : "pactl set-source-mute @DEFAULT_SOURCE@ 0";
      }
      return null;
    }
    module2.exports = {
      getInitialState(config, helpers) {
        return buildState(config, false, helpers);
      },
      onLoad(config, controlId, sendState, helpers) {
        if (process.platform !== "win32") return;
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
          exec(command, () => {
          });
        }
        sendState(buildState(config, muted, helpers));
      },
      onUnload(config, controlId) {
        mutedByControl.delete(controlId);
      }
    };
  }
});

// src/controls/keypress.js
var require_keypress = __commonJS({
  "src/controls/keypress.js"(exports2, module2) {
    var { execFile } = require("child_process");
    var path = require("path");
    var NIRCMD = path.join(__dirname, "nircmd.exe");
    var SPECIAL_KEYS = {
      " ": "spc",
      space: "spc",
      spacebar: "spc",
      enter: "enter",
      return: "enter",
      esc: "esc",
      escape: "esc",
      tab: "tab",
      backspace: "backspace",
      delete: "delete",
      del: "delete",
      insert: "insert",
      ins: "insert",
      home: "home",
      end: "end",
      pageup: "pageup",
      "page up": "pageup",
      pagedown: "pagedown",
      "page down": "pagedown",
      left: "left",
      arrowleft: "left",
      right: "right",
      arrowright: "right",
      up: "up",
      arrowup: "up",
      down: "down",
      arrowdown: "down",
      plus: "plus",
      "+": "plus",
      comma: "comma",
      ",": "comma",
      minus: "minus",
      "-": "minus",
      period: "period",
      ".": "period",
      apps: "apps",
      printscreen: "printscreen",
      "print screen": "printscreen",
      pause: "pause",
      capslock: "capslock",
      "caps lock": "capslock",
      numlock: "numlock",
      "num lock": "numlock",
      scroll: "scroll",
      scrolllock: "scroll",
      "scroll lock": "scroll"
    };
    function normalizeKey(rawKey) {
      const value = String(rawKey || "").trim();
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
        chord.push("ctrl");
      }
      if (config.shift) {
        chord.push("shift");
      }
      if (config.alt) {
        chord.push("alt");
      }
      if (config.windows) {
        chord.push("lwin");
      }
      chord.push(key);
      return chord.join("+");
    }
    function buildSummary(config, helpers) {
      const parts = [];
      if (config.ctrl) {
        parts.push(helpers?.t("renderer.keypress.summary.ctrl"));
      }
      if (config.shift) {
        parts.push(helpers?.t("renderer.keypress.summary.shift"));
      }
      if (config.alt) {
        parts.push(helpers?.t("renderer.keypress.summary.alt"));
      }
      if (config.windows) {
        parts.push(helpers?.t("renderer.keypress.summary.win"));
      }
      const key = normalizeKey(config.key);
      if (!key) {
        return "";
      }
      parts.push(key === "spc" ? helpers?.t("renderer.keypress.summary.space") : key.toUpperCase());
      return parts.join("+");
    }
    module2.exports = {
      getInitialState(config, helpers) {
        return {
          icon: config.icon || "fa-keyboard",
          text: config.text || buildSummary(config, helpers) || helpers?.t("plugins.core.controls.keypress.defaultText"),
          color: config.color || "#ffffff",
          backgroundColor: config.backgroundColor || "#1f3a5f"
        };
      },
      onAction(config, payload, sendState, helpers) {
        const chord = buildChord(config);
        if (!chord || process.platform !== "win32") {
          sendState(this.getInitialState(config, helpers));
          return;
        }
        execFile(NIRCMD, ["sendkeypress", chord], () => {
        });
        sendState(this.getInitialState(config, helpers));
      }
    };
  }
});

// src/index.js
var pageSwitcher = require_page_switcher();
var clock = require_clock();
var microphoneToggle = require_microphone_toggle();
var keypress = require_keypress();
module.exports = {
  controls: {
    "page-switcher": pageSwitcher,
    clock,
    "microphone-toggle": microphoneToggle,
    keypress
  }
};
