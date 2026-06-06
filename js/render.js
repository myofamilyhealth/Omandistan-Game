/* ============================================================================
 * OMANDISTAN — render.js
 * Isometric 2.5D renderer drawn entirely with canvas primitives (no image
 * assets). Buildings are composed from iso boxes, pitched/pyramid roofs,
 * towers, smokestacks, trees, ships and planes so each has a real silhouette.
 * Exposes a global `Render` object.
 * ==========================================================================*/
window.Render = (function () {
  "use strict";
  const C = window.CONFIG;
  const TW = C.MAP.tileW, TH = C.MAP.tileH;
  const ZUNIT = TH;                 // pixels per height-unit (1 unit = 1 tile tall)

  let canvas, ctx, dpr = 1;
  const cam = { x: 0, y: 0 };
  let originX = 0, originY = 0;
  let waveT = 0;

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }
  function resize() {
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    originX = canvas.clientWidth / 2;
    originY = 150;
  }

  // --- Coordinate transforms ----------------------------------------------
  function tileToScreen(cx, cy) {
    return { x: originX + cam.x + (cx - cy) * (TW / 2),
             y: originY + cam.y + (cx + cy) * (TH / 2) };
  }
  function screenToTile(sx, sy) {
    const x = sx - originX - cam.x;
    const y = sy - originY - cam.y;
    const cx = (x / (TW / 2) + y / (TH / 2)) / 2;
    const cy = (y / (TH / 2) - x / (TW / 2)) / 2;
    return { cx: Math.floor(cx), cy: Math.floor(cy) };
  }
  function pan(dx, dy) { cam.x += dx; cam.y += dy; }

  // --- Low-level helpers ---------------------------------------------------
  // p = top corner of a tile diamond. (u,v) are tile fractions; z is height.
  function project(p, u, v, z) {
    return { x: p.x + (u - v) * (TW / 2), y: p.y + (u + v) * (TH / 2) - z * ZUNIT };
  }
  function poly(pts, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r + amt * 255), 0, 255);
    g = clamp(Math.round(g + amt * 255), 0, 255);
    b = clamp(Math.round(b + amt * 255), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // An extruded box. Footprint (u0,v0)-(u1,v1), from height z0 to z1.
  function box(p, u0, v0, u1, v1, z0, z1, color) {
    // left face (the v1 side, faces front-left)
    poly([project(p, u0, v1, z0), project(p, u1, v1, z0),
          project(p, u1, v1, z1), project(p, u0, v1, z1)], shade(color, -0.30));
    // right face (the u1 side, faces front-right)
    poly([project(p, u1, v0, z0), project(p, u1, v1, z0),
          project(p, u1, v1, z1), project(p, u1, v0, z1)], shade(color, -0.15));
    // top face
    poly([project(p, u0, v0, z1), project(p, u1, v0, z1),
          project(p, u1, v1, z1), project(p, u0, v1, z1)], color);
  }

  // A hip/pyramid roof sitting on a footprint.
  function pyramid(p, u0, v0, u1, v1, z0, peak, color) {
    const A = project(p, u0, v0, z0), B = project(p, u1, v0, z0),
          Cc = project(p, u1, v1, z0), D = project(p, u0, v1, z0);
    const top = project(p, (u0 + u1) / 2, (v0 + v1) / 2, z0 + peak);
    poly([A, B, top], shade(color, -0.05));          // north (mostly hidden)
    poly([A, D, top], shade(color, -0.22));          // west  (mostly hidden)
    poly([B, Cc, top], shade(color, -0.12));         // front-right
    poly([D, Cc, top], shade(color, -0.26));         // front-left
  }

  // Small windows on the front-left (v1) wall.
  function windowsV1(p, v1, us, z0, z1, color) {
    for (const u of us) {
      const w = 0.07;
      poly([project(p, u - w, v1, z0), project(p, u + w, v1, z0),
            project(p, u + w, v1, z1), project(p, u - w, v1, z1)], color);
    }
  }
  function tree(p, u, v) {
    box(p, u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 0.22, "#7a5230"); // trunk
    const c = project(p, u, v, 0.55);
    ctx.fillStyle = "#3f8a4d";
    ctx.beginPath(); ctx.arc(c.x, c.y, TW * 0.17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#4fa05c";
    ctx.beginPath(); ctx.arc(c.x - 3, c.y - 3, TW * 0.11, 0, Math.PI * 2); ctx.fill();
  }
  function flag(p, u, v, z, color) {
    box(p, u - 0.015, v - 0.015, u + 0.015, v + 0.015, z, z + 0.5, "#6b5234"); // pole
    const a = project(p, u, v, z + 0.5), b = project(p, u, v, z + 0.34);
    poly([a, b, { x: a.x + 16, y: a.y + 5 }], color);
  }
  function heart(pt, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pt.x - s * 0.5, pt.y, s * 0.5, Math.PI, 0);
    ctx.arc(pt.x + s * 0.5, pt.y, s * 0.5, Math.PI, 0);
    ctx.lineTo(pt.x, pt.y + s * 1.1);
    ctx.closePath(); ctx.fill();
  }
  function seedJit(cx, cy) { return ((cx * 73 + cy * 151) % 7) / 7 * 0.06 - 0.03; }

  // --- Ground tiles --------------------------------------------------------
  function diamond(cx, cy, fill, stroke) {
    const p = tileToScreen(cx, cy);
    poly([{ x: p.x, y: p.y }, { x: p.x + TW / 2, y: p.y + TH / 2 },
          { x: p.x, y: p.y + TH }, { x: p.x - TW / 2, y: p.y + TH / 2 }], fill, stroke);
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
    diamond(cx, cy, "#9a7b46", "#7c6238");               // tilled soil
    ctx.strokeStyle = "#86663b"; ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {                          // plow furrows
      const a = project(p, i / 6, 0, 0), b = project(p, i / 6, 1, 0);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.fillStyle = "#7fae4e";                             // crop sprouts
    for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) {
      const q = project(p, i / 6, j / 6, 0);
      ctx.fillRect(q.x - 1, q.y - 3, 2, 3);
    }
  }

  // --- Per-building renderers ----------------------------------------------
  const DRAW = {
    road(p) {},  // handled by roadTile
    house(p, def, cx, cy) {
      const j = seedJit(cx, cy);
      box(p, 0.22, 0.22, 0.78, 0.78, 0, 0.75, shade(def.color, j));
      windowsV1(p, 0.78, [0.4, 0.6], 0.25, 0.5, "#fff4cf");
      poly([project(p, 0.46, 0.78, 0), project(p, 0.54, 0.78, 0),
            project(p, 0.54, 0.78, 0.35), project(p, 0.46, 0.78, 0.35)], "#8a5a2a"); // door
      pyramid(p, 0.18, 0.18, 0.82, 0.82, 0.75, 0.42, "#b5503f");                      // roof
      box(p, 0.3, 0.3, 0.38, 0.38, 0.75, 1.2, "#9a5a3a");                              // chimney
    },
    farm(p, def, cx, cy) {
      farmlandTile(cx, cy);
      box(p, 0.1, 0.55, 0.42, 0.88, 0, 0.5, "#b5503f");      // red barn
      pyramid(p, 0.07, 0.52, 0.45, 0.91, 0.5, 0.3, "#7c3a2e");
      box(p, 0.62, 0.18, 0.8, 0.36, 0, 0.7, "#d8d2c2");      // silo
      pyramid(p, 0.6, 0.16, 0.82, 0.38, 0.7, 0.22, "#9a9484");
    },
    market(p, def, cx, cy) {
      box(p, 0.2, 0.2, 0.8, 0.8, 0, 0.55, shade(def.color, seedJit(cx, cy)));
      box(p, 0.2, 0.2, 0.8, 0.8, 0.55, 0.62, "#34597a");      // flat roof cap
      // striped awning over the front (v1) face
      for (let i = 0; i < 5; i++) {
        const ua = 0.2 + i * 0.12, ub = ua + 0.12;
        poly([project(p, ua, 0.8, 0.5), project(p, ub, 0.8, 0.5),
              project(p, ub, 0.95, 0.42), project(p, ua, 0.95, 0.42)],
             i % 2 ? "#e85d5d" : "#f4f0e6");
      }
      windowsV1(p, 0.8, [0.35, 0.65], 0.18, 0.4, "#cfe8ff");
    },
    factory(p, def, cx, cy) {
      box(p, 0.15, 0.2, 0.85, 0.8, 0, 0.8, shade(def.color, seedJit(cx, cy)));
      box(p, 0.6, 0.22, 0.72, 0.34, 0.8, 1.5, "#7a6347");     // smokestack 1
      box(p, 0.74, 0.22, 0.86, 0.34, 0.8, 1.35, "#7a6347");   // smokestack 2
      const s = project(p, 0.66, 0.28, 1.55);                  // steam puff
      ctx.fillStyle = "rgba(230,230,230,0.85)";
      ctx.beginPath(); ctx.arc(s.x, s.y, 7, 0, Math.PI * 2); ctx.arc(s.x + 6, s.y - 4, 5, 0, Math.PI * 2); ctx.fill();
      windowsV1(p, 0.8, [0.3, 0.45], 0.2, 0.55, "#bcd2e0");
    },
    hospital(p, def, cx, cy) {
      box(p, 0.18, 0.18, 0.82, 0.82, 0, 1.0, "#f3f5f7");
      box(p, 0.18, 0.18, 0.82, 0.82, 1.0, 1.08, "#d96a6a");
      box(p, 0.44, 0.3, 0.56, 0.7, 1.08, 1.18, "#d23b3b");     // red cross (vertical)
      box(p, 0.3, 0.44, 0.7, 0.56, 1.08, 1.18, "#d23b3b");     // red cross (horizontal)
      windowsV1(p, 0.82, [0.32, 0.5, 0.68], 0.2, 0.85, "#bfe0ff");
    },
    school(p, def, cx, cy) {
      box(p, 0.16, 0.2, 0.84, 0.8, 0, 0.6, shade(def.color, seedJit(cx, cy)));
      pyramid(p, 0.13, 0.17, 0.87, 0.83, 0.6, 0.3, "#7c4a2a");
      box(p, 0.46, 0.3, 0.6, 0.44, 0.6, 1.15, "#e8d8b0");      // bell tower
      pyramid(p, 0.44, 0.28, 0.62, 0.46, 1.15, 0.22, "#9a3b3b");
      flag(p, 0.53, 0.37, 1.37, "#3f6fae");
      windowsV1(p, 0.8, [0.3, 0.5, 0.7], 0.2, 0.45, "#fff4cf");
    },
    university(p, def, cx, cy) {
      box(p, 0.15, 0.18, 0.85, 0.82, 0, 0.85, shade(def.color, seedJit(cx, cy)));
      // dome
      const dc = project(p, 0.5, 0.5, 0.85);
      ctx.fillStyle = "#cbb46a";
      ctx.beginPath(); ctx.arc(dc.x, dc.y - 6, TW * 0.16, Math.PI, 0); ctx.fill();
      ctx.fillStyle = "#a8923f"; ctx.fillRect(dc.x - 1.5, dc.y - 6 - TW * 0.16 - 6, 3, 8);
      // columns on the front face
      for (const u of [0.25, 0.4, 0.55, 0.7]) box(p, u - 0.02, 0.82, u + 0.02, 0.86, 0, 0.6, "#efeae0");
      flag(p, 0.85, 0.85, 0.85, "#9a6cb0");
    },
    port(p, def, cx, cy) {
      box(p, 0.1, 0.1, 0.9, 0.9, 0, 0.12, "#6b4f33");          // dock planks
      box(p, 0.15, 0.55, 0.45, 0.85, 0.12, 0.5, "#caa15a");    // warehouse
      // crane
      box(p, 0.66, 0.2, 0.74, 0.28, 0.12, 1.2, "#d98a3a");
      box(p, 0.4, 0.2, 0.74, 0.28, 1.1, 1.2, "#d98a3a");       // crane arm
      // stacked containers
      box(p, 0.5, 0.55, 0.66, 0.7, 0.12, 0.32, "#4a90c2");
      box(p, 0.5, 0.55, 0.66, 0.7, 0.32, 0.52, "#c24a4a");
      box(p, 0.68, 0.55, 0.84, 0.7, 0.12, 0.32, "#4ac28a");
      // little boat hull poking off the dock
      poly([project(p, 0.2, 0.95, 0.05), project(p, 0.45, 0.95, 0.05),
            project(p, 0.4, 1.08, 0.05), project(p, 0.25, 1.08, 0.05)], "#7a3b3b");
    },
    airport(p, def, cx, cy) {
      box(p, 0.06, 0.06, 0.94, 0.94, 0, 0.08, "#8f9aa6");      // tarmac
      // runway stripe
      for (let i = 0; i < 4; i++) {
        const ua = 0.2 + i * 0.16;
        poly([project(p, ua, 0.48, 0.09), project(p, ua + 0.08, 0.48, 0.09),
              project(p, ua + 0.08, 0.52, 0.09), project(p, ua, 0.52, 0.09)], "#eef2f5");
      }
      // control tower
      box(p, 0.7, 0.16, 0.8, 0.26, 0.08, 1.1, "#cfd6dd");
      box(p, 0.66, 0.12, 0.84, 0.3, 1.1, 1.28, "#3f6fae");
      // a parked plane (fuselage + wings + tail)
      box(p, 0.2, 0.62, 0.55, 0.7, 0.08, 0.2, "#f2f4f7");
      poly([project(p, 0.32, 0.55, 0.16), project(p, 0.4, 0.55, 0.16),
            project(p, 0.4, 0.8, 0.16), project(p, 0.32, 0.8, 0.16)], "#d6dde4"); // wings
      box(p, 0.5, 0.63, 0.56, 0.69, 0.2, 0.34, "#cdd6de");     // tail
    },
    kindness(p, def, cx, cy) {
      box(p, 0.22, 0.22, 0.78, 0.78, 0, 0.6, shade(def.color, seedJit(cx, cy)));
      box(p, 0.22, 0.22, 0.78, 0.78, 0.6, 0.66, "#b85a98");
      heart(project(p, 0.5, 0.5, 1.05), 11, "#e0539b");
      windowsV1(p, 0.78, [0.38, 0.62], 0.2, 0.45, "#fff0f8");
    },
    park(p, def, cx, cy) {
      diamond(cx, cy, "#5fae62", "#4e9d5b");
      tree(p, 0.3, 0.35); tree(p, 0.68, 0.3); tree(p, 0.5, 0.7);
      ctx.fillStyle = "#caa46a";
      const pa = project(p, 0.1, 0.9, 0), pb = project(p, 0.9, 0.55, 0);
      ctx.lineWidth = 3; ctx.strokeStyle = "#caa46a";
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    },
  };

  // --- The Omand royal castle (offshore, not player-built) -----------------
  function drawCastle(cx, cy) {
    const p = tileToScreen(cx, cy);
    // rocky island base
    ctx.fillStyle = "#6f6a60";
    poly([project(p, -0.15, -0.15, 0), project(p, 1.15, -0.15, 0),
          project(p, 1.15, 1.15, 0), project(p, -0.15, 1.15, 0)], "#7a746a", "#5d584f");
    box(p, 0, 0, 1, 1, 0, 0.18, "#8a8478");                  // raised plinth
    // central keep
    box(p, 0.3, 0.3, 0.7, 0.7, 0.18, 1.5, "#cdc7ba");
    box(p, 0.3, 0.3, 0.7, 0.7, 1.5, 1.62, "#b3ad9f");        // crenellation band
    pyramid(p, 0.28, 0.28, 0.72, 0.72, 1.62, 0.5, "#3f6fae");
    flag(p, 0.5, 0.5, 2.12, "#d8b24a");
    // four corner turrets
    const turret = (u, v) => {
      box(p, u - 0.1, v - 0.1, u + 0.1, v + 0.1, 0.18, 1.85, "#d6d0c3");
      pyramid(p, u - 0.13, v - 0.13, u + 0.13, v + 0.13, 1.85, 0.45, "#365d96");
      flag(p, u, v, 2.3, "#d8b24a");
    };
    turret(0.18, 0.18); turret(0.82, 0.18); turret(0.18, 0.82); turret(0.82, 0.82);
    // gatehouse with a dark arch on the front
    box(p, 0.4, 0.7, 0.6, 0.95, 0.18, 0.75, "#bdb6a7");
    poly([project(p, 0.45, 0.95, 0.18), project(p, 0.55, 0.95, 0.18),
          project(p, 0.55, 0.95, 0.55), project(p, 0.45, 0.95, 0.55)], "#3a3530");
  }

  // --- Full frame ----------------------------------------------------------
  function frame(state, hover, selectedType) {
    const { cols, rows } = C.MAP;
    waveT += 0.05;
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    const g = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight);
    g.addColorStop(0, "#bfe3f2"); g.addColorStop(1, "#e9f6ef");
    ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

    const castle = C.CASTLE;
    for (let sum = 0; sum <= (cols - 1) + (rows - 1); sum++) {
      for (let cx = 0; cx < cols; cx++) {
        const cy = sum - cx;
        if (cy < 0 || cy >= rows) continue;
        const edge = (cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1);
        let fill;
        if (edge) {
          const w = Math.sin(waveT + (cx + cy) * 0.6) * 0.04;
          fill = shade("#5aa0cf", w);                       // shimmering water
        } else fill = ((cx + cy) % 2 === 0) ? "#8fc56a" : "#86bd63";
        diamond(cx, cy, fill, "rgba(0,0,0,0.05)");

        if (cx === castle.cx && cy === castle.cy) { drawCastle(cx, cy); continue; }
        const b = state.grid[cy] && state.grid[cy][cx];
        if (b) {
          if (b.type === "road") roadTile(cx, cy);
          else if (DRAW[b.type]) DRAW[b.type](tileToScreen(cx, cy), C.BUILDINGS[b.type], cx, cy);
        }
      }
    }

    // hover highlight + ghost
    if (hover && hover.cx >= 0 && hover.cy >= 0 && hover.cx < cols && hover.cy < rows) {
      const occupied = (state.grid[hover.cy] && state.grid[hover.cy][hover.cx]) ||
                       (hover.cx === castle.cx && hover.cy === castle.cy);
      diamond(hover.cx, hover.cy, occupied ? "rgba(220,80,80,0.30)" : "rgba(255,255,255,0.35)", "#ffffff");
      if (selectedType && !occupied) {
        ctx.globalAlpha = 0.6;
        if (selectedType === "road") roadTile(hover.cx, hover.cy);
        else if (DRAW[selectedType]) DRAW[selectedType](tileToScreen(hover.cx, hover.cy), C.BUILDINGS[selectedType], hover.cx, hover.cy);
        ctx.globalAlpha = 1;
      }
    }
  }

  return { init, frame, screenToTile, tileToScreen, pan, resize };
})();
