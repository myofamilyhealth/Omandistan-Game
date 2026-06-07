/* ============================================================================
 * OMANDISTAN — economy.js
 * The macro/micro simulation. Exposes a global `Economy` object.
 *
 * AP Econ models implemented:
 *   - Perfect competition (farms) & monopoly (healthcare)
 *   - Price elasticity of demand
 *   - Human capital -> productivity (PPC shift)
 *   - GDP by EXPENDITURE: GDP = C + I + G + Xn
 *   - An adjustable tax system (flat vs progressive)
 *   - Resources (wood/oil/gas), extraction, and international trade + tariffs
 *   - Labor market, inflation, immigration
 * ==========================================================================*/
window.Economy = (function () {
  "use strict";
  const C = window.CONFIG;
  const W = window.World;

  function qd(D0, price, Pref, e) { return D0 <= 0 ? 0 : D0 * Math.pow(price / Pref, e); }
  function clearingPrice(Qs, D0, Pref, e) {
    if (D0 <= 0) return Pref;
    if (Qs <= 0) return Pref * 4;
    return clamp(Pref * Math.pow(Qs / D0, 1 / e), Pref * 0.4, Pref * 4);
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function tallyBuildings(state) {
    const t = {
      housing: 0, foodOutput: 0, retailOutput: 0, healthCapacity: 0, industrialOutput: 0,
      jobs: 0, amenity: 0, lovePerTick: 0, upkeep: 0, humanCapital: 0,
      tradeCapacity: 0, airCapacity: 0, gdpI: 0, gdpG: 0,
      produce: { wood: 0, oil: 0, gas: 0 }, farms: 0, tradeUnlocked: false, counts: {},
    };
    for (const b of state.buildings) {
      const def = C.BUILDINGS[b.type];
      if (!def) continue;
      t.counts[b.type] = (t.counts[b.type] || 0) + 1;
      t.housing += def.housing || 0;
      t.foodOutput += def.foodOutput || 0;
      t.retailOutput += def.goodsOutput || 0;          // grocery/clothing/restaurant
      t.industrialOutput += def.industrialOutput || 0; // factory/tech
      t.healthCapacity += def.healthCapacity || 0;
      t.jobs += def.jobs || 0;
      t.amenity += def.amenity || 0;
      t.lovePerTick += def.lovePerTick || 0;
      t.upkeep += def.upkeep || 0;
      t.humanCapital += def.humanCapital || 0;
      t.tradeCapacity += def.tradeCapacity || 0;
      if (def.tourism) t.airCapacity += def.tradeCapacity || 0;
      if (def.unlocksTrade) t.tradeUnlocked = true;
      if (def.gdpc === "I") t.gdpI += def.gdpVal || 0;
      if (def.gdpc === "G" && b.type !== "hospital") t.gdpG += def.gdpVal || 0;
      if (def.produces) for (const r in def.produces) t.produce[r] += def.produces[r];
      if (b.type === "farm") t.farms++;
    }
    return t;
  }

  function tick(state) {
    const E = C.ECON;
    const pop = state.population;
    const t = tallyBuildings(state);

    // --- Human capital -> productivity (PPC shift) -------------------------
    const HC = E.humanCapital;
    const hcPerCapita = pop <= 0 ? 0 : t.humanCapital / pop;
    const hcUtil = clamp(hcPerCapita / HC.perCapitaForFullBonus, 0, 1);
    const productivity = 1 + HC.maxOutputBonus * hcUtil;

    const foodOut = t.foodOutput * productivity;
    const retailOut = t.retailOutput * productivity;
    const healthCap = t.healthCapacity * productivity;
    const industrialOut = t.industrialOutput * productivity;

    // --- FOOD: perfect competition (Consumption) ---------------------------
    const foodD0 = pop * E.food.perCapita;
    const foodPrice = clearingPrice(foodOut, foodD0, E.food.refPrice, E.food.elasticity);
    const foodConsumed = Math.min(foodOut, qd(foodD0, foodPrice, E.food.refPrice, E.food.elasticity));
    const foodAccess = foodD0 <= 0 ? 1 : clamp(foodConsumed / foodD0, 0, 1);
    const farmRevenue = foodConsumed * foodPrice;
    const farmProfit = farmRevenue - t.farms * C.BUILDINGS.farm.jobs * E.food.farmWage - t.farms * C.BUILDINGS.farm.upkeep;

    // --- HEALTHCARE: monopoly (Consumption if private, Government if public) -
    const healthD0 = pop * E.health.perCapita;
    const healthRegulated = state.policies.publicHealth;
    const healthPrice = healthRegulated ? E.health.publicOptionPrice : E.health.refPrice * E.health.monopolyMarkup;
    const healthQd = qd(healthD0, healthPrice, E.health.refPrice, E.health.elasticity);
    const healthServed = Math.min(healthCap, healthQd);
    const healthAccess = healthD0 <= 0 ? 1 : clamp(healthServed / healthD0, 0, 1);
    const healthCompQ = Math.min(healthCap, qd(healthD0, E.health.marginalCost, E.health.refPrice, E.health.elasticity));
    const healthDWL = healthRegulated ? 0 : Math.max(0, healthCompQ - healthServed);
    const healthRevenue = healthServed * healthPrice;
    const healthSubsidy = healthRegulated ? Math.max(0, (E.health.marginalCost - healthPrice) * healthServed) : 0;

    // --- RETAIL goods: elastic luxury (Consumption) ------------------------
    const goodsD0 = pop * E.goods.perCapita;
    const goodsPrice = clearingPrice(retailOut, goodsD0, E.goods.refPrice, E.goods.elasticity);
    const goodsSold = Math.min(retailOut, qd(goodsD0, goodsPrice, E.goods.refPrice, E.goods.elasticity));

    // --- LABOR -------------------------------------------------------------
    const laborForce = Math.round(pop * E.laborForceShare);
    const jobs = t.jobs;
    const employed = Math.min(laborForce, jobs);
    const unemployment = laborForce <= 0 ? 0 : clamp((laborForce - employed) / laborForce, 0, 1);
    const activity = jobs <= 0 ? 1 : clamp(0.5 + 0.5 * (employed / jobs), 0, 1);

    // ======================================================================
    // INTERNATIONAL TRADE: automatic surplus + negotiated deals + tariffs
    // ======================================================================
    const tradeUnlocked = t.tradeUnlocked;
    let exportValue = 0, importValue = 0, tradeMoney = 0, tariffRevenue = 0;
    const resDelta = { wood: 0, oil: 0, gas: 0 };
    const stalled = [];

    // Auto-balance food/goods surpluses & shortages through trade capacity.
    let capLeft = tradeUnlocked ? t.tradeCapacity : 0;
    function autoBalance(supply, demand, unitVal) {
      let inc = 0, cost = 0;
      if (supply > demand && capLeft > 0) {
        const x = Math.min(supply - demand, capLeft); capLeft -= x;
        inc = x * E.trade.exportMargin; exportValue += x * unitVal;
      } else if (supply < demand && capLeft > 0) {
        const m = Math.min(demand - supply, capLeft); capLeft -= m;
        cost = m * E.trade.importPrice; importValue += m * unitVal;
      }
      return inc - cost;
    }
    let autoTradeMoney = 0;
    autoTradeMoney += autoBalance(foodOut, foodD0, E.food.refPrice);
    autoTradeMoney += autoBalance(retailOut, goodsD0, E.goods.refPrice);

    // Negotiated recurring deals (only run if trade is unlocked).
    if (tradeUnlocked && state.trade && state.trade.deals) {
      for (const deal of state.trade.deals) {
        const give = deal.give, get = deal.get;
        const tariff = (state.tariffs && state.tariffs[deal.country]) || 0;
        // Can we honour our side this month?
        const haveGive = give.item === "money" ? state.treasury : (state.resources[give.item] || 0);
        if (haveGive < give.amount - 1e-6) { stalled.push(deal); continue; }
        // our side (give)
        if (give.item === "money") tradeMoney -= give.amount;
        else { resDelta[give.item] -= give.amount; exportValue += give.amount * W.basePrice(give.item); }
        // their side (get)
        if (get.item === "money") tradeMoney += get.amount;
        else {
          resDelta[get.item] += get.amount;
          const iv = get.amount * W.basePrice(get.item);
          importValue += iv;
          const tar = iv * tariff;                  // tariff revenue on imports
          tariffRevenue += tar; tradeMoney -= tar;  // importers pay it to the treasury
        }
      }
    }
    const tourismIncome = t.airCapacity > 0 ? t.airCapacity * E.trade.airTourism * (state.happiness / 100) : 0;
    const Xn = exportValue - importValue;
    const tradeTreasury = autoTradeMoney + tradeMoney + tariffRevenue + tourismIncome;

    // ======================================================================
    // GDP = C + I + G + Xn
    // ======================================================================
    const Cexp = farmRevenue + goodsSold * goodsPrice + (healthRegulated ? 0 : healthRevenue);
    const Iexp = (t.gdpI * productivity) * activity + industrialOut * 0.6;
    const Gexp = (t.gdpG * productivity) + (healthRegulated ? healthRevenue : 0) + healthSubsidy;
    const gdp = Math.max(0, Cexp + Iexp + Gexp + Xn);

    const priceIndex = (foodPrice / E.food.refPrice) * 0.45
                     + (healthPrice / E.health.refPrice) * 0.25
                     + (goodsPrice / E.goods.refPrice) * 0.30;
    const inflation = state.lastPriceIndex ? (priceIndex - state.lastPriceIndex) / state.lastPriceIndex : 0;

    // --- HOUSING -----------------------------------------------------------
    const housing = t.housing;
    const housingRatio = housing <= 0 ? 0 : clamp(housing >= pop ? 1 : housing / Math.max(1, pop), 0, 1);
    const housingFree = Math.max(0, housing - pop);

    // ======================================================================
    // TAXES (player-adjustable)
    // ======================================================================
    const taxRate = state.policies.tax.rate;
    const progressive = state.policies.tax.mode === "progressive";
    const taxBase = Cexp + Iexp + Math.max(0, Xn);
    const taxRevenue = taxBase * taxRate;
    let taxPenalty = taxRate * 26;                    // happiness cost of taxation
    if (progressive) taxPenalty *= 0.6;               // fairer ⇒ less resentment

    // ======================================================================
    // HAPPINESS
    // ======================================================================
    const amenityRatio = pop <= 0 ? 1 : clamp(t.amenity / pop, 0, 1);
    const employmentScore = laborForce <= 0 ? 1 : (1 - unemployment);
    const priceStability = clamp(1 - Math.abs(inflation) * 4, 0, 1);
    let happiness = 100 * (
      foodAccess * 0.23 + healthAccess * 0.17 + housingRatio * 0.15 +
      employmentScore * 0.16 + amenityRatio * 0.09 + priceStability * 0.08 +
      hcUtil * HC.happinessBonus
    ) - taxPenalty;
    if (pop < 12) happiness = Math.max(happiness, 62);
    happiness = clamp(happiness, 0, 100);

    // --- IMMIGRATION -------------------------------------------------------
    let popChange = 0;
    if (happiness >= 55 && housingFree > 0) {
      popChange = Math.min(housingFree, Math.ceil((2 + pop * 0.04) * ((happiness - 55) / 45)));
    } else if (happiness < 38 && pop > 0) {
      popChange = -Math.ceil((1 + pop * 0.03) * ((38 - happiness) / 38));
    }

    // --- TREASURY ----------------------------------------------------------
    const netTreasury = taxRevenue + tradeTreasury - t.upkeep - healthSubsidy;

    return {
      tally: t, productivity, humanCapital: t.humanCapital, hcUtil,
      resources: { production: t.produce, delta: resDelta, stalled },
      food: { price: foodPrice, supply: foodOut, demand: foodD0, sold: foodConsumed, access: foodAccess, farmProfit },
      health: { price: healthPrice, served: healthServed, demand: healthD0, access: healthAccess,
                regulated: healthRegulated, dwl: healthDWL, subsidy: healthSubsidy },
      goods: { price: goodsPrice, supply: retailOut, sold: goodsSold, demand: goodsD0 },
      gdpParts: { C: Cexp, I: Iexp, G: Gexp, X: Xn }, gdp,
      trade: { unlocked: tradeUnlocked, capacity: t.tradeCapacity, exportValue, importValue,
               tourismIncome, tariffRevenue, net: tradeTreasury, Xn },
      labor: { force: laborForce, jobs, employed, unemployment },
      tax: { rate: taxRate, mode: state.policies.tax.mode, revenue: taxRevenue, penalty: taxPenalty },
      priceIndex, inflation, housing, housingFree, housingRatio,
      happiness, popChange,
      treasury: { tax: taxRevenue, upkeep: t.upkeep, subsidy: healthSubsidy, trade: tradeTreasury, net: netTreasury },
      lovePerTick: t.lovePerTick,
    };
  }

  return { tick, tallyBuildings };
})();
