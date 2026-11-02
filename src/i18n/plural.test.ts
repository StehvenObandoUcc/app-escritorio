import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from '@/i18n';

afterEach(() => setLocale('es'));

describe('borrar una tarea con subtareas', () => {
  it('con una sola subtarea dice «subtarea», en singular', () => {
    expect(t('tasks.page.deleteWithSubtasks', { n: 1 })).toContain('su subtarea');
    expect(t('tasks.page.deleteWithSubtasks', { n: 3 })).toContain('sus 3 subtareas');
    setLocale('en');
    expect(t('tasks.page.deleteWithSubtasks', { n: 1 })).toContain('Its subtask');
    expect(t('tasks.page.deleteWithSubtasks', { n: 3 })).toContain('Its 3 subtasks');
  });
});
