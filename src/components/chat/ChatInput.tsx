import { useState, useEffect, useRef, useCallback } from 'react';
import type { DBContext } from '../../lib/duckdb/dbContext';

interface ChatInputProps {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    dbContext: DBContext;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    placeholder?: string;
    className?: string;
    rows?: number;
    schemaName?: string | null;
}

interface AutocompleteState {
    isOpen: boolean;
    triggerIndex: number;
    searchText: string;
    selectedIndex: number;
}

export default function ChatInput({
    value,
    onChange,
    onKeyDown,
    dbContext,
    textareaRef,
    placeholder,
    className,
    rows = 2,
    schemaName
}: ChatInputProps) {
    const [tables, setTables] = useState<string[]>([]);
    const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
        isOpen: false,
        triggerIndex: -1,
        searchText: '',
        selectedIndex: 0
    });
    const listRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch tables from database
    useEffect(() => {
        const fetchTables = async () => {
            if (!dbContext) {
                return;
            }
            
            try {
                const tableNames = await dbContext.getTables(schemaName);
                setTables(tableNames);
            } catch (error) {
                console.error('Failed to fetch tables:', error);
            }
        };

        fetchTables();
    }, [dbContext, schemaName, value]); // Re-fetch when value changes to catch new tables

    // Track if we're clicking on the dropdown
    const isClickingDropdownRef = useRef(false);
    
    // Handle blur event to close autocomplete
    const handleBlur = useCallback(() => {
        // Only close if we're not clicking on the dropdown
        if (!isClickingDropdownRef.current) {
            setAutocomplete(prev => ({ ...prev, isOpen: false }));
        }
        isClickingDropdownRef.current = false;
    }, []);

    // Handle input changes
    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        const cursorPos = e.target.selectionStart;
        
        // Check for @ trigger
        if (cursorPos > 0) {
            const textBeforeCursor = newValue.substring(0, cursorPos);
            const lastAtIndex = textBeforeCursor.lastIndexOf('@');
            
            if (lastAtIndex !== -1) {
                const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
                
                // Check if @ is not followed by space or newline
                if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
                    setAutocomplete({
                        isOpen: true,
                        triggerIndex: lastAtIndex,
                        searchText: textAfterAt.toLowerCase(),
                        selectedIndex: 0
                    });
                } else {
                    setAutocomplete(prev => ({ ...prev, isOpen: false }));
                }
            } else {
                setAutocomplete(prev => ({ ...prev, isOpen: false }));
            }
        } else {
            setAutocomplete(prev => ({ ...prev, isOpen: false }));
        }
        
        onChange(e);
    }, [onChange]);

    // Filter tables based on search text
    const filteredTables = tables.filter(table => 
        table.toLowerCase().includes(autocomplete.searchText)
    );

    // Handle table selection
    const selectTable = useCallback((tableName: string) => {
        if (!textareaRef.current) return;
        
        const beforeAt = value.substring(0, autocomplete.triggerIndex);
        const afterSearch = value.substring(autocomplete.triggerIndex + 1 + autocomplete.searchText.length);
        const newValue = beforeAt + '@' + tableName + ' ' + afterSearch;
        
        const newCursorPos = autocomplete.triggerIndex + tableName.length + 2;
        
        // Create synthetic event
        const event = {
            target: {
                value: newValue,
                selectionStart: newCursorPos,
                selectionEnd: newCursorPos
            }
        } as React.ChangeEvent<HTMLTextAreaElement>;
        
        onChange(event);
        
        // Reset autocomplete state
        setAutocomplete({
            isOpen: false,
            triggerIndex: -1,
            searchText: '',
            selectedIndex: 0
        });
        
        // Set cursor position immediately using requestAnimationFrame for better performance
        requestAnimationFrame(() => {
            if (textareaRef.current) {
                textareaRef.current.selectionStart = newCursorPos;
                textareaRef.current.selectionEnd = newCursorPos;
                textareaRef.current.focus();
            }
        });
    }, [value, autocomplete, onChange, textareaRef]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (autocomplete.isOpen && filteredTables.length > 0) {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    setAutocomplete(prev => ({
                        ...prev,
                        selectedIndex: Math.min(prev.selectedIndex + 1, filteredTables.length - 1)
                    }));
                    return; // Don't propagate
                    
                case 'ArrowUp':
                    e.preventDefault();
                    setAutocomplete(prev => ({
                        ...prev,
                        selectedIndex: Math.max(prev.selectedIndex - 1, 0)
                    }));
                    return; // Don't propagate
                    
                case 'Enter':
                    if (!e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation(); // Stop propagation to prevent form submission
                        selectTable(filteredTables[autocomplete.selectedIndex]);
                        return; // Don't call original handler
                    }
                    break;
                    
                case 'Escape':
                    e.preventDefault();
                    setAutocomplete(prev => ({ ...prev, isOpen: false }));
                    return; // Don't propagate
                    
                case 'Tab':
                    e.preventDefault();
                    selectTable(filteredTables[autocomplete.selectedIndex]);
                    return; // Don't propagate
            }
        }
        
        // Call original onKeyDown if provided and autocomplete didn't handle the event
        if (onKeyDown) {
            onKeyDown(e);
        }
    }, [autocomplete, filteredTables, selectTable, onKeyDown]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current && autocomplete.isOpen) {
            const selectedElement = listRef.current.querySelector('[data-selected="true"]');
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [autocomplete.selectedIndex, autocomplete.isOpen]);

    return (
        <div ref={containerRef} className="relative">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                placeholder={placeholder}
                className={className}
                rows={rows}
            />
            
            {autocomplete.isOpen && filteredTables.length > 0 && (
                <div
                    className="absolute bottom-full mb-1 left-0 z-50"
                    style={{ zIndex: 9999 }}
                >
                    <div
                        ref={listRef}
                        className="bg-white border border-gray-300 rounded-md shadow-lg overflow-auto py-1"
                        style={{ maxHeight: '200px', minWidth: '200px' }}
                    >
                        {filteredTables.map((table, index) => (
                            <button
                                key={table}
                                type="button"
                                data-selected={index === autocomplete.selectedIndex}
                                className={`w-full text-left px-3 py-1.5 hover:bg-gray-100 cursor-pointer ${
                                    index === autocomplete.selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-800'
                                }`}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    isClickingDropdownRef.current = true;
                                    selectTable(table);
                                }}
                                onMouseEnter={() => {
                                    setAutocomplete(prev => ({ ...prev, selectedIndex: index }));
                                }}
                            >
                                <span className="text-gray-500 mr-1">@</span>
                                {table}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}