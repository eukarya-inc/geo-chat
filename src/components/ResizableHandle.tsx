import { useEffect, useRef, useState } from 'react';

interface ResizableHandleProps {
    onResize: (widthPercentage: number) => void;
    minWidthPercentage?: number;
    maxWidthPercentage?: number;
}

export function ResizableHandle({ onResize, minWidthPercentage = 20, maxWidthPercentage = 80 }: ResizableHandleProps) {
    const [isDragging, setIsDragging] = useState(false);
    const handleRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLElement | null>(null);
    const startXRef = useRef<number>(0);
    const startWidthPercentageRef = useRef<number>(0);

    useEffect(() => {
        // Find the parent container (the direct parent flex container)
        if (handleRef.current && handleRef.current.parentElement) {
            containerRef.current = handleRef.current.parentElement;
        }
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current || !handleRef.current) return;

        // Get the left panel element - it should be the previous sibling of the handle
        const leftPanel = handleRef.current.previousElementSibling as HTMLElement;

        if (!leftPanel) {
            return;
        }

        // Get width from data attribute (more accurate than getBoundingClientRect which includes padding)
        const dataWidth = leftPanel.getAttribute('data-chat-width');
        const actualWidthPercentage = dataWidth ? parseFloat(dataWidth) : 50;

        startXRef.current = e.clientX;
        startWidthPercentageRef.current = actualWidthPercentage;
        setIsDragging(true);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const containerWidth = containerRect.width;
            const deltaX = e.clientX - startXRef.current;
            const deltaPercentage = (deltaX / containerWidth) * 100;

            // Calculate new width percentage
            let widthPercentage = startWidthPercentageRef.current + deltaPercentage;

            // Apply constraints
            widthPercentage = Math.max(minWidthPercentage, Math.min(maxWidthPercentage, widthPercentage));

            onResize(widthPercentage);
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
    }, [isDragging, onResize, minWidthPercentage, maxWidthPercentage]);

    useEffect(() => {
        if (isDragging) {
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }

        return () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isDragging]);

    return (
        <div
            ref={handleRef}
            onMouseDown={handleMouseDown}
            className={`w-1 hover:w-1.5 cursor-col-resize transition-all ${
                isDragging ? 'bg-blue-500 w-1.5' : 'bg-gray-50 hover:bg-gray-400'
            }`}
            style={{
                flexShrink: 0,
            }}
        />
    );
}
