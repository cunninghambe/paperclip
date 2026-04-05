import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import type { OfficeAgent } from "../../api/office";
import { AgentDesk } from "./AgentDesk";
import { calculateDeskLayout, getOfficeFloorDimensions } from "./layout-utils";

interface OfficeCanvasProps {
  agents: OfficeAgent[];
  onAgentSelect?: (agent: OfficeAgent) => void;
}

/* ---------- decoration primitives ---------- */

function PottedPlant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Pot */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.14, 0.3, 8]} />
        <meshStandardMaterial color="#8b4513" />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.31, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 8]} />
        <meshStandardMaterial color="#3d2b1f" />
      </mesh>
      {/* Foliage spheres */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.22, 8, 8]} />
        <meshStandardMaterial color="#228b22" />
      </mesh>
      <mesh position={[0.1, 0.65, 0.05]}>
        <sphereGeometry args={[0.15, 8, 8]} />
        <meshStandardMaterial color="#2d8b2d" />
      </mesh>
      <mesh position={[-0.08, 0.6, -0.06]}>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshStandardMaterial color="#1e7a1e" />
      </mesh>
    </group>
  );
}

function WaterCooler({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Base */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[0.4, 0.5, 0.35]} />
        <meshStandardMaterial color="#e5e7eb" />
      </mesh>
      {/* Water jug */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.45, 12]} />
        <meshStandardMaterial color="#93c5fd" transparent opacity={0.6} />
      </mesh>
      {/* Cap */}
      <mesh position={[0, 0.94, 0]}>
        <cylinderGeometry args={[0.13, 0.12, 0.04, 12]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
    </group>
  );
}

function Whiteboard({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Board */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[2.0, 1.2, 0.06]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 1.2, 0.035]}>
        <boxGeometry args={[2.1, 1.3, 0.02]} />
        <meshStandardMaterial color="#9ca3af" />
      </mesh>
      {/* Some "writing" lines */}
      {[0.3, 0.1, -0.1, -0.3].map((y, i) => (
        <mesh key={i} position={[-0.2 + i * 0.05, 1.2 + y, 0.04]}>
          <boxGeometry args={[1.2 - i * 0.15, 0.02, 0.005]} />
          <meshStandardMaterial color={i < 2 ? "#3b82f6" : "#ef4444"} />
        </mesh>
      ))}
      {/* Tray */}
      <mesh position={[0, 0.55, 0.08]}>
        <boxGeometry args={[0.6, 0.04, 0.08]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>
    </group>
  );
}

