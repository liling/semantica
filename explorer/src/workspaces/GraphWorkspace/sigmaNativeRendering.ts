import EdgeCurveProgram, { EdgeCurvedArrowProgram } from "@sigma/edge-curve";
import { NodeProgram, type ProgramInfo } from "sigma/rendering";
import { DEFAULT_EDGE_PROGRAM_CLASSES, DEFAULT_NODE_PROGRAM_CLASSES } from "sigma/settings";
import type { NodeDisplayData, RenderParams } from "sigma/types";
import { floatColor } from "sigma/utils";
import type { NodeHoverDrawingFunction, NodeLabelDrawingFunction } from "sigma/rendering";

import { GRAPH_THEME, withAlpha } from "./graphTheme";

type SemanticaNodeDrawData = {
  x: number;
  y: number;
  size: number;
  label: string;
  color: string;
  shellColor?: string;
  coreScale?: number;
  borderColor?: string;
  ringColor?: string;
  ringSize?: number;
  nodeType?: string;
};

const MINERAL_DISC_UNIFORMS = ["u_sizeRatio", "u_correctionRatio", "u_matrix"] as const;

const MINERAL_DISC_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec4 v_coreColor;
varying vec4 v_shellColor;
varying vec4 v_ringColor;
varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_ringSize;
varying float v_coreScale;

uniform float u_correctionRatio;

const float bias = 255.0 / 254.0;
const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

float discMetric(vec2 point) {
  return length(point);
}

void main(void) {
  vec2 unit = v_diffVector / max(v_radius, 0.0001);
  float metric = discMetric(unit);
  float aa = (2.4 * u_correctionRatio) / max(v_radius, 1.0);
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, metric);

  #ifdef PICKING_MODE
  if (alpha <= 0.0) {
    gl_FragColor = transparent;
  } else {
    gl_FragColor = v_color;
    gl_FragColor.a *= bias;
  }
  #else
  if (alpha <= 0.0) {
    gl_FragColor = transparent;
    return;
  }

  float ringNorm = clamp(v_ringSize / max(v_radius, 1.0), 0.0, 0.45);
  float ringStart = max(0.0, 1.0 - ringNorm);
  float coreEdge = clamp(v_coreScale, 0.06, 0.78);
  float coreBlend = 1.0 - smoothstep(max(coreEdge - 0.14, 0.0), coreEdge, metric);
  float bodyLight = 1.0 - smoothstep(0.0, 0.82, metric);
  vec4 color = mix(v_shellColor, v_coreColor, coreBlend);
  color.rgb += vec3(0.022) * pow(bodyLight, 1.45);

  if (ringNorm > 0.0 && metric >= ringStart) {
    color = v_ringColor;
  }
  color.a *= alpha;
  gl_FragColor = color;
  #endif
}
`;

const MINERAL_DISC_VERTEX_SHADER = /* glsl */ `
attribute vec4 a_id;
attribute vec2 a_position;
attribute float a_size;
attribute float a_angle;
attribute vec4 a_coreColor;
attribute vec4 a_shellColor;
attribute vec4 a_ringColor;
attribute float a_ringSize;
attribute float a_coreScale;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_correctionRatio;

varying vec4 v_coreColor;
varying vec4 v_shellColor;
varying vec4 v_ringColor;
varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;
varying float v_ringSize;
varying float v_coreScale;

const float bias = 255.0 / 254.0;

