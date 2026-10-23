import { describe, expect, it } from 'vitest';

import { INJECTED_ENV_KEY, assignInjectedEnv, injectedEnvKeys } from './injected-env.js';

describe('assignInjectedEnv', () => {
  it('sets the values and records their names', () => {
    const env = { PATH: '/usr/bin' };

    expect(assignInjectedEnv(env, { TASKHUNTER_RUNTIME: 'desktop', TASKHUNTER_DESKTOP_NOTIFY: 'true' })).toBe(env);

    expect(env).toEqual({
      PATH: '/usr/bin',
      TASKHUNTER_RUNTIME: 'desktop',
      TASKHUNTER_DESKTOP_NOTIFY: 'true',
      [INJECTED_ENV_KEY]: 'TASKHUNTER_RUNTIME,TASKHUNTER_DESKTOP_NOTIFY',
    });
    expect(injectedEnvKeys(env)).toEqual(new Set(['TASKHUNTER_RUNTIME', 'TASKHUNTER_DESKTOP_NOTIFY', INJECTED_ENV_KEY]));
  });

  it('leaves a value the shell already had as the user\'s', () => {
    const env = { OPENCODE_PASSWORD: 'theirs', TASKHUNTER_SKIP_API_COMPRESSION: 'false' };

    assignInjectedEnv(env, {
      OPENCODE_PASSWORD: 'theirs',
      OPENCODE_SERVER_PASSWORD: 'theirs',
      TASKHUNTER_SKIP_API_COMPRESSION: env.TASKHUNTER_SKIP_API_COMPRESSION || 'true',
    });

    expect(env.TASKHUNTER_SKIP_API_COMPRESSION).toBe('false');
    expect(injectedEnvKeys(env)).toEqual(new Set(['OPENCODE_SERVER_PASSWORD', INJECTED_ENV_KEY]));
  });

  it('adds to a record inherited from the parent process', () => {
    const env = assignInjectedEnv({}, { TASKHUNTER_RUNTIME: 'desktop' });
    const child = assignInjectedEnv({ ...env }, { OPENCODE_CONFIG: '/tmp/opencode.json', TASKHUNTER_RUNTIME: 'desktop' });

    expect(child[INJECTED_ENV_KEY]).toBe('TASKHUNTER_RUNTIME,OPENCODE_CONFIG');
    expect(env[INJECTED_ENV_KEY]).toBe('TASKHUNTER_RUNTIME');
  });

  it('skips undefined values and writes no record when nothing changed', () => {
    const env = { TASKHUNTER_HOST: '0.0.0.0' };

    assignInjectedEnv(env, { TASKHUNTER_UI_PASSWORD: undefined, TASKHUNTER_HOST: '0.0.0.0' });

    expect(env).toEqual({ TASKHUNTER_HOST: '0.0.0.0' });
    expect(injectedEnvKeys(env).size).toBe(0);
  });
});

describe('injectedEnvKeys', () => {
  it('ignores a malformed record', () => {
    expect(injectedEnvKeys({ [INJECTED_ENV_KEY]: '' }).size).toBe(0);
    expect(injectedEnvKeys({ [INJECTED_ENV_KEY]: ',,' })).toEqual(new Set([INJECTED_ENV_KEY]));
  });
});
