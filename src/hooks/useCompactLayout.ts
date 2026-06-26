import { useEffect, useState } from "react";

export type MobileTab = "camera" | "game";

export function useCompactLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 960px)").matches
      : false,
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>("camera");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 960px)");
    const update = () => setCompact(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return { compact, mobileTab, setMobileTab };
}
