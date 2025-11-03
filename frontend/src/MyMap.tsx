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
    WHERE dispatch_date_time > now() - interval '4 weeks'
    ORDER BY dispatch_date_time DESC
    LIMIT 20000
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

      if (!map.getSource("tracts")) {
        map.addSource("tracts", {
          type: "geojson",
          data: "/data/tracts.geojson", // MapLibre can fetch this URL directly
          generateId: true,
        });
      }

      if (!map.getLayer("incidents-heat")) {
        map.addLayer({
          id: "incidents-heat",
          type: "heatmap",
          source: "incidents",
          maxzoom: 14,
          paint: {
            // Increase the heatmap weight based on frequency and property magnitude
            "heatmap-weight": 1,
            // Increase the heatmap color weight weight by zoom level
            // heatmap-intensity is a multiplier on top of heatmap-weight
            "heatmap-intensity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              0,
              1,
              14,
              3,
            ],
            "heatmap-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8,
              12,
              12,
              28,
              15,
              42,
            ],
            // Color ramp for heatmap.  Domain is 0 (low) to 1 (high).
            // Begin color ramp at 0-stop with a 0-transparency color
            // to create a blur-like effect.
            "heatmap-color": [
              "interpolate",
              ["exponential", 1.8],
              ["heatmap-density"],
              0,
              "rgba(33,102,172,0)",
              0.15,
              "rgb(103,169,207)",
              0.35,
              "rgb(209,229,240)",
              0.55,
              "rgb(253,219,199)",
              0.75,
              "rgb(239,138,98)",
              1,
              "rgb(178,24,43)",
            ],
            // Transition from heatmap to circle layer by zoom level
            "heatmap-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12,
              1,
              14,
              0,
            ],
          },
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
            "circle-stroke-width": 2,
            "circle-opacity": 0.7,
          },
        });
      }

      // second source that shares the same data but enables clustering
      map.addSource("incidents-clustered", {
        type: "geojson",
        data: INCIDENTS_URL, // or the same URL you used
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "incidents-clustered",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#99d8c9",
            10,
            "#41ae76",
            25,
            "#006d2c",
            50,
          ],
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14,
            10,
            20,
            25,
            28,
            50,
            36,
          ],
          "circle-opacity": 0.85,
        },
      });
      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "incidents-clustered",
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 12,
        },
        paint: { "text-color": "#fff" },
      });

      if (!map.getLayer("tracts")) {
        map.addLayer({
          id: "tract-borders",
          type: "line",
          source: "tracts",
          paint: {
            "line-color": "black",
            "line-width": 0.9,
          },
        });
      }

      // Hover popup
      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
      });

      map.on("mouseenter", "incidents-circles", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mousemove", "incidents-circles", (e) => {
        const f = e.features?.[0];
        if (!f) return;

        const [lng, lat] = (f.geometry as any).coordinates;
        const p = f.properties as Record<string, any>;

        const incident = p?.text_general_code ?? "Unknown incident";
        const rawDate = p?.dispatch_date_time ?? null;
        let formattedDate = "Unknown time";

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

        popup
          .setLngLat([lng, lat])
          .setHTML(`<b>${incident}</b><br><small>${formattedDate}</small>`)
          .addTo(map);
      });

      map.on("mouseleave", "incidents-circles", () => {
        map.getCanvas().style.cursor = "";
        popup.remove();
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
