import { useEffect, useRef, useState } from 'react';
import { pause, seek } from '@remotion/studio';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  AbsoluteFill, OffthreadVideo, Sequence,
  useCurrentFrame, useVideoConfig, interpolate, getRemotionEnvironment,
} from 'remotion';
import scenesData from './scenes.json';
import { clamp, sceneFrame, styleOf } from './editor-model';
import type { CaptionStyle, Scene } from './editor-model';

type Editing = {
  editingId?: string;
  onSelect?: (id: string) => void;
  onChange?: (id: string, patch: Partial<CaptionStyle>) => void;
};
export type VideoProps = Editing & { scenes?: Scene[]; videoSrc?: string };

const savedScenes = (Array.isArray(scenesData) ? scenesData : scenesData.scenes) as Scene[];
const CHANNEL = 'dashboard-studio-v21';
const ORIGINS = new Set(['http://127.0.0.1:3001', 'http://localhost:3001']);
type Snapshot = { scenes: Scene[]; selectedId: string; editing: boolean; locked: boolean };

function useDashboardBridge() {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const parentOrigin = useRef<string | null>(null);
  const send = (data: Record<string, unknown>) => {
    if (parentOrigin.current) window.parent.postMessage({ channel: CHANNEL, ...data }, parentOrigin.current);
  };
  useEffect(() => {
    if (!getRemotionEnvironment().isStudio || window.parent === window) return;
    const instance = crypto.randomUUID();
    const receive = (event: MessageEvent) => {
      if (event.source !== window.parent || !ORIGINS.has(event.origin) || event.data?.channel !== CHANNEL) return;
      parentOrigin.current = event.origin;
      const data = event.data;
      if (data.type === 'HELLO') send({ type: 'READY', instance, fps, durationInFrames });
      if (data.type === 'SNAPSHOT' && Array.isArray(data.scenes)) {
        if (!data.scenes.every((s: Scene) => s && typeof s.text === 'string' &&
          ['string', 'number'].includes(typeof s.id) && Number.isFinite(s.start) && Number.isFinite(s.end))) return;
        setSnapshot({
          scenes: data.scenes, selectedId: String(data.selectedId ?? ''),
          editing: data.editing === true, locked: data.locked === true
        });
      }
      if (data.type === 'SEEK' && Number.isFinite(data.seconds)) {
        const requested = Math.round(data.seconds * fps);
        const target = clamp(requested, 0, durationInFrames - 1);
        pause(); seek(target);
        send({ type: 'SEEKED', requestId: data.requestId, frame: target, clamped: target !== requested });
      }
      if (data.type === 'PAUSE') pause();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [fps, durationInFrames]);
  useEffect(() => { send({ type: 'FRAME', frame }); }, [frame]);
  return { snapshot, send };
}

function Caption({ scene, editingId, onSelect, onChange }: Editing & { scene: Scene }) {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const s = styleOf(scene);
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    pointerId: number; x: number; y: number; scale: number;
    mode: 'move' | 'size'; initial: CaptionStyle;
  } | null>(null);
  const editable = Boolean(onChange);
  const selected = editable && editingId === String(scene.id);
  // The selected caption stays fully visible while positioning it.
  // Play mode and MP4 use the same frame-based animation below.
  const ramp = Math.max(1, Math.min(Math.round(fps * 0.2), Math.floor(durationInFrames / 2)));
  const progress = selected ? 1 : interpolate(frame, [0, ramp], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const alpha = s.effect === 'fade' || s.effect === 'slide' ? progress : 1;
  const zoom = s.effect === 'pop' ? 0.82 + 0.18 * progress : 1;
  const offset = s.effect === 'slide' ? 45 * (1 - progress) : 0;
  const hex = s.backgroundColor;
  const background = `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${s.backgroundOpacity})`;

  function begin(event: ReactPointerEvent<HTMLDivElement>, mode: 'move' | 'size') {
    if (!editable || event.button !== 0 || !layer.current) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect?.(String(scene.id));
    const scale = layer.current.getBoundingClientRect().width / width;
    if (!scale) return;
    drag.current = {
      pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      scale, mode, initial: s
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || event.pointerId !== d.pointerId) return;
    const dx = (event.clientX - d.x) / d.scale;
    const dy = (event.clientY - d.y) / d.scale;
    onChange?.(String(scene.id), d.mode === 'size'
      ? { fontSize: Math.round(clamp(d.initial.fontSize + dx / 4, 16, 160)) }
      : {
        positionX: +clamp(d.initial.positionX + dx / width * 100, 0, 100).toFixed(2),
        positionY: Math.round(clamp(d.initial.positionY - dy, 0, height - 40))
      });
  }

  function end(event: ReactPointerEvent<HTMLDivElement>) {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return <AbsoluteFill ref={layer} style={{ pointerEvents: 'none' }}>
    <div style={{
      position: 'absolute', left: `${s.positionX}%`, bottom: s.positionY,
      width: `${s.maxWidth}%`, transform: 'translateX(-50%)', textAlign: 'center'
    }}>
      <div
        data-caption-id={String(scene.id)}
        onPointerDown={(event) => begin(event, 'move')}
        onPointerMove={move} onPointerUp={end} onPointerCancel={end}
        onLostPointerCapture={() => { drag.current = null; }}
        style={{
          display: 'inline-block', position: 'relative', maxWidth: '100%',
          boxSizing: 'border-box', padding: '16px 24px', borderRadius: 16,
          fontFamily: `${s.fontFamily}, sans-serif`, fontSize: s.fontSize,
          fontWeight: s.fontWeight, color: s.color, backgroundColor: background,
          lineHeight: 1.35, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          WebkitTextStroke: `${s.strokeWidth}px ${s.strokeColor}`, paintOrder: 'stroke fill',
          textShadow: '0 2px 6px rgba(0,0,0,.8)', opacity: alpha,
          transform: `translateY(${offset}px) scale(${zoom})`,
          outline: selected ? '4px solid #38bdf8' : undefined,
          pointerEvents: editable ? 'auto' : 'none',
          cursor: editable ? 'move' : 'default', touchAction: 'none', userSelect: 'none'
        }}>
        {scene.text || (selected ? 'Nhập lời thoại…' : '')}
        {selected && <div data-resize-handle title="Kéo ngang để đổi cỡ chữ"
          onPointerDown={(event) => begin(event, 'size')}
          onPointerMove={move} onPointerUp={end} onPointerCancel={end}
          style={{
            position: 'absolute', right: -16, bottom: -16, width: 32, height: 32,
            background: '#38bdf8', border: '3px solid white', borderRadius: 5,
            cursor: 'ew-resize', touchAction: 'none'
          }} />}
      </div>
    </div>
  </AbsoluteFill>;
}

export const MyComposition = ({ scenes = savedScenes, videoSrc,
  editingId, onSelect, onChange }: VideoProps) => {
  const { fps, durationInFrames } = useVideoConfig();
  const { snapshot, send } = useDashboardBridge();
  const studio = getRemotionEnvironment().isStudio;
  const list = studio && snapshot ? snapshot.scenes : scenes;
  const editing = studio && snapshot?.editing && !snapshot.locked;
  const selected = editing ? snapshot.selectedId : editingId;
  const select = editing ? (id: string) => { pause(); send({ type: 'SELECT', id }); } : onSelect;
  const change = editing ? (id: string, patch: Partial<CaptionStyle>) => send({ type: 'PATCH', id, patch }) : onChange;
  return <AbsoluteFill
    style={{
      backgroundColor: '#000'
    }}
  >
    {videoSrc ? (
      <Sequence
        name="Video nguồn / Âm thanh"
        from={0}
        durationInFrames={durationInFrames}
        premountFor={fps}
      >
        <OffthreadVideo
          key={videoSrc}
          name="Video nguồn"
          showInTimeline
          src={videoSrc}
          volume={1}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </Sequence>
    ) : null}
    {list.map((scene) => {
      const from = sceneFrame(scene, fps);
      const duration = Math.round(scene.end * fps) - from;
      if (duration <= 0) return null;
      return <Sequence key={scene.id} name={`Phụ đề ${scene.id}`} from={from}
        durationInFrames={duration} premountFor={fps}>
        <Caption scene={scene} editingId={selected} onSelect={select} onChange={change} />
      </Sequence>;
    })}
  </AbsoluteFill>;
};