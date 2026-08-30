import React from 'react';
import { toast } from '@/components/ui';
import { NumberInput } from '@/components/ui/number-input';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsCheckboxRow,
  SettingsChipGroup,
  SettingsInset,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_NUMBER_INPUT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionAutoCleanup } from '@/hooks/useSessionAutoCleanup';
import { useI18n, type I18nKey } from '@/lib/i18n';

const MIN_DAYS = 1;
const MAX_DAYS = 365;
const DEFAULT_RETENTION_DAYS = 30;
const RETENTION_ACTION_OPTIONS: Array<{ value: 'archive' | 'delete'; labelKey: I18nKey }> = [
  { value: 'archive', labelKey: 'settings.taskhunter.sessionRetention.action.archive' },
  { value: 'delete', labelKey: 'settings.taskhunter.sessionRetention.action.delete' },
];

export const SessionRetentionSettings: React.FC = () => {
  const { t } = useI18n();
  const autoDeleteEnabled = useUIStore((state) => state.autoDeleteEnabled);
  const autoDeleteAfterDays = useUIStore((state) => state.autoDeleteAfterDays);
  const sessionRetentionAction = useUIStore((state) => state.sessionRetentionAction);
  const setAutoDeleteEnabled = useUIStore((state) => state.setAutoDeleteEnabled);
  const setAutoDeleteAfterDays = useUIStore((state) => state.setAutoDeleteAfterDays);
  const setSessionRetentionAction = useUIStore((state) => state.setSessionRetentionAction);

  const { candidates, isRunning, runCleanup, action } = useSessionAutoCleanup({ autoRun: false });
  const pendingCount = candidates.length;

  const handleRunCleanup = React.useCallback(async () => {
    const result = await runCleanup({ force: true });

    if (result.completedIds.length === 0 && result.failedIds.length === 0) {
      toast.message(
        result.action === 'archive'
          ? t('settings.taskhunter.sessionRetention.toast.noneEligibleArchive')
          : t('settings.taskhunter.sessionRetention.toast.noneEligibleDelete')
      );
      return;
    }
    if (result.completedIds.length > 0) {
      toast.success(
        result.action === 'archive'
          ? t('settings.taskhunter.sessionRetention.toast.archivedCount', { count: result.completedIds.length })
          : t('settings.taskhunter.sessionRetention.toast.deletedCount', { count: result.completedIds.length })
      );
    }
    if (result.failedIds.length > 0) {
      toast.error(
        result.action === 'archive'
          ? t('settings.taskhunter.sessionRetention.toast.failedArchiveCount', { count: result.failedIds.length })
          : t('settings.taskhunter.sessionRetention.toast.failedDeleteCount', { count: result.failedIds.length })
      );
    }
  }, [runCleanup, t]);

  return (
    <SettingsSection
      title={t('settings.taskhunter.sessionRetention.title')}
      info={t('settings.taskhunter.sessionRetention.tooltip')}
    >
      <SettingsCheckboxRow
        settingsItem="sessions.auto-cleanup"
        checked={autoDeleteEnabled}
        onChange={setAutoDeleteEnabled}
        label={t('settings.taskhunter.sessionRetention.field.enableAutoCleanup')}
        ariaLabel={t('settings.taskhunter.sessionRetention.field.enableAutoCleanupAria')}
      />

      <SettingsInset className="space-y-0">
        <SettingsFieldRow
          settingsItem="sessions.retention-period"
          label={t('settings.taskhunter.sessionRetention.field.retentionPeriod')}
        >
          <NumberInput
            value={autoDeleteAfterDays}
            onValueChange={setAutoDeleteAfterDays}
            min={MIN_DAYS}
            max={MAX_DAYS}
            step={1}
            aria-label={t('settings.taskhunter.sessionRetention.field.retentionPeriodAria')}
            className={cn(SETTINGS_NUMBER_INPUT_CLASS, 'tabular-nums')}
          />
          <span className="typography-ui-label text-muted-foreground">{t('settings.taskhunter.sessionRetention.field.days')}</span>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => setAutoDeleteAfterDays(DEFAULT_RETENTION_DAYS)}
            disabled={autoDeleteAfterDays === DEFAULT_RETENTION_DAYS}
            className={SETTINGS_ICON_BUTTON_CLASS}
            aria-label={t('settings.taskhunter.sessionRetention.actions.resetRetentionAria')}
            title={t('settings.common.actions.reset')}
          >
            <Icon name="restart" className="h-3.5 w-3.5" />
          </Button>
        </SettingsFieldRow>

        <SettingsFieldRow
          settingsItem="sessions.retention-action"
          label={t('settings.taskhunter.sessionRetention.field.whenSessionsExpire')}
        >
          <SettingsChipGroup
            value={sessionRetentionAction}
            onChange={setSessionRetentionAction}
            options={RETENTION_ACTION_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
          />
        </SettingsFieldRow>
      </SettingsInset>

      <div className="mt-1 py-1.5 space-y-1">
        <SettingsFieldRow
          label={t('settings.taskhunter.sessionRetention.manualCleanup.title')}
        >
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleRunCleanup}
            disabled={isRunning}
            className="!font-normal"
          >
            {isRunning ? t('settings.taskhunter.sessionRetention.actions.cleaningUp') : t('settings.taskhunter.sessionRetention.actions.runCleanupNow')}
          </Button>
        </SettingsFieldRow>
        <p className="typography-meta text-muted-foreground">
          {action === 'archive'
            ? t('settings.taskhunter.sessionRetention.manualCleanup.eligibleArchiveNow', { count: pendingCount })
            : t('settings.taskhunter.sessionRetention.manualCleanup.eligibleDeleteNow', { count: pendingCount })}
        </p>
      </div>
    </SettingsSection>
  );
};
