const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assertContains(relativePath, pattern) {
  const source = read(relativePath);
  if (!source.includes(pattern)) {
    throw new Error(`${relativePath} is missing ${JSON.stringify(pattern)}`);
  }
}

const checks = [
  ['assets/splash-theme.css', 'Phase 5 cart, content and utility surfaces.'],
  ['assets/splash-theme.css', '.splash-cart-section'],
  ['assets/splash-theme.css', 'grid-row: 2 / -1'],
  ['assets/splash-theme.css', '.cart-page__summary .cart-summary--extend .cart-summary__inner'],
  ['assets/splash-theme.css', '.cart-page__summary .cart-totals__total'],
  ['assets/splash-theme.css', '.splash-blog-section .blog-post-card'],
  ['assets/splash-theme.css', '.splash-404-section__surface'],
  ['assets/splash-theme.css', '.splash-password-section__surface'],
  ['assets/splash-theme.css', "main[data-template^='customers/']"],
  ['assets/splash-theme.css', '.splash-localization-form'],
  ['sections/main-cart.liquid', 'splash-cart-page'],
  ['sections/main-cart.liquid', '"class": "section-wrapper splash-cart-section"'],
  ['sections/main-page.liquid', '"class": "section-wrapper splash-content-section"'],
  ['sections/main-blog.liquid', '"class": "section-wrapper splash-blog-section"'],
  ['sections/main-blog-post.liquid', '"class": "section-wrapper splash-blog-post-section"'],
  ['sections/main-404.liquid', '"class": "section-wrapper splash-404-section"'],
  ['sections/password.liquid', '"class": "section-wrapper section-password splash-password-section"'],
  ['sections/password-footer.liquid', '"class": "section-wrapper splash-password-footer"'],
  ['sections/asset-attribution.liquid', 'splash-asset-attribution-section'],
  ['snippets/localization-form.liquid', 'class="splash-localization-form"'],
];

checks.forEach(([relativePath, pattern]) => assertContains(relativePath, pattern));

console.log(`Phase 5 wiring checks passed (${checks.length} assertions).`);
