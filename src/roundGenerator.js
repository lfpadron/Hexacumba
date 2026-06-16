import { createMonster, getRoundConfig, MONSTER_POOLS_BY_LEVEL } from "./entities.js";
import {
  areAdjacent,
  farthestCellsFrom,
  generateHexCells,
  hexDistance,
  hexKey,
} from "./hexGrid.js";
import { drawChestItem } from "./items.js";

function randomChoice(items, rng = Math.random) {
  return items[Math.floor(rng() * items.length)];
}

function shuffled(items, rng = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function takeRandomFree(candidates, reserved, amount, rng = Math.random) {
  const picked = [];
  for (const cell of shuffled(candidates, rng)) {
    if (picked.length >= amount) break;
    if (reserved.has(cell.key)) continue;
    picked.push(cell);
    reserved.add(cell.key);
  }
  return picked;
}

export function generateRound(round, heroes, options = {}) {
  const { cursedChests = false, rng = Math.random } = options;
  const config = getRoundConfig(round);
  const cells = generateHexCells(config.side);
  const reserved = new Set();

  const paladinStart = hexKey(0, 0);
  const squireStart = hexKey(1, 0);
  reserved.add(paladinStart);
  reserved.add(squireStart);

  const stairs = farthestCellsFrom(paladinStart, cells)[0].key;
  reserved.add(stairs);

  const nearStart = new Set(
    cells
      .filter((cell) => hexDistance(paladinStart, cell.key) <= 1)
      .map((cell) => cell.key),
  );

  const wallCandidates = cells.filter(
    (cell) => !nearStart.has(cell.key) && cell.key !== stairs,
  );
  const walls = takeRandomFree(wallCandidates, reserved, config.walls, rng).map(
    (cell) => cell.key,
  );

  const chestCandidates = cells.filter(
    (cell) =>
      !reserved.has(cell.key) &&
      !walls.includes(cell.key) &&
      hexDistance(paladinStart, cell.key) >= 2,
  );
  const chests = takeRandomFree(chestCandidates, reserved, config.chests, rng).map(
    (cell, index) => ({
      id: `chest-${round}-${index}`,
      position: cell.key,
      opened: false,
      item: drawChestItem(cursedChests, rng),
    }),
  );

  const monsterPool = MONSTER_POOLS_BY_LEVEL[config.level];
  const minimumDistance = Math.max(3, config.side - 1);
  let monsterCandidates = cells.filter(
    (cell) =>
      !reserved.has(cell.key) &&
      !walls.includes(cell.key) &&
      !areAdjacent(cell.key, paladinStart) &&
      !areAdjacent(cell.key, squireStart) &&
      hexDistance(paladinStart, cell.key) >= minimumDistance,
  );

  if (monsterCandidates.length < config.monsters) {
    monsterCandidates = cells.filter(
      (cell) =>
        !reserved.has(cell.key) &&
        !walls.includes(cell.key) &&
        !areAdjacent(cell.key, paladinStart) &&
        !areAdjacent(cell.key, squireStart),
    );
  }

  const monsterCells = takeRandomFree(monsterCandidates, reserved, config.monsters, rng);
  const monsters = monsterCells.map((cell, index) =>
    createMonster(randomChoice(monsterPool, rng), cell.key, `${round}-${index}`),
  );

  return {
    config,
    board: {
      side: config.side,
      cells,
      walls,
      stairs,
    },
    heroes: {
      paladin: {
        ...structuredClone(heroes.paladin),
        position: paladinStart,
      },
      squire: {
        ...structuredClone(heroes.squire),
        position: squireStart,
      },
    },
    chests,
    monsters,
  };
}
