import { resolveSquireAi, selectMonsterMove } from "./ai.js";
import { canTargetFrom, getCombinedDefense, heroesAreAdjacent, resolveAttack } from "./combat.js";
import { DIE_STATS, rerollLowestDie, rollPartyDice } from "./dice.js";
import { createHero, getLevelForRound, HERO_IDS } from "./entities.js";
import { areAdjacent, findPath, hexDistance, reachableCells } from "./hexGrid.js";
import { getItemById, isInventoryFull, ITEM_TYPES } from "./items.js";
import { generateRound } from "./roundGenerator.js";

export const PHASES = {
  SETUP: "setup",
  COMMAND: "command",
  MOVE: "move",
  ATTACK: "attack",
  ROUND_COMPLETE: "roundComplete",
  VICTORY: "victory",
  DEFEAT: "defeat",
};

const STAT_LABELS = {
  mobility: "movilidad",
  attack: "ataque",
  defense: "defensa",
  maxVitality: "vitalidad maxima",
};

function createStatBag(value = 0) {
  return {
    mobility: value,
    attack: value,
    defense: value,
  };
}

function createEffects(nextD8 = {}) {
  return {
    turnBonuses: {
      paladin: createStatBag(),
      squire: createStatBag(),
    },
    mobilityPenalty: {
      paladin: 0,
      squire: 0,
    },
    forcedSquireDisobey: false,
    nextD8: { ...nextD8 },
  };
}

function pushLog(state, message) {
  state.log = [message, ...(state.log ?? [])].slice(0, 80);
}

export function getPhaseLabel(phase) {
  return {
    [PHASES.SETUP]: "Preparacion",
    [PHASES.COMMAND]: "Orden al Escudero",
    [PHASES.MOVE]: "Movimiento del Paladin",
    [PHASES.ATTACK]: "Ataque humano",
    [PHASES.ROUND_COMPLETE]: "Progresion",
    [PHASES.VICTORY]: "Victoria",
    [PHASES.DEFEAT]: "Derrota",
  }[phase] ?? phase;
}

export function createNewGame(options = {}) {
  const state = {
    version: 1,
    round: 1,
    level: 1,
    phase: PHASES.COMMAND,
    settings: {
      cursedChests: Boolean(options.cursedChests),
      paladinAvatar: options.paladinAvatar || "macho",
      squireAvatar: options.squireAvatar || "macho",
    },
    heroes: {
      paladin: createHero(HERO_IDS.PALADIN, options.paladinAvatar || "macho"),
      squire: createHero(HERO_IDS.SQUIRE, options.squireAvatar || "macho"),
    },
    board: null,
    monsters: [],
    chests: [],
    dice: null,
    available: {
      paladin: createStatBag(),
      squire: createStatBag(),
    },
    effects: createEffects(),
    command: {
      type: "follow",
      monsterId: null,
    },
    pendingUpgrades: [],
    log: [],
  };

  setupRound(state, options.rng);
  rollForTurn(state, options.rng);
  pushLog(state, "La puerta de la Hexacumba se cierra a tus espaldas.");
  return state;
}

export function cloneState(state) {
  return structuredClone(state);
}

export function setupRound(state, rng = Math.random) {
  state.level = getLevelForRound(state.round);
  const round = generateRound(state.round, state.heroes, {
    cursedChests: state.settings.cursedChests,
    rng,
  });

  state.board = round.board;
  state.heroes = round.heroes;
  state.chests = round.chests;
  state.monsters = round.monsters;
  state.command = { type: "follow", monsterId: null };
  state.pendingUpgrades = [];
  state.phase = PHASES.COMMAND;

  pushLog(
    state,
    `Ronda ${state.round}: nivel ${round.config.level}, ${round.config.monsters} monstruos, ${round.config.chests} cofres.`,
  );
}

export function computeAvailable(state) {
  const available = {};

  for (const heroId of Object.values(HERO_IDS)) {
    const hero = state.heroes[heroId];
    const heroDice = state.dice?.[heroId] ?? createStatBag();
    const bonuses = state.effects.turnBonuses[heroId] ?? createStatBag();
    const mobilityPenalty = state.effects.mobilityPenalty[heroId] ?? 0;

    available[heroId] = {
      mobility: Math.max(
        0,
        hero.stats.mobility + heroDice.mobility + bonuses.mobility - mobilityPenalty,
      ),
      attack: Math.max(0, hero.stats.attack + heroDice.attack + bonuses.attack),
      defense: Math.max(0, hero.stats.defense + heroDice.defense + bonuses.defense),
    };
  }

  state.available = available;
  return available;
}

