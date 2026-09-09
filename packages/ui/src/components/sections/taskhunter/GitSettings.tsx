import React from 'react';
import { loadDesktopSettings, updateDesktopSettings } from '@/lib/persistence';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore } from '@/stores/useUIStore';
import { setFilesViewShowGitignored, useFilesViewShowGitignored } from '@/lib/filesViewShowGitignored';
import { useI18n } from '@/lib/i18n';
import {
  SettingsSection,
  SettingsControlGroup,
  SettingsRadioGroup,
  SettingsRadioOption,
  SettingsCheckboxRow,
  SETTINGS_OPTION_STACK_CLASS,
} from '@/components/sections/shared/SettingsSection';

export const GitSettings: React.FC = () => {
  const { t } = useI18n();
  const settingsGitmojiEnabled = useConfigStore((state) => state.settingsGitmojiEnabled);
  const setSettingsGitmojiEnabled = useConfigStore((state) => state.setSettingsGitmojiEnabled);
  const showGitignored = useFilesViewShowGitignored();
  const gitChangesViewMode = useUIStore((state) => state.gitChangesViewMode);
  const setGitChangesViewMode = useUIStore((state) => state.setGitChangesViewMode);

  const [isLoading, setIsLoading] = React.useState(true);
  const viewOptions = React.useMemo(
    () => [
      { id: 'flat' as const, label: t('settings.taskhunter.git.option.flatList') },
      { id: 'tree' as const, label: t('settings.taskhunter.git.option.treeView') },
    ],
    [t]
  );

  // Load current settings
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        const data = await loadDesktopSettings();
        if (data) {
          if (data.gitmojiEnabled !== undefined) {
            setSettingsGitmojiEnabled(data.gitmojiEnabled);
          }
          if (data.gitChangesViewMode !== undefined) {
            setGitChangesViewMode(data.gitChangesViewMode);
          }
        }

      } catch (error) {
        console.warn('Failed to load git settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [setGitChangesViewMode, setSettingsGitmojiEnabled]);

  const handleGitmojiChange = React.useCallback(async (enabled: boolean) => {
    setSettingsGitmojiEnabled(enabled);
    try {
      await updateDesktopSettings({
        gitmojiEnabled: enabled,
      });
    } catch (error) {
      console.warn('Failed to save gitmoji setting:', error);
    }
  }, [setSettingsGitmojiEnabled]);

  const handleGitChangesViewModeChange = React.useCallback((mode: 'flat' | 'tree') => {
    if (mode === gitChangesViewMode) {
      return;
    }

    setGitChangesViewMode(mode);
    void updateDesktopSettings({ gitChangesViewMode: mode });
  }, [gitChangesViewMode, setGitChangesViewMode]);

  if (isLoading) {
    return null;
  }

  return (
    <SettingsSection title={t('settings.taskhunter.git.title')}>
      <div className={SETTINGS_OPTION_STACK_CLASS}>
        <SettingsControlGroup
          settingsItem="git.changes-view"
          title={t('settings.taskhunter.git.changesViewTitle')}
        >
          <SettingsRadioGroup aria-label={t('settings.taskhunter.git.changesViewAria')}>
            {viewOptions.map((option) => (
              <SettingsRadioOption
                key={option.id}
                selected={gitChangesViewMode === option.id}
                onSelect={() => {
                  handleGitChangesViewModeChange(option.id);
                }}
                label={option.label}
                ariaLabel={t('settings.taskhunter.git.optionAria', { option: option.label })}
              />
            ))}
          </SettingsRadioGroup>
        </SettingsControlGroup>

        <SettingsCheckboxRow
          settingsItem="git.gitmoji"
          checked={settingsGitmojiEnabled}
          onChange={(checked) => {
            void handleGitmojiChange(checked);
          }}
          label={t('settings.taskhunter.git.enableGitmoji')}
          ariaLabel={t('settings.taskhunter.git.enableGitmojiAria')}
        />

        <SettingsCheckboxRow
          settingsItem="git.gitignored-files"
          checked={showGitignored}
          onChange={setFilesViewShowGitignored}
          label={t('settings.taskhunter.git.showGitignored')}
          ariaLabel={t('settings.taskhunter.git.showGitignoredAria')}
        />
      </div>
    </SettingsSection>
  );
};
