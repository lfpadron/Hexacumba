import { resolveSquireAi, selectMonsterMove } from "./ai.js";
import { canTargetFrom, getCombinedDefense, heroesAreAdjacent, resolveAttack } from "./combat.js";
import { DIE_STATS, rerollLowestDie, rollPartyDice } from "./dice.js";
import { createHero, getLevelForRound, HERO_IDS } from "./entities.js";
import { areAdjacent, findPath, hexDistance, reachableCells } from "./hexGrid.js";
import { getItemById, isInventoryFull, ITEM_TYPES } from "./items.js";
import { generateRound } from "./roundGenerator.js";

export const PHASES = {
  SETUP: "setup",
  ROLL: "roll",
  COMMAND: "command",
  MOVE: "move",
  SQUIRE_MOVE: "squireMove",
  ATTACK: "attack",
  MONSTER_TURN: "monsterTurn",
  END_TURN: "endTurn",
  STAIRS: "stairs",
  ROUND_COMPLETE: "roundComplete",
  VICTORY: "victory",
  DEFEAT: "defeat",
};

export const TURN_FLOW = [
  PHASES.ROLL,
  PHASES.COMMAND,
  PHASES.MOVE,
  PHASES.SQUIRE_MOVE,
  PHASES.ATTACK,
  PHASES.MONSTER_TURN,
  PHASES.END_TURN,
];

const STAT_LABELS = {
  mobility: "movilidad",
  attack: "ataque",
  defense: "defensa",
  maxVitality: "vitalidad maxima",
};

const COMMAND_LABELS = {
  approach: "Acercarse al monstruo",
  follow: "Quedarse cerca",
  stay: "No moverse",
};

