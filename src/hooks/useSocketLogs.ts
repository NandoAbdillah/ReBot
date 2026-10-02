import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { Log, FloodAlert } from "../types";

export function useSocketLogs(isAuthed: boolean, onUnauthorized?: () => void) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [floodAlerts, setFloodAlerts] = useState<FloodAlert[]>([]);

  useEffect(() => {
    if (!isAuthed) return;

    fetch("/api/logs")
      .then((r) => {
        if (r.status === 401 && onUnauthorized) onUnauthorized();
        return r.json();
      })
      .then((data) => {
        if (Array.isArray(data?.logs)) setLogs(data.logs.slice(0, 100));
      })
      .catch(() => {});

    const socket = io();
    socket.on("bot-log", (log: Log) => {
      setLogs((prev) => {
        const exists = prev.some(
          (e) => e.timestamp === log.timestamp && e.message === log.message,
        );
        if (exists) return prev;
        return [log, ...prev].slice(0, 100);
      });
    });

    socket.on("flood-wait", (data: FloodAlert) => {
      setFloodAlerts((prev) => [
        ...prev.filter((a) => a.accountId !== data.accountId),
        data,
      ]);
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthed, onUnauthorized]);

  // Cleanup expired flood alerts every second
  useEffect(() => {
    if (floodAlerts.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      setFloodAlerts((prev) => prev.filter((a) => a.until > now));
    }, 1000);
    return () => clearInterval(interval);
  }, [floodAlerts]);

  return { logs, setLogs, floodAlerts };
}
