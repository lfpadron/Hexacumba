export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(q, r) {
  return `${q},${r}`;
}

export function parseHexKey(key) {
  const [q, r] = key.split(",").map(Number);
  return { q, r };
}

export function generateHexCells(side) {
  if (!Number.isInteger(side) || side < 1) {
    throw new Error("Hex side must be a positive integer.");
  }

  const radius = side - 1;
  const cells = [];

  for (let q = -radius; q <= radius; q += 1) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min(radius, -q + radius);
    for (let r = rMin; r <= rMax; r += 1) {
      cells.push({ q, r, key: hexKey(q, r) });
    }
  }

  return cells;
}

export function isSameHex(aKey, bKey) {
  return aKey === bKey;
}

export function hexDistance(aKey, bKey) {
  const a = parseHexKey(aKey);
  const b = parseHexKey(bKey);
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -a.q - a.r - (-b.q - b.r);
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

export function getNeighborKeys(key) {
  const { q, r } = parseHexKey(key);
  return HEX_DIRECTIONS.map((direction) =>
    hexKey(q + direction.q, r + direction.r),
  );
}

export function areAdjacent(aKey, bKey) {
  return hexDistance(aKey, bKey) === 1;
}

export function getBoardCellKeys(board) {
  return new Set(board.cells.map((cell) => cell.key));
}

export function isWalkable(board, key, blockedKeys = new Set()) {
  const cellKeys = getBoardCellKeys(board);
  return (
    cellKeys.has(key) &&
    !board.walls.includes(key) &&
    !blockedKeys.has(key)
  );
}

export function reachableCells(board, startKey, movement, blockedKeys = new Set()) {
  const cellKeys = getBoardCellKeys(board);
  const walls = new Set(board.walls);
  const visited = new Map([[startKey, 0]]);
  const queue = [startKey];

  while (queue.length > 0) {
    const current = queue.shift();
    const currentCost = visited.get(current);

    for (const neighbor of getNeighborKeys(current)) {
      if (!cellKeys.has(neighbor) || walls.has(neighbor)) continue;
      if (blockedKeys.has(neighbor) && neighbor !== startKey) continue;

      const nextCost = currentCost + 1;
      if (nextCost > movement) continue;
      if (visited.has(neighbor) && visited.get(neighbor) <= nextCost) continue;

      visited.set(neighbor, nextCost);
      queue.push(neighbor);
    }
  }

  return Array.from(visited, ([key, cost]) => ({ key, cost }));
}

export function findPath(board, startKey, goalKey, blockedKeys = new Set()) {
  const cellKeys = getBoardCellKeys(board);
  const walls = new Set(board.walls);
  const queue = [startKey];
  const cameFrom = new Map([[startKey, null]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === goalKey) break;

    for (const neighbor of getNeighborKeys(current)) {
      if (!cellKeys.has(neighbor) || walls.has(neighbor)) continue;
      if (blockedKeys.has(neighbor) && neighbor !== goalKey) continue;
      if (cameFrom.has(neighbor)) continue;

      cameFrom.set(neighbor, current);
      queue.push(neighbor);
    }
  }

  if (!cameFrom.has(goalKey)) return [];

  const path = [];
  let current = goalKey;
  while (current !== null) {
    path.push(current);
    current = cameFrom.get(current);
  }

  return path.reverse();
}

export function closestReachableKey(board, startKey, targetKeys, movement, blockedKeys = new Set()) {
  const targets = new Set(targetKeys);
  const reachable = reachableCells(board, startKey, movement, blockedKeys);

  return reachable
    .filter((entry) => targets.has(entry.key))
    .sort((a, b) => a.cost - b.cost || a.key.localeCompare(b.key))[0]?.key;
}

export function farthestCellsFrom(originKey, cells) {
  return [...cells].sort(
    (a, b) => hexDistance(originKey, b.key) - hexDistance(originKey, a.key),
  );
}
