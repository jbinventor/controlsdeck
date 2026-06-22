// Shared typedef documentation for ControlsDeck plugins.

/**
 * @typedef {Object} ControlState
 * @property {string} icon
 * @property {string} text
 * @property {string} color
 * @property {string} backgroundColor
 */

/**
 * @typedef {Object} ConfigField
 * @property {string} key
 * @property {string} label
 * @property {'text'|'number'|'color'|'select'|'page'|'boolean'} type
 * @property {boolean} [required]
 * @property {any} [defaultValue]
 * @property {Array<{value:any,label:string}>} [options]
 */

/**
 * @typedef {Object} ControlDefinition
 * @property {string} typeId
 * @property {string} name
 * @property {string} description
 * @property {'button'|'slider-h'|'slider-v'} controlType
 * @property {ConfigField[]} configSchema
 */

/**
 * @typedef {Object} PluginManifest
 * @property {string} id
 * @property {string} name
 * @property {string} version
 * @property {string} author
 * @property {string} description
 * @property {string} bundleFile
 * @property {ControlDefinition[]} controls
 */

/**
 * Plugin modules must export:
 * {
 *   controls: {
 *     [typeId: string]: {
 *       getInitialState(config): ControlState,
 *       onAction(config, payload, sendState, helpers): void,
 *       onLoad(config, controlId, sendState, helpers): void,
 *       onUnload(config, controlId): void
 *     }
 *   }
 * }
 */

if (typeof module !== 'undefined') {
  module.exports = {};
}
