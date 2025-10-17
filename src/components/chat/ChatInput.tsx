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
    selectedTable?: string | null;
}

interface AutocompleteState {
    isOpen: boolean;
    triggerIndex: number;
    searchText: string;
    selectedIndex: number;
    triggerType: '@' | '#';
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
    schemaName,
    selectedTable,
}: ChatInputProps) {
    const [tables, setTables] = useState<string[]>([]);
    const [fields, setFields] = useState<Array<{ name: string; type: string }>>([]);
    const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
        isOpen: false,
        triggerIndex: -1,
        searchText: '',
        selectedIndex: 0,
        triggerType: '@',
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

    // Fetch fields from selected table
    useEffect(() => {
        const fetchFields = async () => {
            if (!dbContext || !selectedTable) {
                setFields([]);
                return;
            }

            try {
                const columns = await dbContext.getTableColumns(selectedTable, schemaName);
                setFields(columns);
            } catch (error) {
                console.error('Failed to fetch fields:', error);
                setFields([]);
            }
        };

        fetchFields();
    }, [dbContext, selectedTable, schemaName]);

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
    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            const newValue = e.target.value;
            const cursorPos = e.target.selectionStart;

            // Check for @ or # trigger
            if (cursorPos > 0) {
                const textBeforeCursor = newValue.substring(0, cursorPos);
                const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                const lastHashIndex = textBeforeCursor.lastIndexOf('#');

                // Determine which trigger is most recent
                const triggerIndex = Math.max(lastAtIndex, lastHashIndex);
                const triggerChar = triggerIndex === lastAtIndex ? '@' : '#';

                if (triggerIndex !== -1) {
                    const textAfterTrigger = textBeforeCursor.substring(triggerIndex + 1);

                    // Check if trigger is not followed by space or newline
                    if (!textAfterTrigger.includes(' ') && !textAfterTrigger.includes('\n')) {
                        setAutocomplete({
                            isOpen: true,
                            triggerIndex: triggerIndex,
                            searchText: textAfterTrigger.toLowerCase(),
                            selectedIndex: 0,
                            triggerType: triggerChar,
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
        },
        [onChange]
    );

    // Filter items based on search text and trigger type
    const filteredTables = tables.filter(table => table.toLowerCase().includes(autocomplete.searchText));
    const filteredFields = fields.filter(field => field.name.toLowerCase().includes(autocomplete.searchText));

    // Get filtered items based on trigger type
    const getFilteredItems = useCallback(() => {
        if (autocomplete.triggerType === '@') {
            return filteredTables.map(name => ({ name, type: undefined }));
        } else {
            return filteredFields;
        }
    }, [autocomplete.triggerType, filteredTables, filteredFields]);

    const filteredItems = getFilteredItems();

    // Handle item selection
    const selectItem = useCallback(
        (itemName: string) => {
            if (!textareaRef.current) return;

            const beforeTrigger = value.substring(0, autocomplete.triggerIndex);
            const afterSearch = value.substring(autocomplete.triggerIndex + 1 + autocomplete.searchText.length);
            const newValue = beforeTrigger + autocomplete.triggerType + itemName + ' ' + afterSearch;

            const newCursorPos = autocomplete.triggerIndex + itemName.length + 2;

            // Create synthetic event
            const event = {
                target: {
                    value: newValue,
                    selectionStart: newCursorPos,
                    selectionEnd: newCursorPos,
                },
            } as React.ChangeEvent<HTMLTextAreaElement>;

            onChange(event);

            // Reset autocomplete state
            setAutocomplete({
                isOpen: false,
                triggerIndex: -1,
                searchText: '',
                selectedIndex: 0,
                triggerType: '@',
            });

            // Set cursor position immediately using requestAnimationFrame for better performance
            requestAnimationFrame(() => {
                if (textareaRef.current) {
                    textareaRef.current.selectionStart = newCursorPos;
                    textareaRef.current.selectionEnd = newCursorPos;
                    textareaRef.current.focus();
                }
            });
        },
        [value, autocomplete, onChange, textareaRef]
    );

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (autocomplete.isOpen && filteredItems.length > 0) {
                switch (e.key) {
                    case 'ArrowDown':
                        e.preventDefault();
                        setAutocomplete(prev => ({
                            ...prev,
                            selectedIndex: Math.min(prev.selectedIndex + 1, filteredItems.length - 1),
                        }));
                        return; // Don't propagate

                    case 'ArrowUp':
                        e.preventDefault();
                        setAutocomplete(prev => ({
                            ...prev,
                            selectedIndex: Math.max(prev.selectedIndex - 1, 0),
                        }));
                        return; // Don't propagate

                    case 'Enter':
                        if (!e.shiftKey) {
                            e.preventDefault();
                            e.stopPropagation(); // Stop propagation to prevent form submission
                            selectItem(filteredItems[autocomplete.selectedIndex].name);
                            return; // Don't call original handler
                        }
                        break;

                    case 'Escape':
                        e.preventDefault();
                        setAutocomplete(prev => ({ ...prev, isOpen: false }));
                        return; // Don't propagate

                    case 'Tab':
                        e.preventDefault();
                        selectItem(filteredItems[autocomplete.selectedIndex].name);
                        return; // Don't propagate
                }
            }

            // Call original onKeyDown if provided and autocomplete didn't handle the event
            if (onKeyDown) {
                onKeyDown(e);
            }
        },
        [autocomplete, filteredItems, selectItem, onKeyDown]
    );

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

            {autocomplete.isOpen && filteredItems.length > 0 && (
                <div className="absolute bottom-full mb-1 left-0 z-50" style={{ zIndex: 9999 }}>
                    <div
                        ref={listRef}
                        className="bg-white border border-gray-300 rounded-md shadow-lg overflow-auto py-1"
                        style={{ maxHeight: '200px', minWidth: '200px' }}
                    >
                        {filteredItems.map((item, index) => (
                            <button
                                key={item.name}
                                type="button"
                                data-selected={index === autocomplete.selectedIndex}
                                className={`w-full text-left px-3 py-1.5 hover:bg-gray-100 cursor-pointer ${
                                    index === autocomplete.selectedIndex ? 'bg-blue-50 text-blue-700' : 'text-gray-800'
                                }`}
                                onMouseDown={e => {
                                    e.preventDefault();
                                    isClickingDropdownRef.current = true;
                                    selectItem(item.name);
                                }}
                                onMouseEnter={() => {
                                    setAutocomplete(prev => ({ ...prev, selectedIndex: index }));
                                }}
                            >
                                <span className="text-gray-500 mr-1">{autocomplete.triggerType}</span>
                                {item.name}
                                {item.type && <span className="text-gray-400 ml-2 text-xs">({item.type})</span>}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
