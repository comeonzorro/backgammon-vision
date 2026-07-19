import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackgammonBoard } from "../components/BackgammonBoard";
import { CalibrationPanel } from "../components/CalibrationPanel";
import { GameSessionPanel } from "../components/GameSessionPanel";
import { LiveChat } from "../components/LiveChat";
import { LiveConnectPanel } from "../components/LiveConnectPanel";
import { MobileTabBar } from "../components/MobileTabBar";
import { MoveHistory } from "../components/MoveHistory";
import { ObsConnectModal } from "../components/ObsConnectModal";
import { SidebarControls } from "../components/SidebarControls";
import { StrategyPanel } from "../components/StrategyPanel";
import { VideoPanel } from "../components/VideoPanel";
import { useBoardCalibration } from "../hooks/useBoardCalibration";
import { useBoardDetection } from "../hooks/useBoardDetection";
import { useCameraDevices } from "../hooks/useCameraDevices";
import { useCompactLayout } from "../hooks/useCompactLayout";
import { useDiceDetection } from "../hooks/useDiceDetection";
import { useGameSession } from "../hooks/useGameSession";
import { useLiveRoom } from "../hooks/useLiveRoom";
import { useVideoFramePublisher } from "../hooks/useVideoFramePublisher";
import { useVideoSource } from "../hooks/useVideoSource";
import { autoDetectBoardCorners } from "../lib/autoCalibrateBoard";
import { detectionToSnapshot, resolveBoardMapping } from "../lib/boardVision";
import { createRoomId } from "../lib/videoInputs";
import {
  createInitialBoard,
  analyzePosition,
  snapshotFromDice,
  inferMoveFromSnapshots,
} from "../lib/strategyEngine";
import type { AppMode, GameSnapshot, HistoryEntry, StrategyAdvice } from "../types";
import type { BoardMapping } from "../types/board";
import { loadBoardMapping, saveBoardMapping } from "../types/board";
import type { LiveBroadcastState, SpectatorLayout } from "../types/live";
import { DEFAULT_SPECTATOR_LAYOUT } from "../types/live";
import styles from "../App.module.css";

