import React from "react";
import CompanyLogo from "./CompanyLogo";

/**
 * The stacked glass cubes from the approved design.
 *
 * Built with real CSS 3D transforms — each cube is six positioned faces inside
 * a `transform-style: preserve-3d` scene — rather than a flat rounded square
 * with a gradient. That is what gives the edges genuine parallax and lets light
 * fall differently on the top, left and right faces.
 */

function Cube({ size, className, children }) {
  const half = size / 2;

  // Only the four faces the camera can actually see. The back and bottom were
  // rendering through the translucent front and doubling every edge, and each
  // extra transparent surface is another chance for the compositor to flicker.
  const faces = [
    { name: "top", transform: `rotateX(90deg) translateZ(${half}px)` },
    { name: "front", transform: `translateZ(${half}px)` },
    { name: "left", transform: `rotateY(-90deg) translateZ(${half}px)` },
    { name: "right", transform: `rotateY(90deg) translateZ(${half}px)` },
  ];

  return (
    <div
      className={`cube3d ${className || ""}`}
      style={{ width: size, height: size }}
    >
      {faces.map((face) => (
        <div
          key={face.name}
          className={`face face-${face.name}`}
          style={{
            width: size,
            height: size,
            transform: face.transform,
          }}
        >
          {face.name === "front" && children ? (
            <div className="face-badge">{children}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function GlassCubes({ ticker, website }) {
  return (
    <div className="cube-scene" aria-hidden="true">
      <div className="cube-stack">
        <Cube size={94} className="cube-base" />
        <Cube size={64} className="cube-top">
          <CompanyLogo ticker={ticker} website={website} size={25} />
        </Cube>
      </div>
      <div className="cube-glow" />
    </div>
  );
}
