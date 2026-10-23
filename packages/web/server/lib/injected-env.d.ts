export const INJECTED_ENV_KEY: 'TASKHUNTER_INJECTED_ENV';

export function injectedEnvKeys(env: Record<string, string | undefined>): Set<string>;

export function assignInjectedEnv<T extends Record<string, string | undefined>>(
  env: T,
  values: Record<string, string | undefined>,
): T;
