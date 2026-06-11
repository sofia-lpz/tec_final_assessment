"use client";

import { useRef, useMemo, useLayoutEffect, RefObject, forwardRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader, OBJLoader, FBXLoader } from "three-stdlib";
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  Sphere,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";

export type PlanetState = "none" | "transmitting" | "birthplus" | "scienceplus" | "destroy";

const LOADERS = {
  glb: GLTFLoader,
  gltf: GLTFLoader,
  obj: OBJLoader,
  fbx: FBXLoader,
} as const;

type ModelExt = keyof typeof LOADERS;
const EMBEDDED_TEXTURE_FORMATS = new Set<ModelExt>(["glb", "gltf"]);

type PlanetProps = {
  name: string;
  modelExt?: ModelExt;
  textureExt?: string;
  scale?: number;
  position?: [number, number, number];
  rotationSpeed?: number;
  state?: PlanetState;
  glowColor?: string;
  glowSize?: number;
  heartColor?: string;
  heartCount?: number;
  beakerColor?: string;
  beakerCount?: number;
  beakerLiquidColor?: string;
  // destroy state props
  targetPosition?: [number, number, number]; // world-space position of target planet
  targetRef?: RefObject<Group | null>;       // ref to the target planet's root Group
  onDestroyed?: () => void;
  ready?: boolean; // gate: won't fire until true
};

// ── Glow halo + coloured light ───────────────────────────────
const glowVertexShader = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = /* glsl */ `
  uniform vec3 glowColor;
  uniform float coefficient;
  uniform float power;
  varying vec3 vNormal;
  void main() {
    float intensity = pow(coefficient - dot(vNormal, vec3(0.0, 0.0, 1.0)), power);
    intensity = clamp(intensity, 0.0, 1.0);
    gl_FragColor = vec4(glowColor, intensity);
  }
`;

// ── Transmitting pulse rings ─────────────────────────────────
const pulseVertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const pulseFragmentShader = /* glsl */ `
  uniform vec3 ringColor;
  uniform float progress;
  uniform float thickness;
  uniform float opacity;
  varying vec3 vNormal;
  void main() {
    float lat = abs(vNormal.y);
    float band = abs(lat - progress);
    if (band > thickness) discard;
    float alpha = smoothstep(thickness, 0.0, band) * opacity;
    if (alpha < 0.001) discard;
    float core = smoothstep(thickness, 0.0, band * 0.4);
    gl_FragColor = vec4(ringColor + core * 0.6, alpha);
  }
`;

const RING_COUNT = 4;
const RING_SPEED = 0.55;

function Transmitting({
  center, radius, color, size,
}: {
  center: [number, number, number]; radius: number; color: string; size: number;
}) {
  const lightRef = useRef<any>(null);
  const materialRefs = useRef<any[]>([]);
  const uniforms = useRef(
    Array.from({ length: RING_COUNT }, (_, i) => ({
      ringColor: { value: new Color(color) },
      progress:  { value: i / RING_COUNT },
      thickness: { value: 0.18 },
      opacity:   { value: 1.0 },
    }))
  ).current;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < RING_COUNT; i++) {
      const phase = (t * RING_SPEED + i / RING_COUNT) % 1;
      const mat = materialRefs.current[i];
      if (mat) {
        mat.uniforms.progress.value = phase;
        mat.uniforms.opacity.value  = Math.pow(1.0 - phase, 2.0) * 1.8;
      }
    }
    if (lightRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(t * RING_SPEED * Math.PI * 2 * RING_COUNT);
      lightRef.current.intensity = 2.0 + pulse * 4.0;
    }
  });

  const sphereRadius = radius * size * 1.02;
  return (
    <group position={center}>
      {uniforms.map((u, i) => (
        <mesh key={i}>
          <sphereGeometry args={[sphereRadius, 48, 48]} />
          <shaderMaterial
            ref={(el) => { materialRefs.current[i] = el; }}
            uniforms={u}
            vertexShader={pulseVertexShader}
            fragmentShader={pulseFragmentShader}
            transparent depthWrite={false}
            blending={AdditiveBlending} side={BackSide}
          />
        </mesh>
      ))}
      <pointLight ref={lightRef} color={color} intensity={3} distance={radius * 12} decay={2} />
    </group>
  );
}

