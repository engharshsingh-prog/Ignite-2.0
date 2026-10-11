import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ThreeBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#171b18', 0.055);

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 80);
    camera.position.set(0, 0.2, 12);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x0d0a1a, 0);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0x7e71ff, 0.7);
    const point = new THREE.PointLight(0xffb347, 1.6, 40, 2);
    point.position.set(8, 4, 7);
    scene.add(ambient, point);

    const group = new THREE.Group();
    scene.add(group);

    const sphereGeo = new THREE.IcosahedronGeometry(1.45, 1);
    const sphereMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#7b61ff'),
      metalness: 0.18,
      roughness: 0.26,
      transparent: true,
      opacity: 0.9,
    });
    const core = new THREE.Mesh(sphereGeo, sphereMat);
    group.add(core);

    const ringGeo = new THREE.TorusGeometry(2.6, 0.08, 16, 140);
    const ringMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f4a340'), metalness: 0.25, roughness: 0.34 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI * 0.32;
    ring.rotation.y = Math.PI * 0.2;
    group.add(ring);

    const starsGeo = new THREE.BufferGeometry();
    const starCount = 420;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i += 1) {
      const i3 = i * 3;
      const radius = 12 + Math.random() * 24;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta) * 0.8;
      positions[i3 + 2] = radius * Math.cos(phi);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({ color: '#b7a8ff', size: 0.05, transparent: true, opacity: 0.7 });
    const stars = new THREE.Points(starsGeo, starsMat);
    scene.add(stars);

    let scrollProgress = 0;
    let scrollTarget = 0;
    const onScroll = () => {
      const maxScrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      scrollTarget = window.scrollY / maxScrollable;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    let isActive = true;
    const onVisibility = () => {
      isActive = !document.hidden;
    };
    document.addEventListener('visibilitychange', onVisibility);

    const mouse = { x: 0, y: 0 };
    const onPointerMove = (event: PointerEvent) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    let raf = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      if (!isActive) return;

      const elapsed = clock.getElapsedTime();
      scrollProgress += (scrollTarget - scrollProgress) * 0.08;
      const targetY = (scrollProgress - 0.5) * 4.5;

      group.rotation.y += 0.0019;
      group.rotation.x = Math.sin(elapsed * 0.45) * 0.2 + mouse.y * 0.15;
      group.position.y += (targetY - group.position.y) * 0.045;

      ring.rotation.z += 0.0028;
      stars.rotation.y += 0.00045;
      stars.rotation.x = mouse.y * 0.08;

      camera.position.x += ((mouse.x * 1.25) - camera.position.x) * 0.035;
      camera.position.y += ((0.2 + -mouse.y * 0.85) - camera.position.y) * 0.035;
      camera.lookAt(0, group.position.y * 0.35, 0);

      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.15));
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibility);

      starsGeo.dispose();
      starsMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      sphereGeo.dispose();
      sphereMat.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mountRef} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />;
}
