import { useEffect, useMemo, useState } from 'react';
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
      (typeof p.location_label === 'string' && p.location_label.trim()) || null;
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

  const remaining = [...pool];
  const route: MapNode[] = [];
  route.push(remaining.shift() as MapNode);

  while (remaining.length > 0) {
    const current = route[route.length - 1];
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i];
      const score = distKm(current, cand) - cand.priority * 0.015;
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    route.push(remaining.splice(bestIdx, 1)[0]);
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
    html: `<div style="width:18px;height:18px;border-radius:9999px;background:#0f172a;color:#fff;border:1px solid #fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;line-height:1;">${sequence}</div>`,
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

export function RiskRouteMap({ patients, onSelectPatient }: RiskRouteMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const nodesRaw = useMemo(() => toNodes(patients), [patients]);
  const nodes = useMemo(() => deconflictNodes(nodesRaw), [nodesRaw]);
  const route = useMemo(() => buildRoute(nodes), [nodes]);
  const bounds = useMemo(() => computeBounds(nodes), [nodes]);
  const routeIndex = useMemo(() => {
    const map = new Map<string, number>();
    route.forEach((n, idx) => map.set(n.id, idx + 1));
    return map;
  }, [route]);
  const hovered = hoveredId ? nodes.find((n) => n.id === hoveredId) ?? null : null;
  const routeLine = route.map((n) => [n.lat, n.lng] as LatLngTuple);
  const distanceKm = routeDistanceKm(route);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white text-slate-900 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-slate-500">
            CHW Route Planner
          </div>
          <div className="text-sm font-semibold text-slate-900">
            Live map with risk-prioritized route
          </div>
        </div>
        <div className="text-[0.68rem] text-slate-500 text-right">
          OSM basemap · click markers to open patient details
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 rounded-xl border border-slate-200 overflow-hidden">
          <div className="h-[420px] w-full">
            <MapContainer
              center={[-1.31, 36.78]}
              zoom={12}
              scrollWheelZoom
              className="h-full w-full"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitToBounds bounds={bounds} />

              {routeLine.length > 1 && (
                <Polyline
                  positions={routeLine}
                  pathOptions={{
                    color: '#0f172a',
                    weight: 4,
                    opacity: 0.75,
                    dashArray: '8 8',
                  }}
                />
              )}

              {nodes.map((n) => {
                const sequence = routeIndex.get(n.id);
                const radius = n.tier >= 2 ? 11 : 8;
                return (
                  <CircleMarker
                    key={n.id}
                    center={[n.lat, n.lng]}
                    radius={radius}
                    pathOptions={{
                      color: '#ffffff',
                      weight: 1.5,
                      fillColor: TIER_COLOR[n.tier],
                      fillOpacity: 0.92,
                    }}
                    eventHandlers={{
                      mouseover: () => setHoveredId(n.id),
                      mouseout: () => setHoveredId((x) => (x === n.id ? null : x)),
                      click: () => onSelectPatient?.(n.id),
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
                        <div>
                          Coords: {n.lat.toFixed(4)}, {n.lng.toFixed(4)}
                        </div>
                        <div className="mt-1 text-slate-600">Click marker/card to open detail</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}

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

        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500 mb-1">
            Suggested Route
          </div>
          <div className="text-sm font-semibold text-slate-900 mb-1">
            Visit order (risk + distance)
          </div>
          <div className="text-[0.7rem] text-slate-500 mb-2">
            {route.length} stops · approx {distanceKm.toFixed(1)} km
          </div>

          {route.length === 0 ? (
            <div className="text-sm text-slate-500">No patients available.</div>
          ) : (
            <div className="space-y-2 max-h-[312px] overflow-y-auto pr-1">
              {route.map((n, idx) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onSelectPatient?.(n.id)}
                  className="w-full text-left rounded-lg border border-slate-200 px-2.5 py-2 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {idx + 1}. {n.name}
                    </div>
                    <span
                      className="text-[0.62rem] px-1.5 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: TIER_COLOR[n.tier] }}
                    >
                      T{n.tier}
                    </span>
                  </div>
                  <div className="text-[0.68rem] text-slate-500 mt-0.5">
                    {tierLabel(n.tier)} · {n.locationLabel}
                  </div>
                  <div className="text-[0.68rem] text-slate-500">
                    {n.status} · {n.weeks}w · {timeAgo(n.updatedAt)}
                  </div>
                </button>
              ))}
            </div>
          )}

          {hovered ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[0.72rem] text-slate-700">
              <div className="font-semibold text-slate-900">{hovered.name}</div>
              <div>Tier {hovered.tier} · {tierLabel(hovered.tier)}</div>
              <div>Location: {hovered.locationLabel}</div>
              <div>
                Coords: {hovered.lat.toFixed(4)}, {hovered.lng.toFixed(4)}
              </div>
              <div>Gestational age: {hovered.weeks} weeks</div>
              <div>Missed check-ins: {hovered.misses}</div>
              <div>Updated: {timeAgo(hovered.updatedAt)}</div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.72rem] text-slate-700">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" />
          Tier 3 emergency
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" />
          Tier 2 concern
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" />
          Tier 1 watch
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-green-600 inline-block" />
          Tier 0 normal
        </span>
      </div>
    </div>
  );
}

