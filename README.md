# Office Icons Gallery (OIG)

Full text searchable image gallery of Microsoft Office icons using their `idMso` code.

The gallery uses PNG assets in `images/` and generated searchable metadata. It also includes an Excel/VBA exporter for extracting icon images from an Office installation.

Browse the gallery:

https://oig.decimalturn.dev/

## Local development

Install dependencies with `pnpm install`, then start the local server with `pnpm dev`. Open http://127.0.0.1:8000.

Run the search and responsive layout test with `pnpm test:search`. Install the Playwright browser once with `pnpm exec playwright install chromium` if it is not already available.

## Local description review

Install [Ollama for Windows](https://ollama.com/download), then download a vision model in PowerShell:

```powershell
ollama pull gemma3:4b
```

Start the gallery with `pnpm dev` and open http://127.0.0.1:8000/description-review.html. Choose an icon, generate a visual-only draft, and edit it. **Save Draft** stores a local draft. **Mark Reviewed** writes the approved description to the tracked `icon-descriptions.json` and updates `icon-metadata.json` for every ID using the same SHA-256 image.

Local drafts are stored in the ignored `.description-review-drafts.json` file. Model suggestions are never written to tracked descriptions unless you edit and mark them reviewed. Model requests go through the gallery's loopback-only server to Ollama at `127.0.0.1:11434`.

The gallery and searchable metadata are generated from PNG filenames directly in `images/`. Each filename without its `.png` extension is treated as an `idMso` value. After adding or removing icons, regenerate the metadata from this directory:

```sh
node generate-icon-metadata.js
```

The generator also splits PascalCase icon IDs into words and ranks related icons by shared, less-common words. It keeps curated matches first, filters weak single-word matches, and limits each related-icon list to 12 entries.

It also creates one `images/by-hash/` asset per unique PNG and stores each icon's shared asset path in the metadata. The gallery uses these content-addressed URLs so IDs with identical images share a browser-cache entry. The original `images/{idMso}.png` files remain the exporter's source files.

## Acknowledgements

This project began as a fork of [OfficeIconGallery](https://github.com/kriede/OfficeIconGallery) by [kriede](https://github.com/kriede). The original project and its contributions remain attributable to their original author.

## License

The MIT license in [LICENSE](LICENSE) applies only to original contributions by DecimalTurn. It does not grant rights to pre-existing work from OfficeIconGallery or other third-party materials. The upstream revision from which this project derives did not include a license file.

The Microsoft Office icons remain copyrighted by Microsoft and are not covered by this repository's MIT license.

