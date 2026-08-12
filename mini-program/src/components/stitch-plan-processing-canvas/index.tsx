import { Canvas } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo } from "react";
import { stitchInitialProcessingMotion } from "../../features/onboarding/plan-regeneration-motion";
import "./index.scss";

type CanvasNode = {
  width: number;
  height: number;
  getContext: (type: "2d") => CanvasRenderingContext2D;
};

type Particle = { x: number; y: number; delay: number; duration: number; color: string };

const easeInOut = (value: number) => value < .5
  ? 2 * value * value
  : 1 - Math.pow(-2 * value + 2, 2) / 2;

export function StitchPlanProcessingCanvas() {
  const canvasId = useMemo(() => `stitch-plan-processing-${Date.now()}`, []);

  useEffect(() => {
    let frame = 0;
    let disposed = false;
    const query = Taro.createSelectorQuery();
    query.select(`#${canvasId}`).fields({ node: true, size: true }).exec((result) => {
      if (disposed) return;
      const canvas = result[0]?.node as CanvasNode | undefined;
      if (!canvas) return;
      const width = result[0].width as number;
      const height = result[0].height as number;
      const pixelRatio = Taro.getSystemInfoSync().pixelRatio || 1;
      canvas.width = width * pixelRatio;
      canvas.height = height * pixelRatio;
      const context = canvas.getContext("2d");
      context.scale(pixelRatio, pixelRatio);
      const particles: Particle[] = Array.from({ length: 10 }, (_, index) => ({
        x: width * (.12 + ((index * 37) % 74) / 100),
        y: height * (.22 + ((index * 53) % 58) / 100),
        delay: (index * 97) % 500,
        duration: 800 + ((index * 61) % 401),
        color: ["#a5d0b9", "#5b6560", "#012d1d"][index % 3],
      }));
      const start = Date.now();
      const drawArc = (startMs: number, startAngle: number, fraction: number, color: string, radius: number, centerX: number, centerY: number, elapsed: number) => {
        const progress = Math.min(1, Math.max(0, (elapsed - startMs) / stitchInitialProcessingMotion.ringDrawDurationMs));
        if (progress <= 0) return;
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = 8;
        context.lineCap = "round";
        context.arc(centerX, centerY, radius, startAngle, startAngle + Math.PI * 2 * fraction * easeInOut(progress));
        context.stroke();
      };
      const render = () => {
        if (disposed) return;
        const elapsed = Date.now() - start;
        context.clearRect(0, 0, width, height);
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(80, Math.min(width, height) / 2 - 18);
        context.beginPath();
        context.strokeStyle = "#e4e2e2";
        context.lineWidth = 8;
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.stroke();
        const fatStartAngle = -Math.PI / 2;
        const carbsStartAngle = fatStartAngle + Math.PI * 2 * .3;
        const proteinStartAngle = carbsStartAngle + Math.PI * 2 * .46;
        drawArc(stitchInitialProcessingMotion.fatStartMs, fatStartAngle, .3, "#a5d0b9", radius, centerX, centerY, elapsed);
        drawArc(stitchInitialProcessingMotion.carbsStartMs, carbsStartAngle, .46, "#5b6560", radius, centerX, centerY, elapsed);
        drawArc(stitchInitialProcessingMotion.proteinStartMs, proteinStartAngle, .24, "#012d1d", radius, centerX, centerY, elapsed);
        particles.forEach((particle) => {
          const progress = Math.min(1, Math.max(0, (elapsed - particle.delay) / particle.duration));
          if (progress <= 0 || progress >= 1) return;
          const eased = easeInOut(progress);
          context.beginPath();
          context.fillStyle = particle.color;
          context.globalAlpha = (1 - eased) * .7;
          context.arc(particle.x + (centerX - particle.x) * eased, particle.y + (centerY - particle.y) * eased, 3, 0, Math.PI * 2);
          context.fill();
          context.globalAlpha = 1;
        });
        if (!disposed && elapsed < stitchInitialProcessingMotion.completingAtMs) frame = requestAnimationFrame(render);
      };
      render();
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
    };
  }, [canvasId]);

  return <Canvas id={canvasId} canvasId={canvasId} type="2d" className="stitch-plan-processing-canvas" />;
}
