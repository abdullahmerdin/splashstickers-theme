const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const normalize = (value) => value.replace(/\r\n/g, '\n').trim();
const bundle = normalize(fs.readFileSync(path.join(root, 'assets', 'sticker-configurator.js'), 'utf8'));
const modulesDirectory = path.join(root, 'assets', 'sticker-configurator');
const modules = fs.readdirSync(modulesDirectory).filter((file) => file.endsWith('.js'));
const missing = modules.filter((file) => {
  const moduleSource = normalize(fs.readFileSync(path.join(modulesDirectory, file), 'utf8'));
  return !bundle.includes(moduleSource);
});

if (missing.length) {
  console.error(`Configurator bundle is out of sync with: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`Configurator bundle contains all ${modules.length} source modules.`);
}
