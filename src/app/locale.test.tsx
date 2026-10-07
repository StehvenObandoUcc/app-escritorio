import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { createMockBridge } from '@/bridge/mock';
import { setLocale } from '@/i18n';
import { AjustesPage } from '@/pages/ajustes/AjustesPage';
import { LocaleProvider } from './locale';

describe('idioma (ADR-0015, AC-34)', () => {
  afterEach(() => setLocale('es'));

  it('cambiar a inglés en Ajustes repinta la app y lo guarda para Rust', async () => {
    const bridge = createMockBridge();
    render(
      <LocaleProvider bridge={bridge}>
        <AjustesPage bridge={bridge} />
      </LocaleProvider>,
    );
    await userEvent.selectOptions(await screen.findByLabelText('Idioma de Pulso'), 'en');
    expect(await screen.findByRole('heading', { name: 'Settings', level: 1 })).toBeInTheDocument();
    expect(await screen.findByLabelText('Idle minutes')).toBeInTheDocument();
    expect((await bridge.settingsGet()).language).toBe('en');
  });

  it('al abrir, toma el idioma guardado', async () => {
    const bridge = createMockBridge();
    await bridge.settingsSet({ language: 'en' });
    render(
      <LocaleProvider bridge={bridge}>
        <AjustesPage bridge={bridge} />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings'));
    expect(document.documentElement.lang).toBe('en');
  });
});
