import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SegmentedControl, tabPanelLabel } from './SegmentedControl';

const options = [
  { value: 'a', label: 'Uno' },
  { value: 'b', label: 'Dos' },
];

describe('SegmentedControl (A-03)', () => {
  it('con panelId son pestañas: la activa controla el panel y lo nombra', () => {
    render(
      <>
        <SegmentedControl label="Secciones" options={options} value="b" onChange={() => {}} panelId="p" />
        <div role="tabpanel" id="p" aria-labelledby={tabPanelLabel('p', 'b')} />
      </>,
    );
    const active = screen.getByRole('tab', { name: 'Dos', selected: true });
    expect(active).toHaveAttribute('aria-controls', 'p');
    expect(screen.getByRole('tabpanel', { name: 'Dos' })).toBeInTheDocument();
  });

  it('sin panelId es una elección (radiogroup), no pestañas', () => {
    render(<SegmentedControl label="Periodo" options={options} value="a" onChange={() => {}} />);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Uno', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dos', checked: false })).toBeInTheDocument();
  });
});
