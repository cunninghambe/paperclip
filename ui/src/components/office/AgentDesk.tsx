import { useRef, useState, useMemo, useCallback } from "react";
import { useFrame } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import type { OfficeAgent } from "../../api/office";

const STATUS_COLORS: Record<OfficeAgent["status"], string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  idle: "#6b7280",
  error: "#ef4444",
};

const SHIRT_COLORS = [
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#06b6d4", "#84cc16", "#e11d44",
];
const SKIN_TONES = ["#f5d0a9", "#d4a574", "#c68642", "#8d5524", "#fde0c4", "#e8beac"];
const HAIR_COLORS = ["#1a1a1a", "#4a3728", "#8b6914", "#c44b28", "#2d1b0e", "#6b6b6b"];
const HAIR_STYLES = ["short", "tall", "wide", "bald", "mohawk"] as const;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: readonly T[], hash: number, offset: number): T {
  return arr[(hash + offset) % arr.length]!;
}

// Simple seeded PRNG so each agent gets reproducible but different paths
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Waypoint {
  x: number;
  z: number;
  pauseDuration: number; // seconds to pause at this point
}

function generateWaypoints(
  seed: number,
  floorHalfW: number,
  floorHalfD: number,
  deskX: number,
  deskZ: number,
  count: number,
): Waypoint[] {
  const rng = mulberry32(seed);
  const margin = 1.0; // stay away from walls
  const pts: Waypoint[] = [];

  // First waypoint: start at desk
  pts.push({ x: 0, z: 0.8, pauseDuration: 0 });

  for (let i = 0; i < count; i++) {
    // Random world position within office bounds, converted to local (relative to desk)
    const wx = (rng() * 2 - 1) * (floorHalfW - margin);
    const wz = (rng() * 2 - 1) * (floorHalfD - margin);
    // Convert to local coords (relative to desk position)
    const lx = wx - deskX;
    const lz = wz - deskZ;
    const pause = rng() * 2 + 0.5; // 0.5–2.5s pause
    pts.push({ x: lx, z: lz, pauseDuration: pause });
  }

  // Return to desk periodically
  pts.push({ x: 0, z: 0.8, pauseDuration: 1 + rng() * 2 });

  return pts;
}

export interface AgentDeskProps {
  agent: OfficeAgent;
  position: [number, number, number];
  floorBounds: { halfW: number; halfD: number };
  onSelect?: (agent: OfficeAgent) => void;
}

