(() => {
  'use strict';

  /* ============================================================
     DOM REFERENCES
     ============================================================ */
  const canvas      = document.getElementById('canvas');
  const ctx         = canvas.getContext('2d');
  const stage       = document.getElementById('stage');
  const fileInput   = document.getElementById('fileInput');
  const btnUpload   = document.getElementById('btnUpload');
  const fileListEl  = document.getElementById('fileList');
  const emptyFiles  = document.getElementById('emptyFiles');
  const tooltip     = document.getElementById('tooltip');
  const emptyState  = document.getElementById('emptyState');
  const zoomLabel   = document.getElementById('zoomLabel');

  const btnAddVertical   = document.getElementById('btnAddVertical');
  const btnAddHorizontal = document.getElementById('btnAddHorizontal');
  const btnClearGuides   = document.getElementById('btnClearGuides');
  const btnZoomIn        = document.getElementById('btnZoomIn');
  const btnZoomOut       = document.getElementById('btnZoomOut');
  const btnZoomReset     = document.getElementById('btnZoomReset');
  const btnExport        = document.getElementById('btnExport');
  const exportLabel      = btnExport.querySelector('.btn-label');
  const splitCountInput  = document.getElementById('splitCount');
  const btnSplitCols     = document.getElementById('btnSplitCols');
  const btnSplitRows     = document.getElementById('btnSplitRows');
  const btnTogglePreview = document.getElementById('btnTogglePreview');
  const btnToggleFixedSize = document.getElementById('btnToggleFixedSize');
  const fixedWidthInput    = document.getElementById('fixedWidth');
  const fixedHeightInput   = document.getElementById('fixedHeight');

  const statusBar        = document.getElementById('statusBar');
  const statusPosition   = document.getElementById('statusPosition');
  const statusSlices     = document.getElementById('statusSlices');
  const statusImage      = document.getElementById('statusImage');

  /* ============================================================
     CONSTANTS
     ============================================================ */
  const MIN_ZOOM            = 0.02;
  const MAX_ZOOM            = 16;
  const WHEEL_ZOOM_STEP     = 1.15;
  const BUTTON_ZOOM_STEP    = 1.25;
  const GUIDE_HIT_TOLERANCE = 6;     // px (screen space) within which a guide counts as "hovered"
  const GUIDE_COLOR         = '#00FFFF';
  const FIT_PADDING         = 64;    // px of breathing room around an image when fitting to screen

  /* ============================================================
     APPLICATION STATE
     ============================================================ */
  let images = [];          // ImageEntry[] — every uploaded image plus its own guides & viewport
  let activeIndex = -1;     // index of the currently displayed image
  let nextId = 1;

  // Live interaction state (not persisted per-image)
  let isSpaceDown   = false;
  let isPanning     = false;
  let panOrigin     = null;   // { clientX, clientY, panX, panY }
  let draggingGuide = null;   // { axis: 'v' | 'h', index }
  let hoverGuide    = null;   // { axis, index } — purely for cursor + highlight feedback
  let showSlicePreview = false; // toggled by the "Slice Preview" toolbar button
  let useFixedOutputSize = false; // toggled by the "Fixed Size" button — pads/crops every exported slice onto a fixed canvas, centered on its content

  /* ============================================================
     IMAGE ENTRY — one per uploaded file
     Guides are stored as fractions (0..1) of the ORIGINAL image
     dimensions so they stay correct at any zoom level, independent
     of how the image happens to be rendered on screen.
     ============================================================ */
  function createImageEntry(file, img) {
    return {
      id: nextId++,
      name: file.name,
      img,
      naturalWidth:  img.naturalWidth,
      naturalHeight: img.naturalHeight,
      guides: { v: [], h: [] },
      viewport: null,   // { zoom, panX, panY } — lazily created on first display (see selectImage)
    };
  }

  /* ============================================================
     UTILITIES
     ============================================================ */
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function stripExtension(name) {
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(0, i) : name;
  }

  function sanitizeFileName(name) {
    return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'image';
  }

  /* ============================================================
     FILE UPLOAD & MANAGEMENT
     ============================================================ */
  btnUpload.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach(loadImageFile);
    fileInput.value = '';   // reset so the same file can be re-selected later
  });

  // --- Drag & drop: drop image files anywhere on the canvas stage to upload them ---
  ['dragenter', 'dragover'].forEach(evt => stage.addEventListener(evt, (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    stage.classList.add('drag-over');
  }));
  ['dragleave', 'drop'].forEach(evt => stage.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    stage.classList.remove('drag-over');
  }));
  stage.addEventListener('drop', (e) => {
    const files = Array.from(e.dataTransfer?.files || []);
    files.forEach(loadImageFile);
  });

  function loadImageFile(file) {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const entry = createImageEntry(file, img);
        images.push(entry);
        renderFileList();
        selectImage(images.length - 1);
      };
      img.onerror = () => console.warn(`Could not decode image: ${file.name}`);
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  function renderFileList() {
    fileListEl.innerHTML = '';

    images.forEach((entry, idx) => {
      const item = document.createElement('div');
      item.className = 'file-item' + (idx === activeIndex ? ' active' : '');
      item.innerHTML = `
        <span class="file-swatch"></span>
        <span class="file-info">
          <span class="file-name">${escapeHtml(entry.name)}</span>
          <span class="file-meta">${entry.naturalWidth} × ${entry.naturalHeight}px · ${guideCountLabel(entry)}</span>
        </span>
        <button class="file-remove" type="button" title="Remove image">✕</button>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.file-remove')) return;
        selectImage(idx);
      });
      item.querySelector('.file-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage(idx);
      });
      fileListEl.appendChild(item);
    });

    if (images.length === 0) fileListEl.appendChild(emptyFiles);
  }

  function guideCountLabel(entry) {
    const total = entry.guides.v.length + entry.guides.h.length;
    return total === 0 ? 'no guides' : `${total} guide${total === 1 ? '' : 's'}`;
  }

  function removeImage(idx) {
    images.splice(idx, 1);

    if (images.length === 0) {
      activeIndex = -1;
    } else if (activeIndex === idx) {
      activeIndex = Math.min(idx, images.length - 1);
    } else if (activeIndex > idx) {
      activeIndex -= 1;
    }

    hoverGuide = null;
    draggingGuide = null;
    hideTooltip();
    renderFileList();
    refreshUI();
    draw();
  }

  function selectImage(idx) {
    if (idx < 0 || idx >= images.length) return;
    activeIndex = idx;
    const entry = images[idx];
    if (!entry.viewport) entry.viewport = computeFitViewport(entry); // first time we see this image: fit it nicely

    hoverGuide = null;
    draggingGuide = null;
    hideTooltip();
    renderFileList();
    refreshUI();
    draw();
  }

  /* ============================================================
     UI STATE — enable/disable controls, zoom readout, empty state
     ============================================================ */
  function refreshUI() {
    const hasActive = activeIndex >= 0;

    [btnAddVertical, btnAddHorizontal, btnClearGuides, btnZoomIn, btnZoomOut, btnZoomReset]
      .forEach(b => b.disabled = !hasActive);

    btnExport.disabled = images.length === 0 || btnExport.classList.contains('loading');
    emptyState.classList.toggle('hidden', hasActive);

    zoomLabel.textContent = hasActive
      ? `${Math.round(images[activeIndex].viewport.zoom * 100)}%`
      : '--';

    btnTogglePreview.classList.toggle('toggled', showSlicePreview);
  }

  /* ============================================================
     STATUS BAR — live cursor position, slice count, image info
     ============================================================ */
  function updateStatusBar() {
    if (activeIndex < 0) {
      statusBar.classList.add('hidden');
      return;
    }
    statusBar.classList.remove('hidden');

    const entry = images[activeIndex];
    const vp = entry.viewport;
    const cols = computeBoundaries(entry.guides.v, entry.naturalWidth).length - 1;
    const rows = computeBoundaries(entry.guides.h, entry.naturalHeight).length - 1;

    statusSlices.textContent = `${cols} × ${rows} slices (${cols * rows} total)`;
    statusImage.textContent = `${entry.name} — ${entry.naturalWidth}×${entry.naturalHeight}px · ${Math.round(vp.zoom * 100)}%`;
  }

  /** Reports the cursor's position in original-image pixel coordinates, or "—" outside the image. */
  function updateStatusPosition(mx, my) {
    if (activeIndex < 0) { statusPosition.textContent = '—'; return; }
    const entry = images[activeIndex];
    const p = screenToImage(mx, my, entry.viewport);
    const inBounds = p.x >= 0 && p.x <= entry.naturalWidth && p.y >= 0 && p.y <= entry.naturalHeight;
    statusPosition.textContent = inBounds ? `${Math.round(p.x)}, ${Math.round(p.y)} px` : '—';
  }

  /* ============================================================
     VIEWPORT — zoom & pan transform helpers
     The on-screen position of an original-image pixel (ix, iy) is:
        screenX = panX + ix * zoom
        screenY = panY + iy * zoom
     ============================================================ */
  function computeFitViewport(entry) {
    const w = canvas.clientWidth  || 800;
    const h = canvas.clientHeight || 600;
    const availW = Math.max(w - FIT_PADDING * 2, 50);
    const availH = Math.max(h - FIT_PADDING * 2, 50);

    const zoom = clamp(
      Math.min(availW / entry.naturalWidth, availH / entry.naturalHeight, 1) || 1,
      MIN_ZOOM, MAX_ZOOM
    );
    return {
      zoom,
      panX: (w - entry.naturalWidth  * zoom) / 2,
      panY: (h - entry.naturalHeight * zoom) / 2,
    };
  }

  function screenToImage(sx, sy, vp) {
    return { x: (sx - vp.panX) / vp.zoom, y: (sy - vp.panY) / vp.zoom };
  }

  /** Zoom around a fixed screen-space anchor point (cursor, or canvas centre). */
  function zoomAround(vp, anchorX, anchorY, factor) {
    const before = screenToImage(anchorX, anchorY, vp);
    vp.zoom = clamp(vp.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    vp.panX = anchorX - before.x * vp.zoom;
    vp.panY = anchorY - before.y * vp.zoom;
  }

  /* ============================================================
     CANVAS SIZING — keep the backing store crisp on HiDPI screens
     ============================================================ */
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = stage.clientWidth;
    const h = stage.clientHeight;

    canvas.width  = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';

    // All subsequent drawing is done in CSS-pixel coordinates, matching mouse events.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  new ResizeObserver(resizeCanvas).observe(stage);

  /* ============================================================
     RENDERING
     ============================================================ */
  function draw() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    updateStatusBar();

    if (activeIndex < 0) return;

    const entry = images[activeIndex];
    const vp = entry.viewport;

    const ix = vp.panX;
    const iy = vp.panY;
    const iw = entry.naturalWidth  * vp.zoom;
    const ih = entry.naturalHeight * vp.zoom;

    // Hard-edged drop shadow behind the image — gives the canvas some depth without a soft blur.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = '#101010';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.restore();

    // Disable smoothing once zoomed past 100% so individual pixels stay crisp while slicing precisely.
    ctx.imageSmoothingEnabled = vp.zoom <= 1;
    ctx.drawImage(entry.img, ix, iy, iw, ih);

    drawGuides(entry, vp, w, h);
    if (showSlicePreview) drawSlicePreview(entry, vp);
  }

  /**
   * Optional overlay (toggled via the "Slice Preview" button) that outlines every
   * computed slice and labels it with its row/column index and pixel dimensions —
   * lets users see exactly what the export will produce before running it.
   */
  function drawSlicePreview(entry, vp) {
    const xCuts = computeBoundaries(entry.guides.v, entry.naturalWidth);
    const yCuts = computeBoundaries(entry.guides.h, entry.naturalHeight);
    const rows = yCuts.length - 1;
    const cols = xCuts.length - 1;
    if (rows * cols <= 1) return; // nothing useful to preview for a single, unsliced image

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let r = 0; r < rows; r++) {
      const sy = yCuts[r];
      const sh = yCuts[r + 1] - sy;
      if (sh <= 0) continue;

      for (let c = 0; c < cols; c++) {
        const sx = xCuts[c];
        const sw = xCuts[c + 1] - sx;
        if (sw <= 0) continue;

        const rx = vp.panX + sx * vp.zoom;
        const ry = vp.panY + sy * vp.zoom;
        const rw = sw * vp.zoom;
        const rh = sh * vp.zoom;

        ctx.strokeStyle = 'rgba(0,255,255,0.32)';
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.round(rx) + 0.5, Math.round(ry) + 0.5, Math.round(rw) - 1, Math.round(rh) - 1);

        const labelX = rx + rw / 2;
        const labelY = ry + rh / 2;
        const indexLabel = `R${r + 1} · C${c + 1}`;
        const dimsLabel = `${sw} × ${sh}`;

        const textW = Math.max(ctx.measureText(indexLabel).width, ctx.measureText(dimsLabel).width);
        const pad = 7;
        ctx.fillStyle = 'rgba(16,16,16,0.7)';
        ctx.fillRect(labelX - textW / 2 - pad, labelY - 17, textW + pad * 2, 34);

        ctx.fillStyle = GUIDE_COLOR;
        ctx.fillText(indexLabel, labelX, labelY - 8);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(dimsLabel, labelX, labelY + 8);
      }
    }
    ctx.restore();
  }

  function drawGuides(entry, vp, viewW, viewH) {
    ctx.save();
    ctx.strokeStyle = GUIDE_COLOR;
    ctx.shadowColor = GUIDE_COLOR;

    entry.guides.v.forEach((frac, idx) => {
      const sx = vp.panX + frac * entry.naturalWidth * vp.zoom;
      paintGuideLine('v', idx, sx, 0, sx, viewH);
    });
    entry.guides.h.forEach((frac, idx) => {
      const sy = vp.panY + frac * entry.naturalHeight * vp.zoom;
      paintGuideLine('h', idx, 0, sy, viewW, sy);
    });

    ctx.restore();
  }

  function paintGuideLine(axis, index, x1, y1, x2, y2) {
    const isActive = (hoverGuide && hoverGuide.axis === axis && hoverGuide.index === index)
                  || (draggingGuide && draggingGuide.axis === axis && draggingGuide.index === index);

    // Ultra-thin neon line with a crisp, tight glow — brightens slightly on hover/drag.
    ctx.lineWidth   = isActive ? 2 : 1;
    ctx.globalAlpha = isActive ? 1 : 0.82;
    ctx.shadowBlur  = isActive ? 8 : 3;

    ctx.beginPath();
    // +0.5 keeps 1px lines crisp instead of straddling two pixel rows
    ctx.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
    ctx.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
    ctx.stroke();
  }

  /* ============================================================
     GUIDE MANAGEMENT
     ============================================================ */
  btnAddVertical.addEventListener('click', () => addGuide('v'));
  btnAddHorizontal.addEventListener('click', () => addGuide('h'));
  btnClearGuides.addEventListener('click', clearGuides);
  btnSplitCols.addEventListener('click', () => splitEvenly('v'));
  btnSplitRows.addEventListener('click', () => splitEvenly('h'));
  btnTogglePreview.addEventListener('click', () => {
    showSlicePreview = !showSlicePreview;
    btnTogglePreview.classList.toggle('toggled', showSlicePreview);
    draw();
  });

  /** "Fixed Size": when enabled, every exported slice is centered onto a fixedWidth × fixedHeight
   *  canvas — smaller slices get transparent padding, larger slices get centered-cropped. */
  btnToggleFixedSize.addEventListener('click', () => {
    useFixedOutputSize = !useFixedOutputSize;
    btnToggleFixedSize.classList.toggle('toggled', useFixedOutputSize);
    fixedWidthInput.disabled = !useFixedOutputSize;
    fixedHeightInput.disabled = !useFixedOutputSize;
  });

  /** Replaces every guide on one axis with N-1 evenly spaced ones, producing N equal slices. */
  function splitEvenly(axis) {
    if (activeIndex < 0) return;
    const n = clamp(parseInt(splitCountInput.value, 10) || 2, 2, 50);
    splitCountInput.value = n; // normalize back into the input (clamps stray values like 0, 1, 999)

    const entry = images[activeIndex];
    const fractions = [];
    for (let i = 1; i < n; i++) fractions.push(i / n);

    entry.guides[axis] = fractions;
    hoverGuide = null;
    draggingGuide = null;
    hideTooltip();
    renderFileList();
    draw();
  }

  function addGuide(axis) {
    if (activeIndex < 0) return;
    const entry = images[activeIndex];
    const list = entry.guides[axis];

    // Drop the new guide in the middle of the largest empty gap — avoids stacking guides on top of each other.
    list.push(findMidpointOfLargestGap(list));
    renderFileList();
    draw();
  }

  function findMidpointOfLargestGap(fractions) {
    const sorted = [...fractions].sort((a, b) => a - b);
    const points = [0, ...sorted, 1];

    let bestGap = -1;
    let bestMid = 0.5;
    for (let i = 0; i < points.length - 1; i++) {
      const gap = points[i + 1] - points[i];
      if (gap > bestGap) {
        bestGap = gap;
        bestMid = (points[i] + points[i + 1]) / 2;
      }
    }
    return bestMid;
  }

  function clearGuides() {
    if (activeIndex < 0) return;
    const entry = images[activeIndex];
    if (entry.guides.v.length === 0 && entry.guides.h.length === 0) return;
    entry.guides.v = [];
    entry.guides.h = [];
    hoverGuide = null;
    draggingGuide = null;
    hideTooltip();
    renderFileList();
    draw();
  }

  /** Returns the closest guide under (mx, my) within GUIDE_HIT_TOLERANCE, or null. */
  function hitTestGuides(mx, my) {
    if (activeIndex < 0) return null;
    const entry = images[activeIndex];
    const vp = entry.viewport;
    let best = null;
    let bestDist = GUIDE_HIT_TOLERANCE;

    entry.guides.v.forEach((frac, idx) => {
      const sx = vp.panX + frac * entry.naturalWidth * vp.zoom;
      const d = Math.abs(mx - sx);
      if (d <= bestDist) { bestDist = d; best = { axis: 'v', index: idx }; }
    });
    entry.guides.h.forEach((frac, idx) => {
      const sy = vp.panY + frac * entry.naturalHeight * vp.zoom;
      const d = Math.abs(my - sy);
      if (d <= bestDist) { bestDist = d; best = { axis: 'h', index: idx }; }
    });
    return best;
  }

  /* ============================================================
     TOOLTIP — shown while a guide is being dragged
     ============================================================ */
  function showTooltip(mx, my, guideRef) {
    const entry = images[activeIndex];
    const frac = entry.guides[guideRef.axis][guideRef.index];
    const totalSize = guideRef.axis === 'v' ? entry.naturalWidth : entry.naturalHeight;
    const px = Math.round(clamp(frac, 0, 1) * totalSize);
    const pct = (clamp(frac, 0, 1) * 100).toFixed(1);

    tooltip.textContent = `${px}px · ${pct}%`;
    tooltip.style.left = (mx + 16) + 'px';
    tooltip.style.top  = my + 'px';
    tooltip.classList.remove('hidden');
  }
  function hideTooltip() {
    tooltip.classList.add('hidden');
  }

  /* ============================================================
     POINTER / KEYBOARD INTERACTION
     - Wheel             → zoom toward cursor
     - Space + LMB / MMB → pan
     - Drag a guide      → reposition it, with live tooltip
     - Double-click line → delete it
     ============================================================ */
  function getCanvasMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function updateCursor() {
    canvas.classList.remove('cursor-grab', 'cursor-grabbing', 'cursor-ew', 'cursor-ns');
    if (isPanning)        canvas.classList.add('cursor-grabbing');
    else if (isSpaceDown) canvas.classList.add('cursor-grab');
    else if (hoverGuide)  canvas.classList.add(hoverGuide.axis === 'v' ? 'cursor-ew' : 'cursor-ns');
  }

  // --- Mouse wheel: zoom toward the cursor position ---
  canvas.addEventListener('wheel', (e) => {
    if (activeIndex < 0) return;
    e.preventDefault();
    const { x: mx, y: my } = getCanvasMousePos(e);
    const vp = images[activeIndex].viewport;
    const factor = e.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;
    zoomAround(vp, mx, my, factor);
    refreshUI();
    draw();
  }, { passive: false });

  // --- Mouse down: start panning OR start dragging a guide ---
  canvas.addEventListener('mousedown', (e) => {
    if (activeIndex < 0) return;
    if (e.button === 1) e.preventDefault(); // suppress middle-click auto-scroll icon

    const { x: mx, y: my } = getCanvasMousePos(e);
    const wantsPan = isSpaceDown || e.button === 1; // Space+LMB or middle mouse button

    if (wantsPan) {
      e.preventDefault();
      isPanning = true;
      const vp = images[activeIndex].viewport;
      panOrigin = { clientX: e.clientX, clientY: e.clientY, panX: vp.panX, panY: vp.panY };
      updateCursor();
      return;
    }

    if (e.button === 0) {
      const hit = hitTestGuides(mx, my);
      if (hit) {
        e.preventDefault();
        draggingGuide = hit;
        showTooltip(mx, my, hit);
        draw();
      }
    }
  });

  // --- Mouse move (window-level so drags continue past canvas edges) ---
  window.addEventListener('mousemove', (e) => {
    if (activeIndex < 0) return;
    const { x: mx, y: my } = getCanvasMousePos(e);
    const entry = images[activeIndex];
    const vp = entry.viewport;

    if (isPanning && panOrigin) {
      vp.panX = panOrigin.panX + (e.clientX - panOrigin.clientX);
      vp.panY = panOrigin.panY + (e.clientY - panOrigin.clientY);
      updateStatusPosition(mx, my);
      draw();
      return;
    }

    if (draggingGuide) {
      const imgPos = screenToImage(mx, my, vp);
      const frac = draggingGuide.axis === 'v'
        ? clamp(imgPos.x / entry.naturalWidth, 0, 1)
        : clamp(imgPos.y / entry.naturalHeight, 0, 1);
      entry.guides[draggingGuide.axis][draggingGuide.index] = frac;
      showTooltip(mx, my, draggingGuide);
      updateStatusPosition(mx, my);
      draw();
      return;
    }

    // Idle hover: update cursor + highlight the nearest guide
    const hit = hitTestGuides(mx, my);
    const changed = JSON.stringify(hit) !== JSON.stringify(hoverGuide);
    hoverGuide = hit;
    updateCursor();
    updateStatusPosition(mx, my);
    if (changed) draw();
  });

  canvas.addEventListener('mouseleave', () => {
    statusPosition.textContent = '—';
  });

  // --- Mouse up: stop panning / stop dragging ---
  window.addEventListener('mouseup', () => {
    let needsRedraw = false;

    if (isPanning) {
      isPanning = false;
      panOrigin = null;
      needsRedraw = true;
    }
    if (draggingGuide) {
      draggingGuide = null;
      hideTooltip();
      needsRedraw = true;
    }
    if (needsRedraw) {
      updateCursor();
      draw();
    }
  });

  // Prevent the OS auto-scroll icon from appearing on middle-click
  canvas.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

  // --- Double-click a guide line to delete it ---
  canvas.addEventListener('dblclick', (e) => {
    if (activeIndex < 0) return;
    const { x: mx, y: my } = getCanvasMousePos(e);
    const hit = hitTestGuides(mx, my);
    if (!hit) return;

    const entry = images[activeIndex];
    entry.guides[hit.axis].splice(hit.index, 1);
    hoverGuide = null;
    draggingGuide = null;
    hideTooltip();
    renderFileList();
    updateCursor();
    draw();
  });

  // --- Delete / Backspace removes whichever guide the cursor is currently hovering ---
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code !== 'Delete' && e.code !== 'Backspace') return;
    if (!hoverGuide || activeIndex < 0) return;

    e.preventDefault();
    const entry = images[activeIndex];
    entry.guides[hoverGuide.axis].splice(hoverGuide.index, 1);
    hoverGuide = null;
    draggingGuide = null;
    hideTooltip();
    renderFileList();
    updateCursor();
    draw();
  });

  // --- Spacebar toggles "pan mode" ---
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (!isSpaceDown) {
      isSpaceDown = true;
      updateCursor();
    }
    e.preventDefault(); // stop the page from scrolling
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    isSpaceDown = false;
    updateCursor();
  });
  // Safety net: if the window loses focus mid-drag/pan, release everything.
  window.addEventListener('blur', () => {
    isSpaceDown = false;
    isPanning = false;
    panOrigin = null;
    draggingGuide = null;
    hideTooltip();
    updateCursor();
  });

  /* ============================================================
     ZOOM TOOLBAR CONTROLS
     ============================================================ */
  btnZoomIn.addEventListener('click', () => zoomByButton(BUTTON_ZOOM_STEP));
  btnZoomOut.addEventListener('click', () => zoomByButton(1 / BUTTON_ZOOM_STEP));
  btnZoomReset.addEventListener('click', () => {
    if (activeIndex < 0) return;
    images[activeIndex].viewport = computeFitViewport(images[activeIndex]);
    refreshUI();
    draw();
  });

  function zoomByButton(factor) {
    if (activeIndex < 0) return;
    const vp = images[activeIndex].viewport;
    zoomAround(vp, canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
    refreshUI();
    draw();
  }

  /* ============================================================
     SLICING & EXPORT ENGINE
     ============================================================ */
  btnExport.addEventListener('click', exportAllAsZip);

  async function exportAllAsZip() {
    if (images.length === 0 || btnExport.classList.contains('loading')) return;

    setExporting(true);
    try {
      const zip = new JSZip();
      for (const entry of images) {
        await addImageSlicesToZip(zip, entry);
      }
      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      triggerDownload(blob, buildZipFileName());
    } catch (err) {
      console.error('Export failed:', err);
      window.alert('Sorry — export failed: ' + (err && err.message ? err.message : err));
    } finally {
      setExporting(false);
    }
  }

  function buildZipFileName() {
    if (images.length === 1) return `${sanitizeFileName(stripExtension(images[0].name))}_slices.zip`;
    return `sliced_images_${images.length}.zip`;
  }

  function setExporting(isExporting) {
    btnExport.disabled = isExporting || images.length === 0;
    btnExport.classList.toggle('loading', isExporting);
    exportLabel.textContent = isExporting ? 'Exporting…' : 'Export ZIP';
  }

  /**
   * Slices a single image according to its guides and adds every resulting
   * PNG to the given zip. Images without guides simply export as one full
   * slice (Row1_Col1) — the "no guide lines" edge case called out in the spec.
   */
  async function addImageSlicesToZip(zip, entry) {
    const xCuts = computeBoundaries(entry.guides.v, entry.naturalWidth);
    const yCuts = computeBoundaries(entry.guides.h, entry.naturalHeight);
    const baseName = sanitizeFileName(stripExtension(entry.name));

    const rows = yCuts.length - 1;
    const cols = xCuts.length - 1;

    // "Fixed Size": every slice is centered onto a canvas of this exact size — slices smaller
    // than the target get transparent padding, slices larger get centered-cropped (the canvas
    // clips anything drawn outside its own bounds, which gives us cropping for free).
    const fixedSize = useFixedOutputSize ? {
      width:  clamp(parseInt(fixedWidthInput.value, 10)  || 100, 1, 10000),
      height: clamp(parseInt(fixedHeightInput.value, 10) || 100, 1, 10000),
    } : null;

    for (let r = 0; r < rows; r++) {
      const sy = yCuts[r];
      const sh = yCuts[r + 1] - sy;
      if (sh <= 0) continue;   // ignore zero-height slivers from overlapping guides

      for (let c = 0; c < cols; c++) {
        const sx = xCuts[c];
        const sw = xCuts[c + 1] - sx;
        if (sw <= 0) continue; // ignore zero-width slivers from overlapping guides

        const sliceCanvas = document.createElement('canvas');
        let drawX = 0;
        let drawY = 0;

        if (fixedSize) {
          sliceCanvas.width  = fixedSize.width;
          sliceCanvas.height = fixedSize.height;
          drawX = Math.round((fixedSize.width  - sw) / 2);
          drawY = Math.round((fixedSize.height - sh) / 2);
        } else {
          sliceCanvas.width  = sw;
          sliceCanvas.height = sh;
        }

        const sliceCtx = sliceCanvas.getContext('2d');
        // Always sample from the original full-resolution image, regardless of on-screen zoom.
        sliceCtx.drawImage(entry.img, sx, sy, sw, sh, drawX, drawY, sw, sh);

        const blob = await canvasToBlob(sliceCanvas);
        zip.file(`${baseName}_Row${r + 1}_Col${c + 1}.png`, blob);
      }
    }
  }

  /**
   * Converts guide fractions into absolute pixel boundaries (including the
   * image edges 0 and totalSize), removing duplicates so overlapping guides
   * never produce a 0-pixel slice.
   */
  function computeBoundaries(fractions, totalSize) {
    const pixels = fractions.map(f => Math.round(clamp(f, 0, 1) * totalSize));
    const unique = [...new Set([0, ...pixels, totalSize])].sort((a, b) => a - b);
    return unique;
  }

  function canvasToBlob(canvasEl) {
    return new Promise((resolve, reject) => {
      canvasEl.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas could not be encoded to PNG')), 'image/png');
    });
  }

  function triggerDownload(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ============================================================
     BOOTSTRAP
     ============================================================ */
  function init() {
    resizeCanvas();
    refreshUI();
    draw();
  }
  init();
})();
