import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { EquipoPage } from './EquipoPage';
import { PrivacidadPage } from './PrivacidadPage';

/** Nube con una persona ya dentro (sesión iniciada). */
async function signedIn(email = 'ana@pulso.test', name = 'Ana') {
  const cloud = createMockCloud();
  const id = cloud.debug.addAccount(email, 'secreto-123', name);
  await cloud.signIn(email, 'secreto-123');
  return { cloud, id };
}

const acceptConsent = async (button: string) => {
  const accept = await screen.findByRole('button', { name: button });
  expect(accept).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox'));
  expect(accept).toBeEnabled();
  await userEvent.click(accept);
};

describe('Equipo (EQ-01 a EQ-08, PS-02)', () => {
  it('crea un equipo, pide el consentimiento y solo entonces activa la subida (AC-6, AC-13)', async () => {
    const { cloud } = await signedIn();
    const bridge = createMockBridge();
    const activeTeam = vi.spyOn(bridge, 'activeTeamSet');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });

    await userEvent.type(await screen.findByLabelText('Nombre del equipo'), 'Estudio Norte');
    await userEvent.click(screen.getByRole('button', { name: 'Crear equipo' }));

    expect(await screen.findByRole('heading', { name: 'Antes de compartir datos con Estudio Norte' })).toBeInTheDocument();
    // Sin consentimiento, Rust no recibe equipo: nada de lo nuevo se sube.
    await waitFor(() => expect(activeTeam).toHaveBeenLastCalledWith(null, expect.any(String)));

    await acceptConsent('Aceptar y empezar a compartir');
    const [team] = await cloud.myTeams();
    expect(team).toMatchObject({ name: 'Estudio Norte', role: 'owner', consentVersion: CONSENT_VERSION });
    await waitFor(() => expect(activeTeam).toHaveBeenLastCalledWith(team!.id, expect.any(String)));
    expect(await screen.findByRole('list', { name: 'Miembros del equipo' })).toHaveTextContent('Ana (tú)');
  });

  it('el owner invita con un rol y puede revocar la invitación (AC-7, AC-9)', async () => {
    const { cloud, id } = await signedIn();
    await cloud.giveConsent(cloud.debug.addTeam('Equipo A', id), CONSENT_VERSION);
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });

    const form = await screen.findByRole('region', { name: 'Invitar personas' });
    expect(within(form).getByLabelText('Rol')).toHaveTextContent('Propietario');
    await userEvent.type(within(form).getByLabelText('Correo'), 'Beto@Pulso.test');
    await userEvent.selectOptions(within(form).getByLabelText('Rol'), 'admin');
    await userEvent.click(within(form).getByRole('button', { name: 'Invitar' }));
    const created = await within(form).findByRole('status');
    expect(created).toHaveTextContent('beto@pulso.test');
    // El código para compartir se ve al crear la invitación y en la lista de pendientes (ADR-0008).
    const [pending] = await cloud.teamInvitations((await cloud.myTeams())[0]!.id);
    expect(created).toHaveTextContent(pending!.code!);
    expect(within(form).getByLabelText(`Código ${pending!.code}`)).toBeInTheDocument();
    expect(await within(form).findByText('beto@pulso.test', { selector: 'li p' })).toBeInTheDocument();

    await userEvent.click(within(form).getByRole('button', { name: 'Revocar' }));
    await waitFor(() => expect(within(form).queryByText('beto@pulso.test', { selector: 'li p' })).not.toBeInTheDocument());
  });

  it('el admin solo puede invitar member o viewer; el member no ve el formulario', async () => {
    const owner = await signedIn('ana@pulso.test', 'Ana');
    const team = owner.cloud.debug.addTeam('Equipo A', owner.id);
    const beto = owner.cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
    owner.cloud.debug.addMember(team, beto, 'admin');
    await owner.cloud.signIn('beto@pulso.test', 'secreto-123');
    const view = renderWithSession(<EquipoPage />, { path: '/equipo', cloud: owner.cloud });
    const roles = within(await screen.findByRole('region', { name: 'Invitar personas' })).getByLabelText('Rol');
    expect([...roles.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Miembro', 'Observador']);
    view.unmount();

    const caro = owner.cloud.debug.addAccount('caro@pulso.test', 'secreto-123', 'Caro');
    owner.cloud.debug.addMember(team, caro, 'member');
    await owner.cloud.signIn('caro@pulso.test', 'secreto-123');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud: owner.cloud });
    expect(await screen.findByRole('list', { name: 'Miembros del equipo' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Invitar personas' })).not.toBeInTheDocument();
  });

  it('la persona invitada ve la invitación, acepta con consentimiento y entra con su rol (AC-8)', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const team = cloud.debug.addTeam('Equipo A', ana);
    cloud.debug.addAccount('fran@pulso.test', 'secreto-123', 'Fran');
    const invitation = cloud.debug.invite(team, 'fran@pulso.test', 'member', ana);
    await cloud.signIn('fran@pulso.test', 'secreto-123');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });

    const invitations = await screen.findByRole('region', { name: 'Invitaciones recibidas' });
    expect(invitations).toHaveTextContent('Equipo A');
    expect(invitations).toHaveTextContent('Ana te invitó como Miembro');
    await userEvent.click(within(invitations).getByRole('button', { name: 'Ver y responder' }));

    // Sin el código correcto no entra (ADR-0008).
    await userEvent.type(screen.getByLabelText('Código de invitación'), 'AAAA-AAAA');
    await acceptConsent('Aceptar y unirme');
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no coincide');

    await userEvent.clear(screen.getByLabelText('Código de invitación'));
    // Se acepta en minúsculas y sin guion.
    await userEvent.type(screen.getByLabelText('Código de invitación'), cloud.debug.codeOf(invitation).replace('-', '').toLowerCase());
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar y unirme' }));

    expect(await screen.findByRole('list', { name: 'Miembros del equipo' })).toHaveTextContent('Fran (tú)');
    expect(screen.queryByRole('region', { name: 'Invitaciones recibidas' })).not.toBeInTheDocument();
    expect((await cloud.myTeams())[0]).toMatchObject({ role: 'member', consentVersion: CONSENT_VERSION });
  });

  it('rechazar una invitación la quita de la lista', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    cloud.debug.invite(cloud.debug.addTeam('Equipo A', ana), 'fran@pulso.test', 'viewer', ana);
    cloud.debug.addAccount('fran@pulso.test', 'secreto-123', 'Fran');
    await cloud.signIn('fran@pulso.test', 'secreto-123');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await userEvent.click(await screen.findByRole('button', { name: 'Ver y responder' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar invitación' }));
    expect(await screen.findByRole('heading', { name: 'Crea tu primer equipo' })).toBeInTheDocument();
    expect(await cloud.myInvitations()).toEqual([]);
  });

  it('un viewer no ve la lista de miembros (AC-25)', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const team = cloud.debug.addTeam('Equipo A', ana);
    const dani = cloud.debug.addAccount('dani@pulso.test', 'secreto-123', 'Dani');
    cloud.debug.addMember(team, dani, 'viewer');
    await cloud.signIn('dani@pulso.test', 'secreto-123');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    expect(await screen.findByText(/no la lista de miembros/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Miembros del equipo' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  it('el observador no sube actividad: no recibe equipo en Rust y el estado lo explica, sin error', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const team = cloud.debug.addTeam('Equipo A', ana);
    const dani = cloud.debug.addAccount('dani@pulso.test', 'secreto-123', 'Dani');
    cloud.debug.addMember(team, dani, 'viewer');
    await cloud.signIn('dani@pulso.test', 'secreto-123');
    const bridge = createMockBridge();
    const active = vi.spyOn(bridge, 'activeTeamSet');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    const status = await screen.findByRole('region', { name: 'Sincronización' });
    expect(await within(status).findByText(/Como observador, tu actividad no se comparte/)).toBeInTheDocument();
    expect(within(status).queryByText('Error')).not.toBeInTheDocument();
    await waitFor(() => expect(active).toHaveBeenLastCalledWith(null, expect.any(String)));
    expect(active).not.toHaveBeenCalledWith(team, expect.anything());
  });

  it('expulsar pide confirmación y avisa qué se borra (AC-12)', async () => {
    const { cloud, id } = await signedIn();
    const team = cloud.debug.addTeam('Equipo A', id);
    await cloud.giveConsent(team, CONSENT_VERSION);
    cloud.debug.addMember(team, cloud.debug.addAccount('caro@pulso.test', 'secreto-123', 'Caro'), 'member');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    const list = await screen.findByRole('list', { name: 'Miembros del equipo' });
    await within(list).findByText('Caro');
    await userEvent.click(within(list).getByRole('button', { name: 'Expulsar' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Confirmar expulsión' });
    expect(confirm).toHaveTextContent('Se borrará su actividad');
    expect(confirm).toHaveTextContent('Exmiembro');
    await userEvent.click(within(confirm).getByRole('button', { name: 'Expulsar' }));
    await waitFor(() => expect(within(list).queryByText('Caro')).not.toBeInTheDocument());
  });

  it('el owner cede la propiedad: nombra a otro owner y deja de serlo (AC-10)', async () => {
    const { cloud, id } = await signedIn();
    const team = cloud.debug.addTeam('Equipo A', id);
    await cloud.giveConsent(team, CONSENT_VERSION);
    cloud.debug.addMember(team, cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto'), 'admin');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    expect(await screen.findByText(/Para ceder la propiedad/)).toBeInTheDocument();
    await userEvent.selectOptions(await screen.findByLabelText('Rol de Beto'), 'owner');
    await userEvent.click(await screen.findByRole('button', { name: 'Dejar de ser propietario' }));
    await waitFor(async () => expect((await cloud.myTeams())[0]?.role).toBe('admin'));
    expect(await screen.findByText('Tu rol: Administrador')).toBeInTheDocument();
  });

  it('el último owner no puede salir: se explica por qué', async () => {
    const { cloud, id } = await signedIn();
    await cloud.giveConsent(cloud.debug.addTeam('Equipo A', id), CONSENT_VERSION);
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await userEvent.click(await screen.findByRole('button', { name: 'Salir del equipo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, salir de Equipo A' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos un owner');
  });

  it('con dos equipos, cambiar el activo cambia los datos y el equipo de las filas nuevas (AC-11)', async () => {
    const { cloud, id } = await signedIn();
    const a = cloud.debug.addTeam('Equipo A', id);
    const b = cloud.debug.addTeam('Equipo B', id);
    await cloud.giveConsent(a, CONSENT_VERSION);
    await cloud.giveConsent(b, CONSENT_VERSION);
    const bridge = createMockBridge();
    const activeTeam = vi.spyOn(bridge, 'activeTeamSet');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await waitFor(() => expect(activeTeam).toHaveBeenLastCalledWith(a, expect.any(String)));
    await userEvent.selectOptions(await screen.findByLabelText('Equipo activo'), b);
    await waitFor(() => expect(activeTeam).toHaveBeenLastCalledWith(b, expect.any(String)));
    expect(screen.getByText('Equipo B', { selector: 'p' })).toBeInTheDocument();
  });

  it('muestra el estado de sincronización y su motivo (AC-19)', async () => {
    const { cloud, id } = await signedIn();
    const team = cloud.debug.addTeam('Equipo A', id);
    await cloud.giveConsent(team, CONSENT_VERSION);
    cloud.debug.setOffline(true);
    const bridge = createMockBridge();
    await bridge.activeTeamSet(team, id);
    await bridge.timeEntryAdd('2026-10-05T14:00:00Z', '2026-10-05T15:00:00Z');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    const status = await screen.findByRole('region', { name: 'Sincronización' });
    expect(await within(status).findByText('Pendiente')).toBeInTheDocument();
    expect(status).toHaveTextContent('Sin conexión');
    cloud.debug.setOffline(false);
    await userEvent.click(within(status).getByRole('button', { name: 'Sincronizar ahora' }));
    expect(await within(status).findByText('Al día')).toBeInTheDocument();
    expect(cloud.debug.uploaded.entries).toHaveLength(1);
  });
});

describe('Qué se mide y quién lo ve (PS-01)', () => {
  it('lista qué se mide, qué nunca y quién ve cada dato', () => {
    renderWithSession(<PrivacidadPage />);
    expect(screen.getByText('Qué nunca se mide')).toBeInTheDocument();
    expect(screen.getAllByText('Cierres de Pulso dentro de la jornada').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Registro de auditoría').length).toBeGreaterThan(0);
  });
});
