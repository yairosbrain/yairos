import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";

// What the network actually looks like from inside a browser tab.
//
// This deliberately shows only measurements the page can really make. A web
// page cannot open a raw socket, scan a port, read an ARP table, or put an
// adapter into monitor mode — those need OS privileges a tab never has. The
// "out of reach" section says so plainly rather than faking a scanner.

interface Conn {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

interface PublicIp {
  ip?: string;
  city?: string;
  region?: string;
  country_name?: string;
  org?: string;
  asn?: string;
}

const PROBES: [string, string][] = [
  ["cloudflare", "https://cloudflare.com/cdn-cgi/trace"],
  ["openstreetmap", "https://a.tile.openstreetmap.org/0/0/0.png"],
  ["convex", "https://industrious-hound-301.convex.cloud"]
];

function Row({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <div className="net-row">
      <span className="net-k">{k}</span>
      <span className={`net-v ${tone ?? ""}`}>{v}</span>
    </div>
  );
}

export default function NetScreen() {
  const { t } = useI18n();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [conn, setConn] = useState<Conn>({});
  const [ip, setIp] = useState<PublicIp | null>(null);
  const [ipState, setIpState] = useState<"idle" | "loading" | "error">("idle");
  const [localIps, setLocalIps] = useState<string[]>([]);
  const [pings, setPings] = useState<Record<string, number | null>>({});
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", on);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", on);
    };
  }, []);

  useEffect(() => {
    const c = (navigator as unknown as { connection?: Conn }).connection;
    if (!c) return;
    const read = () =>
      setConn({
        effectiveType: c.effectiveType,
        downlink: c.downlink,
        rtt: c.rtt,
        saveData: c.saveData,
        type: c.type
      });
    read();
    const target = c as unknown as EventTarget;
    target.addEventListener?.("change", read);
    return () => target.removeEventListener?.("change", read);
  }, []);

  const lookupIp = useCallback(async () => {
    setIpState("loading");
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (!res.ok) throw new Error(String(res.status));
      setIp((await res.json()) as PublicIp);
      setIpState("idle");
    } catch {
      setIpState("error");
    }
  }, []);

  /** Browsers now return mDNS .local names here instead of real LAN IPs */
  const discoverLocal = useCallback(() => {
    setLocalIps([]);
    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      const found = new Set<string>();
      pc.createDataChannel("probe");
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          pc.close();
          setLocalIps([...found]);
          return;
        }
        const m = /([0-9a-f]+[-0-9a-f.]+\.local|(\d{1,3}\.){3}\d{1,3})/i.exec(
          e.candidate.candidate
        );
        if (m) found.add(m[1]);
      };
      void pc.createOffer().then((o) => pc.setLocalDescription(o));
    } catch {
      setLocalIps([]);
    }
  }, []);

  /** Round-trip time to a few public endpoints — the only "ping" a tab gets */
  const runProbes = useCallback(async () => {
    setProbing(true);
    const next: Record<string, number | null> = {};
    for (const [name, url] of PROBES) {
      const start = performance.now();
      try {
        // no-cors gives an opaque response, but the timing is still real
        await fetch(`${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`, {
          mode: "no-cors",
          cache: "no-store"
        });
        next[name] = Math.round(performance.now() - start);
      } catch {
        next[name] = null;
      }
      setPings({ ...next });
    }
    setProbing(false);
  }, []);

  const nav = navigator as unknown as {
    hardwareConcurrency?: number;
    deviceMemory?: number;
    platform?: string;
  };

  return (
    <div className="net" dir="ltr">
      <section className="net-card">
        <h3 className="net-h">link</h3>
        <Row
          k="status"
          v={online ? "online" : "offline"}
          tone={online ? "ok" : "bad"}
        />
        <Row k="effective type" v={conn.effectiveType ?? "n/a"} />
        <Row
          k="downlink"
          v={conn.downlink != null ? `${conn.downlink} Mb/s` : "n/a"}
        />
        <Row k="rtt (est)" v={conn.rtt != null ? `${conn.rtt} ms` : "n/a"} />
        <Row k="data saver" v={conn.saveData ? "on" : "off"} />
        <Row
          k="cores / memory"
          v={`${nav.hardwareConcurrency ?? "?"} / ${
            nav.deviceMemory ? `${nav.deviceMemory}GB` : "?"
          }`}
        />
      </section>

      <section className="net-card">
        <h3 className="net-h">
          public address
          <button className="net-act" onClick={() => void lookupIp()}>
            {ipState === "loading" ? "…" : "lookup"}
          </button>
        </h3>
        {ipState === "error" && <Row k="error" v={t("net.ipFailed")} tone="bad" />}
        {!ip && ipState !== "error" && (
          <p className="net-hint">{t("net.ipHint")}</p>
        )}
        {ip && (
          <>
            <Row k="ip" v={ip.ip ?? "?"} tone="ok" />
            <Row
              k="location"
              v={[ip.city, ip.region, ip.country_name].filter(Boolean).join(", ") || "?"}
            />
            <Row k="network" v={ip.org ?? "?"} />
            <Row k="asn" v={ip.asn ?? "?"} />
          </>
        )}
      </section>

      <section className="net-card">
        <h3 className="net-h">
          local candidates
          <button className="net-act" onClick={discoverLocal}>
            discover
          </button>
        </h3>
        {localIps.length ? (
          localIps.map((a) => <Row key={a} k="candidate" v={a} />)
        ) : (
          <p className="net-hint">{t("net.localHint")}</p>
        )}
      </section>

      <section className="net-card">
        <h3 className="net-h">
          latency
          <button className="net-act" onClick={() => void runProbes()} disabled={probing}>
            {probing ? "…" : "probe"}
          </button>
        </h3>
        {PROBES.map(([name]) => (
          <Row
            key={name}
            k={name}
            v={
              pings[name] === undefined
                ? "—"
                : pings[name] === null
                  ? "unreachable"
                  : `${pings[name]} ms`
            }
            tone={pings[name] === null ? "bad" : pings[name] != null ? "ok" : ""}
          />
        ))}
      </section>

      <section className="net-card limits">
        <h3 className="net-h">{t("net.limits")}</h3>
        <p className="net-hint">{t("net.limitsBody")}</p>
        <ul className="net-list">
          <li>{t("net.limit.scan")}</li>
          <li>{t("net.limit.monitor")}</li>
          <li>{t("net.limit.arp")}</li>
          <li>{t("net.limit.switch")}</li>
        </ul>
        <p className="net-hint">{t("net.limitsFix")}</p>
      </section>
    </div>
  );
}
