import { useCallback, useEffect, useRef, useState } from "react";
import { health } from "../services/api";

/**
 * Watches whether the API is reachable, and notices when it comes back.
 *
 * Before this, a backend that stopped left the app showing a dead error until
 * the page was manually reloaded — even after the server was running again.
 * The interface had no way to find out the world had changed.
 *
 * Now it polls while down and clears itself the moment the API answers. It
 * polls slowly when healthy (every 30s, just to catch a server that dies while
 * the tab sits open) and quickly when down, backing off so a long outage does
 * not hammer a machine that may be busy starting up.
 */

const OK_INTERVAL = 30000;
const RETRY_START = 1500;
const RETRY_MAX = 8000;

export default function useBackend() {
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  const timer = useRef(null);
  const backoff = useRef(RETRY_START);
  const mounted = useRef(true);

  const check = useCallback(async ({ manual = false } = {}) => {
    if (manual) setChecking(true);

    try {
      await health();
      if (!mounted.current) return true;

      setOnline(true);
      backoff.current = RETRY_START;
      return true;
    } catch {
      if (mounted.current) setOnline(false);
      return false;
    } finally {
      if (mounted.current && manual) setChecking(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    const tick = async () => {
      const ok = await check();
      if (!mounted.current) return;

      const wait = ok ? OK_INTERVAL : backoff.current;
      if (!ok) backoff.current = Math.min(backoff.current * 1.5, RETRY_MAX);

      timer.current = setTimeout(tick, wait);
    };

    tick();

    // A laptop waking from sleep, or a tab being returned to, is the most
    // likely moment for the server to have gone away — or come back.
    const wake = () => check();
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);

    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [check]);

  return { online, checking, retry: () => check({ manual: true }) };
}
