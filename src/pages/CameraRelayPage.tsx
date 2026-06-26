import { useEffect, useRef, useState } from "react";
import { useLiveRoom } from "../hooks/useLiveRoom";
import { useVideoSource } from "../hooks/useVideoSource";

interface Props {
  roomId: string;
}

export function CameraRelayPage({ roomId }: Props) {
  const video = useVideoSource();
  const [status, setStatus] = useState("Connexion à la room…");
  const startedRef = useRef(false);

  const live = useLiveRoom({
    role: "camera",
    roomId,
    hostName: "Caméra",
    enabled: Boolean(roomId),
  });

  useEffect(() => {
    if (!live.connected || startedRef.current) return;
    startedRef.current = true;

    const unsub = live.onWebRtcSignal(async (msg) => {
      if (msg.type === "answer" && msg.sdp) {
        const pc = video.getPeerConnection();
        await pc.setRemoteDescription(msg.sdp);
        setStatus("Flux caméra relié à la table");
      }
      if (msg.type === "ice" && msg.candidate) {
        void video.addIceCandidate(msg.candidate);
      }
    });

    void (async () => {
      await video.startWebRtcBroadcast();
      const pc = video.getPeerConnection();
      pc.onicecandidate = (ev) => {
        if (ev.candidate) live.relayIce("host", ev.candidate.toJSON());
      };
      if (pc.localDescription) {
        live.relayWebRtcOffer(pc.localDescription, "host");
        setStatus("Caméra active — liaison avec la table…");
      }
    })();

    return unsub;
  }, [live, video]);

  return (
    <div className="camera-relay-page">
      <video ref={video.videoRef} playsInline muted autoPlay className="camera-relay-video" />
      <p className="camera-relay-status">{status}</p>
      <style>{`
        .camera-relay-page {
          min-height: 100dvh;
          background: #000;
          display: grid;
          place-items: center;
          padding: 1rem;
        }
        .camera-relay-video {
          width: 100%;
          max-width: 480px;
          background: #111;
          border-radius: 12px;
        }
        .camera-relay-status {
          color: #8b9cb3;
          text-align: center;
          font-size: 0.85rem;
          margin-top: 0.75rem;
        }
      `}</style>
    </div>
  );
}
