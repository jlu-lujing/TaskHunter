// Credential storage for the builtin engine.
//
// Provider keys live in 0600 files under the agent data dir, never in
// settings.json (settings responses are broadly readable; see
// formatSettingsResponse stripping managedRemoteTunnelToken for the same
// reason). Missing files read as unconfigured, never as errors.

const GO_API_KEY_FILENAME = 'go-api-key';
const PROVIDER_KEY_PREFIX = 'provider-key-';
const CREDENTIAL_FILE_MODE = 0o600;

// Provider ids become path segments; restrict them so a crafted id can never
// escape the data dir or collide with the go key file. The stricter UI-side
// gate is isCustomProviderId in types.js; this guard is the last line.
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const isProviderId = (value) => typeof value === 'string'
  && PROVIDER_ID_PATTERN.test(value)
  && !value.includes('..')
  && value !== GO_API_KEY_FILENAME
  && !value.startsWith(PROVIDER_KEY_PREFIX);

export const createCredentialStore = ({ fsPromises, path, dataDir }) => {
  if (!fsPromises || !path || typeof dataDir !== 'string' || dataDir.length === 0) {
    throw new Error('createCredentialStore requires fsPromises, path, and dataDir');
  }

  const keyPath = path.join(dataDir, GO_API_KEY_FILENAME);
  const providerKeyPath = (providerId) => {
    if (!isProviderId(providerId)) {
      throw new Error(`invalid provider id: ${String(providerId)}`);
    }
    return path.join(dataDir, `${PROVIDER_KEY_PREFIX}${providerId}`);
  };

  const readFileKey = async (file) => {
    let raw;
    try {
      raw = await fsPromises.readFile(file, 'utf8');
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        return null;
      }
      throw error;
    }
    const key = String(raw).trim();
    return key.length > 0 ? key : null;
  };

  const writeFileKey = async (file, key) => {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('API key must be a non-empty string');
    }
    await fsPromises.mkdir(dataDir, { recursive: true });
    await fsPromises.writeFile(file, `${key.trim()}\n`, { encoding: 'utf8', mode: CREDENTIAL_FILE_MODE });
    try {
      await fsPromises.chmod(file, CREDENTIAL_FILE_MODE);
    } catch {
      // chmod is best-effort (non-POSIX filesystems); the write mode above
      // already restricts creation.
    }
    return true;
  };

  const unlinkFileKey = async (file) => {
    try {
      await fsPromises.unlink(file);
    } catch (error) {
      if (!error || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
        throw error;
      }
    }
    return true;
  };

  const getGoApiKey = async () => readFileKey(keyPath);

  const setGoApiKey = (key) => writeFileKey(keyPath, key);

  const clearGoApiKey = () => unlinkFileKey(keyPath);

  const getProviderApiKey = (providerId) => readFileKey(providerKeyPath(providerId));

  const setProviderApiKey = (providerId, key) => writeFileKey(providerKeyPath(providerId), key);

  const clearProviderApiKey = (providerId) => unlinkFileKey(providerKeyPath(providerId));

  return {
    getGoApiKey,
    setGoApiKey,
    clearGoApiKey,
    hasGoApiKey: async () => (await getGoApiKey()) !== null,
    getProviderApiKey,
    setProviderApiKey,
    clearProviderApiKey,
    hasProviderApiKey: async (providerId) => (await getProviderApiKey(providerId)) !== null,
  };
};
