/* ============================================================================
 * OMANDISTAN — config.js
 * All tunable game + economics parameters live here so they are easy to adjust
 * for AP Econ lessons. Loaded first; exposes a global `CONFIG` object.
 * ==========================================================================*/
window.CONFIG = (function () {
  "use strict";

  // ---- Map ----------------------------------------------------------------
  const MAP = {
    cols: 30,
    rows: 30,
    tileW: 64,
    tileH: 32,
    water: 4,        // thickness of the surrounding sea (bigger water!)
    districts: 3,    // land is divided into districts x districts buyable areas
  };
  // Land region (inclusive) inside the sea border.
  MAP.landLo = MAP.water;
  MAP.landHi = MAP.cols - 1 - MAP.water;        // assumes square map
  MAP.landSize = MAP.landHi - MAP.landLo + 1;
  MAP.distSize = Math.ceil(MAP.landSize / MAP.districts);

  MAP.isWater = function (cx, cy) {
    return cx < MAP.landLo || cy < MAP.landLo || cx > MAP.landHi || cy > MAP.landHi;
  };
  // Which district a land tile belongs to, or null if it is sea.
  MAP.districtOf = function (cx, cy) {
    if (MAP.isWater(cx, cy)) return null;
    const gx = Math.min(MAP.districts - 1, Math.floor((cx - MAP.landLo) / MAP.distSize));
    const gy = Math.min(MAP.districts - 1, Math.floor((cy - MAP.landLo) / MAP.distSize));
    return { gx, gy, key: gx + "," + gy };
  };

  // The Omand royal castle sits offshore on a sea tile (not player-built).
  const CASTLE = { cx: Math.floor(MAP.cols / 2), cy: 1 };

  // ---- Starting conditions ------------------------------------------------
  const START = {
    treasury: 4000,
    loveTokens: 16,
    population: 0,
    happiness: 74,
    monthsPerTick: 1,
    resources: { wood: 90, oil: 45, gas: 45 },   // you need more than money!
    ownedDistrict: "1,1",                          // start owning the centre area
  };

  const RESOURCES = {
    wood: { name: "Wood", icon: "🪵", price: 7 },
    oil:  { name: "Oil",  icon: "🛢️", price: 14 },
    gas:  { name: "Gas",  icon: "🔥", price: 12 },
  };

  // ---- Economic reference values -----------------------------------------
  const ECON = {
    food:   { refPrice: 10, perCapita: 1.0,  elasticity: -0.30, farmWage: 5 },
    health: { refPrice: 20, perCapita: 0.5,  elasticity: -0.25, marginalCost: 12,
              monopolyMarkup: 3.0, publicOptionPrice: 9 },
    goods:  { refPrice: 15, perCapita: 0.55, elasticity: -1.40 },  // retail luxury
    laborForceShare: 0.62,
    humanCapital: { perCapitaForFullBonus: 0.6, maxOutputBonus: 0.75, happinessBonus: 0.10 },
    trade: { exportMargin: 6, importPrice: 9, airTourism: 0.8 },
  };

  // ---- Tax system (player-adjustable) -------------------------------------
  // Progressive sharing reduces the happiness cost of a given average rate.
  const TAX = {
    presets: [
      { id: "low",    label: "Low (8%)",         rate: 0.08, mode: "flat" },
      { id: "flat15", label: "Flat (15%)",        rate: 0.15, mode: "flat" },
      { id: "prog20", label: "Progressive (20%)", rate: 0.20, mode: "progressive" },
      { id: "prog30", label: "Progressive (30%)", rate: 0.30, mode: "progressive" },
      { id: "high",   label: "High (38%)",        rate: 0.38, mode: "flat" },
    ],
    start: "flat15",
  };

  // ---- Building catalogue -------------------------------------------------
  // gdpc = which GDP component (C/I/G/X) the building feeds.
  // res  = resources consumed to construct it (besides money + 1 love token).
  const BUILDINGS = {
    road: { name: "Road", icon: "🛣️", cost: 5, love: 0, upkeep: 0.1, height: 0.08,
      color: "#6b7280", category: "Infrastructure", noRoadNeeded: true,
      desc: "Roads carry traffic and EVERY building must touch one. Pre-approved (no love token)." },

    house: { name: "Housing", icon: "🏠", cost: 55, love: 1, upkeep: 0.6, height: 0.7,
      color: "#e8b04b", category: "Residential", housing: 8, res: { wood: 4 },
      desc: "Homes for citizens (needs wood). Immigrants only arrive if there is housing." },

    farm: { name: "Farm", icon: "🌾", cost: 65, love: 1, upkeep: 0.8, height: 0.35,
      color: "#86b04a", category: "Perfect Competition", jobs: 4, foodOutput: 22,
      gdpc: "C", res: { wood: 3 },
      desc: "PERFECT COMPETITION: identical price-taking farms. Food → Consumption (C). Profit → 0 in the long run." },

    grocery: { name: "Grocery", icon: "🛒", cost: 120, love: 1, upkeep: 1.2, height: 0.55,
      color: "#5aa0d8", category: "Consumption (C)", jobs: 7, goodsOutput: 12, gdpc: "C", res: { wood: 5 },
      desc: "Everyday retail. Adds to CONSUMPTION (C). Goods demand is ELASTIC (a luxury)." },
    clothing: { name: "Clothing Shop", icon: "👕", cost: 140, love: 1, upkeep: 1.3, height: 0.6,
      color: "#c878b0", category: "Consumption (C)", jobs: 7, goodsOutput: 13, gdpc: "C", res: { wood: 5 },
      desc: "Apparel retail. Adds to CONSUMPTION (C). Elastic luxury demand." },
    restaurant: { name: "Restaurant", icon: "🍔", cost: 150, love: 1, upkeep: 1.4, height: 0.55,
      color: "#e0894a", category: "Consumption (C)", jobs: 9, goodsOutput: 14, gdpc: "C", res: { wood: 6, gas: 2 },
      desc: "Food service. Adds to CONSUMPTION (C). Needs a little gas to cook." },

    tech: { name: "Tech Park", icon: "💻", cost: 300, love: 1, upkeep: 2.6, height: 0.8,
      color: "#5566cc", category: "Investment (I)", jobs: 16, industrialOutput: 26, gdpc: "I",
      gdpVal: 60, res: { wood: 8, gas: 4 },
      desc: "Innovation & capital goods. Adds to INVESTMENT (I) and is highly exportable." },
    factory: { name: "Factory", icon: "🏭", cost: 240, love: 1, upkeep: 2.4, height: 0.9,
      color: "#b08d57", category: "Investment (I)", jobs: 16, industrialOutput: 32, gdpc: "I",
      gdpVal: 55, res: { wood: 6, oil: 6 },
      desc: "Heavy industry. Adds to INVESTMENT (I); great for exports. Needs oil." },
    bank: { name: "Bank", icon: "🏦", cost: 280, love: 1, upkeep: 2, height: 0.85,
      color: "#4a8c6a", category: "Investment (I)", jobs: 10, gdpc: "I", gdpVal: 70, res: { wood: 6 },
      desc: "Finance & capital. Boosts INVESTMENT (I) and the wider economy." },

    hospital: { name: "Hospital", icon: "🏥", cost: 340, love: 1, upkeep: 3.5, height: 1.0,
      color: "#d96a6a", category: "Monopoly", jobs: 12, healthCapacity: 60, gdpc: "G",
      gdpVal: 50, res: { wood: 10, gas: 4 },
      desc: "Healthcare is a MONOPOLY (high price, fewer served) unless the Omands decree a Public Option (→ Government, G)." },
    school: { name: "School", icon: "🏫", cost: 150, love: 1, upkeep: 1.4, height: 0.6,
      color: "#d98a4a", category: "Human Capital", jobs: 6, humanCapital: 8, amenity: 2, gdpc: "G",
      gdpVal: 30, res: { wood: 8 },
      desc: "Builds HUMAN CAPITAL → productivity → outward PPC. Public spending (G)." },
    university: { name: "University", icon: "🎓", cost: 420, love: 1, upkeep: 3, height: 0.95,
      color: "#9a6cb0", category: "Human Capital", jobs: 14, humanCapital: 22, amenity: 3, gdpc: "G",
      gdpVal: 55, res: { wood: 14, gas: 4 },
      desc: "Advanced human capital — the engine of long-run growth. Public spending (G)." },

    lumber: { name: "Lumber Camp", icon: "🪓", cost: 90, love: 1, upkeep: 1, height: 0.4,
      color: "#7a9a4e", category: "Resources", jobs: 6, produces: { wood: 3 }, gdpc: "I", gdpVal: 25, res: {},
      desc: "Forestry operation. Produces 🪵 WOOD each month — you need wood to build." },
    oilrig: { name: "Oil Derrick", icon: "🛢️", cost: 160, love: 1, upkeep: 1.6, height: 0.7,
      color: "#3a3a44", category: "Resources", jobs: 8, produces: { oil: 2.6 }, gdpc: "I", gdpVal: 35, res: { wood: 4 },
      desc: "Pumps 🛢️ OIL each month. Oil powers factories and is valuable in trade." },
    gasmine: { name: "Gas Mine", icon: "⛏️", cost: 150, love: 1, upkeep: 1.5, height: 0.5,
      color: "#6a6f78", category: "Resources", jobs: 8, produces: { gas: 2.6 }, gdpc: "I", gdpVal: 32, res: { wood: 4 },
      desc: "Extracts 🔥 GAS each month. Used by hospitals, restaurants and universities." },

    port: { name: "Seaport", icon: "🚢", cost: 300, love: 1, upkeep: 2.2, height: 0.5,
      color: "#4a7fa5", category: "Global Trade (X)", jobs: 12, tradeCapacity: 45, gdpc: "X",
      requiresWater: true, unlocksTrade: true, res: { wood: 12 },
      desc: "UNLOCKS global trade by sea and powers NET EXPORTS (Xn). Must be built on the coast." },
    airport: { name: "Airport", icon: "✈️", cost: 560, love: 1, upkeep: 4.5, height: 0.65,
      color: "#8a98a6", category: "Global Trade (X)", jobs: 20, tradeCapacity: 75, gdpc: "X",
      tourism: true, unlocksTrade: true, res: { wood: 16, oil: 10, gas: 6 },
      desc: "High-capacity trade + TOURISM income. Also unlocks global trade and boosts Net Exports (Xn)." },

    kindness: { name: "Kindness Center", icon: "💞", cost: 85, love: 0, upkeep: 0.6, height: 0.55,
      color: "#d87fb8", category: "Civic", jobs: 3, lovePerTick: 0.8, gdpc: "G", gdpVal: 12, res: { wood: 4 },
      desc: "Acts of kindness generate Spreading Love tokens over time (no token to build)." },
    park: { name: "Park", icon: "🌳", cost: 30, love: 1, upkeep: 0.3, height: 0.25,
      color: "#4e9d5b", category: "Amenity", amenity: 6, gdpc: "G", gdpVal: 6, res: { wood: 2 },
      desc: "Green space. Raises happiness. Public spending (G)." },
  };

  const BUILD_ORDER = [
    "road", "house", "farm",
    "grocery", "clothing", "restaurant",
    "tech", "factory", "bank",
    "lumber", "oilrig", "gasmine",
    "hospital", "school", "university",
    "port", "airport", "kindness", "park",
  ];

  // ---- Building upgrades --------------------------------------------------
  // Every building can be upgraded. Each level multiplies its output/capacity
  // and jobs, costs money + resources + 1 love token, and changes its graphic.
  const UPGRADE = {
    maxLevel: 3,
    outMult: [1, 1.6, 2.3],     // output / capacity multiplier by level (1-indexed)
    jobMult: [1, 1.5, 2.0],     // jobs multiplier by level
    names: ["", " II", " III"], // suffix shown for the level
    costMoney: [0, 1.4, 2.2],   // upgrade cost = base.cost * this (to reach that level)
    costRes: [0, 0.9, 1.6],     // resource cost = base.res * this
    love: 1,                     // love tokens the Omands require to approve an upgrade
  };

  // ---- Other countries (already-built island economies) --------------------
  // endow = resource abundance (also their export specialty if high).
  // wants = resources they are short of (high value to them in trade).
  // ppc   = their current production-possibilities level (grows if a deal helps).
  const COUNTRIES = {
    elliott: { name: "Elliott Emperace", flag: "🛢️", color: "#3a3a44",
      blurb: "A petro-state of endless derricks. Oil is their lifeblood and their fortune.",
      specialty: "oil", endow: { wood: 1, oil: 9, gas: 4 }, wants: ["wood", "food"],
      ppc: 78, island: { x: 0.16, y: 0.30 } },
    wardmania: { name: "Wardmania", flag: "🌲", color: "#3f7a45",
      blurb: "Rolling evergreen forests as far as the eye can see. The realm of timber.",
      specialty: "wood", endow: { wood: 9, oil: 1, gas: 2 }, wants: ["oil", "gas", "tech"],
      ppc: 64, island: { x: 0.82, y: 0.24 } },
    cindara: { name: "Cindara", flag: "🔥", color: "#9a5a2a",
      blurb: "Geysers and gas fields light the night. Energy-rich but hungry for goods.",
      specialty: "gas", endow: { wood: 2, oil: 3, gas: 9 }, wants: ["wood", "food", "tech"],
      ppc: 70, island: { x: 0.20, y: 0.78 } },
    technova: { name: "Technova", flag: "💡", color: "#4658b0",
      blurb: "A glittering tech metropolis. Brilliant engineers, but few raw resources.",
      specialty: "tech", endow: { wood: 2, oil: 2, gas: 2 }, wants: ["wood", "oil", "gas"],
      ppc: 88, island: { x: 0.80, y: 0.74 } },
  };

  const EVENTS = [
    { title: "Famine in the Vale of Tariq",
      text: "A neighbouring village faces famine. Mr. & Mrs. Omand ask if Omandistan will send food aid.",
      costMoney: 120, reward: 4, happiness: 4, yes: "Send aid 🌾", no: "We cannot spare it" },
    { title: "The Wandering Healers",
      text: "Traveling healers seek funds to treat a sick caravan passing through your land.",
      costMoney: 90, reward: 3, happiness: 3, yes: "Fund the healers 🩺", no: "Turn them away" },
    { title: "Festival of Shared Bread",
      text: "Citizens want to host a festival welcoming refugees from a struggling nation.",
      costMoney: 70, reward: 3, happiness: 5, yes: "Host the festival 🎉", no: "Maybe next year" },
    { title: "Scholarships for Refugees",
      text: "A struggling nation asks Omandistan to school their brightest young students.",
      costMoney: 100, reward: 4, happiness: 4, yes: "Offer scholarships 🎓", no: "Not this year" },
  ];

  const SPEEDS = [
    { label: "⏸", ms: 0 }, { label: "▶", ms: 1600 }, { label: "▶▶", ms: 800 }, { label: "▶▶▶", ms: 300 },
  ];

  const TUTORIAL = [
    { title: "👑 Welcome to Omandistan 👸",
      body: "You serve <b>Mr. &amp; Mrs. Omand</b>, the king and queen who live in the castle off your shore. "
          + "Build a thriving <b>utopia</b>. The happier your country, the more people move in." },
    { title: "💞 The Omands approve everything",
      body: "Every building (except roads) needs <b>1 Spreading Love token</b>. Earn tokens with "
          + "<b>Kindness Centers 💞</b> and by helping struggling neighbours in events." },
    { title: "🛣️ Roads, land & resources",
      body: "<b>Every building must touch a road</b>, so lay roads first. You start owning one <b>district</b> — "
          + "<b>buy more land</b> to expand. Building also costs <b>resources</b>: 🪵 wood, 🛢️ oil, 🔥 gas. "
          + "Get them from <b>Lumber Camps, Oil Derricks &amp; Gas Mines</b>." },
    { title: "🏠 Step 1 — Houses bring people",
      body: "Place <b>Housing 🏠</b> next to a road. Your first home invites founding settlers, and more arrive "
          + "while there are empty homes and your happiness is high." },
    { title: "💰 Step 2 — GDP = C + I + G + Xn",
      body: "Different buildings power different parts of GDP: shops 🛒👕🍔 → <b>Consumption (C)</b>; "
          + "factories/tech/banks 🏭💻🏦 → <b>Investment (I)</b>; schools/hospitals/parks → <b>Government (G)</b>; "
          + "ports/airports 🚢✈️ → <b>Net Exports (Xn)</b>. The Omands tax GDP into your treasury — "
          + "you can change the <b>tax system</b> any time." },
    { title: "🌍 Step 3 — The world & trade",
      body: "Build a <b>Seaport 🚢</b> to unlock <b>global trade</b>. Open the <b>World Map 🌍</b> to visit "
          + "<b>Elliott Emperace</b> (oil), <b>Wardmania</b> (wood), <b>Cindara</b> (gas) and <b>Technova</b> (tech). "
          + "Propose trades — they only accept deals that <b>expand their PPC</b>. You can also set <b>tariffs</b>." },
    { title: "⬆️ Upgrade & grow",
      body: "Use the <b>⬆️ Upgrade</b> tool and click any building to <b>level it up</b> (★ → ★★ → ★★★). "
          + "Each level boosts its output &amp; jobs and gives it a <b>bigger graphic</b> — especially markets and "
          + "production buildings. Upgrades cost money, resources and 1 💞." },
    { title: "🚀 You're ready!",
      body: "Try: <b>Roads → 2 Houses → a Lumber Camp → a Farm → a Grocery → a Kindness Center</b>, then press "
          + "<b>Play ▶</b>. Grow your human capital, trade with the world, and build a utopia. Long live Omandistan!" },
  ];

  return { MAP, CASTLE, START, RESOURCES, ECON, TAX, UPGRADE, BUILDINGS, BUILD_ORDER,
           COUNTRIES, EVENTS, SPEEDS, TUTORIAL };
})();
