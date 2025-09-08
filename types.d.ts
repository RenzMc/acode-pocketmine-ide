/**
 * Type definitions for PocketMine IDE Acode plugin
 */

declare global {
  interface Window {
    acode: AcodeAPI;
  }
}

/**
 * Acode API interface
 */
interface AcodeAPI {
  /**
   * Set plugin initialization function
   */
  setPluginInit: (id: string, initFunction: (baseUrl: string, $page: HTMLElement, options: any) => void) => void;
  
  /**
   * Set plugin unmount function
   */
  setPluginUnmount: (id: string, unmountFunction: () => void) => void;
  
  /**
   * Add settings page
   */
  addSettingsPage: (id: string, options: SettingsPageOptions) => void;
  
  /**
   * Remove settings page
   */
  removeSettingsPage: (id: string) => void;
  
  /**
   * Register command
   */
  registerCommand: (command: Command) => void;
  
  /**
   * Unregister command
   */
  unregisterCommand: (name: string) => void;
  
  /**
   * Show alert dialog
   */
  alert: (title: string, message: string) => void;
  
  /**
   * Show toast message
   */
  toast: {
    show: (message: string) => void;
  };
  
  /**
   * Show/hide loader
   */
  loader: {
    show: (message: string) => void;
    hide: () => void;
  };
  
  /**
   * Editor instance
   */
  editor: any;
  
  /**
   * Active file
   */
  activeFile: {
    uri: string;
  } | null;
  
  /**
   * File system operations
   */
  fsOperation: {
    /**
     * List directory contents
     */
    lsDir: (path: string) => Promise<FileEntry[]>;
    
    /**
     * Read file content
     */
    readFile: (path: string) => Promise<string>;
  };
}

/**
 * Settings page options
 */
interface SettingsPageOptions {
  /**
   * Settings items
   */
  settings: SettingsItem[];
}

/**
 * Settings item
 */
interface SettingsItem {
  /**
   * Setting key
   */
  key: string;
  
  /**
   * Setting display text
   */
  text: string;
  
  /**
   * Setting info text
   */
  info?: string;
  
  /**
   * Setting type
   */
  type: 'text' | 'number' | 'checkbox' | 'file';
  
  /**
   * Whether to open directory picker (for file type)
   */
  openDirectory?: boolean;
}

/**
 * Command definition
 */
interface Command {
  /**
   * Command name
   */
  name: string;
  
  /**
   * Command description
   */
  description: string;
  
  /**
   * Command execution function
   */
  exec: () => void;
}

/**
 * File entry
 */
interface FileEntry {
  /**
   * File/directory name
   */
  name: string;
  
  /**
   * Whether the entry is a directory
   */
  isDirectory: boolean;
}

/**
 * Plugin object
 */
export interface PluginObject {
  /**
   * Plugin ID
   */
  id: string;
  
  /**
   * Plugin name
   */
  name: string;
  
  /**
   * Plugin version
   */
  version: string;
  
  /**
   * Plugin description
   */
  description: string;
  
  /**
   * Plugin settings
   */
  settings: {
    [key: string]: any;
  };
  
  /**
   * Base URL for plugin resources
   */
  baseUrl?: string;
  
  /**
   * Initialize the plugin
   */
  init: ($page: HTMLElement) => Promise<void>;
  
  /**
   * Destroy the plugin
   */
  destroy: () => Promise<void>;
}