# Faz 0 Horizon selector / token / component envanteri

## Kaynak haritası

| Alan | Kaynak | Mevcut durum | Faz 1 etkisi |
| --- | --- | --- | --- |
| Global CSS | `assets/base.css` (yaklaşık 101 KB) | Horizon’ın ana selector ve component katmanı; Shopify davranış stilleri burada | Splash token’ları bu katmanı ezmek yerine kontrollü namespace ile bağlanmalı |
| Marka override’ları | `assets/custom.css` (yaklaşık 11 KB) | Splash renkleri, gradient’ler, kartlar, badge’ler ve CTA’lar; raw hex ve `!important` kullanımı var | Semantic token’lara taşınacak, duplicate selector’lar azaltılacak |
| Theme variable üretimi | `snippets/theme-styles-variables.liquid` | Font, color, opacity, spacing, border-radius, shadow ve input değişkenleri üretir | Splash token’ları settings ile çakışmadan bu katmana bağlanmalı |
| Theme editor şeması | `config/settings_schema.json` | Horizon metadata ve geniş ayar yüzeyi korunuyor | Tema terminolojisi ve yeni token ayarları kontrollü güncellenecek |
| Theme editor değerleri | `config/settings_data.json` | Mor/pembe/sarı/teal başlangıç paleti mevcut; primary/secondary button radius 50 | Pill kullanımını badge/status/selection ile sınırlamak için gözden geçirilecek |
| Style entrypoint | `snippets/stylesheets.liquid` | `overflow-list.css` → `base.css` → `custom.css` sırası | Yeni `splash-theme.css` eklenirse cascade sırası açıkça belirlenecek |
| Header shell | `sections/header.liquid`, `sections/header-announcements.liquid`, `snippets/header-actions.liquid`, `snippets/header-drawer.liquid` | Horizon markup ve interaction katmanı aktif | Görsel dönüşüm markup davranışını bozmadan yapılmalı |
| Search | `sections/predictive-search.liquid`, `snippets/search-modal.liquid`, `assets/predictive-search.js` | Predictive sonuç, empty state ve overlay akışı mevcut | Splash input/result/empty yüzeyleri ortak primitive kullanmalı |
| Cart | `snippets/cart-drawer.liquid`, `snippets/cart-products.liquid`, `snippets/cart-summary.liquid`, `assets/cart-drawer.js` | Cart drawer/page, quantity, discount ve accelerated checkout akışı mevcut | Cart payload ve Shopify event akışı korunmalı |
| Product | `sections/product-information.liquid`, product snippets, `assets/product-form.js` | Variant, pricing, media ve add-to-cart Shopify davranışına bağlı | Görsel değişiklikler authoritative variant fiyatını değiştirmemeli |
| Configurator | `sections/sticker-configurator.liquid`, `assets/sticker-configurator.css`, `assets/sticker-configurator*.js` | İşlevsel olarak ayrı `--cfg-*` token namespace’i ve 15/15 test | Görsel token köprüsü kurulabilir; mm/collision/cart mantığına dokunulmamalı |
| Splash sections | `sections/splash-hero.liquid`, `splash-cta.liquid`, `sticker-categories.liquid`, `sticker-process.liquid`, `trust-badges.liquid`, `sticker-collection-hero.liquid`, `sticker-product-foundation.liquid` | Ana sayfa ve collection/product yüzeylerinde kısmi marka dili | Ortak heading/button/card/frame primitive’leri çıkarılmalı |

## Selector ve token gözlemleri

- Horizon değişkenleri `--color-*`, `--font-*`, `--spacing-*`, `--style-border-radius-*` ve `--shadow-*` aileleriyle kapsamlıdır.
- `assets/custom.css` içinde marka renkleri doğrudan `#6C5CE7`, `#FD79A8`, `#FDCB6E`, `#00CEC9`, `#2D3436` ve `#FFFFFF` olarak tekrar edilir; bu tekrarlar Faz 1 semantic token adaylarıdır.
- `custom.css` içinde `!important`, `50px`/`999px` radius ve gradient tabanlı CTA kuralları bulunur. Bunlar component primitive’lerine taşınırken cascade ve geometri kararı gerektirir.
- Configurator CSS’i `--cfg-primary: #5252d4`, kendi surface/line/radius/shadow değerleri ve ayrı z-index token’ları kullanır. Bu alanın global Splash token’larına bağlanması opt-in olmalıdır.
- `prefers-reduced-motion`, `:focus-visible` ve skip link davranışları kısmen zaten vardır. Faz 1’de bunlar yeni marka primitive’leri için merkezi kabul kriterine dönüştürülmelidir.

## Ortaklaştırılacak davranış listesi

1. **Header shell:** announcement, logo lockup, desktop menu, mobile drawer, transparent header offset, search/account/cart action’ları.
2. **Search state machine:** idle, typing, loading, result, no-result, error, keyboard navigation ve overlay close/focus return.
3. **Cart state machine:** drawer open/close, quantity update, remove, discount, empty cart, error/status ve checkout handoff.
4. **Card primitives:** product/card gallery, badge, hover, quick-add, unavailable ve focus state.
5. **Form primitives:** input, select, variant, quantity, error, success, disabled ve validation announcement.
6. **Section heading primitives:** eyebrow, display heading, body copy, action link, divider ve responsive spacing.
7. **Motion/accessibility:** ink reveal, lift/rotation, hover feedback, reduced-motion fallback ve consistent focus ring.
8. **Configurator surface:** toolbar, canvas frame, selection state, modal, warning, sticky action bar ve cart confirmation; iş mantığı ayrı kalacak.
