const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const checks = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

const required = [
  'apps/splash-stickers-app/package.json',
  'apps/splash-stickers-app/Dockerfile',
  'apps/splash-stickers-app/shopify.app.toml',
  'apps/splash-stickers-app/shopify.web.toml',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.designs.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.mockups.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.mockups.$id.render.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.reviews.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.stage.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.complete.ts',
  'apps/splash-stickers-app/app/assets/mockups/phone-case.webp',
  'apps/splash-stickers-app/app/assets/mockups/laptop.webp',
  'apps/splash-stickers-app/app/assets/mockups/mailer.webp',
  'apps/splash-stickers-app/app/services/mockup-options.server.ts',
  'apps/splash-stickers-app/app/services/upload-ticket.server.ts',
  'apps/splash-stickers-app/app/routes/webhooks.orders.paid.tsx',
  'apps/splash-stickers-app/app/routes/webhooks.compliance.tsx',
  'apps/splash-stickers-app/extensions/splash-storefront/shopify.extension.toml',
  'apps/splash-stickers-app/storefront-extension-src/splash-storefront.js',
  'apps/splash-stickers-app/storefront-extension-src/mockup-studio.js',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/storefront-bridge.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/mockup-preview.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/mockup-studio.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/product-reviews.liquid',
  'packages/design-contract/schema/design-manifest.schema.json',
  'packages/design-contract/src/index.js',
];

required.forEach((relativePath) => {
  assert(fs.existsSync(path.join(root, relativePath)), `required platform file exists: ${relativePath}`);
});

const rootPackage = JSON.parse(read('package.json'));
assert(rootPackage.private === true, 'workspace root is private');
assert(rootPackage.workspaces.includes('apps/splash-stickers-app'), 'root owns the Shopify app workspace');
assert(rootPackage.workspaces.includes('packages/*'), 'root owns shared packages');
assert(rootPackage.scripts['build:storefront-extension'].includes('esbuild'), 'storefront extension has a deterministic minified build');

const appPackage = JSON.parse(read('apps/splash-stickers-app/package.json'));
assert(appPackage.name === '@splash-stickers/app', 'Shopify app has a stable workspace name');
assert(appPackage.private === true, 'Shopify app package is private');
const dockerfile = read('apps/splash-stickers-app/Dockerfile');
assert(/COPY package\.json package-lock\.json/.test(dockerfile), 'container installs from the monorepo lockfile');
assert(/npm run build:app/.test(dockerfile), 'container builds the app through the workspace root');

const appConfig = read('apps/splash-stickers-app/shopify.app.toml');
const webConfig = read('apps/splash-stickers-app/shopify.web.toml');
assert(/roles\s*=\s*\["frontend",\s*"backend"\]/.test(webConfig), 'Shopify CLI runs the React Router frontend and backend');
assert(/prisma migrate deploy/.test(webConfig) && /react-router dev/.test(webConfig), 'dev preview migrates storage before starting React Router');
assert(/api_version\s*=\s*"2026-07"/.test(appConfig), 'app targets Shopify API 2026-07');
assert(/write_app_proxy/.test(appConfig), 'app requests the app-proxy scope');
assert(/write_files/.test(appConfig), 'app requests Shopify Files access for staged artwork uploads');
assert(/read_files/.test(appConfig), 'app requests only file-level read access for mockup artwork');
assert(!/read_products/.test(appConfig), 'mockup artwork access does not require broad product read scope');
assert(/topics\s*=\s*\[\s*"orders\/paid"\s*\]/.test(appConfig), 'paid-order handoff webhook is configured');
assert(/customers\/data_request/.test(appConfig) && /shop\/redact/.test(appConfig), 'privacy compliance webhooks are configured');
assert(/subpath\s*=\s*"splash-stickers"/.test(appConfig), 'storefront app-proxy path is stable');
assert(/client_id\s*=\s*"[a-f0-9]{32}"/.test(appConfig), 'Shopify app configuration is linked to a real client ID');

const proxyRoutes = [
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.designs.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.mockups.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.reviews.ts',
].map(read).join('\n');
assert(/requireAppProxy/.test(proxyRoutes), 'all storefront domains use the signed app-proxy boundary');

const bridge = read('apps/splash-stickers-app/extensions/splash-storefront/blocks/storefront-bridge.liquid');
const mockup = read('apps/splash-stickers-app/extensions/splash-storefront/blocks/mockup-preview.liquid');
const mockupStudio = read('apps/splash-stickers-app/extensions/splash-storefront/blocks/mockup-studio.liquid');
const reviews = read('apps/splash-stickers-app/extensions/splash-storefront/blocks/product-reviews.liquid');
assert(/"target"\s*:\s*"body"/.test(bridge), 'storefront bridge is an app embed');
assert(/"target"\s*:\s*"section"/.test(mockup), 'mockup is a movable app block');
assert(/"templates"\s*:\s*\["page"\]/.test(mockupStudio), 'mockup studio is a dedicated page app block');
assert(/mockup-phone\.jpg/.test(mockupStudio) && /mockup-laptop\.jpg/.test(mockupStudio) && /mockup-mailer\.jpg/.test(mockupStudio), 'mockup studio exposes all product scene plates');
assert(/"target"\s*:\s*"section"/.test(reviews), 'reviews are a movable app block');

