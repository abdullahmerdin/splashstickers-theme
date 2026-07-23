# Faz 0 baseline sözleşmesi

## Capture matrisi

Baseline, aynı preview verisi ve aynı route seed’iyle aşağıdaki üç viewport’ta alınmalıdır:

| Viewport | CSS genişliği | Önerilen yükseklik | Dosya eki |
| --- | ---: | ---: | --- |
| Desktop | 1440 px | 900 px | `desktop-1440x900` |
| Tablet | 768 px | 1024 px | `tablet-768x1024` |
| Mobile | 375 px | 812 px | `mobile-375x812` |

10 hedef route × 3 viewport = **30 baseline görüntüsü** hedeflenir. Uzun sayfalarda tam-page capture yanında ilk viewport kırpımı da saklanmalıdır.

## Route seed’leri

| Route | Gerekli preview verisi | Capture notu |
| --- | --- | --- |
| Home | Ana sayfa section ayarları ve en az 4 ürün | Transparent header, Splash hero ve ilk ürün grid’i görünür olmalı |
| Collection | En az 8 ürün, en az 2 filtre değeri | Default, filter open ve no-result varyantları ayrıca kontrol edilir |
| Search | Sonuç veren ve sonuçsuz iki query | Predictive overlay ile tam search page ayrı kontrol edilir |
| Product | Görsel, en az 2 variant, stoklu ürün | Variant değişimi, quantity ve add-to-cart görünür olmalı |
| Gangsheet product | Configurator’a bağlı ürün ve örnek artwork | Upload/canvas/sticky action bar; gerçek PDF üretimi capture kapsamı değildir |
| Cart | En az 1 normal line item ve 1 configurator line item | Quantity, remove, discount/error ve checkout geçişi kontrol edilir |
| About | About page içeriği ve attribution | Rich text ve asset attribution yüzeyleri |
| Contact | İletişim formu | Empty, invalid ve success durumları |
| 404 | Geçersiz URL | Recovery CTA ve recommendation grid |
| Password | Password page ayarları | Dialog, signup ve invalid password durumları |

## Görsel karşılaştırma kuralları

- Capture öncesi viewport, zoom (%100), locale, currency ve preview theme sabitlenir.
- Browser console error, yatay overflow ve layout shift ayrıca kaydedilir.
- Header/footer, search/cart overlay ve mobile drawer açık/kapalı durumları aynı baseline setinde belirtilir.
- Configurator’da artwork görselleri test seed’iyle sabitlenir; rastgele upload ile karşılaştırma yapılmaz.
- Gerçek screenshot’lar Shopify Preview URL/oturumu gerektirir. Bu repo içinde browser preview erişimi olmadığı için bu dosya capture sözleşmesini ve beklenen artefakt adlarını tanımlar; görüntü varmış gibi işaretlenmez.

## Beklenen artefakt düzeni

```text
docs/phase-0/baseline/
  home/desktop-1440x900.png
  home/tablet-768x1024.png
  home/mobile-375x812.png
  ...
  manifest.json
```

`manifest.json` her görüntü için route, viewport, preview theme id, capture tarihi ve git commit SHA alanlarını taşımalıdır.