export function AgentDesk({ agent, position, floorBounds, onSelect }: AgentDeskProps) {
  const figureRef = useRef<Group>(null);
  const labelRef = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const color = STATUS_COLORS[agent.status];
  const isIdle = agent.status === "idle";
  const isPaused = agent.status === "paused";

  const look = useMemo(() => {
    const h = hashStr(agent.id || agent.name);
    return {
      shirt: pick(SHIRT_COLORS, h, 0),
      skin: pick(SKIN_TONES, h, 3),
      hair: pick(HAIR_COLORS, h, 7),
      hairStyle: pick(HAIR_STYLES, h, 11),
      scale: 0.9 + (h % 20) / 100,
      walkSpeed: 1.2 + (h % 30) / 30, // 1.2–2.2 units/sec
      seed: h,
    };
  }, [agent.id, agent.name]);

  // Generate a set of waypoints for this agent
  const waypoints = useMemo(
    () =>
      generateWaypoints(
        look.seed,
        floorBounds.halfW,
        floorBounds.halfD,
        position[0],
        position[2],
        8 + (look.seed % 5), // 8–12 waypoints per loop
      ),
    [look.seed, floorBounds.halfW, floorBounds.halfD, position],
  );

  // Walk state stored in ref to avoid re-renders
  const walkState = useRef({
    waypointIdx: 0,
    currentX: 0,
    currentZ: 0.8,
    pauseRemaining: 0,
    totalPath: 0,
    initialized: false,
  });

  const getNextWaypoint = useCallback(() => {
    const ws = walkState.current;
    ws.waypointIdx = (ws.waypointIdx + 1) % waypoints.length;
    return waypoints[ws.waypointIdx]!;
  }, [waypoints]);

  useFrame((_, delta) => {
    if (!figureRef.current) return;
    const fig = figureRef.current;
    const ws = walkState.current;

    if (isIdle) {
      if (!ws.initialized) {
        ws.currentX = 0;
        ws.currentZ = 0.8;
        ws.waypointIdx = 0;
        ws.pauseRemaining = 0;
        ws.initialized = true;
      }

      // Handle pause at waypoint
      if (ws.pauseRemaining > 0) {
        ws.pauseRemaining -= delta;
        fig.position.set(ws.currentX, 0, ws.currentZ);
        return;
      }

      const target = waypoints[ws.waypointIdx]!;
      const dx = target.x - ws.currentX;
      const dz = target.z - ws.currentZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.1) {
        // Arrived at waypoint
        ws.currentX = target.x;
        ws.currentZ = target.z;
        ws.pauseRemaining = target.pauseDuration;
        getNextWaypoint();
      } else {
        // Move toward target
        const step = Math.min(look.walkSpeed * delta, dist);
        ws.currentX += (dx / dist) * step;
        ws.currentZ += (dz / dist) * step;
        ws.totalPath += step;

        // Face walk direction
        fig.rotation.y = Math.atan2(dx, dz);
      }

      // Walk bob
      const bob = Math.abs(Math.sin(ws.totalPath * 5)) * 0.04;
      fig.position.set(ws.currentX, bob, ws.currentZ);

      // Move label to follow figure
      if (labelRef.current) {
        labelRef.current.position.set(ws.currentX, 1.6 * look.scale, ws.currentZ);
      }
    } else if (isPaused) {
      ws.initialized = false;
      fig.position.set(0.6, 0, 0.4);
      fig.rotation.y = -Math.PI * 0.3;
      if (labelRef.current) labelRef.current.position.set(0, 1.6 * look.scale, 0);
    } else {
      ws.initialized = false;
      fig.position.set(0, 0, 0);
      fig.rotation.y = 0;
      if (labelRef.current) labelRef.current.position.set(0, 1.6 * look.scale, 0);
    }
  });

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    onSelect?.(agent);
  }

  const s = look.scale;
  const seated = !isIdle && !isPaused;
  const torsoY = seated ? 0.65 : 0.75;
  const headY = seated ? 1.05 : 1.2;
  const armY = seated ? 0.55 : 0.65;
  const handY = seated ? 0.37 : 0.45;
  const legY = seated ? 0.22 : 0.35;
  const eyeY = seated ? 1.07 : 1.22;
  const eyeZ = seated ? 0.62 : -0.16;
  const torsoZ = seated ? 0.8 : 0;
  const headZ = seated ? 0.8 : 0;
  const armZ = seated ? 0.6 : -0.05;
  const handZ = seated ? 0.45 : -0.15;

  return (
    <group position={position}>
      {/* Desk surface */}
      <mesh
        position={[0, 0.4, 0]}
        castShadow
        receiveShadow
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[1.8, 0.08, 1.2]} />
        <meshStandardMaterial color={hovered ? "#c8a97a" : "#a07850"} />
      </mesh>

      {/* Desk legs */}
      {(
        [[-0.7, -0.5], [0.7, -0.5], [-0.7, 0.5], [0.7, 0.5]] as [number, number][]
      ).map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.2, lz]} castShadow>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
          <meshStandardMaterial color="#7a5c30" />
        </mesh>
      ))}

      {/* Monitor */}
      <mesh position={[0, 0.75, -0.3]} castShadow>
        <boxGeometry args={[0.9, 0.55, 0.04]} />
        <meshStandardMaterial
          color={agent.status === "active" ? "#0f172a" : "#111118"}
          emissive={agent.status === "active" ? "#334155" : "#000000"}
          emissiveIntensity={agent.status === "active" ? 0.3 : 0}
        />
      </mesh>
      <mesh position={[0, 0.5, -0.3]}>
        <boxGeometry args={[0.08, 0.15, 0.08]} />
        <meshStandardMaterial color="#2a2a3e" />
      </mesh>

      {/* Keyboard */}
      <mesh position={[0, 0.45, 0.15]}>
        <boxGeometry args={[0.5, 0.02, 0.18]} />
        <meshStandardMaterial color="#2a2a2a" />
      </mesh>
      {/* Coffee mug */}
      <mesh position={[0.65, 0.48, 0.1]}>
        <cylinderGeometry args={[0.04, 0.035, 0.1, 8]} />
        <meshStandardMaterial color="#d97706" />
      </mesh>

      {/* Chair */}
      <mesh position={[0, 0.25, 0.8]} castShadow>
        <boxGeometry args={[0.8, 0.08, 0.8]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      <mesh position={[0, 0.6, 1.1]}>
        <boxGeometry args={[0.8, 0.7, 0.08]} />
        <meshStandardMaterial color="#374151" />
      </mesh>
      {([-0.25, 0, 0.25] as number[]).map((ox, i) => (
        <mesh key={`wheel-${i}`} position={[ox, 0.04, 0.8]}>
          <sphereGeometry args={[0.04, 6, 6]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      ))}

      {/* === Agent figure (animated group) === */}
      <group ref={figureRef} scale={[s, s, s]}>
        {/* Torso */}
        <mesh position={[0, torsoY, torsoZ]} castShadow>
          <boxGeometry args={[0.42, 0.45, 0.28]} />
          <meshStandardMaterial color={look.shirt} />
        </mesh>

        {/* Legs */}
        <mesh position={[-0.1, legY, torsoZ]} castShadow>
          <boxGeometry args={[0.14, 0.35, 0.16]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
        <mesh position={[0.1, legY, torsoZ]} castShadow>
          <boxGeometry args={[0.14, 0.35, 0.16]} />
          <meshStandardMaterial color="#374151" />
        </mesh>

        {/* Head */}
        <mesh position={[0, headY, headZ]} castShadow>
          <sphereGeometry args={[0.19, 16, 16]} />
          <meshStandardMaterial color={look.skin} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-0.07, eyeY, eyeZ]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.07, eyeY, eyeZ]}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[-0.07, eyeY, eyeZ - 0.025]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial color="#1a1a2e" />
        </mesh>
        <mesh position={[0.07, eyeY, eyeZ - 0.025]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshStandardMaterial color="#1a1a2e" />
        </mesh>

        {/* Hair */}
        {look.hairStyle === "short" && (
          <mesh position={[0, headY + 0.12, headZ + 0.02]}>
            <sphereGeometry args={[0.195, 16, 8]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
        )}
        {look.hairStyle === "tall" && (
          <mesh position={[0, headY + 0.17, headZ + 0.02]}>
            <boxGeometry args={[0.3, 0.2, 0.3]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
        )}
        {look.hairStyle === "wide" && (
          <mesh position={[0, headY + 0.1, headZ + 0.02]}>
            <boxGeometry args={[0.44, 0.1, 0.38]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
        )}
        {look.hairStyle === "mohawk" && (
          <mesh position={[0, headY + 0.19, headZ]}>
            <boxGeometry args={[0.08, 0.22, 0.25]} />
            <meshStandardMaterial color={look.hair} />
          </mesh>
        )}

        {/* Arms */}
        <mesh position={[-0.32, armY, armZ]} castShadow>
          <boxGeometry args={[0.12, 0.38, 0.12]} />
          <meshStandardMaterial color={look.shirt} />
        </mesh>
        <mesh position={[-0.32, handY, handZ]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color={look.skin} />
        </mesh>
        <mesh position={[0.32, armY, armZ]} castShadow>
          <boxGeometry args={[0.12, 0.38, 0.12]} />
          <meshStandardMaterial color={look.shirt} />
        </mesh>
        <mesh position={[0.32, handY, handZ]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color={look.skin} />
        </mesh>

        {/* Error indicator */}
        {agent.status === "error" && (
          <mesh position={[0, headY + 0.35, headZ]}>
            <octahedronGeometry args={[0.1, 0]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
          </mesh>
        )}
      </group>

      {/* Status orb — only when working */}
      {agent.status === "active" && (
        <mesh position={[0.6, 0.9, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.6} />
        </mesh>
      )}

      {/* Name label (follows figure when walking) */}
      <group ref={labelRef} position={[0, 1.6 * s, 0]}>
        <Html center>
          <div
            style={{
              background: "rgba(0,0,0,0.75)",
              color: "#fff",
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 500,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              userSelect: "none",
              letterSpacing: "0.02em",
              borderBottom: `2px solid ${color}`,
            }}
          >
            {agent.name}
            {isIdle && <span style={{ marginLeft: 4, opacity: 0.6 }}>idle</span>}
            {isPaused && <span style={{ marginLeft: 4, opacity: 0.6 }}>break</span>}
          </div>
        </Html>
      </group>
    </group>
  );
}
