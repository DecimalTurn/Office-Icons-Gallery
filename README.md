# OfficeIconGallery

Full text searchable image gallery of Microsoft office icons using their `idMso` code.

Browser the gallery:

https://decimalturn.github.io/OfficeIconGallery/ImageMso.html

The gallery and searchable metadata are generated from PNG filenames directly in `images/`. Each filename without its `.png` extension is treated as an `idMso` value. After adding or removing icons, regenerate the metadata from this directory:

```sh
node generate-icon-metadata.js
```

