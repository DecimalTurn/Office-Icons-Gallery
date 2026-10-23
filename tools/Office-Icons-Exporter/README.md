# Office-Icons-Exporter

This vbapm project exports Office `idMso` icons as PNG files into the repository's sibling `images` directory. For each ID, it generates a temporary PNG and compares its SHA-256 with the existing file. Matching images remain untouched; changed images replace the existing PNG, and missing images are added. A failed export or hash check leaves the existing PNG untouched.

## ID list sources

`idMso-List.txt` combines the 3,852 IDs in the original exporter list with IDs from the [`christianjunk/ImageMso` project](https://github.com/christianjunk/ImageMso), in particular `src/Excel.Images/Images.settings` (`NamesTop` and `NamesBottom`). That project describes its inventory as a compilation of the 2007 and 2010 Office Icons Gallery downloads, the `[MS-CUSTOMUI]` `imageMso` table, and the `[MS-CUSTOMUI2]` supporting documentation. The Microsoft source links are listed in the [ImageMso project README](https://github.com/christianjunk/ImageMso/blob/main/README.md).

The original 3,852-ID list is preserved byte-for-byte in [`idMso-List-archive-2026-10-22.txt`](idMso-List-archive-2026-10-22.txt). On 2026-10-22, 5,489 IDs supported by the C# project's Office 2013+ logic were added, producing 9,341 IDs total. The C# `NamesTop` and `NamesBottom` collections contain 8,898 unique IDs. Of the original list, 443 IDs do not appear in either collection. Five other original IDs do appear in the collections but are in `Exclude2013`: `JotInkStyle1`, `JotSendPdf`, `MeetingRequest`, `OfficeDiagnostics`, and `ProjectTaskDrivers`. Those five remain in the exporter list because they were already present in the original inventory.

The C# inventory is a source for candidate IDs, not a guarantee that every ID is available in every installed Office version. The exporter records IDs that the local Excel installation cannot return.

## Run from the command line

Use Node.js 22 or later and desktop Excel on Windows. Install vbapm with `npm install -g vbapm`. From this directory, build the workbook and run the extraction:

```powershell
vba build
vba run IconExporter.RunExportMissingIcons --file=build/Office-Icons-Exporter.xlsm
```

The command prints a summary. The workbook's first worksheet contains the counts and any unavailable `idMso` names. `vba run` closes Excel when it finishes.

To record the result for every `idMso`, including existing PNGs, unavailable icons, and errors, run the verbose entry point:

```powershell
vba run IconExporter.RunExportMissingIconsVerbose --file=build/Office-Icons-Exporter.xlsm
```

The first worksheet lists each icon's status and details. An unavailable icon means Office returned no image or rejected the `idMso` with VBA error 5. Other failures include the operation and error code or description, and remain separate from unavailable icons.

## Office fallback images

`assets/placeholders/manifest.tsv` lists known Office fallback-image SHA-256 hashes. The canonical orange-circle PNG is stored beside the manifest. The metadata generator tags every image with a matching hash as `imageStatus: "placeholder"`, so the gallery can label it and the detail page can explain that it is shared rather than a unique icon. The exporter uses the same manifest and reports an explicit status change if an image moves between a known placeholder hash and a real-image hash.

## Run a batch

The batch function takes a 1-based start position in `idMso-List.txt` and a maximum number of IDs. Use this to test a small slice or resume through the list in batches:

```powershell
vba run IconExporter.RunExportIconsBatch 1 100 --file=build/Office-Icons-Exporter.xlsm
vba run IconExporter.RunExportIconsBatch 101 100 --file=build/Office-Icons-Exporter.xlsm
```

The first command processes entries 1 through 100; the second processes entries 101 through 200. Set the second argument to `0` to process from the start position through the end of the list. The batch run is verbose and records each status and SHA-256 comparison in the workbook's first worksheet.

## Run from Excel

Run `vba build`, open `build/Office-Icons-Exporter.xlsm`, press `Alt+F8`, and run `ExportMissingIcons`.