'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

const textExtensions = new Set([
  '.cjs',
  '.css',
  '.csv',
  '.d.ts',
  '.js',
  '.json',
  '.liquid',
  '.map',
  '.md',
  '.mjs',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yml',
  '.yaml',
]);

const textBasenames = new Set([
  '.env',
  '.env.example',
  '.env.local',
  '.gitignore',
  '.shopifyignore',
  'Dockerfile',
]);

const generatedBuildDirectories = [
  path.join(root, 'apps', 'splash-stickers-app', 'build'),
  path.join(root, 'apps', 'splash-stickers-app', 'public', 'build'),
  path.join(root, 'apps', 'splash-stickers-app', 'extensions', 'splash-storefront', 'dist'),
];

const databaseProtocols = [
  'postgres',
  'postgresql',
  'mysql',
  'mysql2',
  'mariadb',
  'mongodb',
  'mongodb+srv',
  'redis',
  'rediss',
];

const credentialNames = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
  'SHOPIFY_ACCESS_TOKEN',
  'ACCESS_TOKEN',
  'API_KEY',
  'API_SECRET',
  'AUTH_TOKEN',
  'CLIENT_SECRET',
  'GITHUB_TOKEN',
  'PRIVATE_KEY',
  'SECRET_KEY',
  'SESSION_SECRET',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'apiKey',
  'apiSecret',
  'apiSecretKey',
  'accessToken',
  'authToken',
  'clientSecret',
  'privateKey',
  'secretKey',
  'sessionSecret',
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const databaseUrlPattern = new RegExp(
  `(?:${databaseProtocols.map(escapeRegExp).join('|')})` +
    '://' +
    "[^\\s\"'`<>]+",
 'gi'
);
const credentialAssignmentPattern = new RegExp(
  `(?<![A-Za-z0-9])(?:${credentialNames
    .map(escapeRegExp)
    .join('|')})(?![A-Za-z0-9])[ \\t]*(?:=|:)[ \\t]*([^\\r\\n,}]+)`,
  'gi'
);
const privateKeyMarker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
const privateKeyPattern = new RegExp(escapeRegExp(privateKeyMarker), 'g');
const tokenPrefixes = [
  ['s', 'k'],
  ['p', 'k'],
  ['shpat'],
  ['shpua'],
  ['ghp'],
  ['github_pat'],
  ['glpat'],
  ['xoxb'],
  ['xoxp'],
  ['AKIA'],
].map((parts) => parts.join(''));
const tokenPattern = new RegExp(
  `\\b(?:${tokenPrefixes.map(escapeRegExp).join('|')})[-_]` +
    '[A-Za-z0-9_-]{16,}\\b',
  'g'
);

function isPlaceholder(value) {
  const normalized = String(value ?? '')
    .trim()
    .replace(/^['"`]|['"`]$/g, '')
    .trim();

  if (!normalized) return true;

  return /^(?:<[^>\r\n]+>|\$\{[^}\r\n]+\}|\{\{[^}\r\n]+\}\}|your(?:[_ -]|$)|replace(?:[_ -]|$)|change(?:[_ -]|$)|example(?:[_ -]|$)|placeholder(?:[_ -]|$)|dummy(?:[_ -]|$)|build(?:[_ -])?placeholder(?:[_ -]|$)|test(?:[_ -]|$)|local(?:[_ -])?development(?:[_ -]|$)|password)$/i.test(
    normalized
  );
}

function isEnvironmentFile(relativePath) {
  return /^\.env(?:\..+)?$/i.test(path.posix.basename(relativePath));
}

