# Office Icons Gallery (OIG)

Full text searchable image gallery of Microsoft Office icons using their `idMso` code.

The gallery uses PNG assets in `images/` and generated searchable metadata. It also includes an Excel/VBA exporter for extracting icon images from an Office installation.

Browse the gallery:

https://oig.decimalturn.dev/

## Local development

Install dependencies with `pnpm install`, then start the local server with `pnpm dev`. Open http://127.0.0.1:8000.

Run the search and responsive layout test with `pnpm test:search`. Install the Playwright browser once with `pnpm exec playwright install chromium` if it is not already available.

## Local keyword review

Start the gallery with `pnpm dev` and open http://127.0.0.1:8000/keyword-review.html. Each icon ID has an editable keyword list with autocomplete suggestions. Name-derived keywords are included initially and visually marked, but can be changed or removed. IDs that use the same real image share one keyword list. Choose **Confirm review** to save it to `icon-keywords.json` and update `icon-metadata.json`. Review status is stored per icon ID in `icon-review-status.json`.

The bottom of the keyword review page contains locally saved icon reference lists. Each member shows its keywords. Create named lists, add the selected icon or any icon ID, and remove entries with the X control. New icons append to the end of the selected list. The gallery's Icon reference lists link jumps directly to this section.

The gallery and searchable metadata are generated from PNG filenames directly in `images/`. Each filename without its `.png` extension is treated as an `idMso` value. After adding or removing icons, regenerate the metadata from this directory:

```sh
node generate-icon-metadata.js
```

The generator includes every word split from each icon ID in its keywords and gives IDs with the same real image a shared keyword set. Reviewed keyword arrays in `icon-keywords.json` replace generated keyword suggestions for those IDs. It ranks related icons by shared, less-common words, keeps curated matches first, filters weak single-word matches, and limits each related-icon list to 12 entries.

It also creates one `images/by-hash/` asset per unique PNG and stores each icon's shared asset path in the metadata. The gallery uses these content-addressed URLs so IDs with identical images share a browser-cache entry. The original `images/{idMso}.png` files remain the exporter's source files.

## Acknowledgements

This project began as a fork of [OfficeIconGallery](https://github.com/kriede/OfficeIconGallery) by [kriede](https://github.com/kriede). The original project and its contributions remain attributable to their original author.

## License

The MIT license in [LICENSE](LICENSE) applies only to original contributions by DecimalTurn. It does not grant rights to pre-existing work from OfficeIconGallery or other third-party materials. The upstream revision from which this project derives did not include a license file.

The Microsoft Office icons remain copyrighted by Microsoft and are not covered by this repository's MIT license.

