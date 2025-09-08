/**
 * @typedef {Object} PluginObject
 * @property {string} id - Plugin ID
 * @property {string} name - Plugin name
 * @property {string} version - Plugin version
 * @property {string} description - Plugin description
 * @property {Object} settings - Plugin settings
 * @property {string} settings.pocketMinePath - Path to PocketMine source code
 * @property {Object} indexer - PHP file indexer
 * @property {Function} init - Plugin initialization function
 * @property {Function} destroy - Plugin cleanup function
 */

/**
 * @typedef {Object} CompletionItem
 * @property {string} caption - Display text
 * @property {string} value - Value to insert
 * @property {string} [snippet] - Snippet to insert (if different from value)
 * @property {string} meta - Type of completion (class, method, property, etc.)
 * @property {number} score - Sorting score
 * @property {string} [docText] - Documentation text
 */

/**
 * @typedef {Object} FunctionInfo
 * @property {string} function - Function name
 * @property {Array} params - Function parameters
 * @property {Object} functionModifiers - Function modifiers (public, private, static, etc.)
 * @property {string} comment - Function documentation
 */

/**
 * @typedef {Object} PropertyInfo
 * @property {string} name - Property name
 * @property {number} type - Property type (normal, static, const)
 */

export {};