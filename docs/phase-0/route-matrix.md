# Faz 0 route matrisi

## Global shell

Her normal storefront route’u `layout/theme.liquid` üzerinden aynı shell’i kullanır:

| Katman | Kaynak | Audit kapsamı |
| --- | --- | --- |
| Announcement bar | `sections/header-group.json` → `sections/header-announcements.liquid` | İçerik, divider, hareket ve canlı bölge davranışı |
| Header / logo / navigation | `sections/header-group.json` → `sections/header.liquid` | Desktop menü, mobil drawer, transparent header, localization |
| Header actions | `snippets/header-actions.liquid` | Search, account ve cart bubble |
| Global style loading | `snippets/stylesheets.liquid` | `base.css`, `custom.css`, overflow style sırası |
| Theme tokens | `snippets/theme-styles-variables.liquid`, `config/settings_*.json` | Renk, typography, spacing, radius, border ve shadow kaynakları |
| Cart / search overlays | `snippets/cart-drawer.liquid`, `snippets/search-modal.liquid`, `snippets/theme-drawer.liquid` | Aç/kapat, focus trap, loading, empty ve error durumları |
| Footer | `sections/footer-group.json` → `sections/footer.liquid`, `sections/footer-utilities.liquid` | Newsletter, policy, sosyal bağlantılar ve responsive düzen |
| Accessibility | `snippets/skip-to-content-link.liquid`, `assets/base.css` | Skip link, keyboard focus ve reduced-motion davranışı |

## Route tablosu

| Route / örnek URL | Template | Ana section / block’lar | Kritik davranışlar | Öncelik |
| --- | --- | --- | --- | --- |
| Home `/` | `templates/index.json` | `hero`, `splash-hero`, `sticker-categories`, `product-list`, `splash-cta`, `sticker-process`, `trust-badges` | Transparent header geçişi, drawing canvas, category scroll, product hover/quick-add | P0 |
| Collection `/collections/:handle` | `templates/collection.json` | `sticker-collection-hero`, `main-collection`, filters, product card | Filter/sort, pagination, unavailable/empty state, mobile grid | P0 |
| Search `/search?q=...` | `templates/search.json` | `search-header`, `search-results` | Predictive search, no-result, loading, facets ve query persistence | P0 |
| Product `/products/:handle` | `templates/product.json` | `sticker-configurator`, `product-information`, recommendations | Variant/price, media, quantity, add-to-cart ve configurator entegrasyonu | P0 |
| Gangsheet product `/products/:handle` | `templates/product.product-gangsheet.json` | `sticker-configurator` | Upload, canvas, zoom/pan, multi-select, collision, auto-arrange, PDF/cart payload | P0 |
| Cart `/cart` | `templates/cart.json` | `main-cart`, `product-list` | Quantity, remove, discount, cart note, checkout CTA ve empty cart | P0 |
| About `/pages/about` | `templates/page.about.json` | `main-page` | Rich text ve responsive content width | P1 |
| Contact `/pages/contact` | `templates/page.contact.json` | `main-page`, `section` / contact form | Form validation, error/success, focus ve spam/submit durumu | P1 |
| 404 | `templates/404.json` | `main-404`, `product-list` | Recovery CTA, recommendations, unavailable/empty state | P1 |
| Password | `templates/password.json`, `layout/password.liquid` | `password` | Password dialog, email signup, error state ve mobile layout | P1 |

## Route dışı tamamlayıcı yüzeyler

Audit sırasında ayrıca blog/article, list-collections, generic page, gift card, policy/help, account/localization ve quick-add modal yüzeyleri kontrol edilmelidir. Bunlar ana 10’lu route matrisi dışında kalır ancak global shell ve token değişikliklerinden etkilenir.
