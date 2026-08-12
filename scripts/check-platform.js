'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const checks = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); checks.push(message); }

const required = [
  'apps/splash-stickers-app/app/components/workbench/WorkbenchShell.tsx',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.builder.tsx',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.purchase-intents.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.stage.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.complete.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.status.ts',
  'apps/splash-stickers-app/app/services/products.server.ts',
  'apps/splash-stickers-app/app/services/purchase-intents.server.ts',
  'apps/splash-stickers-app/app/services/order-handoff.server.ts',
  'apps/splash-stickers-app/app/styles/gangsheet-builder.css',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/gangsheet-builder.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/mockup-studio.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/product-reviews.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/assets/splash-storefront.css',
  'apps/splash-stickers-app/prisma/migrations/20260812130000_gangsheet_builder/migration.sql',
  'packages/design-contract/schema/design-manifest.schema.json',
  'docs/workbench-interface-standard.md',
];
required.forEach((relativePath) => assert(fs.existsSync(path.join(root, relativePath)), `required platform file exists: ${relativePath}`));

const rootPackage = JSON.parse(read('package.json'));
assert(rootPackage.private === true, 'workspace root is private');
assert(rootPackage.workspaces.includes('apps/splash-stickers-app'), 'root owns the Shopify app workspace');
assert(!rootPackage.scripts['build:configurator'] && !rootPackage.scripts['check:configurator'], 'retired theme configurator scripts stay absent');

const appConfig = read('apps/splash-stickers-app/shopify.app.toml');
const viteConfig = read('apps/splash-stickers-app/vite.config.ts');
assert(/api_version\s*=\s*"2026-07"/.test(appConfig), 'app targets Shopify API 2026-07');
['read_files', 'read_orders', 'read_products', 'write_app_proxy', 'write_files'].forEach((scope) => assert(appConfig.includes(scope), `app requests ${scope}`));
assert(/orders\/paid/.test(appConfig), 'paid-order webhook is configured');
assert(/subpath\s*=\s*"splash-stickers"/.test(appConfig), 'storefront app-proxy path is stable');
assert(/base:\s*"\/apps\/splash-stickers\/"/.test(viteConfig), 'client assets stay below the storefront app-proxy prefix');

const builder = read('apps/splash-stickers-app/app/routes/apps.splash-stickers.builder.tsx');
assert(/requireAppProxy/.test(builder), 'builder document is protected by the signed app proxy');
assert(/uploads\/stage/.test(builder) && /uploads\/complete/.test(builder) && /uploads\/status/.test(builder), 'builder waits for durable Shopify artwork');
assert(/postJson\("designs"/.test(builder) && /postJson\("purchase-intents"/.test(builder), 'design save precedes purchase handoff');
assert(builder.indexOf('postJson("designs"') < builder.indexOf('postJson("purchase-intents"'), 'design persistence occurs before handoff creation');
assert(builder.indexOf('postJson("purchase-intents"') < builder.indexOf('"/cart/add.js"'), 'signed handoff exists before Shopify cart mutation');
assert(/_splash_handoff/.test(builder) && /_splash_claim/.test(builder) && /_design_digest/.test(builder), 'cart carries a compact signed app reference');
assert(/quantity:\s*1,/.test(builder), 'manifest geometry does not duplicate Shopify line quantity');

const shell = read('apps/splash-stickers-app/app/components/workbench/WorkbenchShell.tsx');
const builderCss = read('apps/splash-stickers-app/app/styles/gangsheet-builder.css');
assert(/wb-panel--context/.test(shell) && /wb-stage/.test(shell) && /wb-panel--preview/.test(shell), 'workbench has context, primary stage and preview regions');
assert(/grid-template-columns:[^;]+[^;]+[^;]+;/.test(builderCss), 'desktop workbench uses three columns');
assert(/data-drawer-open/.test(shell) && /max-width:\s*59\.99rem/.test(builderCss), 'side panels become mobile drawers');
assert(/max-height:\s*calc\(5 \* 1\.4em/.test(builderCss) && /autoGrow/.test(builder), 'prompt grows from one through five lines');
assert(/role="tabpanel"/.test(builder) && /ChangeReview/.test(builder), 'preview and diff are explicit controlled panels');
assert(/data-theme="dark"/.test(builderCss), 'standalone builder has semantic dark-mode values');
assert(!/linear-gradient|radial-gradient|filter:\s*drop-shadow|box-shadow:/.test(builderCss), 'builder avoids decorative gradients, glows and shadows');
assert(!/No configurator needed|Each product keeps|Drag the design|Design ready/.test(builder + builderCss), 'builder avoids retired AI-artifact copy');

const intentService = read('apps/splash-stickers-app/app/services/purchase-intents.server.ts');
const handoffService = read('apps/splash-stickers-app/app/services/order-handoff.server.ts');
assert(/createHmac/.test(intentService) && /timingSafeEqual/.test(intentService), 'purchase handoff is signed and compared safely');
assert(/getImageFileStatuses/.test(intentService) && /file\.status !== "READY"/.test(intentService), 'purchase handoff verifies Shopify-owned ready artwork');
assert(/purchaseIntent/.test(handoffService) && /designDigest/.test(handoffService) && /manifest/.test(handoffService), 'paid order stores an immutable design snapshot');
assert(/line\.quantity/.test(handoffService), 'production quantity comes from the paid Shopify line');

const launcher = read('apps/splash-stickers-app/extensions/splash-storefront/blocks/gangsheet-builder.liquid');
const extensionCss = read('apps/splash-stickers-app/extensions/splash-storefront/assets/splash-storefront.css');
assert(/method="get"/.test(launcher) && /name="variant"/.test(launcher), 'launcher uses a native declarative product form');
assert(/html\[data-theme="dark"\]/.test(extensionCss), 'app extension follows the theme persisted color mode');
assert(/prefers-color-scheme:\s*dark/.test(extensionCss), 'app extension honors system dark preference before a choice');

const productTemplate = read('templates/product.json');
const gangsheetTemplate = read('templates/product.product-gangsheet.json');
assert(!/blocks\/gangsheet-builder/.test(productTemplate) && /blocks\/gangsheet-builder/.test(gangsheetTemplate), 'only the gangsheet product template mounts the builder app block');
assert(!/sticker-configurator/.test(productTemplate + gangsheetTemplate), 'theme templates do not embed the retired configurator');
assert(/_splash_gangsheet/.test(read('snippets/cart-products.liquid')), 'cart recognizes app-owned gangsheet lines by contract marker');
assert(/item\.quantity/.test(read('snippets/cart-gangsheet-summary.liquid')), 'cart summary renders Shopify quantity authority');

const mockupStudio = read('apps/splash-stickers-app/extensions/splash-storefront/blocks/mockup-studio.liquid');
const mockupJsPath = path.join(root, 'apps/splash-stickers-app/extensions/splash-storefront/assets/mockup-studio-v2.js');
const reviewsJsPath = path.join(root, 'apps/splash-stickers-app/extensions/splash-storefront/assets/product-reviews.js');
assert(fs.statSync(mockupJsPath).size <= 10_000, 'mockup studio JavaScript stays within Shopify app-block limit');
assert(fs.statSync(reviewsJsPath).size <= 10_000, 'reviews JavaScript stays within Shopify app-block limit');
assert(!/No configurator needed|Each product keeps|Drag the design|Design ready/.test(mockupStudio), 'mockup studio keeps restrained copy');

console.log(`Platform guardrails passed (${checks.length} checks).`);