function CoffeeMachine({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Table */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.8, 0.04, 0.5]} />
        <meshStandardMaterial color="#a07850" />
      </mesh>
      {/* Table legs */}
      {([[-0.35, -0.2], [0.35, -0.2], [-0.35, 0.2], [0.35, 0.2]] as [number, number][]).map(([x, z], i) => (
        <mesh key={i} position={[x, 0.17, z]}>
          <boxGeometry args={[0.04, 0.34, 0.04]} />
          <meshStandardMaterial color="#7a5c30" />
        </mesh>
      ))}
      {/* Machine body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[0.3, 0.35, 0.25]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      {/* Screen */}
      <mesh position={[0, 0.6, 0.13]}>
        <boxGeometry args={[0.12, 0.06, 0.005]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function Bookshelf({ position, rotation }: { position: [number, number, number]; rotation?: [number, number, number] }) {
  const bookColors = ["#dc2626", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#4f46e5"];
  return (
    <group position={position} rotation={rotation}>
      {/* Shelf frame */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[1.4, 1.4, 0.3]} />
        <meshStandardMaterial color="#92734e" />
      </mesh>
      {/* Shelves */}
      {[0.25, 0.7, 1.15].map((y, si) => (
        <group key={si}>
          <mesh position={[0, y, 0.02]}>
            <boxGeometry args={[1.3, 0.04, 0.26]} />
            <meshStandardMaterial color="#a07850" />
          </mesh>
          {/* Books on this shelf */}
          {Array.from({ length: 5 }).map((_, bi) => (
            <mesh key={bi} position={[-0.45 + bi * 0.22, y + 0.14 + (bi % 2) * 0.02, 0.02]}>
              <boxGeometry args={[0.08, 0.22 + (bi % 3) * 0.03, 0.18]} />
              <meshStandardMaterial color={bookColors[(si * 5 + bi) % bookColors.length]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Rug({ position, size, color }: { position: [number, number, number]; size: [number, number]; color: string }) {
  return (
    <mesh position={position} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={size} />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

function WallSegment({ position, size, rotation }: { position: [number, number, number]; size: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color="#d6cfc7" />
    </mesh>
  );
}

/* ---------- main canvas ---------- */

export function OfficeCanvas({ agents, onAgentSelect }: OfficeCanvasProps) {
  const positions = calculateDeskLayout(agents.length);
  const floor = getOfficeFloorDimensions(agents.length);
  const fw = floor.width + 6;
  const fd = floor.depth + 6;
  const halfW = fw / 2;
  const halfD = fd / 2;

  return (
    <div
      className="h-full w-full"
      style={{ touchAction: "none" }}
      role="img"
      aria-label="3D office visualization showing agent desks"
    >
      <Canvas
        shadows
        camera={{ fov: 50, position: [halfW + 5, 12, halfD + 5] }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#f0ebe3"]} />
        <fog attach="fog" args={["#f0ebe3", 30, 60]} />

        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 18, 10]}
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        />
        <pointLight position={[0, 4, 0]} intensity={0.3} color="#fef3c7" />

        <Suspense fallback={null}>
          {/* ===== FLOOR ===== */}
          {/* Main floor */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
            <planeGeometry args={[fw + 4, fd + 4]} />
            <meshStandardMaterial color="#c4b9a8" />
          </mesh>

          {/* Carpet under desk area */}
          <Rug position={[0, 0.005, 0]} size={[fw - 2, fd - 2]} color="#4a6741" />

          {/* ===== WALLS ===== */}
          {/* Back wall */}
          <WallSegment position={[0, 1.5, -halfD]} size={[fw + 2, 3, 0.15]} />
          {/* Left wall */}
          <WallSegment position={[-halfW, 1.5, 0]} size={[0.15, 3, fd + 2]} />
          {/* Right wall (partial — doorway gap) */}
          <WallSegment position={[halfW, 1.5, -halfD / 2 - 0.5]} size={[0.15, 3, fd / 2]} />
          <WallSegment position={[halfW, 2.5, halfD / 2]} size={[0.15, 1, fd / 2]} />

          {/* Baseboard trim */}
          <mesh position={[0, 0.06, -halfD + 0.07]}>
            <boxGeometry args={[fw + 2, 0.12, 0.06]} />
            <meshStandardMaterial color="#7a6b5a" />
          </mesh>
          <mesh position={[-halfW + 0.07, 0.06, 0]}>
            <boxGeometry args={[0.06, 0.12, fd + 2]} />
            <meshStandardMaterial color="#7a6b5a" />
          </mesh>

          {/* ===== CEILING LIGHTS ===== */}
          {[-halfW / 2, halfW / 2].map((x, i) => (
            <group key={`light-${i}`}>
              <mesh position={[x, 3.5, 0]}>
                <boxGeometry args={[1.5, 0.06, 0.3]} />
                <meshStandardMaterial color="#e5e7eb" emissive="#fef9c3" emissiveIntensity={0.4} />
              </mesh>
              <pointLight position={[x, 3.2, 0]} intensity={0.15} color="#fef9c3" distance={8} />
            </group>
          ))}

          {/* ===== DECORATIONS ===== */}
          {/* Plants in corners */}
          <PottedPlant position={[-halfW + 0.8, 0, -halfD + 0.8]} />
          <PottedPlant position={[halfW - 0.8, 0, -halfD + 0.8]} />
          <PottedPlant position={[-halfW + 0.8, 0, halfD - 1.5]} />

          {/* Whiteboard on back wall */}
          <Whiteboard position={[halfW / 3, 0, -halfD + 0.15]} />

          {/* Bookshelf on left wall */}
          <Bookshelf position={[-halfW + 0.25, 0, -halfD / 2]} rotation={[0, Math.PI / 2, 0]} />

          {/* Water cooler near door */}
          <WaterCooler position={[halfW - 0.5, 0, halfD - 2]} />

          {/* Coffee station */}
          <CoffeeMachine position={[-halfW + 1.2, 0, halfD - 1.5]} />

          {/* Welcome mat at door */}
          <Rug position={[halfW - 0.3, 0.006, halfD / 2]} size={[0.8, 1.2]} color="#8b7355" />

          {/* ===== AGENT DESKS ===== */}
          {agents.map((agent, i) => {
            const pos = positions[i];
            if (!pos) return null;
            return (
              <AgentDesk
                key={agent.id}
                agent={agent}
                position={[pos.x, pos.y, pos.z]}
                floorBounds={{ halfW, halfD }}
                onSelect={onAgentSelect}
              />
            );
          })}

          <Environment preset="city" />
        </Suspense>

        <OrbitControls
          makeDefault
          minDistance={5}
          maxDistance={60}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>
    </div>
  );
}
