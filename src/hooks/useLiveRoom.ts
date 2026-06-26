import { useCallback, useEffect, useRef, useState } from "react";
import { LiveRoomClient } from "../lib/liveRoomClient";
import type {
  ChatMessage,
  LiveBroadcastState,
  SpectatorLayout,
} from "../types/live";
import { DEFAULT_SPECTATOR_LAYOUT } from "../types/live";

interface UseLiveRoomOptions {
  role: "host" | "camera" | "spectator";
  roomId: string;
  hostName: string;
  enabled: boolean;
}

export function useLiveRoom({ role, roomId, hostName, enabled }: UseLiveRoomOptions) {
  const clientRef = useRef<LiveRoomClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [spectatorState, setSpectatorState] = useState<LiveBroadcastState | null>(null);
  const [layout, setLayout] = useState<SpectatorLayout>(DEFAULT_SPECTATOR_LAYOUT);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [videoFrame, setVideoFrame] = useState<string | null>(null);

  const signalHandlersRef = useRef<
    Set<(msg: {
      type: "offer" | "answer" | "ice";
      from: string;
      sdp?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    }) => void>
  >(new Set());

  useEffect(() => {
    if (!enabled || !roomId.trim()) {
      clientRef.current?.close();
      clientRef.current = null;
      setConnected(false);
      return;
    }

    const client = new LiveRoomClient(roomId.trim(), role, hostName);
    clientRef.current = client;
    let cancelled = false;

    const unsub = client.onMessage((msg) => {
      if (msg.type === "joined") {
        setPeerCount(msg.peerCount);
        setConnected(true);
        setError(null);
      }
      if (msg.type === "state") setSpectatorState(msg.payload);
      if (msg.type === "layout") setLayout(msg.payload);
      if (msg.type === "chat") setChat((c) => [...c, msg.payload].slice(-100));
      if (msg.type === "video-frame") setVideoFrame(msg.payload);
      if (msg.type === "peer-joined") setPeerCount((n) => n + 1);
      if (msg.type === "peer-left") setPeerCount((n) => Math.max(0, n - 1));
      if (msg.type === "error") setError(msg.message);
      if (msg.type === "webrtc-offer" && msg.sdp) {
        signalHandlersRef.current.forEach((h) =>
          h({ type: "offer", from: msg.from, sdp: msg.sdp }),
        );
      }
      if (msg.type === "webrtc-answer" && msg.sdp) {
        signalHandlersRef.current.forEach((h) =>
          h({ type: "answer", from: msg.from, sdp: msg.sdp }),
        );
      }
      if (msg.type === "webrtc-ice" && msg.candidate) {
        signalHandlersRef.current.forEach((h) =>
          h({ type: "ice", from: msg.from, candidate: msg.candidate }),
        );
      }
    });

    client
      .connect()
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Connexion impossible");
          setConnected(false);
        }
      });

    return () => {
      cancelled = true;
      unsub();
      client.close();
      clientRef.current = null;
    };
  }, [enabled, roomId, role, hostName]);

  const publishState = useCallback((payload: LiveBroadcastState) => {
    clientRef.current?.send({ type: "state", room: roomId, payload });
  }, [roomId]);

  const publishLayout = useCallback((payload: SpectatorLayout) => {
    setLayout(payload);
    clientRef.current?.send({ type: "layout", room: roomId, payload });
  }, [roomId]);

  const publishVideoFrame = useCallback(
    (jpegBase64: string) => {
      clientRef.current?.send({ type: "video-frame", room: roomId, payload: jpegBase64 });
    },
    [roomId],
  );

  const sendChat = useCallback(
    (text: string, author: string) => {
      clientRef.current?.send({
        type: "chat",
        room: roomId,
        payload: { text, author },
      });
    },
    [roomId],
  );

  const relayWebRtcOffer = useCallback(
    (sdp: RTCSessionDescriptionInit, target: "host" | "camera" | "all" = "host") => {
      const client = clientRef.current;
      if (!client) return;
      client.send({
        type: "webrtc-offer",
        room: roomId,
        from: client.clientId,
        target,
        sdp,
      });
    },
    [roomId],
  );

  const relayWebRtcAnswer = useCallback(
    (target: string, sdp: RTCSessionDescriptionInit) => {
      const client = clientRef.current;
      if (!client) return;
      client.send({
        type: "webrtc-answer",
        room: roomId,
        from: client.clientId,
        target,
        sdp,
      });
    },
    [roomId],
  );

  const relayIce = useCallback(
    (target: string, candidate: RTCIceCandidateInit) => {
      const client = clientRef.current;
      if (!client) return;
      client.send({
        type: "webrtc-ice",
        room: roomId,
        from: client.clientId,
        target,
        candidate,
      });
    },
    [roomId],
  );

  const onWebRtcSignal = useCallback(
    (
      handler: (msg: {
        type: "offer" | "answer" | "ice";
        from: string;
        sdp?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
      }) => void,
    ) => {
      signalHandlersRef.current.add(handler);
      return () => {
        signalHandlersRef.current.delete(handler);
      };
    },
    [],
  );

  return {
    connected,
    error,
    peerCount,
    spectatorState,
    layout,
    chat,
    videoFrame,
    clientId: clientRef.current?.clientId ?? "",
    publishState,
    publishLayout,
    publishVideoFrame,
    sendChat,
    relayWebRtcOffer,
    relayWebRtcAnswer,
    relayIce,
    onWebRtcSignal,
  };
}
