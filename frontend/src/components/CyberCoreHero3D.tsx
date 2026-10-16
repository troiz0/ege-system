import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export const CyberCoreHero3D: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const isMobile = window.innerWidth < 768;

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.z = isMobile ? 10.5 : 7.2;

    // Видимые границы экрана в мировых единицах — чтобы точки не спавнились за кадром
    const vHeight = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const vWidth = vHeight * camera.aspect;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const graphGroup = new THREE.Group();
    scene.add(graphGroup);

    // Уменьшаем количество и разносим узлы ИЗ ЦЕНТРА К КРАЯМ
    const nodeCount = isMobile ? 32 : 55;
    const nodes: { pos: THREE.Vector3; velocity: THREE.Vector3; isMajor: boolean }[] = [];

    const positions = new Float32Array(nodeCount * 3);
    const colors = new Float32Array(nodeCount * 3);

    const limeColor = new THREE.Color(0xccff00);
    const whiteColor = new THREE.Color(0xdddddd);
    const dimColor = new THREE.Color(0x444444);

    for (let i = 0; i < nodeCount; i++) {
      // Распределение в форме эллиптического кольца / тора вокруг центрального текста
      const angle = (i / nodeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;

      // Выталкиваем радиус наружу, чтобы центр (где текст) оставался пустым!
      // На мобилке облако компактнее под ширину экрана
      const minRadiusX = isMobile ? 1.0 : 3.2;
      const minRadiusY = isMobile ? 2.2 : 2.2;

      const xDist = minRadiusX + Math.random() * 2.2;
      const yDist = minRadiusY + Math.random() * 1.8;

      let x = Math.cos(angle) * xDist;
      const y = Math.sin(angle) * yDist;
      const z = (Math.random() - 0.5) * 2.5;

      // На мобилке держим x в кадре: узлы обрамляют текст по бокам и сверху
      if (isMobile) {
        const xLimit = vWidth * 0.45;
        x = THREE.MathUtils.clamp(x, -xLimit, xLimit);
      }

      const pos = new THREE.Vector3(x, y, z);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.002,
        (Math.random() - 0.5) * 0.002,
        (Math.random() - 0.5) * 0.002
      );

      const isMajor = i % 7 === 0;
      nodes.push({ pos, velocity, isMajor });

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      const c = isMajor ? limeColor : (Math.random() > 0.5 ? whiteColor : dimColor);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    nodeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Аккуратная тонкая светящаяся текстура точки (без гигантских слепящих кругов)
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.25, 'rgba(204,255,0,0.7)');
    gradient.addColorStop(0.6, 'rgba(204,255,0,0.1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const particleTexture = new THREE.CanvasTexture(canvas);

    // Уменьшенный размер точек
    const nodeMat = new THREE.PointsMaterial({
      size: isMobile ? 0.20 : 0.26,
      map: particleTexture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const nodePoints = new THREE.Points(nodeGeo, nodeMat);
    graphGroup.add(nodePoints);

    // Тонкие деликатные линии связей
    const maxDistance = isMobile ? 1.9 : 2.4;
    const maxLines = nodeCount * 6;
    const linePositions = new Float32Array(maxLines * 6);
    const lineColors = new Float32Array(maxLines * 6);

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.18, // Делаем линии ненавязчивыми, полупрозрачными
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
    graphGroup.add(lineSegments);

    let targetX = 0;
    let targetY = 0;

    const handleMove = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((clientY - rect.top) / rect.height) * 2 - 1);
      targetX = x * 0.35;
      targetY = y * 0.35;
    };

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    let animId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      graphGroup.rotation.y = elapsed * 0.05 + targetX * 0.5;
      graphGroup.rotation.x = Math.sin(elapsed * 0.3) * 0.04 + targetY * 0.4;
      graphGroup.position.y = Math.sin(elapsed * 0.6) * 0.08;

      let lineIndex = 0;
      const posAttr = nodeGeo.attributes.position as THREE.BufferAttribute;
      const linePosAttr = lineGeo.attributes.position as THREE.BufferAttribute;
      const lineColorAttr = lineGeo.attributes.color as THREE.BufferAttribute;

      for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];
        node.pos.add(node.velocity);

        // Мягкое удержание кольцевой структуры без проникновения в центр
        const currentDist = Math.sqrt(node.pos.x * node.pos.x + node.pos.y * node.pos.y);
        const minDist = isMobile ? 1.8 : 2.5;
        const maxDist = isMobile ? vWidth * 0.42 : 5.8;

        if (currentDist < minDist || currentDist > maxDist) {
          node.velocity.negate();
        }

        posAttr.setXYZ(i, node.pos.x, node.pos.y, node.pos.z);

        for (let j = i + 1; j < nodeCount; j++) {
          const other = nodes[j];
          const dist = node.pos.distanceTo(other.pos);

          if (dist < maxDistance && lineIndex < maxLines) {
            const alpha = Math.max(0, 1 - dist / maxDistance);

            linePosAttr.setXYZ(lineIndex * 2, node.pos.x, node.pos.y, node.pos.z);
            linePosAttr.setXYZ(lineIndex * 2 + 1, other.pos.x, other.pos.y, other.pos.z);

            const c = node.isMajor || other.isMajor ? limeColor : dimColor;
            lineColorAttr.setXYZ(lineIndex * 2, c.r * alpha, c.g * alpha, c.b * alpha);
            lineColorAttr.setXYZ(lineIndex * 2 + 1, c.r * alpha, c.g * alpha, c.b * alpha);

            lineIndex++;
          }
        }
      }

      posAttr.needsUpdate = true;
      lineGeo.setDrawRange(0, lineIndex * 2);
      linePosAttr.needsUpdate = true;
      lineColorAttr.needsUpdate = true;

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      nodeGeo.dispose();
      nodeMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      particleTexture.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full pointer-events-none [mask-image:none] sm:[mask-image:radial-gradient(ellipse_60%_50%_at_50%_45%,transparent_35%,black_80%)]"
    />
  );
};
export default CyberCoreHero3D;
