/**
 * Copyright (c) 2025, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useEffect, useRef } from "react";

/**
 * Siri-style orb rendered with a WebGL fragment shader: domain-warped fbm
 * noise color fields inside a circular mask. State changes are conveyed by
 * lerping color/energy uniforms each frame, so transitions crossfade
 * continuously instead of snapping.
 *
 * - `energy` scales flow speed and contrast (idle ≈ calm, running ≈ lively).
 * - Honors `prefers-reduced-motion`: renders a single static frame instead
 *   of animating.
 * - Calls `onContextFailed` if a WebGL context can't be created so the parent
 *   can fall back to the CSS orb.
 */

interface ShaderOrbProps {
    colors: [string, string, string];
    energy: number;
    size: number;
    onContextFailed: () => void;
}

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
    const value = parseInt(hex.slice(1), 16);
    return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

const VERTEX_SHADER = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
    v_uv = a_pos;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_energy;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
    );
}

float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        v += a * noise(p);
        p *= 2.02;
        a *= 0.5;
    }
    return v;
}

void main() {
    vec2 uv = v_uv;
    float r = length(uv);
    float t = u_time * (0.18 + 0.55 * u_energy);

    // Domain warp: two fbm fields displace a third for the liquid look.
    vec2 q = vec2(
        fbm(uv * 1.6 + vec2(t * 0.7, -t * 0.5)),
        fbm(uv * 1.6 + vec2(-t * 0.6, t * 0.8))
    );
    float warpStrength = 1.4 + 1.2 * u_energy;
    float f = fbm(uv * 2.2 + warpStrength * q + vec2(t * 0.3, -t * 0.2));

    // Narrow mix bands + a luminance term keep the flow visible even when
    // the palette hues are close (the structure reads as light/dark, not
    // just hue shifts).
    float band = smoothstep(0.3, 0.72, f);
    vec3 col = mix(u_c0, u_c1, band);
    float f2 = fbm(uv * 3.0 - q + vec2(-t * 0.25, t * 0.35));
    col = mix(col, u_c2, smoothstep(0.42, 0.8, f2) * (0.6 + 0.4 * u_energy));
    col *= 0.62 + 0.85 * f;

    // Slight glass highlight (the Gloss overlay adds the main reflection)
    // and gentle spherical shading toward the rim.
    float highlight = pow(max(0.0, 1.0 - length(uv - vec2(-0.38, 0.42))), 2.0);
    col += vec3(1.0) * highlight * 0.18;
    col *= 0.85 + 0.2 * (1.0 - r);

    // Soft rim light so the sphere pops on dark and light themes.
    float rim = smoothstep(0.55, 0.98, r) * smoothstep(1.02, 0.98, r);
    col += mix(u_c1, u_c2, 0.5) * rim * 0.45;

    float mask = smoothstep(1.0, 0.94, r);
    gl_FragColor = vec4(col * mask, mask);
}
`;

function compileProgram(gl: WebGLRenderingContext): WebGLProgram | null {
    const compile = (type: number, source: string): WebGLShader | null => {
        const shader = gl.createShader(type);
        if (!shader) {
            return null;
        }
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("[AgentStatusOrb] shader compile failed:", gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) {
        return null;
    }
    const program = gl.createProgram();
    if (!program) {
        return null;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("[AgentStatusOrb] program link failed:", gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

const LERP_RATE = 4.0;

export function ShaderOrb({ colors, energy, size, onContextFailed }: ShaderOrbProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    /** Target uniform values; the render loop eases toward these. */
    const targetRef = useRef<{ colors: [Rgb, Rgb, Rgb]; energy: number }>({
        colors: [hexToRgb(colors[0]), hexToRgb(colors[1]), hexToRgb(colors[2])],
        energy,
    });
    const failedRef = useRef(false);
    /** Repaints one frame when animation is off (prefers-reduced-motion). */
    const staticRepaintRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        targetRef.current = {
            colors: [hexToRgb(colors[0]), hexToRgb(colors[1]), hexToRgb(colors[2])],
            energy,
        };
        staticRepaintRef.current?.();
    }, [colors[0], colors[1], colors[2], energy]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: true });
        const program = gl ? compileProgram(gl) : null;
        if (!gl || !program) {
            if (!failedRef.current) {
                failedRef.current = true;
                onContextFailed();
            }
            // Program compile failed but the context was created — release it so
            // the fallback path doesn't leak a live WebGL context.
            gl?.getExtension("WEBGL_lose_context")?.loseContext();
            return;
        }

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        gl.viewport(0, 0, canvas.width, canvas.height);

        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const posLocation = gl.getAttribLocation(program, "a_pos");
        gl.enableVertexAttribArray(posLocation);
        gl.vertexAttribPointer(posLocation, 2, gl.FLOAT, false, 0, 0);

        const uTime = gl.getUniformLocation(program, "u_time");
        const uEnergy = gl.getUniformLocation(program, "u_energy");
        const uColors = [
            gl.getUniformLocation(program, "u_c0"),
            gl.getUniformLocation(program, "u_c1"),
            gl.getUniformLocation(program, "u_c2"),
        ];

        gl.clearColor(0, 0, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        const current = {
            colors: targetRef.current.colors.map((c) => [...c] as Rgb) as [Rgb, Rgb, Rgb],
            energy: targetRef.current.energy,
        };

        const draw = (timeSeconds: number) => {
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uTime, timeSeconds);
            gl.uniform1f(uEnergy, current.energy);
            current.colors.forEach((c, i) => gl.uniform3f(uColors[i], c[0], c[1], c[2]));
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        };

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        let rafId = 0;
        let lastMs = performance.now();
        const startMs = lastMs;

        const tick = (nowMs: number) => {
            const dt = Math.min((nowMs - lastMs) / 1000, 0.1);
            lastMs = nowMs;
            // Ease uniforms toward their targets for continuous crossfades.
            const k = 1 - Math.exp(-LERP_RATE * dt);
            const target = targetRef.current;
            current.energy += (target.energy - current.energy) * k;
            for (let i = 0; i < 3; i++) {
                for (let ch = 0; ch < 3; ch++) {
                    current.colors[i][ch] += (target.colors[i][ch] - current.colors[i][ch]) * k;
                }
            }
            draw((nowMs - startMs) / 1000);
            rafId = requestAnimationFrame(tick);
        };

        const renderStatic = () => {
            const target = targetRef.current;
            current.energy = target.energy;
            current.colors = target.colors.map((c) => [...c] as Rgb) as [Rgb, Rgb, Rgb];
            draw(1.7);
        };

        const applyMotionPreference = () => {
            cancelAnimationFrame(rafId);
            if (reducedMotion.matches) {
                renderStatic();
            } else {
                lastMs = performance.now();
                rafId = requestAnimationFrame(tick);
            }
        };

        applyMotionPreference();
        reducedMotion.addEventListener("change", applyMotionPreference);
        staticRepaintRef.current = () => {
            if (reducedMotion.matches) {
                renderStatic();
            }
        };

        return () => {
            cancelAnimationFrame(rafId);
            reducedMotion.removeEventListener("change", applyMotionPreference);
            staticRepaintRef.current = null;
            gl.getExtension("WEBGL_lose_context")?.loseContext();
        };
    }, [size, onContextFailed]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                borderRadius: "50%",
                pointerEvents: "none",
            }}
        />
    );
}
