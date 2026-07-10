// Keeps the screen awake while a build/deploy pipeline is running, so the
// phone doesn't lock and freeze the tab mid-build. The lock is auto-released
// by the OS when the app goes to the background — we re-acquire it when the
// user returns. Best-effort: unsupported browsers simply skip it.

let lock: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || document.visibilityState !== "visible") return;
  if (!("wakeLock" in navigator)) return;
  try {
    lock = await navigator.wakeLock.request("screen");
  } catch {
    /* best-effort */
  }
}

function onVisibility(): void {
  void acquire();
}

export function startBuildWakeLock(): void {
  if (wanted) return;
  wanted = true;
  document.addEventListener("visibilitychange", onVisibility);
  void acquire();
}

export function stopBuildWakeLock(): void {
  wanted = false;
  document.removeEventListener("visibilitychange", onVisibility);
  lock?.release().catch(() => {});
  lock = null;
}
