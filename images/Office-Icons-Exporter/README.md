# Office-Icons-Exporter

This vbapm project exports missing Office `idMso` icons as PNG files into the parent `images` directory. Existing PNG files are left untouched. Unavailable names and the run summary are recorded on the workbook's first worksheet.

From this directory, run `vba build`, then open `build/Office-Icons-Exporter.xlsm` in Excel and run `ExportMissingIcons`.