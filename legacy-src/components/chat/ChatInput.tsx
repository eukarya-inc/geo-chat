import { useState, useEffect, useRef, useCallback } from 'react';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { PlusIcon, PaperAirplaneIcon, StopIcon } from '@heroicons/react/24/outline';
import { extractDataUrl } from '../../utils/tableCreation';

interface ChatInputProps {
    value: string;
    onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onSubmit: (e: React.FormEvent) => void | Promise<void>;
    onStop: () => void;
    dbContext: DBContext | null;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    placeholder?: string;
    className?: string;
    chatId?: string | null;
    selectedTable?: string | null;
    isLoading?: boolean;
    isSubmitting?: boolean;
    renderMenu?: (onClose: () => void, onShowUrlGuide?: () => void) => React.ReactNode;
    disabled?: boolean;
    showUrlGuide?: boolean;
    onShowUrlGuide?: () => void;
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
    onSubmit,
    onStop,
    dbContext,
    textareaRef,
    placeholder,
    className,
    chatId,
    selectedTable,
    isLoading,
    isSubmitting: externalIsSubmitting,
    renderMenu,
    disabled = false,
    showUrlGuide = false,
    onShowUrlGuide,
}: ChatInputProps) {
    const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);
    const isSubmitting = externalIsSubmitting !== undefined ? externalIsSubmitting : internalIsSubmitting;
    const [tables, setTables] = useState<string[]>([]);
    const [fields, setFields] = useState<Array<{ name: string; type: string }>>([]);
    const [autocomplete, setAutocomplete] = useState<AutocompleteState>({
        isOpen: false,
        triggerIndex: -1,
        searchText: '',
        selectedIndex: 0,
        triggerType: '@',
    });
    const [isMultiline, setIsMultiline] = useState(false);
    const [textareaHeight, setTextareaHeight] = useState(44);
    const [isOverflowing, setIsOverflowing] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [showPopup, setShowPopup] = useState(false);
    const [popupPosition, setPopupPosition] = useState<'top' | 'bottom'>('bottom');
    const popupRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Fetch tables from database
    useEffect(() => {
        const fetchTables = async () => {
            if (!dbContext) {
                return;
            }

            try {
                const tableNames = await dbContext.getTables(chatId);
                setTables(tableNames);
            } catch (error) {
                console.error('Failed to fetch tables:', error);
            }
        };

        fetchTables();
    }, [dbContext, chatId, value]); // Re-fetch when value changes to catch new tables

    // Fetch fields from selected table
    useEffect(() => {
        const fetchFields = async () => {
            if (!dbContext || !selectedTable) {
                setFields([]);
                return;
            }

            try {
                const columns = await dbContext.getTableColumns(selectedTable, chatId);
                setFields(columns);
            } catch (error) {
                console.error('Failed to fetch fields:', error);
                setFields([]);
            }
        };

        fetchFields();
    }, [dbContext, selectedTable, chatId]);

    // Calculate textarea height based on content
    useEffect(() => {
        const MIN_HEIGHT = 44;
        const MAX_LINES = 10;

        const textarea = textareaRef.current;

        if (!textarea) {
            setIsMultiline(false);
            setTextareaHeight(MIN_HEIGHT);
            return;
        }

        const trimmed = value.trim();

        if (!trimmed) {
            setIsMultiline(false);
            setTextareaHeight(MIN_HEIGHT);
            return;
        }

        const computedStyle = window.getComputedStyle(textarea);
        const lineHeight = parseFloat(computedStyle.lineHeight) || 24;
        const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
        const totalPadding = paddingTop + paddingBottom;
        const singleLineHeight = lineHeight + totalPadding;

        const updateHeight = () => {
            const currentTextarea = textareaRef.current;
            if (!currentTextarea) {
                return;
            }

            const lines = value.split('\n').length;

            // If multiple lines with newlines, use line count
            if (lines > 1) {
                setIsMultiline(true);
                const effectiveLines = Math.min(lines, MAX_LINES);
                const newHeight = effectiveLines * lineHeight + totalPadding;
                setTextareaHeight(newHeight);
                setIsOverflowing(lines > MAX_LINES);

                // Scroll to bottom if overflowing
                if (lines > MAX_LINES) {
                    requestAnimationFrame(() => {
                        if (currentTextarea) {
                            currentTextarea.scrollTop = currentTextarea.scrollHeight;
                        }
                    });
                }
                return;
            }

            // For single line, temporarily reset height to get accurate scrollHeight
            const previousHeight = currentTextarea.style.height;
            currentTextarea.style.height = `${MIN_HEIGHT}px`;
            const contentHeight = currentTextarea.scrollHeight;
            currentTextarea.style.height = previousHeight;

            if (contentHeight > singleLineHeight + 1) {
                const neededLines = Math.min(Math.ceil((contentHeight - totalPadding) / lineHeight), MAX_LINES);
                const newHeight = neededLines * lineHeight + totalPadding;
                setIsMultiline(true);
                setTextareaHeight(newHeight);
                setIsOverflowing(neededLines >= MAX_LINES);

                // Scroll to bottom if overflowing
                if (neededLines >= MAX_LINES) {
                    requestAnimationFrame(() => {
                        if (currentTextarea) {
                            currentTextarea.scrollTop = currentTextarea.scrollHeight;
                        }
                    });
                }
            } else {
                setIsMultiline(false);
                setTextareaHeight(MIN_HEIGHT);
                setIsOverflowing(false);
            }
        };

        requestAnimationFrame(updateHeight);
    }, [value, textareaRef]);

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

    const handleSubmitWithLoading = useCallback(
        async (e: React.FormEvent) => {
            setInternalIsSubmitting(true);
            try {
                await onSubmit(e);
            } finally {
                setInternalIsSubmitting(false);
            }
        },
        [onSubmit]
    );

    // Handle keyboard navigation
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            // Handle autocomplete first (but not for Shift+Enter)
            if (autocomplete.isOpen && filteredItems.length > 0 && !(e.key === 'Enter' && e.shiftKey)) {
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

            // Handle Enter key for single-line URL submission (but don't block Shift+Enter)
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isLoading && !isSubmitting) {
                const trimmedValue = value.trim();
                const isSingleLine = !trimmedValue.includes('\n');
                const isUrl = extractDataUrl(trimmedValue) !== null;

                if (isSingleLine && isUrl) {
                    e.preventDefault();
                    handleSubmitWithLoading(e);
                    return;
                }
            }

            // Always call original onKeyDown to allow parent to handle Shift+Enter and other keys
            if (onKeyDown) {
                onKeyDown(e);
            }
        },
        [autocomplete, filteredItems, selectItem, onKeyDown, value, isLoading, isSubmitting, handleSubmitWithLoading]
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

    // Handle click outside popup
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                showPopup &&
                popupRef.current &&
                buttonRef.current &&
                !popupRef.current.contains(event.target as Node) &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setShowPopup(false);
            }
        };

        if (showPopup) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showPopup]);

    const handleButtonClick = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading || isSubmitting) {
            onStop();
        } else {
            await handleSubmitWithLoading(e);
        }
    };

    const handlePopupToggle = () => {
        if (!showPopup && buttonRef.current) {
            // Calculate position before showing popup
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;

            // Prefer bottom if there's enough space (150px for menu height)
            const menuHeight = 150;
            if (spaceBelow >= menuHeight) {
                setPopupPosition('bottom');
            } else if (spaceAbove >= menuHeight) {
                setPopupPosition('top');
            } else {
                // Default to bottom if neither has enough space
                setPopupPosition(spaceBelow >= spaceAbove ? 'bottom' : 'top');
            }
        }
        setShowPopup(!showPopup);
    };

    const renderMenuButton = () =>
        renderMenu ? (
            <div className="relative">
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={handlePopupToggle}
                    className="p-2 text-gray-700 rounded-full hover:bg-gray-100 transition-colors focus:outline-none"
                    title="データを読み込む"
                >
                    <PlusIcon className="w-5 h-5" />
                </button>

                {showPopup && (
                    <div
                        ref={popupRef}
                        className={`absolute left-0 bg-white rounded-md shadow-lg border border-gray-200 z-50 ${
                            popupPosition === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'
                        }`}
                    >
                        {renderMenu(() => setShowPopup(false), onShowUrlGuide)}
                    </div>
                )}
            </div>
        ) : null;

    const renderSubmitButton = () => {
        return (
            <button
                type="button"
                onClick={handleButtonClick}
                disabled={(!isLoading && !value.trim()) || isSubmitting || disabled}
                className={`p-2 rounded-full transition-colors duration-200 flex items-center ${
                    isLoading || isSubmitting
                        ? 'text-red-600 hover:bg-red-50'
                        : !value.trim() || disabled
                          ? 'text-gray-400 cursor-not-allowed'
                          : 'text-blue-600 hover:bg-blue-50'
                } focus:outline-none`}
                title={isLoading || isSubmitting ? '停止' : disabled ? 'APIキーを設定してください' : '送信'}
            >
                {isLoading ? (
                    <>
                        <StopIcon className="w-5 h-5" />
                        <span className="ml-2">停止</span>
                    </>
                ) : isSubmitting ? (
                    <>
                        <div className="w-5 h-5 border-[3px] border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                        <span className="ml-2">送信</span>
                    </>
                ) : (
                    <>
                        <PaperAirplaneIcon className="w-5 h-5" />
                        <span className="ml-2">送信</span>
                    </>
                )}
            </button>
        );
    };

    return (
        <div className={`flex gap-2 ${isMultiline ? 'flex-col' : 'items-center'} w-full`}>
            {!isMultiline && renderMenuButton()}

            <div className={isMultiline ? 'w-full' : 'flex-1'}>
                <div
                    ref={containerRef}
                    style={{ minHeight: `${textareaHeight}px`, transition: 'min-height 0.3s ease' }}
                    className="relative flex flex-col justify-end"
                >
                    {showUrlGuide && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                            <div className="relative bg-blue-500 text-white px-6 py-3 rounded-lg shadow-xl text-base font-medium">
                                ここにURLを入力してください
                                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-blue-500"></div>
                            </div>
                        </div>
                    )}
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={handleChange}
                        onKeyDown={handleKeyDown}
                        onBlur={handleBlur}
                        placeholder={placeholder}
                        className={className}
                        style={{
                            height: `${textareaHeight}px`,
                            width: '100%',
                            display: 'block',
                            overflow: isOverflowing ? 'auto' : 'hidden',
                        }}
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
                                            index === autocomplete.selectedIndex
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-gray-800'
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
            </div>

            {isMultiline ? (
                <div className={`flex items-end gap-2 ${renderMenu ? 'justify-between' : 'justify-end'}`}>
                    {renderMenuButton()}
                    {renderSubmitButton()}
                </div>
            ) : (
                renderSubmitButton()
            )}
        </div>
    );
}
