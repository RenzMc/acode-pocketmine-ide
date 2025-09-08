/**
 * PocketMine IDE for Acode
 * Provides PHP code completion for PocketMine development
 */

import plugin from '../plugin.json';
import { PhpIndexer } from './phpIndexer';

/**
 * @type {import('../types').PluginObject}
 */
const pocketmineIde = {
  id: plugin.id,
  name: plugin.name,
  version: plugin.version,
  description: plugin.description,
  
  /**
   * Settings for the plugin
   */
  settings: {
    pocketMinePath: null,
    autoIndex: true,
    showCompletionInfo: true,
    maxCompletionItems: 50
  },
  
  /**
   * PHP file indexer
   */
  indexer: null,
  
  /**
   * Current settings dialog
   */
  settingsDialog: null,
  
  /**
   * Called when the plugin is loaded
   * @param {HTMLElement} $page 
   */
  async init($page) {
    // Load saved settings
    await this.loadSettings();
    
    // Initialize the indexer
    this.indexer = new PhpIndexer();
    
    // Register completion provider
    this.registerCompletionProvider();
    
    // Add commands
    this.registerCommands();
    
    // Auto-index if path is set and auto-index is enabled
    if (this.settings.pocketMinePath && this.settings.autoIndex) {
      this.indexPhpFiles();
    }
  },
  
  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      const savedSettings = localStorage.getItem('pocketmine-ide-settings');
      if (savedSettings) {
        this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },
  
  /**
   * Save settings to storage
   */
  async saveSettings() {
    try {
      localStorage.setItem('pocketmine-ide-settings', JSON.stringify(this.settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },
  
  /**
   * Create settings UI using DialogBox
   */
  createSettingsUI() {
    const DialogBox = acode.require('dialogBox');
    
    const settingsHTML = `
      <div class="pmide-settings">
        <div class="pmide-section">
          <h3>General Settings</h3>
          
          <div class="pmide-field">
            <label for="pocketMinePath">PocketMine Source Path</label>
            <div class="pmide-input-group">
              <input type="text" id="pocketMinePath" 
                     value="${this.settings.pocketMinePath || ''}" 
                     placeholder="Select PocketMine source directory" readonly>
              <button type="button" id="browsePocketMinePath" class="pmide-btn">Browse</button>
            </div>
            <small>Path to your PocketMine-MP source code directory</small>
          </div>
          
          <div class="pmide-field">
            <label class="pmide-checkbox">
              <input type="checkbox" id="autoIndex" ${this.settings.autoIndex ? 'checked' : ''}>
              <span class="checkmark"></span>
              Auto-index PHP files on startup
            </label>
            <small>Automatically index PHP files when the plugin loads</small>
          </div>
          
          <div class="pmide-field">
            <label class="pmide-checkbox">
              <input type="checkbox" id="showCompletionInfo" ${this.settings.showCompletionInfo ? 'checked' : ''}>
              <span class="checkmark"></span>
              Show completion information
            </label>
            <small>Display additional information in code completion popup</small>
          </div>
          
          <div class="pmide-field">
            <label for="maxCompletionItems">Max Completion Items</label>
            <input type="number" id="maxCompletionItems" 
                   value="${this.settings.maxCompletionItems}" min="10" max="200" step="10">
            <small>Maximum number of items to show in completion list</small>
          </div>
        </div>
        
        <div class="pmide-section">
          <h3>Actions</h3>
          <div class="pmide-actions">
            <button type="button" id="indexNow" class="pmide-btn pmide-btn-primary">
              <i class="icon refresh"></i>
              Index PHP Files Now
            </button>
            <button type="button" id="clearIndex" class="pmide-btn pmide-btn-warning">
              <i class="icon delete"></i>
              Clear Index
            </button>
          </div>
        </div>
        
        <div class="pmide-section">
          <h3>Status</h3>
          <div id="indexStatus" class="pmide-status">
            <span class="status-text">Index Status: ${this.indexer ? 'Ready' : 'Not initialized'}</span>
          </div>
        </div>
      </div>
      
      <style>
        .pmide-settings {
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 500px;
          color: var(--primary-text-color, #333);
        }
        
        .pmide-section {
          margin-bottom: 25px;
          padding: 15px;
          background: var(--secondary-color, #f8f9fa);
          border-radius: 8px;
          border: 1px solid var(--border-color, #dee2e6);
        }
        
        .pmide-section h3 {
          margin: 0 0 15px 0;
          color: var(--accent-color, #007acc);
          font-size: 16px;
          font-weight: 600;
        }
        
        .pmide-field {
          margin-bottom: 15px;
        }
        
        .pmide-field label {
          display: block;
          margin-bottom: 5px;
          font-weight: 500;
          color: var(--primary-text-color, #333);
        }
        
        .pmide-field input[type="text"],
        .pmide-field input[type="number"] {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border-color, #ccc);
          border-radius: 4px;
          font-size: 14px;
          box-sizing: border-box;
          background: var(--primary-color, #fff);
          color: var(--primary-text-color, #333);
        }
        
        .pmide-field input:focus {
          outline: none;
          border-color: var(--accent-color, #007acc);
          box-shadow: 0 0 0 2px rgba(0, 122, 204, 0.2);
        }
        
        .pmide-input-group {
          display: flex;
          gap: 8px;
        }
        
        .pmide-input-group input {
          flex: 1;
        }
        
        .pmide-checkbox {
          display: flex;
          align-items: center;
          cursor: pointer;
          position: relative;
          padding-left: 30px;
          margin-bottom: 0;
        }
        
        .pmide-checkbox input[type="checkbox"] {
          position: absolute;
          opacity: 0;
          cursor: pointer;
          width: 0;
          height: 0;
        }
        
        .checkmark {
          position: absolute;
          left: 0;
          height: 20px;
          width: 20px;
          background-color: var(--primary-color, #fff);
          border: 2px solid var(--border-color, #ccc);
          border-radius: 3px;
          transition: all 0.2s;
        }
        
        .pmide-checkbox input:checked ~ .checkmark {
          background-color: var(--accent-color, #007acc);
          border-color: var(--accent-color, #007acc);
        }
        
        .checkmark:after {
          content: "";
          position: absolute;
          display: none;
          left: 6px;
          top: 2px;
          width: 6px;
          height: 10px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }
        
        .pmide-checkbox input:checked ~ .checkmark:after {
          display: block;
        }
        
        .pmide-field small {
          display: block;
          margin-top: 4px;
          color: var(--secondary-text-color, #666);
          font-size: 12px;
        }
        
        .pmide-btn {
          padding: 8px 16px;
          border: 1px solid var(--accent-color, #007acc);
          border-radius: 4px;
          background: var(--accent-color, #007acc);
          color: white;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        
        .pmide-btn:hover {
          background: var(--accent-hover-color, #005a9e);
          border-color: var(--accent-hover-color, #005a9e);
          transform: translateY(-1px);
        }
        
        .pmide-btn-primary {
          background: var(--accent-color, #007acc);
          border-color: var(--accent-color, #007acc);
        }
        
        .pmide-btn-warning {
          background: #ffc107;
          border-color: #ffc107;
          color: #212529;
        }
        
        .pmide-btn-warning:hover {
          background: #e0a800;
          border-color: #e0a800;
        }
        
        .pmide-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        
        .pmide-status {
          padding: 12px;
          background: var(--primary-color, #fff);
          border-radius: 4px;
          border-left: 4px solid var(--accent-color, #007acc);
        }
        
        .status-text {
          font-weight: 500;
          color: var(--primary-text-color, #333);
        }
        
        @media (max-width: 480px) {
          .pmide-settings {
            padding: 15px;
          }
          
          .pmide-actions {
            flex-direction: column;
          }
          
          .pmide-input-group {
            flex-direction: column;
          }
        }
      </style>
    `;
    
    // Create dialog using DialogBox API
    this.settingsDialog = DialogBox(
      'PocketMine IDE Settings',  // Title
      settingsHTML,               // Content (HTML)
      'Save',                     // OK button text
      'Cancel'                    // Cancel button text
    );
    
    // Handle OK button click (Save settings)
    this.settingsDialog.ok(() => {
      this.saveSettingsFromDialog();
    });
    
    // Handle Cancel button click
    this.settingsDialog.cancel(() => {
      // Dialog will close automatically
    });
    
    // Handle dialog hide event
    this.settingsDialog.onhide(() => {
      this.settingsDialog = null;
    });
    
    // Handle clicks within the dialog content
    this.settingsDialog.onclick((e) => {
      this.handleDialogClick(e);
    });
    
    return this.settingsDialog;
  },
  
  /**
   * Handle clicks within the settings dialog
   */
  handleDialogClick(e) {
    const target = e.target;
    
    // Browse PocketMine path button
    if (target.id === 'browsePocketMinePath') {
      this.browsePocketMinePath();
    }
    
    // Index now button
    if (target.id === 'indexNow') {
      this.indexPhpFiles();
    }
    
    // Clear index button
    if (target.id === 'clearIndex') {
      this.clearIndex();
    }
  },
  
  /**
   * Browse for PocketMine path
   */
  async browsePocketMinePath() {
    try {
      const fileBrowser = acode.require('fileBrowser');
      const result = await fileBrowser('folder', 'Select PocketMine source directory');
      
      if (result && result.url) {
        // Update the input field
        const pathInput = document.querySelector('#pocketMinePath');
        if (pathInput) {
          pathInput.value = result.url;
        }
        this.showToast(`Selected: ${result.name}`);
      }
    } catch (error) {
      console.log('Folder selection cancelled');
    }
  },
  
  /**
   * Clear the PHP index
   */
  clearIndex() {
    const DialogBox = acode.require('dialogBox');
    
    const confirmDialog = DialogBox(
      'Confirm Clear Index',
      '<p>Are you sure you want to clear the PHP index?</p><p>This action cannot be undone.</p>',
      'Clear',
      'Cancel'
    );
    
    confirmDialog.ok(() => {
      this.indexer.clearIndex();
      this.updateIndexStatus('Index cleared');
      this.showToast('Index cleared successfully');
    });
  },
  
  /**
   * Save settings from dialog form
   */
  saveSettingsFromDialog() {
    try {
      // Get values from form inputs
      const pocketMinePath = document.querySelector('#pocketMinePath')?.value || null;
      const autoIndex = document.querySelector('#autoIndex')?.checked || false;
      const showCompletionInfo = document.querySelector('#showCompletionInfo')?.checked || false;
      const maxCompletionItems = parseInt(document.querySelector('#maxCompletionItems')?.value) || 50;
      
      // Update settings
      this.settings.pocketMinePath = pocketMinePath;
      this.settings.autoIndex = autoIndex;
      this.settings.showCompletionInfo = showCompletionInfo;
      this.settings.maxCompletionItems = maxCompletionItems;
      
      // Save to storage
      this.saveSettings();
      
      this.showToast('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showToast('Error saving settings');
    }
  },
  
  /**
   * Update index status display
   */
  updateIndexStatus(status) {
    const statusElement = document.querySelector('#indexStatus .status-text');
    if (statusElement) {
      statusElement.textContent = `Index Status: ${status}`;
    }
  },
  
  /**
   * Show toast message
   */
  showToast(message) {
    // Try to use acode.toast if available
    if (window.acode && acode.toast) {
      acode.toast(message);
    } else {
      // Fallback toast implementation
      const toast = document.createElement('div');
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #333;
        color: white;
        padding: 10px 20px;
        border-radius: 4px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (document.body.contains(toast)) {
          document.body.removeChild(toast);
        }
      }, 3000);
    }
  },
  
  /**
   * Show alert dialog
   */
  showAlert(title, message) {
    const DialogBox = acode.require('dialogBox');
    
    const alertDialog = DialogBox(
      title,
      `<p>${message}</p>`,
      'OK'
    );
    
    return alertDialog;
  },
  
  /**
   * Register commands
   */
  registerCommands() {
    // Command to open settings
    acode.registerCommand({
      name: 'pmide.openSettings',
      description: 'PocketMine IDE - Open Settings',
      exec: () => {
        this.createSettingsUI();
      }
    });
    
    // Command to manually index PHP files
    acode.registerCommand({
      name: 'pmide.indexPhpFiles',
      description: 'PocketMine IDE - Index PHP Files',
      exec: this.indexPhpFiles.bind(this)
    });
    
    // Command to clear index
    acode.registerCommand({
      name: 'pmide.clearIndex',
      description: 'PocketMine IDE - Clear Index',
      exec: () => {
        this.clearIndex();
      }
    });
  },
  
  /**
   * Register the completion provider for PHP files
   */
  registerCompletionProvider() {
    const editor = acode.editor;
    
    // Register completion provider for PHP files
    editor.session.completers = editor.session.completers || [];
    editor.session.completers.push({
      getCompletions: (editor, session, pos, prefix, callback) => {
        // Only provide completions for PHP files
        const filePath = acode.activeFile?.uri || '';
        if (!filePath.endsWith('.php')) {
          callback(null, []);
          return;
        }
        
        // Get the current line
        const line = session.getLine(pos.row);
        
        // Get completions from the indexer
        const completions = this.getCompletions(line, prefix, pos);
        
        // Limit completions based on settings
        const limitedCompletions = completions.slice(0, this.settings.maxCompletionItems);
        
        callback(null, limitedCompletions);
      }
    });
  },
  
  /**
   * Get completions based on the current context
   * @param {string} line Current line text
   * @param {string} prefix Current prefix
   * @param {object} pos Current position
   * @returns {Array} Array of completion items
   */
  getCompletions(line, prefix, pos) {
    if (!this.indexer) return [];
    
    // Check for different contexts
    const classMatch = /new\s+(\w+)(\\\w+)*/.exec(line);
    const useMatch = /use\s+(\w+)(\\\w+)*/.exec(line);
    const methodMatch = /->(\w+)/.exec(line);
    const staticMatch = /::(\w+)/.exec(line);
    
    if (classMatch) {
      // Class instantiation
      return this.indexer.getClassCompletions(prefix);
    } else if (useMatch) {
      // Use statement
      return this.indexer.getNamespaceCompletions(prefix);
    } else if (methodMatch) {
      // Method call
      return this.indexer.getMethodCompletions(prefix);
    } else if (staticMatch) {
      // Static method call
      return this.indexer.getStaticMethodCompletions(prefix);
    }
    
    // Default completions (classes, functions)
    return this.indexer.getDefaultCompletions(prefix);
  },
  
  /**
   * Index PHP files
   */
  async indexPhpFiles() {
    const pocketMinePath = this.settings.pocketMinePath;
    
    if (!pocketMinePath) {
      const alertDialog = this.showAlert(
        'PocketMine Path Not Set',
        'Please set the PocketMine path in the plugin settings first.'
      );
      
      alertDialog.ok(() => {
        this.createSettingsUI();
      });
      return;
    }
    
    this.updateIndexStatus('Indexing...');
    this.showToast('Indexing PHP files...');
    
    try {
      // Index the PHP files
      await this.indexer.indexPhpFiles(pocketMinePath);
      
      // Show success message
      this.updateIndexStatus('Indexed successfully');
      this.showToast('PHP files indexed successfully');
    } catch (error) {
      // Show error message
      this.updateIndexStatus('Index failed');
      this.showAlert('Error Indexing PHP Files', error.message);
    }
  },
  
  /**
   * Called when the plugin is unloaded
   */
  async destroy() {
    // Save settings before destroying
    await this.saveSettings();
    
    // Hide settings dialog if open
    if (this.settingsDialog) {
      this.settingsDialog.hide();
    }
    
    // Unregister commands
    acode.unregisterCommand('pmide.openSettings');
    acode.unregisterCommand('pmide.indexPhpFiles');
    acode.unregisterCommand('pmide.clearIndex');
  }
};

if (window.acode) {
  acode.setPluginInit(plugin.id, (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    if (!baseUrl.endsWith('/')) {
      baseUrl += '/';
    }
    
    pocketmineIde.baseUrl = baseUrl;
    pocketmineIde.init($page);
  });
  
  acode.setPluginUnmount(plugin.id, () => {
    pocketmineIde.destroy();
  });
}

export default pocketmineIde;
