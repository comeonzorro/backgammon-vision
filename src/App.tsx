import { useEffect, useMemo, useState } from "react";
import { BackgammonBoard } from "./components/BackgammonBoard";
import { GameSessionPanel } from "./components/GameSessionPanel";
import { MoveHistory } from "./components/MoveHistory";
import { ObsConnectModal } from "./components/ObsConnectModal";
import { SidebarControls } from "./components/SidebarControls";
import { StrategyPanel } from "./components/StrategyPanel";
import { VideoPanel } from "./components/VideoPanel";
import { useDiceDetection } from "./hooks/useDiceDetection";
import { useGameSession } from "./hooks/useGameSession";
import { useVideoSource } from "./hooks/useVideoSource";
import { createInitialBoard, analyzePosition, snapshotFromDice } from "./lib/strategyEngine";
import type { AppMode, GameSnapshot, HistoryEntry, StrategyAdvice } from "./types";
import styles from "./App.module.css";

export default function App() {
  const [mode, setMode] = useState<AppMode>("player");
  const [obsOpen, setObsOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [autoCameraTried, setAutoCameraTried] = useState(false);
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

  const video = useVideoSource();
  const session = useGameSession(video.state.active);
  const streamActiveForDetection =
    video.state.active && video.state.kind !== "youtube";
  const detection = useDiceDetection(video.videoRef, streamActiveForDetection);

  useEffect(() => {
    if (autoCameraTried || video.state.active) return;
    setAutoCameraTried(true);
    void video.startCamera();
  }, [autoCameraTried, video]);

  useEffect(() => {
    if (streamActiveForDetection && !detection.liveMode) {
      detection.setLiveMode(true);
    }
  }, [streamActiveForDetection]);

  useEffect(() => {
    if (!detection.confirmedRoll) return;

    const { dice, frame } = detection.confirmedRoll;
    if (dice.length < 2) return;

    const source = frame.source;
    setSnapshot((prev) => {
      const next = snapshotFromDice(dice, prev);
      const strat = analyzePosition(next, dice);
      setAdvice(strat);
      setHistory((h) => [
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          label: `Lecture caméra (${source})`,
          dice,
          move: strat.bestMove,
        },
        ...h.slice(0, 49),
      ]);
      return next;
    });
  }, [detection.confirmedRoll?.timestamp]);

  const handleYouTube = (url: string) => {
    setYoutubeUrl(url);
    video.startYouTube(url);
  };

  const layoutClass = useMemo(
    () => (mode === "streamer" ? styles.streamerLayout : styles.playerLayout),
    [mode],
  );

  return (
    <div className={styles.app}>
      <main className={layoutClass}>
        <section className={styles.stage} aria-label="Vue plateau">
          <VideoPanel
            videoRef={video.videoRef}
            sourceKind={video.state.kind}
            youtubeInput={youtubeUrl}
            active={video.state.active}
            detectionFrame={detection.lastFrame}
            showOverlay={detection.liveMode}
            detectionStatus={detection.status}
            fillStage
          />

          {!video.state.active && video.state.error && (
            <p className={styles.cameraError}>{video.state.error}</p>
          )}
        </section>

        <aside className={styles.sidebar}>
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
            advice={advice}
            dice={detection.diceValues}
            detecting={detection.detecting}
            status={detection.status}
            confirmed={detection.status === "confirmed"}
          />

          <BackgammonBoard
            points={snapshot.points}
            barWhite={snapshot.barWhite}
            barBlack={snapshot.barBlack}
            offWhite={snapshot.offWhite}
            offBlack={snapshot.offBlack}
            compact
          />

          <MoveHistory entries={history.slice(0, 8)} />

          <SidebarControls
            state={video.state}
            localOffer={video.localOffer}
            detecting={detection.detecting}
            liveMode={detection.liveMode}
            useOnnx={detection.useOnnx}
            detectionHz={detection.detectionHz}
            streamActiveForDetection={streamActiveForDetection}
            onStartCamera={() => video.startCamera()}
            onStartObs={() => setObsOpen(true)}
            onStartYouTube={handleYouTube}
            onStartWebRtcViewer={() => video.createWebRtcOffer()}
            onStartWebRtcBroadcast={() => video.startWebRtcBroadcast()}
            onApplyAnswer={video.applyWebRtcAnswer}
            onStop={video.stop}
            onDetectOnce={() => void detection.runOnce()}
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
        </aside>
      </main>

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
