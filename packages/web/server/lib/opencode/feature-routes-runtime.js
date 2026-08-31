import { registerFsRoutes } from '../fs/routes.js';
import { registerQuotaRoutes } from '../quota/routes.js';
import { registerSmallModelRoutes } from '../small-model/routes.js';
import { registerWalkthroughRoutes } from '../walkthrough/routes.js';
import { registerSessionGoalRoutes } from '../session-goal/routes.js';
import { registerGitHubRoutes } from '../github/routes.js';
import { registerLinearRoutes } from '../linear/routes.js';
import { registerGitRoutes } from '../git/routes.js';
import { registerDevServerRoutes } from '../dev-servers/routes.js';
import { registerMagicPromptRoutes } from '../magic-prompts/routes.js';
import { createMagicPromptRuntime } from '../magic-prompts/runtime.js';
import { registerSessionFoldersRoutes } from '../session-folders/routes.js';
import { registerProjectContextRoutes } from '../project-context/routes.js';
import { registerAgentMemoryRoutes } from '../agent-memory/routes.js';
import { registerSessionKnowledgeRoutes } from '../session-knowledge/routes.js';
import { registerPermissionAutoAcceptRoutes } from '../permission-auto-accept/runtime.js';
import { registerConfigEntityRoutes } from './config-entity-routes.js';
import { registerSettingsUtilityRoutes } from './core-routes.js';
import { registerProjectIconRoutes } from './project-icon-routes.js';
import { registerScheduledTaskRoutes } from '../scheduled-tasks/routes.js';
import { registerTaskHunterSessionRoutes } from '../taskhunter-sessions/routes.js';
import { registerBoardRoutes } from '../board/routes.js';
import { createBoardService } from '../board/service.js';
import { createBoardDispatcher } from '../board/dispatcher.js';
import { createBoardEvaluator } from '../board/evaluator.js';
import { createBoardReconciler } from '../board/reconciler.js';
import { registerTaskHunterControlRoutes } from '../taskhunter-control/routes.js';
import { registerMarkdownImageGrantRoutes } from '../markdown-image-grants/routes.js';
import { registerSkillRoutes } from './skill-routes.js';
import { registerPluginRoutes } from './plugin-routes.js';
import { getNpmInfo, clearCache as clearNpmCache } from './npm-registry.js';
import { parseNpmSpec, parsePathSpec, isExactSemver } from './plugin-spec.js';
import { registerOpenCodeRoutes } from './routes.js';
import { getProviderSources, removeProviderConfig, upsertProviderConfig } from './providers.js';
import { getCompactionConfig, upsertCompactionConfig } from './compaction.js';
import { getAgentSources, getAgentConfig, createAgent, updateAgent, deleteAgent } from './agents.js';
import { getCommandSources, createCommand, updateCommand, deleteCommand } from './commands.js';
import { listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig } from './mcp.js';
import { listSnippets, getSnippet, createSnippet, updateSnippet, deleteSnippet, expandSnippets } from './snippets.js';
import {
  listPluginEntries,
  getPluginEntry,
  createPluginEntry,
  updatePluginEntry,
  deletePluginEntry,
  listPluginDirFiles,
  readPluginDirFile,
  writePluginDirFile,
  deletePluginDirFile,
  encodePluginId,
  decodePluginId,
} from './plugins.js';
import { SKILL_DIR, SKILL_SCOPE, readSkillSupportingFile, writeSkillSupportingFile, deleteSkillSupportingFile } from './shared.js';
import { getSkillSources, discoverSkills, mergeDiscoveredSkills, createSkill, updateSkill, deleteSkill, renameSkill, isManagedSkillPath } from './skills.js';
import { getCuratedSkillsSources } from '../skills-catalog/curated-sources.js';
import { getCacheKey, scanWithCache } from '../skills-catalog/cache.js';
import { parseSkillRepoSource } from '../skills-catalog/source.js';
import { scanSkillsRepository } from '../skills-catalog/scan.js';
import { installSkillsFromRepository } from '../skills-catalog/install.js';
import { fetchGitHubRepoMetas } from '../skills-catalog/github-meta.js';

