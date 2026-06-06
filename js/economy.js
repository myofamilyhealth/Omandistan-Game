/* ============================================================================
 * OMANDISTAN — economy.js
 * The macro/micro simulation. Pure-ish functions that read the game state and
 * return derived statistics each tick. Exposes a global `Economy` object.
 *
 * AP Econ models implemented:
 *   - Perfect competition (farms / food market)   -> price-taking, profit signal
 *   - Monopoly (healthcare)                        -> high price, restricted Q, DWL
 *   - Price elasticity of demand                   -> Qd = D0 * (P/Pref)^e
 *   - Human capital -> productivity (PPC shift)    -> education raises output
 *   - International trade (ports/airports)         -> exports, imports, tourism
 *   - Labor market & unemployment
 *   - GDP, inflation (price index), taxation
 *   - Immigration driven by national happiness
 * ==========================================================================*/
window.Economy = (function () {
  "use strict";
  const C = window.CONFIG;

  function quantityDemanded(D0, price, Pref, elasticity) {
    if (D0 <= 0) return 0;
    return D0 * Math.pow(price / Pref, elasticity);
  }

  // Market-clearing price for a fixed short-run supply Qs.
  // Solve D0 * (P/Pref)^e = Qs  ->  P = Pref * (Qs/D0)^(1/e)
  function clearingPrice(Qs, D0, Pref, elasticity) {
    if (D0 <= 0) return Pref;
    if (Qs <= 0) return Pref * 4;
    const ratio = Qs / D0;
    let p = Pref * Math.pow(ratio, 1 / elasticity);
    return clamp(p, Pref * 0.4, Pref * 4);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function tallyBuildings(state) {
    const t = {
      housing: 0, foodOutput: 0, goodsOutput: 0, healthCapacity: 0,
      jobs: 0, amenity: 0, lovePerTick: 0, upkeep: 0,
      humanCapital: 0, tradeCapacity: 0, airCapacity: 0,
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
      t.humanCapital += def.humanCapital || 0;
      t.tradeCapacity += def.tradeCapacity || 0;
      if (def.tourism) t.airCapacity += def.tradeCapacity || 0;
      if (b.type === "farm") t.farms++;
      if (b.type === "hospital") t.hospitals++;
    }
    return t;
  }

  // --- Advance the economy by one month ------------------------------------
  function tick(state) {
    const E = C.ECON;
    const pop = state.population;
    const t = tallyBuildings(state);

    // ===================================================================
    // HUMAN CAPITAL -> PRODUCTIVITY (shifts the PPC outward)
    // ===================================================================
    const HC = E.humanCapital;
    const hcPerCapita = pop <= 0 ? 0 : t.humanCapital / pop;
    const hcUtil = clamp(hcPerCapita / HC.perCapitaForFullBonus, 0, 1);
    const productivity = 1 + HC.maxOutputBonus * hcUtil;   // e.g. 1.00 .. 1.75

    // Effective (productivity-boosted) outputs — this is the PPC expanding.
    const foodOutputEff = t.foodOutput * productivity;
    const goodsOutputEff = t.goodsOutput * productivity;
    const healthCapEff = t.healthCapacity * productivity;

    // ===================================================================
    // FOOD MARKET — PERFECT COMPETITION  (+ trade)
    // ===================================================================
    const foodD0 = pop * E.food.perCapita;
    let foodImports = 0, foodExports = 0;
    let foodSupply = foodOutputEff;
    // Trade: import to cover a shortage, export the surplus (gains from trade).
    let capLeft = t.tradeCapacity;
    if (foodSupply < foodD0 && capLeft > 0) {
      foodImports = Math.min(foodD0 - foodSupply, capLeft);
      foodSupply += foodImports; capLeft -= foodImports;
    } else if (foodSupply > foodD0 && capLeft > 0) {
      foodExports = Math.min(foodSupply - foodD0, capLeft);
      capLeft -= foodExports;
    }
    const foodPrice = clearingPrice(foodSupply, foodD0, E.food.refPrice, E.food.elasticity);
    const foodConsumed = Math.min(foodSupply, quantityDemanded(foodD0, foodPrice, E.food.refPrice, E.food.elasticity));
    const foodAccess = foodD0 <= 0 ? 1 : clamp(foodConsumed / foodD0, 0, 1);
    const farmRevenue = Math.min(foodOutputEff, foodConsumed) * foodPrice;
    const farmWages = t.farms * C.BUILDINGS.farm.jobs * E.food.farmWage;
    const farmProfit = farmRevenue - farmWages - t.farms * C.BUILDINGS.farm.upkeep;

    // ===================================================================
    // HEALTHCARE — MONOPOLY  (not traded; a local service)
    // ===================================================================
    const healthD0 = pop * E.health.perCapita;
    const healthRegulated = state.policies.publicHealth;
    const healthPrice = healthRegulated ? E.health.publicOptionPrice
                                        : E.health.refPrice * E.health.monopolyMarkup;
    const healthQd = quantityDemanded(healthD0, healthPrice, E.health.refPrice, E.health.elasticity);
    const healthServed = Math.min(healthCapEff, healthQd);
    const healthAccess = healthD0 <= 0 ? 1 : clamp(healthServed / healthD0, 0, 1);
    const healthCompetitiveQ = Math.min(healthCapEff,
      quantityDemanded(healthD0, E.health.marginalCost, E.health.refPrice, E.health.elasticity));
    const healthDWL = healthRegulated ? 0 : Math.max(0, healthCompetitiveQ - healthServed);
    const healthRevenue = healthServed * healthPrice;
    const healthSubsidy = healthRegulated ? Math.max(0, (E.health.marginalCost - healthPrice) * healthServed) : 0;

    // ===================================================================
    // CONSUMER GOODS — elastic luxury  (+ trade)
    // ===================================================================
    const goodsD0 = pop * E.goods.perCapita;
    let goodsImports = 0, goodsExports = 0;
    let goodsSupply = goodsOutputEff;
    if (goodsSupply < goodsD0 && capLeft > 0) {
      goodsImports = Math.min(goodsD0 - goodsSupply, capLeft);
      goodsSupply += goodsImports; capLeft -= goodsImports;
    } else if (goodsSupply > goodsD0 && capLeft > 0) {
      goodsExports = Math.min(goodsSupply - goodsD0, capLeft);
      capLeft -= goodsExports;
    }
    const goodsPrice = clearingPrice(goodsSupply, goodsD0, E.goods.refPrice, E.goods.elasticity);
    const goodsSold = Math.min(goodsSupply, quantityDemanded(goodsD0, goodsPrice, E.goods.refPrice, E.goods.elasticity));

    // ===================================================================
    // TRADE accounting (exports earn money, imports cost money, tourism)
    // ===================================================================
    const exportIncome = (foodExports + goodsExports) * E.trade.exportMargin;
    const importCost = (foodImports + goodsImports) * E.trade.importPrice;
    const tourismIncome = t.airCapacity > 0
      ? (t.airCapacity * E.trade.airTourism * (state.happiness / 100))
      : 0;
    const tradeNet = exportIncome - importCost + tourismIncome;

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
    const gdp = farmRevenue + healthRevenue + goodsSold * goodsPrice + exportIncome + tourismIncome;
    const priceIndex = (foodPrice / E.food.refPrice) * 0.45
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
      foodAccess * 0.24 +
      healthAccess * 0.18 +
      housingRatio * 0.15 +
      employmentScore * 0.16 +
      amenityRatio * 0.09 +
      priceStability * 0.08 +
      hcUtil * HC.happinessBonus            // educated nations are happier
    );
    if (pop < 12) happiness = Math.max(happiness, 64);  // bootstrap morale
    happiness = clamp(happiness, 0, 100);

    // ===================================================================
    // IMMIGRATION / EMIGRATION
    // ===================================================================
    let popChange = 0;
    if (happiness >= 55 && housingFree > 0) {
      const pull = (happiness - 55) / 45;
      popChange = Math.min(housingFree, Math.ceil((2 + pop * 0.04) * pull));
    } else if (happiness < 38 && pop > 0) {
      const push = (38 - happiness) / 38;
      popChange = -Math.ceil((1 + pop * 0.03) * push);
    }

    // ===================================================================
    // TREASURY
    // ===================================================================
    const taxRevenue = gdp * E.taxRate;
    const netTreasury = taxRevenue + tradeNet - t.upkeep - healthSubsidy;

    return {
      tally: t,
      productivity, humanCapital: t.humanCapital, hcUtil,
      food: { price: foodPrice, supply: foodOutputEff, demand: foodD0, sold: foodConsumed,
              access: foodAccess, farmProfit, imports: foodImports, exports: foodExports },
      health: { price: healthPrice, served: healthServed, demand: healthD0, access: healthAccess,
                regulated: healthRegulated, dwl: healthDWL, subsidy: healthSubsidy },
      goods: { price: goodsPrice, supply: goodsOutputEff, sold: goodsSold, demand: goodsD0,
               imports: goodsImports, exports: goodsExports },
      trade: { capacity: t.tradeCapacity, exportIncome, importCost, tourismIncome, net: tradeNet },
      labor: { force: laborForce, jobs, employed, unemployment },
      gdp, priceIndex, inflation,
      housing, housingFree, housingRatio,
      happiness, popChange,
      treasury: { tax: taxRevenue, upkeep: t.upkeep, subsidy: healthSubsidy, trade: tradeNet, net: netTreasury },
      lovePerTick: t.lovePerTick,
    };
  }

  return { tick, tallyBuildings, quantityDemanded, clearingPrice };
})();
