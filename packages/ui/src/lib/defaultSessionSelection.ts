import { parseModelIdentifier } from '@/lib/modelIdentifier';
import { modelVariantNames } from '@/lib/modelVariants';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';

/**
 * Shared "what should a freshly-created session use" resolution for
 * surfaces that start sessions without composer state (Linear issues,
 * board tasks). Priority: settings default → current picker state → last
 * used selection.
 */
function resolveDefaultAgentName(): string | undefined {
  const configState = useConfigStore.getState();
  const settingsDefaultAgent = configState.settingsDefaultAgent;
  if (settingsDefaultAgent) {
    return settingsDefaultAgent;
  }
  const visibleAgents = configState.agents.filter((agent) => !agent.hidden);
  return (
    configState.currentAgentName
    || visibleAgents.find((agent) => agent.mode === 'primary' || !agent.mode)?.name
    || visibleAgents[0]?.name
  );
}

function resolveDefaultModelSelection(): { providerID: string; modelID: string } | null {
  const configState = useConfigStore.getState();
  const settingsDefaultModel = configState.settingsDefaultModel;
  if (!settingsDefaultModel) {
    return null;
  }

  const parsed = parseModelIdentifier(settingsDefaultModel);
  if (!parsed) {
    return null;
  }
  const { providerId: providerID, modelId: modelID } = parsed;

  const modelMetadata = configState.getModelMetadata(providerID, modelID);
  if (!modelMetadata) {
    return null;
  }

  return { providerID, modelID };
}

function resolveDefaultVariant(providerID: string, modelID: string): string | undefined {
  const configState = useConfigStore.getState();
  const settingsDefaultVariant = configState.settingsDefaultVariant;
  const currentVariant = configState.currentProviderId === providerID && configState.currentModelId === modelID
    ? configState.currentVariant
    : undefined;

  const provider = configState.providers.find((entry) => entry.id === providerID);
  const model = provider?.models.find((entry) => entry.id === modelID);
  const variantNames = modelVariantNames(model);
  if (variantNames.length === 0) {
    return settingsDefaultVariant || currentVariant || undefined;
  }
  if (settingsDefaultVariant && variantNames.includes(settingsDefaultVariant)) {
    return settingsDefaultVariant;
  }
  if (currentVariant && variantNames.includes(currentVariant)) {
    return currentVariant;
  }
  return undefined;
}

export function resolveSessionLaunchSelection() {
  const configState = useConfigStore.getState();
  const lastUsedProvider = useSelectionStore.getState().lastUsedProvider;
  const defaultModel = resolveDefaultModelSelection();
  const providerID = defaultModel?.providerID || configState.currentProviderId || lastUsedProvider?.providerID;
  const modelID = defaultModel?.modelID || configState.currentModelId || lastUsedProvider?.modelID;
  const agentName = resolveDefaultAgentName() || configState.currentAgentName || undefined;
  const variant = providerID && modelID ? resolveDefaultVariant(providerID, modelID) : undefined;
  return { providerID, modelID, agentName, variant };
}
