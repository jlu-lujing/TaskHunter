import React from 'react';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import { ProjectSettingsPanel } from '@/components/sections/projects/ProjectSettingsPanel';
import { useProjectSettingsTabStore } from '@/components/sections/projects/projectSettingsTabs';
import type { ProjectIdentitySaveData } from '@/components/sections/projects/useProjectIdentityForm';
import { useDeviceInfo } from '@/lib/device';
import { useI18n } from '@/lib/i18n';

export const ProjectsPage: React.FC = () => {
  const { t } = useI18n();
  const { isMobile } = useDeviceInfo();
  const projects = useProjectsStore((state) => state.projects);
  const updateProjectMeta = useProjectsStore((state) => state.updateProjectMeta);
  const selectedId = useUIStore((state) => state.settingsProjectsSelectedId);
  const setSelectedId = useUIStore((state) => state.setSettingsProjectsSelectedId);
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
  const setWorktreesPageProjectId = useUIStore((state) => state.setWorktreesPageProjectId);
  const tab = useProjectSettingsTabStore((state) => state.tab);
  const setTab = useProjectSettingsTabStore((state) => state.setTab);

  const selectedProject = React.useMemo(() => {
    if (!selectedId) return null;
    return projects.find((p) => p.id === selectedId) ?? null;
  }, [projects, selectedId]);

  React.useEffect(() => {
    if (projects.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && projects.some((p) => p.id === selectedId)) {
      return;
    }
    setSelectedId(projects[0].id);
  }, [projects, selectedId, setSelectedId]);

  const handleIdentitySave = React.useCallback(async (data: ProjectIdentitySaveData) => {
    if (!selectedProject) return;
    updateProjectMeta(selectedProject.id, {
      label: data.label,
      icon: data.icon,
      color: data.color,
      iconBackground: data.iconBackground,
      defaultAgent: data.defaultAgent ?? null,
      defaultModel: data.defaultModel ?? null,
      defaultVariant: data.defaultVariant ?? null,
    });
  }, [selectedProject, updateProjectMeta]);

  const selectedProjectId = selectedProject?.id ?? null;
  // The worktrees page is a main-window surface; the phone has its own project sheet for worktrees.
  const handleOpenWorktrees = React.useMemo(() => {
    if (isMobile || !selectedProjectId) return undefined;
    return () => {
      setSettingsDialogOpen(false);
      setWorktreesPageProjectId(selectedProjectId);
    };
  }, [isMobile, selectedProjectId, setSettingsDialogOpen, setWorktreesPageProjectId]);

  if (!selectedProject) {
    return (
      <SettingsPageLayout title={t('settings.page.projects.title')} showSaveStatus>
        <p className="typography-meta text-muted-foreground">{t('settings.projects.page.empty.noProjects')}</p>
      </SettingsPageLayout>
    );
  }

  return (
    <ProjectSettingsPanel
      frame="page"
      project={selectedProject}
      onIdentitySave={handleIdentitySave}
      tab={tab}
      onTabChange={setTab}
      onOpenWorktrees={handleOpenWorktrees}
    />
  );
};
