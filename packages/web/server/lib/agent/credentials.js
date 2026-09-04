// Credential storage for the builtin engine.
//
// Provider keys live in a 0600 file under the agent data dir, never in
// settings.json (settings responses are broadly readable; see
// formatSettingsResponse stripping managedRemoteTunnelToken for the same
// reason). Missing files read as unconfigured, never as errors.

const GO_API_KEY_FILENAME = 'go-api-key';
const CREDENTIAL_FILE_MODE = 0o600;

export const createCredentialStore = ({ fsPromises, path, dataDir }) => {
  if (!fsPromises || !path || typeof dataDir !== 'string' || dataDir.length === 0) {
    throw new Error('createCredentialStore requires fsPromises, path, and dataDir');
  }

  const keyPath = path.join(dataDir, GO_API_KEY_FILENAME);

  const getGoApiKey = async () => {
    let raw;
    try {
      raw = await fsPromises.readFile(keyPath, 'utf8');
    } catch (error) {
      if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        return null;
      }
      throw error;
    }
    const key = String(raw).trim();
    return key.length > 0 ? key : null;
  };

  const setGoApiKey = async (key) => {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('API key must be a non-empty string');
    }
    await fsPromises.mkdir(dataDir, { recursive: true });
    await fsPromises.writeFile(keyPath, `${key.trim()}\n`, { encoding: 'utf8', mode: CREDENTIAL_FILE_MODE });
    try {
      await fsPromises.chmod(keyPath, CREDENTIAL_FILE_MODE);
    } catch {
      // chmod is best-effort (non-POSIX filesystems); the write mode above
      // already restricts creation.
    }
    return true;
  };

  const clearGoApiKey = async () => {
    try {
      await fsPromises.unlink(keyPath);
    } catch (error) {
      if (!error || (error.code !== 'ENOENT' && error.code !== 'ENOTDIR')) {
        throw error;
      }
    }
    return true;
  };

  return {
    getGoApiKey,
    setGoApiKey,
    clearGoApiKey,
    hasGoApiKey: async () => (await getGoApiKey()) !== null,
  };
};
