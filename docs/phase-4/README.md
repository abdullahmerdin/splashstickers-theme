# Faz 4 — Product ve Splash Studio polish

Güncelleme tarihi: 2026-07-29

Bu paket, ürün detay sayfası ile gangsheet ürünündeki Splash Studio yüzeylerinin
marka token’ları, erişilebilirlik davranışları ve satış akışıyla birlikte
doğrulanmasını tanımlar.

## Kapsam

- Ürün medya galerisi, ürün detay kartı, varyant seçimi, fiyat, adet ve add-to-cart.
- Mobil sticky add-to-cart.
- Gangsheet ürün şablonundaki Splash Studio başlık, quick start, canvas, toolbar,
  artwork yükleme, çözünürlük uyarısı, PDF export ve cart durumları.
- Feature toggle’ların gerçek davranışa bağlanması: clipboard, undo/redo,
  auto-arrange ve PDF export.
- Keyboard focus, live status, reduced-motion ve küçük ekran dokunma hedefleri.

## Repo içi doğrulama

`npm.cmd run check:configurator` komutu bundle senkronizasyonunu, JavaScript
sözdizimini ve configurator davranış testlerini çalıştırır. 2026-07-29 itibarıyla
16 testin tamamı geçmektedir.

## Dış bağımlılık

Shopify Preview oturumu olmadan Theme Check, gerçek varyant/cart payload’ı,
checkout geçişi, console error taraması ve 1440/768/375 px görsel baseline’ı
doğrulanamaz. Bu maddeler [kabul checklist’inde](acceptance-checklist.md)
bilerek açık bırakılır; Preview kanıtı eklendiğinde Faz 4 imzalanır.
