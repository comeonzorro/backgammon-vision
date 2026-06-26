import { useEffect, useMemo, useState } from "react";
import { BackgammonBoard } from "../components/BackgammonBoard";
import { GameSessionPanel } from "../components/GameSessionPanel";
import { LiveChat } from "../components/LiveChat";
import { LiveConnectPanel } from "../components/LiveConnectPanel";
import { MoveHistory } from "../components/MoveHistory";
import { ObsConnectModal } from "../components/ObsConnectModal";
import { SidebarControls } from "../components/SidebarControls";
import { StrategyPanel } from "../components/StrategyPanel";
import { VideoPanel } from "../components/VideoPanel";
import { useCameraDevices } from "../hooks/useCameraDevices";
import { useDiceDetection } from "../hooks/useDiceDetection";
import { useGameSession } from "../hooks/useGameSession";
import { useLiveRoom } from "../hooks/useLiveRoom";
import { useVideoFramePublisher } from "../hooks/useVideoFramePublisher";
import { useVideoSource } from "../hooks/useVideoSource";
import { createRoomId } from "../lib/videoInputs";
import { createInitialBoard, analyzePosition, snapshotFromDice } from "../lib/strategyEngine";
import type { AppMode, GameSnapshot, HistoryEntry, StrategyAdvice } from "../types";
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
  const cameras = useCameraDevices(true);
  const session = useGameSession(video.state.active);
  const streamActiveForDetection =
    video.state.active && video.state.kind !== "youtube";
  const detection = useDiceDetection(video.videoRef, streamActiveForDetection);

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
