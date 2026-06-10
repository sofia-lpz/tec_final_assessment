"use client";
import { useRef, useMemo, useLayoutEffect } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three-stdlib";
import { Billboard } from "@react-three/drei";
import {
  AdditiveBlending,
  Box3,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Sphere,
} from "three";

type StarProps = {
  name: string;
  modelExt?: "glb" | "gltf"; // stars use embedded-texture formats
  scale?: number;
  position?: [number, number, number];
  rotationSpeed?: number;
  /** How brightly the star's surface glows. */
  emissiveIntensity?: number;
  /** Brightness of the light it casts on the planets. */
  lightIntensity?: number;
  /** Colour of the surrounding corona/glow. */
  glowColor?: string;
  /** How far the halo extends, as a multiple of the star's size. */
  glowSize?: number;
  /** Overall brightness of the glow. */
  glowIntensity?: number;
};

// ── Radial glow shader (camera-facing plane) ─────────────────
const glowVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const glowFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uFalloff;
  varying vec2 vUv;
  void main() {
    // distance from centre: 0 at middle, 1 at the plane edge
    float d = length(vUv - 0.5) * 2.0;
    float a = pow(clamp(1.0 - d, 0.0, 1.0), uFalloff);
    // additive blending multiplies rgb by alpha, so just output full colour
    gl_FragColor = vec4(uColor * uIntensity, a);
  }
`;

function GlowLayer({
  size,
  color,
  intensity,
  falloff,
}: {
  size: number;
  color: string;
  intensity: number;
  falloff: number;
}) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new Color(color) },
      uIntensity: { value: intensity },
      uFalloff: { value: falloff },
    }),
    [color, intensity, falloff]
  );

  return (
    <mesh>
      <planeGeometry args={[size, size]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={glowVertexShader}
        fragmentShader={glowFragmentShader}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        toneMapped={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

export default function Star({
  name,
  modelExt = "glb",
  scale = 1,
  position = [0, 0, 0],
  rotationSpeed = 0.05,
  emissiveIntensity = 1.5,
  lightIntensity = 3,
  glowColor = "#ffe24d",
  glowSize = 1,
  glowIntensity = 1,
}: StarProps) {
  const groupRef = useRef<Group>(null);
  const gltf = useLoader(GLTFLoader, `/models/${name}.${modelExt}`);
  const object = useMemo(() => gltf.scene.clone(true), [gltf]);

  // Make the star self-illuminating: its own texture becomes the emissive map,
  // so it glows regardless of scene lighting — it IS the light source.
  useLayoutEffect(() => {
    object.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const material = (mesh.material as MeshStandardMaterial).clone();
      material.emissiveMap = material.map;
      material.emissive.set("#ffffff");
      material.emissiveIntensity = emissiveIntensity;
      material.toneMapped = false; // keep it bright
      material.needsUpdate = true;
      mesh.material = material;
    });
  }, [object, emissiveIntensity]);

  // Star radius (local units) — used to size the glow relative to the model.
  const radius = useMemo(() => {
    object.updateMatrixWorld(true);
    const sphere = new Box3().setFromObject(object).getBoundingSphere(new Sphere());
    return sphere.radius || 1;
  }, [object]);

  useFrame((_, delta) => {
    if (groupRef.current && rotationSpeed) {
      groupRef.current.rotation.y += rotationSpeed * delta;
    }
  });

  const diameter = radius * 2;

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive object={object} />

      {/* Corona — always faces the camera. Inner bright ring + wide soft halo. */}
      <Billboard>
        <GlowLayer
          size={diameter * 1.6 * glowSize}
          color={glowColor}
          intensity={0.9 * glowIntensity}
          falloff={3.0}
        />
        <GlowLayer
          size={diameter * 2.8 * glowSize}
          color={glowColor}
          intensity={0.45 * glowIntensity}
          falloff={3.5}
        />
      </Billboard>

      {/* The star emits light onto the orbiting planets */}
      <pointLight intensity={lightIntensity} decay={0} />
    </group>
  );
}