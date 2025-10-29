import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import * as d3 from "d3";

// Public, reliable basemap style
const STYLE_URL =
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

// Variables you can map. Keys must match columns in acs.csv (0–100 for percentages)
const DEFAULT_VARIABLES: {
  key: string;
  label: string;
  format: (v: number) => string;
  info?: string;
}[] = [
  {
    key: "snap",
    label: "Households with SNAP",
    format: (v) => d3.format(".0%")((v || 0) / 100),
  },
  {
    key: "tanf",
    label: "Households with TANF",
    format: (v) => d3.format(".1%")((v || 0) / 100),
  },
  {
    key: "poverty_rate",
    label: "Poverty rate",
    format: (v) => d3.format(".0%")((v || 0) / 100),
  },
];

// Choropleth ramp
const RAMP = ["#f1eef6", "#bdc9e1", "#74a9cf", "#2b8cbe", "#045a8d"];
const NO_DATA_COLOR = "#e5e7eb";
const STROKE_COLOR = "#ffffff";

// Join ACS rows into tract features by GEOID
function joinData(tracts: any, acsRows: any[]) {
  const byId = new Map(acsRows.map((r) => [String(r.GEOID), r]));
  tracts.features.forEach((f: any) => {
    const id = String(f.properties.GEOID);
    f.properties.__acs = byId.get(id) || null;
  });
  return tracts;
}

// Quantile breaks
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

// MapLibre expression for fill color
function colorExpression(field: string, breaks: number[]) {
  const valueExpr: any = [
    "to-number",
    ["get", field, ["object", ["get", "__acs"]]],
  ];
  const stepExp: any[] = ["step", valueExpr, RAMP[0]];
  const stops = breaks.slice(1, -1);
  stops.forEach((s, i) => {
    stepExp.push(s, RAMP[i + 1]);
  });
  return stepExp;
}

// Tooltip
function tractTooltipHTML(
  props: any,
  variable: string,
  format: (v: number) => string
) {
  const name = props.NAMELSAD || props.NAME || props.GEOID;
  const raw = Number(props.__acs?.[variable]);
  const pretty = Number.isFinite(raw) ? format(raw) : "No data";
  return `
    <div class="text-xs">
      <div class="font-semibold mb-1">${name}</div>
      <div><span class="text-gray-500">${variable}</span>: ${pretty}</div>
    </div>
  `;
}

