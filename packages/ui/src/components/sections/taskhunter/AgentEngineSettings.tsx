import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_SELECT_ROW_TRIGGER_CLASS,
  SETTINGS_SELECT_SIZE,
} from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';

type Engine = 'opencode' | 'builtin';

const DEFAULT_ENGINE_MODEL = 'opencode-go/deepseek-v4-flash';

type ProviderFormat = 'openai-chat' | 'anthropic-messages' | 'openai-responses';

interface CustomProvider {
  id: string;
  endpoint: string;
  format: ProviderFormat;
  configured: boolean;
}

// Mirrors the server's isCustomProviderId: ids are path segments on the
// credential store and keys in settings, so the UI validates before sending.
const PROVIDER_ID_PATTERN = /^x-[a-z0-9][a-z0-9._-]{0,62}$/;
const PROVIDER_FORMATS: readonly ProviderFormat[] = ['openai-chat', 'anthropic-messages', 'openai-responses'];

// Select values arrive as strings; parse against the format list instead of
// casting so an unexpected value can never poison the request body.
const parseProviderFormat = (value: string): ProviderFormat | null =>
  PROVIDER_FORMATS.find((format) => format === value) ?? null;

export const AgentEngineSettings: React.FC = () => {
  const { t } = useI18n();
  const [engine, setEngine] = React.useState<Engine>('opencode');
  const [engineModel, setEngineModel] = React.useState(DEFAULT_ENGINE_MODEL);
  const [modelDraft, setModelDraft] = React.useState('');
  const [keyConfigured, setKeyConfigured] = React.useState(false);
  const [keyDraft, setKeyDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [providers, setProviders] = React.useState<CustomProvider[]>([]);
  const [addingProvider, setAddingProvider] = React.useState(false);
  const [providerKeyDrafts, setProviderKeyDrafts] = React.useState<Record<string, string>>({});
  const [npId, setNpId] = React.useState('');
  const [npEndpoint, setNpEndpoint] = React.useState('');
  const [npFormat, setNpFormat] = React.useState<ProviderFormat>('openai-chat');
  const [npKey, setNpKey] = React.useState('');

  const loadProviders = React.useCallback(async () => {
    try {
      const response = await runtimeFetch('/api/agent/providers', {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      // SAFETY: response.json() is untyped; the shape matches the server's
      // provider-list contract — definitions plus a boolean key-status flag,
      // never the key itself.
      const data = (await response.json().catch(() => null)) as { providers?: CustomProvider[] } | null;
      if (Array.isArray(data?.providers)) setProviders(data.providers);
    } catch {
      // Keep the previous list when the route is unreachable.
    }
  }, []);

  React.useEffect(() => {
    void loadProviders();
  }, [loadProviders]);

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

  const providerBusyRef = React.useRef(false);
  const withProviderBusy = React.useCallback(async (run: () => Promise<void>) => {
    if (providerBusyRef.current) return;
    providerBusyRef.current = true;
    setBusy(true);
    try {
      await run();
    } finally {
      providerBusyRef.current = false;
      setBusy(false);
    }
  }, []);

  const npIdValid = PROVIDER_ID_PATTERN.test(npId.trim());
  const npEndpointValid = (() => {
    const raw = npEndpoint.trim();
    if (!raw) return false;
    try {
      const url = new URL(raw);
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
    } catch {
      return false;
    }
  })();
  const npReady = npIdValid && npEndpointValid && npKey.trim().length > 0;

  const handleProviderSaveKey = React.useCallback(async (id: string) => {
    const key = providerKeyDrafts[id]?.trim();
    if (!key) return;
    await withProviderBusy(async () => {
      try {
        const response = await runtimeFetch(`/api/agent/providers/${encodeURIComponent(id)}/key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        if (!response.ok) throw new Error();
        setProviderKeyDrafts((current) => ({ ...current, [id]: '' }));
        await loadProviders();
        toast.success(t('settings.taskhunter.engine.toast.keySaved'));
      } catch {
        toast.error(t('settings.taskhunter.engine.toast.saveFailed'));
      }
    });
  }, [loadProviders, providerKeyDrafts, t, withProviderBusy]);

  const handleProviderClearKey = React.useCallback(async (id: string) => {
    await withProviderBusy(async () => {
      try {
        const response = await runtimeFetch(`/api/agent/providers/${encodeURIComponent(id)}/key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: '' }),
        });
        if (!response.ok) throw new Error();
        await loadProviders();
        toast.success(t('settings.taskhunter.engine.toast.keyCleared'));
      } catch {
        toast.error(t('settings.taskhunter.engine.toast.saveFailed'));
      }
    });
  }, [loadProviders, t, withProviderBusy]);

  const handleProviderDelete = React.useCallback(async (id: string) => {
    await withProviderBusy(async () => {
      try {
        const response = await runtimeFetch(`/api/agent/providers/${encodeURIComponent(id)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error();
        setProviderKeyDrafts((current) => Object.fromEntries(
          Object.entries(current).filter(([key]) => key !== id),
        ));
        await loadProviders();
        toast.success(t('settings.taskhunter.engine.toast.providerDeleted'));
      } catch {
        toast.error(t('settings.taskhunter.engine.toast.saveFailed'));
      }
    });
  }, [loadProviders, t, withProviderBusy]);

  const handleProviderAdd = React.useCallback(async () => {
    const id = npId.trim();
    const endpoint = npEndpoint.trim();
    const key = npKey.trim();
    if (!PROVIDER_ID_PATTERN.test(id) || !npReady) return;
    await withProviderBusy(async () => {
      try {
        const put = await runtimeFetch(`/api/agent/providers/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint, format: npFormat }),
        });
        if (!put.ok) throw new Error('definition');
        const keyRes = await runtimeFetch(`/api/agent/providers/${encodeURIComponent(id)}/key`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key }),
        });
        if (!keyRes.ok) throw new Error('key');
        setNpId('');
        setNpEndpoint('');
        setNpFormat('openai-chat');
        setNpKey('');
        setAddingProvider(false);
        await loadProviders();
        toast.success(t('settings.taskhunter.engine.toast.providerAdded'));
      } catch {
        toast.error(t('settings.taskhunter.engine.toast.providerAddFailed'));
      }
    });
  }, [loadProviders, npEndpoint, npFormat, npId, npKey, npReady, t, withProviderBusy]);

  return (
    <>
      <SettingsSection
        title={t('settings.taskhunter.engine.section.providers')}
        description={t('settings.taskhunter.engine.section.providersDescription')}
        settingsItem="engine.providers"
        divider={false}
      >
        {providers.length > 0 && !addingProvider ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col divide-y divide-border/60">
              {providers.map((provider) => (
                <div key={provider.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs">{provider.id}</div>
                      <div className="truncate font-mono text-xs text-muted-foreground">{provider.endpoint}</div>
                      <div className="text-xs text-muted-foreground">{provider.format}</div>
                    </div>
                    <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleProviderDelete(provider.id)}>
                      {t('settings.taskhunter.engine.actions.remove')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {provider.configured
                        ? t('settings.taskhunter.engine.apiKey.configured')
                        : t('settings.taskhunter.engine.apiKey.missing')}
                    </span>
                    <Input
                      className="h-8 w-56 max-w-full font-mono text-xs"
                      type="password"
                      value={providerKeyDrafts[provider.id] ?? ''}
                      onChange={(event) => setProviderKeyDrafts((current) => ({ ...current, [provider.id]: event.target.value }))}
                      placeholder={provider.configured ? t('settings.taskhunter.engine.apiKey.replacePlaceholder') : 'sk-...'}
                      autoComplete="off"
                      aria-label={t('settings.taskhunter.engine.field.providerKey')}
                    />
                    {(providerKeyDrafts[provider.id] ?? '').trim().length > 0 ? (
                      <Button size="xs" disabled={busy} onClick={() => void handleProviderSaveKey(provider.id)}>
                        {t('settings.taskhunter.engine.actions.save')}
                      </Button>
                    ) : null}
                    {provider.configured ? (
                      <Button variant="outline" size="xs" disabled={busy} onClick={() => void handleProviderClearKey(provider.id)}>
                        {t('settings.taskhunter.engine.actions.clear')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" size="xs" disabled={busy} onClick={() => setAddingProvider(true)}>
              {t('settings.taskhunter.engine.actions.addAnother')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <SettingsStackedField
              label={t('settings.taskhunter.engine.field.providerId')}
              info={t('settings.taskhunter.engine.field.providerIdHint')}
            >
              <Input
                className="h-8 w-full font-mono text-xs"
                value={npId}
                onChange={(event) => setNpId(event.target.value)}
                placeholder="x-my-provider"
                autoComplete="off"
                spellCheck={false}
                aria-label={t('settings.taskhunter.engine.field.providerId')}
              />
            </SettingsStackedField>
            <SettingsStackedField
              label={t('settings.taskhunter.engine.field.providerEndpoint')}
              info={t('settings.taskhunter.engine.field.providerEndpointHint')}
            >
              <Input
                className="h-8 w-full font-mono text-xs"
                value={npEndpoint}
                onChange={(event) => setNpEndpoint(event.target.value)}
                placeholder="https://api.example.com/v1/chat/completions"
                autoComplete="off"
                spellCheck={false}
                aria-label={t('settings.taskhunter.engine.field.providerEndpoint')}
              />
            </SettingsStackedField>
            <SettingsStackedField
              label={t('settings.taskhunter.engine.field.providerFormat')}
              info={t('settings.taskhunter.engine.field.providerFormatHint')}
            >
              <Select value={npFormat} onValueChange={(value) => {
                const parsed = parseProviderFormat(value);
                if (parsed) setNpFormat(parsed);
              }} disabled={busy}>
                <SelectTrigger size={SETTINGS_SELECT_SIZE} aria-label={t('settings.taskhunter.engine.field.providerFormat')}>
                  <SelectValue>{npFormat}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_FORMATS.map((format) => (
                    <SelectItem key={format} value={format}>
                      {format}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsStackedField>
            <SettingsStackedField
              label={t('settings.taskhunter.engine.field.providerKey')}
              info={t('settings.taskhunter.engine.field.providerKeyHint')}
            >
              <Input
                className="h-8 w-full font-mono text-xs"
                type="password"
                value={npKey}
                onChange={(event) => setNpKey(event.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                aria-label={t('settings.taskhunter.engine.field.providerKey')}
              />
            </SettingsStackedField>
            <div className="flex items-center gap-2">
              <Button size="xs" disabled={busy || !npReady} onClick={() => void handleProviderAdd()}>
                {t('settings.taskhunter.engine.actions.addProvider')}
              </Button>
              {addingProvider ? (
                <Button variant="outline" size="xs" disabled={busy} onClick={() => setAddingProvider(false)}>
                  {t('settings.taskhunter.engine.actions.cancel')}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </SettingsSection>

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
