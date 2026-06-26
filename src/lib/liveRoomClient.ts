import type { LiveClientMessage, LiveServerMessage } from "../types/live";
import { getLiveWsUrl } from "./videoInputs";

type Handler = (msg: LiveServerMessage) => void;

export class LiveRoomClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private reconnectTimer: number | null = null;
  clientId = "";

  constructor(
    private room: string,
    private role: "host" | "camera" | "spectator",
    private name: string,
  ) {}

  connect(): Promise<void> {
    const url = getLiveWsUrl();
    if (!url) {
      return Promise.reject(new Error("Serveur live non configuré (VITE_LIVE_WS_URL)"));
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.onopen = () => {
        this.send({
          type: "join",
          room: this.room,
          role: this.role,
          name: this.name,
        });
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as LiveServerMessage;
          if (msg.type === "joined") {
            this.clientId = msg.clientId;
            resolve();
          }
          if (msg.type === "error") {
            reject(new Error(msg.message));
          }
          this.handlers.forEach((h) => h(msg));
        } catch {
          // ignore malformed
        }
      };

      ws.onerror = () => reject(new Error("Connexion WebSocket impossible"));
      ws.onclose = () => {
        this.ws = null;
        this.reconnectTimer = window.setTimeout(() => {
          void this.connect().catch(() => undefined);
        }, 3000);
      };
    });
  }

  onMessage(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(msg: LiveClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    if (this.reconnectTimer) window.clearInterval(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
  }
}

export function isLiveServerConfigured(): boolean {
  return Boolean(getLiveWsUrl());
}
