import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui';
import {
  SettingsSection,
  SettingsFieldRow,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
  SETTINGS_SELECT_SIZE,
} from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';

type Engine = 'opencode' | 'builtin';

const DEFAULT_ENGINE_MODEL = 'opencode-go/deepseek-v4-flash';

export const AgentEngineSettings: React.FC = () => {
  const { t } = useI18n();
  const [engine, setEngine] = React.useState<Engine>('opencode');
  const [engineModel, setEngineModel] = React.useState(DEFAULT_ENGINE_MODEL);
  const [modelDraft, setModelDraft] = React.useState('');
  const [keyConfigured, setKeyConfigured] = React.useState(false);
  const [keyDraft, setKeyDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await runtimeFetch('/api/config/settings', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        // SAFETY: response.json() is untyped; the shape matches the server's
        // formatSettingsResponse contract (engine/engineModel are the fields this
        // page reads, both optional strings).
        const data = (await response.json().catch(() => null)) as { engine?: string; engineModel?: string } | null;
        if (cancelled || !data) return;
        if (data.engine === 'builtin' || data.engine === 'opencode') setEngine(data.engine);
        if (data.engineModel && data.engineModel.includes('/')) {
          setEngineModel(data.engineModel);
        }
      } catch {
        // Keep defaults when the settings route is unreachable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await runtimeFetch('/api/agent/go-api-key', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) return;
        // SAFETY: response.json() is untyped; the shape matches the key-status
        // route contract, a single boolean `configured` field.
        const data = (await response.json().catch(() => null)) as { configured?: boolean } | null;
        if (!cancelled && data && data.configured !== undefined) setKeyConfigured(data.configured);
      } catch {
        if (!cancelled) setKeyConfigured(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSettings = React.useCallback(
    async (patch: Record<string, string>) => {
      setBusy(true);
      try {
        const response = await runtimeFetch('/api/config/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!response.ok) {
          toast.error(t('settings.taskhunter.engine.toast.saveFailed'));
          return false;
        }
        return true;
      } catch {
        toast.error(t('settings.taskhunter.engine.toast.saveFailed'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [t],
  );

  const handleEngineChange = React.useCallback(
    async (value: string) => {
      if (value !== 'builtin' && value !== 'opencode') return;
      const previous = engine;
      setEngine(value);
      const saved = await persistSettings({ engine: value });
      if (saved) {
        toast.success(t('settings.taskhunter.engine.toast.saved'));
      } else {
        setEngine(previous);
      }
    },
    [engine, persistSettings, t],
  );

  const handleModelSave = React.useCallback(async () => {
    const trimmed = modelDraft.trim();
    if (trimmed.length === 0 || trimmed === engineModel) {
      setModelDraft('');
      return;
    }
    const saved = await persistSettings({ engineModel: trimmed });
    if (saved) {
      setEngineModel(trimmed);
      setModelDraft('');
      toast.success(t('settings.taskhunter.engine.toast.saved'));
    }
  }, [engineModel, modelDraft, persistSettings, t]);

  const handleKeySave = React.useCallback(async () => {
    const trimmed = keyDraft.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    try {
      const response = await runtimeFetch('/api/agent/go-api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: trimmed }),
      });
      if (!response.ok) throw new Error();
      setKeyConfigured(true);
      setKeyDraft('');
      toast.success(t('settings.taskhunter.engine.toast.keySaved'));
    } catch {
      toast.error(t('settings.taskhunter.engine.toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  }, [keyDraft, t]);

  const handleKeyClear = React.useCallback(async () => {
    setBusy(true);
    try {
      const response = await runtimeFetch('/api/agent/go-api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '' }),
      });
      if (!response.ok) throw new Error();
      setKeyConfigured(false);
      setKeyDraft('');
      toast.success(t('settings.taskhunter.engine.toast.keyCleared'));
    } catch {
      toast.error(t('settings.taskhunter.engine.toast.saveFailed'));
    } finally {
      setBusy(false);
    }
  }, [t]);

  return (
    <>
      <SettingsSection
        title={t('settings.taskhunter.engine.section.engine')}
        description={t('settings.taskhunter.engine.section.engineDescription')}
        divider={false}
      >
        <SettingsFieldRow
          settingsItem="engine.selector"
          label={t('settings.taskhunter.engine.field.engine')}
        >
          <Select value={engine} onValueChange={(value) => void handleEngineChange(value)} disabled={busy}>
            <SelectTrigger size={SETTINGS_SELECT_SIZE} className={SETTINGS_SELECT_ROW_TRIGGER_CLASS}>
              <SelectValue>
                {engine === 'builtin'
                  ? t('settings.taskhunter.engine.option.builtin')
                  : t('settings.taskhunter.engine.option.opencode')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="opencode">{t('settings.taskhunter.engine.option.opencode')}</SelectItem>
              <SelectItem value="builtin">{t('settings.taskhunter.engine.option.builtin')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsFieldRow>

        <SettingsFieldRow
          settingsItem="engine.model"
          label={t('settings.taskhunter.engine.field.model')}
          description={t('settings.taskhunter.engine.field.modelHint')}
        >
          <div className="flex items-center gap-2">
            <Input
              className="h-7 w-64 max-w-full font-mono text-xs"
              value={modelDraft.length > 0 ? modelDraft : engineModel}
              onChange={(event) => setModelDraft(event.target.value)}
              placeholder={DEFAULT_ENGINE_MODEL}
              autoComplete="off"
              spellCheck={false}
              aria-label={t('settings.taskhunter.engine.field.model')}
            />
            {modelDraft.trim().length > 0 && modelDraft.trim() !== engineModel ? (
              <Button size="xs" disabled={busy} onClick={() => void handleModelSave()}>
                {t('settings.taskhunter.engine.actions.save')}
              </Button>
            ) : null}
          </div>
        </SettingsFieldRow>
      </SettingsSection>

      <SettingsSection
        title={t('settings.taskhunter.engine.section.apiKey')}
        description={t('settings.taskhunter.engine.section.apiKeyDescription')}
        settingsItem="engine.go-api-key"
      >
        <SettingsFieldRow
          settingsItem="engine.api-key"
          label={t('settings.taskhunter.engine.field.apiKey')}
          description={keyConfigured
            ? t('settings.taskhunter.engine.apiKey.configured')
            : t('settings.taskhunter.engine.apiKey.missing')}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="h-7 w-64 max-w-full font-mono text-xs"
              type="password"
              value={keyDraft}
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder={keyConfigured ? t('settings.taskhunter.engine.apiKey.replacePlaceholder') : 'sk-...'}
              autoComplete="off"
              aria-label={t('settings.taskhunter.engine.field.apiKey')}
            />
            {keyDraft.trim().length > 0 ? (
              <Button size="xs" disabled={busy} onClick={() => void handleKeySave()}>
                {t('settings.taskhunter.engine.actions.save')}
              </Button>
            ) : null}
            {keyConfigured ? (
              <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleKeyClear()}>
                {t('settings.taskhunter.engine.actions.clear')}
              </Button>
            ) : null}
          </div>
        </SettingsFieldRow>
      </SettingsSection>
    </>
  );
};
