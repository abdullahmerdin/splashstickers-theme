# Faz 0 — Audit ve referans baseline

Güncelleme tarihi: 2026-07-23

Bu paket, tema dönüşümüne başlamadan önceki kaynak-kod baseline’ını kayıt altına alır. Kapsam, Notion’daki [Tema Değişiklikleri](https://app.notion.com/p/3a640702645581d18ca6def16e4f31f5) planındaki Faz 0 çıktılarıyla eşleştirilmiştir.

## Çıktılar

- [Route matrisi](route-matrix.md): hedef sayfa tipleri, template’ler, section’lar ve kritik davranışlar.
- [Horizon envanteri](horizon-inventory.md): global selector, token, component ve davranış kaynakları.
- [Baseline sözleşmesi](baseline.md): 1440, 768 ve 375 genişliklerinde tekrar edilebilir ekran görüntüsü planı.
- [Kabul checklist’i](acceptance-checklist.md): görsel regresyon, erişilebilirlik, işlev ve yayın öncesi kontroller.

## Durum

Kaynak-kod audit’i tamamlandı. Görsel ekran görüntülerinin kendisi Shopify Preview/mağaza oturumu gerektirdiğinden baseline belgesinde bu dış bağımlılık ve capture adımları açıkça kayıtlıdır; kaynak Liquid dosyalarından sahte ekran görüntüsü üretilmemiştir.

Faz 1’e geçiş koşulu, `baseline.md` içindeki ekran görüntülerinin gerçek preview ortamında alınması ve `acceptance-checklist.md` içindeki görsel/regresyon maddelerinin işaretlenmesidir.
