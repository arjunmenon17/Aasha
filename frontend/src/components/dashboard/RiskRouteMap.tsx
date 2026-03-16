import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { Patient, RiskTier } from '@/types';
import { gestWeeks } from '@/utils/gestation';
import { timeAgo } from '@/utils/time';
import {
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import L, { type LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface RiskRouteMapProps {
  patients: Patient[];
  onSelectPatient?: (id: string) => void;
}

interface MapNode {
  id: string;
  name: string;
  tier: RiskTier;
  status: Patient['status'];
  updatedAt: string;
  weeks: number;
  misses: number;
  staleDays: number;
  priority: number;
  locationLabel: string;
  lat: number;
  lng: number;
}

const TIER_COLOR: Record<RiskTier, string> = {
  3: '#dc2626',
  2: '#ea580c',
  1: '#ca8a04',
  0: '#16a34a',
};

function hashToUnit(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

function tierLabel(tier: RiskTier): string {
  if (tier === 3) return 'Emergency';
  if (tier === 2) return 'Concern';
  if (tier === 1) return 'Watch';
  return 'Normal';
}

function fallbackLocation(p: Patient): { lat: number; lng: number; label: string } {
  // Wider Nairobi spread so demo map is readable even without DB lat/lng.
  const hubs = [
    { label: 'Kibera - Laini Saba', lat: -1.3148, lng: 36.784 },
    { label: 'Kibera - Gatwekera', lat: -1.3166, lng: 36.7811 },
    { label: 'Kawangware', lat: -1.2865, lng: 36.7499 },
    { label: 'Dagoretti', lat: -1.292, lng: 36.7362 },
    { label: 'Langata', lat: -1.3449, lng: 36.7717 },
    { label: 'Kilimani', lat: -1.2921, lng: 36.7836 },
    { label: 'South C', lat: -1.3208, lng: 36.8298 },
  ];
  const base = hubs[Math.floor(hashToUnit(p.id, 7) * hubs.length) % hubs.length];
  const lat = base.lat + (hashToUnit(p.id, 11) - 0.5) * 0.008;
  const lng = base.lng + (hashToUnit(p.id, 23) - 0.5) * 0.012;
  return { lat, lng, label: base.label };
}

function toNodes(patients: Patient[]): MapNode[] {
  return patients.map((p) => {
    const stale = daysSince(p.updated_at);
    const misses = p.consecutive_misses ?? 0;
    const weeks = gestWeeks(p.gestational_age_at_enrollment, p.enrollment_date);
    const priority = p.current_risk_tier * 100 + stale * 1.6 + misses * 6;

    const lat = toNum(p.location_lat);
    const lng = toNum(p.location_lng);
    const label =
      (typeof p.location_label === 'string' && p.location_label.trim()) ||
      (typeof p.address === 'string' && p.address.trim()) ||
      null;
    const fallback = fallbackLocation(p);

    return {
      id: p.id,
      name: p.name,
      tier: p.current_risk_tier,
      status: p.status,
      updatedAt: p.updated_at,
      weeks,
      misses,
      staleDays: stale,
      priority,
      locationLabel: label ?? fallback.label,
      lat: lat ?? fallback.lat,
      lng: lng ?? fallback.lng,
    };
  });
}

function distKm(a: MapNode, b: MapNode): number {
  const latMid = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (a.lng - b.lng) * 111.32 * Math.cos(latMid);
  const dy = (a.lat - b.lat) * 110.57;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildRoute(nodes: MapNode[]): MapNode[] {
  if (nodes.length === 0) return [];

  let pool = nodes.filter((n) => n.tier >= 2).sort((a, b) => b.priority - a.priority);
  if (pool.length === 0) {
    pool = [...nodes].sort((a, b) => b.priority - a.priority).slice(0, Math.min(8, nodes.length));
  }
  if (pool.length <= 1) return pool;

  const orderTiers: RiskTier[] = [3, 2, 1, 0];
  const byTier = new Map<RiskTier, MapNode[]>();
  for (const tier of orderTiers) {
    byTier.set(
      tier,
      pool
        .filter((n) => n.tier === tier)
        .sort((a, b) => b.priority - a.priority),
    );
  }

  const route: MapNode[] = [];
  let current: MapNode | null = null;

  // Hard rule: finish higher-risk tiers before moving to lower tiers.
  // Distance only breaks ties within the same tier.
  for (const tier of orderTiers) {
    const remaining = [...(byTier.get(tier) ?? [])];
    if (remaining.length === 0) continue;

    while (remaining.length > 0) {
      let bestIdx = 0;
      if (current === null) {
        // First stop overall: highest-priority patient in highest available tier.
        bestIdx = 0;
      } else {
        let bestDistance = Infinity;
        let bestPriority = -Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const cand = remaining[i];
          const d = distKm(current, cand);
          if (d < bestDistance || (Math.abs(d - bestDistance) < 1e-6 && cand.priority > bestPriority)) {
            bestDistance = d;
            bestPriority = cand.priority;
            bestIdx = i;
          }
        }
      }

      const next = remaining.splice(bestIdx, 1)[0];
      route.push(next);
      current = next;
    }
  }

  return route;
}

function deconflictNodes(nodes: MapNode[]): MapNode[] {
  // If multiple patients are essentially same coordinate, fan them out slightly.
  const groups = new Map<string, MapNode[]>();
  for (const n of nodes) {
    const key = `${n.lat.toFixed(4)}:${n.lng.toFixed(4)}`;
    const arr = groups.get(key) ?? [];
    arr.push(n);
    groups.set(key, arr);
  }

  const out: MapNode[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    arr.forEach((n, idx) => {
      const angle = (idx / arr.length) * Math.PI * 2;
      const r = 0.0011; // ~120m
      out.push({
        ...n,
        lat: n.lat + Math.sin(angle) * r,
        lng: n.lng + Math.cos(angle) * r,
      });
    });
  }
  return out;
}

function computeBounds(nodes: MapNode[]): L.LatLngBoundsExpression | null {
  if (nodes.length === 0) return null;
  return nodes.map((n) => [n.lat, n.lng] as LatLngTuple);
}

function routeDistanceKm(route: MapNode[]): number {
  if (route.length <= 1) return 0;
  let total = 0;
  for (let i = 1; i < route.length; i++) total += distKm(route[i - 1], route[i]);
  return total;
}

function sequenceIcon(sequence: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:transparent;color:#fff;border:1px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;line-height:1;text-shadow:0 0 1px #000, 0 0 2px #000;">${sequence}</div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function FitToBounds({ bounds }: { bounds: L.LatLngBoundsExpression | null }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
  }, [map, bounds]);
  return null;
}

interface NodeMarkersProps {
  nodes: MapNode[];
  routeIndex: Map<string, number>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setHoveredId: React.Dispatch<React.SetStateAction<string | null>>;
  onSelectPatient?: (id: string) => void;
}

function NodeMarkers({
  nodes,
  routeIndex,
  selectedId,
  setSelectedId,
  setHoveredId,
  onSelectPatient,
}: NodeMarkersProps) {
  const map = useMap();
  const markerRefs = useRef<Record<string, L.CircleMarker | null>>({});

  useEffect(() => {
    if (!selectedId) return;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return;
    map.flyTo([node.lat, node.lng], map.getZoom(), { duration: 0.4 });
    const layer = markerRefs.current[selectedId];
    const openPopup = () => {
      layer?.openPopup();
    };
    const t = setTimeout(openPopup, 350);
    return () => clearTimeout(t);
  }, [selectedId, nodes, map]);

  return (
    <>
      {nodes.map((n) => {
        const sequence = routeIndex.get(n.id);
        const radius = n.tier >= 2 ? 11 : 8;
        const ringRadius = radius + 5;
        return (
          <Fragment key={n.id}>
            <CircleMarker
              key={`${n.id}-ring`}
              center={[n.lat, n.lng]}
              radius={ringRadius}
              pathOptions={{
                color: TIER_COLOR[n.tier],
                weight: 2.5,
                fillColor: TIER_COLOR[n.tier],
                fillOpacity: 0,
                className: 'aasha-marker-ring-pulse',
              }}
              interactive={false}
            />
            <CircleMarker
              key={n.id}
              center={[n.lat, n.lng]}
              radius={radius}
              pathOptions={{
                color: '#ffffff',
                weight: selectedId === n.id ? 3 : 1.5,
                fillColor: TIER_COLOR[n.tier],
                fillOpacity: 0.92,
                className: selectedId === n.id ? 'aasha-marker-selected' : undefined,
              }}
              ref={(el) => {
                if (el != null) {
                  const layer = (el as { leafletElement?: L.CircleMarker }).leafletElement ?? (el as unknown as L.CircleMarker);
                  markerRefs.current[n.id] = layer;
                } else {
                  markerRefs.current[n.id] = null;
                }
              }}
              eventHandlers={{
                mouseover: () => setHoveredId(n.id),
                mouseout: () => setHoveredId((x) => (x === n.id ? null : x)),
                click: () => setSelectedId(n.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={0.96}>
                <div className="text-xs">
                  <div className="font-semibold">{n.name}</div>
                  <div>
                    Tier {n.tier} · {n.locationLabel}
                  </div>
                  {sequence ? <div>Stop #{sequence}</div> : null}
                </div>
              </Tooltip>
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-sm mb-1">{n.name}</div>
                  <div>Tier {n.tier} · {tierLabel(n.tier)}</div>
                  <div>Status: {n.status}</div>
                  <div>Location: {n.locationLabel}</div>
                  {onSelectPatient && (
                    <button
                      type="button"
                      onClick={() => onSelectPatient(n.id)}
                      className="mt-2 w-full px-2 py-1.5 rounded border border-pregnancy text-pregnancy text-[0.7rem] font-medium hover:bg-pregnancy/10"
                    >
                      View full details
                    </button>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          </Fragment>
        );
      })}
    </>
  );
}

export function RiskRouteMap({ patients, onSelectPatient }: RiskRouteMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const nodesRaw = useMemo(() => toNodes(patients), [patients]);
  const nodes = useMemo(() => deconflictNodes(nodesRaw), [nodesRaw]);
  const route = useMemo(() => buildRoute(nodes), [nodes]);
  const bounds = useMemo(() => computeBounds(nodes), [nodes]);
  const routeIndex = useMemo(() => {
    const map = new Map<string, number>();
    route.forEach((n, idx) => map.set(n.id, idx + 1));
    return map;
  }, [route]);

  const routeLine = useMemo(
    () => route.map((n) => [n.lat, n.lng] as LatLngTuple),
    [route],
  );

  const distanceKm = routeDistanceKm(route);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white text-slate-900 p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-3">
        <div>
          <div className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-slate-500">
            CHW Route Planner
          </div>
          <div className="text-base font-bold text-slate-900">
            Live map with risk-prioritized route
          </div>
        </div>
        <div className="flex flex-col sm:items-end gap-1 sm:gap-1.5 sm:text-right">
          <div className="text-[0.68rem] text-slate-500 hidden sm:block">
            OSM basemap · click markers to show details in panel
          </div>
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-0.5 text-[0.7rem] text-slate-600 sm:justify-end">
            {([3, 2, 1, 0] as RiskTier[]).map((tier) => (
              <span key={tier} className="inline-flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: TIER_COLOR[tier] }}
                />
                <span>T{tier} {tierLabel(tier)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 xl:h-[480px] xl:min-h-0">
        <div className="xl:col-span-2 flex flex-col min-h-0 rounded-xl border border-slate-200 overflow-hidden h-[300px] sm:h-[380px] xl:h-auto">
          <div className="flex-1 min-h-0 w-full h-full">
            <MapContainer
              center={[-1.31, 36.78]}
              zoom={12}
              scrollWheelZoom
              className="h-full w-full"
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitToBounds bounds={bounds} />

              {routeLine.length > 1 && (
                <>
                  {/* Shadow / glow behind the route */}
                  <Polyline
                    positions={routeLine}
                    pathOptions={{
                      color: '#64748b',
                      weight: 10,
                      opacity: 0.35,
                    }}
                  />
                  {/* Main dashed route line */}
                  <Polyline
                    positions={routeLine}
                    pathOptions={{
                      color: '#B85050',
                      weight: 5,
                      opacity: 0.92,
                      dashArray: '14 8',
                      lineCap: 'round',
                      lineJoin: 'round',
                    }}
                  />
                </>
              )}

              <NodeMarkers
                nodes={nodes}
                routeIndex={routeIndex}
                selectedId={selectedId}
                setSelectedId={setSelectedId}
                setHoveredId={setHoveredId}
                onSelectPatient={onSelectPatient}
              />

              {route.map((n, idx) => (
                <Marker
                  key={`seq-${n.id}`}
                  position={[n.lat, n.lng]}
                  icon={sequenceIcon(idx + 1)}
                  interactive={false}
                />
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="flex flex-col min-h-0 rounded-xl border border-slate-200 bg-white overflow-hidden max-h-[260px] xl:max-h-none">
          {/* Panel header */}
          <div className="px-4 pt-3.5 pb-2.5 border-b border-slate-100 shrink-0">
            <div className="text-[0.62rem] uppercase tracking-[0.2em] text-slate-400 mb-0.5">
              Suggested Route
            </div>
            <div className="text-sm font-bold text-slate-900 leading-tight">
              Visit order · high risk first
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1 text-[0.67rem] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {route.length} stop{route.length !== 1 ? 's' : ''}
              </span>
              <span className="inline-flex items-center gap-1 text-[0.67rem] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                {distanceKm.toFixed(1)} km
              </span>
            </div>
          </div>

          {route.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-slate-400">No patients available.</p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {route.map((n, idx) => {
                const isSelected = selectedId === n.id;
                const isHovered = hoveredId === n.id;
                const isLast = idx === route.length - 1;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelectedId(n.id)}
                    className={`w-full text-left flex items-stretch transition-colors ${
                      isSelected
                        ? 'bg-pregnancy/5'
                        : isHovered
                        ? 'bg-slate-50'
                        : 'hover:bg-slate-50/70'
                    } ${!isLast ? 'border-b border-slate-100' : ''}`}
                  >
                    {/* Left: step number column */}
                    <div className="w-9 shrink-0 flex flex-col items-center pt-3.5">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[0.6rem] font-bold shrink-0"
                        style={{ backgroundColor: TIER_COLOR[n.tier] }}
                      >
                        {idx + 1}
                      </div>
                      {!isLast && (
                        <div className="w-px flex-1 mt-1 mb-0" style={{ backgroundColor: TIER_COLOR[n.tier], opacity: 0.2 }} />
                      )}
                    </div>

                    {/* Right: content */}
                    <div className="flex-1 min-w-0 px-2 py-2.5 pr-3">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <span className="text-xs font-semibold text-slate-900 truncate leading-tight">
                          {n.name}
                        </span>
                        <span
                          className="shrink-0 text-[0.6rem] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                          style={{ backgroundColor: TIER_COLOR[n.tier] }}
                        >
                          T{n.tier}
                        </span>
                      </div>
                      <div className="text-[0.67rem] text-slate-500 truncate">
                        {tierLabel(n.tier)} · {n.locationLabel}
                      </div>
                      <div className="text-[0.65rem] text-slate-400 mt-0.5 flex items-center gap-1.5">
                        <span className="capitalize">{n.status}</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                        <span>{n.weeks}w</span>
                        <span className="w-0.5 h-0.5 rounded-full bg-slate-300" />
                        <span>{timeAgo(n.updatedAt)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

