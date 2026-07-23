# Faz 0 kabul checklist’i

## Kaynak audit’i

- [x] 10 hedef route’un template karşılığı belirlendi.
- [x] Global shell’in header, footer, overlay ve style entrypoint kaynakları belirlendi.
- [x] Horizon token/selector/component kaynakları ve Splash istisnaları kaydedildi.
- [x] Mevcut Splash section’larının ortaklaştırılacak davranışları listelendi.
- [x] Configurator iş mantığının görsel dönüşümden ayrı tutulacağı kaydedildi.
- [x] Ana sayfa sürüm rozeti `v1.1` olarak güncellendi.

## Preview / görsel baseline

- [ ] 1440 px desktop’ta 10 route yakalandı.
- [ ] 768 px tablet’te 10 route yakalandı.
- [ ] 375 px mobile’da 10 route yakalandı.
- [ ] Header/footer ve transparent-header geçişleri karşılaştırıldı.
- [ ] Search, cart, mobile drawer, empty/error ve configurator durumları yakalandı.
- [ ] Yatay taşma ve belirgin layout shift yok.

## İşlevsel doğrulama

- [x] `npm.cmd run check:configurator` başarılı.
- [x] Configurator testleri 15/15 geçti.
- [ ] Shopify Theme Check preview/theme ortamında temiz.
- [ ] Console error ve kırık link taraması preview ortamında temiz.
- [ ] Variant fiyatı, cart quantity ve configurator JSON payload’ı preview’da doğrulandı.

## Erişilebilirlik

- [x] Skip link ve `:focus-visible` kaynakları mevcut.
- [x] Reduced-motion kaynakları mevcut ve baseline kapsamına alındı.
- [ ] Tüm route’larda keyboard tab sırası kontrol edildi.
- [ ] Contrast ve form error/success announcement kontrol edildi.
- [ ] Mobile dokunma hedefleri ve yatay taşma kontrol edildi.

## Faz geçiş kararı

Kaynak audit’i ve dokümantasyon tamamlandı. Görsel/preview maddeleri, erişilebilirlik son kontrolleri ve Theme Check gerçek Shopify Preview ortamında çalıştırıldıktan sonra Faz 0 tamamen imzalanmış kabul edilir. Bu maddeler repository erişimiyle doğrulanamadığı için bilerek açık bırakılmıştır.
