# Slice Studio — Multi-Image Slicer

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/HTML)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=111)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![JSZip](https://img.shields.io/badge/JSZip-3.10.1-7B68EE)](https://stuk.github.io/jszip/)
[![No build step](https://img.shields.io/badge/build-none-00FFFF)](#quick-start)
[![Runs in browser](https://img.shields.io/badge/platform-browser-3264FA)](#browser-requirements)

**Slice Studio** is a lightweight, browser-based tool for splitting one or more images into PNG tiles. Place guides manually or generate evenly spaced rows and columns, preview the resulting grid, and export every slice in a single ZIP archive.

The app has no backend and no build process. Image decoding, guide editing, slicing, PNG encoding, and ZIP generation all happen in the browser.

## Table of contents

- [Features](#features)
- [Quick start](#quick-start)
- [How to use](#how-to-use)
- [Controls and shortcuts](#controls-and-shortcuts)
- [How slicing works](#how-slicing-works)
- [Export format](#export-format)
- [Fixed-size output](#fixed-size-output)
- [Project structure](#project-structure)
- [Technical overview](#technical-overview)
- [Browser requirements](#browser-requirements)
- [Privacy](#privacy)
- [Known limitations](#known-limitations)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

## Features

- Upload multiple images using the file picker or drag and drop.
- Keep independent guides and viewport settings for every image.
- Add vertical and horizontal guides interactively.
- Drag guides with live pixel and percentage feedback.
- Split an image into 2–50 evenly spaced rows or columns.
- Preview every slice with its row, column, and pixel dimensions.
- Zoom toward the pointer and pan around large images.
- Export slices from the original full-resolution image, independently of the current zoom level.
- Optionally pad or center-crop every slice to an exact output size.
- Export all loaded images as lossless PNG files inside one compressed ZIP archive.
- Automatically generate predictable, filesystem-safe output names.
- Work entirely on the client side—no image upload server is required.

## Quick start

### Option 1: open the app directly

Clone or download the repository, then open `index.html` in a modern browser.

```bash
git clone <repository-url>
cd "Multi-Image Slicer"
```

No dependency installation or compilation is required.

> [!NOTE]
> Slice Studio loads JSZip 3.10.1 from cdnjs. An internet connection is therefore required when the page is first loaded unless JSZip is hosted locally.

### Option 2: run a local web server

Using a local server is recommended because it behaves consistently across browsers.

With Python:

```bash
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

With Node.js:

```bash
npx serve .
```

Open the address printed in the terminal.

## How to use

1. **Add images.** Click **Upload Images**, or drag image files onto the workspace. You can select multiple files at once.
2. **Select an image.** Choose a file in the left sidebar. Each image keeps its own guides and zoom/pan state.
3. **Define the slices.**
   - Click **Vertical** or **Horizontal** to add one guide.
   - Enter a value from `2` to `50`, then click **Cols** or **Rows** to create equal divisions.
   - Drag a guide to position it precisely. The tooltip displays its original-image pixel position and percentage.
4. **Inspect the result.** Click **Preview** to display each tile's row/column index and dimensions.
5. **Choose output sizing.** Leave **Fixed Size** disabled to preserve each slice's natural dimensions, or enable it and enter the required width and height.
6. **Export.** Click **Export ZIP**. The browser downloads one archive containing PNG slices for every image in the project list.

> [!TIP]
> Adding a guide places it in the center of the largest unsplit gap. Repeated clicks therefore produce useful subdivisions without stacking new guides at the same position.

## Controls and shortcuts

| Action | Control |
| --- | --- |
| Upload images | **Upload Images** or drag files onto the workspace |
| Select an image | Click its name in **Project Files** |
| Remove an image | Click the `×` button beside the file |
| Add a guide | **Vertical** or **Horizontal** |
| Move a guide | Left-drag the guide |
| Remove one guide | Double-click it, or hover it and press `Delete` / `Backspace` |
| Remove all guides from the active image | **Clear** |
| Create equal columns or rows | Enter a count, then choose **Cols** or **Rows** |
| Zoom toward the pointer | Mouse wheel |
| Zoom from the center | **+** / **−** toolbar buttons |
| Fit the image to the workspace | **Fit** |
| Pan | Hold `Space` and left-drag, or middle-drag |
| Toggle tile labels and dimensions | **Preview** |
| Toggle exact output dimensions | **Fixed Size** |
| Export all images | **Export ZIP** |

## How slicing works

Guides are stored as normalized positions from `0` to `1`, rather than screen coordinates. This keeps every cut aligned to the original image when the view is zoomed, panned, resized, or fitted to the workspace.

- A vertical guide adds a column boundary.
- A horizontal guide adds a row boundary.
- Image edges are always included as boundaries.
- `V` unique vertical guides create `V + 1` columns.
- `H` unique horizontal guides create `H + 1` rows.
- The total number of tiles is `(V + 1) × (H + 1)`.
- Overlapping guides are deduplicated at export time, preventing zero-pixel slices.
- An image with no guides is exported as one full-size tile.

Equal splits replace the existing guides on the selected axis. For example, choosing `4` and clicking **Cols** creates three vertical guides at 25%, 50%, and 75%, producing four columns. Guides on the other axis remain unchanged.

## Export format

All slices are encoded as PNG and collected in a DEFLATE-compressed ZIP archive.

Each file follows this pattern:

```text
<image-name>_Row<row-number>_Col<column-number>.png
```

For example, a 2 × 3 grid created from `landscape.jpg` produces:

```text
landscape_Row1_Col1.png
landscape_Row1_Col2.png
landscape_Row1_Col3.png
landscape_Row2_Col1.png
landscape_Row2_Col2.png
landscape_Row2_Col3.png
```

Rows and columns are numbered from `1`, starting at the top-left corner. Unsafe filename characters such as `\ / : * ? " < > |` are replaced with underscores.

Archive naming:

| Export scope | ZIP filename |
| --- | --- |
| One image | `<image-name>_slices.zip` |
| Multiple images | `sliced_images_<image-count>.zip` |

All images currently listed in the sidebar are exported, not only the active image.

## Fixed-size output

Enable **Fixed Size** to force every exported tile onto a canvas with the specified width and height, from `1 × 1` through `10000 × 10000` pixels.

- If a slice is smaller than the target canvas, it is centered and surrounded by transparent padding.
- If a slice is larger than the target canvas, it is center-cropped.
- The slice is not stretched or scaled.
- The setting applies to every image and tile in the next export.

This is useful for sprite sheets, machine-learning datasets, game assets, thumbnails, and other workflows that require uniform dimensions.

## Project structure

```text
Multi-Image Slicer/
├── index.html   # Application markup, toolbar, sidebar, and JSZip CDN import
├── styles.css   # Responsive dark interface and interaction states
├── app.js       # Image management, canvas rendering, guides, slicing, and ZIP export
└── README.md    # Project documentation
```

## Technical overview

| Area | Implementation |
| --- | --- |
| User interface | Semantic HTML and custom CSS |
| Rendering | HTML Canvas 2D API with device-pixel-ratio support |
| Image loading | File API, `FileReader`, and `Image` |
| Slice generation | Off-screen canvas elements using original image pixels |
| PNG encoding | `HTMLCanvasElement.toBlob()` |
| Archive generation | JSZip 3.10.1 |
| Download | Blob URL and the browser download API |
| Application model | In-memory JavaScript state; no persistence or backend |

The interface canvas is scaled for high-DPI displays, while interactions use CSS-pixel coordinates. Exporting does not capture the visible canvas: each region is sampled directly from the original decoded image, so zoom and pan do not reduce output quality.

## Browser requirements

Use a current desktop version of Chrome, Edge, Firefox, or Safari. The browser must support:

- HTML Canvas 2D
- File and drag-and-drop APIs
- `FileReader`
- `HTMLCanvasElement.toBlob()`
- Blob URLs
- Promises and modern JavaScript syntax

The interface is designed primarily for a mouse and keyboard. Touch-only workflows are not currently optimized.

## Privacy

Selected images remain in browser memory and are processed locally. Slice Studio does not contain code that uploads image content to a server.

The page does make a network request to cdnjs to load JSZip. To run fully offline, download `jszip.min.js`, serve it from the project directory, and replace the CDN `<script>` URL in `index.html` with the local path.

## Known limitations

- Project state is not saved; refreshing or closing the page clears loaded images and guides.
- Output is always PNG, regardless of the source format.
- EXIF metadata, color profiles, animation frames, and other source metadata are not copied to exported slices.
- Very large images, large fixed-size canvases, or grids with many tiles can consume substantial browser memory.
- The ZIP is built in memory before download; exporting many high-resolution slices may take time.
- The app depends on the JSZip CDN unless the dependency is downloaded and referenced locally.
- There is no automated test suite or build pipeline in the current project.

## Troubleshooting

### Export does not start

- Confirm at least one image is listed in the sidebar.
- Make sure the browser allows downloads from the page.
- Open the browser developer console and check for a JSZip loading error.
- If you are offline, host JSZip locally as described in [Privacy](#privacy).

### An image does not load

- Verify that the file is a browser-supported image type.
- Try opening the image directly in the same browser.
- Re-export unusual or damaged source files as PNG or JPEG before importing them.

### A guide is difficult to select

- Zoom in and move the pointer close to the cyan line.
- The cursor changes direction when a guide is within selection range.
- You can also clear the active image's guides and recreate an equal grid.

### Export is slow or the tab runs out of memory

- Export fewer images at once.
- Use fewer rows or columns.
- Reduce the source resolution before loading.
- Avoid unnecessarily large fixed output dimensions.

### Tiles have transparent borders or cropped edges

This is expected when **Fixed Size** is enabled. Disable it to export every slice at its natural dimensions, or adjust the target width and height.

## Development

There is no compilation step. Edit the three source files and refresh the browser:

- Update structure or controls in `index.html`.
- Update presentation and layout in `styles.css`.
- Update behavior, canvas drawing, and export logic in `app.js`.

When changing slicing behavior, test at least these cases:

1. An image with no guides.
2. Only vertical guides and only horizontal guides.
3. A mixed row-and-column grid.
4. Manually positioned and overlapping guides.
5. Multiple images with different grid layouts.
6. Fixed output smaller and larger than the source slices.
7. Filenames containing spaces, Unicode, and filesystem-reserved characters.
8. Large images at different zoom levels.

## Contributing

Contributions are welcome. Before submitting a change:

1. Keep the app usable without a build tool.
2. Preserve client-side image processing and full-resolution export.
3. Test in more than one modern browser.
4. Document any new control, shortcut, dependency, or output behavior.
5. Keep changes focused and include clear reproduction or verification steps.

## License

This project is distributed under the **Apache-2.0 license**.

See [`LICENSE`](./LICENSE) for full legal text.

## ❤️ Support the Project

If you find this tool useful, consider leaving a ⭐ on GitHub
