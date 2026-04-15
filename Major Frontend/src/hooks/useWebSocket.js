/**
 * useWebSocket — real-time patient update hook.
 * Connects to ws://localhost:8000/ws/updates and auto-reconnects on drop.
 * Replaces all polling logic.
 */
import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  return base.replace(/^http/, "ws") + "/ws/updates";
})();

const RECONNECT_DELAY_MS = 2000;

export function useWebSocket() {
  const [latestPatient, setLatestPatient]   = useState(null);
  const [wsConnected,   setWsConnected]     = useState(false);
  const [connectionCount, setConnectionCount] = useState(0);
  const wsRef       = useRef(null);
  const shouldRecon = useRef(true);

  const connect = useCallback(() => {
    if (!shouldRecon.current) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      console.log("🔌 WebSocket connected:", WS_URL);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        switch (msg.type) {
          case "new_patient":
            setLatestPatient(msg.patient);
            setConnectionCount((n) => n + 1);
            break;
          case "connected":
            console.log("✅ WS channel:", msg.message);
            break;
          default:
            break;
        }
      } catch (err) {
        console.warn("WS parse error:", err);
      }
    };

    ws.onerror = (e) => console.warn("WS error:", e);

    ws.onclose = () => {
      setWsConnected(false);
      console.log(`🔌 WS disconnected — reconnecting in ${RECONNECT_DELAY_MS}ms…`);
      if (shouldRecon.current) {
        setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, []);

  useEffect(() => {
    shouldRecon.current = true;
    connect();

    // Keep-alive ping every 25 seconds
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 25_000);

    return () => {
      shouldRecon.current = false;
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [connect]);

  return { latestPatient, wsConnected, connectionCount };
}