export function rollForTurn(state, rng = Math.random) {
  const nextD8 = state.effects?.nextD8 ?? {};
  state.effects = createEffects();
  state.dice = rollPartyDice(nextD8, rng);
  computeAvailable(state);
  pushLog(state, "Dados listos para el nuevo turno.");
}

export function getOccupiedKeys(state, options = {}) {
  const {
    ignoreHeroId = null,
    ignoreMonsterId = null,
    includeHeroes = true,
    includeMonsters = true,
  } = options;
  const occupied = new Set();

  if (includeHeroes) {
    for (const hero of Object.values(state.heroes)) {
      if (hero.id !== ignoreHeroId && hero.position) occupied.add(hero.position);
    }
  }

  if (includeMonsters) {
    for (const monster of state.monsters) {
      if (monster.id !== ignoreMonsterId) occupied.add(monster.position);
    }
  }

  return occupied;
}

export function getPaladinReachable(state) {
  const blocked = getOccupiedKeys(state, { ignoreHeroId: "paladin" });
  return reachableCells(
    state.board,
    state.heroes.paladin.position,
    state.available.paladin.mobility,
    blocked,
  );
}

export function setSquireCommand(state, command) {
  if (state.phase !== PHASES.COMMAND) return state;

  state.command = {
    type: command.type,
    monsterId: command.monsterId ?? null,
  };
  state.phase = PHASES.MOVE;
  pushLog(state, "Orden marcada. El Paladin se mueve primero.");
  return state;
}

function findChestAt(state, key) {
  return state.chests.find((chest) => !chest.opened && chest.position === key);
}

export function openChestForHero(state, heroId, chestId, rng = Math.random) {
  const hero = state.heroes[heroId];
  const chest = state.chests.find((entry) => entry.id === chestId);
  if (!hero || !chest || chest.opened) return state;

  chest.opened = true;
  const item = chest.item;
  pushLog(state, `${hero.name} abre un cofre: ${item.name}.`);

  if (item.type === ITEM_TYPES.NEGATIVE) {
    applyNegativeItem(state, heroId, item.id, rng);
    return checkTerminalState(state);
  }

  if (isInventoryFull(hero)) {
    pushLog(state, `Inventario lleno: ${item.name} se queda atras.`);
    return state;
  }

  hero.inventory.push(item);
  pushLog(state, `${item.name} entra al inventario de ${hero.name}.`);
  return state;
}

function openChestAtHeroPosition(state, heroId, rng = Math.random) {
  const hero = state.heroes[heroId];
  const chest = findChestAt(state, hero.position);
  if (!chest) return false;

  openChestForHero(state, heroId, chest.id, rng);
  state.available[heroId].mobility = 0;
  return true;
}

export function movePaladin(state, destination, rng = Math.random) {
  if (state.phase !== PHASES.MOVE) return state;

  const reachable = getPaladinReachable(state);
  const chosen = reachable.find((entry) => entry.key === destination);
  if (!chosen) {
    pushLog(state, "Esa casilla no esta al alcance del Paladin.");
    return state;
  }

  state.heroes.paladin.position = destination;
  state.available.paladin.mobility = Math.max(
    0,
    state.available.paladin.mobility - chosen.cost,
  );
  pushLog(state, `Paladin se mueve ${chosen.cost} casillas.`);

  openChestAtHeroPosition(state, "paladin", rng);
  if (state.phase === PHASES.DEFEAT) return state;

  moveSquireByAi(state, rng);
  if (state.phase === PHASES.DEFEAT) return state;

  state.phase = PHASES.ATTACK;
  return state;
}

export function moveSquireByAi(state, rng = Math.random) {
  if (state.heroes.squire.vitality <= 0) {
    pushLog(state, "El Escudero esta fuera de combate y no se mueve.");
    return state;
  }

  const result = resolveSquireAi(state, state.command, rng);
  const cost = Math.max(0, result.path.length - 1);
  state.heroes.squire.position = result.destination;
  state.available.squire.mobility = Math.max(0, state.available.squire.mobility - cost);

  pushLog(
    state,
    result.obeyed
      ? `Escudero obedece y se mueve ${cost} casillas.`
      : `Escudero desobedece (${result.intent}) y se mueve ${cost} casillas.`,
  );

  openChestAtHeroPosition(state, "squire", rng);
  return state;
}

function spendPool(state, heroId, stat, amount) {
  const spent = Math.min(state.available[heroId][stat], amount);
  state.available[heroId][stat] -= spent;
  return amount - spent;
}

function spendAttack(state, source, amount, preference = "paladin-first") {
  if (source === "paladin") return spendPool(state, "paladin", "attack", amount);
  if (source === "squire") return spendPool(state, "squire", "attack", amount);

  const order =
    preference === "squire-first"
      ? ["squire", "paladin"]
      : ["paladin", "squire"];
  let remaining = amount;
  for (const heroId of order) {
    remaining = spendPool(state, heroId, "attack", remaining);
  }
  return remaining;
}

