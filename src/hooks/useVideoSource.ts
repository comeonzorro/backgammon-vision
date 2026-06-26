import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoSourceKind } from "../types";
import { attachHlsToVideo, extractYouTubeVideoId } from "../lib/streamSources";

export interface VideoSourceState {
  kind: VideoSourceKind | null;
  active: boolean;
  error: string | null;
  label: string;
}

export function useVideoSource() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [state, setState] = useState<VideoSourceState>({
    kind: null,
    active: false,
    error: null,
    label: "Aucun flux",
  });
  const [localOffer, setLocalOffer] = useState("");
  const [remoteAnswer, setRemoteAnswer] = useState("");

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;

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
    setRemoteAnswer("");
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, facingMode: "environment" }
          : { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      cleanupRef.current = () => stream.getTracks().forEach((t) => t.stop());
      setState({
        kind: "camera",
        active: true,
        error: null,
        label: deviceId ? "Caméra sélectionnée" : "Caméra / iPhone",
      });
    } catch (e) {
      setState({
        kind: null,
        active: false,
        error: e instanceof Error ? e.message : "Accès caméra refusé",
        label: "Aucun flux",
      });
    }
  }, [stop]);

  const startObsVirtual = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const virtual = devices.find(
      (d) =>
        d.kind === "videoinput" &&
        /obs|virtual/i.test(d.label),
    );
    await startCamera(virtual?.deviceId);
    if (virtual) {
      setState((s) => ({
        ...s,
        kind: "obs-virtual",
        label: `OBS Virtual Cam — ${virtual.label}`,
      }));
    }
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
          label: "Flux HLS (OBS / RTMP relay)",
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

  const createWebRtcOffer = useCallback(async () => {
    stop();
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;
    pc.ontrack = (ev) => {
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = ev.streams[0] ?? null;
      void video.play();
      setState({
        kind: "webrtc",
        active: true,
        error: null,
        label: "WebRTC distant (viewer)",
      });
    };
    const offer = await pc.createOffer({ offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    setLocalOffer(JSON.stringify(offer));
    setState((s) => ({ ...s, kind: "webrtc", label: "WebRTC — en attente d'answer" }));
  }, [stop]);

  const applyWebRtcAnswer = useCallback(async (answerJson: string) => {
    const pc = pcRef.current;
    if (!pc) {
      setState((s) => ({ ...s, error: "Créez d'abord une offre WebRTC" }));
      return;
    }
    try {
      const answer = JSON.parse(answerJson) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(answer);
      setRemoteAnswer(answerJson);
      setState((s) => ({ ...s, error: null, active: true, label: "WebRTC P2P actif" }));
    } catch (e) {
      setState((s) => ({
        ...s,
        error: e instanceof Error ? e.message : "Answer SDP invalide",
      }));
    }
  }, []);

  const startWebRtcBroadcast = useCallback(async () => {
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
        audio: false,
      });
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      cleanupRef.current = () => stream.getTracks().forEach((t) => t.stop());

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setLocalOffer(JSON.stringify(offer));
      setState({
        kind: "webrtc",
        active: true,
        error: null,
        label: "WebRTC broadcaster (iPhone)",
      });
    } catch (e) {
      setState({
        kind: null,
        active: false,
        error: e instanceof Error ? e.message : "WebRTC impossible",
        label: "Aucun flux",
      });
    }
  }, [stop]);

  useEffect(() => () => stop(), [stop]);

  return {
    videoRef,
    state,
    localOffer,
    remoteAnswer,
    setRemoteAnswer,
    startCamera,
    startObsVirtual,
    startHls,
    startYouTube,
    createWebRtcOffer,
    applyWebRtcAnswer,
    startWebRtcBroadcast,
    stop,
  };
}
