# How It Works content architecture

The theme now provides a guided information architecture for the roadmap's
initial product range and the site's main customer-facing tools.

## Shopify pages to create

Create these pages in Shopify Admin with the exact handles below, then assign
the matching template:

| Page title | Handle | Template |
| --- | --- | --- |
| How It Works | `how-it-works` | `page.how-it-works` |
| Products | `how-it-works-products` | `page.how-it-works-products` |
| Site | `how-it-works-site` | `page.how-it-works-site` |
| Die Cut | `how-it-works-die-cut` | `page.how-it-works-guide` |
| Magnet | `how-it-works-magnet` | `page.how-it-works-guide` |
| UV DTF | `how-it-works-uv-dtf` | `page.how-it-works-guide` |
| UV | `how-it-works-uv` | `page.how-it-works-guide` |
| Emboss | `how-it-works-emboss` | `page.how-it-works-guide` |
| Textile | `how-it-works-textile` | `page.how-it-works-guide` |
| Configurator | `how-it-works-configurator` | `page.how-it-works-guide` |
| Background removal | `how-it-works-background-removal` | `page.how-it-works-guide` |
| Browse and choose | `how-it-works-browse-and-choose` | `page.how-it-works-guide` |
| Cart and checkout | `how-it-works-cart-and-checkout` | `page.how-it-works-guide` |
| Contact and help | `how-it-works-contact-and-help` | `page.how-it-works-guide` |

The guide template reads the page handle, so one template can safely power all
product and site detail pages without duplicating Liquid or JSON. The page
body can remain empty; the theme section supplies the localized content.

## Navigation

Add `How It Works` to the main menu after creating the pages. The homepage's
short process section now links to `/pages/how-it-works` as the full guide.

`Background removal` is labelled as planned because the current configurator
supports artwork upload and sheet background selection but does not yet expose
an image-background removal tool. The page explains that limitation instead of
presenting an unavailable feature as live.
