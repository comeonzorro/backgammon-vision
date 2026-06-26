import type { BackgammonPoint, GameSnapshot, StrategyAdvice } from "../types";

export function createInitialBoard(): BackgammonPoint[] {
  const points: BackgammonPoint[] = Array.from({ length: 24 }, (_, i) => ({
    index: i + 1,
    white: 0,
    black: 0,
  }));

  points[0] = { index: 1, white: 0, black: 2 };
  points[4] = { index: 5, white: 0, black: 5 };
  points[6] = { index: 7, white: 0, black: 3 };
  points[11] = { index: 12, white: 5, black: 0 };
  points[12] = { index: 13, white: 0, black: 5 };
  points[16] = { index: 17, white: 3, black: 0 };
  points[18] = { index: 19, white: 5, black: 0 };
  points[23] = { index: 24, white: 2, black: 0 };

  return points;
}

export function snapshotFromDice(
  dice: number[],
  previous?: GameSnapshot,
): GameSnapshot {
  const base = previous ?? {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    dice: [],
    points: createInitialBoard(),
    barWhite: 0,
    barBlack: 0,
    offWhite: 0,
    offBlack: 0,
    activePlayer: "white" as const,
  };

  return {
    ...base,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    dice,
    activePlayer: base.activePlayer === "white" ? "black" : "white",
  };
}

const COMMENTS = [
  "Le blanc cherche à verrouiller le point extérieur avant de courir.",
  "Position équilibrée : les deux camps ont des chances de prime.",
  "Attention au blott possible sur le 6-point adverse.",
  "Le détecteur visuel confirme un double — opportunité de frappe.",
  "Course à la maison : privilégier la sécurité des checkers isolés.",
];

export function analyzePosition(
  snapshot: GameSnapshot,
  dice: number[],
): StrategyAdvice {
  const [d1, d2] = dice.length >= 2 ? dice : [dice[0] ?? 3, dice[1] ?? 1];
  const isDouble = d1 === d2;
  const sum = d1 + d2;

  const whiteTotal = snapshot.points.reduce((a, p) => a + p.white, 0) + snapshot.barWhite;
  const blackTotal = snapshot.points.reduce((a, p) => a + p.black, 0) + snapshot.barBlack;
  const raceAdvantage = whiteTotal < blackTotal ? "blanc" : "noir";

  let bestMove: string;
  if (isDouble) {
    bestMove = `Double ${d1} : 13/7, 13/7, 8/2, 8/2 — maximiser le blocage`;
  } else if (d1 === 6 || d2 === 6) {
    bestMove = `6/${d1 === 6 ? d1 - d2 || 1 : 6 - d1} puis consolider le 20-point`;
  } else {
    bestMove = `13/${13 - d1} 8/${8 - d2} — développement classique`;
  }

  const equity = 0.45 + (sum / 24) * 0.15 + (isDouble ? 0.08 : 0);
  const winChance = Math.min(0.92, Math.max(0.18, equity + 0.12));

  return {
    bestMove,
    equity: Math.round(equity * 1000) / 1000,
    winChance: Math.round(winChance * 100),
    spectatorComment: `${COMMENTS[sum % COMMENTS.length]} Course favorisée côté ${raceAdvantage}.`,
    alternatives: [
      `Slot 5-point : ${d1}/5`,
      `Split arrière : 24/${24 - d2}`,
      `Hit & cover si dé ${Math.max(d1, d2)} touche une blotte`,
    ],
    riskLevel: isDouble ? "high" : sum >= 9 ? "medium" : "low",
  };
}
