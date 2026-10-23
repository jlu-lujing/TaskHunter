/** Wire envelope `v`. Guest postMessage and host pushes use this. */
export const TASKHUNTER_SDK_CHANNEL = 'taskhunter.sdk';
export const TASKHUNTER_SDK_API_VERSION = 1;
/** Manifest `apiVersion` values this host accepts. Service and sockets ship on `1`. */
export const TASKHUNTER_SDK_MANIFEST_API_VERSIONS = [1] as const;
export type TaskHunterManifestApiVersion = (typeof TASKHUNTER_SDK_MANIFEST_API_VERSIONS)[number];
