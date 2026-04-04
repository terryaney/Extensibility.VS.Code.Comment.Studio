import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    findFiles: vi.fn(),
    getWorkspaceFolder: vi.fn(),
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
}));

import { resolveNearestProject } from '../../src/anchors/anchorMetadata';

describe('anchorMetadata', () => {
  it('maps files to the nearest containing project', () => {
    const project = resolveNearestProject('C:\\Workspace\\Repo\\Feature\\Nested\\Service.cs', [
      {
        id: 'c:\\workspace\\repo\\repo.csproj',
        label: 'Repo',
        path: 'C:\\Workspace\\Repo\\Repo.csproj',
        directoryPath: 'C:\\Workspace\\Repo',
      },
      {
        id: 'c:\\workspace\\repo\\feature\\nested\\feature.csproj',
        label: 'Feature',
        path: 'C:\\Workspace\\Repo\\Feature\\Nested\\Feature.csproj',
        directoryPath: 'C:\\Workspace\\Repo\\Feature\\Nested',
      },
    ]);

    expect(project?.label).toBe('Feature');
  });

  it('returns undefined when no project contains the file', () => {
    const project = resolveNearestProject('C:\\Workspace\\Other\\File.cs', [
      {
        id: 'c:\\workspace\\repo\\repo.csproj',
        label: 'Repo',
        path: 'C:\\Workspace\\Repo\\Repo.csproj',
        directoryPath: 'C:\\Workspace\\Repo',
      },
    ]);

    expect(project).toBeUndefined();
  });
});
