import { Canvas } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo } from "react";

const particleCountPerSide = 40;
const colors = ["#0B3B24", "#bdeecc", "#e3e3de", "#F9F8F3"];
const confettiDelayMs = 300;
const gravity = 0.5;
const drag = 0.95;

type ParticleSide = "left" | "right";

interface ConfettiParticle {
  color: string;
  isCircle: boolean;
  opacity: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

interface CanvasNode {
  height: number;
  width: number;
  getContext: (contextId: "2d") => CanvasRenderingContext2D | null;
}

function createRandom(seed: string) {
  let state = Array.from(seed).reduce(
    (value, character) => ((value * 31 + character.charCodeAt(0)) >>> 0),
    2166136261,
  );

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createParticles(
  seed: string,
  side: ParticleSide,
  width: number,
  height: number,
): ConfettiParticle[] {
  const random = createRandom(`${seed}:${side}`);

  return Array.from({ length: particleCountPerSide }, () => {
    const isCircle = random() > 0.5;
    const size = random() * 8 + 4;
    const startX = side === "left" ? -20 : width + 20;
    const startY = height / 2 + random() * 200 - 100;
    const angle = side === "left" ? random() * 60 - 30 : random() * 60 + 150;
    const speed = random() * 15 + 10;
    const radians = (angle * Math.PI) / 180;

    return {
      color: colors[Math.floor(random() * colors.length)]!,
      isCircle,
      opacity: 1,
      rotation: random() * 360,
      rotationSpeed: random() * 20 - 10,
      size,
      vx: Math.cos(radians) * speed,
      vy: Math.sin(radians) * speed - 10,
      x: startX,
      y: startY,
    };
  });
}

function drawLeaf(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const halfWidth = width / 2;
  const halfHeight = height / 2;

  ctx.beginPath();
  ctx.moveTo(-halfWidth + 2, -halfHeight);
  ctx.lineTo(halfWidth - 2, -halfHeight);
  ctx.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + 2);
  ctx.lineTo(halfWidth, halfHeight - 2);
  ctx.quadraticCurveTo(halfWidth, halfHeight, halfWidth - 2, halfHeight);
  ctx.lineTo(-halfWidth + 2, halfHeight);
  ctx.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - 2);
  ctx.lineTo(-halfWidth, -halfHeight + 2);
  ctx.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + 2, -halfHeight);
  ctx.closePath();
  ctx.fill();
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: ConfettiParticle) {
  ctx.save();
  ctx.globalAlpha = particle.opacity;
  ctx.fillStyle = particle.color;
  ctx.translate(particle.x, particle.y);
  ctx.rotate((particle.rotation * Math.PI) / 180);

  if (particle.isCircle) {
    ctx.beginPath();
    ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawLeaf(ctx, particle.size, particle.size * 1.5);
  }

  ctx.restore();
}

export interface AchievementConfettiCanvasProps {
  seed: string;
}

/**
 * Replays the Stitch celebration as two independent ballistic particle bursts.
 * The Canvas stays above the card, so the complete stream can cross the card
 * before the pieces fade naturally near the bottom edge.
 */
export function AchievementConfettiCanvas({ seed }: AchievementConfettiCanvasProps) {
  const canvasId = useMemo(() => `achievement-confetti-${seed.replace(/[^a-zA-Z0-9_-]/g, "-")}`, [seed]);

  useEffect(() => {
    let animationFrame = 0;
    let launchTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const initialize = () => {
      Taro.createSelectorQuery()
        .select(`#${canvasId}`)
        .fields({ node: true, size: true })
        .exec((result) => {
          if (cancelled) return;

          const entry = result[0] as { height?: number; node?: CanvasNode; width?: number } | undefined;
          const canvas = entry?.node;
          const width = entry?.width || 0;
          const height = entry?.height || 0;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx || !width || !height) return;

          const pixelRatio = Taro.getSystemInfoSync().pixelRatio || 1;
          canvas.width = width * pixelRatio;
          canvas.height = height * pixelRatio;
          ctx.scale(pixelRatio, pixelRatio);

          launchTimer = setTimeout(() => {
            if (cancelled) return;

            const particles = [
              ...createParticles(seed, "left", width, height),
              ...createParticles(seed, "right", width, height),
            ];

            const animate = () => {
              if (cancelled) return;
              ctx.clearRect(0, 0, width, height);

              for (let index = particles.length - 1; index >= 0; index -= 1) {
                const particle = particles[index]!;
                particle.vx *= drag;
                particle.vy += gravity;
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.rotation += particle.rotationSpeed;

                if (particle.y > height - 100) {
                  particle.opacity -= 0.05;
                }

                if (particle.opacity <= 0 || particle.y >= height + 50) {
                  particles.splice(index, 1);
                  continue;
                }

                drawParticle(ctx, particle);
              }

              if (particles.length > 0) {
                animationFrame = requestAnimationFrame(animate);
              }
            };

            animationFrame = requestAnimationFrame(animate);
          }, confettiDelayMs);
        });
    };

    const initializationTimer = setTimeout(initialize, 0);

    return () => {
      cancelled = true;
      if (initializationTimer) clearTimeout(initializationTimer);
      if (launchTimer) clearTimeout(launchTimer);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [canvasId, seed]);

  return <Canvas canvasId={canvasId} className="achievement-unlock-overlay__canvas" id={canvasId} type="2d" />;
}