export function getAdjacentMonsterIds(state) {
  const adjacent = new Set();
  for (const monster of state.monsters) {
    if (canTargetFrom(state.heroes.paladin.position, monster.position)) {
      adjacent.add(monster.id);
    }
    if (
      state.heroes.squire.vitality > 0 &&
      canTargetFrom(state.heroes.squire.position, monster.position)
    ) {
      adjacent.add(monster.id);
    }
  }
  return adjacent;
}

export function heroAttackMonster(state, monsterId, source = "paladin", preference = "paladin-first") {
  if (state.phase !== PHASES.ATTACK) return state;

  const monster = state.monsters.find((entry) => entry.id === monsterId);
  if (!monster) return state;

  const paladinCanHit = canTargetFrom(state.heroes.paladin.position, monster.position);
  const squireCanHit =
    state.heroes.squire.vitality > 0 &&
    canTargetFrom(state.heroes.squire.position, monster.position);
  const combinedReady = heroesAreAdjacent(state.heroes) && paladinCanHit;

  let attackPoints = 0;
  if (source === "paladin" && paladinCanHit) {
    attackPoints = state.available.paladin.attack;
  } else if (source === "squire" && squireCanHit) {
    attackPoints = state.available.squire.attack;
  } else if (source === "combined" && combinedReady) {
    attackPoints = state.available.paladin.attack + state.available.squire.attack;
  } else {
    pushLog(state, "Ese ataque no tiene posicion valida.");
    return state;
  }

  const result = resolveAttack(attackPoints, monster.defense, monster.vitality);
  if (result.hits === 0) {
    pushLog(state, `Ataque insuficiente contra ${monster.name}.`);
    return state;
  }

  monster.vitality = result.remainingVitality;
  spendAttack(state, source, result.spentAttack, preference);
  pushLog(state, `${monster.name} recibe ${result.hits} golpe(s).`);

  if (result.defeated) {
    state.monsters = state.monsters.filter((entry) => entry.id !== monster.id);
    pushLog(state, `${monster.name} cae.`);
    completeRoundIfNeeded(state);
  }

  return state;
}

export function endHeroAttack(state, rng = Math.random) {
  if (state.phase !== PHASES.ATTACK) return state;
  runMonsterTurn(state, rng);
  return state;
}

export function runMonsterTurn(state, rng = Math.random) {
  for (const monster of state.monsters) {
    const destination = selectMonsterMove(state, monster);
    if (destination !== monster.position) {
      monster.position = destination;
      pushLog(state, `${monster.name} avanza.`);
    }
  }

  for (const monster of state.monsters) {
    const targetHeroId = chooseMonsterTarget(state, monster);
    if (!targetHeroId) continue;
    monsterAttackHero(state, monster, targetHeroId);
    if (state.phase === PHASES.DEFEAT) return state;
  }

  completeRoundIfNeeded(state);
  if (state.phase === PHASES.ATTACK) {
    state.phase = PHASES.COMMAND;
    rollForTurn(state, rng);
  }

  return state;
}

function chooseMonsterTarget(state, monster) {
  const paladinAdjacent = areAdjacent(monster.position, state.heroes.paladin.position);
  const squireAdjacent =
    state.heroes.squire.vitality > 0 &&
    areAdjacent(monster.position, state.heroes.squire.position);

  if (monster.type === "spider" && squireAdjacent) return "squire";
  if (paladinAdjacent) return "paladin";
  if (squireAdjacent) return "squire";
  return null;
}

function monsterAttackHero(state, monster, heroId) {
  const hero = state.heroes[heroId];
  const defense = getCombinedDefense(state, heroId);
  const result = resolveAttack(monster.attack, defense, hero.vitality);

  if (result.hits === 0) {
    pushLog(state, `${monster.name} no supera la defensa de ${hero.name}.`);
    return;
  }

  hero.vitality = result.remainingVitality;
  pushLog(state, `${monster.name} golpea a ${hero.name} por ${result.hits}.`);
  checkTerminalState(state);
}

export function completeRoundIfNeeded(state) {
  if (state.monsters.length > 0) return state;

  if (state.round >= 12) {
    state.phase = PHASES.VICTORY;
    pushLog(state, "Ronda 12 despejada. La Hexacumba queda sellada.");
    return state;
  }

  state.phase = PHASES.ROUND_COMPLETE;
  state.pendingUpgrades = ["paladin", "squire"];
  pushLog(state, "Ronda despejada. Elige mejoras antes de bajar.");
  return state;
}

