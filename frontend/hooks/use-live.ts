"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
export function useLive(enabled: boolean) {
  const [connected, setConnected] = useState(false);
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let debounce: ReturnType<typeof setTimeout>;
    let stopped = false;
    const connect = () => {
      socket = new WebSocket(
        `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`,
      );
      socket.onopen = () => setConnected(true);
      socket.onmessage = (e) => {
        let payload;
        try {
          payload = JSON.parse(e.data);
        } catch {
          return;
        }
        if (payload.type === "heartbeat") return;
        clearTimeout(debounce);
        debounce = setTimeout(
          () =>
            qc.invalidateQueries({
              predicate: (q) =>
                !["me", "references"].includes(String(q.queryKey[0])),
            }),
          350,
        );
      };
      socket.onclose = () => {
        setConnected(false);
        if (!stopped) retry = setTimeout(connect, 4000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearTimeout(debounce);
      socket?.close();
    };
  }, [enabled, qc]);
  return connected;
}
