import React from 'react';
import { useProjectActionsContext } from '@/hooks/useProjectActionsContext';
import { ProjectActionsScope } from './ProjectActionsScope';

/**
 * One runner for the current session's project, shared by the Work Status row,
 * the project actions dialog and the command palette. It lives above all of
 * them, so a run keeps its output watch while the Work Status card is hidden.
 */
export const ProjectActionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const context = useProjectActionsContext();
  return (
    <ProjectActionsScope projectRef={context?.projectRef ?? null} directory={context?.directory ?? ''}>
      {children}
    </ProjectActionsScope>
  );
};
