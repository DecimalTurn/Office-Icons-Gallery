# Office-Icons-Exporter

This vbapm project exports missing Office `idMso` icons as PNG files into the parent `images` directory. Existing PNG files are left untouched. The first worksheet records exported, skipped, and unavailable counts, plus any run error.

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

## Run from Excel

Run `vba build`, open `build/Office-Icons-Exporter.xlsm`, press `Alt+F8`, and run `ExportMissingIcons`.