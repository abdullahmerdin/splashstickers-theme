'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isPlaceholder, scanText } = require('./check-secrets.js');

const databaseName = ['DATABASE', 'URL'].join('_');
const directName = ['DIRECT', 'URL'].join('_');
const apiSecretName = ['SHOPIFY', 'API', 'SECRET'].join('_');
const apiSecretProperty = ['api', 'Secret', 'Key'].join('');
const databaseProtocol = ['postgres', 'ql'].join('');
const assignment = (name, value) => name + '=' + value;
const credentialedDatabaseUrl = (user, password) =>
  databaseProtocol + '://' + [user, password].join(':') + '@db.example.invalid:5432/app';

test('placeholder values are recognized without revealing their contents', () => {
  assert.equal(isPlaceholder('build-placeholder'), true);
  assert.equal(isPlaceholder('runtime-credential-fixture'), false);
});

test('database URLs with credentials are reported without their values', () => {
  const findings = scanText(
    'fixture.env',
    assignment(databaseName, credentialedDatabaseUrl('runtime-user', 'runtime-password'))
  );

  assert.deepEqual(
    findings.map(({ path, line, rule }) => ({ path, line, rule })),
    [
      { path: 'fixture.env', line: 1, rule: 'database-url-with-credentials' },
      { path: 'fixture.env', line: 1, rule: 'credential-assignment' },
    ]
  );
});

test('blank and build-only environment values are allowed', () => {
  assert.deepEqual(
    scanText(
      'fixture.env',
      [assignment(databaseName, ''), assignment(directName, 'build-placeholder')].join('\n')
    ),
    []
  );
});

test('API credential assignments and private key markers are reported', () => {
  const privateKeyMarker = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const apiCredential = ['runtime', 'credential', 'fixture'].join('-');
  const findings = scanText(
    'fixture.js',
    [
      'const config = { ' + apiSecretProperty + ': ' + JSON.stringify(apiCredential) + ' };',
      privateKeyMarker,
    ].join('\n')
  );

  assert.deepEqual(
    findings.map(({ path, line, rule }) => ({ path, line, rule })),
    [
      { path: 'fixture.js', line: 1, rule: 'credential-assignment' },
      { path: 'fixture.js', line: 2, rule: 'private-key-marker' },
    ]
  );
});
