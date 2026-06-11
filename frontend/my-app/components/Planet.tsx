"use client";

import { useRef, useMemo, useLayoutEffect } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader, OBJLoader, FBXLoader } from "three-stdlib";
import {
  AdditiveBlending,
  BackSide,
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  Sphere,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";

export type PlanetState = "none" | "transmitting" | "birthplus" | "scienceplus";

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
  modelExt?: ModelExt; // default "glb"
  textureExt?: string; // default "png"
  scale?: number;
  position?: [number, number, number];
  rotationSpeed?: number;
  state?: PlanetState;
  glowColor?: string; // transmitting glow + light colour
  glowSize?: number; // halo size relative to the planet (1 = same size)
  heartColor?: string; // birthplus heart colour
  heartCount?: number; // birthplus number of hearts
  beakerColor?: string; // scienceplus glass colour
  beakerCount?: number; // scienceplus number of beakers
  beakerLiquidColor?: string; // scienceplus liquid (inside) colour
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
    // Hard discard everything outside the ring band — no full-sphere fill
    if (band > thickness) discard;
    float alpha = smoothstep(thickness, 0.0, band) * opacity;
    if (alpha < 0.001) discard;
    float core = smoothstep(thickness, 0.0, band * 0.4);
    gl_FragColor = vec4(ringColor + core * 0.6, alpha);
  }
