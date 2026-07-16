/**
 * Analyse de jet (style eXtreme Gammon / BG Blitz) :
 *  - classement de tous les coups légaux par équité,
 *  - commentaire analytique en français dérivé des caractéristiques réelles
 *    du coup (frappes, points construits, blots laissés, prime, course),
 *  - transcription du coup effectivement joué en comparant la position
 *    détectée par la caméra aux positions légales (style Digigammon).
 */

import type { BoardLike, Play, Player, Position } from "./engine";
import {
  generatePlays,
  playerLabel,
  playNotation,
  pipCounts,
  toBoard,
  toPosition,
} from "./engine";
import { evaluate, type EvalFeatures } from "./evaluate";

export interface RankedPlay {
  notation: string;
  play: Play;
  result: Position;
  equity: number;
  winProb: number;
  features: EvalFeatures;
  /** Frappes, points construits et sorties réalisés PAR ce coup. */
  hits: number;
  newPoints: number[];
  bornOff: number;
}

export interface RollAnalysis {
  mover: Player;
  dice: number[];
  dance: boolean;
  plays: RankedPlay[];
  best: RankedPlay | null;
  pips: { white: number; black: number };
}

export function analyzeRoll(board: BoardLike, mover: Player, dice: number[]): RollAnalysis {
  const [d1, d2] = dice.length >= 2 ? dice : [dice[0] ?? 3, dice[1] ?? 1];
  const pos = toPosition(board, mover);
  const generated = generatePlays(pos, d1, d2);
  const pips = pipCounts(board);

  const movable = generated.filter((g) => g.play.hops.length > 0);
  if (movable.length === 0) {
    return { mover, dice: [d1, d2], dance: true, plays: [], best: null, pips };
  }

  const ranked: RankedPlay[] = movable.map((g) => {
    const ev = evaluate(g.result);
    const hits = g.play.hops.filter((h) => h.hit).length;
    const bornOff = g.result.ownOff - pos.ownOff;
    const newPoints = ev.features.madePoints.filter((p) => pos.own[p] < 2);
    return {
      notation: playNotation(g.play),
      play: g.play,
      result: g.result,
      equity: ev.equity,
      winProb: ev.winProb,
      features: ev.features,
      hits,
      newPoints,
      bornOff,
    };
  });

  ranked.sort((a, b) => b.equity - a.equity);

  return { mover, dice: [d1, d2], dance: false, plays: ranked, best: ranked[0], pips };
}

function pointName(coord: number): string {
  if (coord === 5) return "le 5-point (point d'or)";
  if (coord === 7) return "la barre (7-point)";
  if (coord === 20) return "l'ancre dorée (20-point)";
  return `le ${coord}-point`;
}