function stripAssignmentValue(value) {
  let normalized = value.trim();
  if (normalized.startsWith('"') || normalized.startsWith("'") || normalized.startsWith('`')) {
    const quote = normalized[0];
    const closingQuote = normalized.indexOf(quote, 1);
    normalized = normalized.slice(1, closingQuote > 0 ? closingQuote : normalized.length);
  } else {
    normalized = normalized.split(/\s+(?:#|\/\/)/, 1)[0].trim();
  }
  return normalized.replace(/\\\s*$/, '').trim();
}

function isSafeReference(value, environmentFile) {
  const normalized = stripAssignmentValue(value);
  if (isPlaceholder(normalized)) return true;
  if (environmentFile) return false;

  return /^(?:process\.env\b|import\.meta\.env\b|env\(|undefined$|null$|true$|false$|\{[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*|[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*(?:\s*\|\|[\s\S]*)?)$/.test(
    normalized
  );
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text[cursor] === '\n') line += 1;
  }
  return line;
}

function addFinding(findings, relativePath, line, rule) {
  const key = `${relativePath}:${line}:${rule}`;
  if (!findings.some((finding) => finding.key === key)) {
    findings.push({ key, path: relativePath, line, rule });
  }
}

function hasCredentialBearingDatabaseUrl(value) {
  const schemeEnd = value.indexOf('://');
  if (schemeEnd < 0) return false;

  const authority = value.slice(schemeEnd + 3).split(/[/?#]/, 1)[0];
  const at = authority.lastIndexOf('@');
  if (at >= 0) {
    const userInfo = authority.slice(0, at);
    const separator = userInfo.indexOf(':');
    const password = separator >= 0 ? userInfo.slice(separator + 1) : '';
    if (!isPlaceholder(password) || separator < 0) return true;
  }

  const queryStart = value.indexOf('?');
  if (queryStart >= 0) {
    const query = value.slice(queryStart + 1);
    for (const parameter of query.split('&')) {
      const [name, parameterValue = ''] = parameter.split('=', 2);
      if (/^(?:password|passwd|token|api[_-]?key|api[_-]?secret)$/i.test(name)) {
        if (!isPlaceholder(parameterValue)) return true;
      }
    }
  }

  return false;
}

function scanText(relativePath, text) {
  const findings = [];
  const environmentFile = isEnvironmentFile(relativePath);

  databaseUrlPattern.lastIndex = 0;
  for (const match of text.matchAll(databaseUrlPattern)) {
    if (hasCredentialBearingDatabaseUrl(match[0])) {
      addFinding(findings, relativePath, lineNumberAt(text, match.index), 'database-url-with-credentials');
    }
  }

  credentialAssignmentPattern.lastIndex = 0;
  for (const match of text.matchAll(credentialAssignmentPattern)) {
    const value = stripAssignmentValue(match[1]);
    if (!isSafeReference(value, environmentFile)) {
      const keyStart = match[0].search(/\S/);
      addFinding(findings, relativePath, lineNumberAt(text, match.index + Math.max(keyStart, 0)), 'credential-assignment');
    }
  }

  privateKeyPattern.lastIndex = 0;
  for (const match of text.matchAll(privateKeyPattern)) {
    addFinding(findings, relativePath, lineNumberAt(text, match.index), 'private-key-marker');
  }

  tokenPattern.lastIndex = 0;
  for (const match of text.matchAll(tokenPattern)) {
    addFinding(findings, relativePath, lineNumberAt(text, match.index), 'known-token-prefix');
  }

  return findings;
}

function getTrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z', '--cached'], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('Unable to enumerate tracked files for the secret scan.');
  }

  return result.stdout.split('\0').filter(Boolean);
}

function getUntrackedFiles() {
  const result = spawnSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error('Unable to enumerate untracked files for the secret scan.');
  }

  return result.stdout.split('\0').filter(Boolean);
}

function getGeneratedBuildFiles() {
  const files = [];

  function collect(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        collect(absolutePath);
      } else {
        const relativePath = path.relative(root, absolutePath).replaceAll(path.sep, '/');
        if (textExtensions.has(path.posix.extname(relativePath).toLowerCase())) {
          files.push(relativePath);
        }
      }
    }
  }

  generatedBuildDirectories.forEach(collect);
  return files;
}

function isTextBuffer(relativePath, buffer) {
  if (buffer.includes(0)) return false;
  const basename = path.posix.basename(relativePath);
  const extension = path.posix.extname(relativePath).toLowerCase();
  return (
    isEnvironmentFile(relativePath) ||
    textBasenames.has(basename) ||
    textExtensions.has(extension) ||
    extension === ''
  );
}

function scanRepository() {
  const findings = [];
  let trackedFilesScanned = 0;
  let untrackedFilesScanned = 0;
  let buildFilesScanned = 0;
  const trackedFiles = getTrackedFiles();
  const untrackedFiles = getUntrackedFiles();
  const trackedFileSet = new Set(trackedFiles);
  const buildFiles = getGeneratedBuildFiles();
  const buildFileSet = new Set(buildFiles);
  const files = [...new Set([...trackedFiles, ...untrackedFiles, ...buildFiles])];

  for (const relativePath of files) {
    const absolutePath = path.join(root, relativePath);
    const buffer = fs.readFileSync(absolutePath);
    if (!isTextBuffer(relativePath, buffer)) continue;

    if (trackedFileSet.has(relativePath)) trackedFilesScanned += 1;
    else if (buildFileSet.has(relativePath)) buildFilesScanned += 1;
    else untrackedFilesScanned += 1;
    findings.push(...scanText(relativePath, buffer.toString('utf8')));
  }

  return { buildFilesScanned, findings, trackedFilesScanned, untrackedFilesScanned };
}

function run() {
  const { buildFilesScanned, findings, trackedFilesScanned, untrackedFilesScanned } = scanRepository();
  findings.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.rule.localeCompare(right.rule));

  if (findings.length > 0) {
    console.error('Secret scan failed: ' + findings.length + ' potential credential finding(s).');
    for (const finding of findings) {
      console.error('- ' + finding.path + ':' + finding.line + ' [' + finding.rule + ']');
    }
    console.error('Credential values are intentionally omitted; rotate affected credentials before removing history.');
    process.exitCode = 1;
    return;
  }

  console.log(
    'Secret scan passed: ' +
      trackedFilesScanned +
      ' tracked text file(s), ' +
      untrackedFilesScanned +
      ' untracked text file(s), and ' +
      buildFilesScanned +
      ' generated build text file(s) checked.'
  );
}

if (require.main === module) run();

module.exports = {
  isPlaceholder,
  scanText,
};
