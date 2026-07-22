import { describe, expect, it } from 'vitest';

import { hasBOM, removeBOM } from './bomUtils';

describe('bomUtils', () => {
    it('detects a U+FEFF BOM', () => {
        expect(hasBOM('﻿name')).toBe(true);
        expect(hasBOM('name')).toBe(false);
        expect(hasBOM('')).toBe(false);
    });

    it('detects the EF BB BF triple form', () => {
        const triple = 'ï»¿name';
        expect(hasBOM(triple)).toBe(true);
    });

    it('strips a leading U+FEFF BOM', () => {
        expect(removeBOM('﻿city')).toBe('city');
    });

    it('strips the EF BB BF triple form', () => {
        expect(removeBOM('ï»¿city')).toBe('city');
    });

    it('leaves BOM-free strings untouched', () => {
        expect(removeBOM('city')).toBe('city');
        expect(removeBOM('')).toBe('');
    });
});
