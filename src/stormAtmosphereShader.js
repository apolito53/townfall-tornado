import * as THREE from 'three';

// Full-screen storm grading pass. It keeps the low-poly geometry intact while adding
// footage-like atmosphere: humidity, top-cloud shadow, mild grain, and lightning wash.
export const StormAtmosphereShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    intensity: { value: 0 },
    lightning: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float intensity;
    uniform float lightning;
    uniform vec2 resolution;

    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float softNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec3 color = base.rgb;

      float storm = clamp(intensity, 0.0, 1.0);
      float skyMask = smoothstep(0.48, 0.92, vUv.y);
      float groundMask = smoothstep(0.42, 0.02, vUv.y);
      float horizonMist = smoothstep(0.16, 0.44, vUv.y) * smoothstep(0.74, 0.5, vUv.y);
      float cloudNoise = softNoise(vec2(vUv.x * 5.0 + time * 0.025, vUv.y * 8.0 - time * 0.02));

      // Cool/desaturate the whole frame, then pull the sky darker like a real storm shelf.
      float luma = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(color, vec3(luma), 0.08 + storm * 0.13);
      color *= vec3(0.94, 0.99, 0.97);
      color *= 1.0 - skyMask * (0.09 + storm * 0.1 + cloudNoise * 0.025);

      // Humid horizon haze: not fog everywhere, just that milky band under the base.
      vec3 mistColor = vec3(0.62, 0.68, 0.64);
      color = mix(color, mistColor, horizonMist * (0.1 + storm * 0.12) * (0.82 + cloudNoise * 0.35));

      // Damp ground contrast keeps roads and damage readable after the storm grade.
      color = mix(color, color * vec3(0.9, 0.97, 0.9), groundMask * (0.035 + storm * 0.035));

      // Very faint rain streaks. They should register as motion/texture, not UI noise.
      float rainPhase = (vUv.x * 42.0 + vUv.y * 72.0 - time * (7.0 + storm * 5.0));
      float rainLine = smoothstep(0.986, 1.0, fract(rainPhase));
      float rainBreakup = smoothstep(0.58, 1.0, hash(floor(vec2(rainPhase, vUv.y * 32.0))));
      color += vec3(0.08, 0.1, 0.1) * rainLine * rainBreakup * (0.018 + storm * 0.022) * (0.45 + skyMask);

      // Lightning is a short-lived blue-white exposure lift, strongest in the storm deck.
      vec3 lightningColor = vec3(0.72, 0.86, 1.0);
      color += lightningColor * lightning * (0.09 + skyMask * 0.24 + horizonMist * 0.09);

      // Footage-like grading: a little contrast, edge falloff, and fine grain.
      color = (color - 0.5) * (1.06 + storm * 0.04) + 0.5;
      float vignette = smoothstep(0.42, 0.86, distance(vUv, vec2(0.5)));
      color *= 1.0 - vignette * (0.12 + storm * 0.045);

      float grain = hash(vUv * resolution.xy + time * 60.0) - 0.5;
      color += grain * (0.006 + storm * 0.004);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), base.a);
    }
  `,
};
