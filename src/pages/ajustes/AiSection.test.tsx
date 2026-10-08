import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createMockBridge } from '@/bridge/mock';
import type { ActivityBlock } from '@/bridge/contract';
import { ActivityList } from '@/ui/organisms';
import { AiSection } from './AiSection';

/** *Ajustes → IA* (spec F4: AC-18 a AC-20) y etiquetar la IA en *Mi día* (AC-29). */
describe('IA con tu propio proveedor', () => {
  it('rechaza http:// fuera de localhost, guarda y nunca muestra la clave', async () => {
    const bridge = createMockBridge();
    render(<AiSection bridge={bridge} />);
    const url = await screen.findByLabelText(/URL base/);
    expect(url).toHaveValue('https://openrouter.ai/api/v1');
    await userEvent.clear(url);
    await userEvent.type(url, 'http://api.ejemplo.com/v1');
    await userEvent.type(screen.getByLabelText(/^Modelo/), 'modelo-x');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('debe empezar por https://');

    await userEvent.selectOptions(screen.getByLabelText('Proveedor'), 'Ollama (en este equipo)');
    expect(url).toHaveValue('http://localhost:11434/v1');
    await userEvent.type(screen.getByLabelText(/^Clave de API/), 'sk-secreta');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Configuración guardada')).toBeInTheDocument();
    expect(await screen.findByText(/Hay una clave guardada/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Clave de API/)).toHaveValue('');
    expect(document.body.textContent).not.toContain('sk-secreta');
    expect(await bridge.aiConfigGet()).toEqual({ baseUrl: 'http://localhost:11434/v1', model: 'modelo-x', hasKey: true });
  });

  it('probar conexión dice si el proveedor respondió o qué falló', async () => {
    const bridge = createMockBridge();
    await bridge.aiConfigSet('https://api.deepseek.com', 'modelo-x', 'sk');
    const aiChat = vi.spyOn(bridge, 'aiChat').mockRejectedValueOnce(new Error('La clave de IA no es válida o no tiene permiso.'));
    render(<AiSection bridge={bridge} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La prueba falló: La clave de IA no es válida o no tiene permiso.');
    aiChat.mockResolvedValueOnce('{"ok": true}');
    await userEvent.click(screen.getByRole('button', { name: 'Probar conexión' }));
    expect(await screen.findByText('Conexión correcta: el proveedor respondió.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Borrar configuración' }));
    expect(await screen.findByText('Configuración y clave borradas')).toBeInTheDocument();
    expect(await bridge.aiConfigGet()).toEqual({ baseUrl: null, model: null, hasKey: false });
  });
});

describe('etiquetar la IA en Mi día (AC-29)', () => {
  const block = (id: string, category: ActivityBlock['category']): ActivityBlock => ({
    id,
    startedAt: '2026-10-08T14:00:00Z',
    endedAt: '2026-10-08T14:30:00Z',
    appName: 'chrome',
    title: null,
    category,
    aiTool: category === 'ai' ? 'ChatGPT' : null,
    domain: null,
    aiUsage: category === 'ai' ? 'code' : null,
  });

  it('solo los bloques de IA tienen el selector, y elegir o quitar la etiqueta llama al puente', async () => {
    const onAiUsage = vi.fn();
    render(<ActivityList blocks={[block('00000000-0000-4000-8000-000000000001', 'ai'), block('00000000-0000-4000-8000-000000000002', 'productive')]} onAiUsage={onAiUsage} />);
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(1);
    expect(selects[0]).toHaveValue('code');
    await userEvent.selectOptions(selects[0]!, 'Redacción');
    await userEvent.selectOptions(selects[0]!, 'Sin etiquetar');
    expect(onAiUsage.mock.calls).toEqual([
      ['00000000-0000-4000-8000-000000000001', 'writing'],
      ['00000000-0000-4000-8000-000000000001', null],
    ]);
  });
});
