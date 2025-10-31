import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as d3 from "d3";
import { useMapLibre } from "./hooks/useMapLibre";

/* ===== Map defaults ===== */
const lng = -75.16;
const lat = 39.95;
const zoom = 10;
const API_KEY = "BKjSuIRZjpD2Bbxv8AJz"; // replace with real key or env
const STYLE_URL = `https://api.maptiler.com/maps/streets-v2/style.json?key=${API_KEY}`;

const PHILLY = { center: [lng, lat] as [number, number], zoom };
const RAMP = ["#f1eef6", "#bdc9e1", "#74a9cf", "#2b8cbe", "#045a8d"];
const NO_DATA_COLOR = "#e5e7eb";
const STROKE_COLOR = "#ffffff";

const DEFAULT_VARIABLES = [
  {
    key: "impacted",
    label: "Households with SNAP",
    format: (v: number) => d3.format(".0%")((v || 0) / 100),
  },
  {
    key: "households_public_assistance_income",
    label: "Households Receiving Public Assistance Income",
    format: (v: number) => d3.format(".1%")((v || 0) / 100),
  },
] as const;

/* ===== Helpers ===== */
function joinData(tracts: any, acsRows: any[]) {
  const byId = new Map(acsRows.map((r) => [String(r.GEOID), r]));
  tracts.features.forEach((f: any) => {
    const id = String(f.properties.GEOID);
    f.properties.__acs = byId.get(id) || null;
  });
  return tracts;
}

function getBreaks(tracts: any, field: string, k = 5) {
  const values: number[] = tracts.features
    .map((f: any) => Number(f.properties.__acs?.[field]))
    .filter((v: any) => Number.isFinite(v));
  if (!values.length) return [] as number[];
  const scale = d3.scaleQuantile(values, d3.range(k));
  const breaks = scale.quantiles();
  const min = d3.min(values)!;
  const max = d3.max(values)!;
  return [min, ...breaks, max];
}

function tooltipHTML(
  props: any,
  label: string,
  format: (v: number) => string,
  raw: number | null
) {
  const name = props.NAMELSAD || props.NAME || props.GEOID;
  const pretty = Number.isFinite(raw ?? NaN)
    ? format(raw as number)
    : "No data";
  return `
    <div class="text-xs">
      <div class="font-semibold mb-1">${name}</div>
      <div><span class="text-gray-500">${label}</span>: ${pretty}</div>
    </div>
  `;
}

