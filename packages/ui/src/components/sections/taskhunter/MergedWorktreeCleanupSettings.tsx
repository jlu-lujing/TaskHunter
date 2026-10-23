import React from 'react';
import { SettingsCheckboxRow, SettingsSection } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';

export const MergedWorktreeCleanupSettings: React.FC = () => {
  const { t } = useI18n();
  const enabled = useUIStore((state) => state.mergedWorktreeCleanupEnabled);
  const setEnabled = useUIStore((state) => state.setMergedWorktreeCleanupEnabled);

  return (
    <SettingsSection
      settingsItem="sessions.merged-worktree-cleanup-section"
      title={t('settings.taskhunter.mergedWorktreeCleanup.title')}
      info={t('settings.taskhunter.mergedWorktreeCleanup.info')}
    >
      <SettingsCheckboxRow
        settingsItem="sessions.merged-worktree-cleanup"
        checked={enabled}
        onChange={setEnabled}
        label={t('settings.taskhunter.mergedWorktreeCleanup.field.enable')}
        description={t('settings.taskhunter.mergedWorktreeCleanup.field.enableDescription')}
      />
    </SettingsSection>
  );
};
