/* ============================================================================
 * OMANDISTAN — render.js
 * Isometric 2.5D renderer (no image assets). Buildings are composed from iso
 * boxes, roofs, towers, etc. Adds: bigger sea, district ownership tinting, and
 * little cars that drive along the road network. Exposes a global `Render`.
 * ==========================================================================*/
window.Render = (function () {
  "use strict";
  const C = window.CONFIG;
  const TW = C.MAP.tileW, TH = C.MAP.tileH;
  const ZUNIT = TH;

  let canvas, ctx, dpr = 1;
  const cam = { x: 0, y: 0 };
  let originX = 0, originY = 0;
  let waveT = 0, lastTs = 0;

  function init(cv) {
    canvas = cv; ctx = canvas.getContext("2d");
    resize(); window.addEventListener("resize", resize);
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    originX = canvas.clientWidth / 2; originY = 150;
  }
  function tileToScreen(cx, cy) {
    return { x: originX + cam.x + (cx - cy) * (TW / 2), y: originY + cam.y + (cx + cy) * (TH / 2) };
  }
  function screenToTile(sx, sy) {
    const x = sx - originX - cam.x, y = sy - originY - cam.y;
    return { cx: Math.floor((x / (TW / 2) + y / (TH / 2)) / 2),
             cy: Math.floor((y / (TH / 2) - x / (TW / 2)) / 2) };
  }
  function pan(dx, dy) { cam.x += dx; cam.y += dy; }
  function centerOn(cx, cy) { const p = tileToScreen(cx, cy); cam.x -= (p.x - originX); cam.y -= (p.y - originY); }

  // --- primitives ----------------------------------------------------------
  function project(p, u, v, z) { return { x: p.x + (u - v) * (TW / 2), y: p.y + (u + v) * (TH / 2) - z * ZUNIT }; }
  function poly(pts, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = clamp(Math.round(((n >> 16) & 255) + amt * 255), 0, 255),
        g = clamp(Math.round(((n >> 8) & 255) + amt * 255), 0, 255),
        b = clamp(Math.round((n & 255) + amt * 255), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function box(p, u0, v0, u1, v1, z0, z1, color) {
    poly([project(p, u0, v1, z0), project(p, u1, v1, z0), project(p, u1, v1, z1), project(p, u0, v1, z1)], shade(color, -0.30));
    poly([project(p, u1, v0, z0), project(p, u1, v1, z0), project(p, u1, v1, z1), project(p, u1, v0, z1)], shade(color, -0.15));
    poly([project(p, u0, v0, z1), project(p, u1, v0, z1), project(p, u1, v1, z1), project(p, u0, v1, z1)], color);
  }
  function pyramid(p, u0, v0, u1, v1, z0, peak, color) {
    const A = project(p, u0, v0, z0), B = project(p, u1, v0, z0), Cc = project(p, u1, v1, z0), D = project(p, u0, v1, z0);
    const top = project(p, (u0 + u1) / 2, (v0 + v1) / 2, z0 + peak);
    poly([A, B, top], shade(color, -0.05)); poly([A, D, top], shade(color, -0.22));
    poly([B, Cc, top], shade(color, -0.12)); poly([D, Cc, top], shade(color, -0.26));
  }
  function windowsV1(p, v1, us, z0, z1, color) {
    for (const u of us) poly([project(p, u - 0.07, v1, z0), project(p, u + 0.07, v1, z0),
      project(p, u + 0.07, v1, z1), project(p, u - 0.07, v1, z1)], color);
  }
  function tree(p, u, v) {
    box(p, u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 0.22, "#7a5230");
    const c = project(p, u, v, 0.55);
    ctx.fillStyle = "#3f8a4d"; ctx.beginPath(); ctx.arc(c.x, c.y, TW * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = "#4fa05c"; ctx.beginPath(); ctx.arc(c.x - 3, c.y - 3, TW * 0.11, 0, 7); ctx.fill();
  }
  function flag(p, u, v, z, color) {
    box(p, u - 0.015, v - 0.015, u + 0.015, v + 0.015, z, z + 0.5, "#6b5234");
    const a = project(p, u, v, z + 0.5), b = project(p, u, v, z + 0.34);
    poly([a, b, { x: a.x + 16, y: a.y + 5 }], color);
  }
  function heart(pt, s, color) {
    ctx.fillStyle = color; ctx.beginPath();
    ctx.arc(pt.x - s * 0.5, pt.y, s * 0.5, Math.PI, 0); ctx.arc(pt.x + s * 0.5, pt.y, s * 0.5, Math.PI, 0);
    ctx.lineTo(pt.x, pt.y + s * 1.1); ctx.closePath(); ctx.fill();
  }
  function jit(cx, cy) { return ((cx * 73 + cy * 151) % 7) / 7 * 0.06 - 0.03; }

  function diamond(cx, cy, fill, stroke) {
    const p = tileToScreen(cx, cy);
    poly([{ x: p.x, y: p.y }, { x: p.x + TW / 2, y: p.y + TH / 2 }, { x: p.x, y: p.y + TH }, { x: p.x - TW / 2, y: p.y + TH / 2 }], fill, stroke);
  }
  function roadTile(cx, cy) {
    diamond(cx, cy, "#5b6472", "#4a525e");
    const p = tileToScreen(cx, cy);
    ctx.strokeStyle = "#cbb45a"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.x - 14, p.y + TH / 2); ctx.lineTo(p.x + 14, p.y + TH / 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  function farmlandTile(cx, cy) {
    const p = tileToScreen(cx, cy);
    diamond(cx, cy, "#9a7b46", "#7c6238");
    ctx.strokeStyle = "#86663b"; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const a = project(p, i / 6, 0, 0), b = project(p, i / 6, 1, 0); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.fillStyle = "#7fae4e";
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) { const q = project(p, i / 6, j / 6, 0); ctx.fillRect(q.x - 1, q.y - 3, 2, 3); }
  }

  // --- per-building renderers ----------------------------------------------
  function shopBox(p, def, cx, cy, awningColor) {
    box(p, 0.2, 0.2, 0.8, 0.8, 0, 0.55, shade(def.color, jit(cx, cy)));
    box(p, 0.2, 0.2, 0.8, 0.8, 0.55, 0.62, shade(def.color, -0.25));
    for (let i = 0; i < 5; i++) {
      const ua = 0.2 + i * 0.12, ub = ua + 0.12;
      poly([project(p, ua, 0.8, 0.5), project(p, ub, 0.8, 0.5), project(p, ub, 0.95, 0.42), project(p, ua, 0.95, 0.42)], i % 2 ? awningColor : "#f4f0e6");
    }
    windowsV1(p, 0.8, [0.35, 0.65], 0.18, 0.4, "#cfe8ff");
  }
  const DRAW = {
    road() {},
    house(p, def, cx, cy) {
      box(p, 0.22, 0.22, 0.78, 0.78, 0, 0.75, shade(def.color, jit(cx, cy)));
      windowsV1(p, 0.78, [0.4, 0.6], 0.25, 0.5, "#fff4cf");
      poly([project(p, 0.46, 0.78, 0), project(p, 0.54, 0.78, 0), project(p, 0.54, 0.78, 0.35), project(p, 0.46, 0.78, 0.35)], "#8a5a2a");
      pyramid(p, 0.18, 0.18, 0.82, 0.82, 0.75, 0.42, "#b5503f");
      box(p, 0.3, 0.3, 0.38, 0.38, 0.75, 1.2, "#9a5a3a");
    },
    farm(p, def, cx, cy) {
      farmlandTile(cx, cy);
      box(p, 0.1, 0.55, 0.42, 0.88, 0, 0.5, "#b5503f"); pyramid(p, 0.07, 0.52, 0.45, 0.91, 0.5, 0.3, "#7c3a2e");
      box(p, 0.62, 0.18, 0.8, 0.36, 0, 0.7, "#d8d2c2"); pyramid(p, 0.6, 0.16, 0.82, 0.38, 0.7, 0.22, "#9a9484");
    },
    grocery(p, d, x, y) { shopBox(p, d, x, y, "#e85d5d"); },
    clothing(p, d, x, y) { shopBox(p, d, x, y, "#b65aa0"); },
    restaurant(p, d, x, y) {
      shopBox(p, d, x, y, "#e0894a");
      const s = project(p, 0.5, 0.4, 0.9); ctx.font = "13px serif"; ctx.textAlign = "center"; ctx.fillText("🍔", s.x, s.y);
    },
    tech(p, def, cx, cy) {
      box(p, 0.18, 0.2, 0.82, 0.8, 0, 0.8, shade(def.color, jit(cx, cy)));
      // glass curtain wall
      for (let z = 0.1; z < 0.78; z += 0.16) windowsV1(p, 0.8, [0.3, 0.45, 0.6, 0.72], z, z + 0.1, "#8fd0ff");
      box(p, 0.4, 0.4, 0.6, 0.6, 0.8, 1.05, "#33408c");
    },
    factory(p, def, cx, cy) {
      box(p, 0.15, 0.2, 0.85, 0.8, 0, 0.8, shade(def.color, jit(cx, cy)));
      box(p, 0.6, 0.22, 0.72, 0.34, 0.8, 1.5, "#7a6347"); box(p, 0.74, 0.22, 0.86, 0.34, 0.8, 1.35, "#7a6347");
      const s = project(p, 0.66, 0.28, 1.55); ctx.fillStyle = "rgba(230,230,230,0.85)";
      ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, 7); ctx.arc(s.x + 6, s.y - 4, 5, 0, 7); ctx.fill();
      windowsV1(p, 0.8, [0.3, 0.45], 0.2, 0.55, "#bcd2e0");
    },
    bank(p, def, cx, cy) {
      box(p, 0.18, 0.2, 0.82, 0.8, 0, 0.7, shade(def.color, jit(cx, cy)));
      box(p, 0.14, 0.82, 0.86, 0.9, 0.7, 0.78, "#e8efe9");                 // pediment base
      pyramid(p, 0.14, 0.16, 0.86, 0.84, 0.78, 0.3, "#cfe0d3");
      for (const u of [0.24, 0.4, 0.56, 0.72]) box(p, u - 0.02, 0.82, u + 0.02, 0.86, 0, 0.7, "#eef4ef"); // columns
      const s = project(p, 0.5, 0.5, 0.9); ctx.fillStyle = "#caa446"; ctx.font = "12px serif"; ctx.textAlign = "center"; ctx.fillText("$", s.x, s.y);
    },
    lumber(p, def, cx, cy) {
      box(p, 0.18, 0.5, 0.5, 0.84, 0, 0.42, "#8a6a40"); pyramid(p, 0.15, 0.47, 0.53, 0.87, 0.42, 0.22, "#5e4a30");
      // log pile
      for (let i = 0; i < 3; i++) box(p, 0.58, 0.2 + i * 0.12, 0.86, 0.3 + i * 0.12, 0.05, 0.18, "#b58a52");
      tree(p, 0.32, 0.25);
    },
    oilrig(p, def, cx, cy) {
      box(p, 0.4, 0.4, 0.6, 0.6, 0, 0.3, "#2a2a30");
      // derrick tower (4 legs + cap)
      box(p, 0.42, 0.42, 0.46, 0.46, 0.3, 1.4, "#555"); box(p, 0.54, 0.42, 0.58, 0.46, 0.3, 1.4, "#555");
      box(p, 0.42, 0.54, 0.46, 0.58, 0.3, 1.4, "#555"); box(p, 0.54, 0.54, 0.58, 0.58, 0.3, 1.4, "#555");
      pyramid(p, 0.4, 0.4, 0.6, 0.6, 1.4, 0.25, "#3a3a44");
      box(p, 0.18, 0.62, 0.34, 0.78, 0, 0.4, "#6a5a3a");   // storage tank
    },
    gasmine(p, def, cx, cy) {
      box(p, 0.2, 0.2, 0.8, 0.8, 0, 0.4, shade(def.color, jit(cx, cy)));
      box(p, 0.6, 0.24, 0.74, 0.38, 0.4, 1.2, "#8a9098");   // pump tower
      box(p, 0.24, 0.6, 0.46, 0.82, 0, 0.55, "#7a7f88");    // tanks
      const s = project(p, 0.67, 0.3, 1.3); ctx.font = "12px serif"; ctx.textAlign = "center"; ctx.fillText("🔥", s.x, s.y);
    },
    hospital(p, def, cx, cy) {
      box(p, 0.18, 0.18, 0.82, 0.82, 0, 1.0, "#f3f5f7"); box(p, 0.18, 0.18, 0.82, 0.82, 1.0, 1.08, "#d96a6a");
      box(p, 0.44, 0.3, 0.56, 0.7, 1.08, 1.18, "#d23b3b"); box(p, 0.3, 0.44, 0.7, 0.56, 1.08, 1.18, "#d23b3b");
      windowsV1(p, 0.82, [0.32, 0.5, 0.68], 0.2, 0.85, "#bfe0ff");
    },
    school(p, def, cx, cy) {
      box(p, 0.16, 0.2, 0.84, 0.8, 0, 0.6, shade(def.color, jit(cx, cy))); pyramid(p, 0.13, 0.17, 0.87, 0.83, 0.6, 0.3, "#7c4a2a");
      box(p, 0.46, 0.3, 0.6, 0.44, 0.6, 1.15, "#e8d8b0"); pyramid(p, 0.44, 0.28, 0.62, 0.46, 1.15, 0.22, "#9a3b3b");
      flag(p, 0.53, 0.37, 1.37, "#3f6fae"); windowsV1(p, 0.8, [0.3, 0.5, 0.7], 0.2, 0.45, "#fff4cf");
    },
    university(p, def, cx, cy) {
      box(p, 0.15, 0.18, 0.85, 0.82, 0, 0.85, shade(def.color, jit(cx, cy)));
      const dc = project(p, 0.5, 0.5, 0.85); ctx.fillStyle = "#cbb46a"; ctx.beginPath(); ctx.arc(dc.x, dc.y - 6, TW * 0.16, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#a8923f"; ctx.fillRect(dc.x - 1.5, dc.y - 6 - TW * 0.16 - 6, 3, 8);
      for (const u of [0.25, 0.4, 0.55, 0.7]) box(p, u - 0.02, 0.82, u + 0.02, 0.86, 0, 0.6, "#efeae0");
      flag(p, 0.85, 0.85, 0.85, "#9a6cb0");
    },
    port(p, def, cx, cy) {
      box(p, 0.1, 0.1, 0.9, 0.9, 0, 0.12, "#6b4f33"); box(p, 0.15, 0.55, 0.45, 0.85, 0.12, 0.5, "#caa15a");
      box(p, 0.66, 0.2, 0.74, 0.28, 0.12, 1.2, "#d98a3a"); box(p, 0.4, 0.2, 0.74, 0.28, 1.1, 1.2, "#d98a3a");
      box(p, 0.5, 0.55, 0.66, 0.7, 0.12, 0.32, "#4a90c2"); box(p, 0.5, 0.55, 0.66, 0.7, 0.32, 0.52, "#c24a4a");
      box(p, 0.68, 0.55, 0.84, 0.7, 0.12, 0.32, "#4ac28a");
      poly([project(p, 0.2, 0.95, 0.05), project(p, 0.45, 0.95, 0.05), project(p, 0.4, 1.08, 0.05), project(p, 0.25, 1.08, 0.05)], "#7a3b3b");
    },
    airport(p, def, cx, cy) {
      box(p, 0.06, 0.06, 0.94, 0.94, 0, 0.08, "#8f9aa6");
      for (let i = 0; i < 4; i++) { const ua = 0.2 + i * 0.16; poly([project(p, ua, 0.48, 0.09), project(p, ua + 0.08, 0.48, 0.09), project(p, ua + 0.08, 0.52, 0.09), project(p, ua, 0.52, 0.09)], "#eef2f5"); }
      box(p, 0.7, 0.16, 0.8, 0.26, 0.08, 1.1, "#cfd6dd"); box(p, 0.66, 0.12, 0.84, 0.3, 1.1, 1.28, "#3f6fae");
      box(p, 0.2, 0.62, 0.55, 0.7, 0.08, 0.2, "#f2f4f7");
      poly([project(p, 0.32, 0.55, 0.16), project(p, 0.4, 0.55, 0.16), project(p, 0.4, 0.8, 0.16), project(p, 0.32, 0.8, 0.16)], "#d6dde4");
      box(p, 0.5, 0.63, 0.56, 0.69, 0.2, 0.34, "#cdd6de");
    },
    kindness(p, def, cx, cy) {
      box(p, 0.22, 0.22, 0.78, 0.78, 0, 0.6, shade(def.color, jit(cx, cy))); box(p, 0.22, 0.22, 0.78, 0.78, 0.6, 0.66, "#b85a98");
      heart(project(p, 0.5, 0.5, 1.05), 11, "#e0539b"); windowsV1(p, 0.78, [0.38, 0.62], 0.2, 0.45, "#fff0f8");
    },
    park(p, def, cx, cy) {
      diamond(cx, cy, "#5fae62", "#4e9d5b"); tree(p, 0.3, 0.35); tree(p, 0.68, 0.3); tree(p, 0.5, 0.7);
      const pa = project(p, 0.1, 0.9, 0), pb = project(p, 0.9, 0.55, 0);
      ctx.lineWidth = 3; ctx.strokeStyle = "#caa46a"; ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    },
  };

  // --- The Omand royal castle (offshore) -----------------------------------
  function drawCastle(cx, cy) {
    const p = tileToScreen(cx, cy);
    poly([project(p, -0.15, -0.15, 0), project(p, 1.15, -0.15, 0), project(p, 1.15, 1.15, 0), project(p, -0.15, 1.15, 0)], "#7a746a", "#5d584f");
    box(p, 0, 0, 1, 1, 0, 0.18, "#8a8478");
    box(p, 0.3, 0.3, 0.7, 0.7, 0.18, 1.5, "#cdc7ba"); box(p, 0.3, 0.3, 0.7, 0.7, 1.5, 1.62, "#b3ad9f");
    pyramid(p, 0.28, 0.28, 0.72, 0.72, 1.62, 0.5, "#3f6fae"); flag(p, 0.5, 0.5, 2.12, "#d8b24a");
    const turret = (u, v) => {
      box(p, u - 0.1, v - 0.1, u + 0.1, v + 0.1, 0.18, 1.85, "#d6d0c3");
      pyramid(p, u - 0.13, v - 0.13, u + 0.13, v + 0.13, 1.85, 0.45, "#365d96"); flag(p, u, v, 2.3, "#d8b24a");
    };
    turret(0.18, 0.18); turret(0.82, 0.18); turret(0.18, 0.82); turret(0.82, 0.82);
    box(p, 0.4, 0.7, 0.6, 0.95, 0.18, 0.75, "#bdb6a7");
    poly([project(p, 0.45, 0.95, 0.18), project(p, 0.55, 0.95, 0.18), project(p, 0.55, 0.95, 0.55), project(p, 0.45, 0.95, 0.55)], "#3a3530");
  }

  // --- Cars driving on the road network ------------------------------------
  const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
  const CARCOLORS = ["#d94f4f", "#4f7fd9", "#e0b84f", "#5fb56a", "#8a5fd9", "#e0e0e0", "#3a3a40"];
  let cars = [];
  function isRoad(state, cx, cy) { const r = state.grid[cy]; return !!(r && r[cx] && r[cx].type === "road"); }
  function roadNeighborDirs(state, cx, cy) {
    const out = []; for (let d = 0; d < 4; d++) if (isRoad(state, cx + DX[d], cy + DY[d])) out.push(d); return out;
  }
  function spawnCar(state, roads) {
    if (!roads.length) return;
    const tile = roads[(Math.random() * roads.length) | 0];
    const dirs = roadNeighborDirs(state, tile.cx, tile.cy);
    if (!dirs.length) return;
    cars.push({ cx: tile.cx, cy: tile.cy, dir: dirs[(Math.random() * dirs.length) | 0], prog: Math.random(),
      color: CARCOLORS[(Math.random() * CARCOLORS.length) | 0], speed: 1.1 + Math.random() * 0.8 });
  }
  function updateCars(state, dt) {
    const roads = [];
    for (let y = 0; y < C.MAP.rows; y++) for (let x = 0; x < C.MAP.cols; x++) if (isRoad(state, x, y)) roads.push({ cx: x, cy: y });
    const target = Math.min(40, Math.floor(roads.length * 0.45));
    while (cars.length < target) { const before = cars.length; spawnCar(state, roads); if (cars.length === before) break; }
    while (cars.length > target) cars.pop();
    for (const car of cars) {
      car.prog += car.speed * dt;
      let guard = 0;
      while (car.prog >= 1 && guard++ < 4) {
        car.prog -= 1;
        car.cx += DX[car.dir]; car.cy += DY[car.dir];
        const opts = roadNeighborDirs(state, car.cx, car.cy);
        if (!opts.length) { car.dead = true; break; }
        const rev = (car.dir + 2) % 4;
        let choices = opts.filter((d) => d !== rev);
        if (!choices.length) choices = opts;                 // dead-end: U-turn
        // prefer going straight
        car.dir = choices.includes(car.dir) && Math.random() < 0.7 ? car.dir : choices[(Math.random() * choices.length) | 0];
      }
    }
    cars = cars.filter((c) => !c.dead);
  }
  function drawCars() {
    const list = cars.slice().sort((a, b) => (a.cx + a.cy + a.prog) - (b.cx + b.cy + b.prog));
    for (const car of list) {
      const u = car.cx + DX[car.dir] * car.prog, v = car.cy + DY[car.dir] * car.prog;
      // lane offset (drive on the right): perpendicular to travel direction
      const px = -DY[car.dir] * 0.16, py = DX[car.dir] * 0.16;
      const p = tileToScreen(0, 0);
      const c = project(p, u + 0.5 + px, v + 0.5 + py, 0.02);
      ctx.fillStyle = "rgba(0,0,0,0.18)"; ctx.beginPath(); ctx.ellipse(c.x, c.y + 3, 7, 3.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = car.color;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, 6, 4, 0, 0, 7); ctx.fill();
      ctx.fillStyle = shade(car.color, 0.18); ctx.beginPath(); ctx.ellipse(c.x, c.y - 1.5, 3.5, 2, 0, 0, 7); ctx.fill();
    }
  }

  // --- ownership tint ------------------------------------------------------
  function owned(state, cx, cy) {
    const d = C.MAP.districtOf(cx, cy);
    return d && state.ownedDistricts && state.ownedDistricts[d.key];
  }

  // --- full frame ----------------------------------------------------------
  function frame(state, hover, selectedType, ts) {
    const { cols, rows } = C.MAP;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016; lastTs = ts || lastTs + 16;
    waveT += 0.05;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
    g.addColorStop(0, "#bfe3f2"); g.addColorStop(1, "#e9f6ef");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    updateCars(state, dt);
    const castle = C.CASTLE;
    for (let sum = 0; sum <= (cols - 1) + (rows - 1); sum++) {
      for (let cx = 0; cx < cols; cx++) {
        const cy = sum - cx;
        if (cy < 0 || cy >= rows) continue;
        let fill;
        if (C.MAP.isWater(cx, cy)) {
          fill = shade("#4f97c8", Math.sin(waveT + (cx + cy) * 0.6) * 0.04);
        } else if (!owned(state, cx, cy)) {
          fill = ((cx + cy) % 2 === 0) ? "#b3ac8e" : "#aaa485";       // unowned land (for sale)
        } else {
          fill = ((cx + cy) % 2 === 0) ? "#8fc56a" : "#86bd63";        // owned grass
        }
        diamond(cx, cy, fill, "rgba(0,0,0,0.05)");

        if (cx === castle.cx && cy === castle.cy) { drawCastle(cx, cy); continue; }
        const b = state.grid[cy] && state.grid[cy][cx];
        if (b) { if (b.type === "road") roadTile(cx, cy); else if (DRAW[b.type]) DRAW[b.type](tileToScreen(cx, cy), C.BUILDINGS[b.type], cx, cy); }
      }
    }

    drawCars();

    // hover highlight + ghost
    if (hover && hover.cx >= 0 && hover.cy >= 0 && hover.cx < cols && hover.cy < rows) {
      const occupied = (state.grid[hover.cy] && state.grid[hover.cy][hover.cx]) || (hover.cx === castle.cx && hover.cy === castle.cy);
      let hl = occupied ? "rgba(220,80,80,0.30)" : "rgba(255,255,255,0.35)";
      if (selectedType === "__buyland") hl = "rgba(216,178,74,0.40)";
      diamond(hover.cx, hover.cy, hl, "#ffffff");
      if (selectedType && selectedType !== "__bulldoze" && selectedType !== "__buyland" && !occupied) {
        ctx.globalAlpha = 0.6;
        if (selectedType === "road") roadTile(hover.cx, hover.cy);
        else if (DRAW[selectedType]) DRAW[selectedType](tileToScreen(hover.cx, hover.cy), C.BUILDINGS[selectedType], hover.cx, hover.cy);
        ctx.globalAlpha = 1;
      }
    }
  }

  return { init, frame, screenToTile, tileToScreen, pan, centerOn, resize };
})();