export const createFeatureRoutesRuntime = (dependencies) => {
  const {
    clientReloadDelayMs,
  } = dependencies;

  let quotaProviders = null;
  const getQuotaProviders = async () => {
    if (!quotaProviders) {
      quotaProviders = await import('../quota/index.js');
    }
    return quotaProviders;
  };

  let smallModelService = null;
  const getSmallModelService = async () => {
    if (!smallModelService) {
      smallModelService = await import('../small-model/index.js');
    }
    return smallModelService;
  };

  let walkthroughService = null;
  const getWalkthroughService = async () => {
    if (!walkthroughService) {
      const [service, pullRequest] = await Promise.all([
        import('../walkthrough/index.js'),
        import('../walkthrough/pull-request.js'),
      ]);
      walkthroughService = { ...service, getPullRequestDiff: pullRequest.getPullRequestDiff };
    }
    return walkthroughService;
  };

  const registerRoutes = async (app, routeDependencies) => {
    const {
      crypto,
      fs,
      os,
      path,
      fsPromises,
      spawn,
      resolveGitBinaryForSpawn,
      createFsSearchRuntime,
      taskhunterDataDir,
      taskhunterUserConfigRoot,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      validateDirectoryPath,
      readCustomThemesFromDisk,
      refreshOpenCodeAfterConfigChange,
      getOpenCodeResolutionSnapshot,
      getOpenCodeUpgradeCapability,
      formatSettingsResponse,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      sanitizeProjects,
      sanitizeSkillCatalogs,
      isUnsafeSkillRelativePath,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      getOpenCodePort,
      getOwnPorts,
      devServerScanner,
      buildAugmentedPath,
      projectConfigRuntime,
      projectContextRuntime,
      agentMemoryRuntime,
      isAgentMemoryEnabled,
      sessionKnowledgeRuntime,
      scheduledTasksRuntime,
      scheduledTaskService,
      taskHunterSessionService,
      taskHunterControlService,
      waitForOpenCodeReady,
      getTaskHunterEventClients,
      writeSseEvent,
      emitSessionCreatedEvent,
      permissionAutoAcceptRuntime,
    } = routeDependencies;

    registerSettingsUtilityRoutes(app, {
      readCustomThemesFromDisk,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
    });

    registerPermissionAutoAcceptRoutes(app, permissionAutoAcceptRuntime);

    registerOpenCodeRoutes(app, {
      crypto,
      clientReloadDelayMs,
      getOpenCodeResolutionSnapshot,
      getOpenCodeUpgradeCapability,
      formatSettingsResponse,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      sanitizeProjects,
      validateDirectoryPath,
      resolveProjectDirectory,
      getProviderSources,
      removeProviderConfig,
      upsertProviderConfig,
      getCompactionConfig,
      upsertCompactionConfig,
      refreshOpenCodeAfterConfigChange,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
    });

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      taskhunterDataDir,
      sanitizeProjects,
      readSettingsFromDiskMigrated,
      persistSettings,
      createFsSearchRuntime,
      spawn,
      resolveGitBinaryForSpawn,
    });

    registerScheduledTaskRoutes(app, {
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      projectConfigRuntime,
      scheduledTasksRuntime,
      scheduledTaskService,
      getTaskHunterEventClients,
      writeSseEvent,
    });

    registerTaskHunterSessionRoutes(app, {
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      validateDirectoryPath,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      waitForOpenCodeReady,
      emitSessionCreatedEvent,
      sessionService: taskHunterSessionService,
    });

    const magicPromptRuntime = createMagicPromptRuntime({
      fsPromises,
      path,
      filePath: path.join(taskhunterDataDir, 'magic-prompts.json'),
    });
    const readPromptOverride = async (promptId) => {
      const state = await magicPromptRuntime.readPromptState();
      return state.overrides[promptId] ?? null;
    };
    const boardService = createBoardService({
      dataDir: taskhunterDataDir,
      readSettingsFromDiskMigrated,
      sanitizeProjects,
    });
    const boardDispatcher = createBoardDispatcher({
      service: boardService,
      sessionService: taskHunterSessionService,
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      readPromptOverride,
    });
    boardDispatcher.startReclaimLoop();
    const boardReconciler = createBoardReconciler({
      service: boardService,
      resolveProject: async (projectId) => {
        const settings = await readSettingsFromDiskMigrated();
        const projects = sanitizeProjects(settings?.projects || []);
        const project = projects.find((entry) => entry.id === projectId);
        if (!project) throw new Error('board task project missing');
        return project;
      },
      fetchSessionStatuses: async (directory) => {
        const url = new URL(buildOpenCodeUrl('/session/status'));
        url.searchParams.set('directory', directory);
        const response = await fetch(url, {
          headers: { Accept: 'application/json', ...getOpenCodeAuthHeaders() },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`session status ${response.status}`);
        return response.json();
      },
      fetchSession: async (sessionId, directory) => {
        const url = new URL(buildOpenCodeUrl(`/session/${encodeURIComponent(sessionId)}`));
        url.searchParams.set('directory', directory);
        const response = await fetch(url, {
          headers: { Accept: 'application/json', ...getOpenCodeAuthHeaders() },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) throw new Error(`session fetch ${response.status}`);
        const data = await response.json();
        return data?.id ? data : (data?.session ?? null);
      },
      resolvePr: async (project, branch) => {
        const { getOctokitOrNull } = await import('../github/octokit.js');
        const octokit = getOctokitOrNull();
        if (!octokit) return null;
        const { resolveGitHubPrStatus } = await import('../github/pr-status.js');
        return resolveGitHubPrStatus({ octokit, directory: project.path, branch });
      },
      mergePr: async ({ owner, repo, number, sha }) => {
        if (!owner || !repo) throw Object.assign(new Error('PR repo unknown'), { status: 404 });
        const { getOctokitOrNull } = await import('../github/octokit.js');
        const octokit = getOctokitOrNull();
        if (!octokit) throw Object.assign(new Error('GitHub not authenticated'), { status: 401 });
        await octokit.rest.pulls.merge({ owner, repo, pull_number: number, ...(sha ? { sha } : {}), merge_method: 'merge' });
      },
      updateBranch: async ({ owner, repo, number }) => {
        if (!owner || !repo) throw Object.assign(new Error('PR repo unknown'), { status: 404 });
        const { getOctokitOrNull } = await import('../github/octokit.js');
        const octokit = getOctokitOrNull();
        if (!octokit) throw Object.assign(new Error('GitHub not authenticated'), { status: 401 });
        await octokit.rest.pulls.updateBranch({ owner, repo, pull_number: number });
      },
    });
    boardReconciler.startReconcileLoop();
    registerBoardRoutes(app, {
      dataDir: taskhunterDataDir,
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      boardService,
      dispatcher: boardDispatcher,
      evaluator: createBoardEvaluator({ service: boardService, readPromptOverride }),
    });

    registerTaskHunterControlRoutes(app, { controlService: taskHunterControlService });

    registerMarkdownImageGrantRoutes(app, {
      fsPromises,
      path,
      os,
      crypto,
      validateDirectoryPath,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
    });

    registerConfigEntityRoutes(app, {
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
      getAgentSources,
      getAgentConfig,
      createAgent,
      updateAgent,
      deleteAgent,
      getCommandSources,
      createCommand,
      updateCommand,
      deleteCommand,
      listMcpConfigs,
      getMcpConfig,
      createMcpConfig,
      updateMcpConfig,
      deleteMcpConfig,
      listSnippets,
      getSnippet,
      createSnippet,
      updateSnippet,
      deleteSnippet,
      expandSnippets,
    });

    registerPluginRoutes(app, {
      resolveOptionalProjectDirectory,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
      listPluginEntries,
      getPluginEntry,
      createPluginEntry,
      updatePluginEntry,
      deletePluginEntry,
      listPluginDirFiles,
      readPluginDirFile,
      writePluginDirFile,
      deletePluginDirFile,
      encodePluginId,
      decodePluginId,
      getNpmInfo,
      parseNpmSpec,
      parsePathSpec,
      isExactSemver,
    });

    const { getProfiles, getProfile } = await import('../git/index.js');

    registerSkillRoutes(app, {
      fs,
      path,
      os,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      readSettingsFromDisk,
      sanitizeSkillCatalogs,
      isUnsafeSkillRelativePath,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      getOpenCodePort,
      getSkillSources,
      discoverSkills,
      mergeDiscoveredSkills,
      createSkill,
      updateSkill,
      deleteSkill,
      renameSkill,
      isManagedSkillPath,
      readSkillSupportingFile,
      writeSkillSupportingFile,
      deleteSkillSupportingFile,
      SKILL_SCOPE,
      SKILL_DIR,
      getCuratedSkillsSources,
      getCacheKey,
      scanWithCache,
      parseSkillRepoSource,
      scanSkillsRepository,
      installSkillsFromRepository,
      fetchGitHubRepoMetas,
      getProfiles,
      getProfile,
    });

    registerQuotaRoutes(app, { getQuotaProviders });
    registerSmallModelRoutes(app, { getSmallModelService });
    registerWalkthroughRoutes(app, { getWalkthroughService });
    registerSessionGoalRoutes(app);
    registerGitHubRoutes(app);
    registerLinearRoutes(app);
    registerGitRoutes(app);
    registerDevServerRoutes(app, { scanner: devServerScanner, getOwnPorts });
    registerMagicPromptRoutes(app, {
      fsPromises,
      path,
      taskhunterDataDir,
      runtime: magicPromptRuntime,
    });
    registerProjectContextRoutes(app, { projectContextRuntime });
    registerAgentMemoryRoutes(app, { agentMemoryRuntime, isAgentMemoryEnabled });
    registerSessionKnowledgeRoutes(app, { sessionKnowledgeRuntime });

    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      taskhunterDataDir,
    });
    registerFsRoutes(app, {
      os,
      path,
      fsPromises,
      spawn,
      crypto,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      buildAugmentedPath,
      resolveGitBinaryForSpawn,
      taskhunterUserConfigRoot,
    });
  };

  return {
    registerRoutes,
  };
};
