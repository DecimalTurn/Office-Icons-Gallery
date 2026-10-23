# Curated icon descriptions

`icon-descriptions.json` is the source of truth for image-reviewed descriptions. Add new descriptions there, keyed by icon ID, then regenerate `icon-metadata.json`:

```sh
node generate-icon-metadata.js
```

Generate three disjoint candidate groups of 36 uncurated, non-placeholder icons:

```sh
pnpm run descriptions:candidates --count 36 --batches 3
```

Choose a specific group for parallel review with `--batch`. An optional `--prefix` narrows the pool to a name family:

```sh
pnpm run descriptions:candidates --count 36 --batches 3 --batch 1 --prefix Animation
```

Create a labeled HTML contact sheet for the same candidate slice:

```sh
pnpm run descriptions:contact-sheet --count 36 --batches 3 --batch 2
```

Open `.description-contact-sheet.html` in a browser. Inspect the PNG artwork, write one concise visible description per selected ID, and avoid assigning an Office action when the image does not support it. Run the description regression tests after updating the JSON:

```sh
pnpm exec playwright test tests/related-icons.spec.js tests/description-workflow.spec.js --workers=1
```