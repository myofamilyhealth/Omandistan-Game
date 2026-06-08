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

  // Monthly resource consumption (operating inputs) — creates real demand for
  // wood/oil/gas so "whatever is in demand should be produced/built".
  const CONSUME = {
    house: { wood: 0.02 }, grocery: { wood: 0.02 }, clothing: { wood: 0.02 },
    restaurant: { gas: 0.25 }, factory: { oil: 0.5, wood: 0.05 }, tech: { oil: 0.25, gas: 0.1 },
    hospital: { gas: 0.3 }, university: { gas: 0.2 }, airport: { oil: 0.4 },
    cinema: { gas: 0.1 }, stadium: { gas: 0.15 }, themepark: { gas: 0.25, oil: 0.1 },
  };
  // Electricity used per building (besides per-capita demand from homes).
  const POWER_USE = {
    factory: 7, tech: 5, hospital: 4, university: 3, airport: 6, bank: 2,
    grocery: 2, clothing: 2, restaurant: 2, cinema: 2, stadium: 3, themepark: 5,
    lumber: 2, oilrig: 3, gasmine: 3, waterplant: 3,
  };
  // Water used per building (besides per-capita demand).
  const WATER_USE = {
    farm: 4, restaurant: 1.5, hospital: 2, university: 1.5, themepark: 3, stadium: 2,
    park: 1, grocery: 0.5, clothing: 0.5, powerplant: 1.5, nuclear: 3,
  };

  function tallyBuildings(state) {
    const t = {
      housing: 0, foodOutput: 0, retailOutput: 0, healthCapacity: 0, industrialOutput: 0,
      jobs: 0, amenity: 0, utility: 0, lovePerTick: 0, upkeep: 0, humanCapital: 0,
      tradeCapacity: 0, airCapacity: 0, gdpI: 0, gdpG: 0, gdpC: 0,
      pollution: 0, green: 0, fearUnrest: 0,
      powerCap: 0, waterCap: 0, gridBonus: 0, powerUse: 0, waterUse: 0,
      produce: { wood: 0, oil: 0, gas: 0 }, consume: { wood: 0, oil: 0, gas: 0 },
      farms: 0, tradeUnlocked: false, counts: {},
    };
    const U = C.UPGRADE;
    for (const b of state.buildings) {
      const def = C.BUILDINGS[b.type];
      if (!def) continue;
      const lv = b.level || 1;
      const m = U.outMult[lv - 1], jm = U.jobMult[lv - 1];   // level multipliers
      t.counts[b.type] = (t.counts[b.type] || 0) + 1;
      t.housing += (def.housing || 0) * m;
      t.foodOutput += (def.foodOutput || 0) * m;
      t.retailOutput += (def.goodsOutput || 0) * m;          // grocery/clothing/restaurant
      t.industrialOutput += (def.industrialOutput || 0) * m; // factory/tech
      t.healthCapacity += (def.healthCapacity || 0) * m;
      t.jobs += (def.jobs || 0) * jm;
      t.amenity += (def.amenity || 0) * m;
      t.utility += (def.utility || 0) * m;
      t.pollution += (def.pollution || 0) * m;
      t.green += (def.green || 0) * m;
      t.fearUnrest += (def.unrest || 0) * m;
      t.powerCap += (def.powerCapacity || 0) * m;
      t.waterCap += (def.waterCapacity || 0) * m;
      t.gridBonus += (def.gridBonus || 0) * m;
      if (POWER_USE[b.type]) t.powerUse += POWER_USE[b.type] * m;
      if (WATER_USE[b.type]) t.waterUse += WATER_USE[b.type] * m;
      t.lovePerTick += (def.lovePerTick || 0) * m;
      t.upkeep += (def.upkeep || 0) * (1 + (lv - 1) * 0.5);  // bigger buildings cost more
      t.humanCapital += (def.humanCapital || 0) * m;
      t.tradeCapacity += (def.tradeCapacity || 0) * m;
      if (def.tourism) t.airCapacity += (def.tradeCapacity || 0) * m;
      if (def.unlocksTrade) t.tradeUnlocked = true;
      if (def.gdpc === "I") t.gdpI += (def.gdpVal || 0) * m;
      if (def.gdpc === "G" && b.type !== "hospital") t.gdpG += (def.gdpVal || 0) * m;
      if (def.produces) for (const r in def.produces) t.produce[r] += def.produces[r] * m;
      if (CONSUME[b.type]) for (const r in CONSUME[b.type]) t.consume[r] += CONSUME[b.type][r] * m;
      if (b.type === "farm") t.farms++;
    }
    return t;
  }

  function tick(state) {
    const E = C.ECON;
    const D = state.diff || { income: 1, upkeep: 1, pollution: 1, immigration: 1 };  // difficulty
    const pop = state.population;
    const t = tallyBuildings(state);

    // --- Human capital -> productivity (PPC shift) -------------------------
    const HC = E.humanCapital;
    const hcPerCapita = pop <= 0 ? 0 : t.humanCapital / pop;
    const hcUtil = clamp(hcPerCapita / HC.perCapitaForFullBonus, 0, 1);
    const productivity = 1 + HC.maxOutputBonus * hcUtil;

    // --- UTILITIES: water & power (brownouts cut production) ---------------
    const UT = E.utilities;
    const powerDemand = pop * UT.perCapitaPower + t.powerUse;
    const powerSupply = UT.powerBase + t.powerCap + t.gridBonus;
    const powerCoverage = powerDemand <= 0.01 ? 1 : clamp(powerSupply / powerDemand, 0, 1);
    const waterDemand = pop * UT.perCapitaWater + t.waterUse;
    const waterSupply = UT.waterBase + t.waterCap;
    const waterCoverage = waterDemand <= 0.01 ? 1 : clamp(waterSupply / waterDemand, 0, 1);
    const infraFactor = 0.55 + 0.45 * powerCoverage;       // no power ⇒ 55% production

    const foodOut = t.foodOutput * productivity * infraFactor;
    const retailOut = t.retailOutput * productivity * infraFactor;
    const healthCap = t.healthCapacity * productivity * infraFactor;
    const industrialOut = t.industrialOutput * productivity * infraFactor;

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
    const entertainmentC = t.utility * 2.4 * productivity * activity;   // cinemas/stadiums/parks spending
    const Cexp = farmRevenue + goodsSold * goodsPrice + (healthRegulated ? 0 : healthRevenue) + entertainmentC;
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
    // Pent-up housing demand: how many newcomers WANT to move in right now.
    const wantToJoin = (pop > 0 || housing > 0)
      ? Math.max(0, Math.ceil((2 + pop * 0.05) * ((Math.max(50, state.happiness) - 50) / 50))) : 0;
    const housingDemand = pop + wantToJoin;

    // ======================================================================
    // POLLUTION — industry dirties the air; parks/green clean it
    // ======================================================================
    const P = E.pollution;
    const pollutionGross = t.pollution;
    const pollution = Math.max(0, pollutionGross - t.green * (P.greenPower / 5));
    const pollutionPerCapita = pop <= 0 ? 0 : pollution / pop;
    const pollutionPenalty = clamp(pollutionPerCapita * 10 * P.happinessScale * D.pollution, 0, P.perCapitaCap);
    const cleanupCost = pollution * P.cleanupCost * D.pollution;   // costs the treasury to manage

    // ======================================================================
    // TAXES — the Omands act as the FED (countercyclical) unless on manual
    // ======================================================================
    // Economic "heat": >0 booming/overheating, <0 slump. Low unemployment and
    // rising prices = boom (raise taxes); high unemployment = slump (cut taxes).
    const NU = 0.05;                                        // natural rate of unemployment
    let heat = 0;
    if (pop >= 20) heat = clamp((NU - unemployment) * 6 + inflation * 4 + (state.happiness - 72) / 45, -1, 1);
    const autoTarget = clamp(E.taxBase + heat * 0.12, 0.04, 0.32);
    const fedStance = heat > 0.2 ? "Contractionary" : heat < -0.2 ? "Expansionary" : "Neutral";

    const taxRate = state.policies.tax.rate;
    const progressive = state.policies.tax.mode === "progressive";
    const taxBaseAmt = Cexp + Iexp + Math.max(0, Xn);
    const taxRevenue = taxBaseAmt * taxRate;
    let taxPenalty = taxRate * 30;                          // happiness cost of taxation
    if (progressive) taxPenalty *= 0.62;

    // ======================================================================
    // HAPPINESS  (+ utility buildings, − pollution, − taxes)
    // ======================================================================
    const amenityRatio = pop <= 0 ? 1 : clamp((t.amenity + t.utility * 0.8) / pop, 0, 1);
    const employmentScore = laborForce <= 0 ? 1 : (1 - unemployment);
    const priceStability = clamp(1 - Math.abs(inflation) * 4, 0, 1);
    const waterPenalty = (1 - waterCoverage) * UT.shortHappiness;
    const powerPenalty = (1 - powerCoverage) * UT.shortHappiness * 0.8;
    let happiness = 100 * (
      foodAccess * 0.20 + healthAccess * 0.15 + housingRatio * 0.13 +
      employmentScore * 0.14 + amenityRatio * 0.12 + priceStability * 0.07 +
      waterCoverage * 0.05 + powerCoverage * 0.04 +
      hcUtil * HC.happinessBonus
    ) - taxPenalty - pollutionPenalty - waterPenalty - powerPenalty;
    if (pop < 12) happiness = Math.max(happiness, 60);
    happiness = clamp(happiness, 0, 100);

    // ======================================================================
    // UNREST — citizens get angry at pollution, high taxes, joblessness,
    // shortages. High unrest → protests (handled in game loop).
    // ======================================================================
    const unrest = clamp(
      (1 - foodAccess) * 32 + (1 - healthAccess) * 22 +
      unemployment * 38 + pollutionPenalty * 1.4 +
      (1 - waterCoverage) * 20 + (1 - powerCoverage) * 15 + t.fearUnrest +
      Math.max(0, taxRate - 0.18) * 200 +
      Math.max(0, 50 - happiness) * 0.5, 0, 100);

    // --- IMMIGRATION (only fills real demand; empty homes stay empty) ------
    let popChange = 0;
    if (happiness >= 55 && housingFree > 0) {
      popChange = Math.min(housingFree, Math.max(1, Math.round(wantToJoin * D.immigration)));
    } else if (happiness < 38 && pop > 0) {
      popChange = -Math.ceil((1 + pop * 0.03) * ((38 - happiness) / 38));
    }

    // ======================================================================
    // DEMAND BARS — supply vs. demand for what citizens want & resources
    // ======================================================================
    function bar(key, icon, label, supply, demand) {
      const ratio = demand <= 0.01 ? (supply > 0 ? 2 : 1) : supply / demand;
      const status = ratio < 0.9 ? "short" : ratio > 1.35 ? "surplus" : "ok";
      return { key, icon, label, supply, demand, ratio, status };
    }
    const demand = [
      bar("housing", "🏠", "Housing", housing, housingDemand),
      bar("food", "🌾", "Food", foodOut, foodD0),
      bar("goods", "🛒", "Goods", retailOut, goodsD0),
      bar("health", "🏥", "Healthcare", healthCap, healthD0),
      bar("water", "💧", "Water", waterSupply, waterDemand),
      bar("power", "⚡", "Power", powerSupply, powerDemand),
      bar("fun", "🎢", "Fun/Utility", t.utility, pop * 0.25),
      bar("wood", "🪵", "Wood", t.produce.wood, t.consume.wood),
      bar("oil", "🛢️", "Oil", t.produce.oil, t.consume.oil),
      bar("gas", "🔥", "Gas", t.produce.gas, t.consume.gas),
    ];

    // --- TREASURY (difficulty: income & upkeep multipliers, cleanup) -------
    const upkeep = t.upkeep * D.upkeep;
    const netTreasury = (taxRevenue + tradeTreasury) * D.income - upkeep - healthSubsidy - cleanupCost;

    // resources net (production − consumption) folded into the delta for game.js
    const resNet = {
      wood: resDelta.wood + t.produce.wood - t.consume.wood,
      oil: resDelta.oil + t.produce.oil - t.consume.oil,
      gas: resDelta.gas + t.produce.gas - t.consume.gas,
    };

    return {
      tally: t, productivity, humanCapital: t.humanCapital, hcUtil,
      resources: { production: t.produce, consumption: t.consume, delta: resDelta, net: resNet, stalled },
      food: { price: foodPrice, supply: foodOut, demand: foodD0, sold: foodConsumed, access: foodAccess, farmProfit },
      health: { price: healthPrice, served: healthServed, demand: healthD0, access: healthAccess,
                regulated: healthRegulated, dwl: healthDWL, subsidy: healthSubsidy },
      goods: { price: goodsPrice, supply: retailOut, sold: goodsSold, demand: goodsD0 },
      gdpParts: { C: Cexp, I: Iexp, G: Gexp, X: Xn }, gdp,
      trade: { unlocked: tradeUnlocked, capacity: t.tradeCapacity, exportValue, importValue,
               tourismIncome, tariffRevenue, net: tradeTreasury, Xn },
      labor: { force: laborForce, jobs, employed, unemployment },
      tax: { rate: taxRate, mode: state.policies.tax.mode, revenue: taxRevenue, penalty: taxPenalty,
             auto: !!state.policies.tax.auto, autoTarget, heat, stance: fedStance },
      pollution: { level: pollution, gross: pollutionGross, perCapita: pollutionPerCapita, penalty: pollutionPenalty, cleanup: cleanupCost },
      utilities: { powerSupply, powerDemand, powerCoverage, waterSupply, waterDemand, waterCoverage, infraFactor },
      unrest, utility: t.utility, demand,
      priceIndex, inflation, housing, housingFree, housingRatio, housingDemand, wantToJoin,
      happiness, popChange,
      treasury: { tax: taxRevenue * D.income, upkeep: upkeep, subsidy: healthSubsidy, cleanup: cleanupCost, trade: tradeTreasury * D.income, net: netTreasury },
      lovePerTick: t.lovePerTick,
    };
  }

  return { tick, tallyBuildings };
})();