export function applyUpgrade(state, heroId, stat, rng = Math.random) {
  if (state.phase !== PHASES.ROUND_COMPLETE) return state;
  if (!state.pendingUpgrades.includes(heroId)) return state;

  const hero = state.heroes[heroId];
  if (stat === "maxVitality") {
    hero.maxVitality += 1;
  } else if (DIE_STATS.includes(stat)) {
    hero.stats[stat] += 1;
  } else {
    return state;
  }

  state.pendingUpgrades = state.pendingUpgrades.filter((id) => id !== heroId);
  pushLog(state, `${hero.name} gana +1 ${STAT_LABELS[stat]}.`);

  if (state.pendingUpgrades.length === 0) {
    advanceRound(state, rng);
  }

  return state;
}

export function advanceRound(state, rng = Math.random) {
  state.round += 1;
  state.level = getLevelForRound(state.round);

  for (const hero of Object.values(state.heroes)) {
    hero.vitality = hero.maxVitality;
  }

  setupRound(state, rng);
  rollForTurn(state, rng);
  return state;
}

function applyNegativeItem(state, heroId, itemId, rng = Math.random) {
  const hero = state.heroes[heroId];

  if (itemId === "poisonNeedle") {
    hero.vitality = Math.max(0, hero.vitality - 1);
    pushLog(state, `${hero.name} pierde 1 vitalidad.`);
  }

  if (itemId === "rustTrap") {
    state.effects.mobilityPenalty[heroId] += 1;
    computeAvailable(state);
    pushLog(state, `${hero.name} pierde 1 movilidad este turno.`);
  }

  if (itemId === "brokenBag") {
    if (hero.inventory.length === 0) {
      pushLog(state, "La bolsa rota no encuentra nada que tirar.");
      return;
    }
    const index = Math.floor(rng() * hero.inventory.length);
    const [lost] = hero.inventory.splice(index, 1);
    pushLog(state, `${hero.name} pierde ${lost.name}.`);
  }

  if (itemId === "confusingSmoke") {
    state.effects.forcedSquireDisobey = true;
    pushLog(state, "Humo confuso: el Escudero desobedecera este turno.");
  }
}

export function useItem(state, heroId, itemId, rng = Math.random) {
  const hero = state.heroes[heroId];
  const index = hero.inventory.findIndex((item) => item.id === itemId);
  if (index < 0) return state;

  const [item] = hero.inventory.splice(index, 1);
  const ownerBonus = state.effects.turnBonuses[heroId];

  if (item.id === "solarAxe") {
    ownerBonus.attack += heroId === "paladin" ? 2 : 1;
  }

  if (item.id === "oakShield") {
    ownerBonus.defense += heroId === "paladin" ? 1 : 2;
  }

  if (item.id === "lightBoots") {
    ownerBonus.mobility += 1;
  }

  if (item.id === "vitalPotion") {
    hero.vitality = hero.maxVitality;
  }

  if (item.id === "runeDie") {
    const rerolled = rerollLowestDie(state.dice[heroId], rng);
    state.dice[heroId] = rerolled.dice;
    pushLog(state, `${hero.name} repite dado de ${STAT_LABELS[rerolled.stat]}.`);
  }

  if (item.id === "greaterBlessing") {
    state.effects.nextD8[heroId] = true;
  }

  if (item.id === "dungeonBread") {
    hero.vitality = Math.min(hero.maxVitality, hero.vitality + 1);
  }

  computeAvailable(state);
  pushLog(state, `${hero.name} usa ${item.name}.`);
  return checkTerminalState(state);
}

export function getItemDescription(itemId) {
  return getItemById(itemId)?.description ?? "";
}

export function checkTerminalState(state) {
  if (state.heroes.paladin.vitality <= 0) {
    state.phase = PHASES.DEFEAT;
    pushLog(state, "El Paladin cae. La expedicion termina.");
    return state;
  }

  if (state.round >= 12 && state.monsters.length === 0) {
    state.phase = PHASES.VICTORY;
    pushLog(state, "Victoria: todos los monstruos de la ronda 12 fueron eliminados.");
    return state;
  }

  return state;
}

export function serializeState(state) {
  return JSON.stringify(state);
}

export function deserializeState(serialized) {
  const state = JSON.parse(serialized);
  checkTerminalState(state);
  return state;
}

export function getPathCost(state, startKey, endKey, blockedKeys = new Set()) {
  const path = findPath(state.board, startKey, endKey, blockedKeys);
  return path.length > 0 ? path.length - 1 : Infinity;
}

export function getNearestMonsterId(state, fromKey) {
  return [...state.monsters].sort(
    (a, b) => hexDistance(fromKey, a.position) - hexDistance(fromKey, b.position),
  )[0]?.id ?? null;
}
