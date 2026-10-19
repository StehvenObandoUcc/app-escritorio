import { ClipboardCheck, X } from 'lucide-react';
import { t } from '@/i18n';
import { Button } from '@/ui/atoms';

export interface TaskNoticeItem {
  key: string;
  kind: 'toReview' | 'returned' | 'approved';
  taskId: string;
  projectId: string;
  title: string;
}

/** Avisos de revisión de tareas (F6-3), en cualquier pantalla y hasta que la persona los cierra. */
export function TaskNoticeBanner({ notices, onDismiss }: { notices: TaskNoticeItem[]; onDismiss: (key: string) => void }) {
  if (notices.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col gap-2 md:left-auto md:w-full md:max-w-auth">
      {notices.map((n) => (
        <div key={n.key} role="status" className="pointer-events-auto flex items-start gap-3 rounded-lg border border-accent bg-surface p-3 shadow-overlay">
          <ClipboardCheck size={20} aria-hidden="true" className="mt-1 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">{t(`taskNotices.${n.kind}`, { title: n.title })}</p>
            <a
              href={`#/proyectos/${n.projectId}/tareas/${n.taskId}`}
              onClick={() => onDismiss(n.key)}
              className="rounded-xs text-sm text-fg-muted underline hover:text-fg"
            >
              {t('taskNotices.open')}
            </a>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onDismiss(n.key)} icon={<X size={16} aria-hidden="true" />}>
            {t('alerts.ok')}
          </Button>
        </div>
      ))}
    </div>
  );
}
