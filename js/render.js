/* ============================================================================
 * OMANDISTAN — render.js
 * Isometric 2.5D renderer drawn entirely with canvas primitives (no image
 * assets). Buildings are procedurally extruded boxes so the whole game ships
 * as code. Exposes a global `Render` object.
 * ==========================================================================*/
window.Render = (function () {
  "use strict";
  const C = window.CONFIG;

  let canvas, ctx, dpr = 1;
  const cam = { x: 0, y: 0 };          // camera offset (pan)
  let originX = 0, originY = 0;

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    // Start camera centered on the map.
    cam.x = 0; cam.y = 0;
  }

  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    originX = canvas.clientWidth / 2;
    originY = 140;
  }

  // --- Coordinate transforms ----------------------------------------------
  function tileToScreen(cx, cy) {
    const { tileW, tileH } = C.MAP;
    return {
      x: originX + cam.x + (cx - cy) * (tileW / 2),
      y: originY + cam.y + (cx + cy) * (tileH / 2),
    };
  }

  // Screen -> tile (inverse of the iso transform). Returns {cx, cy} (may be off-map).
  function screenToTile(sx, sy) {
    const { tileW, tileH } = C.MAP;
    const x = sx - originX - cam.x;
    const y = sy - originY - cam.y;
    const cx = (x / (tileW / 2) + y / (tileH / 2)) / 2;
    const cy = (y / (tileH / 2) - x / (tileW / 2)) / 2;
    return { cx: Math.floor(cx), cy: Math.floor(cy) };
  }

  function pan(dx, dy) { cam.x += dx; cam.y += dy; }

  // --- Drawing helpers -----------------------------------------------------
  function diamond(cx, cy, fill, stroke) {
    const { tileW, tileH } = C.MAP;
    const p = tileToScreen(cx, cy);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + tileW / 2, p.y + tileH / 2);
    ctx.lineTo(p.x, p.y + tileH);
    ctx.lineTo(p.x - tileW / 2, p.y + tileH / 2);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function shade(hex, amt) {
    // amt in [-1,1]; lighten/darken a hex color
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(clamp(r + amt * 255, 0, 255));
    g = Math.round(clamp(g + amt * 255, 0, 255));
    b = Math.round(clamp(b + amt * 255, 0, 255));
    return `rgb(${r},${g},${b})`;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Draw an extruded iso building box on tile (cx,cy).
  function building(cx, cy, def) {
    const { tileW, tileH } = C.MAP;
    const h = def.height * tileH * 2.2; // pixel height of the box
    const p = tileToScreen(cx, cy);
    const topY = p.y - h;
    // left face
    ctx.fillStyle = shade(def.color, -0.18);
    ctx.beginPath();
    ctx.moveTo(p.x - tileW / 2, p.y + tileH / 2);
    ctx.lineTo(p.x, p.y + tileH);
    ctx.lineTo(p.x, p.y + tileH - h);
    ctx.lineTo(p.x - tileW / 2, p.y + tileH / 2 - h);
    ctx.closePath(); ctx.fill();
    // right face
    ctx.fillStyle = shade(def.color, -0.34);
    ctx.beginPath();
    ctx.moveTo(p.x + tileW / 2, p.y + tileH / 2);
    ctx.lineTo(p.x, p.y + tileH);
    ctx.lineTo(p.x, p.y + tileH - h);
    ctx.lineTo(p.x + tileW / 2, p.y + tileH / 2 - h);
    ctx.closePath(); ctx.fill();
    // top face
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.moveTo(p.x, topY);
    ctx.lineTo(p.x + tileW / 2, topY + tileH / 2);
    ctx.lineTo(p.x, topY + tileH);
    ctx.lineTo(p.x - tileW / 2, topY + tileH / 2);
    ctx.closePath(); ctx.fill();
    // a little emoji glyph floating on the roof for readability
    ctx.font = "16px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.icon, p.x, topY + tileH / 2);
  }

  function roadTile(cx, cy) {
    diamond(cx, cy, "#5b6472", "#4a525e");
    const p = tileToScreen(cx, cy);
    const { tileH } = C.MAP;
    ctx.strokeStyle = "#cbb45a";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - 14, p.y + tileH / 2);
    ctx.lineTo(p.x + 14, p.y + tileH / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // --- Full frame ----------------------------------------------------------
  function frame(state, hover, selectedType) {
    const { cols, rows } = C.MAP;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // sky / backdrop gradient
    const g = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
    g.addColorStop(0, "#bfe3f2");
    g.addColorStop(1, "#e9f6ef");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    // ground tiles (painter's order: back to front)
    for (let sum = 0; sum <= (cols - 1) + (rows - 1); sum++) {
      for (let cx = 0; cx < cols; cx++) {
        const cy = sum - cx;
        if (cy < 0 || cy >= rows) continue;
        const edge = (cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1);
        // a checker of two greens, water on the outer ring (Alaska coastline)
        let fill;
        if (edge) fill = "#7fb4d6";                       // water
        else fill = ((cx + cy) % 2 === 0) ? "#8fc56a" : "#86bd63";
        diamond(cx, cy, fill, "rgba(0,0,0,0.05)");

        const b = state.grid[cy] && state.grid[cy][cx];
        if (b) {
          if (b.type === "road") roadTile(cx, cy);
          else building(cx, cy, C.BUILDINGS[b.type]);
        }
      }
    }

    // hover highlight + ghost of the selected building
    if (hover && hover.cx >= 0 && hover.cy >= 0 && hover.cx < cols && hover.cy < rows) {
      const occupied = state.grid[hover.cy] && state.grid[hover.cy][hover.cx];
      diamond(hover.cx, hover.cy, occupied ? "rgba(220,80,80,0.30)" : "rgba(255,255,255,0.35)", "#ffffff");
      if (selectedType && !occupied) {
        ctx.globalAlpha = 0.55;
        if (selectedType === "road") roadTile(hover.cx, hover.cy);
        else building(hover.cx, hover.cy, C.BUILDINGS[selectedType]);
        ctx.globalAlpha = 1;
      }
    }
  }

  return { init, frame, screenToTile, tileToScreen, pan, resize };
})();
