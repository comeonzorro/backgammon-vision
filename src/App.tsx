import { useEffect, useState } from "react";
import { CameraRelayPage } from "./pages/CameraRelayPage";
import { SpectatorPage } from "./pages/SpectatorPage";
import { TableApp } from "./pages/TableApp";

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, "");
  const parts = hash.split("/").filter(Boolean);
  if (parts[0] === "spectateur" && parts[1]) return { page: "spectator" as const, room: parts[1] };
  if (parts[0] === "camera" && parts[1]) return { page: "camera" as const, room: parts[1] };
  return { page: "table" as const, room: "" };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (route.page === "spectator") return <SpectatorPage roomId={route.room} />;
  if (route.page === "camera") return <CameraRelayPage roomId={route.room} />;
  return <TableApp />;
}
