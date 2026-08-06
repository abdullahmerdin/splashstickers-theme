# Shopify product import

Use [shopify-product-import.csv](../shopify-product-import.csv) in Shopify Admin > Products > Import.

The file contains the six initial Splash Stickers products:

- Custom Die Cut Stickers
- Custom Magnets
- UV DTF Transfers
- UV Printed Stickers
- Embossed Stickers
- Textile Transfers

The products are intentionally set to `draft` with `Published on online store` set to `false`. Prices, product images, inventory quantities, weights, and Shopify product taxonomy are left blank because those values were not provided. Each product has one `Default Title` variant and a draft SKU placeholder. `Inventory tracker` is blank so Shopify does not track inventory; `Inventory policy` and `Continue selling when out of stock` are set to the valid value `deny`.

Before publishing, fill in:

1. `Price` and any market-specific pricing.
2. The final SKU, inventory, weight, and tax settings.
3. Public HTTPS image URLs in `Product image URL`. Shopify cannot import local file paths; upload the product images to Shopify Files first and paste the generated URLs into the CSV.
4. `Product category` if you want Shopify's standardized taxonomy assigned.

The copy is in English to match the theme's default `en.default` locale. Import the file as new products first; do not enable overwrite for an initial test import.
