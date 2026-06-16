import {
  areAdjacent,
  findPath,
  getNeighborKeys,
  hexDistance,
  isWalkable,
  reachableCells,
} from "./hexGrid.js";

function occupiedKeys(state, options = {}) {
  const { ignoreHeroId = null, ignoreMonsterId = null, includeMonsters = true } = options;
  const occupied = new Set();

  for (const hero of Object.values(state.heroes)) {
    if (hero.id !== ignoreHeroId) occupied.add(hero.position);
  }

  if (includeMonsters) {
    for (const monster of state.monsters) {
      if (monster.id !== ignoreMonsterId) occupied.add(monster.position);
    }
  }

  return occupied;
}

function nearestMonsterTo(key, monsters) {
  return [...monsters].sort(
    (a, b) => hexDistance(key, a.position) - hexDistance(key, b.position),
  )[0];
}

function nearestChestTo(key, chests) {
  return [...chests]
    .filter((chest) => !chest.opened)
    .sort((a, b) => hexDistance(key, a.position) - hexDistance(key, b.position))[0];
}

function bestReachableToward(
  state,
  startKey,
  targetKey,
  movement,
  blockedKeys,
  blockedEndKeys = blockedKeys,
) {
  const reachable = reachableCells(state.board, startKey, movement, blockedKeys).filter(
    (entry) => entry.key === startKey || !blockedEndKeys.has(entry.key),
  );
  return reachable
    .sort(
      (a, b) =>
        hexDistance(a.key, targetKey) - hexDistance(b.key, targetKey) ||
        b.cost - a.cost ||
        a.key.localeCompare(b.key),
    )[0]?.key;
}

function adjacentOpenKeys(state, centerKey, blockedKeys) {
  return getNeighborKeys(centerKey).filter((key) =>
    isWalkable(state.board, key, blockedKeys),
  );
}

function pickSafeSquireCell(state, movement, blockedKeys, blockedEndKeys = blockedKeys) {
  const startKey = state.heroes.squire.position;
  const reachable = reachableCells(state.board, startKey, movement, blockedKeys).filter(
    (entry) => entry.key === startKey || !blockedEndKeys.has(entry.key),
  );
  const monsters = state.monsters;

  return reachable
    .sort((a, b) => {
      const aDistance = Math.min(...monsters.map((monster) => hexDistance(a.key, monster.position)));
      const bDistance = Math.min(...monsters.map((monster) => hexDistance(b.key, monster.position)));
      return bDistance - aDistance || a.cost - b.cost || a.key.localeCompare(b.key);
    })[0]?.key;
}

export function resolveSquireAi(state, command, rng = Math.random) {
  const squire = state.heroes.squire;
  const movement = Math.max(0, state.available.squire.mobility);
  const blocked = occupiedKeys(state, {
    ignoreHeroId: "squire",
    includeMonsters: true,
  });
  blocked.delete(state.heroes.paladin.position);
  const blockedEnd = new Set(blocked);
  blockedEnd.add(state.heroes.paladin.position);

  const forced = Boolean(state.effects.forcedSquireDisobey);
  const obeyed = !forced && rng() < 0.75;
  let destination = squire.position;
  let intent = command?.type || "stay";

  if (!obeyed) {
    if (intent === "approach") intent = "nearestMonster";
    else if (intent === "follow") intent = "nearChest";
    else intent = "safeCell";
  }

  if (movement <= 0) {
    return { destination, obeyed, intent, path: [squire.position] };
  }

  if (intent === "approach") {
    const monster = state.monsters.find((entry) => entry.id === command.monsterId) ??
      nearestMonsterTo(squire.position, state.monsters);
    const targets = adjacentOpenKeys(state, monster.position, blockedEnd);
    destination =
      bestReachableToward(
        state,
        squire.position,
        targets.sort((a, b) => hexDistance(a, monster.position) - hexDistance(b, monster.position))[0] ??
          monster.position,
        movement,
        blocked,
        blockedEnd,
      ) ?? squire.position;
  }

  if (intent === "follow") {
    const targets = adjacentOpenKeys(state, state.heroes.paladin.position, blockedEnd);
    destination =
      targets
        .map((target) => ({
          key: bestReachableToward(state, squire.position, target, movement, blocked, blockedEnd),
          target,
        }))
        .filter((entry) => entry.key)
        .sort(
          (a, b) =>
            hexDistance(a.key, a.target) - hexDistance(b.key, b.target) ||
            hexDistance(a.key, state.heroes.paladin.position) -
              hexDistance(b.key, state.heroes.paladin.position),
        )[0]?.key ?? squire.position;
  }

  if (intent === "nearestMonster") {
    const monster = nearestMonsterTo(squire.position, state.monsters);
    if (monster) {
      destination =
        bestReachableToward(state, squire.position, monster.position, movement, blocked, blockedEnd) ??
        squire.position;
    }
  }

  if (intent === "nearChest") {
    const chest = nearestChestTo(squire.position, state.chests);
    if (chest) {
      destination =
        bestReachableToward(state, squire.position, chest.position, movement, blocked, blockedEnd) ??
        squire.position;
    }
  }

  if (intent === "safeCell") {
    destination = pickSafeSquireCell(state, movement, blocked, blockedEnd) ?? squire.position;
  }

  const path = findPath(state.board, squire.position, destination, blocked);
  return {
    destination,
    obeyed,
    intent,
    path: path.length > 0 ? path : [squire.position],
  };
}

export function selectMonsterMove(state, monster) {
  if (
    areAdjacent(monster.position, state.heroes.paladin.position) ||
    areAdjacent(monster.position, state.heroes.squire.position)
  ) {
    return monster.position;
  }

  const occupied = occupiedKeys(state, {
    ignoreMonsterId: monster.id,
    includeMonsters: false,
  });

  const monsterDestinations = new Set(
    state.monsters
      .filter((entry) => entry.id !== monster.id)
      .map((entry) => entry.position),
  );
  const blockedForEnd = new Set([...occupied, ...monsterDestinations, state.board.stairs]);
  const targetNeighbors = getNeighborKeys(state.heroes.paladin.position).filter((key) =>
    isWalkable(state.board, key, blockedForEnd),
  );

  const target =
    targetNeighbors.sort(
      (a, b) => hexDistance(monster.position, a) - hexDistance(monster.position, b),
    )[0] ?? state.heroes.paladin.position;

  const blockedForPath = new Set([...occupied, state.board.stairs]);
  const path = findPath(state.board, monster.position, target, blockedForPath);
  if (path.length <= 1) return monster.position;

  let stepIndex = Math.min(monster.mobility, path.length - 1);
  let destination = path[stepIndex];

  while (blockedForEnd.has(destination) && stepIndex > 0) {
    stepIndex -= 1;
    destination = path[stepIndex];
  }

  return destination;
}
