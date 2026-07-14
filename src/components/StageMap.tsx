'use client';

import { useRef } from 'react';
import {
  initials,
  POI_META,
  type Blueprint,
  type User,
} from '@/lib/types';

export interface MapMarker {
  user: User;
  x: number;
  y: number;
  mine?: boolean;
}

/**
 * Schematischer Bühnen-Blueprint als SVG (Koordinatensystem 0..100).
 * Zeigt Bühnenelemente, POIs und die X-Markierungen der Crew.
 */
export function StageMap({
  blueprint,
  stageColor,
  markers = [],
  onTap,
  onPoiTap,
  className = '',
}: {
  blueprint: Blueprint;
  stageColor: string;
  markers?: MapMarker[];
  onTap?: (x: number, y: number) => void;
  onPoiTap?: (poiId: string) => void;
  className?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTap || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onTap(Math.min(100, Math.max(0, x)), Math.min(100, Math.max(0, y)));
  };

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 100 100"
      className={`aspect-square w-full touch-none rounded-xl border border-rivet bg-[#101016] ${className}`}
      onPointerDown={handlePointer}
    >
      {/* Bodenraster */}
      <defs>
        <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#1d1d26" strokeWidth="0.3" />
        </pattern>
        <linearGradient id="stageMetal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a3a48" />
          <stop offset="100%" stopColor="#22222c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="url(#grid)" />

      {/* Bühnen-Elemente */}
      {blueprint.elements.map((el, i) => {
        switch (el.type) {
          case 'stage':
            return (
              <g key={i}>
                <rect
                  x={el.x} y={el.y} width={el.w} height={el.h}
                  rx="1.5" fill="url(#stageMetal)"
                  stroke={stageColor} strokeWidth="0.8"
                />
                <text
                  x={el.x + el.w / 2} y={el.y + el.h / 2 + 1.8}
                  textAnchor="middle" fontSize="4.2" fontWeight="900"
                  fill={stageColor} style={{ letterSpacing: 0.8 }}
                >
                  {blueprint.stageLabel}
                </text>
              </g>
            );
          case 'tent':
            return (
              <rect
                key={i} x={el.x} y={el.y} width={el.w} height={el.h}
                rx="4" fill="#15151c" stroke="#3a3a48"
                strokeWidth="0.6" strokeDasharray="2 1.4"
              />
            );
          case 'barrier':
            return (
              <rect
                key={i} x={el.x} y={el.y} width={el.w} height={el.h}
                fill="#4a4a58"
              />
            );
          case 'foh':
            return (
              <g key={i}>
                <rect
                  x={el.x} y={el.y} width={el.w} height={el.h}
                  fill="#22222c" stroke="#4a4a58" strokeWidth="0.5"
                />
                <text
                  x={el.x + el.w / 2} y={el.y + el.h / 2 + 1.4}
                  textAnchor="middle" fontSize="2.6" fill="#9a9aa8"
                >
                  {el.label ?? 'FOH'}
                </text>
              </g>
            );
        }
      })}

      {/* Points of Interest */}
      {blueprint.pois.map((poi) => {
        const meta = POI_META[poi.type];
        return (
          <g
            key={poi.id}
            onPointerDown={(e) => {
              if (onPoiTap) {
                e.stopPropagation();
                onPoiTap(poi.id);
              }
            }}
          >
            <circle
              cx={poi.x} cy={poi.y} r="3.4"
              fill="#15151c" stroke={meta.color} strokeWidth="0.6"
            />
            <text x={poi.x} y={poi.y + 1.5} textAnchor="middle" fontSize="3.6">
              {meta.icon}
            </text>
            <text
              x={poi.x} y={poi.y + 6.6} textAnchor="middle"
              fontSize="2.4" fill="#9a9aa8"
            >
              {poi.label}
            </text>
          </g>
        );
      })}

      {/* X-Markierungen der Crew */}
      {markers.map((m) => {
        const s = m.mine ? 3.2 : 2.4;
        return (
          <g key={m.user.id} pointerEvents="none">
            <line
              x1={m.x - s} y1={m.y - s} x2={m.x + s} y2={m.y + s}
              stroke="#0b0b0f" strokeWidth={m.mine ? 2.2 : 1.8} strokeLinecap="round"
            />
            <line
              x1={m.x - s} y1={m.y + s} x2={m.x + s} y2={m.y - s}
              stroke="#0b0b0f" strokeWidth={m.mine ? 2.2 : 1.8} strokeLinecap="round"
            />
            <line
              x1={m.x - s} y1={m.y - s} x2={m.x + s} y2={m.y + s}
              stroke={m.user.color} strokeWidth={m.mine ? 1.4 : 1} strokeLinecap="round"
            />
            <line
              x1={m.x - s} y1={m.y + s} x2={m.x + s} y2={m.y - s}
              stroke={m.user.color} strokeWidth={m.mine ? 1.4 : 1} strokeLinecap="round"
            />
            <text
              x={m.x} y={m.y - s - 1.2} textAnchor="middle"
              fontSize={m.mine ? 3 : 2.4} fontWeight="bold" fill={m.user.color}
              stroke="#0b0b0f" strokeWidth="0.35" paintOrder="stroke"
            >
              {initials(m.user.name)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
