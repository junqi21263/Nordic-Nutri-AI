import { Canvas } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo } from "react";

const particleCountPerSide = 80;
const colors = ["#0B3B24", "#bdeecc", "#e3e3de", "#F9F8F3"];
export const achievementConfettiDelayMs = 300;
const gravity = 0.5;
const drag = 0.95;
const motionRate = 0.5;
// Fade fully before a particle's visible bounds can reach the canvas edge.
const bottomFadeDistance = 180;
const bottomFadeRate = 0.06;
const horizontalSpread = 300;
const verticalSpread = 360;
const CELEBRATION_EMITTER_CONFIG = {
  xRatio: 0.53,
  yRatio: 0.1,
};
const isDevelopment = process.env.NODE_ENV !== "production";

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

export interface CelebrationModalSize {
  height: number;
  width: number;
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
  emitterX: number,
  emitterY: number,
): ConfettiParticle[] {
  const random = createRandom(`${seed}:${side}`);

  return Array.from({ length: particleCountPerSide }, () => {
    const isCircle = random() > 0.5;
    const size = random() * 8 + 4;
    const startX = emitterX;
    const startY = emitterY + random() * 200 - 100;
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

function drawEmitterDebugMarkers(
  ctx: CanvasRenderingContext2D,
  leftEmitter: { x: number; y: number },
  rightEmitter: { x: number; y: number },
) {
  ctx.save();
  ctx.fillStyle = "#e53935";
  ctx.strokeStyle = "#e53935";
  ctx.lineWidth = 2;

  for (const emitter of [leftEmitter, rightEmitter]) {
    ctx.beginPath();
    ctx.arc(emitter.x, emitter.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(emitter.x - 7, emitter.y);
    ctx.lineTo(emitter.x + 7, emitter.y);
    ctx.moveTo(emitter.x, emitter.y - 7);
    ctx.lineTo(emitter.x, emitter.y + 7);
    ctx.stroke();
  }

  ctx.restore();
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
  /** The modal's own dimensions in the celebration group's local coordinate system. */
  modalSize: CelebrationModalSize | null;
}

/**
 * Replays the Stitch celebration as two independent ballistic particle bursts.
 * The Canvas stays above the card, so the complete stream can cross the card
 * before the pieces fade naturally near the bottom edge.
 */
export function AchievementConfettiCanvas({ seed, modalSize }: AchievementConfettiCanvasProps) {
  const canvasId = useMemo(() => `achievement-confetti-${seed.replace(/[^a-zA-Z0-9_-]/g, "-")}`, [seed]);
  const canvasStyle = useMemo(() => {
    if (!modalSize) return undefined;
    return `height: ${modalSize.height + verticalSpread * 2}px; width: ${modalSize.width + horizontalSpread * 2}px;`;
  }, [modalSize]);

  useEffect(() => {
    if (!modalSize) return;
    let animationFrame = 0;
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

          const modalCenterX = width / 2;
          const modalCenterY = height / 2;
          const leftEmitter = {
            x: modalCenterX - modalSize.width * CELEBRATION_EMITTER_CONFIG.xRatio,
            y: modalCenterY + modalSize.height * CELEBRATION_EMITTER_CONFIG.yRatio,
          };
          const rightEmitter = {
            x: modalCenterX + modalSize.width * CELEBRATION_EMITTER_CONFIG.xRatio,
            y: modalCenterY + modalSize.height * CELEBRATION_EMITTER_CONFIG.yRatio,
          };

          if (isDevelopment) {
            drawEmitterDebugMarkers(ctx, leftEmitter, rightEmitter);
            return;
          }

          const particles = [
            ...createParticles(seed, "left", leftEmitter.x, leftEmitter.y),
            ...createParticles(seed, "right", rightEmitter.x, rightEmitter.y),
          ];

          const animate = () => {
            if (cancelled) return;
            ctx.clearRect(0, 0, width, height);

            for (let index = particles.length - 1; index >= 0; index -= 1) {
              const particle = particles[index]!;
              particle.vx *= Math.pow(drag, motionRate);
              particle.vy += gravity * motionRate;
              particle.x += particle.vx * motionRate;
              particle.y += particle.vy * motionRate;
              particle.rotation += particle.rotationSpeed * motionRate;

              if (particle.y > height - bottomFadeDistance) {
                particle.opacity -= bottomFadeRate;
              }

              const particleHalfHeight = particle.isCircle ? particle.size / 2 : particle.size * 0.75;
              if (particle.opacity <= 0 || particle.y >= height - particleHalfHeight) {
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
        });
    };

    const initializationTimer = setTimeout(initialize, 0);

    return () => {
      cancelled = true;
      if (initializationTimer) clearTimeout(initializationTimer);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [canvasId, modalSize, seed]);

  if (!modalSize) return null;

  return <Canvas canvasId={canvasId} className="achievement-unlock-overlay__canvas" id={canvasId} style={canvasStyle} type="2d" />;
}
