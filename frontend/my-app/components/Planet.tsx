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
  beakerColor?: string; // scienceplus beaker colour
  beakerCount?: number; // scienceplus number of beakers
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

function Glow({
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
  const uniforms = useMemo(
    () => ({
      glowColor: { value: new Color(color) },
      coefficient: { value: 0.65 },
      power: { value: 3.5 },
    }),
    [color]
  );

  return (
    <group position={center}>
      <mesh scale={size}>
        <sphereGeometry args={[radius, 48, 48]} />
        <shaderMaterial
          uniforms={uniforms}
          vertexShader={glowVertexShader}
          fragmentShader={glowFragmentShader}
          transparent
          blending={AdditiveBlending}
          side={BackSide}
          depthWrite={false}
        />
      </mesh>
      <pointLight color={color} intensity={3} distance={radius * 10} decay={2} />
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

// Erlenmeyer-style flask: a profile (radius, height) revolved around Y.
const BEAKER_GEOMETRY = (() => {
  const profile = [
    new Vector2(0.0, 0.0), // bottom centre (closes the base)
    new Vector2(0.55, 0.0), // base edge
    new Vector2(0.55, 0.06), // base wall
    new Vector2(0.12, 0.85), // cone narrows up to the neck
    new Vector2(0.12, 1.05), // straight neck
    new Vector2(0.18, 1.12), // flared lip
  ];
  const geo = new LatheGeometry(profile, 24);
  geo.center();
  geo.scale(1.3, 1.3, 1.3); // normalise to ~1 unit
  return geo;
})();

// ── Generic swarm: spawns `count` items around the planet ────
function Swarm({
  center,
  radius,
  color,
  count,
  geometry,
}: {
  center: [number, number, number];
  radius: number;
  color: string;
  count: number;
  geometry: BufferGeometry;
}) {
  const groupRef = useRef<Group>(null);
  const refs = useRef<(Mesh | null)[]>([]);

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
      const m = refs.current[i];
      const it = items[i];
      if (!m || !it) continue;
      const bob = Math.sin(t * 1.5 + it.phase) * radius * 0.15;
      m.position.set(
        it.base[0] + it.dir[0] * bob,
        it.base[1] + it.dir[1] * bob,
        it.base[2] + it.dir[2] * bob
      );
      m.rotation.y = t * it.spin;
    }
    if (groupRef.current) groupRef.current.rotation.y = t * 0.2;
  });

  return (
    <group ref={groupRef} position={center}>
      {items.map((it, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          geometry={geometry}
          position={it.base}
          scale={it.size}
        >
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.6}
            roughness={0.4}
            side={DoubleSide}
          />
        </mesh>
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
  glowColor = "#22ff66",
  glowSize = 1.15,
  heartColor = "#ff3b6b",
  heartCount = 5,
  beakerColor = "#c3d6c9",
  beakerCount = 5,
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
        <Glow
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
          geometry={BEAKER_GEOMETRY}
        />
      )}
    </group>
  );
}