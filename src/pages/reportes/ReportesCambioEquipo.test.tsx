import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useSession } from '@/app/session';
import { renderWithSession } from '@/app/testing';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { ReportesPage } from './ReportesPage';

function SwitchTo({ team }: { team: string }) {
  const { selectTeam } = useSession();
  return <button onClick={() => selectTeam(team)}>Cambiar de equipo</button>;
}

describe('Reportes al cambiar de equipo', () => {
  it('lo elegido en el equipo anterior no se arrastra: en el nuevo, «Sobre» vuelve a Mi trabajo y se genera personal', async () => {
    localStorage.clear();
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const beto = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
    const a = cloud.debug.addTeam('Equipo A', ana);
    const b = cloud.debug.addTeam('Equipo B', beto);
    cloud.debug.addMember(b, ana, 'member', true);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(a, CONSENT_VERSION);
    const free = vi.spyOn(cloud, 'generateFreeReport');

    renderWithSession(
      <>
        <SwitchTo team={b} />
        <ReportesPage />
      </>,
      { path: '/reportes', cloud },
    );
    const about = await screen.findByLabelText('Sobre');
    await userEvent.selectOptions(about, await screen.findByRole('option', { name: 'Todo el equipo: Equipo A' }));
    expect(about).toHaveValue('team');

    await userEvent.click(screen.getByRole('button', { name: 'Cambiar de equipo' }));
    await waitFor(() => expect(screen.queryByRole('option', { name: /Todo el equipo/ })).not.toBeInTheDocument());
    expect(screen.getByLabelText('Sobre')).toHaveValue('personal');

    await userEvent.click(screen.getByRole('button', { name: 'Generar' }));
    await waitFor(() => expect(free).toHaveBeenCalled());
    expect(free.mock.calls[0]![0]).toMatchObject({ teamId: b, scope: 'personal', subjectId: ana });
  }, 20_000);
});
