/**
 * Moteur backgammon : représentation de position, génération complète des
 * coups légaux (bar, doubles, bear-off, règle du dé fort) et notation standard.
 *
 * Conventions du plateau global (affichage) :
 *  - Blanc se déplace 24 → 1 (jan intérieur blanc = points 1–6).
 *  - Noir se déplace 1 → 24 (jan intérieur noir = points 19–24).
 *
 * En interne, chaque position est vue du côté du joueur au trait ("own") :
 *  own[i] (1..24) = pions du joueur au point i de SA numérotation
 *  (i = distance restante ; own 1–6 = son jan intérieur).
 *  opp[j] = pions adverses dans LA numérotation adverse (opp j ↔ own 25-j).
 */

export type Player = "white" | "black";

export interface BoardLike {
  points: { index: number; white: number; black: number }[];
  barWhite: number;
  barBlack: number;
  offWhite: number;
  offBlack: number;
}

export interface Position {
  own: number[];
  opp: number[];
  ownBar: number;
  oppBar: number;
  ownOff: number;
  oppOff: number;
}

/** from = 25 → entrée depuis le bar ; to = 0 → sortie (bear-off). */
export interface Hop {
  from: number;
  to: number;
  die: number;
  hit: boolean;
}

export interface Play {
  hops: Hop[];
}

export const BAR_FROM = 25;

export function playerLabel(p: Player): string {
  return p === "white" ? "Blanc" : "Noir";
}

/** Convertit un point global vers la numérotation du joueur. */
export function toOwnCoord(globalIndex: number, mover: Player): number {
  return mover === "white" ? globalIndex : 25 - globalIndex;
}

export function toPosition(board: BoardLike, mover: Player): Position {
  const own = new Array<number>(25).fill(0);
  const opp = new Array<number>(25).fill(0);

  for (const p of board.points) {
    if (p.index < 1 || p.index > 24) continue;
    if (mover === "white") {
      own[p.index] += p.white;
      opp[25 - p.index] += p.black;
    } else {
      own[25 - p.index] += p.black;
      opp[p.index] += p.white;
    }
  }

  return mover === "white"
    ? {
        own,
        opp,
        ownBar: board.barWhite,
        oppBar: board.barBlack,
        ownOff: board.offWhite,
        oppOff: board.offBlack,
      }
    : {
        own,
        opp,
        ownBar: board.barBlack,
        oppBar: board.barWhite,
        ownOff: board.offBlack,
        oppOff: board.offWhite,
      };
}

export function toBoard(pos: Position, mover: Player): BoardLike {
  const points = Array.from({ length: 24 }, (_, i) => ({
    index: i + 1,
    white: 0,
    black: 0,
  }));

  for (let i = 1; i <= 24; i++) {
    const globalOwn = mover === "white" ? i : 25 - i;
    const globalOpp = mover === "white" ? 25 - i : i;
    if (mover === "white") {
      points[globalOwn - 1].white = pos.own[i];
      points[globalOpp - 1].black = pos.opp[i];
    } else {
      points[globalOwn - 1].black = pos.own[i];
      points[globalOpp - 1].white = pos.opp[i];
    }
  }

  return mover === "white"
    ? {
        points,
        barWhite: pos.ownBar,
        barBlack: pos.oppBar,
        offWhite: pos.ownOff,
        offBlack: pos.oppOff,
      }
    : {
        points,
        barWhite: pos.oppBar,
        barBlack: pos.ownBar,
        offWhite: pos.oppOff,
        offBlack: pos.ownOff,
      };
}

/** Pions adverses vus dans la numérotation du joueur au trait. */
export function oppAtOwn(pos: Position, ownCoord: number): number {
  return pos.opp[25 - ownCoord];
}

function isAllHome(pos: Position): boolean {
  if (pos.ownBar > 0) return false;
  for (let i = 7; i <= 24; i++) {
    if (pos.own[i] > 0) return false;
  }
  return true;
}

function legalHops(pos: Position, die: number): Hop[] {
  const hops: Hop[] = [];

  if (pos.ownBar > 0) {
    const to = 25 - die;
    const oppCount = oppAtOwn(pos, to);
    if (oppCount <= 1) {
      hops.push({ from: BAR_FROM, to, die, hit: oppCount === 1 });
    }
    return hops;
  }

  const allHome = isAllHome(pos);
  let highest = 0;
  for (let i = 24; i >= 1; i--) {
    if (pos.own[i] > 0) {
      highest = i;
      break;
    }
  }

  for (let i = 1; i <= 24; i++) {
    if (pos.own[i] <= 0) continue;
    const to = i - die;
    if (to >= 1) {
      const oppCount = oppAtOwn(pos, to);
      if (oppCount <= 1) hops.push({ from: i, to, die, hit: oppCount === 1 });
    } else if (allHome && (i === die || (to < 0 && i === highest))) {
      hops.push({ from: i, to: 0, die, hit: false });
    }
  }

  return hops;
}

export function applyHop(pos: Position, hop: Hop): Position {
  const own = pos.own.slice();
  const opp = pos.opp.slice();
  let { ownBar, oppBar, ownOff } = pos;

  if (hop.from === BAR_FROM) ownBar -= 1;
  else own[hop.from] -= 1;

  if (hop.to === 0) {
    return { own, opp, ownBar, oppBar, ownOff: ownOff + 1, oppOff: pos.oppOff };
  }

  if (hop.hit) {
    opp[25 - hop.to] -= 1;
    oppBar += 1;
  }
  own[hop.to] += 1;

  return { own, opp, ownBar, oppBar, ownOff, oppOff: pos.oppOff };
}

