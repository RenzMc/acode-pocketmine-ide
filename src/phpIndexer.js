/**
 * Advanced PHP Indexer for PocketMine IDE
 * Uses tokenizer approach for robust PHP parsing
 */

// Constants for property types
const PROPERTY_NORMAL = 0;
const PROPERTY_STATIC = 1;
const PROPERTY_CONST = 2;

// Token types for PHP parsing
const TOKEN_TYPES = {
  T_OPEN_TAG: 'T_OPEN_TAG',
  T_NAMESPACE: 'T_NAMESPACE',
  T_USE: 'T_USE',
  T_CLASS: 'T_CLASS',
  T_INTERFACE: 'T_INTERFACE',
  T_TRAIT: 'T_TRAIT',
  T_FUNCTION: 'T_FUNCTION',
  T_VARIABLE: 'T_VARIABLE',
  T_CONST: 'T_CONST',
  T_PUBLIC: 'T_PUBLIC',
  T_PROTECTED: 'T_PROTECTED',
  T_PRIVATE: 'T_PRIVATE',
  T_STATIC: 'T_STATIC',
  T_ABSTRACT: 'T_ABSTRACT',
  T_FINAL: 'T_FINAL',
  T_EXTENDS: 'T_EXTENDS',
  T_IMPLEMENTS: 'T_IMPLEMENTS',
  T_STRING: 'T_STRING',
  T_WHITESPACE: 'T_WHITESPACE',
  T_COMMENT: 'T_COMMENT',
  T_DOC_COMMENT: 'T_DOC_COMMENT'
};

export class PhpIndexer {
  constructor() {
    // Initialize data structures
    this.classes = new Map();           // Class definitions
    this.interfaces = new Map();        // Interface definitions
    this.traits = new Map();           // Trait definitions
    this.functions = new Map();         // Global functions
    this.namespaces = new Map();        // Namespace mappings
    this.uses = new Map();             // Use statements per file
    this.fileIndex = new Map();        // File-based index
    this.done = new Set();             // Cache for completions

    // Parsing state
    this.currentFile = null;
    this.currentNamespace = '';
    this.currentClass = null;
    this.currentFunction = null;
    this.lastDocComment = null;

    // Progress tracking
    this.totalFiles = 0;
    this.processedFiles = 0;
    this.onProgress = null;
  }

  /**
   * Set progress callback
   * @param {Function} callback Progress callback function
   */
  setProgressCallback(callback) {
    this.onProgress = callback;
  }

  /**
   * Index PHP files in the given directory
   * @param {string} pocketMinePath Path to PocketMine source code
   */
  async indexPhpFiles(pocketMinePath) {
    // Clear existing data
    this.clearIndex();

    try {
      // Get all PHP files in the directory
      const files = await this.findPhpFiles(pocketMinePath);
      this.totalFiles = files.length;
      this.processedFiles = 0;

      // Process files in batches to avoid blocking UI
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);

        // Process batch
        await Promise.all(batch.map(filePath => this.processPhpFile(filePath)));

        // Update progress
        this.processedFiles = Math.min(i + batchSize, files.length);
        if (this.onProgress) {
          this.onProgress(this.processedFiles, this.totalFiles);
        }

        // Yield control to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 1));
      }

      // Post-process: resolve inheritance and build completion cache
      this.postProcessIndex();

