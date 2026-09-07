import { useEffect, useRef, useState } from "react";
import { checkMasterPass, hasCustomPass } from "../os/shell";

// The login gate. YAIROS boots straight into this — a TTY-style password
// prompt — and nothing else renders until it is cleared. It re-locks on
// every launch and reload (the pass is never held past this component).

const PREAMBLE = [
  "yairos-core tty1",
  "",
  "kernel: mounted /  (localStorage)",
  "kernel: sandbox active — no host filesystem access",
  ""
];

export default function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pass, setPass] = useState("");
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState("");
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // A Hebrew keyboard turns "Ya6873544!" into gibberish under the dots
  const hebrew = /[֐-׿]/.test(pass);

  useEffect(() => {
    inputRef.current?.focus();
  }, [checking, lockedUntil]);

  // Count down a failed-attempt lockout
  const [, tick] = useState(0);
  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const waitLeft = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));

  const submit = async () => {
    if (checking || waitLeft > 0 || !pass) return;
    setChecking(true);
    setMsg("");
    // Leading/trailing whitespace is never part of the passphrase; mobile
    // keyboards love to append a space.
    const ok = await checkMasterPass(pass.trim());
    setChecking(false);
    setPass("");
    if (ok) {
      onUnlock();
      return;
    }
    const n = attempts + 1;
    setAttempts(n);
    setMsg("authentication failure");
    // Back off harder each miss: 2s, 4s, 8s, ... capped at 30s
    setLockedUntil(Date.now() + Math.min(2000 * 2 ** (n - 1), 30_000));
  };

  return (
    <div
      className="lock"
      dir="ltr"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="lock-inner">
        <h1 className="lock-title">Y.A.I.R.O.S</h1>
        <pre className="lock-pre">{PREAMBLE.join("\n")}</pre>

        <div className="lock-row">
          <span className="lock-label">yairos login:</span>
          <span className="lock-user">yair</span>
        </div>

        <div className="lock-row">
          <span className="lock-label">password:</span>
          <input
            ref={inputRef}
            className="lock-input"
            type={show ? "text" : "password"}
            name="yairos-master"
            value={pass}
            // Suppress the browser password manager — this must be typed
            autoComplete="new-password"
            data-lpignore="true"
            data-1p-ignore="true"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            readOnly={checking || waitLeft > 0}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
          />
          <button
            type="button"
            className="lock-show"
            onClick={() => {
              setShow((s) => !s);
              inputRef.current?.focus();
            }}
            tabIndex={-1}
          >
            [{show ? "hide" : "show"}]
          </button>
          {!checking && waitLeft === 0 && !show && <span className="lock-caret" />}
        </div>

        {hebrew && (
          <div className="lock-msg bad">
            keyboard is in Hebrew — switch to English (Alt+Shift) and retype
          </div>
        )}
        {checking && <div className="lock-msg dim">verifying…</div>}
        {waitLeft > 0 && (
          <div className="lock-msg bad">
            {msg} — locked for {waitLeft}s
          </div>
        )}
        {msg && waitLeft === 0 && !checking && (
          <div className="lock-msg bad">{msg}</div>
        )}

        <div className="lock-foot">
          {hasCustomPass()
            ? "device password in effect"
            : "shipped master password · change it later with `passwd`"}
        </div>
      </div>
    </div>
  );
}
