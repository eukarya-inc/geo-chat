import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PromptSuggestions } from './PromptSuggestions';

describe('PromptSuggestions', () => {
    const mockPrompts = [
        { text: 'Show me the first 10 rows', description: 'Display initial data' },
        { text: 'Create a chart', description: 'Visualize data' },
        { text: 'Analyze trends', description: 'Statistical analysis' },
    ];

    it('should render nothing when prompts array is empty', () => {
        const { container } = render(<PromptSuggestions prompts={[]} onPromptClick={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('should render all prompt buttons', () => {
        render(<PromptSuggestions prompts={mockPrompts} onPromptClick={vi.fn()} />);

        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(3);
        expect(buttons[0]).toHaveTextContent('Show me the first 10 rows');
        expect(buttons[1]).toHaveTextContent('Create a chart');
        expect(buttons[2]).toHaveTextContent('Analyze trends');
    });

    it('should render title when provided', () => {
        render(<PromptSuggestions prompts={mockPrompts} onPromptClick={vi.fn()} title="Suggested Queries" />);

        expect(screen.getByText('Suggested Queries')).toBeInTheDocument();
    });

    it('should not render title when not provided', () => {
        const { container } = render(<PromptSuggestions prompts={mockPrompts} onPromptClick={vi.fn()} />);

        const titleElement = container.querySelector('.text-xs.text-gray-600.mb-2.font-medium');
        expect(titleElement).toBeNull();
    });

    it('should call onPromptClick with correct text when button is clicked', () => {
        const mockOnPromptClick = vi.fn();
        render(<PromptSuggestions prompts={mockPrompts} onPromptClick={mockOnPromptClick} />);

        const firstButton = screen.getByRole('button', { name: /Show me the first 10 rows/ });
        firstButton.click();

        expect(mockOnPromptClick).toHaveBeenCalledTimes(1);
        expect(mockOnPromptClick).toHaveBeenCalledWith('Show me the first 10 rows');
    });

    it('should have title attribute with full prompt text', () => {
        render(<PromptSuggestions prompts={mockPrompts} onPromptClick={vi.fn()} />);

        const firstButton = screen.getByRole('button', { name: /Show me the first 10 rows/ });
        expect(firstButton).toHaveAttribute('title', 'Show me the first 10 rows');
    });

    it('should use custom className when provided', () => {
        const { container } = render(
            <PromptSuggestions prompts={mockPrompts} onPromptClick={vi.fn()} className="custom-class" />
        );

        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).toHaveClass('custom-class');
    });

    it('should use prompt.id as key when available', () => {
        const promptsWithId = [
            { id: 'prompt-1', text: 'First prompt' },
            { id: 'prompt-2', text: 'Second prompt' },
        ];
        const { container } = render(<PromptSuggestions prompts={promptsWithId} onPromptClick={vi.fn()} />);

        const buttons = container.querySelectorAll('button');
        expect(buttons).toHaveLength(2);
    });

    it('should have correct styling for horizontal scroll', () => {
        const { container } = render(<PromptSuggestions prompts={mockPrompts} onPromptClick={vi.fn()} />);

        const scrollContainer = container.querySelector('.overflow-x-auto');
        expect(scrollContainer).toBeInTheDocument();
        expect(scrollContainer).toHaveClass('flex', 'gap-2', 'pb-2');
    });
});
