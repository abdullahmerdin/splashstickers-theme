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
| Die Cut | `how-it-works-die-cut` | `page.how-it-works-die-cut` |
| Magnet | `how-it-works-magnet` | `page.how-it-works-magnet` |
| UV DTF | `how-it-works-uv-dtf` | `page.how-it-works-uv-dtf` |
| UV | `how-it-works-uv` | `page.how-it-works-uv` |
| Emboss | `how-it-works-emboss` | `page.how-it-works-emboss` |
| Textile | `how-it-works-textile` | `page.how-it-works-textile` |
| Configurator | `how-it-works-configurator` | `page.how-it-works-configurator` |
| Background removal | `how-it-works-background-removal` | `page.how-it-works-background-removal` |
| Browse and choose | `how-it-works-browse-and-choose` | `page.how-it-works-browse-and-choose` |
| Cart and checkout | `how-it-works-cart-and-checkout` | `page.how-it-works-cart-and-checkout` |
| Contact and help | `how-it-works-contact-and-help` | `page.how-it-works-contact-and-help` |

Each detail template sets the guide fallback key and contains four editable
step blocks. The section still reads the page handle on the storefront, while
the separate templates allow each guide page to have its own Theme Editor
settings. The page body can remain empty; the theme section supplies the
localized content.

## Theme Editor controls

Open the relevant page template in Online Store > Themes > Customize. Leave a
text field blank to keep the active language translation, or enter a custom
value to override it for that page. The hub has editable hero, card, quick-path,
and link settings. Products and Site pages expose reorderable, hideable cards.
Guide pages expose editable overview copy, step blocks, note copy, and CTA
settings. Every layout also has Visibility and Child visibility groups in the
Theme Editor. Hub, directory, and guide sections can be shown or hidden, and
their child labels, titles, descriptions, numbers, links, and quick-path steps
can be controlled individually. Directory cards and guide steps also expose
the same child controls inside each block, alongside their whole-card/step
visibility toggle. The guide's planned status remains independently toggleable
for the Background removal guide.

## Navigation

Add `How It Works` to the main menu after creating the pages. The homepage's
short process section now links to `/pages/how-it-works` as the full guide.

`Background removal` is labelled as planned because the current configurator
supports artwork upload and sheet background selection but does not yet expose
an image-background removal tool. The page explains that limitation instead of
presenting an unavailable feature as live.
