import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useMousePosition } from '../hooks/useMousePosition';
import * as THREE from 'three';

export const LiquidGlassSphere: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  const mouse = useMousePosition(16);

  // Custom shader material for liquid glass effect
  const shaderMaterial = React.useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
        uColor1: { value: new THREE.Color('#17C3AE') },
        uColor2: { value: new THREE.Color('#FBBF24') },
        uFresnelPower: { value: 2.5 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        uniform float uTime;
        uniform vec2 uMouse;

        // 3D Simplex Noise
        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

          vec3 i  = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);

          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);

          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;

          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));

          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;

          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);

          vec4 x = x_ *ns.x + ns.yyyy;
          vec4 y = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x) - abs(y);

          vec4 b0 = vec4(x.xy, y.xy);
          vec4 b1 = vec4(x.zw, y.zw);

          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));

          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;

          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);

          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;

          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);

          // Distort position with noise
          vec3 pos = position;
          float noise = snoise(pos * 1.5 + uTime * 0.3);
          noise += snoise(pos * 3.0 - uTime * 0.2) * 0.5;

          // Mouse influence
          vec3 mouseInfluence = vec3(uMouse.x, uMouse.y, 0.0) * 0.1;
          pos += normal * noise * 0.15;
          pos += mouseInfluence * (1.0 - length(pos) * 0.2);

          vPosition = pos;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUv;

        uniform float uTime;
        uniform vec2 uMouse;
        uniform vec3 uColor1;
        uniform vec3 uColor2;
        uniform float uFresnelPower;

        void main() {
          // Fresnel effect
          vec3 viewDirection = normalize(cameraPosition - vPosition);
          float fresnel = pow(1.0 - dot(viewDirection, vNormal), uFresnelPower);

          // Iridescent color shift
          float colorShift = sin(vPosition.x * 3.0 + vPosition.y * 2.0 + uTime * 0.5) * 0.5 + 0.5;
          vec3 color = mix(uColor1, uColor2, colorShift);

          // Glass refraction simulation
          float refraction = fresnel * 0.8;
          color = mix(color, vec3(1.0), refraction * 0.3);

          // Edge glow
          float edge = smoothstep(0.0, 0.5, fresnel);
          color += edge * uColor2 * 0.6;

          // Mouse proximity glow
          vec2 mousePos = uMouse * 2.0;
          float distToMouse = length(vUv - mousePos);
          float mouseGlow = smoothstep(1.0, 0.0, distToMouse);
          color += mouseGlow * uColor2 * 0.4;

          // Final alpha
          float alpha = 0.7 + fresnel * 0.3;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();
    shaderMaterial.uniforms.uTime.value = time;
    shaderMaterial.uniforms.uMouse.value.set(mouse.normalizedX, mouse.normalizedY);

    // Gentle rotation
    meshRef.current.rotation.x = Math.sin(time * 0.2) * 0.1;
    meshRef.current.rotation.y = time * 0.15;
    meshRef.current.rotation.z = Math.cos(time * 0.15) * 0.05;
  });

  return (
    <mesh ref={meshRef} material={shaderMaterial}>
      <icosahedronGeometry args={[1.2, 32]} />
    </mesh>
  );
};
