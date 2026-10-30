# Office Icons Gallery (OIG)

Full text searchable image gallery of Microsoft Office icons using their `idMso` code.

The gallery uses PNG assets in `images/` and generated searchable metadata. It also includes an Excel/VBA exporter for extracting icon images from an Office installation.

Browse the gallery:

https://oig.decimalturn.dev/

## Local development

Install dependencies with `pnpm install`, then start the local server with `pnpm dev`. Open http://127.0.0.1:8000.

Run the search and responsive layout test with `pnpm test:search`. Install the Playwright browser once with `pnpm exec playwright install chromium` if it is not already available.

Gallery URL state uses the `search_mso`, `exclude_placeholders`, and `page` query parameters. Icon detail pages and keyword review use `icon_id`. Older gallery, detail-page, and review parameter spellings are accepted and replaced with the current names.

## Local keyword review

Start the gallery with `pnpm dev` and open http://127.0.0.1:8000/keyword-review.html. The selected icon is shareable through the `icon_id` URL parameter. Review navigation includes one representative per distinct real image; searching an identical-image ID opens that representative. Each image has an editable keyword list with autocomplete suggestions. Exact words from an icon ID or its identical-image aliases are excluded from keywords. Confirming a review saves the shared keywords for every ID using that real image to `icon-keywords.json` and updates `icon-metadata.json`. Placeholder IDs are not grouped because their shared fallback image does not identify the underlying icon. Review status is stored per representative ID in `icon-review-status.json`.

Open http://127.0.0.1:8000/name-synonyms.html to manage synonyms. The shared dictionary in `icon-synonyms.json` adds alternate keywords when a source term appears in either an icon ID or its reviewed keywords. The keyword review page locks generated synonym terms and identifies their source.

The bottom of the keyword review page contains locally saved icon reference lists. Each member shows its keywords. Create named lists, add the selected icon or any icon ID, and remove entries with the X control. New icons append to the end of the selected list. The gallery's Icon reference lists link jumps directly to this section.

The gallery and searchable metadata are generated from PNG filenames directly in `images/`. Each filename without its `.png` extension is treated as an `idMso` value. After adding or removing icons, regenerate the metadata from this directory:

```sh
node generate-icon-metadata.js
```

The generator uses related terms for icon IDs as keywords, but excludes every exact icon-name word. IDs with the same real image share a keyword set. Reviewed keyword arrays in `icon-keywords.json` replace generated keyword suggestions for those IDs. It writes related-icon recommendations and identical-image ID lists to `icon-details/{iconId}.json` sidecars instead of including them in `icon-metadata.json`. It ranks related icons by shared, less-common words, keeps curated matches first, filters weak single-word matches, and limits each related-icon list to 12 entries.

It also creates one `images/by-hash/` asset per unique PNG and stores each icon's shared asset path in the metadata. The gallery uses these content-addressed URLs so IDs with identical images share a browser-cache entry. The original `images/{idMso}.png` files remain the exporter's source files.

## Acknowledgements

This project began as a fork of [OfficeIconGallery](https://github.com/kriede/OfficeIconGallery) by [kriede](https://github.com/kriede). The original project and its contributions remain attributable to their original author. Regarding the list of icons, it was expanded using the reference provided in [christianarielli/ImageMso](https://github.com/christianarielli/ImageMso.).

## License

The MIT license in [LICENSE](LICENSE) applies only to original contributions by DecimalTurn. It does not grant rights to pre-existing work from OfficeIconGallery or other third-party materials. The upstream revision from which this project derives did not include a license file.

The Microsoft Office icons remain copyrighted by Microsoft and are not covered by this repository's MIT license.