// ── Shared geometries ────────────────────────────────────────
const HEART_GEOMETRY = (() => {
  const s = new Shape();
  s.moveTo(25, 25);
  s.bezierCurveTo(25, 25, 20, 0, 0, 0);
  s.bezierCurveTo(-30, 0, -30, 35, -30, 35);
  s.bezierCurveTo(-30, 55, -10, 77, 25, 95);
  s.bezierCurveTo(60, 77, 80, 55, 80, 35);
  s.bezierCurveTo(80, 35, 80, 0, 50, 0);
  s.bezierCurveTo(35, 0, 25, 25, 25, 25);
  const geo = new ExtrudeGeometry(s, { depth: 8, bevelEnabled: true, bevelSegments: 2, bevelThickness: 4, bevelSize: 4 });
  geo.center();
  geo.rotateZ(Math.PI);
  geo.scale(0.012, 0.012, 0.012);
  return geo;
})();

const BEAKER = (() => {
  const glassProfile = [
    new Vector2(0.0, 0.0), new Vector2(0.55, 0.0), new Vector2(0.55, 0.06),
    new Vector2(0.12, 0.85), new Vector2(0.12, 1.05), new Vector2(0.18, 1.12),
  ];
  const liquidProfile = [
    new Vector2(0.0, 0.0), new Vector2(0.50, 0.0), new Vector2(0.50, 0.06),
    new Vector2(0.30, 0.50), new Vector2(0.0, 0.50),
  ];
  const glass = new LatheGeometry(glassProfile, 24);
  const liquid = new LatheGeometry(liquidProfile, 24);
  glass.computeBoundingBox();
  const c = new Vector3();
  glass.boundingBox!.getCenter(c);
  glass.translate(-c.x, -c.y, -c.z);
  liquid.translate(-c.x, -c.y, -c.z);
  const s = 1.3;
  glass.scale(s, s, s); liquid.scale(s, s, s);
  return { glass, liquid };
})();

