import { useCallback, useState } from "react";
import {
  DEFAULT_CALIBRATION,
  loadCalibration,
  saveCalibration,
  type BoardCalibration,
  type CalibrationPhase,
  type GamePhase,
  type NormPoint,
} from "../types/board";

export function useBoardCalibration() {
  const [calibration, setCalibration] = useState<BoardCalibration>(loadCalibration);
  const [calibrationPhase, setCalibrationPhase] = useState<CalibrationPhase>("adjust");
  const [gamePhase, setGamePhase] = useState<GamePhase>("calibration");

  const setCorner = useCallback((index: 0 | 1 | 2 | 3, point: NormPoint) => {
    setCalibration((prev) => {
      const corners = [...prev.corners] as BoardCalibration["corners"];
      corners[index] = {
        x: Math.max(0.02, Math.min(0.98, point.x)),
        y: Math.max(0.02, Math.min(0.98, point.y)),
      };
      return { corners };
    });
  }, []);

  const resetCalibration = useCallback(() => {
    setCalibration(DEFAULT_CALIBRATION);
    setCalibrationPhase("adjust");
    setGamePhase("calibration");
  }, []);

  const confirmPreview = useCallback(() => {
    saveCalibration(calibration);
    setCalibrationPhase("preview");
  }, [calibration]);

  const startGame = useCallback(() => {
    saveCalibration(calibration);
    setCalibrationPhase("playing");
    setGamePhase("playing");
  }, [calibration]);

  const backToAdjust = useCallback(() => {
    setCalibrationPhase("adjust");
    setGamePhase("calibration");
  }, []);

  return {
    calibration,
    setCalibration,
    setCorner,
    resetCalibration,
    calibrationPhase,
    gamePhase,
    confirmPreview,
    startGame,
    backToAdjust,
    isPlaying: gamePhase === "playing",
  };
}
