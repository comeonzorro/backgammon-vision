export type VideoSourceKind =
  | "camera"
  | "webrtc"
  | "hls"
  | "youtube"
  | "obs-virtual"
  | "mjpeg"
  | "remote-webrtc";

export type AppMode = "player" | "streamer";

export interface DiceDetection {
  value: number;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DetectionStatus =
  | "idle"
  | "searching"
  | "rolling"
  | "tracking"
  | "confirmed";

export interface DetectionFrame {
  timestamp: number;
  dice: DiceDetection[];
  source: "camera-cv" | "onnx";
  motionScore?: number;
}

export interface ConfirmedRoll {
  timestamp: number;
  dice: number[];
  confidence: number;
  frame: DetectionFrame;
}

export interface BackgammonPoint {
  index: number;
  white: number;
  black: number;
}

export interface GameSnapshot {
  id: string;
  timestamp: number;
  dice: number[];
  points: BackgammonPoint[];
  barWhite: number;
  barBlack: number;
  offWhite: number;
  offBlack: number;
  activePlayer: "white" | "black";
}

export interface StrategyAdvice {
  bestMove: string;
  equity: number;
  winChance: number;
  spectatorComment: string;
  alternatives: string[];
  riskLevel: "low" | "medium" | "high";
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  label: string;
  dice: number[];
  move?: string;
}

export interface StreamConnectionInfo {
  kind: VideoSourceKind;
  label: string;
  detail?: string;
  active: boolean;
}

export interface ObsSetupStep {
  title: string;
  description: string;
}
