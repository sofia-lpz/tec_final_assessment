"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import Planet from "@/components/Planet";

export default function SolarSystem() {
  return (
    <div className="h-screen w-full bg-black">
      <Canvas camera={{ position: [0, 25, 45], fov: 50, near: 0.1, far: 2000 }}>
        <ambientLight intensity={0.15} />
        <pointLight position={[0, 0, 0]} intensity={2.5} decay={0} />
        <Stars radius={300} depth={60} count={5000} factor={7} fade />

        <Suspense fallback={null}>
          {/* Spawned inside the canvas — flat color, no texture file needed yet */}
          <Planet position={[0, 0, 0]} radius={3} color="#4ade80" rotationSpeed={0.15} />

          {/* Once you drop an image in public/textures/, use it like this: */}
          {/* <Planet position={[10, 0, 0]} radius={1.5} texture="/textures/earth.jpg" state="active" /> */}
        </Suspense>

        <OrbitControls enableDamping dampingFactor={0.05} />
      </Canvas>
    </div>
  );
}