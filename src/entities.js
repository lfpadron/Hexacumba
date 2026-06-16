export const HERO_IDS = {
  PALADIN: "paladin",
  SQUIRE: "squire",
};

export const HERO_TEMPLATES = {
  [HERO_IDS.PALADIN]: {
    id: HERO_IDS.PALADIN,
    name: "Paladin",
    role: "Felino humano",
    maxVitality: 6,
    vitality: 6,
    stats: {
      mobility: 2,
      attack: 3,
      defense: 2,
    },
    inventoryCapacity: 2,
  },
  [HERO_IDS.SQUIRE]: {
    id: HERO_IDS.SQUIRE,
    name: "Escudero",
    role: "Canino AI",
    maxVitality: 6,
    vitality: 6,
    stats: {
      mobility: 1,
      attack: 2,
      defense: 3,
    },
    inventoryCapacity: 3,
  },
};

export const MONSTER_LIBRARY = {
  skeleton: {
    type: "skeleton",
    name: "Esqueleto",
    maxVitality: 3,
    vitality: 3,
    mobility: 4,
    attack: 2,
    defense: 2,
    trait: "Rapido y molesto",
    marker: "ES",
  },
  troll: {
    type: "troll",
    name: "Troll",
    maxVitality: 5,
    vitality: 5,
    mobility: 1,
    attack: 5,
    defense: 2,
    trait: "Lento, pega durisimo",
    marker: "TR",
  },
  spider: {
    type: "spider",
    name: "Arana",
    maxVitality: 2,
    vitality: 2,
    mobility: 5,
    attack: 2,
    defense: 1,
    trait: "Prioriza atacar al escudero",
    marker: "AR",
  },
  slime: {
    type: "slime",
    name: "Mucilago",
    maxVitality: 4,
    vitality: 4,
    mobility: 1,
    attack: 1,
    defense: 4,
    trait: "Tanque viscoso",
    marker: "MU",
  },
  ogre: {
    type: "ogre",
    name: "Ogro",
    maxVitality: 6,
    vitality: 6,
    mobility: 2,
    attack: 4,
    defense: 3,
    trait: "Amenaza pesada",
    marker: "OG",
  },
  boneBat: {
    type: "boneBat",
    name: "Murcielago oseo",
    maxVitality: 2,
    vitality: 2,
    mobility: 6,
    attack: 1,
    defense: 1,
    trait: "Hostiga y bloquea rutas",
    marker: "MO",
  },
  cultist: {
    type: "cultist",
    name: "Cultista",
    maxVitality: 3,
    vitality: 3,
    mobility: 2,
    attack: 3,
    defense: 2,
    trait: "Busca al Paladin",
    marker: "CU",
  },
  armor: {
    type: "armor",
    name: "Armadura vacia",
    maxVitality: 4,
    vitality: 4,
    mobility: 1,
    attack: 3,
    defense: 4,
    trait: "Muy defensiva",
    marker: "AV",
  },
};

export const MONSTER_POOLS_BY_LEVEL = {
  1: ["skeleton", "spider", "slime"],
  2: ["skeleton", "troll", "spider", "cultist", "slime"],
  3: ["troll", "ogre", "armor", "cultist", "boneBat"],
};

export function getLevelForRound(round) {
  return Math.min(3, Math.max(1, Math.ceil(round / 4)));
}

export function getRoundConfig(round) {
  const level = getLevelForRound(round);
  return {
    level,
    round,
    side: level + 3,
    walls: level + 2,
    monsters: level + 1,
    chests: level,
  };
}

export function createHero(id, avatar = "macho") {
  const template = HERO_TEMPLATES[id];
  if (!template) throw new Error(`Unknown hero id: ${id}`);

  return {
    ...structuredClone(template),
    avatar,
    position: null,
    inventory: [],
  };
}

export function createMonster(type, position, index = 0) {
  const template = MONSTER_LIBRARY[type];
  if (!template) throw new Error(`Unknown monster type: ${type}`);

  return {
    ...structuredClone(template),
    id: `${type}-${index}`,
    position,
  };
}

export function isHeroAlive(hero) {
  return hero.vitality > 0;
}
