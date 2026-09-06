import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";

// A real 3D globe that flattens to street level — MapLibre GL with the globe
// projection over OpenStreetMap raster tiles. No API key, no billing account,
// and CORS-open, which is why this and not the Google Maps JS API.
//
// MapLibre is loaded from a CDN on first open rather than bundled: it is a
// large dependency that most sessions never touch.

const MAPLIBRE_JS = "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.js";
const MAPLIBRE_CSS = "https://unpkg.com/maplibre-gl@5.6.0/dist/maplibre-gl.css";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

interface MapLibreMap {
  addControl(c: unknown, pos?: string): void;
  flyTo(o: Record<string, unknown>): void;
  on(ev: string, fn: (e: never) => void): void;
  remove(): void;
}

declare global {
  interface Window {
    maplibregl?: {
      Map: new (o: Record<string, unknown>) => MapLibreMap;
      NavigationControl: new (o?: Record<string, unknown>) => unknown;
      ScaleControl: new (o?: Record<string, unknown>) => unknown;
      Marker: new (o?: Record<string, unknown>) => {
        setLngLat(v: [number, number]): {
          addTo(m: MapLibreMap): unknown;
        };
      };
    };
  }
}

let loader: Promise<void> | null = null;

function ensureMapLibre(): Promise<void> {
  if (window.maplibregl) return Promise.resolve();
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = MAPLIBRE_CSS;
        document.head.appendChild(link);
      }
      const s = document.createElement("script");
      s.src = MAPLIBRE_JS;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loader = null;
        reject(new Error("Failed to load MapLibre"));
      };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export default function GlobeScreen() {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    ensureMapLibre()
      .then(() => {
        if (cancelled || !hostRef.current || !window.maplibregl) return;
        const map = new window.maplibregl.Map({
          container: hostRef.current,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: [
                  "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                  "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
                ],
                tileSize: 256,
                maxzoom: 19,
                attribution: "© OpenStreetMap contributors"
              }
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }]
          },
          center: [34.85, 31.5],
          zoom: 1.6,
          // The globe flattens automatically as you zoom toward street level
          projection: { type: "globe" }
        });
        map.addControl(new window.maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        map.addControl(new window.maplibregl.ScaleControl({ unit: "metric" }));
        mapRef.current = map;
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  /**
   * Nominatim often misses "street number city" written in Hebrew, so we widen
   * the query in steps rather than reporting a false "not found": exact first,
   * then without the house number, then the last words alone (usually the city).
   */
  const geocode = async (q: string): Promise<[number, number] | null> => {
    const attempts = [q];
    const noNumber = q.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
    if (noNumber && noNumber !== q) attempts.push(noNumber);
    const words = noNumber.split(" ").filter(Boolean);
    if (words.length > 1) attempts.push(words.slice(-2).join(" "));

    for (const attempt of attempts) {
      const res = await fetch(
        `${NOMINATIM}?format=json&limit=1&accept-language=he&q=${encodeURIComponent(attempt)}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) continue;
      const hits = (await res.json()) as { lat: string; lon: string }[];
      if (hits.length) {
        return [parseFloat(hits[0].lon), parseFloat(hits[0].lat)];
      }
    }
    return null;
  };

  const search = async () => {
    const q = query.trim();
    if (!q || !mapRef.current) return;
    setSearching(true);
    setNote("");
    try {
      const lngLat = await geocode(q);
      if (!lngLat) {
        setNote(t("globe.noResult"));
        return;
      }
      mapRef.current.flyTo({ center: lngLat, zoom: 16, duration: 2200 });
      new window.maplibregl!.Marker({ color: "#3b9eff" })
        .setLngLat(lngLat)
        .addTo(mapRef.current);
    } catch {
      setNote(t("globe.searchFailed"));
    } finally {
      setSearching(false);
    }
  };

  const locateMe = () => {
    if (!navigator.geolocation || !mapRef.current) {
      setNote(t("globe.noGeo"));
      return;
    }
    setNote("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lngLat: [number, number] = [
          pos.coords.longitude,
          pos.coords.latitude
        ];
        mapRef.current?.flyTo({ center: lngLat, zoom: 17, duration: 2200 });
        new window.maplibregl!.Marker({ color: "#4ade80" })
          .setLngLat(lngLat)
          .addTo(mapRef.current!);
      },
      () => setNote(t("globe.geoDenied")),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="globe">
      <div className="globe-bar">
        <input
          className="globe-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          placeholder={t("globe.placeholder")}
          disabled={status !== "ready"}
        />
        <button
          className="globe-btn"
          onClick={() => void search()}
          disabled={status !== "ready" || searching || !query.trim()}
        >
          {searching ? t("globe.searching") : t("globe.search")}
        </button>
        <button
          className="globe-btn"
          onClick={locateMe}
          disabled={status !== "ready"}
          title={t("globe.locate")}
        >
          ◎
        </button>
      </div>

      {note && <div className="globe-note">{note}</div>}

      <div className="globe-map" ref={hostRef}>
        {status === "loading" && (
          <div className="globe-overlay caret">{t("globe.loading")}</div>
        )}
        {status === "error" && (
          <div className="globe-overlay error">{t("globe.loadFailed")}</div>
        )}
      </div>
    </div>
  );
}