void main() {
  float size = a_size * u_correctionRatio / u_sizeRatio * 4.0;
  vec2 diffVector = size * vec2(cos(a_angle), sin(a_angle));
  vec2 position = a_position + diffVector;

  gl_Position = vec4(
    (u_matrix * vec3(position, 1)).xy,
    0,
    1
  );

  v_diffVector = diffVector;
  v_radius = size / 2.0;
  v_ringSize = a_ringSize;
  v_coreScale = a_coreScale;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_coreColor = a_coreColor;
  v_shellColor = a_shellColor;
  v_ringColor = a_ringColor;
  #endif

  v_color.a *= bias;
}
`;

class MineralDiscNodeProgram extends NodeProgram<(typeof MINERAL_DISC_UNIFORMS)[number]> {
  static readonly ANGLE_1 = 0;
  static readonly ANGLE_2 = (2 * Math.PI) / 3;
  static readonly ANGLE_3 = (4 * Math.PI) / 3;

  drawLabel = drawSemanticaNodeLabel;

  drawHover = drawSemanticaNodeHover;

  getDefinition() {
    return {
      VERTICES: 3,
      VERTEX_SHADER_SOURCE: MINERAL_DISC_VERTEX_SHADER,
      FRAGMENT_SHADER_SOURCE: MINERAL_DISC_FRAGMENT_SHADER,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS: MINERAL_DISC_UNIFORMS,
      ATTRIBUTES: [
        { name: "a_position", size: 2, type: WebGLRenderingContext.FLOAT },
        { name: "a_size", size: 1, type: WebGLRenderingContext.FLOAT },
        { name: "a_coreColor", size: 4, type: WebGLRenderingContext.UNSIGNED_BYTE, normalized: true },
        { name: "a_shellColor", size: 4, type: WebGLRenderingContext.UNSIGNED_BYTE, normalized: true },
        { name: "a_ringColor", size: 4, type: WebGLRenderingContext.UNSIGNED_BYTE, normalized: true },
        { name: "a_ringSize", size: 1, type: WebGLRenderingContext.FLOAT },
        { name: "a_coreScale", size: 1, type: WebGLRenderingContext.FLOAT },
        { name: "a_id", size: 4, type: WebGLRenderingContext.UNSIGNED_BYTE, normalized: true },
      ],
      CONSTANT_ATTRIBUTES: [
        { name: "a_angle", size: 1, type: WebGLRenderingContext.FLOAT },
      ],
      CONSTANT_DATA: [
        [MineralDiscNodeProgram.ANGLE_1],
        [MineralDiscNodeProgram.ANGLE_2],
        [MineralDiscNodeProgram.ANGLE_3],
      ],
    };
  }

  processVisibleItem(nodeIndex: number, startIndex: number, data: NodeDisplayData & SemanticaNodeDrawData): void {
    const array = this.array;
    const ringColor = resolveAccentBorderColor(data.ringSize, data.ringColor, data.borderColor, GRAPH_THEME.nodes.selectedRing.color);

    array[startIndex++] = data.x;
    array[startIndex++] = data.y;
    array[startIndex++] = data.size;
    array[startIndex++] = floatColor(data.color || GRAPH_THEME.palette.overview.nodeCore);
    array[startIndex++] = floatColor(data.shellColor || withAlpha(GRAPH_THEME.palette.overview.nodeBase, GRAPH_THEME.palette.overview.nodeShellAlpha));
    array[startIndex++] = floatColor(ringColor);
    array[startIndex++] = data.ringSize || 0;
    array[startIndex++] = data.coreScale ?? 0.22;
    array[startIndex++] = nodeIndex;
  }

  setUniforms(params: RenderParams, { gl, uniformLocations }: ProgramInfo<(typeof MINERAL_DISC_UNIFORMS)[number]>): void {
    gl.uniform1f(uniformLocations.u_correctionRatio, params.correctionRatio);
    gl.uniform1f(uniformLocations.u_sizeRatio, params.sizeRatio);
    gl.uniformMatrix3fv(uniformLocations.u_matrix, false, params.matrix);
  }
}

function resolveAccentBorderColor(
  ringSize: number | undefined,
  ringColor: string | undefined,
  borderColor: string | undefined,
  fallbackColor: string,
) {
  if (typeof ringSize === "number" && ringSize > 0 && ringColor) {
    return ringColor;
  }

  return borderColor || fallbackColor;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const clampedRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  context.beginPath();
  context.moveTo(x + clampedRadius, y);
  context.lineTo(x + width - clampedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + clampedRadius);
  context.lineTo(x + width, y + height - clampedRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - clampedRadius, y + height);
  context.lineTo(x + clampedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - clampedRadius);
  context.lineTo(x, y + clampedRadius);
  context.quadraticCurveTo(x, y, x + clampedRadius, y);
  context.closePath();
}

export const drawSemanticaNodeLabel: NodeLabelDrawingFunction = (context, rawData) => {
  const data = rawData as typeof rawData & SemanticaNodeDrawData;
  if (!data.label) {
    return;
  }

  const chipTheme = GRAPH_THEME.labels.chip;
  const fontSize = Math.max(
    chipTheme.fontSize,
    Math.min(chipTheme.maxFontSize, data.size * chipTheme.sizeScale),
  );
  const font = `${chipTheme.fontWeight} ${fontSize}px ${chipTheme.fontFamily}`;
  const paddingX = chipTheme.paddingX;
  const paddingY = chipTheme.paddingY;
  const borderColor = resolveAccentBorderColor(data.ringSize, data.ringColor, data.borderColor, chipTheme.borderColor);

  context.save();
  context.font = font;
  context.textBaseline = "middle";
  const metrics = context.measureText(data.label);
  const width = metrics.width + paddingX * 2;
  const height = fontSize + paddingY * 2;
  const x = data.x + Math.max(data.size * 0.7, chipTheme.offsetX);
  const y = data.y - Math.max(data.size * 0.9, chipTheme.offsetY) - height;

  context.shadowColor = withAlpha(chipTheme.shadowColor, chipTheme.shadowAlpha);
  context.shadowBlur = chipTheme.shadowBlur;
  context.fillStyle = chipTheme.background;
  drawRoundedRect(context, x, y, width, height, chipTheme.radius);
  context.fill();

  context.shadowBlur = 0;
  context.strokeStyle = withAlpha(borderColor, chipTheme.borderAlpha);
  context.lineWidth = 1;
  drawRoundedRect(context, x, y, width, height, chipTheme.radius);
  context.stroke();

  context.fillStyle = chipTheme.textColor;
  context.fillText(data.label, x + paddingX, y + height / 2);
  context.restore();
};

export const drawSemanticaNodeHover: NodeHoverDrawingFunction = (context, rawData) => {
  const data = rawData as typeof rawData & SemanticaNodeDrawData;
  if (!data.label) {
    return;
  }

  const hoverTheme = GRAPH_THEME.labels.hoverCard;
  const borderColor = resolveAccentBorderColor(data.ringSize, data.ringColor, data.borderColor, hoverTheme.borderColor);
  const metaLabel = (typeof data.nodeType === "string" && data.nodeType.trim().length > 0)
    ? data.nodeType.replaceAll("_", " ").toUpperCase()
    : "NODE";

  context.save();
  context.textBaseline = "top";

  const titleFont = `${hoverTheme.titleWeight} ${hoverTheme.titleSize}px ${hoverTheme.fontFamily}`;
  const metaFont = `${hoverTheme.metaWeight} ${hoverTheme.metaSize}px ${hoverTheme.fontFamily}`;
  context.font = titleFont;
  const titleWidth = context.measureText(data.label).width;
  context.font = metaFont;
  const metaWidth = context.measureText(metaLabel).width;

  const width = Math.max(titleWidth, metaWidth) + hoverTheme.paddingX * 2;
  const height = hoverTheme.paddingY * 2 + hoverTheme.titleSize + hoverTheme.metaGap + hoverTheme.metaSize;
  const x = data.x + Math.max(data.size * 0.9, hoverTheme.offsetX);
  const y = data.y - Math.max(data.size * 1.1, hoverTheme.offsetY) - height;

  context.shadowColor = withAlpha(hoverTheme.shadowColor, hoverTheme.shadowAlpha);
  context.shadowBlur = hoverTheme.shadowBlur;
  context.fillStyle = hoverTheme.background;
  drawRoundedRect(context, x, y, width, height, hoverTheme.radius);
  context.fill();

  context.shadowBlur = 0;
  context.strokeStyle = withAlpha(borderColor, hoverTheme.borderAlpha);
  context.lineWidth = 1.2;
  drawRoundedRect(context, x, y, width, height, hoverTheme.radius);
  context.stroke();

  context.fillStyle = hoverTheme.textColor;
  context.font = titleFont;
  context.fillText(data.label, x + hoverTheme.paddingX, y + hoverTheme.paddingY);

  context.fillStyle = hoverTheme.metaColor;
  context.font = metaFont;
  context.fillText(
    metaLabel,
    x + hoverTheme.paddingX,
    y + hoverTheme.paddingY + hoverTheme.titleSize + hoverTheme.metaGap,
  );

  context.restore();
};

export const SEMANTICA_NODE_PROGRAM_CLASSES = {
  ...DEFAULT_NODE_PROGRAM_CLASSES,
  circle: MineralDiscNodeProgram,
};

export const SEMANTICA_EDGE_PROGRAM_CLASSES = {
  ...DEFAULT_EDGE_PROGRAM_CLASSES,
  curve: EdgeCurveProgram,
  curvedArrow: EdgeCurvedArrowProgram,
};
