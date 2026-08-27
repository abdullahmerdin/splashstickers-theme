/* global process */

const requiredProductionEnvironment = [
  'SHOPIFY_API_KEY',
  'SHOPIFY_API_SECRET',
  'SHOPIFY_APP_URL',
  'SCOPES',
  'DATABASE_URL',
  'DIRECT_URL',
];

const placeholderPattern = /^(?:<[^>\r\n]+>|\$\{[^}\r\n]+\}|\{\{[^}\r\n]+\}\}|your(?:[_ -]|$)|replace(?:[_ -]|$)|change(?:[_ -]|$)|example(?:[_ -]|$)|placeholder(?:[_ -]|$)|dummy(?:[_ -]|$)|build(?:[_ -])?placeholder(?:[_ -]|$)|test(?:[_ -]|$)|local(?:[_ -])?development(?:[_ -]|$)|password)$/i;

function getValue(environment, name) {
  return typeof environment[name] === 'string' ? environment[name].trim() : '';
}

function isPlaceholder(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return true;
  return placeholderPattern.test(normalized);
}

function isPlaceholderPart(value) {
  const normalized = String(value ?? '').trim();
  return (
    isPlaceholder(normalized) ||
    /[<>]|\$\{|\{\{|^(?:your|replace|change|example|placeholder|dummy)(?:[._ -]|$)/i.test(
      normalized
    )
  );
}

function decodeUrlPart(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLoopback(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('127.')
  );
}

function validateShopifyUrl(environment, errors) {
  const value = getValue(environment, 'SHOPIFY_APP_URL');
  if (!value) return;

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push('SHOPIFY_APP_URL must be a valid HTTPS URL.');
    return;
  }

  if (url.protocol !== 'https:') {
    errors.push('SHOPIFY_APP_URL must use HTTPS in production.');
  }
  if (!url.hostname || isLoopback(url.hostname) || isPlaceholderPart(url.hostname)) {
    errors.push('SHOPIFY_APP_URL must point to the deployed application, not a local or placeholder host.');
  }
  if (url.username || url.password) {
    errors.push('SHOPIFY_APP_URL must not contain URL credentials.');
  }
}

function validateDatabaseUrl(environment, name, errors) {
  const value = getValue(environment, name);
  if (!value) return;

  let url;
  try {
    url = new URL(value);
  } catch {
    errors.push(name + ' must be a valid PostgreSQL connection URL.');
    return;
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    errors.push(name + ' must use the PostgreSQL protocol.');
  }
  if (!url.hostname || isLoopback(url.hostname) || isPlaceholderPart(url.hostname)) {
    errors.push(name + ' must point to the managed production database, not a local or placeholder host.');
  }
  if (!url.username || isPlaceholderPart(decodeUrlPart(url.username))) {
    errors.push(name + ' must include a real database username.');
  }
  if (!url.password || isPlaceholderPart(decodeUrlPart(url.password))) {
    errors.push(name + ' must include a real database password.');
  }
}

export function getProductionEnvironmentErrors(environment = process.env) {
  if (environment.NODE_ENV !== 'production') return [];

  const errors = [];
  for (const name of requiredProductionEnvironment) {
    if (!getValue(environment, name)) {
      errors.push(name + ' is required.');
    }
  }

  for (const name of ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET']) {
    const value = getValue(environment, name);
    if (value && isPlaceholder(value)) {
      errors.push(name + ' must be a real deployment credential; placeholder values are not allowed.');
    }
    if (value && /\s/.test(value)) {
      errors.push(name + ' must not contain whitespace.');
    }
  }

  const scopes = getValue(environment, 'SCOPES');
  if (scopes && !scopes.split(',').every((scope) => /^[A-Za-z0-9_]+$/.test(scope.trim()))) {
    errors.push('SCOPES must be a comma-separated list of Shopify access scopes.');
  }

  validateShopifyUrl(environment, errors);
  validateDatabaseUrl(environment, 'DATABASE_URL', errors);
  validateDatabaseUrl(environment, 'DIRECT_URL', errors);

  return errors;
}

export function assertProductionEnvironment(environment = process.env) {
  const errors = getProductionEnvironmentErrors(environment);
  if (errors.length === 0) return true;

  const error = new Error(
    [
      'Production environment validation failed.',
      'Set the named variables in the deployment secret manager and restart the service.',
      ...errors.map((message) => '- ' + message),
      'Credential values are intentionally omitted from this error.',
    ].join('\n')
  );
  error.code = 'PRODUCTION_ENV_INVALID';
  throw error;
}
