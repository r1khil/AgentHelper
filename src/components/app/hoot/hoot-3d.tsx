"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { cn } from "@/lib/utils";
import { watchAttention } from "./attention";

/** Where he looks, -1..1 on each axis (see attention.ts), and whether a password is being typed. */
type Pointer = { x: number; y: number; secret: boolean };

/** Soft studio reflections for the glossy eyes and beak, generated locally (no HDR download). */
function Studio() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene } = get();
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [get]);
  return null;
}

function collectParts(scene: THREE.Object3D) {
  const get = (n: string) => scene.getObjectByName(n)!;
  return {
    root: get("Hoot"),
    eyes: [get("EyePivotL"), get("EyePivotR")],
    open: ["ScleraL", "ScleraR", "EyePivotL", "EyePivotR"].map(get),
    closed: [get("ClosedL"), get("ClosedR")],
    happy: [get("HappyL"), get("HappyR")],
    wings: [get("WingPivotL"), get("WingPivotR")],
  };
}

const ease = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));

type Clock = { nextBlink: number; blinkUntil: number; happyUntil: number; hopAt: number; ruffleAt: number; nextRuffle: number };

/** One frame of Hoot: gaze, breathing, hop, wings and eyes. Mutates the scene graph directly, as three.js expects. */
function animate(P: ReturnType<typeof collectParts>, c: Clock, p: Pointer, t: number, dt: number) {
  const now = performance.now() / 1000;

  // Where to look: whatever the member is doing. While a password is typed he turns politely away.
  const gx = p.secret ? -0.6 : p.x;
  const gy = p.secret ? 0.4 : p.y;
  P.root.rotation.y = ease(P.root.rotation.y, gx * 0.45, 5, dt);
  P.root.rotation.x = ease(P.root.rotation.x, gy * 0.18, 5, dt);
  // A curious head tilt toward the side he's looking at.
  P.root.rotation.z = ease(P.root.rotation.z, -gx * 0.12, 4, dt);
  for (const e of P.eyes) {
    e.rotation.y = ease(e.rotation.y, gx * 0.14, 12, dt);
    e.rotation.x = ease(e.rotation.x, gy * 0.12, 12, dt);
  }

  // Breathing, and the hop: squash on take-off and landing, stretch in the air.
  const hop = now - c.hopAt;
  const air = hop < 0.55 ? Math.sin((hop / 0.55) * Math.PI) : 0;
  const squash = hop < 0.1 ? Math.sin((hop / 0.1) * Math.PI) * 0.08 : hop > 0.5 && hop < 0.65 ? Math.sin(((hop - 0.5) / 0.15) * Math.PI) * 0.06 : 0;
  const breath = Math.sin(t * 1.7) * 0.008;
  // Now and then he fluffs his feathers.
  if (t > c.nextRuffle) {
    c.ruffleAt = t;
    c.nextRuffle = t + 12 + Math.random() * 14;
  }
  const since = t - c.ruffleAt;
  const ruffle = since < 0.5 ? Math.sin((since / 0.5) * Math.PI * 3) * 0.025 * (1 - since / 0.5) : 0;
  P.root.position.y = air * 0.35;
  P.root.scale.set(1 + squash * 0.6 - breath * 0.4 + ruffle, 1 - squash + breath + air * 0.04 - ruffle * 0.6, 1 + squash * 0.6 - breath * 0.4 + ruffle);
  const flap = now < c.happyUntil ? Math.sin(now * 18) * 0.35 + 0.45 : 0;
  P.wings[0].rotation.z = ease(P.wings[0].rotation.z, -flap, 14, dt);
  P.wings[1].rotation.z = ease(P.wings[1].rotation.z, flap, 14, dt);

  // Eyes: open, blinking, or smiling.
  if (t > c.nextBlink) {
    c.blinkUntil = t + 0.13;
    c.nextBlink = t + 2.4 + Math.random() * 4;
  }
  const happy = now < c.happyUntil;
  const closed = !happy && (p.secret || t < c.blinkUntil);
  for (const o of P.open) o.visible = !happy && !closed;
  for (const o of P.closed) o.visible = closed;
  for (const o of P.happy) o.visible = happy;
}

