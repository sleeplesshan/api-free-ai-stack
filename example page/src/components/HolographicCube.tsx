import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function HolographicCube() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 0.45, 5.4);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const cubeGroup = new THREE.Group();
    scene.add(cubeGroup);

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x7fee64,
      transparent: true,
      opacity: 0.18,
      roughness: 0.08,
      metalness: 0.05,
      transmission: 0.72,
      thickness: 1.2,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      side: THREE.DoubleSide
    });

    const cube = new THREE.Mesh(new THREE.BoxGeometry(2.05, 2.05, 2.05), glassMaterial);
    cubeGroup.add(cube);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x7fee64,
      transparent: true,
      opacity: 0.72
    });
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), edgeMaterial);
    cubeGroup.add(edges);

    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.48, 2),
      new THREE.MeshBasicMaterial({ color: 0xc8f9b6, transparent: true, opacity: 0.95 })
    );
    cubeGroup.add(inner);

    const innerLight = new THREE.PointLight(0x7fee64, 8.5, 8);
    innerLight.position.set(0.25, 0.1, 0.3);
    cubeGroup.add(innerLight);

    scene.add(new THREE.AmbientLight(0xddffdc, 0.28));
    const rimLight = new THREE.PointLight(0xddffdc, 2.2, 12);
    rimLight.position.set(-3, 2.8, 3.4);
    scene.add(rimLight);

    const particleCount = 900;
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i += 1) {
      const radius = 1.7 + Math.random() * 3.1;
      const angle = Math.random() * Math.PI * 2;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4.1;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speeds[i] = 0.25 + Math.random() * 0.8;
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: 0x7fee64,
      size: 0.025,
      transparent: true,
      opacity: 0.46,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    const grid = new THREE.GridHelper(7, 28, 0x485346, 0x212525);
    grid.position.y = -1.55;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    scene.add(grid);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      const t = clock.getElapsedTime();
      cubeGroup.rotation.x = Math.sin(t * 0.42) * 0.18 + 0.55;
      cubeGroup.rotation.y = t * 0.22 + 0.8;
      cubeGroup.rotation.z = Math.sin(t * 0.23) * 0.08;
      inner.scale.setScalar(1 + Math.sin(t * 2.2) * 0.08);
      particles.rotation.y = t * 0.03;
      particles.rotation.x = Math.sin(t * 0.1) * 0.05;

      const attrs = particleGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < particleCount; i += 1) {
        const y = attrs.getY(i) + speeds[i] * 0.0025;
        attrs.setY(i, y > 2.1 ? -2.1 : y);
      }
      attrs.needsUpdate = true;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      particleGeometry.dispose();
      particleMaterial.dispose();
      glassMaterial.dispose();
      edgeMaterial.dispose();
    };
  }, []);

  return <div className="cube-stage" ref={mountRef} aria-hidden="true" />;
}
