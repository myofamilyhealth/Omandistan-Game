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

  // ---- Starting conditions ------------------------------------------------
  const START = {
    treasury: 2000,      // dollars in the national treasury
    loveTokens: 14,      // Spreading Love tokens (Omand approval currency)
    population: 0,        // people living in Omandistan
    happiness: 72,       // national happiness / "utopia" score (0-100)
    monthsPerTick: 1,    // one simulation tick == one in-game month
  };

  // ---- Economic reference values -----------------------------------------
  // "Reference price" = the price at which the listed per-capita quantity is
  // demanded. Demand curves bend around these points using the elasticities.
  const ECON = {
    // --- Food: PERFECT COMPETITION, a NECESSITY (inelastic demand) --------
    food: {
      refPrice: 10,
      perCapita: 1.0,        // food units a person wants per month at refPrice
      elasticity: -0.30,     // |e| < 1  -> inelastic (necessity)
      farmWage: 6,           // wage cost per farm worker per month
    },
    // --- Healthcare: MONOPOLY, a NECESSITY (very inelastic) ---------------
    health: {
      refPrice: 20,
      perCapita: 0.5,
      elasticity: -0.25,
      marginalCost: 12,      // monopolist's constant marginal cost
      monopolyMarkup: 3.0,   // price multiple a monopoly charges over refPrice
      publicOptionPrice: 9,  // price when the Omands decree a public option
    },
    // --- Consumer goods: COMMERCE, a LUXURY (elastic demand) --------------
    goods: {
      refPrice: 15,
      perCapita: 0.45,
      elasticity: -1.40,     // |e| > 1 -> elastic (luxury / discretionary)
    },
    laborForceShare: 0.62,   // fraction of population that works
    taxRate: 0.12,           // share of GDP collected as tax by the Omands
  };

  // ---- Building catalogue -------------------------------------------------
  // height = visual extrusion height in tiles; color = roof/body color.
  // money cost is paid from the treasury; love = Spreading Love tokens the
  // Omands require to APPROVE the action.
  const BUILDINGS = {
    road: {
      name: "Road", icon: "🛣️", cost: 5, love: 0, upkeep: 0.2,
      height: 0.08, color: "#6b7280", category: "Infrastructure",
      desc: "Pre-approved public works. Connects your country (no token needed).",
    },
    house: {
      name: "Housing", icon: "🏠", cost: 60, love: 1, upkeep: 1,
      height: 0.7, color: "#e8b04b", category: "Residential",
      housing: 8,
      desc: "Homes for citizens. Immigrants only arrive if there is housing.",
    },
    farm: {
      name: "Farm", icon: "🌾", cost: 70, love: 1, upkeep: 1.5,
      height: 0.35, color: "#86b04a", category: "Perfect Competition",
      jobs: 4, foodOutput: 22,
      desc: "Many identical farms = PERFECT COMPETITION. Farmers are price-takers; profit drives entry & exit toward zero economic profit.",
    },
    market: {
      name: "Market", icon: "🛒", cost: 140, love: 1, upkeep: 2.5,
      height: 0.6, color: "#5aa0d8", category: "Commerce",
      jobs: 8, goodsOutput: 16,
      desc: "Sells consumer goods (a LUXURY). Demand here is ELASTIC — sales swing a lot with price.",
    },
    factory: {
      name: "Factory", icon: "🏭", cost: 240, love: 1, upkeep: 4,
      height: 0.9, color: "#b08d57", category: "Industry",
      jobs: 16, goodsOutput: 34,
      desc: "Lots of jobs and output (raises GDP). A pillar of the economy.",
    },
    hospital: {
      name: "Hospital", icon: "🏥", cost: 360, love: 1, upkeep: 6,
      height: 1.0, color: "#d96a6a", category: "Monopoly",
      jobs: 12, healthCapacity: 60,
      desc: "The healthcare sector is a MONOPOLY: one provider sets a high price and serves fewer people — unless the Omands decree a public option.",
    },
    kindness: {
      name: "Kindness Center", icon: "💞", cost: 90, love: 0, upkeep: 1,
      height: 0.55, color: "#d87fb8", category: "Civic",
      jobs: 3, lovePerTick: 0.6,
      desc: "Organizes acts of kindness. Generates Spreading Love tokens over time (no token to build).",
    },
    park: {
      name: "Park", icon: "🌳", cost: 35, love: 1, upkeep: 0.5,
      height: 0.25, color: "#4e9d5b", category: "Amenity",
      amenity: 6,
      desc: "Green space. Raises happiness and makes Omandistan a nicer place to live.",
    },
  };

  // Order shown in the build toolbar
  const BUILD_ORDER = ["road", "house", "farm", "market", "factory", "hospital", "kindness", "park"];

  // ---- Acts-of-kindness events (help struggling civilizations) ------------
  const EVENTS = [
    {
      title: "Famine in the Vale of Tariq",
      text: "A neighbouring village faces famine. Mr. & Mrs. Omand ask if Omandistan will send food aid.",
      costMoney: 120, reward: 4, happiness: 4,
      yes: "Send aid 🌾", no: "We cannot spare it",
    },
    {
      title: "The Wandering Healers",
      text: "Traveling healers seek funds to treat a sick caravan passing through your land.",
      costMoney: 90, reward: 3, happiness: 3,
      yes: "Fund the healers 🩺", no: "Turn them away",
    },
    {
      title: "Festival of Shared Bread",
      text: "Citizens want to host a festival welcoming refugees from a struggling nation.",
      costMoney: 70, reward: 3, happiness: 5,
      yes: "Host the festival 🎉", no: "Maybe next year",
    },
    {
      title: "The Frozen North Appeal",
      text: "An Alaska-sized winter grips a far province. They beg for fuel and blankets.",
      costMoney: 110, reward: 4, happiness: 3,
      yes: "Send a relief convoy 🚚", no: "Decline",
    },
  ];

  // ---- Simulation pacing --------------------------------------------------
  const SPEEDS = [
    { label: "⏸", ms: 0 },
    { label: "▶", ms: 1600 },
    { label: "▶▶", ms: 800 },
    { label: "▶▶▶", ms: 300 },
  ];

  return { MAP, START, ECON, BUILDINGS, BUILD_ORDER, EVENTS, SPEEDS };
})();
