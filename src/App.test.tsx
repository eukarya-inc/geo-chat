import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
    it('renders the header and the four workspace tabs', () => {
        render(<App />);

        expect(screen.getByRole('heading', { name: 'geo-chat' })).toBeInTheDocument();

        for (const label of ['Table', 'Chart', 'Map', 'SQL']) {
            expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
        }
    });
});
