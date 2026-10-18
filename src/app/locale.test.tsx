import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockBridge } from '@/bridge/mock';
import { setLocale } from '@/i18n';
import { AccesoPage } from '@/pages/acceso/AccesoPage';
import { AjustesPage } from '@/pages/ajustes/AjustesPage';
import { LocaleProvider } from './locale';
import { renderWithSession } from './testing';

describe('idioma (ADR-0015, AC-34)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    setLocale('es');
    Object.defineProperty(navigator, 'language', { value: 'es-CO', configurable: true });
  });

  it('el primer arranque toma el idioma del sistema y lo guarda; después manda lo guardado (F-03)', async () => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    const bridge = createMockBridge();
    const first = render(
      <LocaleProvider bridge={bridge}>
        <AjustesPage bridge={bridge} />
      </LocaleProvider>,
    );
    // Nada se pinta antes de saber el idioma: el primer título ya sale en inglés.
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Settings');
    await waitFor(async () => expect((await bridge.settingsGet()).language).toBe('en'));
    first.unmount();

    // Segunda vez: aunque el sistema siga en inglés, se respeta lo elegido (aquí, español).
    setLocale('es');
    await bridge.settingsSet({ language: 'es' });
    render(
      <LocaleProvider bridge={bridge}>
        <AjustesPage bridge={bridge} />
      </LocaleProvider>,
    );
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Ajustes');
  });

  it('el acceso tiene selector de idioma; al cambiar, el foco vuelve al selector y se anuncia (F-03, F-08)', async () => {
    const bridge = createMockBridge();
    renderWithSession(
      <LocaleProvider bridge={bridge}>
        <AccesoPage />
      </LocaleProvider>,
      { bridge },
    );
    const select = await screen.findByLabelText('Idioma (Language)');
    await userEvent.selectOptions(select, 'en');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Language (Idioma)')).toHaveFocus();
    expect(screen.getByText('Language changed to English.')).toBeInTheDocument();
    expect((await bridge.settingsGet()).language).toBe('en');
  });

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
