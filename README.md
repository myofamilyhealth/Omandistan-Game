# 👑 Omandistan — Build a Utopia

A browser-based, isometric city-builder economics game for **AP Macro & Micro Economics**.
You are a builder serving **Mr. & Mrs. Omand** — the king and queen (the "government") who
approve every action. Grow Omandistan into a thriving
utopia by setting good policy. The happier your country, the more people immigrate to it.

## ▶️ How to play

No installation, no build step. Just open the game:

- **Locally:** open `index.html` in any modern browser (Chrome, Edge, Firefox, Safari).
- **Share with the class:** push to GitHub and enable **GitHub Pages** (Settings → Pages →
  deploy from branch). Everyone plays from the link.

### Controls
| Action | How |
| --- | --- |
| Build | Click a tool in the left panel, then click a tile |
| Pan the map | Click-drag, or arrow keys |
| Play / pause | Speed buttons (top-right) or **Space** |
| Bulldoze | Bulldoze tool, then click a building (free) |
| Cancel a tool | **Esc** |

**Start by building Housing 🏠** — settlers only arrive if there are homes for them.
A step-by-step **tutorial** opens automatically the first time (reopen it any time with the
**❓ How to Play** button).

### Buildings
🛣️ Road · 🏠 Housing · 🌾 Farm (perfect competition) · 🛒 Grocery · 👕 Clothing · 🍔 Restaurant ·
💻 Tech Park · 🏭 Factory · 🏦 Bank · 🪓 Lumber Camp · 🛢️ Oil Derrick · ⛏️ Gas Mine ·
🏥 Hospital (monopoly) · 🏫 School & 🎓 University (human capital) · 🚢 Seaport & ✈️ Airport
(global trade) · 💞 Kindness Center · 🌳 Park. The Omands live in the 🏰 **castle offshore**.
See the **v3** section below for resources, land-buying, the world map and trade.

## 💞 The Omand approval system

Every building (except roads, which are pre-approved infrastructure) requires **1 Spreading
Love token** for Mr. & Mrs. Omand to approve it. You earn love tokens by:

- Building **Kindness Centers 💞** (they generate tokens over time), and
- **Helping struggling civilizations** — random events ask you to send aid to neighbours.
  Saying yes costs money but earns love tokens and national happiness.

If you run out of tokens, you must do acts of kindness before you can build again.

## 📚 AP Econ concepts built into the simulation

This game is designed around College Board AP Econ core models. The economics genuinely drive
the simulation — they are not cosmetic.

### Microeconomics
| Concept | Where it lives in the game |
| --- | --- |
| **Perfect competition** | 🌾 **Farms** sell identical food and are **price-takers**. The market price is set by supply & demand; positive economic profit signals entry, and the game notes profit tends toward **zero in the long run**. |
| **Monopoly** | 🏥 **Healthcare** is a single-provider market. The monopolist charges a **markup** (≈3× the competitive price), serves **fewer people**, and creates **deadweight loss** (citizens priced out). |
| **Price elasticity of demand** | Demand uses `Qd = D0 · (P / Pᵣₑf)^elasticity`. **Food & healthcare are necessities → inelastic** (quantity barely moves with price). **Consumer goods are a luxury → elastic** (sales swing a lot). |
| **Government regulation** | The Omands can decree a **Public Option** for healthcare — price drops near marginal cost, access rises to ~100%, but the **treasury subsidizes** the difference. A clean monopoly-vs-regulation comparison. |
| **Supply & demand equilibrium** | Markets clear each month at the price where quantity supplied meets quantity demanded. |
| **Human capital & the PPC** | 🏫 Schools and 🎓 universities raise **human capital**, which increases **productivity** — the same farms and factories produce *more*. This is an outward shift of the **production possibilities curve**, shown live as a "PPC ×" multiplier. |
| **Gains from trade** | 🚢 Seaports and ✈️ airports open **international trade**: you **export** surplus for profit and **import** to relieve shortages (raising access). Airports add **tourism** income that scales with happiness. |

