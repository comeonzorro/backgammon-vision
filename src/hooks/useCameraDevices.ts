import { useCallback, useEffect, useState } from "react";

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export function useCameraDevices(enabled: boolean) {
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const cams = list
        .filter((d) => d.kind === "videoinput")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Caméra ${i + 1}`,
        }));
      setDevices(cams);
      setReady(true);
    } catch {
      setReady(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    navigator.mediaDevices?.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", refresh);
  }, [enabled, refresh]);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach((t) => t.stop());
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  return { devices, ready, refresh, requestPermission };
}
