/* ============================================================================
 * OMANDISTAN — world.js
 * The other countries and international-trade logic. A country only accepts a
 * deal if it expands THEIR production possibilities (they gain from trade):
 * they value what they lack and discount what they already have in plenty.
 * Exposes a global `World` object.
 * ==========================================================================*/
window.World = (function () {
  "use strict";
  const C = window.CONFIG;

  // Base market prices (in $) for everything that can be traded.
  function basePrice(item) {
    if (item === "money") return 1;
    if (item === "food") return C.ECON.food.refPrice;
    if (item === "tech") return 60;
    return (C.RESOURCES[item] && C.RESOURCES[item].price) || 10;
  }

  // How abundant a country is in an item (1 = scarce .. 9 = overflowing).
  function endowmentOf(country, item) {
    if (item === "money") return 5;
    if (country.endow[item] != null) return country.endow[item];
    if (country.specialty === item) return 9;          // food/tech specialty
    if (country.wants.includes(item)) return 1;
    return 3;
  }

  // What ONE unit of an item is worth TO a country (its private valuation).
  // Scarce or wanted items are worth more than the market price; abundant ones less.
  function valueTo(country, item) {
    if (item === "money") return 1;
    const e = endowmentOf(country, item);
    let mult = clamp(1.5 - (e - 1) * 0.12, 0.5, 1.7);
    if (country.wants.includes(item)) mult += 0.4;
    return basePrice(item) * mult;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Evaluate a proposed deal from the PLAYER's perspective.
  //   give = { item, amount }  (player gives this to the country)
  //   get  = { item, amount }  (player receives this from the country)
  // The country RECEIVES `give` and GIVES `get`.
  function evaluateDeal(countryKey, give, get, tariffRate) {
    const country = C.COUNTRIES[countryKey];
    const theyReceive = valueTo(country, give.item) * give.amount;
    const theyGive = valueTo(country, get.item) * get.amount;
    const gainToThem = theyReceive - theyGive;        // >0 ⇒ expands their PPC

    // A tariff the player charges on imports makes us a less attractive partner.
    const relationsPenalty = (tariffRate || 0) * 0.5; // up to ~half their goodwill
    const threshold = theyGive * (0.02 + relationsPenalty);

    // A country cannot give away an item it is itself desperately short of.
    const cannotSupply = endowmentOf(country, get.item) <= 1 && get.item !== "money";

    let accept = gainToThem > threshold && !cannotSupply;
    let reason;
    if (cannotSupply) {
      reason = `${country.name} has almost no ${label(get.item)} to spare.`;
    } else if (accept) {
      reason = `This deal expands ${country.name}'s PPC — they gladly accept! 🤝`;
    } else if (gainToThem <= 0) {
      reason = `${country.name} would give up more than they gain. They decline.`;
    } else {
      reason = `Your tariffs sour relations; ${country.name} declines for now.`;
    }
    return {
      accept, gainToThem, theyReceive, theyGive, cannotSupply,
      // a "fair" amount of `get` that would make them just barely accept
      fairGet: theyReceive / Math.max(0.01, valueTo(country, get.item)),
      reason,
    };
  }

  // Player's own valuation of an item (mirror logic) so the UI can show whether
  // a deal is good for Omandistan too.
  function valueToPlayer(state, item) {
    if (item === "money") return 1;
    const have = item === "food" ? 5 : item === "tech" ? 3 : (state.resources[item] || 0);
    // scarcer at home ⇒ we value it more
    let mult = clamp(1.6 - have * 0.02, 0.7, 1.7);
    return basePrice(item) * mult;
  }

  function label(item) {
    if (item === "money") return "money";
    if (item === "food") return "food";
    if (item === "tech") return "tech goods";
    return (C.RESOURCES[item] && C.RESOURCES[item].name) || item;
  }

  // When a beneficial deal is active, both partners' PPC drifts upward a touch
  // (gains from trade). Returns the small PPC gain for the country.
  function tradeGrowth(gainToThem) {
    return clamp(gainToThem * 0.002, 0, 0.15);
  }

  return { valueTo, valueToPlayer, evaluateDeal, basePrice, endowmentOf, tradeGrowth, label };
})();
