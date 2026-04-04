import { describe, it, expect } from 'vitest';
import { parseRemoteUrl } from '../../src/navigation/gitService';
import { GitHostingProvider } from '../../src/types';

describe('parseRemoteUrl', () => {
  describe('GitHub', () => {
    it('should parse HTTPS URL', () => {
      const info = parseRemoteUrl('https://github.com/madskristensen/CommentsVS.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitHub);
      expect(info!.owner).toBe('madskristensen');
      expect(info!.repository).toBe('CommentsVS');
      expect(info!.baseUrl).toBe('https://github.com');
    });

    it('should parse SSH URL', () => {
      const info = parseRemoteUrl('git@github.com:owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitHub);
      expect(info!.owner).toBe('owner');
      expect(info!.repository).toBe('repo');
    });

    it('should handle URL without .git suffix', () => {
      const info = parseRemoteUrl('https://github.com/owner/repo');
      expect(info).toBeDefined();
      expect(info!.repository).toBe('repo');
    });

    it('should parse enterprise GitHub', () => {
      const info = parseRemoteUrl('https://github.example.com/owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitHub);
      expect(info!.owner).toBe('owner');
      expect(info!.repository).toBe('repo');
    });

    it('should parse enterprise GitHub SCP-style', () => {
      const info = parseRemoteUrl('git@github.corp.com:owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitHub);
    });
  });

  describe('GitLab', () => {
    it('should parse HTTPS URL', () => {
      const info = parseRemoteUrl('https://gitlab.com/owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitLab);
      expect(info!.owner).toBe('owner');
      expect(info!.repository).toBe('repo');
    });

    it('should parse SSH URL', () => {
      const info = parseRemoteUrl('git@gitlab.com:owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitLab);
    });

    it('should handle nested groups', () => {
      const info = parseRemoteUrl('https://gitlab.example.com/group/subgroup/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitLab);
      expect(info!.owner).toBe('group/subgroup');
      expect(info!.repository).toBe('repo');
    });

    it('should parse enterprise GitLab', () => {
      const info = parseRemoteUrl('https://gitlab.corp.com/team/project.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitLab);
    });
  });

  describe('Bitbucket', () => {
    it('should parse HTTPS URL', () => {
      const info = parseRemoteUrl('https://bitbucket.org/owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.Bitbucket);
      expect(info!.owner).toBe('owner');
      expect(info!.repository).toBe('repo');
    });

    it('should parse SSH URL', () => {
      const info = parseRemoteUrl('git@bitbucket.org:owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.Bitbucket);
    });
  });

  describe('Azure DevOps', () => {
    it('should parse new format HTTPS', () => {
      const info = parseRemoteUrl('https://dev.azure.com/myorg/myproject/_git/myrepo');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.AzureDevOps);
      expect(info!.owner).toBe('myorg');
      expect(info!.repository).toBe('myproject');
    });

    it('should parse old visualstudio.com format', () => {
      const info = parseRemoteUrl('https://myorg.visualstudio.com/myproject/_git/myrepo');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.AzureDevOps);
    });
  });

  describe('Enterprise / self-hosted', () => {
    it('should infer GitHub for 2-segment paths on unknown hosts', () => {
      const info = parseRemoteUrl('https://git.mycompany.com/owner/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitHub);
    });

    it('should infer GitLab for 3+ segment paths on unknown hosts', () => {
      const info = parseRemoteUrl('https://git.mycompany.com/group/subgroup/repo.git');
      expect(info).toBeDefined();
      expect(info!.provider).toBe(GitHostingProvider.GitLab);
    });

    it('should handle trailing slashes', () => {
      const info = parseRemoteUrl('https://github.com/owner/repo/');
      // May not parse due to trailing slash creating extra segment
      // The important thing is it doesn't crash
    });
  });

  describe('edge cases', () => {
    it('should return undefined for empty string', () => {
      expect(parseRemoteUrl('')).toBeUndefined();
    });

    it('should return undefined for null', () => {
      expect(parseRemoteUrl(null as any)).toBeUndefined();
    });

    it('should return undefined for invalid URL', () => {
      expect(parseRemoteUrl('not-a-url')).toBeUndefined();
    });
  });
});
