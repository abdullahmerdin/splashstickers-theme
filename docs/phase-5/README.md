# Faz 5 — Cart, içerik ve utility polish

Güncelleme tarihi: 2026-07-30

Bu paket, Notion’daki **Tema Değişiklikleri** planının Faz 5 kapsamını uygular:
cart page/drawer, blog/article ve genel içerik sayfaları, About/Contact ve asset
attribution, 404/password, account-localization-policy kabukları ve ortak form
durumları.

## Uygulama yaklaşımı

- Shopify/Horizon cart, form ve section davranışları korunur; değişiklikler route
  sınıfları ve Splash token’ları üzerinden görsel katmanda yapılır.
- Cart satırları, quantity selector, subtotal/total, discount/note alanları ve
  checkout CTA aynı kart/panel yüzeyine bağlanır.
- Blog kartları ve article içeriği sticker/kart yüzeyleriyle; About/Contact ve
  policy içerikleri sıcak beyaz yüzey, ink metin ve mor link diliyle sunulur.
- 404 ve password ekranlarına hafif ink/sticker motifleri eklenir; password
  dialog ve password footer aynı sistemle eşleşir.
- Account ve yeni customer-account bileşenlerinin tema tarafından erişilebilen
  kabuğu stillenir. Shopify checkout ekranının tema dışı kısımları değiştirilmez.
- `prefers-reduced-motion`, focus, invalid, error, success ve disabled durumları
  ortaklaştırılır.

## Doğrulama

Repo içi kontrol:

```powershell
npm.cmd run check:phase5
npm.cmd run check:phase4
npm.cmd run check:configurator
```

Shopify Preview’da ayrıca cart empty/filled, quantity update, discount/note,
checkout handoff, Contact form success/error, localization drawer, policy,
account, 404 ve password akışları desktop/tablet/mobile viewport’larda kontrol
edilmelidir.
