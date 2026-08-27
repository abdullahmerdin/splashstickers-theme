import { assertProductionEnvironment } from './env-validation.js';

try {
  const environment = process.argv.includes('--production')
    ? { ...process.env, NODE_ENV: 'production' }
    : process.env;
  assertProductionEnvironment(environment);
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Production environment validation failed.'
  );
  process.exitCode = 1;
}