export default function PolicyAlertMap() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [tracts, setTracts] = useState<any | null>(null);
  const [policies, setPolicies] = useState<any | null>(null);
  const [variable, setVariable] = useState(DEFAULT_VARIABLES[0].key);
  const activeVar = useMemo(
    () => DEFAULT_VARIABLES.find((v) => v.key === variable)!,
    [variable]
  );

  // Load local data
  useEffect(() => {
    async function load() {
      try {
        const [tractRes, acsRes, polRes] = await Promise.all([
          fetch("/data/tracts.geojson")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
          fetch("/data/acs.csv")
            .then((r) => (r.ok ? r.text() : ""))
            .catch(() => ""),
          fetch("/data/policies.geojson")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null),
        ]);

        const acsRows = acsRes
          ? (d3.csvParse(acsRes, d3.autoType) as any[])
          : [];
        if (tractRes) setTracts(joinData(tractRes, acsRows));
        if (polRes) setPolicies(polRes);
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, []);

  // Init map and keep it sized correctly
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [-75.16, 39.95],
      zoom: 10,
      attributionControl: { compact: true },
    });

    // Handle container and window resizes so the map does not need clicks to appear
    const handleResize = () => {
      try {
        map.resize();
      } catch {}
    };
    const ro = new ResizeObserver(() => handleResize());
    ro.observe(containerRef.current);
    window.addEventListener("resize", handleResize);
    requestAnimationFrame(handleResize);
    setTimeout(handleResize, 100);

    mapRef.current = map;
    return () => {
      try {
        ro.disconnect();
      } catch {}
      window.removeEventListener("resize", handleResize);
      map.remove();
    };
  }, []);

  // Add/update tract layers after style load and when data or variable change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function addOrUpdateLayers() {
      const m = mapRef.current;
      if (!m || !tracts) return;

      const srcId = "tracts";
      const fillId = "tracts-fill";
      const outlineId = "tracts-outline";

      if (!m.getSource(srcId)) {
        m.addSource(srcId, { type: "geojson", data: tracts });
        m.addLayer({
          id: fillId,
          type: "fill",
          source: srcId,
          paint: { "fill-color": NO_DATA_COLOR, "fill-opacity": 0.95 },
        });
        m.addLayer({
          id: outlineId,
          type: "line",
          source: srcId,
          paint: {
            "line-color": STROKE_COLOR,
            "line-width": 0.5,
            "line-opacity": 0.8,
          },
        });

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
        });
        m.on("mousemove", fillId, (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              tractTooltipHTML(
                f.properties,
                variable,
                activeVar?.format || ((v) => String(v))
              )
            )
            .addTo(m);
        });
        m.on("mouseleave", fillId, () => popup.remove());

        // Fit to bounds once
        try {
          // @ts-ignore
          const b = d3.geoBounds(tracts);
          const sw: [number, number] = [b[0][0], b[0][1]];
          const ne: [number, number] = [b[1][0], b[1][1]];
          m.fitBounds([sw, ne], { padding: 20, duration: 0 });
        } catch {}
      } else {
        const src = m.getSource(srcId) as any;
        src.setData(tracts);
      }

      // Paint update
      const breaks = getBreaks(tracts, variable, RAMP.length);
      if (breaks.length) {
        const valueExpr: any = [
          "to-number",
          ["get", variable, ["object", ["get", "__acs"]]],
        ];
        const fillExpr = colorExpression(variable, breaks);
        const colorWithNoData: any = [
          "case",
          ["!", ["is-finite", valueExpr]],
          NO_DATA_COLOR,
          fillExpr,
        ];
        if (m.getLayer("tracts-fill")) {
          m.setPaintProperty(
            "tracts-fill",
            "fill-color",
            colorWithNoData as any
          );
        }
      }

      requestAnimationFrame(() => {
        try {
          m.resize();
        } catch {}
      });
    }

    if (map.isStyleLoaded()) addOrUpdateLayers();
    else map.once("load", addOrUpdateLayers);
  }, [tracts, variable, activeVar]);

  // Policies overlay
  const [showPolicies, setShowPolicies] = useState(true);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !policies) return;

    function addPolicies() {
      const m = mapRef.current;
      if (!m) return;

      const srcId = "policies";
      const lyrId = "policies-circle";

      if (!m.getSource(srcId)) {
        m.addSource(srcId, { type: "geojson", data: policies });
        m.addLayer({
          id: lyrId,
          type: "circle",
          source: srcId,
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2, 12, 6],
            "circle-color": "#ef4444",
            "circle-stroke-color": "#111827",
            "circle-stroke-width": 1,
          },
        });

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: true,
        });
        m.on("click", lyrId, (e) => {
          const f = e.features && e.features[0];
          if (!f) return;
          const p = f.properties || {};
          const html = `
            <div class="text-xs">
              <div class="font-semibold mb-1">${
                p.policy || p.name || "Policy"
              }</div>
              <div class="mb-1">Type: ${p.type || "N/A"}</div>
              ${
                p.start_date
                  ? `<div class="mb-1">Since: ${p.start_date}</div>`
                  : ""
              }
              ${
                p.link
                  ? `<a class="text-blue-600 underline" target="_blank" href="${p.link}">More info</a>`
                  : ""
              }
            </div>
          `;
          popup.setLngLat(e.lngLat).setHTML(html).addTo(m);
        });
      } else {
        const src = m.getSource(srcId) as any;
        src.setData(policies);
      }

      if (m.getLayer(lyrId)) {
        m.setLayoutProperty(
          lyrId,
          "visibility",
          showPolicies ? "visible" : "none"
        );
      }
    }

    if (map.isStyleLoaded()) addPolicies();
    else map.once("load", addPolicies);
  }, [policies, showPolicies]);

  // Legend
  const legend = useMemo(() => {
    if (!tracts) return null as null | { labels: string[]; colors: string[] };
    const breaks = getBreaks(tracts, variable, RAMP.length);
    if (!breaks.length) return null;
    const labels: string[] = [];
    for (let i = 0; i < RAMP.length; i++) {
      const lo = breaks[i];
      const hi = breaks[i + 1];
      if (lo == null || hi == null) continue;
      labels.push(`${d3.format(".1f")(lo)} to ${d3.format(".1f")(hi)}`);
    }
    return { labels, colors: RAMP };
  }, [tracts, variable]);

  return (
    <div className="h-screen w-full flex">
      {/* Sidebar */}
      <div className="w-80 border-r bg-white p-4 space-y-4 overflow-y-auto">
        <h1 className="text-xl font-semibold">Census and Policy Map</h1>
        <p className="text-sm text-gray-600">
          Pick a metric, view the choropleth, then toggle policy locations. No
          data tracts show in light gray.
        </p>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Metric
          </label>
          <select
            className="w-full rounded-lg border-gray-300 text-sm"
            value={variable}
            onChange={(e) => setVariable(e.target.value)}
          >
            {DEFAULT_VARIABLES.map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="toggle-policies"
            type="checkbox"
            checked={showPolicies}
            onChange={(e) => setShowPolicies(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="toggle-policies" className="text-sm">
            Show policy layer
          </label>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700 mb-2">Legend</div>
          {legend ? (
            <div className="space-y-1">
              {legend.labels.map((lab, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div
                    className="h-3 w-6 rounded"
                    style={{ background: RAMP[i] }}
                  />
                  <span>{lab}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs">
                <div
                  className="h-3 w-6 rounded"
                  style={{ background: NO_DATA_COLOR }}
                />
                <span>No data or uninhabited</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-500">
              Legend will appear after data loads
            </div>
          )}
        </div>

        <div className="text-xs text-gray-500">
          Tip: To avoid missing tracts, confirm GEOID formats match in both
          files. Zero pad tract ids.
        </div>
      </div>

      {/* Map area */}
      <div className="flex-1 relative">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ minHeight: 520 }}
        />
        <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur rounded-lg shadow p-2 text-xs">
          <div>
            <span className="font-semibold">Metric:</span>{" "}
            {DEFAULT_VARIABLES.find((v) => v.key === variable)?.label}
          </div>
          <div className="text-gray-500">Click red dots for policy info</div>
        </div>
      </div>
    </div>
  );
}
