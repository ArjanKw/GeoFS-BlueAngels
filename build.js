const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

// Configuration
const ENTRYPOINT_DIR = path.join(__dirname, 'Scripts', 'addon', 'entrypoints');
const BUILD_DIR = path.join(__dirname, 'build');
const SCRIPTS_BASE_DIR = path.join(__dirname, 'Scripts', 'addon');

// Ensure build directory exists
if (!fs.existsSync(BUILD_DIR)) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
}

/**
 * Extract @require URLs from userscript header
 */
function extractRequireUrls(content) {
  const requireRegex = /@require\s+(.+)/g;
  const urls = [];
  let match;
  
  while ((match = requireRegex.exec(content)) !== null) {
    urls.push(match[1].trim());
  }
  
  return urls;
}

/**
 * Convert GitHub raw URL to local file path
 */
function urlToLocalPath(url) {
  // Pattern: https://raw.githubusercontent.com/ArjanKw/GeoFS-BlueAngels/refs/heads/main/Scripts/addon/...
  const match = url.match(/\/Scripts\/addon\/(.+)$/);
  if (!match) {
    throw new Error(`Cannot parse URL: ${url}`);
  }
  
  return path.join(SCRIPTS_BASE_DIR, match[1]);
}

/**
 * Extract userscript header and body
 */
function parseUserscript(content) {
  const headerRegex = /(\/\/ ==UserScript==[\s\S]+?\/\/ ==\/UserScript==)/;
  const match = content.match(headerRegex);
  
  if (!match) {
    throw new Error('No userscript header found');
  }
  
  const header = match[1];
  const body = content.substring(content.indexOf(header) + header.length).trim();
  
  return { header, body };
}

/**
 * Remove @require lines from header
 */
function removeRequireLines(header) {
  return header
    .split('\n')
    .filter(line => !line.includes('@require'))
    .join('\n');
}

/**
 * Build full userscript by combining all required files
 */
function buildFullScript(entrypointPath) {
  const content = fs.readFileSync(entrypointPath, 'utf8');
  const { header, body } = parseUserscript(content);
  const requireUrls = extractRequireUrls(header);
  
  // Read all required files
  const requiredContents = requireUrls.map(url => {
    const localPath = urlToLocalPath(url);
    console.log(`  Reading: ${path.relative(__dirname, localPath)}`);
    return fs.readFileSync(localPath, 'utf8');
  });
  
  // Build combined script
  const cleanHeader = removeRequireLines(header);
  const combined = [
    cleanHeader,
    '',
    '// Combined required files:',
    ...requiredContents,
    '',
    '// Entry point:',
    body
  ].join('\n');
  
  return combined;
}

/**
 * Build minified version
 */
async function buildMinifiedScript(fullScript) {
  // Extract and preserve userscript header
  const { header, body } = parseUserscript(fullScript);
  
  // Minify only the body (not the header)
  const result = await minify(body, {
    compress: {
      dead_code: true,
      drop_console: false,
      drop_debugger: true,
      keep_classnames: true,
      keep_fnames: true
    },
    mangle: false, // Don't mangle names to keep debugging easier
    format: {
      comments: false
    }
  });
  
  if (result.error) {
    throw result.error;
  }
  
  return header + '\n\n' + result.code;
}

/**
 * Process a single entrypoint file
 */
async function processEntrypoint(filename) {
  const entrypointPath = path.join(ENTRYPOINT_DIR, filename);
  const baseName = filename.replace('.user.js', '');
  
  console.log(`\nProcessing: ${filename}`);
  
  // Build full version
  console.log('Building full version...');
  const fullScript = buildFullScript(entrypointPath);
  const fullOutputPath = path.join(BUILD_DIR, `${baseName}.user.js`);
  fs.writeFileSync(fullOutputPath, fullScript, 'utf8');
  console.log(`  ✓ Written: ${path.relative(__dirname, fullOutputPath)} (${(fullScript.length / 1024).toFixed(1)} KB)`);
  
  // Build minified version
  console.log('Building minified version...');
  const minifiedScript = await buildMinifiedScript(fullScript);
  const minOutputPath = path.join(BUILD_DIR, `${baseName}.user.min.js`);
  fs.writeFileSync(minOutputPath, minifiedScript, 'utf8');
  console.log(`  ✓ Written: ${path.relative(__dirname, minOutputPath)} (${(minifiedScript.length / 1024).toFixed(1)} KB)`);
  
  const reduction = ((1 - minifiedScript.length / fullScript.length) * 100).toFixed(1);
  console.log(`  Size reduction: ${reduction}%`);
}

/**
 * Main build function
 */
async function build() {
  console.log('=== GeoFS Addon Build ===\n');
  
  // Find all .user.js files in entrypoints directory
  const entrypoints = fs.readdirSync(ENTRYPOINT_DIR)
    .filter(file => file.endsWith('.user.js'));
  
  if (entrypoints.length === 0) {
    console.error('No entrypoint files found in', ENTRYPOINT_DIR);
    process.exit(1);
  }
  
  console.log(`Found ${entrypoints.length} entrypoint(s):`);
  entrypoints.forEach(file => console.log(`  - ${file}`));
  
  // Process each entrypoint
  for (const entrypoint of entrypoints) {
    try {
      await processEntrypoint(entrypoint);
    } catch (error) {
      console.error(`\n❌ Error processing ${entrypoint}:`, error.message);
      process.exit(1);
    }
  }
  
  console.log('\n✓ Build complete!');
}

// Watch mode support
const watchMode = process.argv.includes('--watch');

if (watchMode) {
  console.log('👀 Watch mode enabled. Watching for changes...\n');
  
  // Initial build
  build().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
  
  // Watch entrypoints directory
  fs.watch(ENTRYPOINT_DIR, { recursive: false }, (eventType, filename) => {
    if (filename && filename.endsWith('.user.js')) {
      console.log(`\n📝 Change detected: ${filename}`);
      build().catch(error => console.error('Build failed:', error));
    }
  });
  
  // Watch Scripts/addon directory
  fs.watch(SCRIPTS_BASE_DIR, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.js')) {
      console.log(`\n📝 Change detected: ${filename}`);
      build().catch(error => console.error('Build failed:', error));
    }
  });
} else {
  // Single build
  build().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}
