import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StructuredMessage } from '../../types/message';

describe('Chat Component Logic', () => {
    describe('Message Grouping', () => {
        // Extract message grouping logic from Chat.tsx useMemo
        const createMessageGroups = (messages: StructuredMessage[]) => {
            const groups: {
                userMessage: StructuredMessage;
                assistantMessage?: StructuredMessage;
                startIndex: number;
            }[] = [];

            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                if (message.role === 'user') {
                    const group: {
                        userMessage: StructuredMessage;
                        assistantMessage?: StructuredMessage;
                        startIndex: number;
                    } = {
                        userMessage: message,
                        startIndex: i,
                    };
                    if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                        group.assistantMessage = messages[i + 1];
                    }
                    groups.push(group);
                    if (group.assistantMessage) {
                        i++;
                    }
                }
            }

            return groups;
        };

        it('should create single group from one user-assistant pair', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'Hello' },
                { role: 'assistant', content: 'Hi there' },
            ];

            const groups = createMessageGroups(messages);

            expect(groups).toHaveLength(1);
            expect(groups[0].userMessage.content).toBe('Hello');
            expect(groups[0].assistantMessage?.content).toBe('Hi there');
            expect(groups[0].startIndex).toBe(0);
        });

        it('should create multiple groups from conversation history', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'First question' },
                { role: 'assistant', content: 'First answer' },
                { role: 'user', content: 'Second question' },
                { role: 'assistant', content: 'Second answer' },
            ];

            const groups = createMessageGroups(messages);

            expect(groups).toHaveLength(2);
            expect(groups[0].userMessage.content).toBe('First question');
            expect(groups[0].assistantMessage?.content).toBe('First answer');
            expect(groups[1].userMessage.content).toBe('Second question');
            expect(groups[1].assistantMessage?.content).toBe('Second answer');
        });

        it('should handle 5+ message exchanges correctly', () => {
            const messages: StructuredMessage[] = [];
            for (let i = 0; i < 5; i++) {
                messages.push({ role: 'user', content: `Question ${i + 1}` });
                messages.push({ role: 'assistant', content: `Answer ${i + 1}` });
            }

            const groups = createMessageGroups(messages);

            expect(groups).toHaveLength(5);
            expect(groups[0].startIndex).toBe(0);
            expect(groups[1].startIndex).toBe(2);
            expect(groups[2].startIndex).toBe(4);
            expect(groups[3].startIndex).toBe(6);
            expect(groups[4].startIndex).toBe(8);
        });

        it('should handle consecutive user messages without assistant responses', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'First message' },
                { role: 'user', content: 'Second message' },
                { role: 'user', content: 'Third message' },
            ];

            const groups = createMessageGroups(messages);

            expect(groups).toHaveLength(3);
            expect(groups[0].assistantMessage).toBeUndefined();
            expect(groups[1].assistantMessage).toBeUndefined();
            expect(groups[2].assistantMessage).toBeUndefined();
        });

        it('should handle mixed patterns (user-assistant, user-user-assistant)', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'First' },
                { role: 'assistant', content: 'Response 1' },
                { role: 'user', content: 'Second' },
                { role: 'user', content: 'Third' },
                { role: 'assistant', content: 'Response 2' },
            ];

            const groups = createMessageGroups(messages);

            expect(groups).toHaveLength(3);
            expect(groups[0].userMessage.content).toBe('First');
            expect(groups[0].assistantMessage?.content).toBe('Response 1');
            expect(groups[1].userMessage.content).toBe('Second');
            expect(groups[1].assistantMessage).toBeUndefined();
            expect(groups[2].userMessage.content).toBe('Third');
            expect(groups[2].assistantMessage?.content).toBe('Response 2');
        });

        it('should skip assistant messages without preceding user message', () => {
            const messages: StructuredMessage[] = [
                { role: 'assistant', content: 'Orphan assistant message' },
                { role: 'user', content: 'User message' },
                { role: 'assistant', content: 'Valid response' },
            ];

            const groups = createMessageGroups(messages);

            expect(groups).toHaveLength(1);
            expect(groups[0].userMessage.content).toBe('User message');
            expect(groups[0].assistantMessage?.content).toBe('Valid response');
        });

        it('should track correct startIndex for each group', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'Q1' },
                { role: 'assistant', content: 'A1' },
                { role: 'user', content: 'Q2' },
                { role: 'user', content: 'Q3' },
                { role: 'assistant', content: 'A3' },
            ];

            const groups = createMessageGroups(messages);

            expect(groups[0].startIndex).toBe(0);
            expect(groups[1].startIndex).toBe(2);
            expect(groups[2].startIndex).toBe(3);
        });

        it('should handle empty messages array', () => {
            const messages: StructuredMessage[] = [];

            const groups = createMessageGroups(messages);

            expect(groups).toHaveLength(0);
        });
    });

    describe('Collapse State Management', () => {
        // Simulate collapse state management logic
        const createCollapseManager = () => {
            let collapsedGroups = new Set<number>();
            let manuallyToggledGroups = new Set<number>();

            const toggleGroupCollapse = (groupIndex: number) => {
                const newManuallyToggled = new Set(manuallyToggledGroups);
                newManuallyToggled.add(groupIndex);
                manuallyToggledGroups = newManuallyToggled;

                const newCollapsed = new Set(collapsedGroups);
                if (newCollapsed.has(groupIndex)) {
                    newCollapsed.delete(groupIndex);
                } else {
                    newCollapsed.add(groupIndex);
                }
                collapsedGroups = newCollapsed;

                return { collapsedGroups, manuallyToggledGroups };
            };

            const autoCollapseLastGroup = (lastGroupIndex: number) => {
                if (!manuallyToggledGroups.has(lastGroupIndex) && !collapsedGroups.has(lastGroupIndex)) {
                    const newCollapsed = new Set(collapsedGroups);
                    newCollapsed.add(lastGroupIndex);
                    collapsedGroups = newCollapsed;
                }
                return { collapsedGroups, manuallyToggledGroups };
            };

            return {
                toggleGroupCollapse,
                autoCollapseLastGroup,
                getState: () => ({ collapsedGroups, manuallyToggledGroups }),
            };
        };

        it('should toggle collapse state for specific group', () => {
            const manager = createCollapseManager();

            manager.toggleGroupCollapse(0);
            let state = manager.getState();
            expect(state.collapsedGroups.has(0)).toBe(true);

            manager.toggleGroupCollapse(0);
            state = manager.getState();
            expect(state.collapsedGroups.has(0)).toBe(false);
        });

        it('should track manually toggled groups separately', () => {
            const manager = createCollapseManager();

            manager.toggleGroupCollapse(0);
            manager.toggleGroupCollapse(1);

            const state = manager.getState();
            expect(state.manuallyToggledGroups.has(0)).toBe(true);
            expect(state.manuallyToggledGroups.has(1)).toBe(true);
        });

        it('should auto-collapse last group when new message arrives', () => {
            const manager = createCollapseManager();

            manager.autoCollapseLastGroup(2);

            const state = manager.getState();
            expect(state.collapsedGroups.has(2)).toBe(true);
        });

        it('should not auto-collapse if last group was manually toggled', () => {
            const manager = createCollapseManager();

            manager.toggleGroupCollapse(2);
            manager.autoCollapseLastGroup(2);

            const state = manager.getState();
            // Already manually toggled, so auto-collapse shouldn't add it again
            expect(state.collapsedGroups.has(2)).toBe(true);
            expect(state.manuallyToggledGroups.has(2)).toBe(true);
        });

        it('should preserve collapse state for previous groups', () => {
            const manager = createCollapseManager();

            manager.toggleGroupCollapse(0);
            manager.toggleGroupCollapse(1);

            let state = manager.getState();
            expect(state.collapsedGroups.has(0)).toBe(true);
            expect(state.collapsedGroups.has(1)).toBe(true);

            manager.autoCollapseLastGroup(2);

            state = manager.getState();
            expect(state.collapsedGroups.has(0)).toBe(true);
            expect(state.collapsedGroups.has(1)).toBe(true);
            expect(state.collapsedGroups.has(2)).toBe(true);
        });

        it('should handle multiple sequential toggles', () => {
            const manager = createCollapseManager();

            manager.toggleGroupCollapse(0);
            manager.toggleGroupCollapse(0);
            manager.toggleGroupCollapse(0);

            const state = manager.getState();
            expect(state.collapsedGroups.has(0)).toBe(true);
            expect(state.manuallyToggledGroups.has(0)).toBe(true);
        });
    });

    describe('Keyboard Handling', () => {
        let mockHandleFormSubmit: ReturnType<typeof vi.fn>;
        let isSubmitting: boolean;
        let userHasScrolled: boolean;

        beforeEach(() => {
            mockHandleFormSubmit = vi.fn().mockResolvedValue(undefined);
            isSubmitting = false;
            userHasScrolled = true;
        });

        const simulateKeyPress = async (
            key: string,
            options: { shiftKey?: boolean; isComposing?: boolean; isLoading?: boolean } = {}
        ) => {
            const { shiftKey = false, isComposing = false, isLoading = false } = options;

            if (key === 'Enter' && shiftKey && !isComposing && !isLoading) {
                isSubmitting = true;
                userHasScrolled = false;

                const submitEvent = { preventDefault: vi.fn() } as unknown as React.FormEvent;
                await mockHandleFormSubmit(submitEvent);

                isSubmitting = false;
                return { submitted: true, isSubmitting, userHasScrolled };
            }

            return { submitted: false, isSubmitting, userHasScrolled };
        };

        it('should submit message on Shift+Enter', async () => {
            const result = await simulateKeyPress('Enter', { shiftKey: true });

            expect(result.submitted).toBe(true);
            expect(mockHandleFormSubmit).toHaveBeenCalled();
        });

        it('should not submit on Enter without Shift', async () => {
            const result = await simulateKeyPress('Enter', { shiftKey: false });

            expect(result.submitted).toBe(false);
            expect(mockHandleFormSubmit).not.toHaveBeenCalled();
        });

        it('should not submit during IME composition', async () => {
            const result = await simulateKeyPress('Enter', { shiftKey: true, isComposing: true });

            expect(result.submitted).toBe(false);
            expect(mockHandleFormSubmit).not.toHaveBeenCalled();
        });

        it('should set isSubmitting to true during submission', async () => {
            let capturedIsSubmitting = false;

            mockHandleFormSubmit.mockImplementation(() => {
                capturedIsSubmitting = isSubmitting;
                return Promise.resolve();
            });

            await simulateKeyPress('Enter', { shiftKey: true });

            expect(capturedIsSubmitting).toBe(true);
        });

        it('should reset isSubmitting after submission completes', async () => {
            const result = await simulateKeyPress('Enter', { shiftKey: true });

            expect(result.isSubmitting).toBe(false);
        });

        it('should reset scroll tracking on submission', async () => {
            const result = await simulateKeyPress('Enter', { shiftKey: true });

            expect(result.userHasScrolled).toBe(false);
        });

        it('should not submit when loading', async () => {
            const result = await simulateKeyPress('Enter', { shiftKey: true, isLoading: true });

            expect(result.submitted).toBe(false);
            expect(mockHandleFormSubmit).not.toHaveBeenCalled();
        });
    });

    describe('Prompt Selection', () => {
        let mockHandleInputChange: ReturnType<typeof vi.fn>;
        let mockSendMessage: ReturnType<typeof vi.fn>;
        let mockScrollToBottom: ReturnType<typeof vi.fn>;
        let mockFocus: ReturnType<typeof vi.fn>;
        let userHasScrolled: boolean;

        beforeEach(() => {
            mockHandleInputChange = vi.fn();
            mockSendMessage = vi.fn();
            mockScrollToBottom = vi.fn();
            mockFocus = vi.fn();
            userHasScrolled = true;
        });

        const simulatePromptSelection = (promptText: string, currentInput: string) => {
            if (currentInput === promptText) {
                // Send message
                const changeEvent = {
                    target: { value: '' },
                } as React.ChangeEvent<HTMLTextAreaElement>;
                mockHandleInputChange(changeEvent);
                userHasScrolled = false;
                mockSendMessage(promptText);
                setTimeout(() => {
                    mockScrollToBottom();
                }, 300);
            } else {
                // Set input
                const changeEvent = {
                    target: { value: promptText },
                } as React.ChangeEvent<HTMLTextAreaElement>;
                mockHandleInputChange(changeEvent);
                setTimeout(() => {
                    mockFocus();
                }, 0);
            }

            return { userHasScrolled };
        };

        it('should send message if prompt matches current input', () => {
            simulatePromptSelection('SELECT * FROM table', 'SELECT * FROM table');

            expect(mockSendMessage).toHaveBeenCalledWith('SELECT * FROM table');
            expect(mockHandleInputChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: expect.objectContaining({ value: '' }),
                })
            );
        });

        it('should set input value if prompt differs from current input', () => {
            simulatePromptSelection('New prompt', 'Old input');

            expect(mockSendMessage).not.toHaveBeenCalled();
            expect(mockHandleInputChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: expect.objectContaining({ value: 'New prompt' }),
                })
            );
        });

        it('should clear input when sending matching prompt', () => {
            simulatePromptSelection('Test prompt', 'Test prompt');

            expect(mockHandleInputChange).toHaveBeenCalledWith(
                expect.objectContaining({
                    target: expect.objectContaining({ value: '' }),
                })
            );
        });

        it('should reset scroll tracking when sending from prompt', () => {
            const result = simulatePromptSelection('Test prompt', 'Test prompt');

            expect(result.userHasScrolled).toBe(false);
        });

        it('should focus textarea after setting new prompt', async () => {
            simulatePromptSelection('New prompt', 'Different input');

            await new Promise(resolve => setTimeout(resolve, 10));
            expect(mockFocus).toHaveBeenCalled();
        });

        it('should trigger scrollToBottom after sending from prompt', async () => {
            simulatePromptSelection('Test prompt', 'Test prompt');

            await new Promise(resolve => setTimeout(resolve, 350));
            expect(mockScrollToBottom).toHaveBeenCalled();
        });
    });
});
