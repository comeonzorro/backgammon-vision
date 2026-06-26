import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "bgv-session";

export interface GameSession {
  playerWhite: string;
  playerBlack: string;
  startedAt: number | null;
}

function loadSession(): Pick<GameSession, "playerWhite" | "playerBlack"> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { playerWhite: "Joueur 1", playerBlack: "Joueur 2" };
    const parsed = JSON.parse(raw) as Partial<GameSession>;
    return {
      playerWhite: parsed.playerWhite?.trim() || "Joueur 1",
      playerBlack: parsed.playerBlack?.trim() || "Joueur 2",
    };
  } catch {
    return { playerWhite: "Joueur 1", playerBlack: "Joueur 2" };
  }
}

function persistNames(playerWhite: string, playerBlack: string) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ playerWhite, playerBlack }),
  );
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useGameSession(streamActive: boolean) {
  const [names, setNames] = useState(loadSession);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (streamActive) {
      setStartedAt((prev) => prev ?? Date.now());
      return;
    }
    setStartedAt(null);
    setElapsedMs(0);
  }, [streamActive]);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const setPlayerWhite = useCallback((playerWhite: string) => {
    setNames((prev) => {
      const next = { ...prev, playerWhite };
      persistNames(next.playerWhite, next.playerBlack);
      return next;
    });
  }, []);

  const setPlayerBlack = useCallback((playerBlack: string) => {
    setNames((prev) => {
      const next = { ...prev, playerBlack };
      persistNames(next.playerWhite, next.playerBlack);
      return next;
    });
  }, []);

  return {
    playerWhite: names.playerWhite,
    playerBlack: names.playerBlack,
    setPlayerWhite,
    setPlayerBlack,
    startedAt,
    elapsedMs,
    sessionDate: new Date(),
  };
}