const INTENT_LABELS = {
  approach: "objetivo ordenado",
  follow: "mantener escolta",
  stay: "mantener posicion",
  nearestMonster: "monstruo mas cercano",
  nearChest: "cofre cercano",
  safeCell: "casilla segura",
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

function createStats() {
  return {
    turnsPlayed: 0,
    roundsCompleted: 0,
    monstersDefeated: 0,
    chestsOpened: 0,
    objectsUsed: 0,
  };
}

function pushLog(state, message) {
  state.lastMessage = message;
  state.log = [message, ...(state.log ?? [])].slice(0, 80);
}

export function getPhaseLabel(phase) {
  return {
    [PHASES.SETUP]: "Preparacion",
    [PHASES.ROLL]: "Tirada",
    [PHASES.COMMAND]: "Orden al Escudero",
    [PHASES.MOVE]: "Movimiento del Paladin",
    [PHASES.SQUIRE_MOVE]: "Movimiento del Escudero",
    [PHASES.ATTACK]: "Ataque humano",
    [PHASES.MONSTER_TURN]: "Turno de monstruos",
    [PHASES.END_TURN]: "Fin de turno",
    [PHASES.STAIRS]: "Escaleras",
    [PHASES.ROUND_COMPLETE]: "Progresion",
    [PHASES.VICTORY]: "Victoria",
    [PHASES.DEFEAT]: "Derrota",
  }[phase] ?? phase;
}

export function getExpectedAction(state) {
  if (state.pendingChestChoice) return "Resuelve el objeto encontrado en el cofre.";
  return {
    [PHASES.ROLL]: "Tira dados para iniciar el turno.",
    [PHASES.COMMAND]: "Elige una orden para el Escudero.",
    [PHASES.MOVE]: "Selecciona una casilla alcanzable para el Paladin.",
    [PHASES.SQUIRE_MOVE]: "Resuelve el movimiento AI del Escudero.",
    [PHASES.ATTACK]: "Selecciona un monstruo adyacente o termina el ataque.",
    [PHASES.MONSTER_TURN]: "Resuelve movimiento y ataques de monstruos.",
    [PHASES.END_TURN]: "Cierra el turno y prepara una nueva tirada.",
    [PHASES.STAIRS]: "Lleva al Paladin a las escaleras para avanzar.",
    [PHASES.ROUND_COMPLETE]: "Elige una mejora para cada heroe.",
    [PHASES.VICTORY]: "La expedicion termino en victoria.",
    [PHASES.DEFEAT]: "La expedicion termino en derrota.",
  }[state.phase] ?? "";
}

export function createNewGame(options = {}) {
  const state = {
    version: 2,
    round: 1,
    level: 1,
    phase: PHASES.ROLL,
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
    lastSquireAi: null,
    pendingUpgrades: [],
    pendingChestChoice: null,
    stats: createStats(),
    lastMessage: "",
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

function ensureStateShape(state) {
  state.version = state.version ?? 2;
  state.stats = { ...createStats(), ...(state.stats ?? {}) };
  state.effects = state.effects ?? createEffects();
  state.pendingChestChoice = state.pendingChestChoice ?? null;
  state.lastSquireAi = state.lastSquireAi ?? null;
  state.lastMessage = state.lastMessage ?? state.log?.[0] ?? "";
  state.available = state.available ?? {
    paladin: createStatBag(),
    squire: createStatBag(),
  };
  return state;
}

export function setupRound(state, rng = Math.random) {
  ensureStateShape(state);
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
  state.lastSquireAi = null;
  state.pendingUpgrades = [];
  state.pendingChestChoice = null;
  state.phase = PHASES.ROLL;

  pushLog(
    state,
    `Ronda ${state.round}: nivel ${round.config.level}, ${round.config.monsters} monstruos, ${round.config.chests} cofres.`,
  );
}

export function computeAvailable(state) {
  ensureStateShape(state);
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
  ensureStateShape(state);
  const nextD8 = state.effects?.nextD8 ?? {};
  state.effects = createEffects();
  state.dice = rollPartyDice(nextD8, rng);
  computeAvailable(state);
  state.phase = PHASES.COMMAND;
  pushLog(state, "Tirada lista: asigna la orden del Escudero.");
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
  if (state.pendingChestChoice) return state;
  if (state.phase !== PHASES.COMMAND) {
    pushLog(state, "Todavia no toca dar orden al Escudero.");
    return state;
  }

  state.command = {
    type: command.type,
    monsterId: command.monsterId ?? null,
  };
  state.phase = PHASES.MOVE;
  pushLog(state, `Orden elegida: ${COMMAND_LABELS[state.command.type]}.`);
  return state;
}

function findChestAt(state, key) {
  return state.chests.find((chest) => !chest.opened && chest.position === key);
}

export function openChestForHero(state, heroId, chestId, rng = Math.random) {
  ensureStateShape(state);
  const hero = state.heroes[heroId];
  const chest = state.chests.find((entry) => entry.id === chestId);
  if (!hero || !chest || chest.opened) return state;

  chest.opened = true;
  state.stats.chestsOpened += 1;
  const item = chest.item;
  pushLog(state, `${hero.name} abre un cofre: ${item.name}.`);

  if (item.type === ITEM_TYPES.NEGATIVE) {
    applyNegativeItem(state, heroId, item.id, rng);
    return checkTerminalState(state);
  }

  if (isInventoryFull(hero)) {
    state.pendingChestChoice = {
      heroId,
      item,
      source: chest.id,
    };
    pushLog(state, `Inventario lleno: decide que hacer con ${item.name}.`);
    return state;
  }

  hero.inventory.push(item);
  pushLog(state, `${item.name} entra al inventario de ${hero.name}.`);
  return state;
}

export function resolvePendingChestChoice(state, action, replaceIndex = null) {
  ensureStateShape(state);
  const pending = state.pendingChestChoice;
  if (!pending) return state;

  const hero = state.heroes[pending.heroId];
  const item = pending.item;

  if (action === "replace" && Number.isInteger(replaceIndex) && hero.inventory[replaceIndex]) {
    const oldItem = hero.inventory.splice(replaceIndex, 1, item)[0];
    pushLog(state, `${hero.name} reemplaza ${oldItem.name} por ${item.name}.`);
  } else {
    pushLog(state, `${hero.name} descarta ${item.name}.`);
  }

  state.pendingChestChoice = null;
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
  if (state.pendingChestChoice) return state;

  if (state.phase === PHASES.STAIRS) {
    if (destination === state.board.stairs) return enterStairs(state, rng);
    pushLog(state, "Con la ronda limpia, el objetivo es llegar a las escaleras.");
    return state;
  }

  if (state.phase !== PHASES.MOVE) {
    pushLog(state, "No es momento de mover al Paladin.");
    return state;
  }

  const reachable = getPaladinReachable(state);
  const chosen = reachable.find((entry) => entry.key === destination);
  if (!chosen) {
    pushLog(state, "Movimiento invalido: casilla fuera de alcance u ocupada.");
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

  state.phase = PHASES.SQUIRE_MOVE;
  return state;
}

export function resolveSquireMove(state, rng = Math.random) {
  if (state.pendingChestChoice) return state;
  if (state.phase !== PHASES.SQUIRE_MOVE) {
    pushLog(state, "El Escudero aun no debe moverse.");
    return state;
  }

  moveSquireByAi(state, rng);
  if (state.phase !== PHASES.DEFEAT) state.phase = PHASES.ATTACK;
  return state;
}

export function moveSquireByAi(state, rng = Math.random) {
  if (state.heroes.squire.vitality <= 0) {
    state.lastSquireAi = {
      order: COMMAND_LABELS[state.command.type],
      obeyed: false,
      intent: "fuera de combate",
      from: state.heroes.squire.position,
      to: state.heroes.squire.position,
      cost: 0,
      reason: "Sin vitalidad",
    };
    pushLog(state, "El Escudero esta fuera de combate y no se mueve.");
    return state;
  }

  const from = state.heroes.squire.position;
  const result = resolveSquireAi(state, state.command, rng);
  const cost = Math.max(0, result.path.length - 1);
  state.heroes.squire.position = result.destination;
  state.available.squire.mobility = Math.max(0, state.available.squire.mobility - cost);

  state.lastSquireAi = {
    order: COMMAND_LABELS[state.command.type],
    obeyed: result.obeyed,
    intent: INTENT_LABELS[result.intent] ?? result.intent,
    from,
    to: result.destination,
    cost,
    reason: result.obeyed
      ? "Obedecio la orden elegida."
      : `Desobedecio y eligio ${INTENT_LABELS[result.intent] ?? result.intent}.`,
  };

  pushLog(
    state,
    result.obeyed
      ? `Escudero obedece: ${from} -> ${result.destination} (${cost}).`
      : `Escudero desobedece: ${from} -> ${result.destination} por ${state.lastSquireAi.intent}.`,
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

export function previewHeroAttack(state, monsterId, source = "paladin") {
  const monster = state.monsters.find((entry) => entry.id === monsterId);
  if (!monster) {
    return { attackPoints: 0, hits: 0, spentAttack: 0, defeated: false, valid: false };
  }

  const paladinCanHit = canTargetFrom(state.heroes.paladin.position, monster.position);
  const squireCanHit =
    state.heroes.squire.vitality > 0 &&
    canTargetFrom(state.heroes.squire.position, monster.position);
  const combinedReady = heroesAreAdjacent(state.heroes) && (paladinCanHit || squireCanHit);

  let valid = true;
  let attackPoints = 0;
  if (source === "paladin" && paladinCanHit) {
    attackPoints = state.available.paladin.attack;
  } else if (source === "squire" && squireCanHit) {
    attackPoints = state.available.squire.attack;
  } else if (source === "combined" && combinedReady) {
    attackPoints = state.available.paladin.attack + state.available.squire.attack;
  } else {
    valid = false;
  }

  const defenseCost = Math.max(1, monster.defense);
  const canImpact = valid && attackPoints >= defenseCost && monster.vitality > 0;
  const result = {
    hits: canImpact ? 1 : 0,
    spentAttack: canImpact ? defenseCost : 0,
    remainingAttack: canImpact ? attackPoints - defenseCost : attackPoints,
    remainingVitality: canImpact ? monster.vitality - 1 : monster.vitality,
    defeated: canImpact ? monster.vitality - 1 <= 0 : false,
  };
  return {
    attackPoints,
    hits: result.hits,
    spentAttack: result.spentAttack,
    remainingAttack: result.remainingAttack,
    remainingVitality: result.remainingVitality,
    defeated: result.defeated,
    valid,
  };
}

export function heroAttackMonster(state, monsterId, source = "paladin", preference = "paladin-first") {
  if (state.pendingChestChoice) return state;
  if (state.phase !== PHASES.ATTACK) {
    pushLog(state, "No es momento de atacar.");
    return state;
  }

  const monster = state.monsters.find((entry) => entry.id === monsterId);
  if (!monster) return state;

  const preview = previewHeroAttack(state, monsterId, source);
  if (!preview.valid) {
    pushLog(state, "Ese ataque no tiene posicion valida.");
    return state;
  }

  if (preview.hits === 0) {
    pushLog(state, `Ataque insuficiente contra ${monster.name}.`);
    return state;
  }

  monster.vitality = preview.remainingVitality;
  spendAttack(state, source, preview.spentAttack, preference);
  pushLog(state, `${monster.name} recibe ${preview.hits} golpe(s).`);

  if (preview.defeated) {
    state.monsters = state.monsters.filter((entry) => entry.id !== monster.id);
    state.stats.monstersDefeated += 1;
    pushLog(state, `${monster.name} cae y sale del tablero.`);
    completeRoundIfNeeded(state);
  }

  return state;
}

export function endHeroAttack(state) {
  if (state.pendingChestChoice) return state;
  if (state.phase !== PHASES.ATTACK) return state;
  state.phase = PHASES.MONSTER_TURN;
  pushLog(state, "Ataque humano cerrado. Los monstruos preparan su turno.");
  return state;
}

export function resolveMonsterTurn(state, rng = Math.random) {
  if (state.pendingChestChoice) return state;
  if (state.phase !== PHASES.MONSTER_TURN) {
    pushLog(state, "Los monstruos aun no pueden actuar.");
    return state;
  }

  runMonsterTurn(state, rng);
  if (state.phase === PHASES.MONSTER_TURN) {
    state.phase = PHASES.END_TURN;
    pushLog(state, "Turno de monstruos resuelto.");
  }
  return state;
}

export function runMonsterTurn(state, rng = Math.random) {
  for (const monster of state.monsters) {
    const destination = selectMonsterMove(state, monster);
    if (destination !== monster.position) {
      monster.position = destination;
      pushLog(state, `${monster.name} avanza a ${destination}.`);
    }
  }

  for (const monster of state.monsters) {
    const targetHeroId = chooseMonsterTarget(state, monster);
    if (!targetHeroId) continue;
    monsterAttackHero(state, monster, targetHeroId);
    if (state.phase === PHASES.DEFEAT) return state;
  }

  completeRoundIfNeeded(state);
  return state;
}

export function finishTurn(state, rng = Math.random) {
  if (state.pendingChestChoice) return state;
  if (state.phase !== PHASES.END_TURN) return state;
  state.stats.turnsPlayed += 1;
  state.phase = PHASES.ROLL;
  rollForTurn(state, rng);
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
  if (state.phase === PHASES.VICTORY || state.phase === PHASES.DEFEAT) return state;

  state.phase = PHASES.STAIRS;
  pushLog(state, "Ronda despejada. Lleva al Paladin a las escaleras.");
  return state;
}

export function enterStairs(state, rng = Math.random) {
  if (state.phase !== PHASES.STAIRS) return state;

  const blocked = getOccupiedKeys(state, {
    ignoreHeroId: "paladin",
    includeMonsters: false,
  });
  const path = findPath(state.board, state.heroes.paladin.position, state.board.stairs, blocked);
  if (path.length === 0) {
    pushLog(state, "No hay ruta libre hacia las escaleras.");
    return state;
  }

  state.heroes.paladin.position = state.board.stairs;
  state.stats.roundsCompleted += 1;

  for (const hero of Object.values(state.heroes)) {
    hero.vitality = Math.min(hero.maxVitality, Math.max(6, hero.maxVitality));
  }

  if (state.round >= 12) {
    state.phase = PHASES.VICTORY;
    pushLog(state, "Ronda 12 completada. Victoria en la Hexacumba.");
    return state;
  }

  state.phase = PHASES.ROUND_COMPLETE;
  state.pendingUpgrades = ["paladin", "squire"];
  pushLog(state, "Escaleras alcanzadas. Elige mejoras antes de bajar.");
  return state;
}

export function applyUpgrade(state, heroId, stat, rng = Math.random) {
  if (state.pendingChestChoice) return state;
  if (state.phase !== PHASES.ROUND_COMPLETE) return state;
  if (!state.pendingUpgrades.includes(heroId)) return state;

  const hero = state.heroes[heroId];
  if (stat === "maxVitality") {
    hero.maxVitality += 1;
    hero.vitality = hero.maxVitality;
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

export function useItem(state, heroId, itemRef, rng = Math.random) {
  if (state.pendingChestChoice) return state;
  const hero = state.heroes[heroId];
  const index = Number.isInteger(itemRef)
    ? itemRef
    : hero.inventory.findIndex((item) => item.id === itemRef);
  if (index < 0 || !hero.inventory[index]) return state;

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

  state.stats.objectsUsed += 1;
  computeAvailable(state);
  pushLog(state, `${hero.name} usa ${item.name}: ${item.description}`);
  return checkTerminalState(state);
}

export function getItemDescription(itemId) {
  return getItemById(itemId)?.description ?? "";
}

export function inspectCell(state, key) {
  const wall = state.board.walls.includes(key);
  const chest = state.chests.find((entry) => entry.position === key && !entry.opened);
  const monster = state.monsters.find((entry) => entry.position === key);
  const hero = Object.values(state.heroes).find((entry) => entry.position === key);
  const isStairs = state.board.stairs === key;

  if (hero) {
    return {
      kind: "hero",
      name: hero.name,
      type: hero.id === "paladin" ? "Paladin felino" : "Escudero canino AI",
      vitality: hero.vitality,
      maxVitality: hero.maxVitality,
      mobility: hero.stats.mobility,
      attack: hero.stats.attack,
      defense: hero.stats.defense,
      state: hero.vitality > 0 ? "Activo" : "Fuera de combate",
      key,
    };
  }

  if (monster) {
    return {
      kind: "monster",
      name: monster.name,
      type: monster.trait,
      vitality: monster.vitality,
      maxVitality: monster.maxVitality,
      mobility: monster.mobility,
      attack: monster.attack,
      defense: monster.defense,
      state: "Hostil",
      key,
    };
  }

  if (wall) {
    return {
      kind: "wall",
      name: "Muro",
      type: "Terreno",
      state: "Infranqueable",
      key,
    };
  }

  if (chest) {
    return {
      kind: "chest",
      name: "Cofre cerrado",
      type: "Tesoro",
      state: "Se abre al entrar",
      key,
    };
  }

  if (isStairs) {
    return {
      kind: "stairs",
      name: "Escaleras",
      type: "Salida de ronda",
      state: state.monsters.length === 0 ? "Activas" : "Bloqueadas por monstruos",
      key,
    };
  }

  return {
    kind: "empty",
    name: "Casilla vacia",
    type: "Terreno",
    state: "Libre",
    key,
  };
}

export function checkTerminalState(state) {
  ensureStateShape(state);
  if (state.heroes.paladin.vitality <= 0) {
    state.phase = PHASES.DEFEAT;
    pushLog(state, "El Paladin cae. La expedicion termina.");
    return state;
  }

  if (state.round >= 12 && state.monsters.length === 0 && state.phase !== PHASES.STAIRS) {
    state.phase = PHASES.VICTORY;
    pushLog(state, "Victoria: todos los monstruos de la ronda 12 fueron eliminados.");
    return state;
  }

  return state;
}

export function serializeState(state) {
  return JSON.stringify(ensureStateShape(state));
}

export function deserializeState(serialized) {
  const state = ensureStateShape(JSON.parse(serialized));
  computeAvailable(state);
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
