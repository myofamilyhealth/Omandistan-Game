/* ============================================================================
 * OMANDISTAN — economy.js
 * The macro/micro simulation. Pure-ish functions that read the game state and
 * return derived statistics each tick. Exposes a global `Economy` object.
 *
 * AP Econ models implemented:
 *   - Perfect competition (farms / food market)   -> price-taking, profit signal
 *   - Monopoly (healthcare)                        -> high price, restricted Q, DWL
 *   - Price elasticity of demand                   -> Qd = D0 * (P/Pref)^e
 *   - Labor market & unemployment
 *   - GDP, inflation (price index), taxation
 *   - Immigration driven by national happiness
 * ==========================================================================*/
window.Economy = (function () {
  "use strict";
  const C = window.CONFIG;

  // Quantity demanded along a constant-elasticity demand curve.
  // D0 is quantity demanded at the reference price Pref.
  function quantityDemanded(D0, price, Pref, elasticity) {
    if (D0 <= 0) return 0;
    return D0 * Math.pow(price / Pref, elasticity);
  }

  // Market-clearing price for a fixed short-run supply Qs (perfect competition).
  // Solve D0 * (P/Pref)^e = Qs  ->  P = Pref * (Qs/D0)^(1/e)
  function clearingPrice(Qs, D0, Pref, elasticity) {
    if (D0 <= 0) return Pref;               // no demand -> price rests at ref
    if (Qs <= 0) return Pref * 4;           // no supply -> scarcity ceiling
    const ratio = Qs / D0;
    let p = Pref * Math.pow(ratio, 1 / elasticity);
    // keep prices in a sane band so the sim stays readable
    return clamp(p, Pref * 0.4, Pref * 4);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Tally up everything the placed buildings provide.
  function tallyBuildings(state) {
    const t = {
      housing: 0, foodOutput: 0, goodsOutput: 0, healthCapacity: 0,
      jobs: 0, amenity: 0, lovePerTick: 0, upkeep: 0,
      farms: 0, hospitals: 0, counts: {},
    };
    for (const b of state.buildings) {
      const def = C.BUILDINGS[b.type];
      if (!def) continue;
      t.counts[b.type] = (t.counts[b.type] || 0) + 1;
      t.housing += def.housing || 0;
      t.foodOutput += def.foodOutput || 0;
      t.goodsOutput += def.goodsOutput || 0;
      t.healthCapacity += def.healthCapacity || 0;
      t.jobs += def.jobs || 0;
      t.amenity += def.amenity || 0;
      t.lovePerTick += def.lovePerTick || 0;
      t.upkeep += def.upkeep || 0;
      if (b.type === "farm") t.farms++;
      if (b.type === "hospital") t.hospitals++;
    }
    return t;
  }

  // --- The big one: advance the economy by one month -----------------------
  function tick(state) {
    const E = C.ECON;
    const pop = state.population;
    const t = tallyBuildings(state);

    // ===================================================================
    // FOOD MARKET — PERFECT COMPETITION (necessity, inelastic demand)
    // ===================================================================
    const foodD0 = pop * E.food.perCapita;                 // demand @ ref price
    const foodQs = t.foodOutput;                           // short-run supply
    // With fixed short-run supply the market clears at this price; cleared
    // quantity is min(Qs, Qd@price).
    const foodPriceCleared = clearingPrice(foodQs, foodD0, E.food.refPrice, E.food.elasticity);
    const foodSold = Math.min(foodQs, quantityDemanded(foodD0, foodPriceCleared, E.food.refPrice, E.food.elasticity));
    const foodAccess = foodD0 <= 0 ? 1 : clamp(foodSold / foodD0, 0, 1);
    // Farm economics: revenue vs. wage cost. Perfect competition pushes
    // economic profit toward zero in the long run (shown as a signal).
    const farmRevenue = foodSold * foodPriceCleared;
    const farmWages = t.farms * C.BUILDINGS.farm.jobs * E.food.farmWage;
    const farmProfit = farmRevenue - farmWages - t.farms * C.BUILDINGS.farm.upkeep;

    // ===================================================================
    // HEALTHCARE — MONOPOLY (necessity, very inelastic demand)
    // ===================================================================
    const healthD0 = pop * E.health.perCapita;
    let healthPrice, healthRegulated = state.policies.publicHealth;
    if (healthRegulated) {
      healthPrice = E.health.publicOptionPrice;            // priced near cost
    } else {
      healthPrice = E.health.refPrice * E.health.monopolyMarkup; // monopoly markup
    }
    const healthQd = quantityDemanded(healthD0, healthPrice, E.health.refPrice, E.health.elasticity);
    const healthServed = Math.min(t.healthCapacity, healthQd);
    const healthAccess = healthD0 <= 0 ? 1 : clamp(healthServed / healthD0, 0, 1);
    // Deadweight loss proxy: people who would be served at marginal-cost price
    // but are priced out by the monopoly.
    const healthCompetitiveQ = Math.min(t.healthCapacity,
      quantityDemanded(healthD0, E.health.marginalCost, E.health.refPrice, E.health.elasticity));
    const healthDWL = healthRegulated ? 0 : Math.max(0, healthCompetitiveQ - healthServed);
    const healthRevenue = healthServed * healthPrice;
    const healthCost = healthServed * E.health.marginalCost;
    // public option is subsidised when price < marginal cost
    const healthSubsidy = healthRegulated ? Math.max(0, (E.health.marginalCost - healthPrice) * healthServed) : 0;

    // ===================================================================
    // CONSUMER GOODS — luxury, ELASTIC demand (contrast with food)
    // ===================================================================
    const goodsD0 = pop * E.goods.perCapita;
    const goodsQs = t.goodsOutput;
    const goodsPrice = clearingPrice(goodsQs, goodsD0, E.goods.refPrice, E.goods.elasticity);
    const goodsSold = Math.min(goodsQs, quantityDemanded(goodsD0, goodsPrice, E.goods.refPrice, E.goods.elasticity));

    // ===================================================================
    // LABOR MARKET & UNEMPLOYMENT
    // ===================================================================
    const laborForce = Math.round(pop * E.laborForceShare);
    const jobs = t.jobs;
    const employed = Math.min(laborForce, jobs);
    const unemployment = laborForce <= 0 ? 0 : clamp((laborForce - employed) / laborForce, 0, 1);

    // ===================================================================
    // GDP & INFLATION
    // ===================================================================
    const gdp = farmRevenue + healthRevenue + goodsSold * goodsPrice;
    const priceIndex = (foodPriceCleared / E.food.refPrice) * 0.45
                     + (healthPrice / E.health.refPrice) * 0.25
                     + (goodsPrice / E.goods.refPrice) * 0.30;
    const inflation = state.lastPriceIndex ? (priceIndex - state.lastPriceIndex) / state.lastPriceIndex : 0;

    // ===================================================================
    // HOUSING
    // ===================================================================
    const housing = t.housing;
    const housingRatio = housing <= 0 ? 0 : clamp(housing >= pop ? 1 : housing / Math.max(1, pop), 0, 1);
    const housingFree = Math.max(0, housing - pop);

    // ===================================================================
    // HAPPINESS / UTOPIA SCORE (0-100)
    // ===================================================================
    const amenityRatio = pop <= 0 ? 1 : clamp(t.amenity / pop, 0, 1);
    const employmentScore = laborForce <= 0 ? 1 : (1 - unemployment);
    const priceStability = clamp(1 - Math.abs(inflation) * 4, 0, 1);
    let happiness = 100 * (
      foodAccess * 0.26 +
      healthAccess * 0.20 +
      housingRatio * 0.16 +
      employmentScore * 0.18 +
      amenityRatio * 0.10 +
      priceStability * 0.10
    );
    // When the country is nearly empty, keep morale buoyant so it can bootstrap.
    if (pop < 12) happiness = Math.max(happiness, 64);
    happiness = clamp(happiness, 0, 100);

    // ===================================================================
    // IMMIGRATION / EMIGRATION (the country grows as it improves)
    // ===================================================================
    let popChange = 0;
    if (happiness >= 55 && housingFree > 0) {
      const pull = (happiness - 55) / 45;                  // 0..1
      popChange = Math.min(housingFree, Math.ceil((2 + pop * 0.04) * pull));
    } else if (happiness < 38 && pop > 0) {
      const push = (38 - happiness) / 38;
      popChange = -Math.ceil((1 + pop * 0.03) * push);
    }

    // ===================================================================
    // TREASURY: tax revenue minus upkeep and healthcare subsidy
    // ===================================================================
    const taxRevenue = gdp * E.taxRate;
    const netTreasury = taxRevenue - t.upkeep - healthSubsidy;

    return {
      tally: t,
      food: { price: foodPriceCleared, supply: foodQs, demand: foodD0, sold: foodSold, access: foodAccess, farmProfit },
      health: { price: healthPrice, served: healthServed, demand: healthD0, access: healthAccess,
                regulated: healthRegulated, dwl: healthDWL, subsidy: healthSubsidy },
      goods: { price: goodsPrice, supply: goodsQs, sold: goodsSold, demand: goodsD0 },
      labor: { force: laborForce, jobs, employed, unemployment },
      gdp, priceIndex, inflation,
      housing, housingFree, housingRatio,
      happiness, popChange,
      treasury: { tax: taxRevenue, upkeep: t.upkeep, subsidy: healthSubsidy, net: netTreasury },
      lovePerTick: t.lovePerTick,
    };
  }

  return { tick, tallyBuildings, quantityDemanded, clearingPrice };
})();
