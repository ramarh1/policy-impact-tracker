// src/components/MyMap.tsx
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const PHILLY_CENTER: [number, number] = [-75.1652, 39.9526];

// Live GeoJSON from Carto SQL API
// Tweak LIMIT or add a WHERE clause later if you want to cut payload
const INCIDENTS_URL =
  "https://phl.carto.com/api/v2/sql?" +
  "q=" +
  encodeURIComponent(`
    SELECT *
    FROM incidents_part1_part2
    WHERE dispatch_date_time > now() - interval '24 hours'
    ORDER BY dispatch_date_time DESC
    LIMIT 2000
  `) +
  "&format=GeoJSON";

export default function MyMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [geoStatus, setGeoStatus] = useState<
    "idle" | "loading" | "denied" | "ok"
  >("idle");

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const key = import.meta.env.VITE_MAPTILER_KEY || "BKjSuIRZjpD2Bbxv8AJz";
    const styleUrl = `https://api.maptiler.com/maps/streets/style.json?key=${key}`;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: PHILLY_CENTER,
      zoom: 12,
    });

    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "top-right"
    );
    mapRef.current = map;

    let refreshTimer: number | undefined;

    map.on("load", async () => {
      // Add source if it is not already there
      if (!map.getSource("incidents")) {
        map.addSource("incidents", {
          type: "geojson",
          data: INCIDENTS_URL, // MapLibre can fetch this URL directly
          generateId: true,
        });
      }

      // Add a simple circle layer
      if (!map.getLayer("incidents-circles")) {
        map.addLayer({
          id: "incidents-circles",
          type: "circle",
          source: "incidents",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              2,
              14,
              4,
              16,
              6,
            ],
            "circle-color": "#e74c3c",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1,
            "circle-opacity": 0.7,
          },
        });
      }

      // Click popup
      map.on("click", "incidents-circles", (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const [lng, lat] = (f.geometry as any).coordinates;
        const p = f.properties as Record<string, any>;

        const incident = p?.text_general_code ?? "Unknown incident";
        const rawDate = p?.dispatch_date_time ?? null;
        let formattedDate = "Unknown time";

        // Format date/time if available
        if (rawDate) {
          const d = new Date(rawDate);
          formattedDate = d.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
        }

        new maplibregl.Popup()
          .setLngLat([lng, lat])
          .setHTML(`<b>${incident}</b><br><small>${formattedDate}</small>`)
          .addTo(map);
      });

      // Refresh data every 60s
      const refresh = async () => {
        try {
          const res = await fetch(INCIDENTS_URL, { cache: "no-store" });
          const fc = await res.json();
          const src = map.getSource("incidents") as maplibregl.GeoJSONSource;
          src.setData(fc);
        } catch (err) {
          console.warn("Incidents refresh failed", err);
        }
      };
      refreshTimer = window.setInterval(refresh, 60_000) as unknown as number;
      // Do one immediate refresh so you are not waiting 60s after load
      refresh();
    });

    return () => {
      markerRef.current?.remove();
      if (refreshTimer) window.clearInterval(refreshTimer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Ask for location once after map is ready
  useEffect(() => {
    const map = mapRef.current;
    if (!map || geoStatus !== "idle") return;

    if (!("geolocation" in navigator)) {
      setGeoStatus("denied");
      return;
    }

    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus("ok");
        const lng = pos.coords.longitude;
        const lat = pos.coords.latitude;
        const lngLat: [number, number] = [lng, lat];

        map.flyTo({
          center: lngLat,
          zoom: Math.max(map.getZoom(), 13),
          essential: true,
        });

        if (!markerRef.current) {
          markerRef.current = new maplibregl.Marker()
            .setLngLat(lngLat)
            .addTo(map);
        } else {
          markerRef.current.setLngLat(lngLat);
        }
      },
      () => setGeoStatus("denied"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [geoStatus]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />
      {geoStatus === "loading" && <Banner>Getting your location…</Banner>}
      {geoStatus === "denied" && (
        <Banner>Location not available. Using Philly center.</Banner>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 12,
        top: 12,
        padding: "8px 12px",
        background: "rgba(0,0,0,0.6)",
        color: "#fff",
        fontSize: 14,
        borderRadius: 8,
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}
