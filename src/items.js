export const ITEM_TYPES = {
  POSITIVE: "positive",
  NEGATIVE: "negative",
};

export const POSITIVE_ITEMS = [
  {
    id: "solarAxe",
    name: "Hacha solar",
    type: ITEM_TYPES.POSITIVE,
    description: "+2 ataque Paladin, +1 ataque Escudero este turno.",
  },
  {
    id: "oakShield",
    name: "Escudo de roble",
    type: ITEM_TYPES.POSITIVE,
    description: "+1 defensa Paladin, +2 defensa Escudero este turno.",
  },
  {
    id: "lightBoots",
    name: "Botas ligeras",
    type: ITEM_TYPES.POSITIVE,
    description: "+1 movilidad este turno.",
  },
  {
    id: "vitalPotion",
    name: "Pocion vital",
    type: ITEM_TYPES.POSITIVE,
    description: "Restaura vitalidad al maximo.",
  },
  {
    id: "runeDie",
    name: "Dado runico",
    type: ITEM_TYPES.POSITIVE,
    description: "Repite el dado mas bajo.",
  },
  {
    id: "greaterBlessing",
    name: "Bendicion mayor",
    type: ITEM_TYPES.POSITIVE,
    description: "La proxima tirada usa d8 en ataque.",
  },
  {
    id: "dungeonBread",
    name: "Pan de mazmorra",
    type: ITEM_TYPES.POSITIVE,
    description: "+1 vitalidad actual, sin pasar del maximo.",
  },
];

export const NEGATIVE_ITEMS = [
  {
    id: "poisonNeedle",
    name: "Aguja venenosa",
    type: ITEM_TYPES.NEGATIVE,
    description: "Pierde 1 vitalidad.",
  },
  {
    id: "rustTrap",
    name: "Trampa oxidada",
    type: ITEM_TYPES.NEGATIVE,
    description: "Pierde 1 movilidad este turno.",
  },
  {
    id: "brokenBag",
    name: "Bolsa rota",
    type: ITEM_TYPES.NEGATIVE,
    description: "Se cae un objeto aleatorio.",
  },
  {
    id: "confusingSmoke",
    name: "Humo confuso",
    type: ITEM_TYPES.NEGATIVE,
    description: "El Escudero desobedece automaticamente este turno.",
  },
];

export const ALL_ITEMS = [...POSITIVE_ITEMS, ...NEGATIVE_ITEMS];

export function getItemById(itemId) {
  return ALL_ITEMS.find((item) => item.id === itemId);
}

export function drawChestItem(cursedChests = false, rng = Math.random) {
  const pool =
    cursedChests && rng() < 1 / 3
      ? NEGATIVE_ITEMS
      : POSITIVE_ITEMS;

  return structuredClone(pool[Math.floor(rng() * pool.length)]);
}

export function isInventoryFull(hero) {
  return hero.inventory.length >= hero.inventoryCapacity;
}