/** Commentaire analytique en français, construit sur les faits du coup. */
export function buildCommentary(analysis: RollAnalysis): string {
  const label = playerLabel(analysis.mover);
  const [d1, d2] = analysis.dice;
  const isDouble = d1 === d2;
  const rollTxt = isDouble ? `double ${d1}` : `${d1}-${d2}`;

  if (analysis.dance) {
    return `${label} lance ${rollTxt} et ne peut pas entrer du bar : le jan adverse est fermé. Tour perdu.`;
  }

  const best = analysis.best!;
  const f = best.features;
  const parts: string[] = [];

  if (best.hits > 0) {
    parts.push(
      best.hits === 1
        ? `${label} frappe une blotte et envoie un pion adverse au bar.`
        : `${label} frappe ${best.hits} blottes — double frappe, l'adversaire devra rentrer du bar.`,
    );
  }

  if (best.newPoints.length > 0) {
    const names = best.newPoints
      .slice()
      .sort((a, b) => a - b)
      .map(pointName)
      .join(" et ");
    parts.push(`Le coup construit ${names}.`);
  }

  if (best.bornOff > 0) {
    parts.push(
      best.bornOff === 1
        ? `${label} sort un pion (${f.ownOff} au total).`
        : `${label} sort ${best.bornOff} pions (${f.ownOff} au total).`,
    );
  }

  if (f.primeLength >= 4) {
    parts.push(
      f.primeTrapsOpp
        ? `Prime de ${f.primeLength} points devant les arrières adverses — position très contraignante.`
        : `Prime de ${f.primeLength} points en construction.`,
    );
  }

  if (f.blots.length > 0) {
    const worst = f.blots.reduce((a, b) => (b.rolls > a.rolls ? b : a));
    parts.push(
      f.blots.length === 1
        ? `Une blotte reste exposée (${worst.rolls} jets frappeurs sur 36).`
        : `${f.blots.length} blottes restent exposées (jusqu'à ${worst.rolls} jets frappeurs sur 36).`,
    );
  } else if (f.contact && parts.length > 0) {
    parts.push("Aucune blotte laissée : coup sûr.");
  }

  const pipTxt =
    f.pipLead > 0
      ? `${label} mène la course de ${f.pipLead} pips`
      : f.pipLead < 0
        ? `${label} est distancé de ${-f.pipLead} pips`
        : "course à égalité parfaite";
  if (!f.contact) {
    parts.push(`Plus de contact : pure course. ${capitalize(pipTxt)}.`);
  } else {
    parts.push(`${capitalize(pipTxt)} (${f.ownPip} contre ${f.oppPip}).`);
  }

  if (analysis.plays.length > 1) {
    const second = analysis.plays[1];
    const delta = best.equity - second.equity;
    if (delta < 0.02) {
      parts.push(`Choix très serré avec ${second.notation} (Δ éq. ${delta.toFixed(3)}).`);
    } else if (delta > 0.12) {
      parts.push("Le meilleur coup domine nettement les alternatives.");
    }
  }

  if (parts.length === 0) {
    parts.push(`${label} joue ${rollTxt} : ${best.notation}. Coup de développement.`);
  }

  return parts.join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface InferredMove {
  notation: string;
  /** Position légale la plus proche de la détection caméra. */
  board: BoardLike;
  /** Écart (nombre de pions divergents) entre détection et position légale. */
  distance: number;
  exact: boolean;
  equity: number;
  rank: number;
  totalPlays: number;
  dance: boolean;
}

function boardDistance(a: BoardLike, b: BoardLike): number {
  let d = 0;
  for (let i = 1; i <= 24; i++) {
    const pa = a.points.find((p) => p.index === i);
    const pb = b.points.find((p) => p.index === i);
    d += Math.abs((pa?.white ?? 0) - (pb?.white ?? 0));
    d += Math.abs((pa?.black ?? 0) - (pb?.black ?? 0));
  }
  d += Math.abs(a.barWhite - b.barWhite) + Math.abs(a.barBlack - b.barBlack);
  d += Math.abs(a.offWhite - b.offWhite) + Math.abs(a.offBlack - b.offBlack);
  return d;
}

/**
 * Transcription live : retrouve le coup joué en comparant la position
 * détectée aux positions atteignables légalement. Retourne aussi la
 * position légale « recalée » pour corriger le bruit de détection.
 */
export function inferPlayedMove(
  previous: BoardLike,
  detected: BoardLike,
  mover: Player,
  dice: number[],
): InferredMove | null {
  if (dice.length < 2) return null;
  const analysis = analyzeRoll(previous, mover, dice);

  if (analysis.dance) {
    return {
      notation: "ne peut pas entrer (dance)",
      board: previous,
      distance: boardDistance(previous, detected),
      exact: true,
      equity: 0,
      rank: 0,
      totalPlays: 0,
      dance: true,
    };
  }

  let best: InferredMove | null = null;
  analysis.plays.forEach((play, idx) => {
    const board = toBoard(play.result, mover);
    const distance = boardDistance(board, detected);
    if (!best || distance < best.distance) {
      best = {
        notation: play.notation,
        board,
        distance,
        exact: distance === 0,
        equity: play.equity,
        rank: idx + 1,
        totalPlays: analysis.plays.length,
        dance: false,
      };
    }
  });

  return best;
}
