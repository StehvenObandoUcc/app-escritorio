import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ReviewField } from '@/cloud/contract';
import { t } from '@/i18n';
import { LIMITS } from '@/lib/limits';
import { Button, Input, Select } from '@/ui/atoms';

const KINDS: ReviewField['kind'][] = ['text', 'url', 'image', 'file', 'checklist'];
/** Campo fijo del formulario de entrega (ADR-0016). */
const SUMMARY_KEY = 'summary';

/** Clave estable a partir del nombre: «Pruebas pasan» → «pruebas_pasan». */
export const fieldKey = (label: string, taken: string[]) => {
  const base = label.normalize('NFKD').replace(/[^\w\s]/g, '').trim().toLowerCase().replace(/\s+/g, '_').slice(0, 24) || 'campo';
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
};

/** Formulario de entrega del proyecto (fila 30): campos de texto, enlace o casilla, obligatorios u opcionales. */
export function ReviewTemplateEditor({ fields, onSave }: { fields: ReviewField[]; onSave: (fields: ReviewField[]) => Promise<void> }) {
  const [draft, setDraft] = useState(fields);
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const update = (i: number, patch: Partial<ReviewField>) => setDraft((d) => d.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t('projects.template.fields')} className="flex flex-col gap-2">
        {draft.map((f, i) => {
          // AC-38: «Qué se hizo» siempre es texto obligatorio; solo se puede cambiar su nombre.
          const locked = f.key === SUMMARY_KEY;
          return (
            <li key={f.key} className="flex flex-wrap items-center gap-2">
              <Input
                className="min-w-40 flex-1"
                aria-label={t('projects.template.fieldName')}
                value={f.label}
                maxLength={LIMITS.templateFields.label}
                invalid={!f.label.trim()}
                onChange={(e) => update(i, { label: e.target.value })}
              />
              <Select
                size="sm"
                aria-label={t('projects.template.fieldKind')}
                value={f.kind}
                disabled={locked}
                onChange={(e) => update(i, { kind: e.target.value as ReviewField['kind'] })}
                options={KINDS.map((k) => ({ value: k, label: t(`projects.template.kind.${k}`) }))}
              />
              <label className="flex items-center gap-1 text-sm text-fg">
                <input type="checkbox" checked={f.required} disabled={locked} onChange={(e) => update(i, { required: e.target.checked })} />
                {t('projects.template.required')}
              </label>
              {locked ? (
                <span className="text-xs text-fg-muted">{t('projects.template.locked')}</span>
              ) : (
                <Button size="sm" variant="ghost" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}>
                  {t('common.remove')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim() || draft.length >= LIMITS.templateFields.count) return;
          setDraft((d) => [...d, { key: fieldKey(label, d.map((f) => f.key)), label: label.trim(), kind: 'text', required: false }]);
          setLabel('');
        }}
      >
        <Input className="min-w-40 flex-1" aria-label={t('projects.template.newField')} placeholder={t('projects.template.newFieldPlaceholder')} maxLength={LIMITS.templateFields.label} value={label} onChange={(e) => setLabel(e.target.value)} />
        <Button type="submit" size="sm" disabled={!label.trim() || draft.length >= LIMITS.templateFields.count}>
          {t('projects.template.add')}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div>
        <Button
          variant="primary"
          size="sm"
          disabled={draft.some((f) => !f.label.trim())}
          onClick={() => {
            setError(null);
            onSave(draft.map((f) => ({ ...f, label: f.label.trim() }))).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
          }}
        >
          {t('projects.template.save')}
        </Button>
      </div>
    </div>
  );
}
