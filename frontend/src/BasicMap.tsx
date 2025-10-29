// src/BasicMap.tsx
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"; // reliable public style

export default function BasicMap() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;

    const map = new maplibregl.Map({
      container: ref.current,
      style: STYLE_URL,
      center: [-75.16, 39.95],
      zoom: 10,
      attributionControl: { compact: true },
    });

    map.on("load", () => {
      console.log("✅ Map loaded");
      // outline shows the canvas area in case tiles don’t load
      map.getCanvas().style.outline = "2px solid red";
    });

    map.on("error", (e) => {
      console.error("❌ Map error", e?.error || e);
    });

    return () => map.remove();
  }, []);

  return (
    <div className="border border-blue-500 m-3">
      <div className="bg-yellow-100 text-xs p-2">BasicMap mounted ✅</div>
      {/* fixed height to guarantee visibility */}
      <div ref={ref} style={{ height: 500, position: "relative" }} />
    </div>
  );
}
