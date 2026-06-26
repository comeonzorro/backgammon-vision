import { BackgammonBoard } from "./BackgammonBoard";
import { GameSessionPanel } from "./GameSessionPanel";
import { LiveChat } from "./LiveChat";
import { StrategyPanel } from "./StrategyPanel";
import { MoveHistory } from "./MoveHistory";
import type { ChatMessage, LiveBroadcastState, SpectatorLayout } from "../types/live";
import styles from "./SpectatorView.module.css";

interface Props {
  state: LiveBroadcastState | null;
  layout: SpectatorLayout;
  videoFrame: string | null;
  chat: ChatMessage[];
  onSendChat: (text: string, author: string) => void;
  chatAuthor: string;
  onChatAuthorChange: (name: string) => void;
  connected: boolean;
}

export function SpectatorView({
  state,
  layout,
  videoFrame,
  chat,
  onSendChat,
  chatAuthor,
  onChatAuthorChange,
  connected,
}: Props) {
  const zones = layout.zones;
  const show = (z: string) => zones.includes(z as never);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1>Backgammon Vision — Direct</h1>
        <span className={connected ? styles.on : styles.off}>
          {connected ? "● En direct" : "○ Connexion…"}
        </span>
      </header>

      <main className={styles.main}>
        {show("video") && (
          <section className={styles.videoZone}>
            {videoFrame ? (
              <img src={`data:image/jpeg;base64,${videoFrame}`} alt="Plateau en direct" />
            ) : (
              <div className={styles.videoPlaceholder}>En attente du flux vidéo…</div>
            )}
          </section>
        )}

        <aside className={styles.sidebar}>
          {show("brand") && state && (
            <GameSessionPanel
              playerWhite={state.playerWhite}
              playerBlack={state.playerBlack}
              onPlayerWhiteChange={() => undefined}
              onPlayerBlackChange={() => undefined}
              sessionDate={new Date(state.sessionDate)}
              elapsedMs={state.elapsedMs}
              streamActive={state.videoActive}
              detectionCount={state.history.length}
              liveMode={state.diceStatus !== "idle"}
            />
          )}

          {show("dice") && state && (
            <StrategyPanel
              advice={null}
              dice={state.dice}
              detecting={false}
              status={state.diceStatus}
              confirmed={state.diceConfirmed}
              variant="dice-only"
            />
          )}

          {show("analysis") && state && (
            <StrategyPanel
              advice={state.advice}
              dice={state.dice}
              detecting={false}
              status={state.diceStatus}
              confirmed={state.diceConfirmed}
            />
          )}

          {show("board") && state && (
            <BackgammonBoard
              points={state.board.points}
              barWhite={state.board.barWhite}
              barBlack={state.board.barBlack}
              offWhite={state.board.offWhite}
              offBlack={state.board.offBlack}
              compact
            />
          )}

          {show("history") && state && <MoveHistory entries={state.history.slice(0, 12)} />}

          {show("chat") && (
            <LiveChat
              messages={chat}
              onSend={onSendChat}
              author={chatAuthor}
              onAuthorChange={onChatAuthorChange}
              disabled={!connected}
            />
          )}
        </aside>
      </main>
    </div>
  );
}