export function TableApp() {
  const [mode, setMode] = useState<AppMode>("player");
  const [obsOpen, setObsOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [autoCameraTried, setAutoCameraTried] = useState(false);
  const [roomId, setRoomId] = useState(() => localStorage.getItem("bgv-room") || createRoomId());
  const [liveEnabled, setLiveEnabled] = useState(false);
  const [hostName, setHostName] = useState(
    () => localStorage.getItem("bgv-host-name") || "Table 1",
  );
  const [chatAuthor, setChatAuthor] = useState(
    () => localStorage.getItem("bgv-chat-name") || "Organisation",
  );
  const [spectatorLayout, setSpectatorLayout] = useState<SpectatorLayout>(DEFAULT_SPECTATOR_LAYOUT);
  const autoBoardTriedRef = useRef(false);

  const { compact, mobileTab, setMobileTab } = useCompactLayout();

  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => ({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    dice: [],
    points: createInitialBoard(),
    barWhite: 0,
    barBlack: 0,
    offWhite: 0,
    offBlack: 0,
    activePlayer: "white",
  }));
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [advice, setAdvice] = useState<StrategyAdvice | null>(null);

  // Jet en attente de transcription : dès que la position détectée après le
  // jet correspond à un coup légal, le coup joué est transcrit (style
  // Digigammon/BG Blitz) et la position est recalée sur la position légale.
  const pendingRollRef = useRef<{
    dice: number[];
    mover: "white" | "black";
    baseline: GameSnapshot;
  } | null>(null);

  // Orientation / numérotation du plateau (portrait ou paysage), résolue
  // automatiquement à partir de la position de départ standard.
  const [boardMapping, setBoardMapping] = useState<BoardMapping | null>(loadBoardMapping);

  const video = useVideoSource();
  const cameras = useCameraDevices(true);
  const boardCalib = useBoardCalibration();
  const streamActiveForDetection =
    video.state.active && video.state.kind !== "youtube";

  const diceStreamActive =
    streamActiveForDetection &&
    (boardCalib.calibrationPhase === "preview" || boardCalib.isPlaying);

  const boardDetection = useBoardDetection(
    video.videoRef,
    boardCalib.calibration,
    streamActiveForDetection,
    boardCalib.isPlaying,
    boardMapping,
  );

  const detection = useDiceDetection(
    video.videoRef,
    diceStreamActive,
    boardCalib.calibration,
  );

  const session = useGameSession(video.state.active && boardCalib.isPlaying);

  const live = useLiveRoom({
    role: "host",
    roomId,
    hostName,
    enabled: liveEnabled,
  });

  useEffect(() => {
    localStorage.setItem("bgv-room", roomId);
  }, [roomId]);

  useEffect(() => {
    localStorage.setItem("bgv-host-name", hostName);
    localStorage.setItem("bgv-chat-name", chatAuthor);
  }, [hostName, chatAuthor]);

  useEffect(() => {
    if (autoCameraTried || video.state.active) return;
    setAutoCameraTried(true);
    void video.startCamera();
  }, [autoCameraTried, video]);

  useEffect(() => {
    if (diceStreamActive && !detection.liveMode) {
      detection.setLiveMode(true);
    }
  }, [diceStreamActive, detection.liveMode, detection.setLiveMode]);

  const captureFrame = useCallback(() => {
    const videoEl = video.videoRef.current;
    if (!videoEl || videoEl.readyState < 2) return null;
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(videoEl, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  }, [video.videoRef]);

  const handleAutoDetectBoard = useCallback(() => {
    const imageData = captureFrame();
    if (!imageData) return;
    const detected = autoDetectBoardCorners(imageData);
    if (detected) {
      boardCalib.applyCorners(detected.corners);
      if (compact) setMobileTab("game");
    }
  }, [captureFrame, boardCalib, compact, setMobileTab]);

  // Résout l'orientation/numérotation en comparant la détection à la
  // position de départ standard (à faire pions en position initiale).
  const resolveMapping = useCallback(() => {
    const imageData = captureFrame();
    if (!imageData) return;
    const resolved = resolveBoardMapping(imageData, boardCalib.calibration);
    if (resolved && resolved.distance <= 14) {
      setBoardMapping(resolved.mapping);
      saveBoardMapping(resolved.mapping);
    }
  }, [captureFrame, boardCalib.calibration]);

  const handleConfirmPreview = useCallback(() => {
    resolveMapping();
    boardCalib.confirmPreview();
  }, [resolveMapping, boardCalib]);

  const handleResetCalibration = useCallback(() => {
    setBoardMapping(null);
    saveBoardMapping(null);
    boardCalib.resetCalibration();
  }, [boardCalib]);

  useEffect(() => {
    if (
      !video.state.active ||
      boardCalib.calibrationPhase !== "adjust" ||
      autoBoardTriedRef.current
    ) {
      return;
    }
    autoBoardTriedRef.current = true;
    const id = window.setTimeout(() => handleAutoDetectBoard(), 900);
    return () => window.clearTimeout(id);
  }, [video.state.active, boardCalib.calibrationPhase, handleAutoDetectBoard]);

  useEffect(() => {
    if (!boardCalib.isPlaying || !boardDetection.stable) return;
    const det = boardDetection.stable;

    // Transcription du coup joué : la position détectée est comparée aux
    // positions légales atteignables depuis le jet confirmé.
    const pending = pendingRollRef.current;
    if (pending) {
      const inferred = inferMoveFromSnapshots(
        pending.baseline,
        det.points.map((p) => ({ index: p.index, white: p.white, black: p.black })),
        det.barWhite,
        det.barBlack,
        pending.mover,
        pending.dice,
      );
      if (inferred && inferred.distance <= 2) {
        pendingRollRef.current = null;
        const label = pending.mover === "white" ? "Blanc" : "Noir";
        setHistory((h) => [
          {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            label: `${label} joue`,
            dice: pending.dice,
            move: inferred.exact ? inferred.notation : `${inferred.notation} (recalé)`,
          },
          ...h.slice(0, 49),
        ]);
        // Position recalée sur le coup légal : corrige le bruit caméra.
        setSnapshot((prev) => ({
          ...prev,
          points: inferred.board.points,
          barWhite: inferred.board.barWhite,
          barBlack: inferred.board.barBlack,
          offWhite: inferred.board.offWhite,
          offBlack: inferred.board.offBlack,
          timestamp: det.timestamp,
        }));
        return;
      }
    }

    setSnapshot((prev) => ({
      ...prev,
      points: det.points.map((p) => ({
        index: p.index,
        white: p.white,
        black: p.black,
      })),
      barWhite: det.barWhite,
      barBlack: det.barBlack,
      offWhite: det.offWhite,
      offBlack: det.offBlack,
      timestamp: det.timestamp,
    }));
  }, [boardDetection.stable?.timestamp, boardCalib.isPlaying]);

  const applyStandardBoard = () => {
    setSnapshot((prev) => ({
      ...prev,
      points: createInitialBoard(),
      barWhite: 0,
      barBlack: 0,
      offWhite: 0,
      offBlack: 0,
    }));
  };

  const handleStartGame = () => {
    // Re-résout le mapping au démarrage (pions encore en position initiale).
    resolveMapping();
    if (boardDetection.preview && boardDetection.preview.confidence >= 0.35) {
      const board = detectionToSnapshot(boardDetection.preview);
      setSnapshot((prev) => ({ ...prev, ...board }));
    } else {
      applyStandardBoard();
    }
    boardCalib.startGame();
  };

  useEffect(() => {
    if (!detection.confirmedRoll) return;
    const { dice } = detection.confirmedRoll;
    if (dice.length < 2) return;
    setSnapshot((prev) => {
      const next = snapshotFromDice(dice, prev);
      const strat = analyzePosition(next, dice);
      setAdvice(strat);
      const label = next.activePlayer === "white" ? "Blanc" : "Noir";
      pendingRollRef.current = {
        dice,
        mover: next.activePlayer,
        baseline: prev,
      };
      setHistory((h) => [
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          label: `Jet ${label} (caméra)`,
          dice,
          move: strat.bestMove,
        },
        ...h.slice(0, 49),
      ]);
      return next;
    });
  }, [detection.confirmedRoll?.timestamp]);

  useEffect(() => {
    if (!live.connected) return;
    return live.onWebRtcSignal(async (msg) => {
      if (msg.type === "offer" && msg.sdp) {
        const answer = await video.applyRemoteOffer(msg.sdp);
        live.relayWebRtcAnswer(msg.from, answer);
        const pc = video.getPeerConnection();
        pc.onicecandidate = (ev) => {
          if (ev.candidate) live.relayIce(msg.from, ev.candidate.toJSON());
        };
      }
      if (msg.type === "ice" && msg.candidate) {
        void video.addIceCandidate(msg.candidate);
      }
    });
  }, [live.connected, live.onWebRtcSignal, live.relayWebRtcAnswer, live.relayIce, video]);

  const broadcastPayload = useMemo((): LiveBroadcastState | null => {
    if (!liveEnabled || !live.connected) return null;
    return {
      updatedAt: Date.now(),
      playerWhite: session.playerWhite,
      playerBlack: session.playerBlack,
      elapsedMs: session.elapsedMs,
      sessionDate: session.sessionDate.toISOString(),
      dice: detection.diceValues,
      diceStatus: detection.status,
      diceConfirmed: detection.status === "confirmed",
      advice,
      history: history.slice(0, 12),
      board: {
        points: snapshot.points,
        barWhite: snapshot.barWhite,
        barBlack: snapshot.barBlack,
        offWhite: snapshot.offWhite,
        offBlack: snapshot.offBlack,
      },
      videoLabel: video.state.label,
      videoActive: video.state.active,
      layout: spectatorLayout,
    };
  }, [
    liveEnabled,
    live.connected,
    session,
    detection.diceValues,
    detection.status,
    advice,
    history,
    snapshot,
    video.state,
    spectatorLayout,
  ]);

  useEffect(() => {
    if (!broadcastPayload) return;
    live.publishState(broadcastPayload);
    const id = window.setInterval(() => {
      live.publishState({ ...broadcastPayload, updatedAt: Date.now() });
    }, 800);
    return () => window.clearInterval(id);
  }, [broadcastPayload, live.publishState]);

  useEffect(() => {
    if (live.connected && liveEnabled) {
      live.publishLayout(spectatorLayout);
    }
  }, [spectatorLayout, live.connected, liveEnabled, live.publishLayout]);

  useVideoFramePublisher(
    video.videoRef,
    liveEnabled &&
      live.connected &&
      spectatorLayout.zones.includes("video") &&
      video.state.kind !== "remote-webrtc",
    live.publishVideoFrame,
    3,
  );

  const handleYouTube = (url: string) => {
    setYoutubeUrl(url);
    video.startYouTube(url);
  };

  const displayBoard = useMemo(() => {
    if (boardCalib.isPlaying) {
      return {
        points: snapshot.points,
        barWhite: snapshot.barWhite,
        barBlack: snapshot.barBlack,
        offWhite: snapshot.offWhite,
        offBlack: snapshot.offBlack,
        confidence: boardDetection.confidence,
        pointConfidence: boardDetection.stable?.pointConfidence,
        live: true,
      };
    }
    const prev = boardDetection.preview;
    if (prev) {
      return {
        points: prev.points.map((p) => ({
          index: p.index,
          white: p.white,
          black: p.black,
        })),
        barWhite: prev.barWhite,
        barBlack: prev.barBlack,
        offWhite: prev.offWhite,
        offBlack: prev.offBlack,
        confidence: prev.confidence,
        pointConfidence: prev.pointConfidence,
        live: false,
      };
    }
    return {
      points: snapshot.points,
      barWhite: snapshot.barWhite,
      barBlack: snapshot.barBlack,
      offWhite: snapshot.offWhite,
      offBlack: snapshot.offBlack,
      confidence: 0,
      pointConfidence: undefined as Record<number, number> | undefined,
      live: false,
    };
  }, [boardCalib.isPlaying, snapshot, boardDetection.preview, boardDetection.stable, boardDetection.confidence]);

  const layoutClass = useMemo(
    () => (mode === "streamer" ? styles.streamerLayout : styles.playerLayout),
    [mode],
  );

  const diceActive = boardCalib.calibrationPhase === "preview" || boardCalib.isPlaying;

  return (
    <div className={styles.app}>
      <div className={compact ? styles.compactLayout : undefined}>
        <main className={layoutClass}>
          <section
            className={`${styles.stage} ${compact && mobileTab !== "camera" ? styles.stageHidden : ""}`}
            aria-label="Vue plateau"
          >
            <VideoPanel
              videoRef={video.videoRef}
              sourceKind={video.state.kind}
              youtubeInput={youtubeUrl}
              active={video.state.active}
              detectionFrame={detection.lastFrame}
              showOverlay={detection.liveMode && diceActive}
              detectionStatus={detection.status}
              fillStage
              calibration={boardCalib.calibration}
              calibrationPhase={boardCalib.calibrationPhase}
              onCornerMove={boardCalib.setCorner}
              showCalibration={!boardCalib.isPlaying}
            />
            {!video.state.active && video.state.error && (
              <p className={styles.cameraError}>{video.state.error}</p>
            )}
          </section>

          <aside
            className={`${styles.sidebar} ${compact ? styles.sidebarCompact : ""} ${compact && mobileTab !== "game" ? styles.sidebarHidden : ""}`}
          >
            <div className={styles.gameEssentials}>
              <GameSessionPanel
                playerWhite={session.playerWhite}
                playerBlack={session.playerBlack}
                onPlayerWhiteChange={session.setPlayerWhite}
                onPlayerBlackChange={session.setPlayerBlack}
                sessionDate={session.sessionDate}
                elapsedMs={session.elapsedMs}
                streamActive={video.state.active}
                detectionCount={history.length}
                liveMode={detection.liveMode}
              />

              <StrategyPanel
                advice={boardCalib.isPlaying ? advice : null}
                dice={diceActive ? detection.diceValues : []}
                detecting={detection.detecting}
                status={diceActive ? detection.status : "idle"}
                confirmed={detection.status === "confirmed"}
                compact={compact}
              />

              <BackgammonBoard
                points={displayBoard.points}
                barWhite={displayBoard.barWhite}
                barBlack={displayBoard.barBlack}
                offWhite={displayBoard.offWhite}
                offBlack={displayBoard.offBlack}
                compact
                live={displayBoard.live || boardCalib.calibrationPhase === "preview"}
                confidence={displayBoard.confidence}
                pointConfidence={displayBoard.pointConfidence}
              />

              <CalibrationPanel
                calibrationPhase={boardCalib.calibrationPhase}
                gamePhase={boardCalib.gamePhase}
                preview={boardDetection.preview}
                confidence={boardDetection.confidence}
                detecting={boardDetection.detecting}
                onAutoDetect={handleAutoDetectBoard}
                onConfirmPreview={handleConfirmPreview}
                onStartGame={handleStartGame}
                onBackToAdjust={boardCalib.backToAdjust}
                onReset={handleResetCalibration}
                onApplyStandard={applyStandardBoard}
              />
            </div>

            <div className={styles.gameAdvanced}>
              <LiveConnectPanel
                roomId={roomId}
                onRoomIdChange={setRoomId}
                liveEnabled={liveEnabled}
                onLiveEnabledChange={setLiveEnabled}
                connected={live.connected}
                peerCount={live.peerCount}
                error={live.error}
                layout={spectatorLayout}
                onLayoutChange={setSpectatorLayout}
                hostName={hostName}
                onHostNameChange={setHostName}
              />

              <MoveHistory entries={history.slice(0, 8)} />

              {live.connected && liveEnabled && (
                <LiveChat
                  messages={live.chat}
                  onSend={live.sendChat}
                  author={chatAuthor}
                  onAuthorChange={setChatAuthor}
                />
              )}

              <SidebarControls
                state={video.state}
                devices={cameras.devices}
                devicesReady={cameras.ready}
                onRequestPermission={cameras.requestPermission}
                detecting={detection.detecting}
                liveMode={detection.liveMode}
                useOnnx={detection.useOnnx}
                detectionHz={detection.detectionHz}
                streamActiveForDetection={streamActiveForDetection}
                liveRoomId={roomId}
                onStartCamera={(id, label) => video.startCamera(id, label)}
                onStartObs={() => setObsOpen(true)}
                onStartHls={(url) => video.startHls(url)}
                onStartMjpeg={(url) => video.startMjpeg(url)}
                onStartYouTube={handleYouTube}
                onStop={video.stop}
                onDetectOnce={() => void detection.runOnce(true)}
                onToggleLive={() => detection.setLiveMode(!detection.liveMode)}
                onToggleOnnx={detection.setUseOnnx}
              />

              <div className={styles.modeToggle}>
                <button
                  type="button"
                  className={mode === "player" ? styles.activeMode : ""}
                  onClick={() => setMode("player")}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={mode === "streamer" ? styles.activeMode : ""}
                  onClick={() => setMode("streamer")}
                >
                  OBS overlay
                </button>
              </div>
            </div>
          </aside>
        </main>

        {compact && <MobileTabBar tab={mobileTab} onChange={setMobileTab} />}
      </div>

      {mode === "streamer" && (
        <p className={styles.streamerHint}>
          Mode overlay OBS : Browser Source vers cette URL · flux principal géré par OBS.
        </p>
      )}

      <ObsConnectModal
        open={obsOpen}
        onClose={() => setObsOpen(false)}
        onConnectVirtualCam={() => {
          void video.startObsVirtual();
          setObsOpen(false);
        }}
        onConnectHls={(url) => video.startHls(url)}
      />
    </div>
  );
}
