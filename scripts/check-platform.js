'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const checks = [];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
function assert(condition, message) { if (!condition) throw new Error(message); checks.push(message); }

const required = [
  'apps/splash-stickers-app/app/components/workbench/WorkbenchShell.tsx',
  'apps/splash-stickers-app/app/lib/gangsheet-editor.ts',
  'apps/splash-stickers-app/app/lib/gangsheet-editor.test.mjs',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.builder.tsx',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.purchase-intents.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.stage.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.complete.ts',
  'apps/splash-stickers-app/app/routes/apps.splash-stickers.uploads.status.ts',
  'apps/splash-stickers-app/app/routes/healthz.ts',
  'apps/splash-stickers-app/app/services/products.server.ts',
  'apps/splash-stickers-app/app/services/purchase-intents.server.ts',
  'apps/splash-stickers-app/app/services/order-handoff.server.ts',
  'apps/splash-stickers-app/app/styles/gangsheet-builder.css',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/gangsheet-builder.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/mockup-studio.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/blocks/product-reviews.liquid',
  'apps/splash-stickers-app/extensions/splash-storefront/assets/splash-storefront.css',
  'apps/splash-stickers-app/prisma/migrations/20260812150000_postgresql_baseline/migration.sql',
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
const prismaSchema = read('apps/splash-stickers-app/prisma/schema.prisma');
const envExample = read('apps/splash-stickers-app/.env.example');
const dockerfile = read('apps/splash-stickers-app/Dockerfile');
assert(/api_version\s*=\s*"2026-07"/.test(appConfig), 'app targets Shopify API 2026-07');
assert(/provider\s*=\s*"postgresql"/.test(prismaSchema) && /directUrl\s*=\s*env\("DIRECT_URL"\)/.test(prismaSchema), 'Prisma uses Supabase PostgreSQL with a direct migration URL');
assert(/DATABASE_URL=postgresql:/.test(envExample) && /DIRECT_URL=postgresql:/.test(envExample), 'environment example documents pooled and direct PostgreSQL URLs');
assert(/EXPOSE\s+10000/.test(dockerfile) && /ENV HOST=0\.0\.0\.0/.test(dockerfile) && dockerfile.indexOf('npm run build:app') < dockerfile.indexOf('ENV HOST=0.0.0.0'), 'Render container binds the public web port after the build step');
assert(/npm ci --include=dev/.test(dockerfile) && dockerfile.indexOf('npm run build:app') < dockerfile.indexOf('npm prune --omit=dev'), 'Docker installs build tooling before pruning development dependencies');
assert(/\^https\?:\\\/\\\//.test(viteConfig), 'Vite only treats URL-shaped Shopify CLI hosts as app URLs');
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
assert(!/wb-panel--context/.test(shell) && /wb-stage/.test(shell) && /wb-panel--preview/.test(shell), 'builder keeps the primary stage and preview without a redundant context column');
assert(/grid-template-columns:\s*minmax\(29rem, 1fr\)\s+minmax\(15rem, 17\.5rem\)/.test(builderCss), 'desktop builder uses a focused two-column layout');
assert(/data-drawer-open/.test(shell) && /max-width:\s*59\.99rem/.test(builderCss), 'preview and order become a mobile drawer');
assert(!/Describe a builder change|gb-composer|ChangeReview/.test(builder + builderCss), 'builder omits the removed change composer and proposal panel');
assert(/<Preview/.test(builder) && /<PurchasePanel/.test(builder), 'live preview and controlled purchase actions remain available');
assert(/<WorkbenchShell title=\{product\.title\} preview=\{previewPanel\}>/.test(builder) && !/subtitle:/.test(shell), 'builder header shows only the product name');
assert(/GUIDE_STORAGE_KEY/.test(builder) && /localStorage\.getItem\(GUIDE_STORAGE_KEY\)/.test(builder) && /localStorage\.setItem\(GUIDE_STORAGE_KEY, "complete"\)/.test(builder), 'first-run guide is remembered after completion or skip');
assert(/function GuidedTour/.test(builder) && /showModal\(\)/.test(builder) && /Start guide/.test(builder) && /Skip guide/.test(builder) && /Finish/.test(builder), 'builder provides a blocking summary and step-by-step guided tour');
['add-design', 'auto-arrange', 'history-controls', 'editing-tools', 'sheet-settings', 'canvas', 'preview-panel'].forEach((target) => assert((builder + shell).includes(`data-tour="${target}"`) || builder.includes(`dataTour="${target}"`), `guided tour targets ${target}`));
assert(/mobileTarget:\s*"editing-tools-mobile"/.test(builder) && /mobileTarget:\s*"preview-mobile"/.test(builder), 'guided tour uses visible mobile controls for collapsed areas');
assert(/gb-tour-mask/.test(builder + builderCss) && /mask="url\(#gb-tour-cutout\)"/.test(builder), 'guided tour spotlights each active control through the page overlay');
assert(/data-theme="dark"/.test(builderCss), 'standalone builder has semantic dark-mode values');
assert(/MutationObserver/.test(builder) && /theme:change/.test(builder) && !/toggleMode/.test(builder), 'embedded builder follows the storefront theme dynamically without a separate toggle');
assert(/syncEmbeddedThemeTokens/.test(builder) && /hostSurface/.test(builder) && /frameElement\?\.closest/.test(builder) && /--color-background/.test(builder), 'embedded builder inherits the actual product-section surface tokens');
assert(/--wb-bg:\s*#0f1115/.test(builderCss) && /--wb-control-surface:\s*#191c23/.test(builderCss) && /--wb-accent:\s*#6c5ce7/.test(builderCss), 'standalone dark palette matches the storefront dark palette');
assert(/\.wb-panel[\s\S]*background:\s*transparent/.test(builderCss) && /\.gb-stage-toolbar[\s\S]*background:\s*transparent/.test(builderCss) && /--wb-canvas-surround:\s*#ffffff/.test(builderCss), 'builder chrome blends into the product page in both color modes');
assert(/horizontalPadding[\s\S]*targetLeft - viewportInset[\s\S]*targetRight/.test(builder) && /verticalPadding[\s\S]*targetTop - viewportInset[\s\S]*targetBottom/.test(builder), 'guided-tour cutouts use symmetric padding when clipped to the viewport');
assert(/\.wb-panel--preview\s*\{\s*border:\s*0/.test(builderCss) && /\.gb-stage-toolbar[\s\S]*border:\s*0/.test(builderCss) && /\.gb-toolbar-divider\s*\{\s*display:\s*none/.test(builderCss) && /\.gb-purchase__total[\s\S]*border:\s*0/.test(builderCss), 'builder removes structural separator lines while preserving canvas guides');
assert(/--wb-edit-sheet/.test(builderCss) && /data-dark-surface/.test(builder), 'dark mode uses a dark editing sheet without recoloring output previews');
assert(/setCanvasZoom/.test(builder) && /passive:\s*false/.test(builder) && /preventDefault\(\)/.test(builder) && /gb-canvas-wrap/.test(builderCss), 'canvas zoom captures modified wheel gestures without zooming the storefront');
assert(/isLayoutValid/.test(builder) && /autoArrange/.test(builder) && /data-invalid/.test(builder), 'direct manipulation and arrangement prevent overlapping artwork');
assert(/DesignDialog/.test(builder) && /copies:\s*3/.test(builder) && /Add to sheet/.test(builder), 'add design dialog captures physical size and copy count before placement');
assert(/MAX_ITEMS\s*=\s*500/.test(builder) && /LimitDialog/.test(builder) && /Maximum 500 designs/.test(builder), 'builder enforces the 500-design limit with a controlled popup');
assert(!/Select artwork to edit its placement|Add print-ready artwork to begin|Builder context|Changes appear here/.test(builder), 'builder omits redundant empty, context and history copy');
assert(/touchPointersRef/.test(builder) && /pinchRef/.test(builder) && /touchPanRef/.test(builder), 'mobile canvas restores pinch zoom and one-finger empty-canvas panning');
assert(/gb-more-tools/.test(builder + builderCss) && /gb-sheet-toggle/.test(builder + builderCss), 'mobile tools and sheet controls collapse to reduce clutter');
assert(/function undo/.test(builder) && /function redo/.test(builder) && /duplicateSelected/.test(builder) && /flipSelected/.test(builder), 'builder keeps configurator quality-of-life editing actions');
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
assert(/<iframe/.test(launcher) && /embedded=1/.test(launcher) && /name="variant"/.test(launcher) === false, 'product app block embeds the builder instead of navigating away');
assert(/\.shopify-block:has\(> \.splash-builder-embed\)/.test(extensionCss) && /align-self:\s*stretch/.test(extensionCss), 'builder app block expands beyond the iframe intrinsic width');
assert(/\.splash-builder-embed[\s\S]*border:\s*0/.test(extensionCss) && /html\[data-embedded="true"\] \.wb-appbar/.test(builderCss), 'embedded builder removes the boxed outer treatment and duplicate desktop app bar');
assert(/\.splash-builder-embed[\s\S]*margin:\s*clamp\(1\.25rem, 3vw, 2\.5rem\)/.test(extensionCss), 'embedded builder keeps measured breathing room below the storefront header');
assert(/html\[data-theme="dark"\]/.test(extensionCss), 'app extension follows the theme persisted color mode');
assert(/prefers-color-scheme:\s*dark/.test(extensionCss), 'app extension honors system dark preference before a choice');

const productTemplate = read('templates/product.json');
const gangsheetTemplate = read('templates/product.product-gangsheet.json');
assert(!/blocks\/gangsheet-builder/.test(productTemplate) && /blocks\/gangsheet-builder/.test(gangsheetTemplate), 'only the gangsheet product template embeds the builder app block');
assert(Object.keys(JSON.parse(gangsheetTemplate.replace(/^[\s\S]*?\*\/\s*/, '')).sections).length === 1, 'gangsheet template contains no empty spacer section');
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
