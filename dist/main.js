// plugin.json
var plugin_default = {
  id: "pocketmine.ide",
  name: "PocketMine IDE",
  version: "0.1.0",
  description: "PHP code completion for PocketMine development",
  author: {
    name: "PocketMine IDE Team",
    email: "example@example.com",
    github: "https://github.com/example"
  },
  main: "dist/main.js",
  icon: "icon.png",
  readme: "readme.md",
  files: []
};

// src/phpIndexer.js
var PROPERTY_NORMAL = 0;
var PROPERTY_STATIC = 1;
var PROPERTY_CONST = 2;
var PhpIndexer = class {
  constructor() {
    this.phpFileUses = {};
    this.phpFileFunctions = {};
    this.phpFileStaticFunctions = {};
    this.phpFileProperties = {};
    this.done = {};
  }
  /**
   * Index PHP files in the given directory
   * @param {string} pocketMinePath Path to PocketMine source code
   */
  async indexPhpFiles(pocketMinePath) {
    this.phpFileUses = {};
    this.phpFileFunctions = {};
    this.phpFileStaticFunctions = {};
    this.phpFileProperties = {};
    try {
      const files = await this.findPhpFiles(pocketMinePath);
      for (const filePath of files) {
        await this.processPhpFile(filePath);
      }
      return true;
    } catch (error) {
      console.error("Error indexing PHP files:", error);
      throw error;
    }
  }
  /**
   * Find all PHP files in a directory recursively
   * @param {string} startPath Directory to search
   * @returns {Promise<string[]>} Array of file paths
   */
  async findPhpFiles(startPath) {
    try {
      const fileList = [];
      const scanDirectory = async (dirPath) => {
        const entries = await acode.fsOperation.lsDir(dirPath);
        for (const entry of entries) {
          const fullPath = `${dirPath}/${entry.name}`;
          if (entry.isDirectory) {
            await scanDirectory(fullPath);
          } else if (entry.name.endsWith(".php")) {
            fileList.push(fullPath);
          }
        }
      };
      await scanDirectory(startPath);
      return fileList;
    } catch (error) {
      console.error("Error finding PHP files:", error);
      throw error;
    }
  }
  /**
   * Process a PHP file to extract classes, functions, and properties
   * @param {string} filePath Path to the PHP file
   */
  async processPhpFile(filePath) {
    try {
      const content = await acode.fsOperation.readFile(filePath);
      const fileName = filePath.split("/").pop().replace(/\.php$/, "");
      const fileKey = this.normalizeFilePath(filePath);
      this.phpFileFunctions[fileKey] = {};
      this.phpFileStaticFunctions[fileKey] = {};
      this.phpFileUses[fileKey] = {};
      this.phpFileProperties[fileKey] = {};
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        this.parseFunction(line, fileKey);
        this.parseProperty(line, fileKey);
        this.parseUse(line, fileKey);
      }
    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }
  /**
   * Normalize a file path for use as a key
   * @param {string} filePath Path to normalize
   * @returns {string} Normalized path
   */
  normalizeFilePath(filePath) {
    return filePath.replace(/^.*?\/src\//, "").replace(/\\/g, "/");
  }
  /**
   * Parse a line for function definitions
   * @param {string} line Line to parse
   * @param {string} fileName File name for context
   */
  parseFunction(line, fileName) {
    try {
      const functionRegex = /function\s+(\w+)\s*\(/i;
      const match = functionRegex.exec(line);
      if (match) {
        const isStatic = /static\s+function/i.test(line);
        const functionModifiers = {
          "abstract": /abstract\s+/i.test(line),
          "public": /public\s+/i.test(line),
          "protected": /protected\s+/i.test(line),
          "private": /private\s+/i.test(line),
          "final": /final\s+/i.test(line),
          "static": isStatic
        };
        if (!functionModifiers.public && !functionModifiers.protected && !functionModifiers.private) {
          functionModifiers.public = true;
        }
        const functionName = match[1];
        const paramsMatch = line.match(/\((.*?)\)/);
        const params = [];
        if (paramsMatch && paramsMatch[1]) {
          const paramsList = paramsMatch[1].split(",");
          paramsList.forEach((param) => {
            const trimmedParam = param.trim();
            if (trimmedParam && trimmedParam.includes("$")) {
              const varName = trimmedParam.match(/\$(\w+)/);
              if (varName) {
                params.push([trimmedParam, varName[0], "", ""]);
              }
            }
          });
        }
        const comment = `Function ${functionName} in ${fileName}`;
        if (!isStatic) {
          this.phpFileFunctions[fileName][functionName] = {
            function: functionName,
            params,
            functionModifiers,
            comment
          };
        } else {
          this.phpFileStaticFunctions[fileName][functionName] = {
            function: functionName,
            params,
            functionModifiers,
            comment
          };
        }
      }
    } catch (error) {
      console.error("Error parsing function:", error);
    }
  }
  /**
   * Parse a line for namespace use statements
   * @param {string} line Line to parse
   * @param {string} fileName File name for context
   */
  parseUse(line, fileName) {
    try {
      const useRegex = /use\s+([\w\\]+)(?:\s+as\s+(\w+))?;/;
      const match = useRegex.exec(line);
      if (match) {
        const namespace = match[1];
        const alias = match[2] || namespace.split("\\").pop();
        this.phpFileUses[fileName][namespace] = alias;
      }
    } catch (error) {
      console.error("Error parsing use statement:", error);
    }
  }
  /**
   * Parse a line for property definitions
   * @param {string} line Line to parse
   * @param {string} fileName File name for context
   */
  parseProperty(line, fileName) {
    try {
      if (line.includes("$") && /^\s*(public|protected|private|static|const)\s+/.test(line)) {
        const isStatic = line.includes("static") && line.includes("$");
        const isConst = line.includes("const");
        let propertyName = "";
        if (isConst) {
          const constMatch = /const\s+(\w+)/i.exec(line);
          if (constMatch) {
            propertyName = constMatch[1];
          }
        } else {
          const propMatch = /\$(\w+)/i.exec(line);
          if (propMatch) {
            propertyName = propMatch[1];
          }
        }
        if (propertyName) {
          if (isStatic) {
            this.phpFileProperties[fileName][propertyName] = [propertyName, PROPERTY_STATIC];
          } else if (isConst) {
            this.phpFileProperties[fileName][propertyName] = [propertyName, PROPERTY_CONST];
          } else {
            this.phpFileProperties[fileName][propertyName] = [propertyName, PROPERTY_NORMAL];
          }
        }
      }
    } catch (error) {
      console.error("Error parsing property:", error);
    }
  }
  /**
   * Get class completions for new statements
   * @param {string} prefix Current prefix
   * @returns {Array} Array of completion items
   */
  getClassCompletions(prefix) {
    const completions = [];
    this.done = {};
    for (const fileName in this.phpFileFunctions) {
      const className = fileName;
      if (className.includes(prefix)) {
        const completion = {
          caption: className,
          value: className,
          meta: "class",
          score: 1e3
        };
        if (this.phpFileFunctions[fileName]["__construct"]) {
          const params = this.phpFileFunctions[fileName]["__construct"].params;
          const paramStrings = [];
          params.forEach(function(value) {
            if (value) {
              paramStrings.push("$" + value[1]);
            }
          });
          completion.snippet = className + "(" + paramStrings.join(", ") + ");";
        } else {
          completion.snippet = className + "();";
        }
        completions.push(completion);
      }
    }
    return completions;
  }
  /**
   * Get namespace completions for use statements
   * @param {string} prefix Current prefix
   * @returns {Array} Array of completion items
   */
  getNamespaceCompletions(prefix) {
    const completions = [];
    this.done = {};
    for (const fileName in this.phpFileFunctions) {
      const namespace = fileName;
      if (namespace.includes(prefix)) {
        const completion = {
          caption: namespace,
          value: namespace + ";",
          meta: "namespace",
          score: 1e3
        };
        completions.push(completion);
      }
    }
    return completions;
  }
  /**
   * Get method completions for -> statements
   * @param {string} prefix Current prefix
   * @returns {Array} Array of completion items
   */
  getMethodCompletions(prefix) {
    const completions = [];
    this.done = {};
    for (const fileName in this.phpFileFunctions) {
      for (const funcName in this.phpFileFunctions[fileName]) {
        const func = this.phpFileFunctions[fileName][funcName];
        if (func.function.startsWith(prefix) && func.functionModifiers.public) {
          if (this.done[func.function])
            continue;
          const params = func.params;
          const paramStrings = [];
          const paramDetails = [];
          params.forEach(function(value, key) {
            if (value) {
              paramStrings.push("$" + value[1]);
              let paramDetail = (typeof value[2] !== "undefined" ? value[2] + " " : "") + value[1];
              paramDetail += typeof value[3] !== "undefined" ? " = " + value[3] : "";
              paramDetails.push(paramDetail);
            }
          });
          const completion = {
            caption: func.function,
            value: func.function + "(" + paramStrings.join(", ") + ")",
            meta: "method",
            score: 1e3,
            docText: func.comment
          };
          completions.push(completion);
          this.done[func.function] = true;
        }
      }
      for (const propName in this.phpFileProperties[fileName]) {
        const prop = this.phpFileProperties[fileName][propName];
        if (prop[0].startsWith(prefix) && prop[1] === PROPERTY_NORMAL) {
          if (this.done[prop[0]])
            continue;
          const completion = {
            caption: prop[0],
            value: prop[0],
            meta: "property",
            score: 900
          };
          completions.push(completion);
          this.done[prop[0]] = true;
        }
      }
    }
    return completions;
  }
  /**
   * Get static method completions for :: statements
   * @param {string} prefix Current prefix
   * @returns {Array} Array of completion items
   */
  getStaticMethodCompletions(prefix) {
    const completions = [];
    this.done = {};
    for (const fileName in this.phpFileStaticFunctions) {
      for (const funcName in this.phpFileStaticFunctions[fileName]) {
        const func = this.phpFileStaticFunctions[fileName][funcName];
        if (func.function.startsWith(prefix)) {
          if (this.done[func.function])
            continue;
          const params = func.params;
          const paramStrings = [];
          const paramDetails = [];
          params.forEach(function(value, key) {
            if (value) {
              paramStrings.push("$" + value[1]);
              let paramDetail = (typeof value[2] !== "undefined" ? value[2] + " " : "") + value[1];
              paramDetail += typeof value[3] !== "undefined" ? " = " + value[3] : "";
              paramDetails.push(paramDetail);
            }
          });
          const completion = {
            caption: func.function,
            value: func.function + "(" + paramStrings.join(", ") + ")",
            meta: "static method",
            score: 1e3,
            docText: func.comment
          };
          completions.push(completion);
          this.done[func.function] = true;
        }
      }
      for (const propName in this.phpFileProperties[fileName]) {
        const prop = this.phpFileProperties[fileName][propName];
        if (prop[0].startsWith(prefix) && (prop[1] === PROPERTY_STATIC || prop[1] === PROPERTY_CONST)) {
          if (this.done[prop[0]])
            continue;
          const completion = {
            caption: prop[0],
            value: prop[1] === PROPERTY_STATIC ? "$" + prop[0] : prop[0],
            meta: prop[1] === PROPERTY_STATIC ? "static property" : "constant",
            score: 900
          };
          completions.push(completion);
          this.done[prop[0]] = true;
        }
      }
    }
    return completions;
  }
  /**
   * Get default completions (classes, functions)
   * @param {string} prefix Current prefix
   * @returns {Array} Array of completion items
   */
  getDefaultCompletions(prefix) {
    const classCompletions = this.getClassCompletions(prefix);
    return classCompletions;
  }
};

// src/main.js
var pocketmineIde = {
  id: plugin_default.id,
  name: plugin_default.name,
  version: plugin_default.version,
  description: plugin_default.description,
  /**
   * Settings for the plugin
   */
  settings: {
    pocketMinePath: null
  },
  /**
   * PHP file indexer
   */
  indexer: null,
  /**
   * Called when the plugin is loaded
   * @param {HTMLElement} $page 
   */
  async init($page) {
    acode.addSettingsPage(this.id, {
      settings: [
        {
          key: "pocketMinePath",
          text: "PocketMine Path",
          info: "Path to PocketMine source code",
          type: "file",
          openDirectory: true
        }
      ]
    });
    this.indexer = new PhpIndexer();
    this.registerCompletionProvider();
    acode.registerCommand({
      name: "pmide.indexPhpFiles",
      description: "PocketMine IDE - Index PHP Files",
      exec: this.indexPhpFiles.bind(this)
    });
  },
  /**
   * Register the completion provider for PHP files
   */
  registerCompletionProvider() {
    const editor = acode.editor;
    editor.session.completers = editor.session.completers || [];
    editor.session.completers.push({
      getCompletions: (editor2, session, pos, prefix, callback) => {
        const filePath = acode.activeFile?.uri || "";
        if (!filePath.endsWith(".php")) {
          callback(null, []);
          return;
        }
        const line = session.getLine(pos.row);
        const completions = this.getCompletions(line, prefix, pos);
        callback(null, completions);
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
    const completions = [];
    const classMatch = /new\\s+(\\\\)?(\\w+)(\\\\\\w+)*/.exec(line);
    const useMatch = /use\\s+(\\w+)(\\\\\\w+)*/.exec(line);
    const methodMatch = /->(\\w+)/.exec(line);
    const staticMatch = /::(\\w+)/.exec(line);
    if (classMatch) {
      return this.indexer.getClassCompletions(prefix);
    } else if (useMatch) {
      return this.indexer.getNamespaceCompletions(prefix);
    } else if (methodMatch) {
      return this.indexer.getMethodCompletions(prefix);
    } else if (staticMatch) {
      return this.indexer.getStaticMethodCompletions(prefix);
    }
    return this.indexer.getDefaultCompletions(prefix);
  },
  /**
   * Index PHP files
   */
  async indexPhpFiles() {
    const pocketMinePath = this.settings.pocketMinePath;
    if (!pocketMinePath) {
      acode.alert("PocketMine Path not set", "Please set the PocketMine path in the plugin settings.");
      return;
    }
    acode.loader.show("Indexing PHP files...");
    try {
      await this.indexer.indexPhpFiles(pocketMinePath);
      acode.toast.show("PHP files indexed successfully");
    } catch (error) {
      acode.alert("Error indexing PHP files", error.message);
    } finally {
      acode.loader.hide();
    }
  },
  /**
   * Called when the plugin is unloaded
   */
  async destroy() {
    acode.removeSettingsPage(this.id);
    acode.unregisterCommand("pmide.indexPhpFiles");
  }
};
if (window.acode) {
  acode.setPluginInit(plugin_default.id, (baseUrl, $page, { cacheFileUrl, cacheFile }) => {
    if (!baseUrl.endsWith("/")) {
      baseUrl += "/";
    }
    pocketmineIde.baseUrl = baseUrl;
    pocketmineIde.init($page);
  });
  acode.setPluginUnmount(plugin_default.id, () => {
    pocketmineIde.destroy();
  });
}
