/* ============================================================================
 * OMANDISTAN — game.js
 * State, input, the Omand approval flow, land buying, the world map & trade,
 * the tax system, events, the simulation loop, and all UI wiring. Loaded last.
 * ==========================================================================*/
(function () {
  "use strict";
  const C = window.CONFIG, E = window.Economy, R = window.Render, W = window.World;
  const $ = (id) => document.getElementById(id);
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const TRADE_ITEMS = ["money", "wood", "oil", "gas"];

  // ---- State --------------------------------------------------------------
  const startTax = C.TAX.presets.find((p) => p.id === C.TAX.start);
  const state = {
    treasury: C.START.treasury, loveTokens: C.START.loveTokens,
    population: C.START.population, happiness: C.START.happiness,
    resources: Object.assign({}, C.START.resources),
    buildings: [], grid: [],
    ownedDistricts: { [C.START.ownedDistrict]: true },
    month: 0, lastPriceIndex: 0, priceLevel: 1,
    policies: { publicHealth: false, tax: { rate: C.ECON.taxBase, mode: "flat", id: "auto", auto: true } },
    tariffs: { elliott: 0, wardmania: 0, cindara: 0, technova: 0 },
    trade: { deals: [] },
    countryPPC: {},
    diff: C.DIFFICULTY.normal,   // economic difficulty (chosen at start)
    autoKindness: false,         // auto-accept kindness aid requests (no sim pause)
    stats: null,
  };
  for (const k in C.COUNTRIES) state.countryPPC[k] = C.COUNTRIES[k].ppc;
  for (let r = 0; r < C.MAP.rows; r++) state.grid.push(new Array(C.MAP.cols).fill(null));

  let selectedType = null, hover = null, speedIndex = 0, tickTimer = null, pendingLove = 0;
  let canvas, minimap, mmCtx, lastStance = "Neutral";

  function log(msg, kind) {
    const el = $("log"); const line = document.createElement("div");
    line.className = "logline" + (kind ? " " + kind : ""); line.textContent = msg;
    el.prepend(line); while (el.children.length > 40) el.removeChild(el.lastChild);
  }
  const money = (x) => "$" + Math.round(x).toLocaleString();
  const pct = (x) => Math.round(x * 100) + "%";
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // ---- Build helpers ------------------------------------------------------
  function adjRoad(cx, cy) {
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const r = state.grid[cy + dy]; return r && r[cx + dx] && r[cx + dx].type === "road";
    });
  }
  function ownedAt(cx, cy) { const d = C.MAP.districtOf(cx, cy); return d && state.ownedDistricts[d.key]; }
  function missingRes(def) {
    const out = []; if (def.res) for (const r in def.res) if ((state.resources[r] || 0) < def.res[r]) out.push(`${def.res[r]} ${C.RESOURCES[r].icon}`);
    return out;
  }

  // Nominal (inflation-adjusted) cost of a building right now.
  function buildCost(def) { return Math.round(def.cost * state.priceLevel); }

  function tryPlace(cx, cy) {
    if (!selectedType) return;
    if (cx === C.CASTLE.cx && cy === C.CASTLE.cy) { log("That's the royal castle — the Omands live there! 🏰", "warn"); return; }
    if (C.MAP.isWater(cx, cy)) { log("That's the open sea — you can't build on water.", "warn"); return; }
    if (!ownedAt(cx, cy)) { log("You don't own this land yet. Use 🏞️ Buy Land to expand.", "warn"); return; }
    if (state.grid[cy][cx]) { log("That tile is already occupied.", "warn"); return; }
    const def = C.BUILDINGS[selectedType];
    if (def.requiresWater && ![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy]) => C.MAP.isWater(cx+dx, cy+dy))) {
      log(`A ${def.name} must be on the coast — place it next to the water. 🌊`, "warn"); return;
    }
    if (!def.noRoadNeeded && !adjRoad(cx, cy)) { log(`${def.name} must be built next to a 🛣️ Road. Lay roads first!`, "warn"); return; }
    const bcost = buildCost(def);
    if (state.treasury < bcost) { log(`Not enough money for a ${def.name} (${money(bcost)} at today's prices).`, "warn"); return; }
    const miss = missingRes(def);
    if (miss.length) { log(`Not enough resources for ${def.name}: need ${miss.join(", ")}. Build extractors!`, "warn"); return; }
    if (def.love > 0 && state.loveTokens < def.love) {
      log(`The Omands need ${def.love} 💞 to approve this. Do acts of kindness!`, "warn"); flashOmand("More kindness first, dear builder."); return;
    }
    state.treasury -= bcost;
    if (def.res) for (const r in def.res) state.resources[r] -= def.res[r];
    if (def.love > 0) { state.loveTokens -= def.love; flashOmand(`Approved! ${def.icon} (−${def.love} 💞)`); }
    const b = { type: selectedType, cx, cy, level: 1 }; state.buildings.push(b); state.grid[cy][cx] = b;
    log(`Built ${def.name} ${def.icon}.`, "good");
    if (def.housing && state.population === 0) { state.population = 6; log("6 founding settlers move into Omandistan! 🎉", "good"); }
    refreshStats();
  }

  function bulldoze(cx, cy) {
    const b = state.grid[cy] && state.grid[cy][cx]; if (!b) return;
    state.grid[cy][cx] = null; state.buildings = state.buildings.filter((x) => x !== b);
    log(`Removed ${C.BUILDINGS[b.type].name}.`, ""); refreshStats();
  }

  // ---- Upgrades -----------------------------------------------------------
  function upgradeCost(def, toLevel) {
    const U = C.UPGRADE, res = {};
    if (def.res) for (const r in def.res) res[r] = Math.ceil(def.res[r] * U.costRes[toLevel - 1]);
    return { money: Math.round(def.cost * U.costMoney[toLevel - 1] * state.priceLevel), res, love: U.love };
  }
  function upgrade(cx, cy) {
    const b = state.grid[cy] && state.grid[cy][cx];
    if (!b) { log("Click a building to upgrade it.", "warn"); return; }
    if (b.type === "road") { log("Roads can't be upgraded.", "warn"); return; }
    const def = C.BUILDINGS[b.type], lv = b.level || 1;
    if (lv >= C.UPGRADE.maxLevel) { log(`${def.name} is already at max level (★${lv}).`, "warn"); return; }
    const cost = upgradeCost(def, lv + 1);
    if (state.treasury < cost.money) { log(`Upgrading ${def.name} costs ${money(cost.money)}.`, "warn"); return; }
    const miss = []; for (const r in cost.res) if ((state.resources[r] || 0) < cost.res[r]) miss.push(cost.res[r] + C.RESOURCES[r].icon);
    if (miss.length) { log(`Need ${miss.join(", ")} to upgrade ${def.name}.`, "warn"); return; }
    if (state.loveTokens < cost.love) { log(`The Omands need ${cost.love} 💞 to approve this upgrade.`, "warn"); return; }
    state.treasury -= cost.money; for (const r in cost.res) state.resources[r] -= cost.res[r]; state.loveTokens -= cost.love;
    b.level = lv + 1;
    flashOmand(`${def.icon} upgraded to Level ${b.level}!`);
    log(`Upgraded ${def.name} to Level ${b.level} ${"★".repeat(b.level)} — more output & jobs!`, "good");
    refreshStats();
    return true;
  }

  // ---- Building inspector popup -------------------------------------------
  let inspect = null;   // { cx, cy, x, y }
  const GDPNAME = { C: "Consumption (C)", I: "Investment (I)", G: "Government (G)", X: "Net Exports (Xn)" };
  function buildingLines(def, lv) {
    const U = C.UPGRADE, m = U.outMult[lv - 1], jm = U.jobMult[lv - 1], lines = [];
    if (def.jobs) lines.push(`👷 Jobs: <b>${Math.round(def.jobs * jm)}</b>`);
    if (def.housing) lines.push(`🏠 Housing: <b>${Math.round(def.housing * m)}</b>`);
    if (def.foodOutput) lines.push(`🌾 Food: <b>${(def.foodOutput * m).toFixed(0)}</b>/mo`);
    if (def.goodsOutput) lines.push(`🛒 Retail goods: <b>${(def.goodsOutput * m).toFixed(0)}</b>/mo`);
    if (def.industrialOutput) lines.push(`🏭 Output: <b>${(def.industrialOutput * m).toFixed(0)}</b>/mo`);
    if (def.healthCapacity) lines.push(`🏥 Care capacity: <b>${Math.round(def.healthCapacity * m)}</b>`);
    if (def.humanCapital) lines.push(`🎓 Human capital: <b>${Math.round(def.humanCapital * m)}</b>`);
    if (def.amenity) lines.push(`🌳 Amenity: <b>${Math.round(def.amenity * m)}</b>`);
    if (def.tradeCapacity) lines.push(`🚢 Trade cap: <b>${Math.round(def.tradeCapacity * m)}</b>/mo`);
    if (def.lovePerTick) lines.push(`💞 Love: <b>+${(def.lovePerTick * m).toFixed(1)}</b>/mo`);
    if (def.produces) for (const r in def.produces) lines.push(`${C.RESOURCES[r].icon} ${C.RESOURCES[r].name}: <b>+${(def.produces[r] * m).toFixed(1)}</b>/mo`);
    if (def.gdpc) lines.push(`💵 Feeds: <b>${GDPNAME[def.gdpc]}</b>`);
    lines.push(`🛠️ Upkeep: <b>${money(def.upkeep * (1 + (lv - 1) * 0.5))}</b>/mo`);
    return lines;
  }
  function openInspect(cx, cy, x, y) {
    const b = state.grid[cy] && state.grid[cy][cx];
    if (!b || b.type === "road") { closeInspect(); return; }
    inspect = { cx, cy, x, y };
    renderInspect();
  }
  function renderInspect() {
    if (!inspect) return;
    const el = $("inspect");
    const b = state.grid[inspect.cy] && state.grid[inspect.cy][inspect.cx];
    if (!b) { closeInspect(); return; }
    const def = C.BUILDINGS[b.type], lv = b.level || 1, U = C.UPGRADE;
    const stars = "★".repeat(lv) + "☆".repeat(U.maxLevel - lv);
    let upg;
    if (lv >= U.maxLevel) {
      upg = `<div class="ins-max">★ Max level reached</div>`;
    } else {
      const cost = upgradeCost(def, lv + 1);
      const resStr = Object.keys(cost.res).map((r) => cost.res[r] + C.RESOURCES[r].icon).join(" ");
      const can = state.treasury >= cost.money && state.loveTokens >= cost.love &&
                  Object.keys(cost.res).every((r) => (state.resources[r] || 0) >= cost.res[r]);
      upg = `<button id="insUpg" class="btn primary ins-upg ${can ? "" : "disabled"}">⬆️ Upgrade to ★${lv + 1}
        <span class="ins-cost">${money(cost.money)}${resStr ? " · " + resStr : ""} · 1💞</span></button>`;
    }
    el.innerHTML = `<div class="ins-head"><span>${def.icon} ${def.name}</span><button id="insClose" class="ins-x">✕</button></div>
      <div class="ins-stars">${stars} <span class="ins-cat">${def.category}</span></div>
      <div class="ins-lines">${buildingLines(def, lv).map((l) => `<div>${l}</div>`).join("")}</div>
      ${upg}
      <button id="insDemo" class="btn ins-demo">⛏️ Demolish</button>`;
    // position (clamped to viewport)
    const w = 232, h = el.offsetHeight || 260;
    el.style.left = Math.min(inspect.x + 14, window.innerWidth - w - 10) + "px";
    el.style.top = Math.min(inspect.y, window.innerHeight - h - 10) + "px";
    el.classList.add("show");
    $("insClose").onclick = closeInspect;
    $("insDemo").onclick = () => { bulldoze(inspect.cx, inspect.cy); closeInspect(); };
    if ($("insUpg")) $("insUpg").onclick = () => { upgrade(inspect.cx, inspect.cy); };
  }
  function closeInspect() { inspect = null; const el = $("inspect"); if (el) el.classList.remove("show"); }

  // ---- Top-bar stat info popups (click a stat to learn & get tips) --------
  const STAT_INFO = {
    "c-treasury": { icon: "💰", title: "Treasury",
      what: "Your nation's bank balance. It rises with tax revenue and trade, and falls from building upkeep, subsidies and pollution cleanup.",
      tips: ["Build commerce & industry (shops, factories) to grow GDP, which the Omands tax.",
             "Open a Seaport and export your surplus for cash.",
             "Don't overbuild — empty buildings still cost upkeep every month."] },
    "c-love": { icon: "💞", title: "Spreading Love Tokens",
      what: "The Omands' approval currency. Every building and upgrade needs 1 to be approved.",
      tips: ["Build Kindness Centers 💞 — they generate love over time.",
             "Say YES to events that help struggling neighbours.",
             "Run low? Do acts of kindness before building again."] },
    "c-pop": { icon: "🧑‍🤝‍🧑", title: "Population",
      what: "How many citizens live in Omandistan. More people means more workers and a bigger economy.",
      tips: ["Build Housing 🏠 — immigrants only arrive if there are empty homes.",
             "Keep happiness high (≥55) so people want to move in.",
             "Meet demand for food, water, power and healthcare as you grow."] },
    "c-happy": { icon: "😊", title: "Happiness (Utopia Meter)",
      what: "How content your citizens are (0–100). It drives immigration — happy countries grow, unhappy ones shrink.",
      tips: ["Watch the Demand bars — build what's short (food, housing, healthcare, water, power).",
             "Add Parks 🌳 and fun: Cinemas 🎬, Stadiums 🏟️, Theme Parks 🎢.",
             "Cut pollution and keep taxes reasonable."] },
    "c-gdp": { icon: "💵", title: "GDP (per month)",
      what: "Total output by the expenditure approach: GDP = C + I + G + Xn (Consumption + Investment + Government + Net Exports).",
      tips: ["Consumption (C): shops 🛒👕🍔. Investment (I): factories 🏭, tech 💻, banks 🏦.",
             "Government (G): schools, hospitals, parks. Net Exports (Xn): trade via ports/airports.",
             "Raise productivity with Schools 🏫 & Universities 🎓 to get more from the same buildings."] },
    "c-prod": { icon: "🎓", title: "PPC (Productivity)",
      what: "Your production multiplier from human capital. Higher = the same farms and factories produce MORE — an outward shift of your Production Possibilities Curve.",
      tips: ["Build Schools 🏫 and Universities 🎓 to raise human capital.",
             "Keep the power on — brownouts cut production.",
             "It scales with education per person, so grow schooling as population grows."] },
    "c-unemp": { icon: "💼", title: "Unemployment",
      what: "The share of the labor force (≈62% of people) without a job. High unemployment lowers happiness and stirs unrest.",
      tips: ["Build job-creating places: factories, shops, farms, offices.",
             "Balance jobs with population — too few jobs = unemployment, too few people = labor shortage.",
             "Industry and commerce create the most jobs."] },
    "c-date": { icon: "📅", title: "Date",
      what: "The in-game calendar (each tick is one month). Some things happen on a yearly cycle.",
      tips: ["The investor 🧐 Alan Tu inspects your country once a year.",
             "Use the speed buttons (top-right) or Space to pause/play time.",
             "Plan ahead — upkeep and trade happen every month."] },
    "r-wood": { icon: "🪵", title: "Wood",
      what: "A building resource, also consumed slowly by upkeep. You can't construct most things without it.",
      tips: ["Build Lumber Camps 🪓 to produce wood each month.",
             "Watch the Wood demand bar — red means you're using more than you make.",
             "Trade with Wardmania 🌲 (the wood specialists) for extra."] },
    "r-oil": { icon: "🛢️", title: "Oil",
      what: "Powers factories and is valuable in trade. Factories and airports burn it each month.",
      tips: ["Build Oil Derricks 🛢️ to pump oil.",
             "Trade with Elliott Emperace (the oil state) for a steady supply.",
             "Oil derricks pollute — offset with Parks 🌳."] },
    "r-gas": { icon: "🔥", title: "Gas",
      what: "Used by hospitals, restaurants, universities and gas power plants each month.",
      tips: ["Build Gas Mines ⛏️ to extract gas.",
             "Trade with CastanoControls 🔥 (the gas specialists).",
             "Keep an eye on the Gas demand bar so services don't run dry."] },
  };
  function openStatInfo(id, anchor) {
    const info = STAT_INFO[id]; if (!info) return;
    const el = $("statinfo");
    const val = $(id) ? $(id).textContent : "";
    el.innerHTML = `<div class="si-head"><span>${info.icon} ${info.title}</span><button id="siClose" class="ins-x">✕</button></div>
      <div class="si-now">Now: <b>${val}</b></div>
      <div class="si-what">${info.what}</div>
      <div class="si-tipt">How to improve it:</div>
      <ul class="si-tips">${info.tips.map((t) => `<li>${t}</li>`).join("")}</ul>`;
    el.classList.add("show");
    const r = anchor.getBoundingClientRect(), w = 260;
    el.style.left = clamp(r.left, 8, window.innerWidth - w - 8) + "px";
    el.style.top = (r.bottom + 6) + "px";
    $("siClose").onclick = closeStatInfo;
  }
  function closeStatInfo() { const el = $("statinfo"); if (el) el.classList.remove("show"); }

  // ---- Land buying --------------------------------------------------------
  function landCost() { return Math.round(250 * Object.keys(state.ownedDistricts).length * state.priceLevel); }
  function buyLand(cx, cy) {
    const d = C.MAP.districtOf(cx, cy);
    if (!d) { log("That's the sea — there's no land to buy there.", "warn"); return; }
    if (state.ownedDistricts[d.key]) { log("You already own this area.", "warn"); return; }
    const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => state.ownedDistricts[(d.gx + dx) + "," + (d.gy + dy)]);
    if (!adj) { log("You can only buy land next to land you already own.", "warn"); return; }
    const cost = landCost();
    if (state.treasury < cost) { log(`Buying this area costs ${money(cost)} — not enough in the treasury.`, "warn"); return; }
    if (state.loveTokens < 1) { log("The Omands require 1 💞 to approve a land purchase.", "warn"); return; }
    state.treasury -= cost; state.loveTokens -= 1; state.ownedDistricts[d.key] = true;
    flashOmand("New lands granted to Omandistan! 🏞️"); log(`Purchased a new district for ${money(cost)}. The island grows!`, "good");
    refreshStats();
  }

  // ---- Omand flash --------------------------------------------------------
  let omandTimer = null;
  function flashOmand(text) {
    const el = $("omandFlash"); el.querySelector(".omand-text").textContent = text;
    el.classList.add("show"); clearTimeout(omandTimer); omandTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  // ---- Simulation tick ----------------------------------------------------
  function doTick() {
    state.month += C.START.monthsPerTick;
    const s = E.tick(state); state.stats = s;
    state.treasury += s.treasury.net;
    state.population = Math.max(0, state.population + s.popChange);
    state.happiness = s.happiness;
    state.lastPriceIndex = s.priceIndex;
    // Inflation compounds into the price level: everything gets nominally
    // more expensive when inflation is positive (and cheaper in deflation).
    const infl = clamp(s.inflation, -0.04, 0.08);
    const oldPL = state.priceLevel;
    state.priceLevel = clamp(state.priceLevel * (1 + infl), 0.75, 3);
    if (oldPL < 1.5 && state.priceLevel >= 1.5) log("📈 Inflation has driven prices 50% above baseline — building & trade cost much more!", "warn");
    // resources: extraction − consumption + trade flows
    for (const r in state.resources) state.resources[r] = Math.max(0, state.resources[r] + (s.resources.net[r] || 0));
    // The Omands run countercyclical fiscal policy (the "Fed"): ease the tax
    // rate toward the target — raise it in a boom, cut it in a slump.
    if (state.policies.tax.auto) {
      state.policies.tax.rate += (s.tax.autoTarget - state.policies.tax.rate) * 0.3;
      state.policies.tax.mode = state.policies.tax.rate > 0.22 ? "progressive" : "flat";
      if (s.tax.stance !== lastStance && state.population >= 20) {
        if (s.tax.stance === "Contractionary") log("🏛️ Boom detected — the Omands RAISE taxes to cool the economy.", "info");
        else if (s.tax.stance === "Expansionary") log("🏛️ Slump detected — the Omands CUT taxes to spur spending.", "info");
        lastStance = s.tax.stance;
      }
    }
    // love tokens
    pendingLove += s.lovePerTick;
    if (pendingLove >= 1) { const w = Math.floor(pendingLove); state.loveTokens += w; pendingLove -= w; }
    // gains from trade nudge partner PPCs upward
    for (const deal of state.trade.deals) {
      const ev = W.evaluateDeal(deal.country, deal.give, deal.get, state.tariffs[deal.country]);
      if (ev.accept) state.countryPPC[deal.country] += W.tradeGrowth(ev.gainToThem);
    }
    if (s.resources.stalled.length) log("⚠️ A trade deal stalled — you ran out of a resource to send.", "warn");
    if (s.popChange > 0) log(`+${s.popChange} immigrants arrived (happiness ${Math.round(s.happiness)}). 🧳`, "good");
    else if (s.popChange < 0) log(`${s.popChange} citizens emigrated. 📉`, "warn");
    if (state.treasury < 0) log("⚠️ Treasury is in the red!", "warn");
    if (s.pollution.perCapita > 1.4 && Math.random() < 0.25) log("🏭 Smog hangs over the country — citizens are coughing. Build Parks 🌳!", "warn");
    maybeEvent();
    maybeProtest(s);
    maybeVIP(s);
    refreshStats();
  }

  // ---- The VIP investor: "The Guy Who Knows Things" (Alan Tu) -------------
  function vipScore(s) {
    const pop = state.population, happ = state.happiness;
    const popScore = clamp(pop / 200 * 100, 0, 100);
    const gdpScore = clamp((s.gdp / Math.max(1, pop)) / 40 * 100, 0, 100);
    const calm = 100 - s.unrest;
    const power = s.utilities.powerCoverage * 100, water = s.utilities.waterCoverage * 100;
    const clean = clamp(100 - s.pollution.penalty * 4, 0, 100);
    const services = clamp((s.health.access * 0.5 + s.hcUtil * 0.3 + Math.min(1, s.utility / Math.max(1, pop * 0.25)) * 0.2) * 100, 0, 100);
    const score = Math.round(happ * 0.26 + popScore * 0.12 + gdpScore * 0.16 + calm * 0.12 +
                             power * 0.08 + water * 0.08 + clean * 0.08 + services * 0.10);
    const line = (label, val) => { const ok = val >= 70; return `<div class="${ok ? "pos" : "neg"}">${ok ? "✓" : "✗"} ${label}: ${Math.round(val)}/100</div>`; };
    const lines = [line("Happiness", happ), line("Economy per person", gdpScore), line("Calm (low unrest)", calm),
      line("Water & power", (power + water) / 2), line("Clean air", clean), line("Public services", services), line("Population", popScore)];
    return { score, lines };
  }
  function maybeVIP(s) {
    if (eventOpen || state.month === 0 || state.month % 12 !== 0 || state.population < 20) return;
    eventOpen = true; setSpeed(0);
    const v = vipScore(s), V = C.VIP;
    let invest = 0, bonus = 0, love = 0, verdict, kind;
    if (v.score >= V.bigScore) { invest = Math.round(s.gdp * 5 + 3000); bonus = 4; love = 3;
      verdict = `"Omandistan is the real deal. I've seen a thousand cities — this one's special. I'm investing big."`; kind = "good"; }
    else if (v.score >= V.okScore) { invest = Math.round(s.gdp * 2 + 800);
      verdict = `"Promising work. Here's some seed money — keep it up and I'll be back."`; kind = "info"; }
    else { verdict = `"Not yet. I don't put my money into struggling towns. Fix the fundamentals and call me next year."`; kind = "warn"; }
    if (invest) state.treasury += invest;
    if (bonus) state.happiness = Math.min(100, state.happiness + bonus);
    if (love) state.loveTokens += love;
    const m = $("modal");
    m.innerHTML = `<div class="card vipcard">
      <div class="vip-portrait">${V.emoji}</div>
      <h2>${V.media}</h2>
      <div class="vip-real">a.k.a. <b>${V.name}</b> · Year ${Math.floor(state.month / 12)} inspection</div>
      <div class="vip-score">Inspection score: <b>${v.score}</b> / 100 <span class="hint">(needs ${V.bigScore}+ for a major investment)</span></div>
      <p class="vip-verdict ${kind}">${verdict}</p>
      <div class="vip-breakdown">${v.lines.join("")}</div>
      ${invest ? `<p class="vip-invest pos">💰 He invests <b>${money(invest)}</b>${love ? ` and gives <b>${love} 💞</b>` : ""}${bonus ? `, +${bonus} happiness` : ""}!</p>`
               : `<p class="vip-invest neg">💸 No investment this year.</p>`}
      <div class="row"><button id="vipOk" class="btn primary">Continue</button></div></div>`;
    m.classList.add("show");
    log(`${V.media} inspected Omandistan: ${v.score}/100 — ${invest ? money(invest) + " invested! 💰" : "no investment."}`, invest ? "good" : "warn");
    flashOmand(invest ? "A famous investor backs Omandistan! 💰" : "The investor left unimpressed…");
    $("vipOk").onclick = closeEvent;
  }

  // ---- Protests (citizens get angry at the government) --------------------
  function maybeProtest(s) {
    if (eventOpen || state.population < 12 || s.unrest < 60) return;
    if (Math.random() > 0.28) return;
    let cause = "the cost of living", fix = "fund relief";
    if (s.pollution.perCapita > 1.2) { cause = "the choking pollution"; fix = "fund a clean-up"; }
    else if (s.tax.rate > 0.24) { cause = "crushing taxes"; fix = "offer tax rebates"; }
    else if (s.labor.unemployment > 0.12) { cause = "the lack of jobs"; fix = "fund a jobs program"; }
    else if (s.food.access < 0.85) { cause = "food shortages"; fix = "import emergency food"; }
    eventOpen = true; setSpeed(0);
    const cost = Math.round(60 + state.population * 1.2);
    const m = $("modal");
    m.innerHTML = `<div class="card"><h2>😠 Citizens are protesting!</h2>
      <p>Crowds fill the streets, angry about <b>${cause}</b>. Unrest is at <b>${Math.round(s.unrest)}/100</b>.
      Mr. &amp; Mrs. Omand ask how you will respond.</p>
      <p class="cost">Address it: ${money(cost)} (calms the people, +5 happiness). Ignore it: lose 2 💞 and −6 happiness.</p>
      <div class="row"><button id="prFix" class="btn primary">${fix} (${money(cost)})</button>
      <button id="prIgnore" class="btn">Ignore them</button></div></div>`;
    m.classList.add("show");
    $("prFix").onclick = () => {
      if (state.treasury < cost) { log("Not enough money to address the protest!", "warn"); }
      else { state.treasury -= cost; state.happiness = Math.min(100, state.happiness + 5); log("You addressed the protest — tensions ease. 🕊️", "good"); flashOmand("Wise leadership calms the people. 🕊️"); }
      closeEvent();
    };
    $("prIgnore").onclick = () => {
      state.loveTokens = Math.max(0, state.loveTokens - 2); state.happiness = Math.max(0, state.happiness - 6);
      log("You ignored the protest — anger grows. 😠 (−2 💞, −6 happiness)", "warn"); flashOmand("The people feel unheard…");
      closeEvent();
    };
  }

  // ---- Events -------------------------------------------------------------
  let eventOpen = false;
  function acceptKindness(ev, auto) {
    if (state.treasury < ev.costMoney) {
      log(`${auto ? "🔁 Auto-accept skipped (" + ev.title + "): " : ""}not enough money to help right now.`, "warn");
      return;
    }
    state.treasury -= ev.costMoney; state.loveTokens += ev.reward;
    state.happiness = Math.min(100, state.happiness + ev.happiness);
    log(`${auto ? "🔁 Auto-accepted: " + ev.title + " —" : "Act of kindness!"} −${money(ev.costMoney)}, +${ev.reward} 💞, +${ev.happiness} happiness.`, "good");
    flashOmand("Such kindness! 💛");
  }
  function setAutoKindness(on) {
    state.autoKindness = on;
    const b = $("btnAutoLove");
    if (b) { b.textContent = on ? "💞 Kindness Aid: Auto-accept (ON)" : "💞 Kindness Aid: Ask me each time"; b.classList.toggle("on", on); }
    log(on ? "Kindness requests are now accepted automatically — same rate & effects, no more pausing. 🔁"
           : "Kindness requests will pause the game and ask you each time.", "info");
  }
  function maybeEvent() {
    if (eventOpen || state.population < 8) return;
    if (Math.random() < 0.16) {
      const ev = C.EVENTS[(Math.random() * C.EVENTS.length) | 0];
      // Auto mode fires at the exact same rate with the same effects,
      // it just resolves instantly instead of pausing the simulation.
      if (state.autoKindness) acceptKindness(ev, true);
      else openEvent(ev);
    }
  }
  function openEvent(ev) {
    eventOpen = true; setSpeed(0);
    const m = $("modal");
    m.innerHTML = `<div class="card"><h2>💞 ${ev.title}</h2><p>${ev.text}</p>
      <p class="cost">Cost: ${money(ev.costMoney)} · Reward: +${ev.reward} 💞 · +${ev.happiness} happiness</p>
      <div class="row"><button id="evYes" class="btn primary">${ev.yes}</button><button id="evNo" class="btn">${ev.no}</button></div>
      <button id="evAuto" class="tutskip">🔁 Always accept automatically (don't pause the game again)</button></div>`;
    m.classList.add("show");
    $("evYes").onclick = () => { acceptKindness(ev, false); closeEvent(); };
    $("evNo").onclick = () => { log("You declined to help.", ""); closeEvent(); };
    $("evAuto").onclick = () => { setAutoKindness(true); acceptKindness(ev, false); closeEvent(); refreshStats(); };
  }
  function closeEvent() { $("modal").classList.remove("show"); eventOpen = false; setSpeed(1); }

  // ---- HUD / stats --------------------------------------------------------
  function refreshStats() {
    if (!state.stats) state.stats = E.tick(state);
    const s = state.stats;
    setChip("c-treasury", money(state.treasury));
    setChip("c-love", Math.floor(state.loveTokens) + " 💞");
    setChip("c-pop", Math.round(state.population).toLocaleString());
    setChip("c-happy", Math.round(state.happiness) + " / 100");
    setChip("c-gdp", money(s.gdp));
    setChip("c-prod", "×" + s.productivity.toFixed(2));
    setChip("c-unemp", pct(s.labor.unemployment));
    setChip("c-date", `${MONTHS[state.month % 12]} Yr ${1 + Math.floor(state.month / 12)}`);
    setChip("r-wood", "🪵 " + Math.floor(state.resources.wood));
    setChip("r-oil", "🛢️ " + Math.floor(state.resources.oil));
    setChip("r-gas", "🔥 " + Math.floor(state.resources.gas));

    const reg = s.health.regulated, gp = s.gdpParts;
    $("detail").innerHTML = `
      <div class="dgroup"><h4>💵 GDP = C + I + G + Xn <span class="hint">· ${state.diff.emoji} ${state.diff.label}</span></h4>
        <div class="cigx">
          <span class="cig c">C ${money(gp.C)}</span><span class="cig i">I ${money(gp.I)}</span>
          <span class="cig g">G ${money(gp.G)}</span><span class="cig x">Xn ${money(gp.X)}</span>
        </div>
        <div>Total GDP: <b>${money(s.gdp)}</b>/mo</div>
      </div>
      <div class="dgroup"><h4>🌾 Food — Perfect Competition</h4>
        <div>Price <b>$${s.food.price.toFixed(2)}</b> · Access ${pct(s.food.access)} · Farm profit <b class="${s.food.farmProfit>=0?'pos':'neg'}">${money(s.food.farmProfit)}</b></div>
      </div>
      <div class="dgroup"><h4>🏥 Healthcare — ${reg ? "Public Option" : "Monopoly"}</h4>
        <div>Price <b>$${s.health.price.toFixed(2)}</b> · Access ${pct(s.health.access)} ${reg ? `· Subsidy ${money(s.health.subsidy)}/mo` : `· Priced out (DWL) <b class="neg">${Math.round(s.health.dwl)}</b>`}</div>
      </div>
      <div class="dgroup"><h4>🛒 Retail Goods — Elastic Luxury</h4>
        <div>Price <b>$${s.goods.price.toFixed(2)}</b> · Sold ${Math.round(s.goods.sold)}/${Math.round(s.goods.supply)}</div>
      </div>
      <div class="dgroup"><h4>🎓 Human Capital — PPC ×${s.productivity.toFixed(2)}</h4>
        <div>Education ${Math.round(s.humanCapital)} · coverage ${pct(s.hcUtil)} <span class="hint">(more schooling → outward PPC)</span></div>
      </div>
      <div class="dgroup"><h4>🌍 Trade ${s.trade.unlocked ? "" : '<span class="hint">(build a 🚢 Seaport)</span>'}</h4>
        ${s.trade.unlocked
          ? `<div>Exports ${money(s.trade.exportValue)} · Imports ${money(s.trade.importValue)} · <b class="${s.trade.Xn>=0?'pos':'neg'}">Xn ${money(s.trade.Xn)}</b></div>
             <div>Tariff rev ${money(s.trade.tariffRevenue)} · Tourism ${money(s.trade.tourismIncome)} · Net ${money(s.trade.net)}/mo</div>`
          : `<div class="hint">No global trade yet.</div>`}
      </div>
      <div class="dgroup"><h4>🏛️ The Omand Fed</h4>
        <div>Tax: <b>${pct(s.tax.rate)} ${s.tax.mode}</b> ${s.tax.auto ? '<span class="hint">(auto)</span>' : '<span class="hint">(manual)</span>'} → ${money(s.tax.revenue)}/mo</div>
        <div>Stance: <b class="${s.tax.stance==='Expansionary'?'pos':s.tax.stance==='Contractionary'?'neg':''}">${s.tax.stance}</b> · Inflation ${(s.inflation*100).toFixed(1)}%</div>
        <div>Price level (CPI): <b class="${state.priceLevel>1.25?'neg':state.priceLevel<0.95?'pos':''}">×${state.priceLevel.toFixed(2)}</b> <span class="hint">(scales building, trade & upkeep costs)</span></div>
      </div>
      <div class="dgroup"><h4>💧 Water & ⚡ Power</h4>
        <div>Water: <b class="${s.utilities.waterCoverage<0.95?'neg':'pos'}">${pct(s.utilities.waterCoverage)}</b> covered (${Math.round(s.utilities.waterSupply)}/${Math.round(s.utilities.waterDemand)})</div>
        <div>Power: <b class="${s.utilities.powerCoverage<0.95?'neg':'pos'}">${pct(s.utilities.powerCoverage)}</b> covered (${Math.round(s.utilities.powerSupply)}/${Math.round(s.utilities.powerDemand)}) ${s.utilities.powerCoverage<0.95?'⚡ brownouts cut output!':''}</div>
      </div>
      <div class="dgroup"><h4>🏭 Pollution & 😠 Unrest</h4>
        <div>Pollution: <b class="${s.pollution.penalty>6?'neg':s.pollution.level>0?'':'pos'}">${s.pollution.level.toFixed(1)}</b> <span class="hint">(−${s.pollution.penalty.toFixed(0)} happiness, cleanup ${money(s.pollution.cleanup)}/mo)</span></div>
        <div>Unrest: <b class="${s.unrest>60?'neg':s.unrest>35?'':'pos'}">${Math.round(s.unrest)}/100</b> ${s.unrest>60?'😠 protests likely!':s.unrest>35?'😐':'🙂'}</div>
      </div>`;

    const meter = $("happyfill");
    meter.style.width = Math.round(state.happiness) + "%";
    meter.style.background = state.happiness > 66 ? "#4e9d5b" : state.happiness > 40 ? "#d9a441" : "#cc5b5b";
    // toolbar prices track the current price level (inflation)
    document.querySelectorAll("[data-cost]").forEach((el) => {
      const def = C.BUILDINGS[el.dataset.cost]; if (!def) return;
      const resStr = def.res && Object.keys(def.res).length ? " " + Object.keys(def.res).map((r) => def.res[r] + C.RESOURCES[r].icon).join("") : "";
      el.textContent = `$${buildCost(def)}${def.love ? "·1💞" : ""}${resStr}`;
    });
    drawMinimap();
    renderDemand(s);
    if (inspect) renderInspect();   // keep the open inspector's numbers fresh
  }

  // ---- Demand bars (bottom-right) -----------------------------------------
  function renderDemand(s) {
    const el = $("demand"); if (!el) return;
    const word = { short: "Build more!", ok: "Balanced", surplus: "Surplus" };
    const rows = s.demand.map((d) => {
      const fill = Math.max(4, Math.min(100, (d.demand <= 0.01 ? (d.supply > 0 ? 100 : 8) : d.supply / d.demand * 100)));
      return `<div class="dmrow">
        <span class="dmico">${d.icon}</span>
        <div class="dmbarwrap"><div class="dmbar ${d.status}" style="width:${fill}%"></div></div>
        <span class="dmtag ${d.status}">${word[d.status]}</span></div>`;
    }).join("");
    el.innerHTML = `<div class="dmtitle">📊 Citizen Demand</div>${rows}
      <div class="dmhint">Build what's <b class="neg">short</b>; <b class="neg">surplus</b> sits idle.</div>`;
  }
  function setChip(id, val) { const el = $(id); if (el) el.textContent = val; }

  // ---- Toolbar ------------------------------------------------------------
  function buildToolbar() {
    const bar = $("toolbar");
    // Tools stay pinned at the top, always visible.
    const toolRow = document.createElement("div"); toolRow.className = "toolgrid";
    bar.appendChild(toolRow);
    addSpecialTool(toolRow, "__buyland", "🏞️", "Buy Land", "expand");
    addSpecialTool(toolRow, "__upgrade", "⬆️", "Upgrade", "level up");
    addSpecialTool(toolRow, "__bulldoze", "⛏️", "Bulldoze", "free");
    // Collapsible category groups (accordion — one open at a time).
    C.BUILD_GROUPS.forEach((group, gi) => {
      const head = document.createElement("button");
      head.className = "grouphead";
      head.innerHTML = `<span>${group.icon} ${group.name}</span><span class="gchev">▸</span>`;
      const body = document.createElement("div");
      body.className = "groupbody";
      for (const key of group.items) {
        const def = C.BUILDINGS[key];
        const btn = document.createElement("button"); btn.className = "tool";
        const resStr = def.res && Object.keys(def.res).length ? " " + Object.keys(def.res).map((r) => def.res[r] + C.RESOURCES[r].icon).join("") : "";
        btn.innerHTML = `<span class="ticon">${def.icon}</span><span class="tname">${def.name}</span><span class="tcost" data-cost="${key}">$${def.cost}${def.love ? "·1💞" : ""}${resStr}</span>`;
        btn.title = def.desc; btn.onclick = () => selectTool(key, btn); body.appendChild(btn);
      }
      head.onclick = () => {
        const wasOpen = body.classList.contains("open");
        document.querySelectorAll(".groupbody").forEach((g) => g.classList.remove("open"));
        document.querySelectorAll(".grouphead").forEach((h) => h.classList.remove("open"));
        if (!wasOpen) { body.classList.add("open"); head.classList.add("open"); }
      };
      if (gi === 0) { body.classList.add("open"); head.classList.add("open"); }  // start with Infrastructure open
      bar.appendChild(head); bar.appendChild(body);
    });
  }
  function addSpecialTool(bar, key, icon, name, cost) {
    const b = document.createElement("button"); b.className = "tool special";
    b.innerHTML = `<span class="ticon">${icon}</span><span class="tname">${name}</span><span class="tcost">${cost}</span>`;
    b.onclick = () => selectTool(key, b); bar.appendChild(b);
  }
  function selectTool(key, btn) {
    closeInspect();
    const wasActive = selectedType === key;
    document.querySelectorAll(".tool").forEach((b) => b.classList.remove("active"));
    if (wasActive) { selectedType = null; return; }
    selectedType = key; btn.classList.add("active");
    if (key === "__buyland") log(`Buy Land: click a sandy unowned area next to your land. Cost ${money(landCost())} + 1💞.`, "info");
    else if (key === "__upgrade") log("Upgrade: click a building to level it up — more output & jobs, and a bigger graphic. Markets & production benefit most.", "info");
    else if (key === "__bulldoze") log("Bulldoze: click a building to remove it.", "info");
    else if (C.BUILDINGS[key]) log(`${C.BUILDINGS[key].name}: ${C.BUILDINGS[key].desc}`, "info");
  }

  // ---- Decrees: healthcare + tax system -----------------------------------
  function togglePublicHealth() {
    state.policies.publicHealth = !state.policies.publicHealth;
    const on = state.policies.publicHealth;
    $("btnHealth").textContent = on ? "🏥 Healthcare: Public Option (ON)" : "🏥 Healthcare: Monopoly";
    $("btnHealth").classList.toggle("on", on);
    flashOmand(on ? "Affordable care for all! 🩺" : "The market sets the price.");
    refreshStats();
  }
  function openTax() {
    setSpeed(0);
    function render() {
      const cur = state.policies.tax, auto = !!cur.auto;
      const s = E.tick(state);
      const opts = C.TAX.presets.map((p) => `<button class="taxbtn ${(!auto && p.id === cur.id) ? "on" : ""}" ${auto ? "disabled" : ""} data-id="${p.id}">${p.label}<br><span class="sub">${p.mode}</span></button>`).join("");
      $("dialog").innerHTML = `<div class="card"><h2>🏛️ Fiscal Policy — The Omand Fed</h2>
        <p>Mr. &amp; Mrs. Omand run Omandistan's <b>fiscal &amp; monetary policy</b> from their money vault.
        On <b>Auto (Fed)</b> they act as <b>automatic stabilizers</b>: in a <b>boom</b> they <b>raise taxes</b> to cool things down,
        and in a <b>slump</b> they <b>cut taxes</b> so people spend more.</p>
        <button id="taxAuto" class="decree ${auto ? "on" : ""}">${auto ? "🏛️ Omand Auto-Fed: ON (countercyclical)" : "🏛️ Omand Auto-Fed: OFF (you set taxes)"}</button>
        <div class="taxstance">Current: <b>${pct(s.tax.rate)} ${s.tax.mode}</b> · Stance <b class="${s.tax.stance==='Expansionary'?'pos':s.tax.stance==='Contractionary'?'neg':''}">${s.tax.stance}</b> → ${money(s.tax.revenue)}/mo</div>
        ${auto ? '<p class="hint">Turn Auto off to set taxes manually.</p>' : `<div class="taxgrid">${opts}</div>`}
        <div class="row"><button id="taxClose" class="btn primary">Done</button></div></div>`;
      $("dialog").classList.add("show");
      $("taxAuto").onclick = () => {
        state.policies.tax.auto = !state.policies.tax.auto;
        if (!state.policies.tax.auto) state.policies.tax.id = "flat15";
        flashOmand(state.policies.tax.auto ? "The Omand Fed takes the wheel. 🏛️" : "You command the treasury now.");
        render(); refreshStats();
      };
      if (!auto) $("dialog").querySelectorAll(".taxbtn").forEach((b) => b.onclick = () => {
        const p = C.TAX.presets.find((x) => x.id === b.dataset.id);
        state.policies.tax = { rate: p.rate, mode: p.mode, id: p.id, auto: false };
        flashOmand("Tax decree updated. 🏛️"); render(); refreshStats();
      });
      $("taxClose").onclick = () => { $("dialog").classList.remove("show"); setSpeed(1); };
    }
    render();
  }

  // ---- World map + fast travel --------------------------------------------
  function openWorld() {
    setSpeed(0);
    const unlocked = E.tick(state).trade.unlocked;
    let islands = `<div class="omand-island" style="left:50%;top:50%"><div class="isle">🏝️</div><b>Omandistan</b><span>You</span></div>`;
    for (const k in C.COUNTRIES) {
      const co = C.COUNTRIES[k];
      islands += `<button class="world-island" data-c="${k}" style="left:${co.island.x*100}%;top:${co.island.y*100}%">
        <div class="isle" style="background:${co.color}">${co.flag}</div><b>${co.name}</b>
        <span>${C.RESOURCES[co.specialty] ? C.RESOURCES[co.specialty].name : co.specialty} · PPC ${Math.round(state.countryPPC[k])}</span></button>`;
    }
    $("world").innerHTML = `<div class="world-inner">
      <div class="world-head"><h2>🌍 World Map</h2><button id="worldClose" class="btn">✕ Close</button></div>
      ${unlocked ? '<p class="world-tip">Click a country to fast-travel and propose a trade. Deals are only accepted if they expand the partner\'s PPC.</p>'
                 : '<p class="world-tip warn">🚢 Build a Seaport to unlock global trade. You can browse the world now, but trading is locked.</p>'}
      <div class="world-map">${islands}<div class="sea-lines"></div></div></div>`;
    $("world").classList.add("show");
    $("worldClose").onclick = () => { $("world").classList.remove("show"); setSpeed(1); };
    // Clicking a country closes the world map and jumps straight to its trade menu.
    $("world").querySelectorAll(".world-island").forEach((b) => b.onclick = () => {
      $("world").classList.remove("show");
      openTrade(b.dataset.c);
    });
  }

  // ---- Trade with a country -----------------------------------------------
  function ico(it) { return it === "money" ? "💵" : C.RESOURCES[it].icon; }
  function openTrade(key) {
    const co = C.COUNTRIES[key];
    const unlocked = E.tick(state).trade.unlocked;
    const give = { item: "money", amount: 100 };
    const get = { item: state.resources[co.specialty] != null ? co.specialty : "oil", amount: 20 };
    let evaluate = function () {};   // assigned below if trade is unlocked
    function itemOpts(sel) { return TRADE_ITEMS.map((it) => `<option value="${it}" ${it===sel?"selected":""}>${it==="money"?"💵 Money":C.RESOURCES[it].icon+" "+C.RESOURCES[it].name}</option>`).join(""); }
    function dealRows() {
      const mine = state.trade.deals.filter((d) => d.country === key);
      if (!mine.length) return '<div class="hint">No active deals with this country.</div>';
      return mine.map((d, i) => `<div class="dealrow"><span>Give ${d.give.amount} ${ico(d.give.item)} → Get ${d.get.amount} ${ico(d.get.item)}/mo</span><button class="btn mini" data-del="${i}">Cancel</button></div>`).join("");
    }

    $("dialog").innerHTML = `<div class="card tradecard"><h2>${co.flag} ${co.name}</h2>
      <p class="blurb">${co.blurb}</p>
      <div class="cfacts">Specialty: <b>${co.specialty}</b> · PPC <b>${Math.round(state.countryPPC[key])}</b> · They want: <b>${co.wants.join(", ")}</b></div>
      <div class="tariffbox">Your tariff on imports from ${co.name}: <b id="tarval">${Math.round(state.tariffs[key]*100)}%</b>
        <input id="tarslider" type="range" min="0" max="50" value="${Math.round(state.tariffs[key]*100)}">
        <div class="hint">Tariffs earn you revenue on imports but sour relations (they may refuse deals).</div></div>
      ${unlocked ? `
      <h4>Propose a recurring monthly trade</h4>
      <div class="tradeform">
        <div>You give <select id="giveItem">${itemOpts(give.item)}</select> <input id="giveAmt" type="number" min="1" value="${give.amount}"></div>
        <div>You get <select id="getItem">${itemOpts(get.item)}</select> <input id="getAmt" type="number" min="1" value="${get.amount}"></div>
      </div>
      <p id="evalmsg" class="evalmsg"></p>
      <div class="row"><button id="proposeBtn" class="btn primary">Propose deal 🤝</button></div>
      <h4>Active deals</h4><div id="deals">${dealRows()}</div>
      ` : `<p class="warn">🚢 Build a Seaport in Omandistan to open trade with ${co.name}.</p>`}
      <div class="row"><button id="tradeBack" class="btn">◀ World Map</button></div></div>`;
    $("dialog").classList.add("show");

    $("tarslider").oninput = (e) => { state.tariffs[key] = e.target.value / 100; $("tarval").textContent = e.target.value + "%"; evaluate(); };
    $("tradeBack").onclick = () => { $("dialog").classList.remove("show"); openWorld(); };

    if (unlocked) {
      evaluate = function () {
        give.item = $("giveItem").value; give.amount = Math.max(1, +$("giveAmt").value || 1);
        get.item = $("getItem").value; get.amount = Math.max(1, +$("getAmt").value || 1);
        const ev = W.evaluateDeal(key, give, get, state.tariffs[key]);
        const mineVal = W.valueToPlayer(state, get.item) * get.amount - W.valueToPlayer(state, give.item) * give.amount;
        $("evalmsg").innerHTML = `<span class="${ev.accept?'pos':'neg'}">${ev.reason}</span><br>
          <span class="hint">For you: ${mineVal>=0?'<b class="pos">good</b>':'<b class="neg">poor</b>'} value (${money(mineVal)}). Fair ask ≈ ${Math.round(ev.fairGet)} ${ico(get.item)}.</span>`;
        $("proposeBtn").disabled = !ev.accept;
        $("proposeBtn").classList.toggle("disabled", !ev.accept);
      };
      ["giveItem", "giveAmt", "getItem", "getAmt"].forEach((id) => { $(id).oninput = evaluate; $(id).onchange = evaluate; });
      $("proposeBtn").onclick = () => {
        const ev = W.evaluateDeal(key, give, get, state.tariffs[key]);
        if (!ev.accept) return;
        state.trade.deals.push({ country: key, give: { item: give.item, amount: give.amount }, get: { item: get.item, amount: get.amount } });
        log(`Trade agreed with ${co.name}: give ${give.amount} ${ico(give.item)} → get ${get.amount} ${ico(get.item)}/mo. 🤝`, "good");
        flashOmand("A new trade partnership! 🌍"); openTrade(key); refreshStats();
      };
      $("dialog").querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
        const mine = state.trade.deals.filter((d) => d.country === key);
        const d = mine[+b.dataset.del]; state.trade.deals = state.trade.deals.filter((x) => x !== d);
        log("Trade deal cancelled.", ""); openTrade(key); refreshStats();
      });
      evaluate();
    }
  }

  // ---- Minimap (home island, click to fast-travel the camera) -------------
  function drawMinimap() {
    if (!mmCtx) return;
    const cols = C.MAP.cols, rows = C.MAP.rows, W2 = minimap.width, H2 = minimap.height;
    const s = Math.min(W2 / cols, H2 / rows);
    mmCtx.clearRect(0, 0, W2, H2); mmCtx.fillStyle = "#bfe3f2"; mmCtx.fillRect(0, 0, W2, H2);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      let col;
      if (C.MAP.isWater(x, y)) col = "#5f9fc8";
      else if (!ownedAt(x, y)) col = "#b3ac8e";
      else col = "#86bd63";
      const b = state.grid[y][x];
      if (b) col = b.type === "road" ? "#5b6472" : (C.BUILDINGS[b.type].color || "#fff");
      if (x === C.CASTLE.cx && y === C.CASTLE.cy) col = "#d8b24a";
      mmCtx.fillStyle = col; mmCtx.fillRect(x * s, y * s, Math.ceil(s), Math.ceil(s));
    }
  }
  function minimapClick(e) {
    const rect = minimap.getBoundingClientRect();
    const s = Math.min(minimap.width / C.MAP.cols, minimap.height / C.MAP.rows);
    const cx = Math.floor((e.clientX - rect.left) * (minimap.width / rect.width) / s);
    const cy = Math.floor((e.clientY - rect.top) * (minimap.height / rect.height) / s);
    R.centerOn(cx, cy);
  }

  // ---- Difficulty selection (shown first) ---------------------------------
  function openDifficulty() {
    setSpeed(0);
    const cards = C.DIFF_ORDER.map((k) => {
      const d = C.DIFFICULTY[k];
      return `<button class="diffbtn" data-k="${k}"><div class="diffemoji">${d.emoji}</div>
        <b>${d.label}</b><span>${d.blurb}</span></button>`;
    }).join("");
    $("welcome").innerHTML = `<div class="card diffcard">
      <div class="omand-faces" style="font-size:34px;text-align:center">👑👸</div>
      <h2>Choose your challenge</h2>
      <p>How tough should Omandistan's economy be? Difficulty sets your <b>starting money &amp; resources</b>,
      <b>upkeep costs</b>, <b>income</b>, <b>pollution</b> severity and how fast <b>immigrants</b> arrive.</p>
      <div class="diffgrid">${cards}</div></div>`;
    $("welcome").classList.add("show");
    $("welcome").querySelectorAll(".diffbtn").forEach((b) => b.onclick = () => { applyDifficulty(b.dataset.k); openTutorial(0); });
  }
  function applyDifficulty(k) {
    const d = C.DIFFICULTY[k];
    state.diff = d;
    state.treasury = d.treasury;
    state.loveTokens = d.love;
    state.resources = { wood: d.resources.wood, oil: d.resources.oil, gas: d.resources.gas };
    state.stats = null;
    log(`Difficulty set: ${d.emoji} ${d.label}.`, "info");
    refreshStats();
  }

  // ---- Tutorial -----------------------------------------------------------
  let tutStep = 0;
  function openTutorial(step) { tutStep = step || 0; setSpeed(0); renderTutorial(); $("welcome").classList.add("show"); }
  function renderTutorial() {
    const steps = C.TUTORIAL, s = steps[tutStep], last = tutStep === steps.length - 1;
    const dots = steps.map((_, i) => `<span class="dot ${i === tutStep ? "on" : ""}"></span>`).join("");
    $("welcome").innerHTML = `<div class="card tutcard"><div class="omand-faces" style="font-size:34px;text-align:center">👑👸</div>
      <h2>${s.title}</h2><p>${s.body}</p><div class="tutdots">${dots}</div>
      <div class="row">${tutStep > 0 ? '<button id="tutBack" class="btn">◀ Back</button>' : '<span></span>'}
      <button id="tutNext" class="btn primary">${last ? "Start building 🚜" : "Next ▶"}</button></div>
      ${!last ? '<button id="tutSkip" class="tutskip">Skip tutorial</button>' : ''}</div>`;
    if ($("tutBack")) $("tutBack").onclick = () => { tutStep--; renderTutorial(); };
    $("tutNext").onclick = () => { if (last) closeTutorial(); else { tutStep++; renderTutorial(); } };
    if ($("tutSkip")) $("tutSkip").onclick = closeTutorial;
  }
  function closeTutorial() { $("welcome").classList.remove("show"); setSpeed(1); log("Lay 🛣️ Roads, then build next to them. Buy Land 🏞️ to expand. 👑", "info"); }

  // ---- Speed --------------------------------------------------------------
  function setSpeed(i) {
    speedIndex = i;
    document.querySelectorAll(".speedbtn").forEach((b, idx) => b.classList.toggle("active", idx === i));
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    if (C.SPEEDS[i].ms > 0) tickTimer = setInterval(doTick, C.SPEEDS[i].ms);
  }

  // ---- Input --------------------------------------------------------------
  function setupInput() {
    let dragging = false, moved = false, lx = 0, ly = 0;
    canvas.addEventListener("mousedown", (e) => { dragging = true; moved = false; lx = e.clientX; ly = e.clientY; closeStatInfo(); });
    window.addEventListener("mouseup", (e) => {
      if (dragging && !moved) {
        const rect = canvas.getBoundingClientRect();
        const t = R.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
        if (selectedType === "__bulldoze") bulldoze(t.cx, t.cy);
        else if (selectedType === "__buyland") buyLand(t.cx, t.cy);
        else if (selectedType === "__upgrade") upgrade(t.cx, t.cy);
        else if (selectedType) tryPlace(t.cx, t.cy);
        else openInspect(t.cx, t.cy, e.clientX, e.clientY);   // no tool → inspect
      }
      dragging = false;
    });
    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      hover = R.screenToTile(e.clientX - rect.left, e.clientY - rect.top);
      if (dragging) { const dx = e.clientX - lx, dy = e.clientY - ly; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; R.pan(dx, dy); lx = e.clientX; ly = e.clientY; }
    });
    canvas.addEventListener("mouseleave", () => { hover = null; });
    window.addEventListener("keydown", (e) => {
      const st = 40;
      if (e.key === "ArrowLeft") R.pan(st, 0); else if (e.key === "ArrowRight") R.pan(-st, 0);
      else if (e.key === "ArrowUp") R.pan(0, st); else if (e.key === "ArrowDown") R.pan(0, -st);
      else if (e.key === " ") { e.preventDefault(); setSpeed(speedIndex === 0 ? 1 : 0); }
      else if (e.key === "Escape") { selectedType = null; closeInspect(); closeStatInfo(); document.querySelectorAll(".tool").forEach((b) => b.classList.remove("active")); }
    });
  }

  // ---- Render loop --------------------------------------------------------
  function renderLoop(ts) { R.frame(state, hover, selectedType, ts); requestAnimationFrame(renderLoop); }

  // ---- Boot ---------------------------------------------------------------
  function boot() {
    canvas = $("game"); R.init(canvas);
    minimap = $("minimap"); if (minimap) { mmCtx = minimap.getContext("2d"); minimap.addEventListener("click", minimapClick); }
    buildToolbar(); setupInput();
    const sc = $("speed");
    C.SPEEDS.forEach((sp, i) => { const b = document.createElement("button"); b.className = "speedbtn"; b.textContent = sp.label; b.onclick = () => setSpeed(i); sc.appendChild(b); });
    // make each top-bar stat clickable to explain it + give tips
    document.querySelectorAll("#hud .chip").forEach((chip) => {
      const valSpan = chip.querySelector("span:last-child");
      if (valSpan && STAT_INFO[valSpan.id]) { chip.classList.add("clickable"); chip.onclick = () => openStatInfo(valSpan.id, chip); }
    });

    $("btnHealth").onclick = togglePublicHealth;
    $("btnAutoLove").onclick = () => setAutoKindness(!state.autoKindness);
    $("btnTax").onclick = openTax;
    $("btnWorld").onclick = openWorld;
    $("btnHelp").onclick = () => openTutorial(0);
    // center camera on the starting district
    const mid = C.MAP.landLo + Math.floor(C.MAP.distSize * 1.5);
    R.centerOn(mid, mid);
    refreshStats(); requestAnimationFrame(renderLoop); openDifficulty();
  }
  window.addEventListener("DOMContentLoaded", boot);
})();