const extensionCss = read('apps/splash-stickers-app/extensions/splash-storefront/assets/splash-storefront.css');
assert(/--color-background/.test(extensionCss) && /--color-foreground/.test(extensionCss), 'extension UI derives from semantic theme tokens');
assert(/prefers-color-scheme:\s*dark/.test(extensionCss), 'extension UI includes a dark-mode fallback');
assert(/scroll-snap-type:\s*inline mandatory/.test(extensionCss) && /width:\s*2\.75rem/.test(extensionCss), 'mockup studio mobile layout keeps product selection compact and touch controls usable');

const mockupRenderer = read('apps/splash-stickers-app/app/services/mockup-renderer.server.ts');
['phone-case.webp', 'laptop.webp', 'mailer.webp'].forEach((filename) => {
  const mockupPath = path.join(root, 'apps/splash-stickers-app/app/assets/mockups', filename);
  assert(fs.statSync(mockupPath).size <= 250_000, `${filename} mockup plate stays lightweight enough to inline`);
});
assert(/phone-case\.webp\?inline/.test(mockupRenderer) && /laptop\.webp\?inline/.test(mockupRenderer) && /mailer\.webp\?inline/.test(mockupRenderer), 'mockup renderer embeds every product scene without cross-origin dependencies');
assert(/MOCKUP_SCENE_DEFINITIONS/.test(mockupRenderer) && /print-area/.test(mockupRenderer), 'every mockup scene constrains artwork to its printable surface');
assert(/artworkBounds/.test(mockupRenderer) && /options\.scalePct/.test(mockupRenderer), 'mockup renderer applies customer placement and scale to visible artwork');
assert(/options\.productColor/.test(mockupRenderer) && /mix-blend-mode:multiply/.test(mockupRenderer), 'mockup renderer preserves product lighting while applying customer color');

const contractSchema = JSON.parse(read('packages/design-contract/schema/design-manifest.schema.json'));
assert(contractSchema.properties.schemaVersion.const === '1.0', 'DesignManifest schema version is pinned');
assert(contractSchema.additionalProperties === false, 'DesignManifest rejects unknown top-level fields');

const cartManager = read('assets/sticker-configurator/cart-manager.js');
assert(/splashPersistDesign/.test(cartManager), 'cart handoff waits for app persistence when the bridge is enabled');
assert(/_design_manifest_version/.test(cartManager), 'cart handoff includes a private contract version');
const configuratorEntry = read('assets/sticker-configurator/entry.js');
const extensionJs = read('apps/splash-stickers-app/extensions/splash-storefront/assets/splash-storefront.js');
const extensionJsPath = path.join(root, 'apps/splash-stickers-app/extensions/splash-storefront/assets/splash-storefront.js');
assert(fs.statSync(extensionJsPath).size <= 10_000, 'storefront extension JavaScript stays within Shopify\'s app-block limit');
const mockupStudioJs = read('apps/splash-stickers-app/extensions/splash-storefront/assets/mockup-studio.js');
const mockupStudioSource = read('apps/splash-stickers-app/storefront-extension-src/mockup-studio.js');
const mockupStudioJsPath = path.join(root, 'apps/splash-stickers-app/extensions/splash-storefront/assets/mockup-studio.js');
assert(fs.statSync(mockupStudioJsPath).size <= 10_000, 'mockup studio JavaScript stays within Shopify\'s app-block limit');
assert(/uploads\/stage/.test(mockupStudioJs) && /data-studio-file/.test(mockupStudio), 'mockup studio uploads finished artwork without the configurator');
assert(/scalePct/.test(mockupStudioJs) && /productColor/.test(mockupStudioJs) && /pointermove/.test(mockupStudioJs), 'mockup studio supports scale, color and drag placement controls');
assert(/data-resize-handle/.test(mockupStudio) && /data-rotate-handle/.test(mockupStudio) && !/type="range"/.test(mockupStudio), 'mockup studio keeps resize and rotation controls on the artwork');
assert(/\.splash-studio-artwork-handle\s*\{[^}]*opacity:\s*0\.68/s.test(extensionCss), 'mockup studio keeps artwork handles visually subdued until interaction');
assert(/activeScene/.test(mockupStudioJs) && /data-scene-activate/.test(mockupStudio), 'mockup cards keep an explicit customer-controlled active scene');
assert(/editor\.hidden\s*=\s*!isActive/.test(mockupStudioSource), 'mockup studio renders only the active editor while selections stay compact');
assert(!/splash-studio-steps/.test(mockupStudio) && !/No configurator needed|Each product keeps|Drag the design|Design ready/.test(mockupStudio + mockupStudioJs), 'mockup studio omits redundant instructional copy');
assert(/sticker-configurator:artwork-added/.test(configuratorEntry), 'configurator exposes the selected File only to the upload bridge event');
assert(/uploads\/stage/.test(extensionJs) && /uploads\/complete/.test(extensionJs), 'storefront bridge completes the staged artwork upload flow');
assert(/uploadToken/.test(extensionJs), 'staged artwork completion carries a short-lived server-signed token');

const shopifyIgnore = read('.shopifyignore');
assert(/apps\/\*/.test(shopifyIgnore) && /packages\/\*/.test(shopifyIgnore), 'theme uploads exclude app and shared workspaces');

console.log(`Platform guardrails passed (${checks.length} checks).`);
