import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { AGENTS, PIPELINE, agentById, type AgentDef } from "../agents/registry";
import type { AgentId } from "../types";
import { useI18n } from "../i18n";

// The living galaxy: every department is a star. When an agent runs,
// its star glows and the link from the core lights up.

interface GalaxyProps {
  activeAgent: AgentId | null;
  onSelect: (id: AgentId) => void;
}

function StarNode({
  def,
  active,
  label,
  onSelect
}: {
  def: AgentDef;
  active: boolean;
  label: string;
  onSelect: (id: AgentId) => void;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const isCore = def.id === "core";
  const radius = isCore ? 0.58 : 0.36;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = active ? 1.6 + Math.sin(t * 6) * 0.9 : isCore ? 0.9 + Math.sin(t * 1.5) * 0.15 : 0.55;
    const mat = mesh.current?.material as THREE.MeshStandardMaterial | undefined;
    if (mat) mat.emissiveIntensity = pulse;
    if (halo.current) {
      const s = active ? 1.5 + Math.sin(t * 6) * 0.22 : 1.25 + Math.sin(t * 2 + def.position[0]) * 0.06;
      halo.current.scale.setScalar(s);
      const hmat = halo.current.material as THREE.MeshBasicMaterial;
      hmat.opacity = active ? 0.35 : 0.12;
    }
    if (mesh.current && !isCore) {
      mesh.current.position.y = Math.sin(t * 0.8 + def.position[2]) * 0.08;
    }
  });

  return (
    <group position={def.position}>
      <mesh
        ref={mesh}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(def.id);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={def.color}
          emissive={def.color}
          emissiveIntensity={0.6}
          roughness={0.25}
          metalness={0.1}
        />
      </mesh>
      <mesh ref={halo} scale={1.25}>
        <sphereGeometry args={[radius, 24, 24]} />
        <meshBasicMaterial
          color={def.color}
          transparent
          opacity={0.12}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>
      <Html
        center
        distanceFactor={11}
        position={[0, -(radius + 0.42), 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className="star-label" style={{ borderColor: def.color }}>
          {label}
        </div>
      </Html>
    </group>
  );
}

function LinkLine({
  from,
  to,
  color,
  active
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  active: boolean;
}) {
  return (
    <Line
      points={[from, to]}
      color={active ? color : "#1d3350"}
      lineWidth={active ? 2.4 : 1}
      transparent
      opacity={active ? 0.95 : 0.4}
    />
  );
}

export default function GalaxyScene({ activeAgent, onSelect }: GalaxyProps) {
  const { t } = useI18n();

  const links = useMemo(() => {
    const core = agentById("core");
    const spokes = AGENTS.filter((a) => a.id !== "core").map((a) => ({
      key: `core-${a.id}`,
      from: core.position,
      to: a.position,
      agent: a.id,
      color: a.color
    }));
    const chain = PIPELINE.slice(0, -1).map((id, i) => {
      const a = agentById(id);
      const b = agentById(PIPELINE[i + 1]);
      return {
        key: `${a.id}-${b.id}`,
        from: a.position,
        to: b.position,
        agent: b.id,
        color: b.color
      };
    });
    return [...spokes, ...chain];
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 2.4, 8.5], fov: 55 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 4, 6]} intensity={40} color="#7fd4ff" />
      <Stars radius={60} depth={40} count={2200} factor={3} saturation={0.4} fade speed={0.6} />

      {links.map((l) => (
        <LinkLine
          key={l.key}
          from={l.from}
          to={l.to}
          color={l.color}
          active={activeAgent === l.agent || (l.key.startsWith("core-") && activeAgent === "core")}
        />
      ))}

      {AGENTS.map((a) => (
        <StarNode
          key={a.id}
          def={a}
          active={activeAgent === a.id}
          label={t(`agent.${a.id}`)}
          onSelect={onSelect}
        />
      ))}

      <OrbitControls
        enablePan={false}
        minDistance={4}
        maxDistance={16}
        autoRotate
        autoRotateSpeed={0.45}
      />
    </Canvas>
  );
}