function Swarm({
  center, radius, color, count, geometry, glass = false, liquidGeometry, liquidColor,
}: {
  center: [number, number, number]; radius: number; color: string; count: number;
  geometry: BufferGeometry; glass?: boolean; liquidGeometry?: BufferGeometry; liquidColor?: string;
}) {
  const groupRef = useRef<Group>(null);
  const refs = useRef<(Group | null)[]>([]);
  const items = useMemo(() => {
    const r = radius * 1.6;
    return Array.from({ length: count }, (_, i) => {
      const phi = Math.acos(1 - 2 * ((i + 0.5) / count));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      const len = Math.hypot(x, y, z) || 1;
      return { base: [x, y, z] as [number, number, number], dir: [x/len, y/len, z/len] as [number, number, number], phase: Math.random() * Math.PI * 2, spin: 0.5 + Math.random(), size: radius * (0.25 + Math.random() * 0.15) };
    });
  }, [count, radius]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < items.length; i++) {
      const g = refs.current[i]; const it = items[i];
      if (!g || !it) continue;
      const bob = Math.sin(t * 1.5 + it.phase) * radius * 0.15;
      g.position.set(it.base[0] + it.dir[0] * bob, it.base[1] + it.dir[1] * bob, it.base[2] + it.dir[2] * bob);
      g.rotation.y = t * it.spin;
    }
    if (groupRef.current) groupRef.current.rotation.y = t * 0.2;
  });

  return (
    <group ref={groupRef} position={center}>
      {items.map((it, i) => (
        <group key={i} ref={(el) => { refs.current[i] = el; }} position={it.base} scale={it.size}>
          <mesh geometry={geometry}>
            {glass ? (
              <meshStandardMaterial color={color} transparent opacity={0.4} roughness={0.05} metalness={0} side={DoubleSide} />
            ) : (
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} roughness={0.4} side={DoubleSide} />
            )}
          </mesh>
          {liquidGeometry && (
            <mesh geometry={liquidGeometry}>
              <meshStandardMaterial color={liquidColor ?? color} emissive={liquidColor ?? color} emissiveIntensity={0.75} roughness={0.3} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

// ── Laser beam shader ────────────────────────────────────────
// Uses a CylinderGeometry so UVs run cleanly along the beam axis (v=0→1).
const laserVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const laserFragmentShader = /* glsl */ `
  uniform float progress;
  uniform float opacity;
  varying vec2 vUv;
  void main() {
    // vUv.y runs 0→1 along the cylinder axis (bottom to top after rotation)
    float along = vUv.y;
    if (along > progress) discard;

    // Radial glow: vUv.x wraps 0→1 around the cylinder circumference.
    // Centre of beam = 0.25 and 0.75 on a cylinder unwrap, so use sin.
    float radial = abs(sin(vUv.x * 3.14159));
    float core = pow(radial, 2.0);
    float glow = pow(radial, 0.5) * 0.4;

    // Fade the tail as it leaves and a hard front edge at progress
    float frontFade = smoothstep(progress, progress - 0.15, along);
    float alpha = (core + glow) * frontFade * opacity;
    if (alpha < 0.005) discard;

    // White-hot center fading to bright saturated red on the edges
    vec3 hot  = vec3(1.0, 0.95, 0.7);
    vec3 cool = vec3(1.0, 0.1, 0.05);
    vec3 col  = mix(cool, hot, core) * 1.4; // overdrive for bloom
    gl_FragColor = vec4(col, alpha);
  }
`;

// Timing (seconds) — destruction is exactly 1.0s after DELAY
const DELAY        = 2.0;  // wait after ready before firing (do not change)
const LASER_TRAVEL = 0.20; // beam sweeps shooter → target
const IMPACT_HOLD  = 0.20; // flash at target
const FADE_OUT     = 0.60; // planet implodes + fades
const TOTAL        = DELAY + LASER_TRAVEL + IMPACT_HOLD + FADE_OUT;

function DestroyEffect({
  shooterPosition,  // world-space position of the shooting planet
  targetPosition,   // world-space position of the target planet
  planetRadius,
  targetRef,        // ref to the TARGET planet's root <group>
  onDestroyed,
}: {
  shooterPosition: [number, number, number];
  targetPosition: [number, number, number];
  planetRadius: number;
  targetRef?: RefObject<Group | null>;
  onDestroyed?: () => void;
}) {
  const startTime = useRef<number | null>(null);
  const doneRef   = useRef(false);
  const impactMatRef  = useRef<MeshStandardMaterial | null>(null);
  const impactLightRef = useRef<any>(null);
  const materialsCloned = useRef(false);
  const originalScale = useRef<Vector3 | null>(null);

  // Build beam geometry once: a thin cylinder from shooter → target.
  // We work in world space here since DestroyEffect lives outside the
  // shooter's rotating group (it's placed at world origin via the Canvas).
  const { beamLength, beamMidpoint, beamQuaternion } = useMemo(() => {
    const from = new Vector3(...shooterPosition);
    const to   = new Vector3(...targetPosition);
    const dir  = new Vector3().subVectors(to, from);
    const len  = dir.length();
    const mid  = from.clone().addScaledVector(dir.normalize(), len / 2);

    // CylinderGeometry's axis is Y. Rotate Y → direction vector.
    const yAxis = new Vector3(0, 1, 0);
    const q = new Quaternion().setFromUnitVectors(yAxis, dir);

    return { beamLength: len, beamMidpoint: mid.toArray() as [number, number, number], beamQuaternion: q };
  }, [shooterPosition, targetPosition]);

  const laserUniforms = useRef({
    progress: { value: 0.0 },
    opacity:  { value: 1.0 },
  }).current;

  useFrame(({ clock }) => {
    if (doneRef.current) return;
    if (startTime.current === null) startTime.current = clock.elapsedTime;
    const elapsed = clock.elapsedTime - startTime.current;

    // ── Wait for delay ───────────────────────────────────────
    if (elapsed < DELAY) {
      laserUniforms.progress.value = 0;
      laserUniforms.opacity.value  = 0;
      return;
    }
    const t = elapsed - DELAY;

    // ── Phase 1: laser sweeps from shooter to target ─────────
    const laserT = Math.min(t / LASER_TRAVEL, 1);
    laserUniforms.progress.value = laserT;
    // Hold the beam at full strength for the entire sequence,
    // then fade only in the last 0.15s so it stays obvious.
    const total = LASER_TRAVEL + IMPACT_HOLD + FADE_OUT;
    const tailFade = 0.15;
    laserUniforms.opacity.value = t < total - tailFade
      ? 1.0
      : Math.max(0, 1 - (t - (total - tailFade)) / tailFade);

    // ── Phase 2: impact flash ────────────────────────────────
    if (impactMatRef.current) {
      const impactT = Math.max(0, t - LASER_TRAVEL);
      const totalFlash = IMPACT_HOLD + FADE_OUT * 0.5;
      let alpha: number;
      if (impactT < IMPACT_HOLD * 0.35) {
        alpha = impactT / (IMPACT_HOLD * 0.35);       // sharp ramp up
      } else {
        alpha = Math.max(0, 1 - (impactT - IMPACT_HOLD * 0.35) / (totalFlash - IMPACT_HOLD * 0.35));
      }
      impactMatRef.current.opacity = alpha;
      if (impactLightRef.current) {
        impactLightRef.current.intensity = alpha * 25;
      }
    }

    // ── Phase 3: target planet implodes + fades ─────────────
    const fadeStart = LASER_TRAVEL + IMPACT_HOLD * 0.4;
    if (t > fadeStart && targetRef?.current) {
      // Clone materials once so we never corrupt the shared GLB asset
      if (!materialsCloned.current) {
        materialsCloned.current = true;
        originalScale.current = targetRef.current.scale.clone();
        targetRef.current.traverse((child) => {
          const mesh = child as Mesh;
          if (!mesh.isMesh) return;
          const mat = mesh.material as MeshStandardMaterial;
          if (!mat) return;
          const cloned = mat.clone();
          cloned.transparent = true;
          cloned.depthWrite = false;
          mesh.material = cloned;
        });
      }

      const fadeK = Math.min((t - fadeStart) / FADE_OUT, 1);
      const fadeAlpha = 1 - fadeK;

      // Implode: shrink from original scale to 0 with slight wobble
      if (originalScale.current) {
        const wobble = 1 + Math.sin(t * 60) * 0.04 * (1 - fadeK);
        const s = Math.max(0, 1 - fadeK) * wobble;
        targetRef.current.scale.set(
          originalScale.current.x * s,
          originalScale.current.y * s,
          originalScale.current.z * s,
        );
      }

      targetRef.current.traverse((child) => {
        const mesh = child as Mesh;
        if (!mesh.isMesh) return;
        const m = mesh.material as MeshStandardMaterial;
        m.opacity = fadeAlpha;
        if (m.emissive) {
          m.emissive.setRGB(1, 0.1, 0.05);
          m.emissiveIntensity = fadeK * 3.0;
        }
      });

      if (fadeAlpha <= 0 && !doneRef.current) {
        doneRef.current = true;
        if (targetRef.current) targetRef.current.visible = false;
        onDestroyed?.();
      }
    }
  });

  const beamRadius = Math.max(planetRadius * 0.18, 0.7);

  return (
    // This group sits at world origin — positions are absolute world coords
    <group>
      {/* Laser beam: cylinder with Y-axis along the beam direction */}
      <mesh position={beamMidpoint} quaternion={beamQuaternion}>
        {/* radialSegments=8 keeps it cheap; heightSegments=64 for smooth UV progress */}
        <cylinderGeometry args={[beamRadius, beamRadius, beamLength, 8, 64, true]} />
        <shaderMaterial
          uniforms={laserUniforms}
          vertexShader={laserVertexShader}
          fragmentShader={laserFragmentShader}
          transparent depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>

      {/* Thin bright core */}
      <mesh position={beamMidpoint} quaternion={beamQuaternion}>
        <cylinderGeometry args={[beamRadius * 0.3, beamRadius * 0.3, beamLength, 6, 64, true]} />
        <shaderMaterial
          uniforms={laserUniforms}
          vertexShader={laserVertexShader}
          fragmentShader={laserFragmentShader}
          transparent depthWrite={false}
          blending={AdditiveBlending}
          side={DoubleSide}
        />
      </mesh>

      {/* Impact glow sphere at target */}
      <mesh position={targetPosition}>
        <sphereGeometry args={[planetRadius * 2.8, 32, 32]} />
        <meshStandardMaterial
          ref={impactMatRef}
          color="#ff2200"
          emissive="#ff1100"
          emissiveIntensity={6}
          transparent
          opacity={0}
          depthWrite={false}
          blending={AdditiveBlending}
          side={BackSide}
        />
      </mesh>

      {/* Point light burst at impact */}
      <pointLight
        ref={impactLightRef}
        position={targetPosition}
        color="#ff3300"
        intensity={0}
        distance={planetRadius * 25}
        decay={2}
      />
    </group>
  );
}

function TexturedModel({ object, textureUrl }: { object: Object3D; textureUrl: string }) {
  const texture = useLoader(TextureLoader, textureUrl);
  useLayoutEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    object.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as MeshStandardMaterial).clone();
      material.map = texture;
      material.needsUpdate = true;
      mesh.material = material;
    });
  }, [object, texture]);
  return <primitive object={object} />;
}