`;

const RING_COUNT = 4;
const RING_SPEED = 0.55; // full sweep in ~1.8s

function Transmitting({
  center,
  radius,
  color,
  size,
}: {
  center: [number, number, number];
  radius: number;
  color: string;
  size: number;
}) {
  const lightRef = useRef<any>(null);
  const materialRefs = useRef<any[]>([]);

  // Stable uniform objects — created once, mutated every frame
  const uniforms = useRef(
    Array.from({ length: RING_COUNT }, (_, i) => ({
      ringColor:  { value: new Color(color) },
      progress:   { value: i / RING_COUNT },
      thickness:  { value: 0.18 },
      opacity:    { value: 1.0 },
    }))
  ).current;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < RING_COUNT; i++) {
      const phase = (t * RING_SPEED + i / RING_COUNT) % 1;
      // Write directly to the material's own uniforms
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
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
            side={BackSide}
          />
        </mesh>
      ))}
      <pointLight
        ref={lightRef}
        color={color}
        intensity={3}
        distance={radius * 12}
        decay={2}
      />
    </group>
  );
}


// ── Shared geometries, built once ────────────────────────────
const HEART_GEOMETRY = (() => {
  const s = new Shape();
  s.moveTo(25, 25);
  s.bezierCurveTo(25, 25, 20, 0, 0, 0);
  s.bezierCurveTo(-30, 0, -30, 35, -30, 35);
  s.bezierCurveTo(-30, 55, -10, 77, 25, 95);
  s.bezierCurveTo(60, 77, 80, 55, 80, 35);
  s.bezierCurveTo(80, 35, 80, 0, 50, 0);
  s.bezierCurveTo(35, 0, 25, 25, 25, 25);
  const geo = new ExtrudeGeometry(s, {
    depth: 8,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelThickness: 4,
    bevelSize: 4,
  });
  geo.center();
  geo.rotateZ(Math.PI); // shape is authored upside-down; flip it tip-down
  geo.scale(0.012, 0.012, 0.012); // normalise to ~1 unit
  return geo;
})();

// Erlenmeyer-style flask: glass shell + a liquid volume that fills the lower
// cone. Both are revolved around Y from a (radius, height) profile and share
// the SAME centring/scale so the liquid nests perfectly inside the glass.
const BEAKER = (() => {
  // Outer glass wall profile (bottom centre → base → cone → neck → lip).
  const glassProfile = [
    new Vector2(0.0, 0.0),
    new Vector2(0.55, 0.0),
    new Vector2(0.55, 0.06),
    new Vector2(0.12, 0.85),
    new Vector2(0.12, 1.05),
    new Vector2(0.18, 1.12),
  ];
  // Liquid sits just inside the glass and fills up to ~y=0.5, with a flat
  // surface (radius → 0 at the top closes the cap).
  const liquidProfile = [
    new Vector2(0.0, 0.0),
    new Vector2(0.50, 0.0),
    new Vector2(0.50, 0.06),
    new Vector2(0.30, 0.50),
    new Vector2(0.0, 0.50),
  ];

  const glass = new LatheGeometry(glassProfile, 24);
  const liquid = new LatheGeometry(liquidProfile, 24);

  // Centre BOTH by the glass's bounding box so they stay aligned (a lathe is
  // symmetric around Y, so only the Y offset matters).
  glass.computeBoundingBox();
  const c = new Vector3();
  glass.boundingBox!.getCenter(c);

  glass.translate(-c.x, -c.y, -c.z);
  liquid.translate(-c.x, -c.y, -c.z);

  const s = 1.3; // normalise to ~1 unit
  glass.scale(s, s, s);
  liquid.scale(s, s, s);

  return { glass, liquid };
})();

// ── Generic swarm: spawns `count` items around the planet ────
function Swarm({
  center,
  radius,
  color,
  count,
  geometry,
  glass = false,
  liquidGeometry,
  liquidColor,
}: {
  center: [number, number, number];
  radius: number;
  color: string;
  count: number;
  geometry: BufferGeometry;
  glass?: boolean; // render outer mesh as translucent glass
  liquidGeometry?: BufferGeometry; // optional inner volume (e.g. liquid)
  liquidColor?: string;
}) {
  const groupRef = useRef<Group>(null);
  const refs = useRef<(Group | null)[]>([]);

  // Spread items around a sphere with a golden-angle spiral (even coverage).
  const items = useMemo(() => {
    const r = radius * 1.6;
    return Array.from({ length: count }, (_, i) => {
      const phi = Math.acos(1 - 2 * ((i + 0.5) / count));
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      const len = Math.hypot(x, y, z) || 1;
      return {
        base: [x, y, z] as [number, number, number],
        dir: [x / len, y / len, z / len] as [number, number, number],
        phase: Math.random() * Math.PI * 2,
        spin: 0.5 + Math.random(),
        size: radius * (0.25 + Math.random() * 0.15),
      };
    });
  }, [count, radius]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < items.length; i++) {
      const g = refs.current[i];
      const it = items[i];
      if (!g || !it) continue;
      const bob = Math.sin(t * 1.5 + it.phase) * radius * 0.15;
      g.position.set(
        it.base[0] + it.dir[0] * bob,
        it.base[1] + it.dir[1] * bob,
        it.base[2] + it.dir[2] * bob
      );
      g.rotation.y = t * it.spin;
    }
    if (groupRef.current) groupRef.current.rotation.y = t * 0.2;
  });

  return (
    <group ref={groupRef} position={center}>
      {items.map((it, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          position={it.base}
          scale={it.size}
        >
          <mesh geometry={geometry}>
            {glass ? (
              <meshStandardMaterial
                color={color}
                transparent
                opacity={0.4}
                roughness={0.05}
                metalness={0}
                side={DoubleSide}
              />
            ) : (
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.6}
                roughness={0.4}
                side={DoubleSide}
              />
            )}
          </mesh>

          {liquidGeometry && (
            <mesh geometry={liquidGeometry}>
              <meshStandardMaterial
                color={liquidColor ?? color}
                emissive={liquidColor ?? color}
                emissiveIntensity={0.75}
                roughness={0.3}
              />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function TexturedModel({
  object,
  textureUrl,
}: {
  object: Object3D;
  textureUrl: string;
}) {
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

export default function Planet({
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
}: PlanetProps) {
  const groupRef = useRef<Group>(null);

  const Loader = LOADERS[modelExt];
  const loaded = useLoader(Loader, `/models/${name}.${modelExt}`) as unknown as {
    scene?: Object3D;
  } & Object3D;

  const object = useMemo(() => (loaded.scene ?? loaded).clone(true), [loaded]);

  const bounds = useMemo(() => {
    object.updateMatrixWorld(true);
    const sphere = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
    return {
      center: sphere.center.toArray() as [number, number, number],
      radius: sphere.radius || 1,
    };
  }, [object]);

  useFrame((_, delta) => {
    if (groupRef.current && rotationSpeed) {
      groupRef.current.rotation.y += rotationSpeed * delta;
    }
  });

  const needsExternalTexture = !EMBEDDED_TEXTURE_FORMATS.has(modelExt);

  return (
    <group ref={groupRef} position={position} scale={scale}>
      {needsExternalTexture ? (
        <TexturedModel
          object={object}
          textureUrl={`/textures/${name}.${textureExt}`}
        />
      ) : (
        <primitive object={object} />
      )}

      {state === "transmitting" && (
        <Transmitting
          center={bounds.center}
          radius={bounds.radius}
          color={glowColor}
          size={glowSize}
        />
      )}

      {state === "birthplus" && (
        <Swarm
          center={bounds.center}
          radius={bounds.radius}
          color={heartColor}
          count={heartCount}
          geometry={HEART_GEOMETRY}
        />
      )}

      {state === "scienceplus" && (
        <Swarm
          center={bounds.center}
          radius={bounds.radius}
          color={beakerColor}
          count={beakerCount}
          geometry={BEAKER.glass}
          glass
          liquidGeometry={BEAKER.liquid}
          liquidColor={beakerLiquidColor}
        />
      )}
    </group>
  );
}