export function positionKey(pos: Position): string {
  return `${pos.own.join(",")}|${pos.opp.join(",")}|${pos.ownBar}|${pos.oppBar}|${pos.ownOff}|${pos.oppOff}`;
}

export interface GeneratedPlay {
  play: Play;
  result: Position;
}

/**
 * Génère tous les coups légaux distincts pour un jet (règles complètes :
 * entrée obligatoire depuis le bar, usage maximal des dés, dé fort si un
 * seul dé jouable, doubles ×4, bear-off).
 */
export function generatePlays(pos: Position, d1: number, d2: number): GeneratedPlay[] {
  const sequences: number[][] =
    d1 === d2 ? [[d1, d1, d1, d1]] : [[d1, d2], [d2, d1]];

  const terminal = new Map<string, GeneratedPlay>();
  let maxHops = 0;

  const visit = (current: Position, dice: number[], hops: Hop[]) => {
    const nextHops = dice.length > 0 ? legalHops(current, dice[0]) : [];

    if (dice.length === 0 || nextHops.length === 0) {
      if (hops.length > maxHops) maxHops = hops.length;
      const key = `${hops.length}:${positionKey(current)}`;
      if (!terminal.has(key)) {
        terminal.set(key, { play: { hops }, result: current });
      }
      return;
    }

    for (const hop of nextHops) {
      visit(applyHop(current, hop), dice.slice(1), [...hops, hop]);
    }
  };

  for (const seq of sequences) {
    visit(pos, seq, []);
  }

  let plays = [...terminal.values()].filter((p) => p.play.hops.length === maxHops);

  // Règle du dé fort : si un seul dé est jouable, il faut jouer le plus grand.
  if (d1 !== d2 && maxHops === 1) {
    const bigDie = Math.max(d1, d2);
    const withBig = plays.filter((p) => p.play.hops[0].die === bigDie);
    if (withBig.length > 0) plays = withBig;
  }

  // Dédoublonner par position finale (ordres de dés équivalents).
  const unique = new Map<string, GeneratedPlay>();
  for (const p of plays) {
    const key = positionKey(p.result);
    if (!unique.has(key)) unique.set(key, p);
  }

  return [...unique.values()];
}

function fmtPoint(p: number): string {
  if (p === BAR_FROM) return "bar";
  if (p === 0) return "off";
  return String(p);
}

// Notation standard (style XG/GNU BG) dans la numérotation du joueur :
// fusion des trajets d'un même pion ("24/18*/13"), regroupement "13/11(2)",
// astérisque sur les frappes.
export function playNotation(play: Play): string {
  if (play.hops.length === 0) return "aucun coup possible";

  interface Chain {
    points: number[];
    hits: boolean[];
  }
  const chains: Chain[] = [];

  for (const hop of play.hops) {
    const chain = chains.find((c) => c.points[c.points.length - 1] === hop.from);
    if (chain && hop.from !== BAR_FROM) {
      chain.points.push(hop.to);
      chain.hits.push(hop.hit);
    } else {
      chains.push({ points: [hop.from, hop.to], hits: [hop.hit] });
    }
  }

  const tokens = chains.map((c) => {
    // Ne garder les étapes intermédiaires que si elles frappent.
    const pts: number[] = [c.points[0]];
    const hits: boolean[] = [];
    for (let i = 1; i < c.points.length; i++) {
      const isLast = i === c.points.length - 1;
      const hit = c.hits[i - 1];
      if (isLast || hit) {
        pts.push(c.points[i]);
        hits.push(hit);
      }
    }
    let s = fmtPoint(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      s += `/${fmtPoint(pts[i])}${hits[i - 1] ? "*" : ""}`;
    }
    return s;
  });

  // Regroupement des tokens identiques : "6/4(2)".
  const counts = new Map<string, number>();
  const order: string[] = [];
  for (const t of tokens) {
    if (!counts.has(t)) order.push(t);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  return order
    .map((t) => (counts.get(t)! > 1 ? `${t}(${counts.get(t)})` : t))
    .join(" ");
}

/** Compte de pips par joueur (numérotation globale). */
export function pipCounts(board: BoardLike): { white: number; black: number } {
  let white = board.barWhite * 25;
  let black = board.barBlack * 25;
  for (const p of board.points) {
    white += p.white * p.index;
    black += p.black * (25 - p.index);
  }
  return { white, black };
}

/** Position de départ standard. */
export function standardBoard(): BoardLike {
  const points = Array.from({ length: 24 }, (_, i) => ({
    index: i + 1,
    white: 0,
    black: 0,
  }));
  // Blanc (24 → 1) : 24(2), 13(5), 8(3), 6(5)
  points[23].white = 2;
  points[12].white = 5;
  points[7].white = 3;
  points[5].white = 5;
  // Noir (1 → 24) : 1(2), 12(5), 17(3), 19(5)
  points[0].black = 2;
  points[11].black = 5;
  points[16].black = 3;
  points[18].black = 5;

  return { points, barWhite: 0, barBlack: 0, offWhite: 0, offBlack: 0 };
}
