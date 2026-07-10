// Build-progress notifications — a single notification (tag) that updates
// in place per pipeline stage, visible on the lock screen and in the
// notification shade, media-player style. Completion replaces it with a
// sound + vibration notification whose click opens the live site.
//
// Requires the PWA's service worker; on iPhone works only when Yairos is
// installed to the home screen (iOS 16.4+). Everything here is best-effort:
// if permission is missing every call is a silent no-op.

const TAG = "yairos-build";

export function notificationsSupported(): boolean {
  return "Notification" in window && "serviceWorker" in navigator;
}

/** Ask once for permission. Call from a user gesture (button/message send). */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

async function show(
  title: string,
  body: string,
  opts: { silent?: boolean; url?: string } = {}
): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, {
      body,
      tag: TAG,
      silent: opts.silent ?? true,
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      data: { url: opts.url ?? "/" },
      ...(opts.silent === false ? { renotify: true, vibrate: [200, 80, 200] } : {})
    } as NotificationOptions);
  } catch {
    /* best-effort */
  }
}

/** Quiet in-place update: "Code dept. is writing the site files…" */
export function notifyStage(title: string, stage: string): void {
  void show(title, stage, { silent: true });
}

/** Loud final notification; click opens `url` (the live site) or Yairos itself */
export function notifyDone(title: string, body: string, url?: string): void {
  void show(title, body, { silent: false, url });
}

export async function closeBuildNotification(): Promise<void> {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    for (const n of await reg.getNotifications({ tag: TAG })) n.close();
  } catch {
    /* best-effort */
  }
}
