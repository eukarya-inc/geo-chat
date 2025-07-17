import { useRef, useState, useEffect, useCallback } from 'react';

interface ResizableDividerProps {
  onResize: (height: number) => void;
  minHeight?: number;
  maxHeight?: number;
}

export function ResizableDivider({
  onResize,
  minHeight = 100,
  maxHeight = 600
}: ResizableDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dividerRef.current) return;

      const rect = dividerRef.current.parentElement?.getBoundingClientRect();
      if (!rect) return;

      const newHeight = rect.bottom - e.clientY;
      const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      
      onResize(clampedHeight);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onResize, minHeight, maxHeight]);

  return (
    <div
      ref={dividerRef}
      className={`h-1 bg-gray-200 cursor-ns-resize hover:bg-gray-300 transition-colors ${
        isDragging ? 'bg-gray-400' : ''
      }`}
      onMouseDown={handleMouseDown}
    >
      <div className="h-full w-full relative">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-400" />
      </div>
    </div>
  );
}