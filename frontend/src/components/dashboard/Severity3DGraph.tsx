import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Patient } from '@/types';

interface Severity3DGraphProps {
  patients: Patient[];
  onSelectPatient?: (id: string) => void;
}

type Category = 'emergency' | 'urgent' | 'monitor';

interface GraphPoint {
  patientId: string;
  patientName: string;
  tier: number;
  status: Patient['status'];
  week: number; // X: 0-40
  daysSinceVisit: number; // Y: 0-30
  danger: number; // Z/source: 0-100
  village: string;
  symptomCount: number;
  size: number;
  category: Category;
  pulse: boolean;
}

interface TooltipData extends GraphPoint {
  screenX: number;
  screenY: number;
}

const CATEGORY_COLOR: Record<Category, string> = {
  emergency: '#ef4444',
  urgent: '#f59e0b',
  monitor: '#22c55e',
};

const X_MAX = 40;
const Y_MAX = 30;
const Z_MAX = 100;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

function hashToRange(text: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  const n = Math.abs(h % 10_000) / 10_000;
  return min + n * (max - min);
}

function toGraphPoints(patients: Patient[]): GraphPoint[] {
  return patients.map((p) => {
    const weeks = clamp(
      Math.round(
        (p.gestational_age_at_enrollment + daysSince(p.enrollment_date)) / 7,
      ),
      0,
      X_MAX,
    );
    const misses = p.consecutive_misses ?? 0;
    const danger = clamp(p.current_risk_tier * 30 + misses * 8, 0, Z_MAX);
    const daysVisit = clamp(daysSince(p.updated_at), 0, Y_MAX);

    const rf = p.risk_factors ?? {};
    const symptomCount = Object.values(rf).filter(Boolean).length + misses;
    const difficultyProxy = clamp(4 + symptomCount * 0.9, 4, 14);

    const village =
      (p as Patient & { village?: string }).village ??
      `Village-${Math.round(hashToRange(p.id, 1, 9))}`;

    const category: Category =
      p.current_risk_tier >= 3
        ? 'emergency'
        : p.current_risk_tier >= 2
        ? 'urgent'
        : 'monitor';
    const pulse = p.current_risk_tier >= 2 && daysSince(p.updated_at) <= 1;

    return {
      patientId: p.id,
      patientName: p.name,
      tier: p.current_risk_tier,
      status: p.status,
      week: weeks,
      daysSinceVisit: daysVisit,
      danger,
      village,
      symptomCount,
      size: difficultyProxy,
      category,
      pulse,
    };
  });
}

function gradientColorForDanger(danger: number): THREE.Color {
  // green -> yellow -> orange -> red
  const t = clamp(danger / 100, 0, 1);
  const c = new THREE.Color();
  if (t < 0.33) {
    c.lerpColors(new THREE.Color('#22c55e'), new THREE.Color('#eab308'), t / 0.33);
  } else if (t < 0.66) {
    c.lerpColors(
      new THREE.Color('#eab308'),
      new THREE.Color('#f97316'),
      (t - 0.33) / 0.33,
    );
  } else {
    c.lerpColors(new THREE.Color('#f97316'), new THREE.Color('#ef4444'), (t - 0.66) / 0.34);
  }
  return c;
}

