/* ============================================================================
 * OMANDISTAN — config.js
 * All tunable game + economics parameters live here so they are easy to adjust
 * for AP Econ lessons. Loaded first; exposes a global `CONFIG` object.
 * ==========================================================================*/
window.CONFIG = (function () {
  "use strict";

  // ---- Map ----------------------------------------------------------------
  const MAP = {
    cols: 24,
    rows: 24,
    tileW: 64,   // isometric tile width  (pixels)
    tileH: 32,   // isometric tile height (pixels)
  };

  // The Omand royal castle sits offshore on a water tile (not player-built).
  const CASTLE = { cx: 12, cy: 0 };

  // ---- Starting conditions ------------------------------------------------
  const START = {
    treasury: 3500,      // dollars in the national treasury (generous start)
    loveTokens: 16,      // Spreading Love tokens (Omand approval currency)
    population: 0,        // people living in Omandistan
    happiness: 74,       // national happiness / "utopia" score (0-100)
    monthsPerTick: 1,    // one simulation tick == one in-game month
  };

  // ---- Economic reference values -----------------------------------------
  const ECON = {
    // --- Food: PERFECT COMPETITION, a NECESSITY (inelastic demand) --------
    food: {
      refPrice: 10,
      perCapita: 1.0,
      elasticity: -0.30,
      farmWage: 5,
    },
    // --- Healthcare: MONOPOLY, a NECESSITY (very inelastic) ---------------
    health: {
      refPrice: 20,
      perCapita: 0.5,
      elasticity: -0.25,
      marginalCost: 12,
      monopolyMarkup: 3.0,
      publicOptionPrice: 9,
    },
    // --- Consumer goods: COMMERCE, a LUXURY (elastic demand) --------------
    goods: {
      refPrice: 15,
      perCapita: 0.45,
      elasticity: -1.40,
    },
    laborForceShare: 0.62,
    taxRate: 0.18,           // higher tax take so the treasury grows faster

    // --- Human capital -> productivity (shifts the PPC outward) -----------
    humanCapital: {
      perCapitaForFullBonus: 0.6, // education "slots" per person for max bonus
      maxOutputBonus: 0.75,       // up to +75% output from an educated workforce
      happinessBonus: 0.10,       // educated nations are happier
    },

    // --- International trade (ports & airports) ---------------------------
    trade: {
      exportMargin: 6,    // profit earned per unit exported
      importPrice: 9,     // cost paid per unit imported to cover a shortage
      airTourism: 0.8,    // tourism $ per unit of air trade capacity per happiness pt
    },
  };

  // ---- Building catalogue -------------------------------------------------
  const BUILDINGS = {
    road: {
      name: "Road", icon: "🛣️", cost: 5, love: 0, upkeep: 0.1,
      height: 0.08, color: "#6b7280", category: "Infrastructure",
      desc: "Pre-approved public works. Connects your country (no token needed).",
    },
    house: {
      name: "Housing", icon: "🏠", cost: 55, love: 1, upkeep: 0.6,
      height: 0.7, color: "#e8b04b", category: "Residential",
      housing: 8,
      desc: "Homes for citizens. Immigrants only arrive if there is housing.",
    },
    farm: {
      name: "Farm", icon: "🌾", cost: 65, love: 1, upkeep: 0.8,
      height: 0.35, color: "#86b04a", category: "Perfect Competition",
      jobs: 4, foodOutput: 22,
      desc: "Many identical farms = PERFECT COMPETITION. Farmers are price-takers; profit drives entry & exit toward zero economic profit.",
    },
    market: {
      name: "Market", icon: "🛒", cost: 130, love: 1, upkeep: 1.4,
      height: 0.6, color: "#5aa0d8", category: "Commerce",
      jobs: 8, goodsOutput: 16,
      desc: "Sells consumer goods (a LUXURY). Demand here is ELASTIC — sales swing a lot with price. Earns tax money.",
    },
    factory: {
      name: "Factory", icon: "🏭", cost: 220, love: 1, upkeep: 2.4,
      height: 0.9, color: "#b08d57", category: "Industry",
      jobs: 16, goodsOutput: 34,
      desc: "Lots of jobs and output (raises GDP and tax revenue). A pillar of the economy.",
    },
    hospital: {
      name: "Hospital", icon: "🏥", cost: 340, love: 1, upkeep: 3.5,
      height: 1.0, color: "#d96a6a", category: "Monopoly",
      jobs: 12, healthCapacity: 60,
      desc: "The healthcare sector is a MONOPOLY: one provider sets a high price and serves fewer people — unless the Omands decree a public option.",
    },
    school: {
      name: "School", icon: "🏫", cost: 150, love: 1, upkeep: 1.4,
      height: 0.6, color: "#d98a4a", category: "Human Capital",
      jobs: 6, humanCapital: 8, amenity: 2,
      desc: "Educates workers. Builds HUMAN CAPITAL, which raises productivity and pushes Omandistan's PPC outward (more output from the same resources).",
    },
    university: {
      name: "University", icon: "🎓", cost: 420, love: 1, upkeep: 3,
      height: 0.95, color: "#9a6cb0", category: "Human Capital",
      jobs: 14, humanCapital: 22, amenity: 3,
      desc: "Advanced human capital. A big boost to national productivity and happiness — the engine of long-run growth.",
    },
    port: {
      name: "Seaport", icon: "🚢", cost: 300, love: 1, upkeep: 2.2,
      height: 0.5, color: "#4a7fa5", category: "Global Trade",
      jobs: 12, tradeCapacity: 45, requiresWater: true,
      desc: "Unlocks GLOBAL TRADE by sea. EXPORTS surplus food/goods for profit and IMPORTS to fix shortages. Must be built next to water.",
    },
    airport: {
      name: "Airport", icon: "✈️", cost: 560, love: 1, upkeep: 4.5,
      height: 0.65, color: "#8a98a6", category: "Global Trade",
      jobs: 20, tradeCapacity: 75, tourism: true,
      desc: "High-capacity global trade by air, plus TOURISM income that scales with how happy and famous your utopia becomes.",
    },
    kindness: {
      name: "Kindness Center", icon: "💞", cost: 85, love: 0, upkeep: 0.6,
      height: 0.55, color: "#d87fb8", category: "Civic",
      jobs: 3, lovePerTick: 0.8,
      desc: "Organizes acts of kindness. Generates Spreading Love tokens over time (no token to build).",
    },
    park: {
      name: "Park", icon: "🌳", cost: 30, love: 1, upkeep: 0.3,
      height: 0.25, color: "#4e9d5b", category: "Amenity",
      amenity: 6,
      desc: "Green space. Raises happiness and makes Omandistan a nicer place to live.",
    },
  };

  // Order shown in the build toolbar
  const BUILD_ORDER = [
    "road", "house", "farm", "market", "factory",
    "hospital", "school", "university", "port", "airport",
    "kindness", "park",
  ];

  // ---- Acts-of-kindness events (help struggling civilizations) ------------
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
    { title: "The Frozen North Appeal",
      text: "An Alaska-sized winter grips a far province. They beg for fuel and blankets.",
      costMoney: 110, reward: 4, happiness: 3, yes: "Send a relief convoy 🚚", no: "Decline" },
    { title: "Scholarships for Refugees",
      text: "A struggling nation asks Omandistan to school their brightest young students.",
      costMoney: 100, reward: 4, happiness: 4, yes: "Offer scholarships 🎓", no: "Not this year" },
  ];

  // ---- Simulation pacing --------------------------------------------------
  const SPEEDS = [
    { label: "⏸", ms: 0 },
    { label: "▶", ms: 1600 },
    { label: "▶▶", ms: 800 },
    { label: "▶▶▶", ms: 300 },
  ];

  // ---- Tutorial (shown on first open) -------------------------------------
  const TUTORIAL = [
    { title: "👑 Welcome to Omandistan 👸",
      body: "You serve <b>Mr. &amp; Mrs. Omand</b>, the king and queen who live in the castle off your shore. "
          + "Your mission: build a thriving <b>utopia</b> the size of Alaska. The happier your country, the more people move in." },
    { title: "💞 The Omands approve everything",
      body: "Every building (except roads) needs <b>1 Spreading Love token</b> for the Omands to approve it. "
          + "Earn tokens by building <b>Kindness Centers 💞</b> and by saying <b>yes</b> to events that help struggling neighbours." },
    { title: "🏠 Step 1 — Houses bring people",
      body: "Start by placing <b>Housing 🏠</b>. Your first home invites founding settlers, and immigrants keep arriving "
          + "as long as there are empty homes <i>and</i> your happiness is high." },
    { title: "💰 Step 2 — How to make money",
      body: "People work in <b>Farms 🌾, Markets 🛒, and Factories 🏭</b>. Their output becomes <b>GDP</b>, and the Omands "
          + "collect <b>taxes</b> from GDP into your <b>Treasury</b>. So: more workers + more businesses = more money. "
          + "Build <b>Seaports 🚢 / Airports ✈️</b> to <b>export</b> your surplus for extra cash." },
    { title: "🎓 Step 3 — Grow human capital",
      body: "Build <b>Schools 🏫</b> and <b>Universities 🎓</b> to raise <b>Human Capital</b>. An educated workforce is more "
          + "<b>productive</b> — the same farms and factories produce <i>more</i>, which pushes Omandistan's <b>PPC</b> "
          + "(production possibilities) outward. This is the secret to long-run growth." },
    { title: "📊 Step 4 — The economics (AP Econ!)",
      body: "🌾 Farms = <b>perfect competition</b> (price-takers). 🏥 Healthcare = <b>monopoly</b> (high price, fewer served — "
          + "try the Public Option decree!). Food &amp; care are <b>inelastic</b> necessities; goods are an <b>elastic</b> luxury. "
          + "Watch the right-hand panel to see it all live." },
    { title: "🚀 You're ready!",
      body: "Suggested opening: <b>2–3 Houses → a Farm → a Market → a Kindness Center</b>, then press <b>Play ▶</b>. "
          + "Keep happiness up, keep building, and grow your utopia. Long live Omandistan!" },
  ];

  return { MAP, CASTLE, START, ECON, BUILDINGS, BUILD_ORDER, EVENTS, SPEEDS, TUTORIAL };
})();
