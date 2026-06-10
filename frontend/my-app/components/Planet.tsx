"use client";

import { useRef, useMemo, useLayoutEffect } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader, OBJLoader, FBXLoader } from "three-stdlib";
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from "three";

export type PlanetState = "idle" | "active" | "destroyed";

// Extension → loader. Add STL, PLY, etc. here as you need them.
const LOADERS = {
  glb: GLTFLoader,
  gltf: GLTFLoader,
  obj: OBJLoader,
  fbx: FBXLoader,
} as const;

type ModelExt = keyof typeof LOADERS;

// Formats that already carry their own textures — skip the external texture.
const EMBEDDED_TEXTURE_FORMATS = new Set<ModelExt>(["glb", "gltf"]);

type PlanetProps = {
  /** Base filename shared by model + texture, e.g. "earth"
   *  → /models/earth.<modelExt> and /textures/earth.<textureExt> */
  name: string;
  modelExt?: ModelExt; // default "glb"
  textureExt?: string; // default "png" (only used for non-embedded formats)
  scale?: number;
  position?: [number, number, number];
  rotationSpeed?: number; // radians/sec; 0 disables
  state?: PlanetState;
};

function stateEffect(state: PlanetState) {
  switch (state) {
    case "active":
      return { color: "#3b82f6", intensity: 0.6 };
    case "destroyed":
      return { color: "#7f1d1d", intensity: 0.3 };
    default:
      return { color: "#000000", intensity: 0 };
  }
}

// Applies state effects to every mesh, optionally swapping in an external texture.
function applyEffects(object: Object3D, state: PlanetState, texture?: Texture) {
  const { color, intensity } = stateEffect(state);
  if (texture) texture.colorSpace = SRGBColorSpace;

  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const material = (mesh.material as MeshStandardMaterial).clone();
    if (texture) material.map = texture;
    material.emissive.set(color);
    material.emissiveIntensity = intensity;
    material.needsUpdate = true;
    mesh.material = material;
  });
}

// glb/gltf: texture is embedded, only state effects are applied.
function EmbeddedModel({ object, state }: { object: Object3D; state: PlanetState }) {
  useLayoutEffect(() => {
    applyEffects(object, state);
  }, [object, state]);
  return <primitive object={object} />;
}

// obj/fbx/…: load the matching texture from /textures and apply it.
function TexturedModel({
  object,
  textureUrl,
  state,
}: {
  object: Object3D;
  textureUrl: string;
  state: PlanetState;
}) {
  const texture = useLoader(TextureLoader, textureUrl);
  useLayoutEffect(() => {
    applyEffects(object, state, texture);
  }, [object, texture, state]);
  return <primitive object={object} />;
}

export default function Planet({
  name,
  modelExt = "glb",
  textureExt = "png",
  scale = 1,
  position = [0, 0, 0],
  rotationSpeed = 0.2,
  state = "idle",
}: PlanetProps) {
  const groupRef = useRef<Group>(null);

  const Loader = LOADERS[modelExt];
  // Dynamic loader makes the return type a union; normalize at runtime below.
  const loaded = useLoader(Loader, `/models/${name}.${modelExt}`) as unknown as {
    scene?: Object3D;
  } & Object3D;

  // GLTFLoader returns { scene }; OBJ/FBX return the Object3D directly.
  // Clone so multiple planets sharing one model don't mutate the cached original.
  const object = useMemo(() => (loaded.scene ?? loaded).clone(true), [loaded]);

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
          state={state}
        />
      ) : (
        <EmbeddedModel object={object} state={state} />
      )}
    </group>
  );
}