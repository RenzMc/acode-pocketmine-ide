const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Create a new zip file
const zip = new JSZip();

// Add files to the zip
const addFile = (filePath, zipPath) => {
  const content = fs.readFileSync(filePath);
  zip.file(zipPath, content);
  console.log(`Added ${filePath} to zip as ${zipPath}`);
};

// Add directory to the zip recursively
const addDirectory = (dirPath, zipPath) => {
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      addDirectory(filePath, path.join(zipPath, file));
    } else {
      addFile(filePath, path.join(zipPath, file));
    }
  }
};

// Add required files
addFile('plugin.json', 'plugin.json');
addFile('readme.md', 'readme.md');
addFile('changelog.md', 'changelog.md');
addFile('icon.png', 'icon.png');
addDirectory('dist', 'dist');

// Generate the zip file
zip.generateAsync({ type: 'nodebuffer' })
  .then((content) => {
    // Write the zip file
    fs.writeFileSync('dist.zip', content);
    console.log('Plugin packaged successfully as dist.zip');
  })
  .catch((err) => {
    console.error('Error creating zip file:', err);
  });