// Planet is a forwardRef so callers can pass the root Group ref to a
// destroy-state sibling as `targetRef`.
const Planet = forwardRef<Group, PlanetProps>(function Planet({
  name,
  modelExt = "glb",
  textureExt = "png",
  scale = 1,
  position = [0, 0, 0],
  rotationSpeed = 0.2,
  state = "none",
  glowColor = "#05f250",
  glowSize = 1.15,
  heartColor = "#ff3b6b",
  heartCount = 5,
  beakerColor = "#c3d6c9",
  beakerCount = 5,
  beakerLiquidColor = "#39e0c8",
  targetPosition,
  targetRef,
  onDestroyed,
  ready = true,
}, ref) {
  const groupRef = useRef<Group>(null);

  const Loader = LOADERS[modelExt];
  const loaded = useLoader(Loader, `/models/${name}.${modelExt}`) as unknown as {
    scene?: Object3D;
  } & Object3D;

  const object = useMemo(() => (loaded.scene ?? loaded).clone(true), [loaded]);

  const bounds = useMemo(() => {
    object.updateMatrixWorld(true);
    const sphere = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
    return { center: sphere.center.toArray() as [number, number, number], radius: sphere.radius || 1 };
  }, [object]);

  useFrame((_, delta) => {
    if (groupRef.current && rotationSpeed) {
      groupRef.current.rotation.y += rotationSpeed * delta;
    }
  });

  const needsExternalTexture = !EMBEDDED_TEXTURE_FORMATS.has(modelExt);

  return (
    // ref forwarded to the outer group so callers can use it as targetRef
    <group ref={ref}>
      <group ref={groupRef} position={position} scale={scale}>
        {needsExternalTexture ? (
          <TexturedModel object={object} textureUrl={`/textures/${name}.${textureExt}`} />
        ) : (
          <primitive object={object} />
        )}

        {state === "transmitting" && (
          <Transmitting center={bounds.center} radius={bounds.radius} color={glowColor} size={glowSize} />
        )}
        {state === "birthplus" && (
          <Swarm center={bounds.center} radius={bounds.radius} color={heartColor} count={heartCount} geometry={HEART_GEOMETRY} />
        )}
        {state === "scienceplus" && (
          <Swarm center={bounds.center} radius={bounds.radius} color={beakerColor} count={beakerCount} geometry={BEAKER.glass} glass liquidGeometry={BEAKER.liquid} liquidColor={beakerLiquidColor} />
        )}
      </group>

      {/* DestroyEffect lives OUTSIDE the rotating group so the beam doesn't
          rotate with the planet. It uses absolute world-space coordinates. */}
      {state === "destroy" && targetPosition && ready && (
        <DestroyEffect
          shooterPosition={position}
          targetPosition={targetPosition}
          planetRadius={bounds.radius * scale}
          targetRef={targetRef}
          onDestroyed={onDestroyed}
        />
      )}
    </group>
  );
});

export default Planet;