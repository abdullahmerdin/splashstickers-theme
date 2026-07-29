# Faz 4 kabul checklist’i

## Uygulama kapsamı

- [x] Product media/details surfaces Splash token’larına bağlandı.
- [x] Sticky add-to-cart yüzeyi Splash token’larına bağlandı.
- [x] Splash Studio editor, controls, modal ve feedback state’leri markalandı.
- [x] Gangsheet template quick start, resolution feedback ve analytics ayarlarını içeriyor.
- [x] Clipboard, undo/redo, auto-arrange ve PDF export toggle’ları çalışırken ayarları gözetiyor.
- [x] Studio root, modal, quantity, live status ve focus erişilebilirlik işaretlerine sahip.

## Otomatik doğrulama

- [x] `npm.cmd run check:configurator` başarılı.
- [x] Configurator bundle/source senkron kontrolü başarılı.
- [x] Configurator testleri 16/16 geçti.

## Shopify Preview doğrulaması

- [ ] Ürün sayfası 1440 × 900, 768 × 1024 ve 375 × 812 viewport’larında kontrol edildi.
- [ ] Gangsheet Studio aynı üç viewport’ta kontrol edildi.
- [ ] Upload, resize, rotate, multi-select, auto-arrange, undo/redo, zoom/pan ve PDF export kontrol edildi.
- [ ] Varyant fiyatı, sheet quantity ve configurator line-item properties gerçek cart’ta doğrulandı.
- [ ] Mobil sticky add-to-cart ve checkout geçişi doğrulandı.
- [ ] Keyboard tab sırası, focus görünürlüğü, reduced-motion ve touch hedefleri kontrol edildi.
- [ ] Console error, broken link, yatay overflow ve belirgin layout shift yok.
- [x] Shopify Theme Check temiz.

## Preview smoke evidence

- [x] Standard product page checked at 1440, 768, and 375 px; no horizontal overflow, Studio, or collision-test content.
- [x] Gangsheet Studio checked at 1440, 768, and 375 px; ready state, toolbar, Add Design modal, onboarding dismiss, and console smoke checks passed.
- [x] User confirmed the live storefront is working without a current issue.
- [x] Shopify Theme Check passed locally with 344 files inspected and no offenses.

## Faz geçiş kararı

Repo içi uygulama ve otomatik kontroller tamamlandı. Son imza, yukarıdaki
Shopify Preview maddeleri gerçek mağaza/preview oturumunda kanıtlandıktan sonra
verilmelidir.
