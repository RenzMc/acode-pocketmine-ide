import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Read plugin.json
const pluginJson = JSON.parse(
  readFileSync(join(__dirname, 'plugin.json'), 'utf8')
);

// Define build options
const buildOptions = {
  entryPoints: ['./src/main.js'],
  bundle: true,
  outfile: './dist/main.js',
  format: 'esm',
  platform: 'browser',
  target: 'es2018',
  minify: process.argv.includes('--minify'),
  external: ['fs', 'path'],
  define: {
    'process.env.NODE_ENV': JSON.stringify(
      process.argv.includes('--minify') ? 'production' : 'development'
    ),
  },
};

// Build the plugin
async function build() {
  try {
    // Build the plugin
    await esbuild.build(buildOptions);
    console.log('Build completed successfully!');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

// Watch for changes
if (process.argv.includes('--watch')) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  build();
}