      return true;
    } catch (error) {
      console.error('Error indexing PHP files:', error);
      throw error;
    }
  }

  /**
   * Clear all indexed data
   */
  clearIndex() {
    this.classes.clear();
    this.interfaces.clear();
    this.traits.clear();
    this.functions.clear();
    this.namespaces.clear();
    this.uses.clear();
    this.fileIndex.clear();
    this.done.clear();
  }

  /**
   * Find all PHP files in a directory recursively
   * @param {string} startPath Directory to search
   * @returns {Promise<string[]>} Array of file paths
   */
  async findPhpFiles(startPath) {
    try {
      const fileList = [];
      const visited = new Set(); // Prevent infinite loops with symlinks

      const scanDirectory = async (dirPath) => {
        // Prevent infinite recursion
        if (visited.has(dirPath)) return;
        visited.add(dirPath);

        try {
          const entries = await acode.fsOperation.lsDir(dirPath);

          for (const entry of entries) {
            const fullPath = `${dirPath}/${entry.name}`;

            if (entry.isDirectory) {
              // Skip common directories that don't contain source code
              if (!this.shouldSkipDirectory(entry.name)) {
                await scanDirectory(fullPath);
              }
            } else if (entry.name.endsWith('.php')) {
              fileList.push(fullPath);
            }
          }
        } catch (error) {
          // Skip directories we can't read
          console.warn(`Cannot read directory ${dirPath}:`, error.message);
        }
      };

      await scanDirectory(startPath);
      return fileList;
    } catch (error) {
      console.error('Error finding PHP files:', error);
      throw error;
    }
  }

  /**
   * Check if a directory should be skipped
   * @param {string} dirName Directory name
   * @returns {boolean} True if should skip
   */
  shouldSkipDirectory(dirName) {
    const skipDirs = [
      'node_modules', '.git', '.svn', '.hg',
      'vendor', 'cache', 'tmp', 'temp',
      'logs', 'log', 'build', 'dist',
      '.idea', '.vscode', '__pycache__'
    ];
    return skipDirs.includes(dirName) || dirName.startsWith('.');
  }

  /**
   * Process a PHP file using advanced tokenizer
   * @param {string} filePath Path to the PHP file
   */
  async processPhpFile(filePath) {
    try {
      // Read the file content
      const content = await acode.fsOperation.readFile(filePath);

      // Initialize file context
      this.currentFile = filePath;
      this.currentNamespace = '';
      this.currentClass = null;
      this.currentFunction = null;

      // Initialize file index
      const fileKey = this.normalizeFilePath(filePath);
      this.fileIndex.set(fileKey, {
        path: filePath,
        namespace: '',
        uses: new Map(),
        classes: new Map(),
        functions: new Map(),
        lastModified: Date.now()
      });

      // Tokenize and parse the content
      const tokens = this.tokenize(content);
      await this.parseTokens(tokens, fileKey);

    } catch (error) {
      console.error(`Error processing file ${filePath}:`, error);
    }
  }

  /**
   * Advanced PHP tokenizer
   * @param {string} content PHP file content
   * @returns {Array} Array of tokens
   */
  tokenize(content) {
    const tokens = [];
    let i = 0;
    let line = 1;
    let column = 1;

    // Remove BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    while (i < content.length) {
      const char = content[i];

      // Track line and column
      if (char === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }

      // Skip whitespace (but track it for context)
      if (/\s/.test(char)) {
        i++;
        continue;
      }

      // PHP opening tag
      if (content.substr(i, 5) === '<?php') {
        tokens.push({
          type: TOKEN_TYPES.T_OPEN_TAG,
          value: '<?php',
          line,
          column
        });
        i += 5;
        continue;
      }

      // Single line comments
      if (content.substr(i, 2) === '//' || content.substr(i, 1) === '#') {
        const start = i;
        while (i < content.length && content[i] !== '\n') {
          i++;
        }
        tokens.push({
          type: TOKEN_TYPES.T_COMMENT,
          value: content.substring(start, i),
          line,
          column
        });
        continue;
      }

      // Multi-line comments and PHPDoc
      if (content.substr(i, 2) === '/*') {
        const start = i;
        const isDocComment = content.substr(i, 3) === '/**';
        i += 2;

        while (i < content.length - 1) {
          if (content.substr(i, 2) === '*/') {
            i += 2;
            break;
          }
          if (content[i] === '\n') {
            line++;
            column = 1;
          }
          i++;
        }

        tokens.push({
          type: isDocComment ? TOKEN_TYPES.T_DOC_COMMENT : TOKEN_TYPES.T_COMMENT,
          value: content.substring(start, i),
          line,
          column
        });
        continue;
      }

      // Strings (single and double quoted)
      if (char === '"' || char === "'") {
        const quote = char;
        const start = i;
        i++; // Skip opening quote

        while (i < content.length) {
          if (content[i] === quote && content[i - 1] !== '\\') {
            i++; // Include closing quote
            break;
          }
          i++;
        }

        tokens.push({
          type: TOKEN_TYPES.T_STRING,
          value: content.substring(start, i),
          line,
          column
        });
        continue;
      }

      // Variables
      if (char === '$') {
        const start = i;
        i++; // Skip $

        // Variable name
        while (i < content.length && /[a-zA-Z0-9_]/.test(content[i])) {
          i++;
        }

        tokens.push({
          type: TOKEN_TYPES.T_VARIABLE,
          value: content.substring(start, i),
          line,
          column
        });
        continue;
      }

      // Keywords and identifiers
      if (/[a-zA-Z_]/.test(char)) {
        const start = i;

        // Read the identifier
        while (i < content.length && /[a-zA-Z0-9_\\]/.test(content[i])) {
          i++;
        }

        const value = content.substring(start, i);
        const lowerValue = value.toLowerCase();

        // Determine token type based on keyword
        let type = TOKEN_TYPES.T_STRING;

        switch (lowerValue) {
          case 'namespace': type = TOKEN_TYPES.T_NAMESPACE; break;
          case 'use': type = TOKEN_TYPES.T_USE; break;
          case 'class': type = TOKEN_TYPES.T_CLASS; break;
          case 'interface': type = TOKEN_TYPES.T_INTERFACE; break;
          case 'trait': type = TOKEN_TYPES.T_TRAIT; break;
          case 'function': type = TOKEN_TYPES.T_FUNCTION; break;
          case 'const': type = TOKEN_TYPES.T_CONST; break;
          case 'public': type = TOKEN_TYPES.T_PUBLIC; break;
          case 'protected': type = TOKEN_TYPES.T_PROTECTED; break;
          case 'private': type = TOKEN_TYPES.T_PRIVATE; break;
          case 'static': type = TOKEN_TYPES.T_STATIC; break;
          case 'abstract': type = TOKEN_TYPES.T_ABSTRACT; break;
          case 'final': type = TOKEN_TYPES.T_FINAL; break;
          case 'extends': type = TOKEN_TYPES.T_EXTENDS; break;
          case 'implements': type = TOKEN_TYPES.T_IMPLEMENTS; break;
        }

        tokens.push({
          type,
          value,
          line,
          column
        });
        continue;
      }

      // Single character tokens
      tokens.push({
        type: 'CHAR',
        value: char,
        line,
        column
      });
      i++;
    }

    return tokens;
  }

  /**
   * Parse tokens to extract PHP structures
   * @param {Array} tokens Array of tokens
   * @param {string} fileKey File key for indexing
   */
  async parseTokens(tokens, fileKey) {
    let i = 0;
    const fileData = this.fileIndex.get(fileKey);

    while (i < tokens.length) {
      const token = tokens[i];

      switch (token.type) {
        case TOKEN_TYPES.T_NAMESPACE:
          i = this.parseNamespace(tokens, i, fileData);
          break;

        case TOKEN_TYPES.T_USE:
          i = this.parseUse(tokens, i, fileData);
          break;

        case TOKEN_TYPES.T_CLASS:
        case TOKEN_TYPES.T_INTERFACE:
        case TOKEN_TYPES.T_TRAIT:
          i = this.parseClass(tokens, i, fileData);
          break;

        case TOKEN_TYPES.T_FUNCTION:
          i = this.parseFunction(tokens, i, fileData);
          break;

        case TOKEN_TYPES.T_DOC_COMMENT:
          // Store for next declaration
          this.lastDocComment = this.parseDocComment(token.value);
          i++;
          break;

        default:
          i++;
      }
    }
  }

  /**
   * Parse namespace declaration
   * @param {Array} tokens Token array
   * @param {number} start Start index
   * @param {Object} fileData File data object
   * @returns {number} Next index
   */
  parseNamespace(tokens, start, fileData) {
    let i = start + 1;

    // Skip whitespace and find namespace name
    while (i < tokens.length && tokens[i].type === TOKEN_TYPES.T_WHITESPACE) {
      i++;
    }

    // Build namespace name
    let namespaceName = '';
    while (i < tokens.length &&
      (tokens[i].type === TOKEN_TYPES.T_STRING || tokens[i].value === '\\')) {
      namespaceName += tokens[i].value;
      i++;
    }

    if (namespaceName) {
      this.currentNamespace = namespaceName;
      fileData.namespace = namespaceName;

      // Register namespace
      if (!this.namespaces.has(namespaceName)) {
        this.namespaces.set(namespaceName, new Set());
      }
    }

    return i;
  }

  /**
   * Parse use statement
   * @param {Array} tokens Token array
   * @param {number} start Start index
   * @param {Object} fileData File data object
   * @returns {number} Next index
   */
  parseUse(tokens, start, fileData) {
    let i = start + 1;

    // Skip whitespace
    while (i < tokens.length && tokens[i].type === TOKEN_TYPES.T_WHITESPACE) {
      i++;
    }

    // Build use statement
    let useName = '';
    let alias = '';
    let inAlias = false;

    while (i < tokens.length && tokens[i].value !== ';') {
      if (tokens[i].value.toLowerCase() === 'as') {
        inAlias = true;
        i++;
        continue;
      }

      if (tokens[i].type === TOKEN_TYPES.T_STRING || tokens[i].value === '\\') {
        if (inAlias) {
          alias += tokens[i].value;
        } else {
          useName += tokens[i].value;
        }
      }
      i++;
    }

    if (useName) {
      const finalAlias = alias || useName.split('\\').pop();
      fileData.uses.set(finalAlias, useName);
    }

    return i;
  }

  /**
   * Parse class/interface/trait declaration
   * @param {Array} tokens Token array
   * @param {number} start Start index
   * @param {Object} fileData File data object
   * @returns {number} Next index
   */
  parseClass(tokens, start, fileData) {
  const classType = tokens[start].value.toLowerCase();
  let i = start + 1;

  // Parse modifiers (abstract, final)
  const modifiers = new Set();
  let j = start - 1;
  while (j >= 0 && tokens[j].type !== 'CHAR') {
    if (tokens[j].type === TOKEN_TYPES.T_ABSTRACT) modifiers.add('abstract');
    if (tokens[j].type === TOKEN_TYPES.T_FINAL) modifiers.add('final');
    j--;
  }

  // Skip ignorable tokens to class name
  while (i < tokens.length && (tokens[i].type === TOKEN_TYPES.T_WHITESPACE || tokens[i].type === TOKEN_TYPES.T_COMMENT || tokens[i].type === TOKEN_TYPES.T_DOC_COMMENT)) i++;

  if (i >= tokens.length || tokens[i].type !== TOKEN_TYPES.T_STRING) {
    return i;
  }

  const className = tokens[i].value;
  i++;

  // Parse extends & implements (simple)
  const extendsClass = [];
  const implementsInterfaces = [];
  while (i < tokens.length && tokens[i].value !== '{') {
    if (tokens[i].type === TOKEN_TYPES.T_EXTENDS) {
      i++;
      while (i < tokens.length && tokens[i].type === TOKEN_TYPES.T_WHITESPACE) i++;
      if (i < tokens.length && tokens[i].type === TOKEN_TYPES.T_STRING) {
        extendsClass.push(tokens[i].value);
        i++;
      }
    } else if (tokens[i].type === TOKEN_TYPES.T_IMPLEMENTS) {
      i++;
      while (i < tokens.length && tokens[i].value !== '{') {
        if (tokens[i].type === TOKEN_TYPES.T_STRING) {
          implementsInterfaces.push(tokens[i].value);
        }
        i++;
      }
    } else {
      i++;
    }
  }

  // Build class data
  const fullClassName = this.currentNamespace ? `${this.currentNamespace}\\${className}` : className;
  const classDefinition = {
    name: className,
    fullName: fullClassName,
    namespace: this.currentNamespace,
    type: classType,
    modifiers,
    extends: extendsClass,
    implements: implementsInterfaces,
    methods: new Map(),
    properties: new Map(),
    constants: new Map(),
    file: this.currentFile,
    docComment: this.lastDocComment || null,
    line: tokens[start].line
  };

  this.classes.set(fullClassName, classDefinition);
  fileData.classes.set(className, classDefinition);
  this.currentClass = classDefinition;
  if (this.currentNamespace && this.namespaces.has(this.currentNamespace)) {
    this.namespaces.get(this.currentNamespace).add(fullClassName);
  }
  this.lastDocComment = null;

  // jika tidak ada '{' tidak lanjut
  if (i >= tokens.length || tokens[i].value !== '{') return i;

  // Scan class body until matching '}' (handle nested braces)
  let braceDepth = 0;
  // step to first '{'
  while (i < tokens.length && tokens[i].value !== '{') i++;
  if (i < tokens.length && tokens[i].value === '{') { braceDepth = 1; i++; }

  while (i < tokens.length && braceDepth > 0) {
    const tk = tokens[i];

    // adjust brace depth
    if (tk.value === '{') { braceDepth++; i++; continue; }
    if (tk.value === '}') { braceDepth--; i++; continue; }

    // doc comments: store for next member
    if (tk.type === TOKEN_TYPES.T_DOC_COMMENT) {
      this.lastDocComment = this.parseDocComment(tk.value);
      i++;
      continue;
    }

    // If next token indicates function (method)
    if (tk.type === TOKEN_TYPES.T_FUNCTION) {
      i = this.parseFunction(tokens, i, fileData);
      continue;
    }

    // If token suggests property/const visibility/static -> parse property/const
    if (tk.type === TOKEN_TYPES.T_PUBLIC ||
        tk.type === TOKEN_TYPES.T_PROTECTED ||
        tk.type === TOKEN_TYPES.T_PRIVATE ||
        tk.type === TOKEN_TYPES.T_STATIC ||
        tk.type === TOKEN_TYPES.T_CONST) {
      i = this.parseProperty(tokens, i, fileData);
      continue;
    }

    // otherwise advance
    i++;
  }

  // setelah selesai tubuh kelas, clear currentClass
  this.currentClass = null;
  return i;
}

  parseProperty(tokens, start, fileData) {
  let i = start;
  const modifiers = new Set();

  // collect modifiers that may appear before property/const
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === TOKEN_TYPES.T_PUBLIC) { modifiers.add('public'); i++; continue; }
    if (t.type === TOKEN_TYPES.T_PROTECTED) { modifiers.add('protected'); i++; continue; }
    if (t.type === TOKEN_TYPES.T_PRIVATE) { modifiers.add('private'); i++; continue; }
    if (t.type === TOKEN_TYPES.T_STATIC) { modifiers.add('static'); i++; continue; }
    if (t.type === TOKEN_TYPES.T_CONST) { modifiers.add('const'); i++; break; }
    // ignore whitespace/comments
    if (t.type === TOKEN_TYPES.T_WHITESPACE || t.type === TOKEN_TYPES.T_COMMENT || t.type === TOKEN_TYPES.T_DOC_COMMENT || (t.type === 'CHAR' && /\s/.test(t.value))) {
      i++; continue;
    }
    break;
  }

  // default visibility public if not set and not const
  if (!modifiers.has('public') && !modifiers.has('protected') && !modifiers.has('private') && !modifiers.has('const')) {
    modifiers.add('public');
  }

  // If it's a const declaration (class constant)
  if (modifiers.has('const')) {
    // expect CONST NAME = value ;
    // skip whitespace
    while (i < tokens.length && (tokens[i].type === TOKEN_TYPES.T_WHITESPACE || tokens[i].type === TOKEN_TYPES.T_COMMENT)) i++;
    if (i < tokens.length && tokens[i].type === TOKEN_TYPES.T_STRING) {
      const constName = tokens[i].value;
      i++;
      // skip until '='
      while (i < tokens.length && tokens[i].value !== '=') i++;
      if (i < tokens.length && tokens[i].value === '=') i++;
      // collect value tokens until ';'
      let val = '';
      while (i < tokens.length && tokens[i].value !== ';') { val += tokens[i].value; i++; }
      if (i < tokens.length && tokens[i].value === ';') i++;
      // store constant
      if (this.currentClass) {
        this.currentClass.constants.set(constName, {
          name: constName,
          value: val.trim(),
          modifiers,
          file: this.currentFile,
          line: tokens[start].line,
          docComment: this.lastDocComment || null
        });
      }
      this.lastDocComment = null;
      return i;
    }
    // fallback
  }

  // Otherwise parse one or more variables: $a, $b = 1;
  while (i < tokens.length) {
    // skip ignorable
    while (i < tokens.length && (tokens[i].type === TOKEN_TYPES.T_WHITESPACE || tokens[i].type === TOKEN_TYPES.T_COMMENT)) i++;

    if (i < tokens.length && tokens[i].type === TOKEN_TYPES.T_VARIABLE) {
      const varToken = tokens[i];
      const propName = varToken.value.replace(/^\$/, '');
      i++;

      // check default value
      let defaultValue = null;
      while (i < tokens.length && (tokens[i].type === TOKEN_TYPES.T_WHITESPACE || tokens[i].type === TOKEN_TYPES.T_COMMENT)) i++;
      if (i < tokens.length && tokens[i].value === '=') {
        i++;
        let val = '';
        // collect until comma or semicolon
        while (i < tokens.length && tokens[i].value !== ',' && tokens[i].value !== ';') {
          val += tokens[i].value;
          i++;
        }
        defaultValue = val.trim() || null;
      }

      // store property in current class
      if (this.currentClass) {
        this.currentClass.properties.set(propName, {
          name: propName,
          modifiers,
          defaultValue,
          file: this.currentFile,
          line: varToken.line,
          docComment: this.lastDocComment || null
        });
      }

      // if comma, continue to next variable
      if (i < tokens.length && tokens[i].value === ',') {
        i++; // consume comma and loop for next var
        continue;
      }

      // if semicolon, finish declaration
      if (i < tokens.length && tokens[i].value === ';') {
        i++; // consume ;
        break;
      }
    } else {
      // Not a variable, skip until semicolon to avoid infinite loop
      while (i < tokens.length && tokens[i].value !== ';') i++;
      if (i < tokens.length && tokens[i].value === ';') i++;
      break;
    }
  }

  // clear doc comment after processing member
  this.lastDocComment = null;
  return i;
}

  /**
   * Parse function declarationthis.classes
   * @param {Array} tokens Token array
   * @param {number} start Start index
   * @param {Object} fileData File data object
   * @returns {number} Next index
   */
  parseFunction(tokens, start, fileData) {
  let i = start + 1;

  const isIgnorable = (tk) => {
    if (!tk) return true;
    if (tk.type === TOKEN_TYPES.T_WHITESPACE) return true;
    if (tk.type === TOKEN_TYPES.T_COMMENT) return true;
    if (tk.type === TOKEN_TYPES.T_DOC_COMMENT) return true;
    if (tk.type === 'CHAR' && /\s/.test(tk.value)) return true;
    return false;
  };

  // Parse modifiers (mundur sebelum function)
  const modifiers = new Set();
  let j = start - 1;
  while (j >= 0 && tokens[j].type !== 'CHAR') {
    const tokenType = tokens[j].type;
    if (tokenType === TOKEN_TYPES.T_PUBLIC) modifiers.add('public');
    if (tokenType === TOKEN_TYPES.T_PROTECTED) modifiers.add('protected');
    if (tokenType === TOKEN_TYPES.T_PRIVATE) modifiers.add('private');
    if (tokenType === TOKEN_TYPES.T_STATIC) modifiers.add('static');
    if (tokenType === TOKEN_TYPES.T_ABSTRACT) modifiers.add('abstract');
    if (tokenType === TOKEN_TYPES.T_FINAL) modifiers.add('final');
    j--;
  }

  if (!modifiers.has('public') && !modifiers.has('protected') && !modifiers.has('private')) {
    modifiers.add('public');
  }

  // Skip ignorable tokens lalu cari nama function
  while (i < tokens.length && isIgnorable(tokens[i])) i++;

  // Jika tidak ada nama (anonymous closure), skip sampai kita melewati param list & body start
  if (i >= tokens.length || tokens[i].type !== TOKEN_TYPES.T_STRING) {
    // Skip anonymous closure: cari '(' yang start parameter, lalu matching ')' dan '{' (jika ada)
    while (i < tokens.length && tokens[i].value !== '(') i++;
    if (i >= tokens.length) return i + 1;
    // matching parenthesis
    let depth = 0;
    while (i < tokens.length) {
      if (tokens[i].value === '(') depth++;
      if (tokens[i].value === ')') {
        depth--;
        if (depth === 0) { i++; break; }
      }
      i++;
    }
    // skip possible "use(...)" or whitespace until '{' or ';'
    while (i < tokens.length && tokens[i].value !== '{' && tokens[i].value !== ';') i++;
    return i + 1;
  }

  const functionName = tokens[i].value;
  i++;

  // --- Parse parameter list ---
  const parameters = [];
  let inParams = false;
  let paramDepth = 0;
  let currentParam = '';

  while (i < tokens.length) {
    const token = tokens[i];
    if (token.value === '(') {
      inParams = true;
      paramDepth++;
      currentParam += token.value;
    } else if (token.value === ')') {
      paramDepth--;
      if (paramDepth === 0) {
        if (currentParam.trim()) {
          const trimmed = currentParam.replace(/^\(+/, '').replace(/\)+$/, '').trim();
          if (trimmed) parameters.push(this.parseParameter(trimmed));
        }
        currentParam = '';
        i++;
        break;
      } else {
        currentParam += token.value;
      }
    } else if (inParams && token.value === ',' && paramDepth === 1) {
      if (currentParam.trim()) parameters.push(this.parseParameter(currentParam.trim()));
      currentParam = '';
      i++;
      continue;
    } else if (inParams) {
      currentParam += token.value;
    }
    i++;
  }

  // --- Parse return type ---
  let returnType = null;
  while (i < tokens.length && isIgnorable(tokens[i])) i++;
  if (i < tokens.length && tokens[i].value === ':') {
    i++;
    let typeTokens = '';
    while (i < tokens.length) {
      const tk = tokens[i];
      if (tk.type === TOKEN_TYPES.T_STRING) { typeTokens += tk.value; i++; continue; }
      if (tk.type === 'CHAR' && /[\\?|]/.test(tk.value)) { typeTokens += tk.value; i++; continue; }
      break;
    }
    returnType = typeTokens.trim() || null;
  }

  const functionDefinition = {
    name: functionName,
    modifiers,
    parameters,
    returnType,
    docComment: this.lastDocComment || null,
    file: this.currentFile,
    line: tokens[start].line,
    isMethod: this.currentClass !== null,
    class: this.currentClass?.name || null
  };

  if (this.currentClass) {
    this.currentClass.methods.set(functionName, functionDefinition);
  } else {
    const fullName = this.currentNamespace ? `${this.currentNamespace}\\${functionName}` : functionName;
    this.functions.set(fullName, functionDefinition);
    fileData.functions.set(functionName, functionDefinition);
  }

  this.lastDocComment = null;
  return i;
}

  /**
   * Parse function parameter
   * @param {string} paramStr Parameter string
   * @returns {Object} Parameter object
   */
  parseParameter(paramStr) {
    const param = {
      name: '',
      type: null,
      defaultValue: null,
      isReference: false,
      isVariadic: false
    };

    // Remove extra whitespace
    paramStr = paramStr.trim();

    // Check for reference (&)
    if (paramStr.startsWith('&')) {
      param.isReference = true;
      paramStr = paramStr.substring(1).trim();
    }

    // Check for variadic (...)
    if (paramStr.startsWith('...')) {
      param.isVariadic = true;
      paramStr = paramStr.substring(3).trim();
    }

    // Split by default value (=)
    const parts = paramStr.split('=');
    const mainPart = parts[0].trim();

    if (parts.length > 1) {
      param.defaultValue = parts[1].trim();
    }

    // Parse type and variable name
    const tokens = mainPart.split(/\s+/);

    if (tokens.length >= 2) {
      // Has type hint
      param.type = tokens[0];
      param.name = tokens[tokens.length - 1];
    } else if (tokens.length === 1) {
      // Just variable name
      param.name = tokens[0];
    }

    // Clean variable name (remove $)
    if (param.name.startsWith('$')) {
      param.name = param.name.substring(1);
    }

    return param;
  }

  /**
   * Parse PHPDoc comment
   * @param {string} docComment PHPDoc comment string
   * @returns {Object} Parsed PHPDoc
   */
  parseDocComment(docComment) {
    const doc = {
      summary: '',
      description: '',
      tags: new Map()
    };

    // Remove comment markers
    const lines = docComment
      .replace(/^\/\*\*/, '')
      .replace(/\*\/$/, '')
      .split('\n')
      .map(line => line.replace(/^\s*\*\s?/, '').trim())
      .filter(line => line.length > 0);

    let currentSection = 'summary';
    let currentTag = null;

    for (const line of lines) {
      if (line.startsWith('@')) {
        // Parse tag
        const tagMatch = line.match(/^@(\w+)(?:\s+(.*))?$/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          const tagValue = tagMatch[2] || '';

          if (!doc.tags.has(tagName)) {
            doc.tags.set(tagName, []);
          }
          doc.tags.get(tagName).push(tagValue);

          currentTag = tagName;
          currentSection = 'tags';
        }
      } else if (currentSection === 'summary' && !doc.summary) {
        doc.summary = line;
        currentSection = 'description';
      } else if (currentSection === 'description') {
        doc.description += (doc.description ? '\n' : '') + line;
      } else if (currentSection === 'tags' && currentTag) {
        // Continue previous tag
        const tagValues = doc.tags.get(currentTag);
        if (tagValues.length > 0) {
          tagValues[tagValues.length - 1] += '\n' + line;
        }
      }
    }

    return doc;
  }

  /**
   * Post-process the index to resolve inheritance and build caches
   */
  postProcessIndex() {
    // Resolve inheritance chains
    for (const [className, classData] of this.classes) {
      this.resolveInheritance(classData);
    }

    // Build completion caches
    this.buildCompletionCaches();
  }

  /**
   * Resolve inheritance for a class
   * @param {Object} classData Class data object
   */
  resolveInheritance(classData) {
    if (classData.inheritanceResolved) return;

    // Resolve parent class methods and properties
    for (const parentName of classData.extends) {
      const parentClass = this.resolveClassName(parentName, classData);
      if (parentClass) {
        // Ensure parent is resolved first
        this.resolveInheritance(parentClass);

        // Inherit methods
        for (const [methodName, methodData] of parentClass.methods) {
          if (!classData.methods.has(methodName) &&
            (methodData.modifiers.has('public') || methodData.modifiers.has('protected'))) {
            classData.methods.set(methodName, { ...methodData, inherited: true });
          }
        }

        // Inherit properties
        for (const [propName, propData] of parentClass.properties) {
          if (!classData.properties.has(propName) &&
            (propData.modifiers.has('public') || propData.modifiers.has('protected'))) {
            classData.properties.set(propName, { ...propData, inherited: true });
          }
        }
      }
    }

    classData.inheritanceResolved = true;
  }

  /**
   * Resolve class name using current namespace and use statements
   * @param {string} className Class name to resolve
   * @param {Object} context Context object with namespace and uses
   * @returns {Object|null} Resolved class data
   */
  resolveClassName(className, context) {
    // Try direct lookup first
    if (this.classes.has(className)) {
      return this.classes.get(className);
    }

    // Try with current namespace
    if (context.namespace) {
      const namespacedName = `${context.namespace}\\${className}`;
      if (this.classes.has(namespacedName)) {
        return this.classes.get(namespacedName);
      }
    }

    // Try use statements
    const fileData = this.fileIndex.get(this.normalizeFilePath(context.file));
    if (fileData && fileData.uses.has(className)) {
      const fullName = fileData.uses.get(className);
      if (this.classes.has(fullName)) {
        return this.classes.get(fullName);
      }
    }

    return null;
  }

  /**
   * Build completion caches for faster lookups
   */
  buildCompletionCaches() {
    // This can be implemented to pre-build completion arrays
    // for better performance during actual completion requests
  }

  /**
   * Normalize a file path for use as a key
   * @param {string} filePath Path to normalize
   * @returns {string} Normalized path
   */
  normalizeFilePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

  /**
   * Get class completions for new statements
   * @param {string} prefix Current prefix
   * @param {Object} context Current context (file, position, etc.)
   * @returns {Array} Array of completion items
   */
  getClassCompletions(prefix, context = {}) {
    const completions = [];
    this.done.clear();

    const lowerPrefix = prefix.toLowerCase();

    for (const [fullName, classData] of this.classes) {
      const className = classData.name;

      // Check if matches prefix
      if (className.toLowerCase().includes(lowerPrefix)) {
        // Skip if already added
        if (this.done.has(className)) continue;

        // Create completion item
        const completion = {
          caption: className,
          value: className,
          meta: classData.type,
          score: this.calculateScore(className, prefix, classData),
          docText: this.formatDocText(classData)
        };

        // Add constructor snippet if available
        const constructor = classData.methods.get('__construct');
        if (constructor) {
          const params = this.formatParameters(constructor.parameters);
          completion.snippet = `${className}(${params.snippet})`;
          completion.docText += `\n\nConstructor: ${params.signature}`;
        } else {
          completion.snippet = `${className}()`;
        }

        // Add namespace info
        if (classData.namespace) {
          completion.docText += `\n\nNamespace: ${classData.namespace}`;
        }

        completions.push(completion);
        this.done.add(className);
      }
    }

    return this.sortCompletions(completions, prefix);
  }

  /**
   * Get method completions for -> statements
   * @param {string} prefix Current prefix
   * @param {Object} context Current context
   * @returns {Array} Array of completion items
   */
  getMethodCompletions(prefix, context = {}) {
    const completions = [];
    this.done.clear();

    const lowerPrefix = prefix.toLowerCase();

    // Try to determine the class context
    const classContext = this.inferClassContext(context);

    if (classContext) {
      // Get methods from specific class
      for (const [methodName, methodData] of classContext.methods) {
        if (methodName.toLowerCase().startsWith(lowerPrefix) &&
          (methodData.modifiers.has('public') || context.inSameClass)) {

          if (this.done.has(methodName)) continue;

          const completion = this.createMethodCompletion(methodName, methodData);
          completions.push(completion);
          this.done.add(methodName);
        }
      }

      // Get properties
      for (const [propName, propData] of classContext.properties) {
        if (propName.toLowerCase().startsWith(lowerPrefix) &&
          (propData.modifiers.has('public') || context.inSameClass) &&
          !propData.modifiers.has('static')) {

          if (this.done.has(propName)) continue;

          const completion = {
            caption: propName,
            value: propName,
            meta: 'property',
            score: this.calculateScore(propName, prefix, propData),
            docText: this.formatDocText(propData)
          };

          completions.push(completion);
          this.done.add(propName);
        }
      }
    } else {
      // Fallback: get methods from all classes
      for (const [className, classData] of this.classes) {
        for (const [methodName, methodData] of classData.methods) {
          if (methodName.toLowerCase().startsWith(lowerPrefix) &&
            methodData.modifiers.has('public')) {

            if (this.done.has(methodName)) continue;

            const completion = this.createMethodCompletion(methodName, methodData);
            completion.docText += `\n\nClass: ${className}`;
            completions.push(completion);
            this.done.add(methodName);
          }
        }
      }
    }

    return this.sortCompletions(completions, prefix);
  }

  /**
   * Get static method completions for :: statements
   * @param {string} prefix Current prefix
   * @param {Object} context Current context
   * @returns {Array} Array of completion items
   */
  getStaticMethodCompletions(prefix, context = {}) {
    const completions = [];
    this.done.clear();

    const lowerPrefix = prefix.toLowerCase();

    // Try to determine the class context
    const classContext = this.inferClassContext(context);

    if (classContext) {
      // Get static methods from specific class
      for (const [methodName, methodData] of classContext.methods) {
        if (methodName.toLowerCase().startsWith(lowerPrefix) &&
          methodData.modifiers.has('static') &&
          (methodData.modifiers.has('public') || context.inSameClass)) {

          if (this.done.has(methodName)) continue;

          const completion = this.createMethodCompletion(methodName, methodData);
          completions.push(completion);
          this.done.add(methodName);
        }
      }

      // Get static properties and constants
      for (const [propName, propData] of classContext.properties) {
        if (propName.toLowerCase().startsWith(lowerPrefix) &&
          (propData.modifiers.has('static') || propData.type === PROPERTY_CONST) &&
          (propData.modifiers.has('public') || context.inSameClass)) {

          if (this.done.has(propName)) continue;

          const completion = {
            caption: propName,
            value: propData.modifiers.has('static') ? `$${propName}` : propName,
            meta: propData.type === PROPERTY_CONST ? 'constant' : 'static property',
            score: this.calculateScore(propName, prefix, propData),
            docText: this.formatDocText(propData)
          };

          completions.push(completion);
          this.done.add(propName);
        }
      }

      // Get constants
      for (const [constName, constData] of classContext.constants) {
        if (constName.toLowerCase().startsWith(lowerPrefix) &&
          (constData.modifiers.has('public') || context.inSameClass)) {

          if (this.done.has(constName)) continue;

          const completion = {
            caption: constName,
            value: constName,
            meta: 'constant',
            score: this.calculateScore(constName, prefix, constData),
            docText: this.formatDocText(constData)
          };

          completions.push(completion);
          this.done.add(constName);
        }
      }
    }

    return this.sortCompletions(completions, prefix);
  }

  /**
   * Get namespace completions for use statements
   * @param {string} prefix Current prefix
   * @returns {Array} Array of completion items
   */
  getNamespaceCompletions(prefix) {
    const completions = [];
    this.done.clear();

    const lowerPrefix = prefix.toLowerCase();

    // Get all namespaces
    for (const [namespace, classes] of this.namespaces) {
      if (namespace.toLowerCase().includes(lowerPrefix)) {
        if (this.done.has(namespace)) continue;

        const completion = {
          caption: namespace,
          value: namespace,
          meta: 'namespace',
          score: this.calculateScore(namespace, prefix),
          docText: `Namespace containing ${classes.size} classes`
        };

        completions.push(completion);
        this.done.add(namespace);
      }
    }

    // Get individual classes for use statements
    for (const [fullName, classData] of this.classes) {
      if (fullName.toLowerCase().includes(lowerPrefix)) {
        if (this.done.has(fullName)) continue;

        const completion = {
          caption: fullName,
          value: fullName,
          meta: `use ${classData.type}`,
          score: this.calculateScore(fullName, prefix, classData),
          docText: this.formatDocText(classData)
        };

        completions.push(completion);
        this.done.add(fullName);
      }
    }

    return this.sortCompletions(completions, prefix);
  }

  /**
   * Get default completions (mixed)
   * @param {string} prefix Current prefix
   * @param {Object} context Current context
   * @returns {Array} Array of completion items
   */
  getDefaultCompletions(prefix, context = {}) {
    const completions = [];

    // Combine different types of completions
    const classCompletions = this.getClassCompletions(prefix, context);
    const functionCompletions = this.getFunctionCompletions(prefix, context);

    return [...classCompletions, ...functionCompletions];
  }

  /**
   * Get function completions
   * @param {string} prefix Current prefix
   * @param {Object} context Current context
   * @returns {Array} Array of completion items
   */
  getFunctionCompletions(prefix, context = {}) {
    const completions = [];
    this.done.clear();

    const lowerPrefix = prefix.toLowerCase();

    for (const [fullName, functionData] of this.functions) {
      const functionName = functionData.name;

      if (functionName.toLowerCase().startsWith(lowerPrefix)) {
        if (this.done.has(functionName)) continue;

        const completion = this.createFunctionCompletion(functionName, functionData);
        completions.push(completion);
        this.done.add(functionName);
      }
    }

    return this.sortCompletions(completions, prefix);
  }

  /**
   * Infer class context from current position
   * @param {Object} context Current context
   * @returns {Object|null} Class data or null
   */
  inferClassContext(context) {
    // This would analyze the current code context to determine
    // what class we're working with. For now, return null.
    // In a full implementation, this would:
    // 1. Look at variable assignments ($obj = new ClassName())
    // 2. Analyze method return types
    // 3. Check PHPDoc @var annotations
    // 4. Use type hints from function parameters

    return null;
  }

  /**
   * Create method completion item
   * @param {string} methodName Method name
   * @param {Object} methodData Method data
   * @returns {Object} Completion item
   */
  createMethodCompletion(methodName, methodData) {
    const params = this.formatParameters(methodData.parameters);

    return {
      caption: methodName,
      value: `${methodName}(${params.snippet})`,
      meta: methodData.modifiers.has('static') ? 'static method' : 'method',
      score: 1000,
      docText: this.formatDocText(methodData) + `\n\nSignature: ${methodName}(${params.signature})`
    };
  }

  /**
   * Create function completion item
   * @param {string} functionName Function name
   * @param {Object} functionData Function data
   * @returns {Object} Completion item
   */
  createFunctionCompletion(functionName, functionData) {
    const params = this.formatParameters(functionData.parameters);

    return {
      caption: functionName,
      value: `${functionName}(${params.snippet})`,
      meta: 'function',
      score: 900,
      docText: this.formatDocText(functionData) + `\n\nSignature: ${functionName}(${params.signature})`
    };
  }

  /**
   * Format parameters for completion
   * @param {Array} parameters Parameter array
   * @returns {Object} Formatted parameters
   */
  formatParameters(parameters) {
    const snippetParams = [];
    const signatureParams = [];

    parameters.forEach((param, index) => {
      let paramStr = '';

      // Add type hint
      if (param.type) {
        paramStr += `${param.type} `;
      }

      // Add reference indicator
      if (param.isReference) {
        paramStr += '&';
      }

      // Add variadic indicator
      if (param.isVariadic) {
        paramStr += '...';
      }

      // Add variable name
      paramStr += `$${param.name}`;

      // Add default value
      if (param.defaultValue !== null) {
        paramStr += ` = ${param.defaultValue}`;
      }

      signatureParams.push(paramStr);

      // For snippet, use placeholder
      const placeholder = param.defaultValue !== null ?
        `\${${index + 1}:$${param.name}}` :
        `\${${index + 1}:$${param.name}}`;

      snippetParams.push(placeholder);
    });

    return {
      snippet: snippetParams.join(', '),
      signature: signatureParams.join(', ')
    };
  }

  /**
   * Format documentation text
   * @param {Object} data Data object with docComment
   * @returns {string} Formatted documentation
   */
  formatDocText(data) {
    if (!data.docComment) {
      return data.name || 'No documentation available';
    }

    let text = '';

    if (data.docComment.summary) {
      text += data.docComment.summary;
    }

    if (data.docComment.description) {
      text += (text ? '\n\n' : '') + data.docComment.description;
    }

    // Add parameter info
    if (data.docComment.tags.has('param')) {
      const params = data.docComment.tags.get('param');
      text += '\n\nParameters:\n' + params.map(p => `  ${p}`).join('\n');
    }

    // Add return info
    if (data.docComment.tags.has('return')) {
      const returns = data.docComment.tags.get('return');
      text += '\n\nReturns: ' + returns[0];
    }

    return text || (data.name || 'No documentation available');
  }

  /**
   * Calculate completion score
   * @param {string} itemName Item name
   * @param {string} prefix Search prefix
   * @param {Object} data Item data
   * @returns {number} Score
   */
  calculateScore(itemName, prefix, data = {}) {
    let score = 1000;

    const lowerItem = itemName.toLowerCase();
    const lowerPrefix = prefix.toLowerCase();

    // Exact match gets highest score
    if (lowerItem === lowerPrefix) {
      score += 500;
    }
    // Starts with prefix gets high score
    else if (lowerItem.startsWith(lowerPrefix)) {
      score += 300;
    }
    // Contains prefix gets medium score
    else if (lowerItem.includes(lowerPrefix)) {
      score += 100;
    }

    // Boost score for public items
    if (data.modifiers && data.modifiers.has('public')) {
      score += 50;
    }

    // Boost score for commonly used methods
    const commonMethods = ['__construct', 'getName', 'getId', 'toString', 'getValue'];
    if (commonMethods.includes(itemName)) {
      score += 25;
    }

    return score;
  }

  /**
   * Sort completions by score and relevance
   * @param {Array} completions Completion array
   * @param {string} prefix Search prefix
   * @returns {Array} Sorted completions
   */
  sortCompletions(completions, prefix) {
    return completions.sort((a, b) => {
      // First sort by score (descending)
      if (a.score !== b.score) {
        return b.score - a.score;
      }

      // Then by caption length (ascending - shorter names first)
      if (a.caption.length !== b.caption.length) {
        return a.caption.length - b.caption.length;
      }

      // Finally alphabetically
      return a.caption.localeCompare(b.caption);
    });
  }

  /**
   * Get statistics about the indexed data
   * @returns {Object} Statistics object
   */
  getStatistics() {
    return {
      classes: this.classes.size,
      interfaces: this.interfaces.size,
      traits: this.traits.size,
      functions: this.functions.size,
      namespaces: this.namespaces.size,
      files: this.fileIndex.size,
      totalMethods: Array.from(this.classes.values())
        .reduce((sum, cls) => sum + cls.methods.size, 0),
      totalProperties: Array.from(this.classes.values())
        .reduce((sum, cls) => sum + cls.properties.size, 0)
    };
  }

  /**
   * Search for items by name
   * @param {string} query Search query
   * @param {string} type Type filter ('class', 'method', 'function', etc.)
   * @returns {Array} Search results
   */
  search(query, type = null) {
    const results = [];
    const lowerQuery = query.toLowerCase();

    // Search classes
    if (!type || type === 'class') {
      for (const [fullName, classData] of this.classes) {
        if (classData.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'class',
            name: classData.name,
            fullName: fullName,
            namespace: classData.namespace,
            file: classData.file,
            line: classData.line
          });
        }
      }
    }

    // Search methods
    if (!type || type === 'method') {
      for (const [className, classData] of this.classes) {
        for (const [methodName, methodData] of classData.methods) {
          if (methodName.toLowerCase().includes(lowerQuery)) {
            results.push({
              type: 'method',
              name: methodName,
              class: classData.name,
              file: methodData.file,
              line: methodData.line
            });
          }
        }
      }
    }

    // Search functions
    if (!type || type === 'function') {
      for (const [fullName, functionData] of this.functions) {
        if (functionData.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            type: 'function',
            name: functionData.name,
            fullName: fullName,
            file: functionData.file,
            line: functionData.line
          });
        }
      }
    }

    return results;
  }
}
