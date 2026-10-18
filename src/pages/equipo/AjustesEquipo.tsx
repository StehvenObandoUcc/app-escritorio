import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useSession } from '@/app/session';
import { IDLE_MINUTES_MAX, IDLE_MINUTES_MIN } from '@/bridge/contract';
import { PAUSE_CAP_MINUTES, type MyTeam, type TeamSettingsInput } from '@/cloud/contract';
import { t } from '@/i18n';
import { useForm } from '@/lib/useForm';
import { Button, Checkbox, Heading, Select, Surface } from '@/ui/atoms';
import { FormField } from '@/ui/molecules';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const IDLE_OPTIONS = Array.from({ length: IDLE_MINUTES_MAX - IDLE_MINUTES_MIN + 1 }, (_, i) => IDLE_MINUTES_MIN + i);
const WEEK = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_KEY = { 1: 'd1', 2: 'd2', 3: 'd3', 4: 'd4', 5: 'd5', 6: 'd6', 7: 'd7' } as const;

/** Lo que edita el formulario: el umbral va como texto del selector ('' = sin valor de equipo). */
interface Draft {
  idle: string;
  days: number[];
  start: string;
  end: string;
  aiCountsAsProductive: boolean;
  presenceVisibleToMembers: boolean;
  pauseCapMinutes: number;
}

const draftOf = (team: MyTeam): Draft => ({
  idle: team.idleMinutes === null ? '' : String(team.idleMinutes),
  days: [...team.workday.days],
  start: team.workday.start,
  end: team.workday.end,
  aiCountsAsProductive: team.aiCountsAsProductive,
  presenceVisibleToMembers: team.presenceVisibleToMembers,
  pauseCapMinutes: team.pauseCapMinutes,
});

/** Mismas reglas que `set_team_settings` (D-9), con el mensaje junto al campo. Se arma al usarlo para tomar el idioma activo. */
const settingsSchema = () =>
  z
    .object({
      idle: z.string().refine((v) => v === '' || IDLE_OPTIONS.includes(Number(v)), t('teamSettings.idleHint')),
      days: z
        .array(z.number().int().min(1).max(7))
        .min(1, t('teamSettings.daysError'))
        .refine((d) => new Set(d).size === d.length, t('teamSettings.daysRepeated')),
      start: z.string().regex(HHMM, t('forms.required')),
      end: z.string().regex(HHMM, t('forms.required')),
      aiCountsAsProductive: z.boolean(),
      presenceVisibleToMembers: z.boolean(),
      pauseCapMinutes: z.number().refine((m) => (PAUSE_CAP_MINUTES as readonly number[]).includes(m)),
    })
    .refine((v) => v.start < v.end, { message: t('forms.endAfterStart'), path: ['end'] });

const toInput = (d: z.infer<ReturnType<typeof settingsSchema>>): TeamSettingsInput => ({
  idleMinutes: d.idle === '' ? null : Number(d.idle),
  workday: { days: [...d.days].sort((a, b) => a - b), start: d.start, end: d.end },
  aiCountsAsProductive: d.aiCountsAsProductive,
  presenceVisibleToMembers: d.presenceVisibleToMembers,
  pauseCapMinutes: d.pauseCapMinutes,
});

/**
 * Ajustes del equipo (EQ-09, F5 D-9 y D-19), solo para owner y admin: umbral de inactividad, jornada, regla de IA,
 * presencia visible y tope de pausa. Valida como el servidor y, al guardar, vuelve a leer los equipos para que
 * `activeTeam` traiga los valores nuevos.
 */
