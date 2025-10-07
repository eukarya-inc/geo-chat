import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DataSourceModal } from './DataSourceModal';
import type { ChartSpec, VegaChartSpec } from '../../types/chart';

describe('DataSourceModal', () => {
    const mockChartSpec: ChartSpec = {
        id: 'test-chart',
        title: 'Test Chart',
        spec: {
            mark: 'circle',
            encoding: {},
            data: {
                sql: 'SELECT * FROM test_table'
            }
        } as VegaChartSpec,
        timestamp: new Date(),
    };

    let defaultProps: {
        isOpen: boolean;
        onClose: ReturnType<typeof vi.fn>;
        chartSpec: ChartSpec;
        onUpdateChart: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
        defaultProps = {
            isOpen: true,
            onClose: vi.fn(),
            chartSpec: mockChartSpec,
            onUpdateChart: vi.fn()
        };
    });

    it('should not render when isOpen is false', () => {
        render(<DataSourceModal {...defaultProps} isOpen={false} />);

        expect(screen.queryByText('Edit Data Source')).not.toBeInTheDocument();
    });

    it('should render when isOpen is true', () => {
        render(<DataSourceModal {...defaultProps} />);

        expect(screen.getByText('Edit Data Source')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
        expect(screen.getByText('Apply Changes')).toBeInTheDocument();
    });

    it('should display the SQL query from chart spec', () => {
        render(<DataSourceModal {...defaultProps} />);

        const textarea = screen.getByPlaceholderText('SELECT * FROM table_name') as HTMLTextAreaElement;
        expect(textarea.value).toBe('SELECT * FROM test_table');
    });

    it('should extract and display table name', () => {
        render(<DataSourceModal {...defaultProps} />);

        const input = screen.getByPlaceholderText('Enter table name') as HTMLInputElement;
        expect(input.value).toBe('test_table');
    });

    it('should update SQL query when typing', () => {
        render(<DataSourceModal {...defaultProps} />);

        const textarea = screen.getByPlaceholderText('SELECT * FROM table_name') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'SELECT id FROM users' } });

        expect(textarea.value).toBe('SELECT id FROM users');
    });

    it('should update SQL query when table name changes', () => {
        render(<DataSourceModal {...defaultProps} />);

        const input = screen.getByPlaceholderText('Enter table name') as HTMLInputElement;
        const textarea = screen.getByPlaceholderText('SELECT * FROM table_name') as HTMLTextAreaElement;

        fireEvent.change(input, { target: { value: 'new_table' } });

        expect(textarea.value).toBe('SELECT * FROM new_table');
    });

    it('should show error when SQL query is empty', () => {
        render(<DataSourceModal {...defaultProps} />);

        const textarea = screen.getByPlaceholderText('SELECT * FROM table_name') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: '' } });

        const applyButton = screen.getByText('Apply Changes');
        fireEvent.click(applyButton);

        expect(screen.getByText('SQL query cannot be empty')).toBeInTheDocument();
        expect(defaultProps.onUpdateChart).not.toHaveBeenCalled();
    });

    it('should show error when SQL query is invalid', () => {
        render(<DataSourceModal {...defaultProps} />);

        const textarea = screen.getByPlaceholderText('SELECT * FROM table_name') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'INVALID QUERY' } });

        const applyButton = screen.getByText('Apply Changes');
        fireEvent.click(applyButton);

        expect(screen.getByText('SQL query must contain SELECT and FROM clauses')).toBeInTheDocument();
        expect(defaultProps.onUpdateChart).not.toHaveBeenCalled();
    });

    it('should call onUpdateChart with updated spec when applying valid changes', () => {
        render(<DataSourceModal {...defaultProps} />);

        const textarea = screen.getByPlaceholderText('SELECT * FROM table_name') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'SELECT id, name FROM users' } });

        const applyButton = screen.getByText('Apply Changes');
        fireEvent.click(applyButton);

        expect(defaultProps.onUpdateChart).toHaveBeenCalledWith(
            expect.objectContaining({
                spec: expect.objectContaining({
                    data: expect.objectContaining({
                        sql: 'SELECT id, name FROM users'
                    })
                })
            })
        );
        expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should switch to URL data source type', () => {
        render(<DataSourceModal {...defaultProps} />);

        const urlTab = screen.getByText('URL');
        fireEvent.click(urlTab);

        expect(screen.getByPlaceholderText('https://example.com/data.json')).toBeInTheDocument();
    });

    it('should switch to Inline Data source type', () => {
        render(<DataSourceModal {...defaultProps} />);

        const inlineTab = screen.getByText('Inline Data');
        fireEvent.click(inlineTab);

        expect(screen.getByPlaceholderText('[{"x": 1, "y": 2}, {"x": 2, "y": 4}]')).toBeInTheDocument();
    });

    it('should validate URL data source', () => {
        render(<DataSourceModal {...defaultProps} />);

        const urlTab = screen.getByText('URL');
        fireEvent.click(urlTab);

        const urlInput = screen.getByPlaceholderText('https://example.com/data.json') as HTMLInputElement;
        fireEvent.change(urlInput, { target: { value: 'invalid-url' } });

        const applyButton = screen.getByText('Apply Changes');
        fireEvent.click(applyButton);

        expect(screen.getByText('Please enter a valid URL')).toBeInTheDocument();
        expect(defaultProps.onUpdateChart).not.toHaveBeenCalled();
    });

    it('should validate inline JSON data', () => {
        render(<DataSourceModal {...defaultProps} />);

        const inlineTab = screen.getByText('Inline Data');
        fireEvent.click(inlineTab);

        const textarea = screen.getByPlaceholderText('[{"x": 1, "y": 2}, {"x": 2, "y": 4}]') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'invalid json' } });

        const applyButton = screen.getByText('Apply Changes');
        fireEvent.click(applyButton);

        expect(screen.getByText('Invalid JSON format')).toBeInTheDocument();
        expect(defaultProps.onUpdateChart).not.toHaveBeenCalled();
    });

    it('should call onClose when Cancel is clicked', () => {
        render(<DataSourceModal {...defaultProps} />);

        const cancelButton = screen.getByText('Cancel');
        fireEvent.click(cancelButton);

        expect(defaultProps.onClose).toHaveBeenCalled();
        expect(defaultProps.onUpdateChart).not.toHaveBeenCalled();
    });
});
