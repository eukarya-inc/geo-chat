import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DataSourceHistoryGrid } from './DataSourceHistoryGrid';
import type { DataSourceWithChat } from './DataSourceHistoryGrid';

describe('DataSourceHistoryGrid', () => {
    const mockDatabaseTables: DataSourceWithChat[] = [
        {
            tableName: 'users_table',
            sql: 'SELECT * FROM users',
            mergedSql: 'SELECT * FROM users',
            source: 'sql',
            createdAt: new Date('2024-01-15T10:30:00'),
            dependencies: [],
            chatId: 'chat-1',
            chatTitle: 'Chat 1',
        },
        {
            tableName: 'products_table',
            sql: 'SELECT * FROM products',
            mergedSql: 'SELECT * FROM products',
            source: 'ai',
            createdAt: new Date('2024-01-16T14:20:00'),
            dependencies: [],
            chatId: 'chat-2',
            chatTitle: 'Chat 2',
        },
    ];

    const mockRemoteFiles: DataSourceWithChat[] = [
        {
            tableName: 'data.csv',
            sql: '',
            mergedSql: '',
            source: 'file',
            createdAt: new Date('2024-01-17T09:00:00'),
            dependencies: [],
            fileUrl: 'https://example.com/data.csv',
            chatId: 'chat-3',
            chatTitle: 'Chat 3',
        },
        {
            tableName: 'locations.json',
            sql: '',
            mergedSql: '',
            source: 'file',
            createdAt: new Date('2024-01-18T11:00:00'),
            dependencies: [],
            fileUrl: 'https://example.com/locations.json',
            chatId: 'chat-4',
            chatTitle: 'Chat 4',
        },
    ];

    const allDataSources = [...mockDatabaseTables, ...mockRemoteFiles];

    const defaultProps = {
        dataSources: allDataSources,
        onSelectDataSource: vi.fn(),
    };

    it('should render header with title', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        expect(screen.getByText('Data Source List')).toBeInTheDocument();
    });

    it('should render tabs for database and remote files', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        expect(screen.getByText('Database tables')).toBeInTheDocument();
        expect(screen.getByText('Remote files')).toBeInTheDocument();
    });

    it('should show database tables by default', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        expect(screen.getByText('users_table')).toBeInTheDocument();
        expect(screen.getByText('products_table')).toBeInTheDocument();
        expect(screen.queryByText('data.csv')).not.toBeInTheDocument();
        expect(screen.queryByText('locations.json')).not.toBeInTheDocument();
    });

    it('should switch to remote files when tab is clicked', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        const remoteFilesTab = screen.getByText('Remote files');
        fireEvent.click(remoteFilesTab);

        expect(screen.getByText('data.csv')).toBeInTheDocument();
        expect(screen.getByText('locations.json')).toBeInTheDocument();
        expect(screen.queryByText('users_table')).not.toBeInTheDocument();
        expect(screen.queryByText('products_table')).not.toBeInTheDocument();
    });

    it('should highlight active tab', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        const databaseTab = screen.getByText('Database tables');
        const remoteTab = screen.getByText('Remote files');

        // Database tab should be active by default
        expect(databaseTab).toHaveClass('text-gray-900', 'border-b-2', 'border-gray-900');
        expect(remoteTab).toHaveClass('text-gray-500');

        // Switch to remote files
        fireEvent.click(remoteTab);

        // Remote tab should be active now
        expect(remoteTab).toHaveClass('text-gray-900', 'border-b-2', 'border-gray-900');
        expect(databaseTab).toHaveClass('text-gray-500');
    });

    it('should call onSelectDataSource with chatId when data source is clicked', () => {
        const mockOnSelectDataSource = vi.fn();
        render(<DataSourceHistoryGrid {...defaultProps} onSelectDataSource={mockOnSelectDataSource} />);

        const usersTable = screen.getByText('users_table');
        fireEvent.click(usersTable);

        expect(mockOnSelectDataSource).toHaveBeenCalledWith('chat-1');
    });

    it('should display source chat title for each data source', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        expect(screen.getByText('from: Chat 1')).toBeInTheDocument();
        expect(screen.getByText('from: Chat 2')).toBeInTheDocument();
    });

    it('should show empty state when no database tables exist', () => {
        render(<DataSourceHistoryGrid {...defaultProps} dataSources={mockRemoteFiles} />);

        expect(screen.getByText('No database tables found')).toBeInTheDocument();
    });

    it('should show empty state when no remote files exist', () => {
        render(<DataSourceHistoryGrid {...defaultProps} dataSources={mockDatabaseTables} />);

        const remoteFilesTab = screen.getByText('Remote files');
        fireEvent.click(remoteFilesTab);

        expect(screen.getByText('No remote files found')).toBeInTheDocument();
    });

    it('should use dense grid layout for data sources', () => {
        const { container } = render(<DataSourceHistoryGrid {...defaultProps} />);

        const gridElement = container.querySelector('.grid');
        expect(gridElement).toBeInTheDocument();
        expect(gridElement).toHaveClass(
            'grid-cols-2',
            'sm:grid-cols-3',
            'md:grid-cols-4',
            'lg:grid-cols-6',
            'xl:grid-cols-7'
        );
    });

    it('should render table icons for data sources', () => {
        const { container } = render(<DataSourceHistoryGrid {...defaultProps} />);

        const icons = container.querySelectorAll('svg');
        expect(icons.length).toBeGreaterThan(0);
    });

    it('should handle empty dataSources array gracefully', () => {
        expect(() => {
            render(<DataSourceHistoryGrid {...defaultProps} dataSources={[]} />);
        }).not.toThrow();
    });

    it('should filter data sources by source type correctly', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        // Default tab shows sql and ai sources
        expect(screen.getByText('users_table')).toBeInTheDocument();
        expect(screen.getByText('products_table')).toBeInTheDocument();

        // Switch to remote files
        const remoteFilesTab = screen.getByText('Remote files');
        fireEvent.click(remoteFilesTab);

        // Should show only file sources
        expect(screen.getByText('data.csv')).toBeInTheDocument();
        expect(screen.getByText('locations.json')).toBeInTheDocument();
    });

    it('should show hover effect on data source cards', () => {
        render(<DataSourceHistoryGrid {...defaultProps} />);

        const usersTable = screen.getByText('users_table').closest('div');
        expect(usersTable).toHaveClass('hover:shadow-lg', 'cursor-pointer');
    });
});
