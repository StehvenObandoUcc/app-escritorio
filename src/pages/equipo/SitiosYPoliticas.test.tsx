import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { EquipoPage } from './EquipoPage';
import { toDomain } from './SitiosYPoliticas';

async function teamWith(role: 'owner' | 'admin' | 'member') {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  let me = ana;
  if (role !== 'owner') {
    me = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
    cloud.debug.addMember(team, me, role, true);
    await cloud.signIn('beto@pulso.test', 'secreto-123');
  } else {
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(team, CONSENT_VERSION);
  }
  return { cloud, team, me };
}

describe('Sitios y políticas (ADR-0009)', () => {
  it('de una URL pegada se queda solo el dominio', () => {
    expect(toDomain('https://www.YouTube.com/shorts/abc?x=1')).toBe('youtube.com');
    expect(toDomain('netflix.com')).toBe('netflix.com');
    expect(toDomain('no es un sitio')).toBeNull();
    expect(toDomain('localhost')).toBeNull();
  });

  it('el admin marca un sitio como no permitido y lo puede quitar', async () => {
    const { cloud, team } = await teamWith('admin');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await userEvent.click(await screen.findByRole('tab', { name: 'Sitios y políticas' }));
    const section = await screen.findByRole('region', { name: 'Sitios y políticas' });
    await userEvent.type(within(section).getByLabelText('Sitio'), 'https://www.youtube.com/watch?v=secreto');
    await userEvent.click(within(section).getByRole('button', { name: 'Marcar como no permitido' }));
    const list = await within(section).findByRole('list', { name: 'Sitios no permitidos' });
    expect(list).toHaveTextContent('youtube.com');
    expect(list).not.toHaveTextContent('secreto');
    expect(await cloud.domainRules(team)).toEqual([expect.objectContaining({ domain: 'youtube.com', notAllowed: true })]);
    await userEvent.click(within(list).getByRole('button', { name: 'Quitar' }));
    await waitFor(async () => expect(await cloud.domainRules(team)).toEqual([]));
  });

  it('el owner desactiva las apps ocultas y Rust recibe la política', async () => {
    const { cloud } = await teamWith('owner');
    const bridge = createMockBridge();
    const policy = vi.spyOn(bridge, 'teamPolicySet');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await userEvent.click(await screen.findByRole('tab', { name: 'Sitios y políticas' }));
    const toggle = await screen.findByRole('checkbox', { name: /Permitir que cada persona oculte apps/ });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(policy).toHaveBeenLastCalledWith(expect.objectContaining({ allowHiddenApps: false })));
    expect((await cloud.myTeams())[0]!.allowHiddenApps).toBe(false);
  });

  it('una regla nueva llega a Rust al instante, marcada como no permitida (ADR-0010)', async () => {
    const { cloud } = await teamWith('owner');
    const bridge = createMockBridge();
    const rules = vi.spyOn(bridge, 'rulesSet');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await userEvent.click(await screen.findByRole('tab', { name: 'Sitios y políticas' }));
    const section = await screen.findByRole('region', { name: 'Sitios y políticas' });
    await userEvent.type(within(section).getByLabelText('Sitio'), 'youtube.com');
    await userEvent.click(within(section).getByRole('button', { name: 'Marcar como no permitido' }));
    await waitFor(() =>
      expect(rules).toHaveBeenLastCalledWith([expect.objectContaining({ match: 'domain', pattern: 'youtube.com', not_allowed: true })]),
    );
  });

  it('el owner elige si avisar y cada cuánto, y Rust recibe la política', async () => {
    const { cloud } = await teamWith('owner');
    const bridge = createMockBridge();
    const policy = vi.spyOn(bridge, 'teamPolicySet');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await userEvent.click(await screen.findByRole('tab', { name: 'Sitios y políticas' }));
    const repeat = await screen.findByLabelText('Repetir el aviso');
    expect(repeat).toHaveValue('10');
    await userEvent.selectOptions(repeat, '2');
    await waitFor(() => expect(policy).toHaveBeenLastCalledWith(expect.objectContaining({ alertNotAllowed: true, alertRepeatMinutes: 2 })));
    await userEvent.click(screen.getByRole('checkbox', { name: /Avisar con sonido/ }));
    await waitFor(() => expect(policy).toHaveBeenLastCalledWith(expect.objectContaining({ alertNotAllowed: false })));
    expect(screen.getByLabelText('Repetir el aviso')).toBeDisabled();
  });

  it('un member no ve la sección', async () => {
    const { cloud } = await teamWith('member');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    expect(await screen.findByRole('list', { name: 'Miembros del equipo' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sitios y políticas' })).not.toBeInTheDocument();
  });

  it('con el consentimiento de una versión anterior, se pide aceptar la nueva antes de subir nada', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const team = cloud.debug.addTeam('Equipo A', ana);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(team, '2026-10-v1');
    const bridge = createMockBridge();
    const active = vi.spyOn(bridge, 'activeTeamSet');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    expect(await screen.findByRole('button', { name: 'Aceptar la versión nueva' })).toBeInTheDocument();
    await waitFor(() => expect(active).toHaveBeenLastCalledWith(null, expect.any(String)));
  });
});
