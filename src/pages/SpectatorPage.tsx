import { useEffect, useState } from "react";
import { useLiveRoom } from "../hooks/useLiveRoom";
import { SpectatorView } from "../components/SpectatorView";

interface Props {
  roomId: string;
}

export function SpectatorPage({ roomId }: Props) {
  const [chatAuthor, setChatAuthor] = useState(
    () => localStorage.getItem("bgv-chat-name") || "Spectateur",
  );

  const live = useLiveRoom({
    role: "spectator",
    roomId,
    hostName: chatAuthor,
    enabled: Boolean(roomId),
  });

  useEffect(() => {
    localStorage.setItem("bgv-chat-name", chatAuthor);
  }, [chatAuthor]);

  return (
    <SpectatorView
      state={live.spectatorState}
      layout={live.layout}
      videoFrame={live.videoFrame}
      chat={live.chat}
      onSendChat={live.sendChat}
      chatAuthor={chatAuthor}
      onChatAuthorChange={setChatAuthor}
      connected={live.connected}
    />
  );
}
