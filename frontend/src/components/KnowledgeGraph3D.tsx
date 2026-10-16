import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SosCheatSheetModal } from './SosCheatSheetModal';
import { TargetedQuizModal } from './TargetedQuizModal';
import { Flame, Zap, X } from 'lucide-react';
import type { WeakTopic } from '../lib/types';

interface TopicNodeData {
  id: string;
  name: string;
  subject: string;
  masteryLevel: number;
  frequency: number;
  isResolved: boolean;
  status: 'mastered' | 'in_progress' | 'critical';
  position: THREE.Vector3;
}

interface KnowledgeGraph3DProps {
  weakTopics?: WeakTopic[];
  onTopicTested?: () => void;
}

export const KnowledgeGraph3D: React.FC<KnowledgeGraph3DProps> = ({
  weakTopics = [],
  onTopicTested,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTopic, setSelectedTopic] = useState<TopicNodeData | null>(null);
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isQuizOpen, setIsQuizOpen] = useState(false);

  // Список тем по умолчанию, если weakTopics пуст
  const defaultTopicsList: Array<{ name: string; subject: string; mastery: number; freq: number }> = [
    { name: 'Тригонометрические уравнения', subject: 'Профильная математика', mastery: 0.85, freq: 1 },
    { name: 'Логарифмические неравенства', subject: 'Профильная математика', mastery: 0.45, freq: 2 },
    { name: 'Стереометрия: сечения многогранников', subject: 'Профильная математика', mastery: 0.2, freq: 3 },
    { name: 'Производная и первообразная', subject: 'Профильная математика', mastery: 0.9, freq: 1 },
    { name: 'Планиметрия: вписанные окружности', subject: 'Профильная математика', mastery: 0.5, freq: 2 },
    { name: 'Задачи с экономическим содержанием', subject: 'Профильная математика', mastery: 0.78, freq: 1 },
    { name: 'Уравнения с параметром (графика)', subject: 'Профильная математика', mastery: 0.15, freq: 4 },
    { name: 'Теория чисел и делимость', subject: 'Профильная математика', mastery: 0.3, freq: 3 },
    { name: 'Векторный метод в пространстве', subject: 'Профильная математика', mastery: 0.7, freq: 1 },
    { name: 'Вероятность сложных событий', subject: 'Профильная математика', mastery: 0.88, freq: 1 },
  ];

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Очистка старых canvas
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = container.clientHeight || 550;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x09090b, 0.04);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(0, 0, 16);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Освещение
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0xccff00, 2.5, 50);
    pointLight.position.set(0, 10, 15);
    scene.add(pointLight);

    const redLight = new THREE.PointLight(0xef4444, 1.8, 30);
    redLight.position.set(-10, -5, 5);
    scene.add(redLight);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    // Подготовка данных узлов
    const nodesData: TopicNodeData[] = [];
    const sourceTopics =
      weakTopics.length > 0
        ? weakTopics.map((w) => ({
            name: w.topicName,
            subject: w.subject,
            mastery: w.masteryLevel ?? 0.2,
            freq: w.frequency ?? 1,
            isResolved: w.isResolved,
          }))
        : defaultTopicsList.map((d) => ({
            name: d.name,
            subject: d.subject,
            mastery: d.mastery,
            freq: d.freq,
            isResolved: d.mastery >= 0.75,
          }));

    const totalNodes = sourceTopics.length;
    const sphereMeshes: THREE.Mesh[] = [];
    const criticalMeshes: THREE.Mesh[] = [];

    // Расположение узлов в 3D пространстве в виде сферического графа
    sourceTopics.forEach((topic, idx) => {
      const phi = Math.acos(-1 + (2 * idx) / totalNodes);
      const theta = Math.sqrt(totalNodes * Math.PI) * phi;
      const radius = 6.0 + (idx % 2 === 0 ? 0.8 : -0.8);

      const x = radius * Math.cos(theta) * Math.sin(phi);
      const y = radius * Math.sin(theta) * Math.sin(phi);
      const z = radius * Math.cos(phi);

      const mastery = topic.mastery;
      let status: 'mastered' | 'in_progress' | 'critical' = 'in_progress';
      let nodeColor = 0xfacc15; // желтый (35-74%)

      // Четкая градация по masteryLevel:
      // >= 75% -> зеленый (#CCFF00)
      // 35-74% -> желтый (#FACC15)
      // < 35% -> красный (#EF4444)
      if (mastery >= 0.75) {
        status = 'mastered';
        nodeColor = 0xccff00;
      } else if (mastery >= 0.35) {
        status = 'in_progress';
        nodeColor = 0xfacc15;
      } else {
        status = 'critical';
        nodeColor = 0xef4444;
      }

      const nodeData: TopicNodeData = {
        id: `node_${idx}`,
        name: topic.name,
        subject: topic.subject,
        masteryLevel: mastery,
        frequency: topic.freq,
        isResolved: topic.isResolved,
        status,
        position: new THREE.Vector3(x, y, z),
      };
      nodesData.push(nodeData);

      // Аккуратные радиусы сфер (уменьшены на 15-20% для устранения каши и перекрытий)
      const sphereRadius = status === 'critical' ? 0.58 : status === 'mastered' ? 0.52 : 0.46;
      const geometry = new THREE.SphereGeometry(sphereRadius, 32, 32);
      const material = new THREE.MeshStandardMaterial({
        color: nodeColor,
        emissive: nodeColor,
        emissiveIntensity: status === 'critical' ? 0.6 : 0.35,
        roughness: 0.2,
        metalness: 0.8,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.userData = { nodeData };
      rootGroup.add(mesh);
      sphereMeshes.push(mesh);

      if (status === 'critical') {
        criticalMeshes.push(mesh);
      }
    });

    // Ребра графа (связи между соседними узлами)
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xccff00,
      transparent: true,
      opacity: 0.18,
    });

    const linePoints: THREE.Vector3[] = [];
    for (let i = 0; i < nodesData.length; i++) {
      for (let j = i + 1; j < nodesData.length; j++) {
        const dist = nodesData[i].position.distanceTo(nodesData[j].position);
        if (dist < 6.8) {
          linePoints.push(nodesData[i].position);
          linePoints.push(nodesData[j].position);
        }
      }
    }

    if (linePoints.length > 0) {
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
      rootGroup.add(lines);
    }

    // Вращение, пауза при наведении и интерактивность мыши
    let isDragging = false;
    let isHovered = false;
    let previousMousePosition = { x: 0, y: 0 };
    let dragVelocity = { x: 0, y: 0 };

    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
      container.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

      // Определение наведения курсора на узел для паузы вращения
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(sphereMeshes);
      isHovered = intersects.length > 0;

      if (!isDragging) {
        container.style.cursor = isHovered ? 'pointer' : 'grab';
      }

      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        rootGroup.rotation.y += deltaX * 0.005;
        rootGroup.rotation.x += deltaY * 0.005;

        dragVelocity = { x: deltaY * 0.001, y: deltaX * 0.001 };
        previousMousePosition = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseUp = () => {
      isDragging = false;
      container.style.cursor = isHovered ? 'pointer' : 'grab';
    };

    const onMouseLeave = () => {
      isDragging = false;
      isHovered = false;
      container.style.cursor = 'grab';
    };

    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(sphereMeshes);

      if (intersects.length > 0) {
        const hit = intersects[0].object as THREE.Mesh;
        if (hit.userData?.nodeData) {
          setSelectedTopic(hit.userData.nodeData as TopicNodeData);
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(8, Math.min(26, camera.position.z + e.deltaY * 0.015));
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseLeave);
    container.addEventListener('click', onClick);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Animation Loop: медитативное авто-вращение с Three.js Clock
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      // Авто-вращение графа:
      // Останавливается при зажатии мыши или наведении курсора на сферу узла
      if (!isDragging && !isHovered) {
        rootGroup.rotation.y += delta * 0.04;

        if (Math.abs(dragVelocity.x) > 0.0001 || Math.abs(dragVelocity.y) > 0.0001) {
          rootGroup.rotation.x += dragVelocity.x;
          rootGroup.rotation.y += dragVelocity.y;
          dragVelocity.x *= 0.92;
          dragVelocity.y *= 0.92;
        }
      }

      // Тонкая пульсация критических красных узлов (амплитуда 8%)
      const pulseScale = 1.0 + Math.sin(time * 3) * 0.08;
      criticalMeshes.forEach((mesh) => {
        mesh.scale.set(pulseScale, pulseScale, pulseScale);
      });

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth;
      const newH = container.clientHeight || 550;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('mouseleave', onMouseLeave);
      container.removeEventListener('click', onClick);
      container.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, [weakTopics]);

  return (
    <div className="relative w-full h-[550px] bg-zinc-950/80 border border-white/[0.08] overflow-hidden">
      {/* 3D Canvas Container */}
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* HUD Overlay: Заголовок и легенда */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <span className="font-mono text-[10px] text-[#d4ff00] uppercase tracking-widest block">
          [ 3D_SKILL_TREE // KNOWLEDGE_GRAPH ]
        </span>
        <h3 className="font-display text-lg font-bold text-white uppercase tracking-tight">
          Интерактивный граф знаний
        </h3>
        <p className="text-xs text-zinc-400 font-mono mt-0.5">
          Вращайте граф мышью, кликайте на узлы для запуска тренажеров
        </p>
      </div>

      {/* Легенда цветов */}
      <div className="absolute top-4 right-4 z-10 bg-black/60 backdrop-blur-md p-3 border border-white/[0.08] space-y-1.5 font-mono text-[10px] pointer-events-none">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-none bg-[#ccff00]" />
          <span className="text-zinc-300">Освоено (&ge; 75%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-none bg-amber-400" />
          <span className="text-zinc-300">В процессе (35–74%)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-none bg-rose-500" />
          <span className="text-zinc-300">Критическая зона (&lt; 35%)</span>
        </div>
      </div>

      {/* Выбранный узел (HUD карточка внизу слева) */}
      {selectedTopic && (
        <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-96 z-20 bg-zinc-950/95 backdrop-blur-md border border-[#d4ff00]/40 p-4 shadow-2xl animate-fade-in">
          <div className="flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2.5 mb-3">
            <div>
              <span className="font-mono text-[10px] text-[#d4ff00] uppercase tracking-wider block">
                [ УЗЕЛ СЕТИ: {selectedTopic.subject} ]
              </span>
              <h4 className="font-display font-bold text-white text-sm md:text-base leading-snug">
                {selectedTopic.name}
              </h4>
            </div>
            <button
              onClick={() => setSelectedTopic(null)}
              className="text-zinc-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-2 mb-4 text-xs font-mono">
            <div className="flex justify-between text-zinc-400">
              <span>Освоение темы:</span>
              <span
                className={`font-bold ${
                  selectedTopic.masteryLevel >= 0.75
                    ? 'text-[#d4ff00]'
                    : selectedTopic.masteryLevel >= 0.35
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {Math.round(selectedTopic.masteryLevel * 100)}%
              </span>
            </div>
            <div className="w-full bg-zinc-900 h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  selectedTopic.masteryLevel >= 0.75
                    ? 'bg-[#d4ff00]'
                    : selectedTopic.masteryLevel >= 0.35
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
                style={{ width: `${Math.round(selectedTopic.masteryLevel * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-zinc-400 text-[11px]">
              <span>Зафиксировано ошибок:</span>
              <span className="text-white">{selectedTopic.frequency}</span>
            </div>
          </div>

          {/* Кнопки действий: SOS-конспект и Блиц-тест */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setIsSosOpen(true)}
              className="py-2 px-2.5 border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-mono text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <Flame className="w-3.5 h-3.5 text-rose-400" />
              SOS-КОНСПЕКТ
            </button>
            <button
              onClick={() => setIsQuizOpen(true)}
              className="py-2 px-2.5 bg-[#d4ff00] hover:bg-[#b8dd00] text-black font-mono font-bold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              БЛИЦ-ТЕСТ
            </button>
          </div>
        </div>
      )}

      {/* Модалки SOS и Блиц-тренажера */}
      {selectedTopic && (
        <>
          <SosCheatSheetModal
            isOpen={isSosOpen}
            onClose={() => setIsSosOpen(false)}
            subject={selectedTopic.subject}
            topic={selectedTopic.name}
            onSaved={() => {
              if (onTopicTested) onTopicTested();
            }}
          />
          <TargetedQuizModal
            isOpen={isQuizOpen}
            onClose={() => {
              setIsQuizOpen(false);
              if (onTopicTested) onTopicTested();
            }}
            subject={selectedTopic.subject}
            topic={selectedTopic.name}
            initialMastery={selectedTopic.masteryLevel}
            onMasteryUpdated={(newLevel: number) => {
              setSelectedTopic((prev) => (prev ? { ...prev, masteryLevel: newLevel } : null));
              if (onTopicTested) onTopicTested();
            }}
          />
        </>
      )}
    </div>
  );
};

export default KnowledgeGraph3D;
