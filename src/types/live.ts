import type { DetectionStatus, HistoryEntry, StrategyAdvice } from "../types";

export type LiveRole = "host" | "camera" | "spectator";

export type SpectatorZone =
  | "video"
  | "brand"
  | "dice"
  | "analysis"
  | "board"
  | "history"
  | "chat";

export interface SpectatorLayout {
  zones: SpectatorZone[];
}

// Le mini-plateau et l'historique sont inclus par défaut : la position doit
// rester visible en diffusion OBS même si le flux vidéo est coupé ou flou.
export const DEFAULT_SPECTATOR_LAYOUT: SpectatorLayout = {
  zones: ["video", "brand", "dice", "analysis", "board", "history", "chat"],
};

export const ALL_SPECTATOR_ZONES: { id: SpectatorZone; label: string }[] = [
  { id: "video", label: "Flux vidéo plateau" },
  { id: "brand", label: "Logo, joueurs, date, durée" },
  { id: "dice", label: "Dés lus" },
  { id: "analysis", label: "Analyse & commentaire" },
  { id: "board", label: "Mini-plateau" },
  { id: "history", label: "Historique coups" },
  { id: "chat", label: "Chat live" },
];

export interface ChatMessage {
  id: string;
  room: string;
  author: string;
  text: string;
  timestamp: number;
}

export interface LiveBroadcastState {
  updatedAt: number;
  playerWhite: string;
  playerBlack: string;
  elapsedMs: number;
  sessionDate: string;
  dice: number[];
  diceStatus: DetectionStatus;
  diceConfirmed: boolean;
  advice: StrategyAdvice | null;
  history: HistoryEntry[];
  board: {
    points: { index: number; white: number; black: number }[];
    barWhite: number;
    barBlack: number;
    offWhite: number;
    offBlack: number;
  };
  videoLabel: string;
  videoActive: boolean;
  layout: SpectatorLayout;
  videoFrame?: string;
}

export type LiveClientMessage =
  | { type: "join"; room: string; role: LiveRole; name: string }
  | { type: "state"; room: string; payload: LiveBroadcastState }
  | { type: "layout"; room: string; payload: SpectatorLayout }
  | { type: "chat"; room: string; payload: { text: string; author: string } }
  | {
      type: "webrtc-offer";
      room: string;
      from: string;
      target: "host" | "camera" | "all";
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc-answer";
      room: string;
      from: string;
      target: string;
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: "webrtc-ice";
      room: string;
      from: string;
      target: string;
      candidate: RTCIceCandidateInit;
    }
  | { type: "video-frame"; room: string; payload: string };

export type LiveServerMessage =
  | { type: "joined"; room: string; role: LiveRole; peerCount: number; clientId: string }
  | { type: "state"; payload: LiveBroadcastState }
  | { type: "layout"; payload: SpectatorLayout }
  | { type: "chat"; payload: ChatMessage }
  | { type: "webrtc-offer"; from: string; target: string; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc-answer"; from: string; target: string; sdp: RTCSessionDescriptionInit }
  | { type: "webrtc-ice"; from: string; target: string; candidate: RTCIceCandidateInit }
  | { type: "video-frame"; payload: string }
  | { type: "peer-joined"; role: LiveRole; name: string; clientId: string }
  | { type: "peer-left"; clientId: string }
  | { type: "error"; message: string };