export function TeamSettingsSection({ team }: { team: MyTeam }) {
  const { cloud, refresh } = useSession();
  const [draft, setDraft] = useState<Draft>(() => draftOf(team));
  const [saved, setSaved] = useState(false);
  const { ref, errors, formError, busy, submit: send, onKeyDown } = useForm(settingsSchema);

  if (team.role !== 'owner' && team.role !== 'admin') return null;

  const change = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaved(false);
  };
  const toggleDay = (day: number) => change({ days: draft.days.includes(day) ? draft.days.filter((d) => d !== day) : [...draft.days, day] });

  const submit = (e: FormEvent) => {
    setSaved(false);
    void send(
      draft,
      async (data) => {
        await cloud.setTeamSettings(team.id, toInput(data));
        await refresh();
        setSaved(true);
      },
      e,
    );
  };

  return (
    <Surface as="section" aria-label={t('teamSettings.title')}>
      <form ref={ref} onSubmit={submit} onKeyDown={onKeyDown} className="flex max-w-prose flex-col gap-5" noValidate>
        <div>
          <Heading level={2}>{t('teamSettings.title')}</Heading>
          <p className="mt-1 text-sm text-fg-muted">{t('teamSettings.hint')}</p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="team-idle" className="text-sm font-medium text-fg">
            {t('teamSettings.idle')}
          </label>
          <Select
            id="team-idle"
            name="idle"
            invalid={Boolean(errors.idle)}
            aria-describedby="team-idle-help"
            value={draft.idle}
            onChange={(e) => change({ idle: e.target.value })}
            options={[
              { value: '', label: t('teamSettings.idleNone') },
              ...IDLE_OPTIONS.map((n) => ({ value: String(n), label: t('teamSettings.minutes', { n }) })),
            ]}
          />
          <p id="team-idle-help" role={errors.idle ? 'alert' : undefined} className={errors.idle ? 'text-sm text-danger' : 'text-sm text-fg-muted'}>
            {errors.idle ?? t('teamSettings.idleHint')}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-fg">{t('teamSettings.days')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {WEEK.map((day) => (
              <label key={day} className="flex items-center gap-2 text-fg">
                <Checkbox name="days" aria-invalid={errors.days ? true : undefined} aria-describedby={errors.days ? 'team-days-error' : undefined} checked={draft.days.includes(day)} onChange={() => toggleDay(day)} />
                {t(`teamSettings.day.${DAY_KEY[day]}`)}
              </label>
            ))}
          </div>
          {errors.days && (
            <p id="team-days-error" role="alert" className="text-sm text-danger">
              {errors.days}
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <FormField name="start" type="time" label={t('teamSettings.start')} value={draft.start} error={errors.start} onChange={(e) => change({ start: e.target.value })} />
          <FormField name="end" type="time" label={t('teamSettings.end')} value={draft.end} error={errors.end} onChange={(e) => change({ end: e.target.value })} />
        </div>

        <label className="flex items-start gap-3">
          <Checkbox name="aiCountsAsProductive" className="mt-1" checked={draft.aiCountsAsProductive} onChange={(e) => change({ aiCountsAsProductive: e.target.checked })} />
          <span>
            <span className="block font-medium text-fg">{t('teamSettings.ai')}</span>
            <span className="block text-sm text-fg-muted">{t('teamSettings.aiHint')}</span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <Checkbox name="presenceVisibleToMembers" className="mt-1" checked={draft.presenceVisibleToMembers} onChange={(e) => change({ presenceVisibleToMembers: e.target.checked })} />
          <span>
            <span className="block font-medium text-fg">{t('teamSettings.presence')}</span>
            <span className="block text-sm text-fg-muted">{t('teamSettings.presenceHint')}</span>
          </span>
        </label>

        <div className="flex flex-col gap-1">
          <label htmlFor="team-pause-cap" className="text-sm font-medium text-fg">
            {t('teamSettings.pauseCap')}
          </label>
          <Select
            id="team-pause-cap"
            name="pauseCapMinutes"
            value={String(draft.pauseCapMinutes)}
            onChange={(e) => change({ pauseCapMinutes: Number(e.target.value) })}
            options={PAUSE_CAP_MINUTES.map((m) => ({ value: String(m), label: m === 0 ? t('teamSettings.pauseNone') : t('teamSettings.minutes', { n: m }) }))}
          />
          <p className="text-sm text-fg-muted">{t('teamSettings.pauseCapHint')}</p>
        </div>

        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-fg">
            {t('teamSettings.saved')}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" disabled={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
