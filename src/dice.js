export const DIE_STATS = ["mobility", "attack", "defense"];

export function rollDie(sides = 6, rng = Math.random) {
  return Math.floor(rng() * sides) + 1;
}

export function rollHeroDice(useD8 = false, rng = Math.random) {
  const dice = {};
  for (const stat of DIE_STATS) {
    const sides = useD8 && stat === "attack" ? 8 : 6;
    dice[stat] = rollDie(sides, rng);
  }
  return dice;
}

export function rollPartyDice(nextD8 = {}, rng = Math.random) {
  return {
    paladin: rollHeroDice(Boolean(nextD8.paladin), rng),
    squire: rollHeroDice(Boolean(nextD8.squire), rng),
  };
}

export function getLowestDieStat(heroDice) {
  return [...DIE_STATS].sort((a, b) => heroDice[a] - heroDice[b] || a.localeCompare(b))[0];
}

export function rerollLowestDie(heroDice, rng = Math.random) {
  const stat = getLowestDieStat(heroDice);
  return {
    stat,
    dice: {
      ...heroDice,
      [stat]: rollDie(6, rng),
    },
  };
}
