"use client";

import { useRef, useMemo, useLayoutEffect } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three-stdlib";
import { Group, Mesh, MeshStandardMaterial } from "three";

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
};

export default function Star({
  name,
  modelExt = "glb",
  scale = 1,
  position = [0, 0, 0],
  rotationSpeed = 0.05,
  emissiveIntensity = 1.5,
  lightIntensity = 3,
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

  useFrame((_, delta) => {
    if (groupRef.current && rotationSpeed) {
      groupRef.current.rotation.y += rotationSpeed * delta;
    }
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive object={object} />
      {/* The star emits light onto the orbiting planets */}
      <pointLight intensity={lightIntensity} decay={0} />
    </group>
  );
}