function Owl({ pointer, pokes, onReady }: { pointer: React.RefObject<Pointer>; pokes: number; onReady: () => void }) {
  const gltf = useLoader(GLTFLoader, "/hoot/hoot.glb");
  // Scene-graph handles live in a ref: three.js objects are mutated every frame, which React state must never be.
  const parts = useRef<ReturnType<typeof collectParts> | null>(null);
  const clock = useRef<Clock>({ nextBlink: 2, blinkUntil: 0, happyUntil: 0, hopAt: -10, ruffleAt: -10, nextRuffle: 8 });

  useEffect(() => {
    const p = (parts.current = collectParts(gltf.scene));
    for (const o of [...p.closed, ...p.happy]) o.visible = false;
    // glTF sheen reads much brighter in three.js than in Blender and greys out the charcoal body.
    gltf.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (m instanceof THREE.MeshPhysicalMaterial) m.sheen = 0;
    });
    onReady();
  }, [gltf, onReady]);

  // A click: hop, smile, flap.
  useEffect(() => {
    if (!pokes) return;
    const c = clock.current;
    c.hopAt = performance.now() / 1000;
    c.happyUntil = c.hopAt + 1.3;
  }, [pokes]);

  useFrame((state, dt) => {
    if (parts.current) animate(parts.current, clock.current, pointer.current, state.clock.elapsedTime, dt);
  });

  // The body's centre sits one unit up; drop it to the origin, where the default camera looks.
  return <primitive object={gltf.scene} position={[0, -0.95, 0]} />;
}

/**
 * Hoot in real 3D, for a few hero spots. He watches what you do (the pointer, the field you're typing in, where you
 * click), tilts his head, blinks, breathes, fluffs his feathers now and then, looks away while you type a password,
 * and hops when clicked. Loaded on demand (see HootHero); renders only while on screen.
 */
export default function Hoot3D({ size, className }: { size: number; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const pointer = useRef<Pointer>({ x: 0, y: 0, secret: false });
  const [onScreen, setOnScreen] = useState(true);
  const [ready, setReady] = useState(false);
  const [pokes, setPokes] = useState(0);
  const onReady = useCallback(() => setReady(true), []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    const unwatch = watchAttention(({ target, secret }) => {
      let x = 0;
      let y = 0;
      if (target.kind === "dir") ({ x, y } = target);
      else if (target.kind === "point") {
        // Relative to the whole window, so he turns his head toward the far side of the page too.
        const r = el.getBoundingClientRect();
        x = Math.max(-1, Math.min(1, (target.x - (r.left + r.width / 2)) / (window.innerWidth / 2)));
        y = Math.max(-1, Math.min(1, (target.y - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      }
      pointer.current = { x, y, secret };
    });
    return () => {
      io.disconnect();
      unwatch();
    };
  }, []);

  return (
    <div ref={box} className={cn("relative cursor-pointer", className)} style={{ width: size, height: size }} onClick={() => setPokes((n) => n + 1)} aria-hidden>
      {!ready && (
        // The flat render holds his place while the model loads.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/hoot/hoot-768.webp" alt="" width={size} height={size} className="absolute inset-0 size-full" />
      )}
      <Canvas
        className={cn("transition-opacity duration-300", ready ? "opacity-100" : "opacity-0")}
        frameloop={onScreen ? "always" : "never"}
        dpr={[1, 2]}
        camera={{ position: [0, 0.35, 7.2], fov: 21 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.AgXToneMapping, powerPreference: "low-power" }}
      >
        <hemisphereLight args={["#ffffff", "#cfc8bd", 0.45]} />
        <directionalLight position={[-3, 5, 5]} intensity={2.4} color="#fff6ec" />
        <directionalLight position={[4, 2, 3]} intensity={0.55} color="#e9efff" />
        <directionalLight position={[1, 4, -5]} intensity={2} />
        <directionalLight position={[-3, 2, -4]} intensity={1.1} />
        <Studio />
        <Suspense fallback={null}>
          <Owl pointer={pointer} pokes={pokes} onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
