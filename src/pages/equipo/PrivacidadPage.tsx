import { CONSENT_POINTS, CONSENT_VERSION } from '@/lib/consent';
import { describeMark, VISIBILITY } from '@/lib/privacy';
import { Heading, Surface } from '@/ui/atoms';
import { PageLayout } from '@/ui/templates';

const COLUMNS = [
  { key: 'owner', label: 'Propietario' },
  { key: 'admin', label: 'Administrador' },
  { key: 'lead', label: 'Líder de proyecto' },
  { key: 'member', label: 'Miembro' },
  { key: 'viewer', label: 'Observador' },
] as const;

/** «Qué se mide y quién lo ve» (PS-01). Las filas repiten docs/ROLES.md (comprobado en privacy.test.ts). */
export function PrivacidadPage() {
  return (
    <PageLayout title="Qué se mide y quién lo ve" subtitle={`Consentimiento versión ${CONSENT_VERSION}`}>
      <Surface as="section" aria-label="Qué se mide">
        <dl className="flex flex-col gap-3">
          {CONSENT_POINTS.map((p) => (
            <div key={p.title}>
              <dt className="font-medium text-fg">{p.title}</dt>
              <dd className="max-w-prose text-fg-muted">{p.text}</dd>
            </div>
          ))}
        </dl>
      </Surface>
      <Surface as="section" aria-label="Quién ve cada dato" padding="flush">
        <div className="p-4 md:p-5">
          <Heading level={2}>Quién ve cada dato</Heading>
          <p className="mt-1 text-sm text-fg-muted">Lo aplica la base de datos, no solo la app: cada celda tiene su prueba.</p>
        </div>
        {/* En ventanas estrechas, una tarjeta por dato; desde 1024 px, tabla. */}
        <ul className="flex flex-col divide-y divide-line border-t border-line lg:hidden">
          {VISIBILITY.map((v) => (
            <li key={v.row} className="p-4">
              <p className="font-medium text-fg">{v.what}</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                {COLUMNS.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-fg-muted">{c.label}</dt>
                    <dd className="text-fg">{describeMark(v[c.key])}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <table className="hidden w-full border-t border-line text-sm lg:table">
          <thead>
            <tr className="text-left text-fg-muted">
              <th scope="col" className="p-3 font-medium">
                Dato
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} scope="col" className="p-3 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {VISIBILITY.map((v) => (
              <tr key={v.row}>
                <th scope="row" className="p-3 text-left font-medium text-fg">
                  {v.what}
                </th>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="p-3 text-fg">
                    {describeMark(v[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </PageLayout>
  );
}