### Macroeconomics
| Concept | Where it lives in the game |
| --- | --- |
| **GDP (expenditure approach)** | **GDP = C + I + G + Xn** — Consumption (shops/food), Investment (factories/tech/banks/resources), Government (schools/hospitals/parks), and Net Exports (trade). Shown as a live breakdown. |
| **Unemployment** | Labor force (≈62% of population) vs. jobs created by buildings. |
| **Inflation** | Month-over-month change in a weighted **price index**. |
| **Taxation & fiscal policy** | The Omands collect a share of GDP as tax; upkeep and subsidies are spending. |
| **Immigration / growth** | Population grows when **happiness is high and housing is available**, and shrinks when conditions are poor. |

## 🛠️ Tuning it for your class

All economic parameters (reference prices, elasticities, the monopoly markup, tax rate,
building costs, etc.) live in **`js/config.js`** with comments. Change a number, refresh the
page, and the whole simulation responds — handy for demonstrating, e.g., "what happens to
healthcare access if we lower the monopoly markup?"

## 📁 Project structure
```
index.html        # layout + HUD
css/style.css     # royal / utopia theme
js/config.js      # all tunable parameters, buildings, resources, countries, tax presets
js/world.js       # the other countries + PPC-based trade evaluation
js/economy.js     # the AP Econ simulation (GDP=C+I+G+Xn, the heart of the game)
js/render.js      # isometric 2.5D renderer (procedural, cars, districts, no image assets)
js/game.js        # state, input, Omand approval, land buying, world map, tax, events, UI
```

## 🗺️ Roadmap ideas (not yet built)
- Supply/demand and elasticity **graphs** you can pop open per market
- More industries (banking, energy) and externalities (pollution → Pigovian taxes)
- A formal **Royal Palace** screen for policy (tax sliders, minimum wage, price ceilings/floors)
- Save/load, win condition (reach a target population & happiness = "Utopia achieved")

---
Built for an AP Economics class project. Have fun, and long live Omandistan! 👑

---

## 🌍 v3 — Roads, Resources, the World & Trade

A big update layered on top of the core sim:

- **Cars on the roads.** Traffic drives along your road network. **Every building must
  touch a road**, so plan your grid (roads are pre-approved — no love token needed).
- **Buy land / expand your island.** You start owning one **district**. Use the **🏞️ Buy Land**
  tool to purchase adjacent areas (money + 1 love token) and grow your territory. The sea
  around you is large — other nations lie across the water.
- **Resources: 🪵 Wood, 🛢️ Oil, 🔥 Gas.** Buildings now cost resources as well as money, so you
  must build **Lumber Camps 🪓, Oil Derricks 🛢️ and Gas Mines ⛏️** to keep constructing.
- **Real business sectors → GDP components.** Instead of one "market," you build **Grocery 🛒,
  Clothing 👕, Restaurant 🍔** (→ **Consumption, C**), **Tech Park 💻, Factory 🏭, Bank 🏦**
  (→ **Investment, I**), public services (→ **Government, G**), and **Seaports/Airports**
  (→ **Net Exports, Xn**). The panel shows **GDP = C + I + G + Xn** live.
- **The wider world.** Open the **🌍 World Map** to fast-travel to four prebuilt economies, each
  with a specialty:
  - **Elliott Emperace 🛢️** — oil
  - **Wardmania 🌲** — wood
  - **Cindara 🔥** — gas
  - **Technova 💡** — technology (resource-poor but rich)
- **PPC-based trade.** Build a **Seaport** to unlock trade, then propose recurring deals. A
  country **only accepts a deal that expands its own PPC** — it values what it lacks and
  discounts what it has in plenty (comparative advantage & gains from trade in action).
- **Tariffs.** Set an import tariff per country: it earns you revenue but sours relations, so
  high tariffs make partners refuse deals.
- **Adjustable tax system.** Open **🏛️ Tax System** to choose low/flat/progressive/high taxes.
  Higher rates fund more Government spending but lower happiness; **progressive** taxes feel
  fairer, so they cost less happiness than a flat tax at the same rate.
- **Minimap.** A live 🗺️ minimap (bottom-right) shows owned vs. unowned land and your buildings;
  click it to recenter the camera.