/* ===== Component ===== */
export default function PolicyAlertMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useMapLibre(
    containerRef as React.RefObject<HTMLDivElement>,
    { style: STYLE_URL, center: PHILLY.center, zoom: PHILLY.zoom },
    // optional onReady callback if you need it
    () => {}
  );

  const [tracts, setTracts] = useState<any | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [variable, setVariable] = useState<
    (typeof DEFAULT_VARIABLES)[number]["key"]
  >(DEFAULT_VARIABLES[0].key);

  const activeVar = useMemo(
    () => DEFAULT_VARIABLES.find((v) => v.key === variable)!,
    [variable]
  );

  const legendBreaks = useMemo(
    () => (tracts ? getBreaks(tracts, activeVar.key, RAMP.length) : []),
    [tracts, activeVar.key]
  );

  /* Load data once */
  useEffect(() => {
    (async () => {
      try {
        setDataError(null);
        const [tractRes, acsRes] = await Promise.all([
          fetch("/data/tracts.geojson").then((r) => (r.ok ? r.json() : null)),
          fetch("/data/acs.csv").then((r) => (r.ok ? r.text() : "")),
        ]);
        if (!tractRes) {
          setDataError(
            "Could not load /data/tracts.geojson. Check public/data path."
          );
          return;
        }
        const acsRows = acsRes
          ? (d3.csvParse(acsRes, d3.autoType) as any[])
          : [];
        setTracts(joinData(tractRes, acsRows));
      } catch (e: any) {
        console.error(e);
        setDataError(String(e?.message ?? e));
      }
    })();
  }, []);

  /* Add or update choropleth when data or variable changes */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !tracts) return;

    const srcId = "tracts";
    const fillId = "tracts-fill";
    const outlineId = "tracts-outline";

    let popup: maplibregl.Popup | null = null;

    const onMove = (e: maplibregl.MapLayerMouseEvent) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: [fillId] });
      if (!feats.length) {
        if (popup) popup.remove();
        popup = null;
        map.getCanvas().style.cursor = "";
        return;
      }
      const f = feats[0];
      const raw =
        f.properties?.__acs != null
          ? (f.properties.__acs as any)[activeVar.key] ?? null
          : null;

      const html = tooltipHTML(
        f.properties || {},
        activeVar.label,
        activeVar.format,
        raw
      );

      if (!popup)
        popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
        });
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map);
      map.getCanvas().style.cursor = "pointer";
    };

    const onLeave = () => {
      if (popup) popup.remove();
      popup = null;
      map.getCanvas().style.cursor = "";
    };

    const addOrUpdate = () => {
      const src = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
      if (!src) map.addSource(srcId, { type: "geojson", data: tracts });
      else src.setData(tracts as any);

      if (!map.getLayer(fillId)) {
        map.addLayer({
          id: fillId,
          type: "fill",
          source: srcId,
          paint: { "fill-color": NO_DATA_COLOR, "fill-opacity": 0.95 },
        });
      }
      if (!map.getLayer(outlineId)) {
        map.addLayer({
          id: "tracts-outline",
          type: "line",
          source: srcId,
          paint: {
            "line-color": STROKE_COLOR,
            "line-width": 0.5,
            "line-opacity": 0.8,
          },
        });
      }

      const breaks = getBreaks(tracts, activeVar.key, RAMP.length);
      if (breaks.length && map.getLayer(fillId)) {
        const valueExpr: any = [
          "to-number",
          ["get", activeVar.key, ["get", "__acs"]],
        ];
        const stepExp: any[] = ["step", valueExpr, RAMP[0]];
        breaks.slice(1, -1).forEach((s, i) => stepExp.push(s, RAMP[i + 1]));

        const isNumber: any = ["==", ["typeof", valueExpr], "number"];
        const colorWithNoData: any = [
          "case",
          ["!", isNumber],
          NO_DATA_COLOR,
          stepExp,
        ];

        map.setPaintProperty(fillId, "fill-color", colorWithNoData);
      }

      if (!(map as any).__didFit && tracts?.features?.length) {
        try {
          const b = d3.geoBounds(tracts as any);
          map.fitBounds(
            [
              [b[0][0], b[0][1]],
              [b[1][0], b[1][1]],
            ],
            { padding: 20, duration: 0 }
          );
          (map as any).__didFit = true;
        } catch {}
      }

      map.off("mousemove", fillId, onMove as any);
      map.off("mouseleave", fillId, onLeave as any);
      map.on("mousemove", fillId, onMove as any);
      map.on("mouseleave", fillId, onLeave as any);
    };

    if (map.isStyleLoaded()) addOrUpdate();
    else map.once("load", addOrUpdate);

    const onStyle = () => addOrUpdate();
    map.on("styledata", onStyle);

    return () => {
      map.off("styledata", onStyle);
      map.off("mousemove", fillId, onMove as any);
      map.off("mouseleave", fillId, onLeave as any);
      if (popup) popup.remove();
    };
  }, [mapRef, tracts, activeVar]);

  /* UI */
  return (
    <div className="h-screen w-full flex">
      <div className="w-80 border-r bg-white p-4 space-y-4 overflow-y-auto z-10">
        <h1 className="text-xl font-semibold">Census and Policy Map</h1>

        <label className="block text-xs font-medium text-gray-700 mt-4">
          Metric
        </label>
        <select
          className="w-full rounded-lg border-gray-300 text-sm"
          value={variable}
          onChange={(e) => setVariable(e.target.value as any)}
        >
          {DEFAULT_VARIABLES.map((v) => (
            <option key={v.key} value={v.key}>
              {v.label}
            </option>
          ))}
        </select>

        {/* Legend */}
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-700 mb-2">Legend</div>
          {legendBreaks.length ? (
            <div className="space-y-1">
              {RAMP.map((c, i) => {
                const lo = legendBreaks[i];
                const hi = legendBreaks[i + 1];
                if (lo == null || hi == null) return null;
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span
                      className="inline-block w-4 h-4 rounded"
                      style={{ background: c }}
                    />
                    <span className="text-xs text-gray-700">
                      {activeVar.format(lo)} – {activeVar.format(hi)}
                    </span>
                  </div>
                );
              })}
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-4 h-4 rounded"
                  style={{ background: NO_DATA_COLOR }}
                />
                <span className="text-xs text-gray-700">No data</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Legend will appear after data loads.
            </div>
          )}
        </div>

        {dataError && <p className="text-xs text-red-600 mt-3">{dataError}</p>}

        <p className="text-xs text-gray-500 mt-2">
          Data files must be at <code>/data/tracts.geojson</code> and{" "}
          <code>/data/acs.csv</code>.
        </p>
      </div>

      <div className="flex-1 relative">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
