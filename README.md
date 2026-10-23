# OfficeIconGallery

Full text searchable image gallery of Microsoft Office icons using their `idMso` code.

The gallery uses PNG assets in `images/` and generated searchable metadata. It also includes an Excel/VBA exporter for extracting icon images from an Office installation.

Browser the gallery:

https://decimalturn.github.io/OfficeIconGallery/ImageMso.html

## Local development

Install dependencies with `pnpm install`, then start the local server with `pnpm dev`. Open http://127.0.0.1:8000.

Run the search and responsive layout test with `pnpm test:search`. Install the Playwright browser once with `pnpm exec playwright install chromium` if it is not already available.

The gallery and searchable metadata are generated from PNG filenames directly in `images/`. Each filename without its `.png` extension is treated as an `idMso` value. After adding or removing icons, regenerate the metadata from this directory:

```sh
node generate-icon-metadata.js
```

