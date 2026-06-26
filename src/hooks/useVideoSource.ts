import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoSourceKind } from "../types";
import { attachHlsToVideo, extractYouTubeVideoId } from "../lib/streamSources";
import { attachMjpegToVideo as attachMjpeg } from "../lib/videoInputs";

export interface VideoSourceState {
  kind: VideoSourceKind | null;
  active: boolean;
  error: string | null;
  label: string;
  deviceId?: string;
}

export function useVideoSource() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<VideoSourceState>({
    kind: null,
    active: false,
    error: null,
    label: "Aucun flux",
  });
  const [localOffer, setLocalOffer] = useState("");

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    remoteStreamRef.current?.getTracks().forEach((t) => t.stop());
    remoteStreamRef.current = null;

    const video = videoRef.current;
    if (video) {
      video.pause();
      if (video.srcObject instanceof MediaStream) {
        video.srcObject.getTracks().forEach((t) => t.stop());
      }
      video.removeAttribute("src");
      video.srcObject = null;
      video.load();
    }

    setState({ kind: null, active: false, error: null, label: "Aucun flux" });
    setLocalOffer("");
  }, []);

  const attachStream = useCallback(
    async (
      stream: MediaStream,
      kind: VideoSourceKind,
      label: string,
      deviceId?: string,
    ) => {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      cleanupRef.current = () => stream.getTracks().forEach((t) => t.stop());
      setState({ kind, active: true, error: null, label, deviceId });
    },
    [],
  );

  const startCamera = useCallback(
    async (deviceId?: string, deviceLabel?: string) => {
      stop();
      try {
        const videoConstraints: MediaTrackConstraints = deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        await attachStream(
          stream,
          "camera",
          deviceLabel || (deviceId ? "Caméra USB / externe" : "Caméra arrière (téléphone)"),
          deviceId,
        );
      } catch (e) {
        setState({
          kind: null,
          active: false,
          error: e instanceof Error ? e.message : "Accès caméra refusé",
          label: "Aucun flux",
        });
      }
    },
    [attachStream, stop],
  );

  const startObsVirtual = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const virtual = devices.find(
      (d) => d.kind === "videoinput" && /obs|virtual|cam link|elgato|capture/i.test(d.label),
    );
    if (!virtual) {
      setState((s) => ({
        ...s,
        error: "Aucune caméra virtuelle détectée (OBS, capture card…)",
      }));
      return;
    }
    await startCamera(virtual.deviceId, virtual.label);
    setState((s) => ({ ...s, kind: "obs-virtual", label: virtual.label }));
  }, [startCamera]);

  const startHls = useCallback(
    (url: string) => {
      stop();
      const video = videoRef.current;
      if (!video) return;
      try {
        const cleanup = attachHlsToVideo(video, url);
        cleanupRef.current = cleanup;
        setState({
          kind: "hls",
          active: true,
          error: null,
          label: "Flux HLS / sans fil (RTMP relay)",
        });
      } catch (e) {
        setState({
          kind: null,
          active: false,
          error: e instanceof Error ? e.message : "URL HLS invalide",
          label: "Aucun flux",
        });
      }
    },
    [stop],
  );

  const startMjpeg = useCallback(
    (url: string) => {
      stop();
      const video = videoRef.current;
      if (!video) return;
      try {
        const cleanup = attachMjpeg(video, url.trim());
        cleanupRef.current = cleanup;
        setState({
          kind: "mjpeg",
          active: true,
          error: null,
          label: "Caméra IP / MJPEG",
        });
      } catch (e) {
        setState({
          kind: null,
          active: false,
          error: e instanceof Error ? e.message : "URL MJPEG invalide",
          label: "Aucun flux",
        });
      }
    },
    [stop],
  );

  const startYouTube = useCallback(
    (input: string) => {
      stop();
      const id = extractYouTubeVideoId(input);
      if (!id) {
        setState({
          kind: null,
          active: false,
          error: "URL ou ID YouTube invalide",
          label: "Aucun flux",
        });
        return;
      }
      setState({
        kind: "youtube",
        active: true,
        error: null,
        label: `YouTube Live — ${id}`,
      });
    },
    [stop],
  );

  const attachRemoteStream = useCallback(
    async (stream: MediaStream, label = "Caméra distante (WebRTC)") => {
      stop();
      remoteStreamRef.current = stream;
      await attachStream(stream, "remote-webrtc", label);
    },
    [attachStream, stop],
  );

  const getPeerConnection = useCallback(() => {
    if (!pcRef.current) {
      pcRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
    }
    return pcRef.current;
  }, []);

  const createWebRtcOffer = useCallback(async () => {
    stop();
    const pc = getPeerConnection();
    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (stream) void attachRemoteStream(stream);
    };
    const offer = await pc.createOffer({ offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    setLocalOffer(JSON.stringify(offer));
    setState((s) => ({ ...s, kind: "webrtc", label: "WebRTC — en attente d'answer" }));
  }, [attachRemoteStream, getPeerConnection, stop]);

  const applyWebRtcAnswer = useCallback(async (answerJson: string) => {
    const pc = pcRef.current;
    if (!pc) {
      setState((s) => ({ ...s, error: "Créez d'abord une offre WebRTC" }));
      return;
    }
    try {
      const answer = JSON.parse(answerJson) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(answer);
      setState((s) => ({ ...s, error: null, active: true, label: "WebRTC P2P actif" }));
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : "Answer SDP invalide",
      }));
    }
  }, []);

  const applyRemoteOffer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      const pc = getPeerConnection();
      pc.ontrack = (ev) => {
        const stream = ev.streams[0];
        if (stream) void attachRemoteStream(stream, "Téléphone / caméra sans fil");
      };
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      return answer;
    },
    [attachRemoteStream, getPeerConnection],
  );

  const addIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;
    try {
      await pc.addIceCandidate(candidate);
    } catch {
      // ICE peut arriver avant remoteDescription
    }
  }, []);

  const startWebRtcBroadcast = useCallback(async (deviceId?: string) => {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: { ideal: 1280 } }
          : { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      const pc = getPeerConnection();
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await attachStream(stream, "webrtc", "WebRTC broadcast (caméra)", deviceId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setLocalOffer(JSON.stringify(offer));
    } catch (e) {
      setState({
        kind: null,
        active: false,
        error: e instanceof Error ? e.message : "WebRTC impossible",
        label: "Aucun flux",
      });
    }
  }, [attachStream, getPeerConnection, stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    state,
    localOffer,
    startCamera,
    startObsVirtual,
    startHls,
    startMjpeg,
    startYouTube,
    createWebRtcOffer,
    applyWebRtcAnswer,
    applyRemoteOffer,
    addIceCandidate,
    attachRemoteStream,
    startWebRtcBroadcast,
    getPeerConnection,
    stop,
  };
}
