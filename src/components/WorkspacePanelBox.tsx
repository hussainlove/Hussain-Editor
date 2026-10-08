import React, { useState } from 'react';
import {
  GripHorizontal,
  ArrowLeft,
  ArrowRight,
  Maximize2,
  Minimize2,
  PictureInPicture2,
  Pin,
  Minus,
} from 'lucide-react';

export interface PanelFloatingGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface WorkspacePanelBoxProps {
  id: string;
  title: string;
  subtitle?: string;
  isFloating: boolean;
  isMaximized: boolean;
  isCollapsed: boolean;
  floatingGeo: PanelFloatingGeometry;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  onToggleFloat: () => void;
  onToggleMaximize: () => void;
  onToggleCollapse: () => void;
  onUpdateFloatingGeo: (next: PanelFloatingGeometry) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const WorkspacePanelBox: React.FC<WorkspacePanelBoxProps> = ({
  title,
  subtitle,
  isFloating,
  isMaximized,
  isCollapsed,
  floatingGeo,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onToggleFloat,
  onToggleMaximize,
  onToggleCollapse,
  onUpdateFloatingGeo,
  className = '',
  style,
  children,
}) => {
  const [zIndex, setZIndex] = useState(40);

  const startDragMove = (e: React.MouseEvent) => {
    if (!isFloating || isMaximized) return;
    e.preventDefault();
    setZIndex(45);
    const startX = e.clientX;
    const startY = e.clientY;
    const initX = floatingGeo.x;
    const initY = floatingGeo.y;

    const onMouseMove = (ev: MouseEvent) => {
      const nextX = Math.max(8, Math.min(window.innerWidth - 120, initX + (ev.clientX - startX)));
      const nextY = Math.max(48, Math.min(window.innerHeight - 80, initY + (ev.clientY - startY)));
      onUpdateFloatingGeo({ ...floatingGeo, x: nextX, y: nextY });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const startDragResize = (
    e: React.MouseEvent,
    dir: 'r' | 'b' | 'br' | 'l'
  ) => {
    if (!isFloating || isMaximized) return;
    e.preventDefault();
    e.stopPropagation();
    setZIndex(45);
    const startX = e.clientX;
    const startY = e.clientY;
    const initGeo = { ...floatingGeo };

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      const next = { ...initGeo };

      if (dir === 'r' || dir === 'br') {
        next.w = Math.max(260, Math.min(window.innerWidth - initGeo.x - 10, initGeo.w + dx));
      }
      if (dir === 'b' || dir === 'br') {
        next.h = Math.max(160, Math.min(window.innerHeight - initGeo.y - 10, initGeo.h + dy));
      }
      if (dir === 'l') {
        const proposedW = Math.max(260, initGeo.w - dx);
        const actualDx = initGeo.w - proposedW;
        next.x = Math.max(8, initGeo.x + actualDx);
        next.w = proposedW;
      }

      onUpdateFloatingGeo(next);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const computedStyle: React.CSSProperties = isMaximized
    ? {
        position: 'fixed',
        top: 48,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 48,
      }
    : isFloating
    ? {
        position: 'fixed',
        left: `${floatingGeo.x}px`,
        top: `${floatingGeo.y}px`,
        width: `${floatingGeo.w}px`,
        height: isCollapsed ? '32px' : `${floatingGeo.h}px`,
        zIndex,
      }
    : {
        ...style,
      };

  return (
    <section
      style={computedStyle}
      onMouseDown={() => {
        if (isFloating) setZIndex(45);
      }}
      className={`flex flex-col bg-[#0F172A] border border-slate-800/90 overflow-hidden transition-shadow ${
        isFloating ? 'rounded-lg shadow-2xl ring-1 ring-sky-500/40' : ''
      } ${className}`}
    >
      {/* Interactive Panel Header Bar (Move / Float / Resize / Collapse Controls) */}
      <div
        onMouseDown={startDragMove}
        className={`h-7 px-2.5 bg-[#090D16] border-b border-slate-800/90 flex items-center justify-between select-none shrink-0 ${
          isFloating && !isMaximized ? 'cursor-move bg-slate-900' : ''
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripHorizontal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-200 truncate">{title}</span>
          {subtitle && (
            <span className="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">
              · {subtitle}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Docked Slot Reordering Arrows */}
          {!isFloating && !isMaximized && onMoveLeft && (
            <button
              onClick={onMoveLeft}
              disabled={!canMoveLeft}
              className="p-1 text-slate-400 hover:text-sky-400 disabled:opacity-25 rounded"
              title="Move Section Left"
            >
              <ArrowLeft className="w-3 h-3" />
            </button>
          )}
          {!isFloating && !isMaximized && onMoveRight && (
            <button
              onClick={onMoveRight}
              disabled={!canMoveRight}
              className="p-1 text-slate-400 hover:text-sky-400 disabled:opacity-25 rounded"
              title="Move Section Right"
            >
              <ArrowRight className="w-3 h-3" />
            </button>
          )}

          {/* Float / Dock Toggle */}
          <button
            onClick={onToggleFloat}
            className={`p-1 rounded transition-colors ${
              isFloating
                ? 'text-sky-400 bg-sky-500/15 hover:bg-sky-500/25'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={
              isFloating
                ? 'Dock Panel Back to Grid'
                : 'Undock / Float Panel (Free Move & Resize Box)'
            }
          >
            {isFloating ? <Pin className="w-3 h-3" /> : <PictureInPicture2 className="w-3 h-3" />}
          </button>

          {/* Collapse / Expand Body */}
          <button
            onClick={onToggleCollapse}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
            title={isCollapsed ? 'Expand Section' : 'Minimize / Collapse Section'}
          >
            <Minus className="w-3 h-3" />
          </button>

          {/* Maximize / Restore Full Viewport */}
          <button
            onClick={onToggleMaximize}
            className={`p-1 rounded ${
              isMaximized
                ? 'text-amber-400 bg-amber-500/15'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
            title={isMaximized ? 'Restore Section Size' : 'Maximize Section'}
          >
            {isMaximized ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Panel Content Body */}
      {!isCollapsed && (
        <div className="flex-1 min-h-0 min-w-0 overflow-hidden relative flex flex-col">
          {children}
        </div>
      )}

      {/* Floating Mode Resize Handles (Right, Bottom, Left, Bottom-Right Corner) */}
      {isFloating && !isMaximized && !isCollapsed && (
        <>
          <div
            onMouseDown={(e) => startDragResize(e, 'r')}
            className="absolute top-7 right-0 bottom-2 w-1.5 cursor-ew-resize hover:bg-sky-500/50 z-50"
          />
          <div
            onMouseDown={(e) => startDragResize(e, 'l')}
            className="absolute top-7 left-0 bottom-2 w-1.5 cursor-ew-resize hover:bg-sky-500/50 z-50"
          />
          <div
            onMouseDown={(e) => startDragResize(e, 'b')}
            className="absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize hover:bg-sky-500/50 z-50"
          />
          <div
            onMouseDown={(e) => startDragResize(e, 'br')}
            className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize bg-sky-500/40 hover:bg-sky-400 rounded-tl z-50"
            title="Drag corner to resize box"
          />
        </>
      )}
    </section>
  );
};
