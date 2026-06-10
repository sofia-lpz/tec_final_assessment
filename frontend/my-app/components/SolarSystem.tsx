"use client";

import { Suspense, useRef } from "react";
import type { ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars, Environment } from "@react-three/drei";
import { Group } from "three";
import Planet from "@/components/Planet";
import Star from "@/components/Star";

// Revolves its children around the center (the star) at a given radius/speed.
function Orbit({
  radius,
  speed,
  children,
}: {
  radius: number;
  speed: number;
  children: ReactNode;
}) {
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += speed * delta;
  });
  return (
    <group ref={ref}>
      <group position={[radius, 0, 0]}>{children}</group>
    </group>
  );
}

export default function SolarSystem() {
  return (
    <div className="h-screen w-full bg-black">
      {/* High on Y, slight Z offset → steep top-down view of the orbital plane */}
      <Canvas camera={{ position: [0, 60, 18], fov: 50, near: 0.1, far: 2000 }}>
        <Environment preset="night" />
        <ambientLight intensity={0} />
        <Stars radius={300} depth={60} count={5000} factor={7} fade />

        <Suspense fallback={null}>
          {/* Star at the center of the grid — casts light on the planets */}
          <Star name="star" scale={4} />

          {/* Each planet on its own orbit: increasing radius, decreasing speed */}
          <Orbit radius={10} speed={0.45}>
            <Planet name="neptune" scale={2} state="none" glowColor="#037028" glowSize={0.7} />
          </Orbit>

          <Orbit radius={16} speed={0.35}>
            <Planet name="neptune" scale={2} state="transmitting" glowColor="#037028" glowSize={0.7} />
          </Orbit>

          <Orbit radius={22} speed={0.27}>
            <Planet name="neptune" scale={2} state="birthplus" glowColor="#037028" glowSize={0.7} />
          </Orbit>

          <Orbit radius={28} speed={0.2}>
            <Planet name="neptune" scale={2} state="scienceplus" glowColor="#037028" glowSize={0.7} />
          </Orbit>
        </Suspense>

        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.05}
          maxPolarAngle={Math.PI / 3}
        />

        {/* The grid the star sits at the center of */}
        <gridHelper args={[100, 50]} />
      </Canvas>
    </div>
  );
}