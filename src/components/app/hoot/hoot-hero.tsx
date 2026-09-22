"use client";

import dynamic from "next/dynamic";
import { Component, useSyncExternalStore, type ReactNode } from "react";
import { HootSprite, usePrefersReducedMotion } from "./hoot-sprite";

// three.js only downloads on pages that show the hero, and only in the browser.
const Hoot3D = dynamic(() => import("./hoot-3d"), {
  ssr: false,
  loading: () => <Poster />,
});

function Poster() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/hoot/hoot-768.webp" alt="" className="size-full" />;
}

let webgl: boolean | undefined;
function hasWebGL() {
  if (webgl === undefined) {
    try {
      webgl = !!document.createElement("canvas").getContext("webgl2");
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
const noSubscribe = () => () => {};

/** A WebGL context can still fail after the check (driver limits, too many contexts): fall back to the sprite. */
class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Big Hoot for welcome moments: live 3D where the device can, the Blender render where it can't or motion is reduced. */
export function HootHero({ size = 200, className }: { size?: number; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const canRender = useSyncExternalStore(noSubscribe, hasWebGL, () => true);
  const sprite = <HootSprite mood="idle" size={size} className={className} />;
  if (reduced || !canRender) return sprite;
  return (
    <div className={className} style={{ width: size, height: size }}>
      <Fallback fallback={sprite}>
        <Hoot3D size={size} />
      </Fallback>
    </div>
  );
}
