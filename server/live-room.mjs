#!/usr/bin/env node
/**
 * Serveur relay live Backgammon Vision
 * — rooms, sync état spectateurs, chat, signaling WebRTC, frames vidéo JPEG
 *
 * Usage: node server/live-room.mjs
 * Env:   PORT=8787
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const MAX_CHAT = 200;

/** @type {Map<string, { host: import('ws').WebSocket|null, clients: Map<string, { ws: import('ws').WebSocket, role: string, name: string }>, state: object|null, layout: object|null, chat: object[] }>} */
const rooms = new Map();

function roomId(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 32);
}

function getRoom(id) {
  const key = roomId(id);
  if (!key) return null;
  if (!rooms.has(key)) {
    rooms.set(key, {
      host: null,
      clients: new Map(),
      state: null,
      layout: null,
      chat: [],
    });
  }
  return { key, data: rooms.get(key) };
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(room, msg, exceptWs = null) {
  for (const { ws } of room.data.clients.values()) {
    if (ws !== exceptWs) send(ws, msg);
  }
}

function broadcastRole(room, role, msg) {
  for (const client of room.data.clients.values()) {
    if (client.role === role) send(client.ws, msg);
  }
}

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Backgammon Vision live-room OK\n");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  let clientId = crypto.randomUUID();
  let roomKey = "";
  let role = "";
  let name = "";

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return send(ws, { type: "error", message: "JSON invalide" });
    }

    if (msg.type === "join") {
      const room = getRoom(msg.room);
      if (!room) return send(ws, { type: "error", message: "Room invalide" });

      roomKey = room.key;
      role = msg.role;
      name = String(msg.name || "Anonyme").slice(0, 32);

      if (role === "host") room.data.host = ws;

      room.data.clients.set(clientId, { ws, role, name });

      send(ws, {
        type: "joined",
        room: roomKey,
        role,
        peerCount: room.data.clients.size,
        clientId,
      });

      if (room.data.state) send(ws, { type: "state", payload: room.data.state });
      if (room.data.layout) send(ws, { type: "layout", payload: room.data.layout });
      for (const c of room.data.chat.slice(-50)) send(ws, { type: "chat", payload: c });

      broadcast(
        room,
        { type: "peer-joined", role, name, clientId },
        ws,
      );
      return;
    }

    const room = getRoom(msg.room || roomKey);
    if (!room) return;

    switch (msg.type) {
      case "state":
        if (role !== "host") break;
        room.data.state = msg.payload;
        broadcast(room, { type: "state", payload: msg.payload }, ws);
        break;

      case "layout":
        if (role !== "host") break;
        room.data.layout = msg.payload;
        broadcast(room, { type: "layout", payload: msg.payload }, ws);
        break;

      case "chat": {
        const entry = {
          id: crypto.randomUUID(),
          room: room.key,
          author: String(msg.payload?.author || name).slice(0, 32),
          text: String(msg.payload?.text || "").slice(0, 500),
          timestamp: Date.now(),
        };
        if (!entry.text.trim()) break;
        room.data.chat.push(entry);
        if (room.data.chat.length > MAX_CHAT) {
          room.data.chat.splice(0, room.data.chat.length - MAX_CHAT);
        }
        broadcast(room, { type: "chat", payload: entry });
        break;
      }

      case "video-frame":
        if (role !== "host") break;
        broadcast(
          room,
          { type: "video-frame", payload: msg.payload },
          ws,
        );
        break;

      case "webrtc-offer":
      case "webrtc-answer":
      case "webrtc-ice": {
        const target = msg.target;
        if (target === "host" && room.data.host) {
          send(room.data.host, { ...msg, from: clientId });
        } else if (target === "camera" || target === "all") {
          for (const [id, client] of room.data.clients) {
            if (client.role === "camera" && id !== clientId) {
              send(client.ws, { ...msg, from: clientId });
            }
          }
        } else if (target) {
          const client = room.data.clients.get(target);
          if (client) send(client.ws, { ...msg, from: clientId });
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on("close", () => {
    if (!roomKey) return;
    const room = rooms.get(roomKey);
    if (!room) return;
    room.clients.delete(clientId);
    if (room.host === ws) room.host = null;
    broadcast({ key: roomKey, data: room }, { type: "peer-left", clientId });
    if (room.clients.size === 0) {
      rooms.delete(roomKey);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[live-room] ws://0.0.0.0:${PORT}`);
});
