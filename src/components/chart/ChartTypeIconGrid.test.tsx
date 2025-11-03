import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChartTypeIconGrid } from './ChartTypeIconGrid';

describe('ChartTypeIconGrid', () => {
    let defaultProps: {
        selectedType: string;
        onSelect: ReturnType<typeof vi.fn>;
        iconSize?: 'small' | 'large';
        variant?: 'selector' | 'config';
    };

    beforeEach(() => {
        defaultProps = {
            selectedType: 'line',
            onSelect: vi.fn(),
            iconSize: 'small',
            variant: 'config',
        };
        vi.clearAllMocks();
    });

    describe('Basic Rendering and Functionality', () => {
        it('should render 7 chart type buttons', () => {
            render(<ChartTypeIconGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');
            expect(buttons).toHaveLength(7);
        });

        it('should have type="button" attribute on all buttons', () => {
            render(<ChartTypeIconGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');
            buttons.forEach(button => {
                expect(button).toHaveAttribute('type', 'button');
            });
        });

        it('should call onSelect with correct chart type when button is clicked', () => {
            render(<ChartTypeIconGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');
            // Click the first button (line chart)
            fireEvent.click(buttons[0]);

            expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
            expect(defaultProps.onSelect).toHaveBeenCalledWith('line');
        });

        it('should have labels defined for all chart types', () => {
            const expectedLabels = [
                '折れ線グラフ',
                '棒グラフ',
                '円グラフ',
                '散布図',
                'ヒストグラム',
                '箱ひげ図',
                'ヒートマップ',
            ];

            render(<ChartTypeIconGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');

            // Hover over each button to trigger tooltip
            buttons.forEach((button, index) => {
                fireEvent.mouseEnter(button);
                expect(document.body).toHaveTextContent(expectedLabels[index]);
                fireEvent.mouseLeave(button);
            });
        });
    });

    describe('Variant Styles', () => {
        it('should apply selected styles in config variant', () => {
            render(<ChartTypeIconGrid {...defaultProps} selectedType="line" variant="config" />);

            const buttons = screen.getAllByRole('button');
            const lineButton = buttons[0]; // First button is line chart

            // Selected button should have blue border and light blue background
            expect(lineButton).toHaveStyle({
                border: '1px solid rgb(59, 130, 246)',
                backgroundColor: 'rgb(239, 246, 255)',
            });

            // Other buttons should have gray border and white background
            const barButton = buttons[1];
            expect(barButton).toHaveStyle({
                border: '1px solid rgb(229, 231, 235)',
                backgroundColor: 'rgb(255, 255, 255)',
            });
        });

        it('should render correctly in selector variant', () => {
            render(<ChartTypeIconGrid {...defaultProps} variant="selector" />);

            const buttons = screen.getAllByRole('button');
            expect(buttons).toHaveLength(7);

            // Selector variant uses Tailwind classes
            buttons.forEach(button => {
                expect(button).toHaveClass('hover:bg-gray-200');
            });
        });
    });

    describe('Tooltip Functionality', () => {
        it('should show tooltip in document.body when button is hovered', () => {
            render(<ChartTypeIconGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');
            const lineButton = buttons[0];

            // Before hover, tooltip should not exist
            expect(document.body).not.toHaveTextContent('折れ線グラフ');

            // Hover over button
            fireEvent.mouseEnter(lineButton);

            // Tooltip should appear in document.body
            expect(document.body).toHaveTextContent('折れ線グラフ');
        });

        it('should display correct label in tooltip', () => {
            render(<ChartTypeIconGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');

            // Test a few different chart types
            const testCases: Array<{ index: number; label: string }> = [
                { index: 0, label: '折れ線グラフ' },
                { index: 1, label: '棒グラフ' },
                { index: 3, label: '散布図' },
            ];

            testCases.forEach(({ index, label }) => {
                fireEvent.mouseEnter(buttons[index]);
                expect(document.body).toHaveTextContent(label);
                fireEvent.mouseLeave(buttons[index]);
            });
        });

        it('should hide tooltip when mouse leaves button', () => {
            render(<ChartTypeIconGrid {...defaultProps} />);

            const buttons = screen.getAllByRole('button');
            const lineButton = buttons[0];

            // Hover to show tooltip
            fireEvent.mouseEnter(lineButton);
            expect(document.body).toHaveTextContent('折れ線グラフ');

            // Leave to hide tooltip
            fireEvent.mouseLeave(lineButton);
            expect(document.body).not.toHaveTextContent('折れ線グラフ');
        });
    });
});
