import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";

type MapOpts = {
  style: string;
  center: [number, number];
  zoom: number;
};

export function useMapLibre(
  containerRef: React.RefObject<HTMLDivElement>,
  opts: MapOpts,
  onReady?: (m: maplibregl.Map) => void
) {
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: opts.style,
      center: opts.center,
      zoom: opts.zoom,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }));
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "imperial" }), "bottom-left");

    map.on("load", () => onReady?.(map));

    const onResize = () => map.resize();
    window.addEventListener("resize", onResize);

    mapRef.current = map;

    return () => {
      window.removeEventListener("resize", onResize);
      try { map.remove(); } catch {}
      mapRef.current = null;
    };
  }, [containerRef, opts.style, opts.center[0], opts.center[1], opts.zoom, onReady]);

  return mapRef;
}