export function Severity3DGraph({ patients, onSelectPatient }: Severity3DGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const xAxisLabelRef = useRef<HTMLDivElement | null>(null);
  const yAxisLabelRef = useRef<HTMLDivElement | null>(null);
  const zAxisLabelRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const tooltipRef = useRef<TooltipData | null>(null);
  const dataSignature = useMemo(
    () =>
      patients
        .map(
          (p) =>
            `${p.id}:${p.current_risk_tier}:${p.gestational_age_at_enrollment}:${p.enrollment_date}:${p.updated_at}:${p.consecutive_misses ?? 0}`,
        )
        .join('|'),
    [patients],
  );
  const points = useMemo(() => toGraphPoints(patients), [dataSignature]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ffffff');
    scene.fog = new THREE.Fog('#ffffff', 55, 150);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
    camera.position.set(30, -36, 28);
    camera.up.set(0, 0, 1); // Z-up so axis semantics match

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.enableZoom = true;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0;
    controls.minDistance = 14;
    controls.maxDistance = 72;
    controls.target.set(0, 0, 8);

    const contentGroup = new THREE.Group();
    scene.add(contentGroup);

    // Lights
    scene.add(new THREE.AmbientLight('#ffffff', 0.3));
    const key = new THREE.DirectionalLight('#f8fafc', 0.95);
    key.position.set(18, -24, 35);
    scene.add(key);
    const fill = new THREE.DirectionalLight('#cbd5e1', 0.6);
    fill.position.set(-20, 24, 20);
    scene.add(fill);
    const rim = new THREE.PointLight('#f97316', 0.75, 120, 2.1);
    rim.position.set(15, 8, 22);
    scene.add(rim);

    // XY floor grid (since Z is vertical here)
    const grid = new THREE.Group();
    const gridMat = new THREE.LineBasicMaterial({
      color: '#94a3b8',
      transparent: true,
      opacity: 0.7,
    });
    for (let i = 0; i <= 10; i++) {
      const x = -20 + i * 4;
      const g1 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -15, 0),
        new THREE.Vector3(x, 15, 0),
      ]);
      grid.add(new THREE.Line(g1, gridMat));
    }
    for (let j = 0; j <= 10; j++) {
      const y = -15 + j * 3;
      const g2 = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-20, y, 0),
        new THREE.Vector3(20, y, 0),
      ]);
      grid.add(new THREE.Line(g2, gridMat));
    }
    contentGroup.add(grid);

    // Axis lines
    const axisOrigin = new THREE.Vector3(-20, -15, 0);
    const axisXEnd = new THREE.Vector3(22, -15, 0);
    const axisYEnd = new THREE.Vector3(-20, 17, 0);
    const axisZEnd = new THREE.Vector3(-20, -15, 16);

    const axisMat = new THREE.LineBasicMaterial({ color: '#334155' });
    const xAxis = new THREE.BufferGeometry().setFromPoints([
      axisOrigin.clone(),
      axisXEnd.clone(),
    ]);
    const yAxis = new THREE.BufferGeometry().setFromPoints([
      axisOrigin.clone(),
      axisYEnd.clone(),
    ]);
    const zAxis = new THREE.BufferGeometry().setFromPoints([
      axisOrigin.clone(),
      axisZEnd.clone(),
    ]);
    contentGroup.add(new THREE.Line(xAxis, axisMat));
    contentGroup.add(new THREE.Line(yAxis, axisMat));
    contentGroup.add(new THREE.Line(zAxis, axisMat));

    // Build smooth blanket surface on X/Y with Z height
    const segX = 48;
    const segY = 34;
    const plane = new THREE.PlaneGeometry(40, 30, segX, segY);
    plane.translate(0, 0, 0);

    const pos = plane.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const glowVertices: THREE.Vector3[] = [];

    function surfaceDanger(worldX: number, worldY: number): number {
      if (points.length === 0) return 5;
      // Convert world coords to axis domain.
      const week = clamp(((worldX + 20) / 40) * X_MAX, 0, X_MAX);
      const days = clamp(((worldY + 15) / 30) * Y_MAX, 0, Y_MAX);

      let weighted = 0;
      let wSum = 0;
      for (const p of points) {
        const dx = (week - p.week) / X_MAX;
        const dy = (days - p.daysSinceVisit) / Y_MAX;
        const d2 = dx * dx + dy * dy;
        const w = Math.exp(-d2 / 0.02); // gaussian kernel
        weighted += p.danger * w;
        wSum += w;
      }
      // Base gentle undulation for cinematic blanket feel.
      const wave = 7 * Math.sin((week / 40) * Math.PI * 2.2) * Math.cos((days / 30) * Math.PI * 1.8);
      return clamp(weighted / Math.max(wSum, 0.0001) + wave, 0, 100);
    }

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const d = surfaceDanger(x, y);
      const z = (d / 100) * 16; // height
      pos.setZ(i, z);
      const c = gradientColorForDanger(d);
      colors.push(c.r, c.g, c.b);
      if (d > 78) glowVertices.push(new THREE.Vector3(x, y, z + 0.35));
    }
    plane.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    plane.computeVertexNormals();

    const blanket = new THREE.Mesh(
      plane,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.25,
        metalness: 0.16,
        transparent: true,
        opacity: 1,
        side: THREE.DoubleSide,
      }),
    );
    contentGroup.add(blanket);

    // Wireframe overlay for futuristic mesh look
    const wire = new THREE.Mesh(
      plane.clone(),
      new THREE.MeshBasicMaterial({
        color: '#fb7185',
        wireframe: true,
        transparent: true,
        opacity: 0.28,
      }),
    );
    contentGroup.add(wire);

    // Peak glow points (emissive-like highlights)
    if (glowVertices.length > 0) {
      const glowGeo = new THREE.BufferGeometry().setFromPoints(glowVertices);
      const glowMat = new THREE.PointsMaterial({
        color: '#fb7185',
        size: 0.42,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      contentGroup.add(new THREE.Points(glowGeo, glowMat));
    }

    // Patient markers
    const markerGroup = new THREE.Group();
    const pulseRings: THREE.Mesh[] = [];
    const markerMeshes: THREE.Mesh[] = [];
    const markerGeometry = new THREE.SphereGeometry(0.34, 14, 14);
    const pulseGeometry = new THREE.RingGeometry(0.35, 0.43, 32);

    points.forEach((p) => {
      const worldX = (p.week / X_MAX) * 40 - 20;
      const worldY = (p.daysSinceVisit / Y_MAX) * 30 - 15;
      // Marker should sit on terrain surface at this X/Y.
      const terrainDanger = surfaceDanger(worldX, worldY);
      const worldZ = (terrainDanger / 100) * 16 + 0.18;
      const marker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshStandardMaterial({
          color: CATEGORY_COLOR[p.category],
          emissive: p.category === 'emergency' ? new THREE.Color('#ef4444') : new THREE.Color('#000000'),
          emissiveIntensity: p.category === 'emergency' ? 0.62 : 0.22,
          roughness: 0.16,
          metalness: 0.34,
        }),
      );
      const sizeScale = clamp(p.size / 8.8, 1.08, 2.2);
      marker.scale.setScalar(sizeScale);
      marker.position.set(worldX, worldY, worldZ);
      marker.userData.point = p;
      markerGroup.add(marker);
      markerMeshes.push(marker);

      if (p.pulse) {
        const ring = new THREE.Mesh(
          pulseGeometry,
          new THREE.MeshBasicMaterial({
            color: CATEGORY_COLOR[p.category],
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        ring.position.copy(marker.position);
        ring.lookAt(ring.position.clone().add(new THREE.Vector3(0, 0, 1)));
        ring.userData.baseScale = 1;
        markerGroup.add(ring);
        pulseRings.push(ring);
      }
    });
    contentGroup.add(markerGroup);

    // Center and frame once, then keep stable.
    const fitCameraOnce = () => {
      const box = new THREE.Box3().setFromObject(contentGroup);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const center = sphere.center;
      const radius = Math.max(1, sphere.radius);

      // Viewport bias requested: move graph visually up + left.
      const framingTarget = center
        .clone()
        .add(new THREE.Vector3(radius * 0.6, 0, -radius * 0.38));

      controls.target.copy(framingTarget);
      camera.position.set(
        center.x + radius * 0.5,
        center.y - radius * 1.95,
        center.z + radius * 1.28,
      );
      camera.near = Math.max(0.1, radius / 120);
      camera.far = radius * 80;
      camera.lookAt(framingTarget);
      camera.updateProjectionMatrix();

      controls.minDistance = radius * 0.9;
      controls.maxDistance = radius * 6;
      controls.update();
    };

    // Raycasting for tooltip
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let currentHover: THREE.Mesh | null = null;

    const onPointerMove = (ev: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerMeshes, false);
      currentHover = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
      renderer.domElement.style.cursor = currentHover ? 'pointer' : 'default';
      if (!currentHover && tooltipRef.current) {
        tooltipRef.current = null;
        setTooltip(null);
      }
    };
    const onPointerDown = (ev: PointerEvent) => {
      if (!onSelectPatient) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markerMeshes, false);
      if (hits.length === 0) return;
      const selected = hits[0].object as THREE.Mesh;
      const point = selected.userData.point as GraphPoint;
      if (point?.patientId) {
        onSelectPatient(point.patientId);
      }
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    const clock = new THREE.Clock();
    let raf = 0;
    const renderLoop = () => {
      raf = requestAnimationFrame(renderLoop);
      const t = clock.getElapsedTime();
      controls.update();

      // Animate pulse rings in place.
      pulseRings.forEach((ring, idx) => {
        const phase = (t + idx * 0.22) % 1.6;
        const grow = 1 + phase * 2.9;
        const opacity = Math.max(0, 0.95 - phase * 0.58);
        ring.scale.setScalar(grow);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = opacity;
      });

      if (currentHover) {
        const p = currentHover.userData.point as GraphPoint;
        const world = currentHover.position.clone().project(camera);
        const sx = ((world.x + 1) / 2) * renderer.domElement.clientWidth;
        const sy = ((-world.y + 1) / 2) * renderer.domElement.clientHeight;
        const nextTooltip: TooltipData = {
          ...p,
          screenX: sx,
          screenY: sy,
        };

        const prev = tooltipRef.current;
        const shouldUpdate =
          !prev ||
          prev.patientId !== nextTooltip.patientId ||
          Math.abs(prev.screenX - nextTooltip.screenX) > 1.2 ||
          Math.abs(prev.screenY - nextTooltip.screenY) > 1.2;

        if (shouldUpdate) {
          tooltipRef.current = nextTooltip;
          setTooltip(nextTooltip);
        }
      }

      // Anchor HTML labels to axis line endpoints.
      const placeLabel = (
        ref: React.MutableRefObject<HTMLDivElement | null>,
        worldPos: THREE.Vector3,
      ) => {
        const el = ref.current;
        if (!el) return;
        const projected = worldPos.clone().project(camera);
        const sx = ((projected.x + 1) / 2) * renderer.domElement.clientWidth;
        const sy = ((-projected.y + 1) / 2) * renderer.domElement.clientHeight;
        el.style.left = `${sx}px`;
        el.style.top = `${sy}px`;
      };
      placeLabel(xAxisLabelRef, axisXEnd);
      placeLabel(yAxisLabelRef, axisYEnd);
      placeLabel(zAxisLabelRef, axisZEnd);

      renderer.render(scene, camera);
    };

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    fitCameraOnce();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    renderLoop();

    return () => {
      cancelAnimationFrame(raf);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.style.cursor = 'default';
      ro.disconnect();
      controls.dispose();
      scene.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m: THREE.Material) => m.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [points, dataSignature, onSelectPatient]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white text-slate-900 p-5 shadow-sm mt-2">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-slate-500">
            Futuristic Risk Surface
          </div>
          <div className="text-sm font-semibold text-slate-900">
            X Gestational Week · Y Days Since Visit · Z Danger Score
          </div>
        </div>
        <div className="text-right text-[0.68rem] text-slate-500">
          Drag orbit · Scroll zoom · Shift+drag pan · Click marker to open patient
        </div>
      </div>

      <div className="relative rounded-xl border border-slate-200 overflow-hidden bg-white">
        <div ref={containerRef} className="w-full h-[440px]" />

        {/* Axis labels pinned to actual axis endpoints */}
        <div
          ref={xAxisLabelRef}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-white/92 px-2 py-0.5 text-[11px] font-medium text-black border border-slate-200 whitespace-nowrap"
        >
          X: Gestational week (0-40)
        </div>
        <div
          ref={yAxisLabelRef}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-white/92 px-2 py-0.5 text-[11px] font-medium text-black border border-slate-200 whitespace-nowrap"
        >
          Y: Days since last in-person visit (0-30)
        </div>
        <div
          ref={zAxisLabelRef}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded bg-white/92 px-2 py-0.5 text-[11px] font-medium text-black border border-slate-200 whitespace-nowrap"
        >
          Z: Danger score (0-100)
        </div>

        {tooltip && (
          <div
            className="absolute pointer-events-none z-20 min-w-[220px] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-xl"
            style={{
              left: tooltip.screenX + 14,
              top: tooltip.screenY - 12,
            }}
          >
            <div className="font-semibold text-slate-900 mb-1">{tooltip.patientName}</div>
            <div>
              Tier {tooltip.tier} · {tooltip.status}
            </div>
            <div>Gestational week: {tooltip.week}</div>
            <div>Danger score: {tooltip.danger.toFixed(1)}</div>
            <div>Days since last visit: {tooltip.daysSinceVisit.toFixed(1)}</div>
            <div>Symptom count: {tooltip.symptomCount}</div>
            <div className="mt-1 text-[0.68rem] text-slate-500">
              Click marker to open patient detail
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[0.72rem] text-slate-700">
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
          emergency
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
          urgent
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          monitor
        </span>
        <span className="text-slate-500">marker size = travel difficulty proxy</span>
        <span className="text-slate-500">pulse ring = new incoming alert</span>
      </div>
    </div>
  );
}

