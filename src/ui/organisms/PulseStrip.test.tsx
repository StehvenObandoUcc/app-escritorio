import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ActivityBlock } from '@/bridge/contract';
import { PulseStrip } from './PulseStrip';

const block = (id: string, h: number, category: ActivityBlock['category']): ActivityBlock => ({
  id,
  startedAt: `2026-10-01T${String(h).padStart(2, '0')}:00:00Z`,
  endedAt: `2026-10-01T${String(h).padStart(2, '0')}:45:00Z`,
  appName: 'Code',
  category,
  title: null,
  domain: null,
  aiTool: null,
  aiUsage: null,
});

describe('PulseStrip (onboard)', () => {
  it('la leyenda nombra solo las categorías que hay en el día', () => {
    render(<PulseStrip blocks={[block('a', 9, 'productive'), block('b', 10, 'paused'), block('c', 11, 'productive')]} summary="Jornada" />);
    const legend = screen.getByRole('list', { name: 'Leyenda de la franja' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Productivo', 'En pausa']);
  });
});
