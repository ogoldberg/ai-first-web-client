/**
 * GitHub Site Handler
 *
 * Extracts content from GitHub using their public API.
 * Supports repositories, users/organizations, issues, and pull requests.
 */

import { BaseSiteHandler, type FetchFunction, type SiteHandlerOptions, type SiteHandlerResult } from './types.js';
import { logger } from '../../utils/logger.js';

const log = logger.intelligence;

const GITHUB_API = 'https://api.github.com';

type GitHubUrlType = 'repo' | 'user' | 'issue' | 'pr' | 'unknown';

interface ParsedGitHubUrl {
  type: GitHubUrlType;
  owner?: string;
  repo?: string;
  number?: string;
}

export class GitHubHandler extends BaseSiteHandler {
  readonly name = 'GitHub';
  readonly strategy = 'api:github' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return parsed.hostname === 'github.com';
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const parsed = this.parseGitHubUrl(url);
    if (parsed.type === 'unknown') {
      return null;
    }

    const apiHeaders = {
      ...opts.headers,
      Accept: 'application/vnd.github.v3+json',
    };

    try {
      let apiUrl: string;
      let formatted: { title: string; text: string; markdown: string };
      let structured: Record<string, unknown>;

      if (parsed.type === 'repo' && parsed.owner && parsed.repo) {
        apiUrl = `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}`;
        log.debug(`Trying GitHub repo API: ${apiUrl}`);

        const response = await fetch(apiUrl, { ...opts, headers: apiHeaders });
        if (!response.ok) {
          log.debug(`GitHub API returned ${response.status}`);
          return null;
        }

        structured = (await response.json()) as Record<string, unknown>;
        formatted = this.formatRepo(structured);
      } else if (parsed.type === 'user' && parsed.owner) {
        apiUrl = `${GITHUB_API}/users/${parsed.owner}`;
        log.debug(`Trying GitHub user API: ${apiUrl}`);

        const response = await fetch(apiUrl, { ...opts, headers: apiHeaders });
        if (!response.ok) {
          return null;
        }

        structured = (await response.json()) as Record<string, unknown>;
        formatted = this.formatUser(structured);
      } else if (
        (parsed.type === 'issue' || parsed.type === 'pr') &&
        parsed.owner &&
        parsed.repo &&
        parsed.number
      ) {
        const endpoint = parsed.type === 'pr' ? 'pulls' : 'issues';
        apiUrl = `${GITHUB_API}/repos/${parsed.owner}/${parsed.repo}/${endpoint}/${parsed.number}`;
        log.debug(`Trying GitHub ${parsed.type} API: ${apiUrl}`);

        const response = await fetch(apiUrl, { ...opts, headers: apiHeaders });
        if (!response.ok) {
          return null;
        }

        structured = (await response.json()) as Record<string, unknown>;
        formatted = this.formatIssue(structured, parsed.type === 'pr');
      } else {
        return null;
      }

      if (formatted.text.length < (opts.minContentLength || 100)) {
        return null;
      }

      log.info('GitHub API extraction successful', {
        type: parsed.type,
        contentLength: formatted.text.length,
      });

      return this.createResult(url, apiUrl, {
        title: formatted.title,
        text: formatted.text,
        markdown: formatted.markdown,
        structured,
      });
    } catch (error) {
      log.debug(`GitHub API failed: ${error}`);
      return null;
    }
  }

  /**
   * Parse GitHub URL to determine type and extract params
   */
  private parseGitHubUrl(url: string): ParsedGitHubUrl {
    const parsed = this.parseUrl(url);
    if (!parsed) return { type: 'unknown' };

    const parts = parsed.pathname.split('/').filter(Boolean);

    if (parts.length === 1) {
      // User/org page: github.com/username
      return { type: 'user', owner: parts[0] };
    } else if (parts.length === 2) {
      // Repo page: github.com/owner/repo
      return { type: 'repo', owner: parts[0], repo: parts[1] };
    } else if (parts.length >= 4) {
      const owner = parts[0];
      const repo = parts[1];
      const subType = parts[2];
      const num = parts[3];

      if (subType === 'issues' && num) {
        return { type: 'issue', owner, repo, number: num };
      } else if (subType === 'pull' && num) {
        return { type: 'pr', owner, repo, number: num };
      }
    }

    return { type: 'unknown' };
  }

  /**
   * Format GitHub repo data
   */
  private formatRepo(repo: Record<string, unknown>): {
    title: string;
    text: string;
    markdown: string;
  } {
    const name = String(repo.full_name || repo.name || 'Unknown Repo');
    const description = String(repo.description || '');
    const stars = repo.stargazers_count || 0;
    const forks = repo.forks_count || 0;
    const language = String(repo.language || 'Unknown');
    const license = (repo.license as Record<string, unknown>)?.name || 'None';
    const topics = (repo.topics as string[]) || [];
    const defaultBranch = String(repo.default_branch || 'main');
    const openIssues = repo.open_issues_count || 0;
    const createdAt = String(repo.created_at || '');
    const updatedAt = String(repo.updated_at || '');
    const homepage = String(repo.homepage || '');

    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(name);
    lines.push('='.repeat(name.length));
    if (description) lines.push(description);
    lines.push('');
    lines.push(`Stars: ${stars} | Forks: ${forks} | Open Issues: ${openIssues}`);
    lines.push(`Language: ${language} | License: ${license}`);
    lines.push(`Default Branch: ${defaultBranch}`);
    if (topics.length > 0) lines.push(`Topics: ${topics.join(', ')}`);
    if (homepage) lines.push(`Homepage: ${homepage}`);
    lines.push(`Created: ${createdAt} | Updated: ${updatedAt}`);

    // Markdown format
    markdownLines.push(`# ${name}`);
    if (description) markdownLines.push(`> ${description}`);
    markdownLines.push('');
    markdownLines.push('| Stars | Forks | Issues | Language | License |');
    markdownLines.push('|-------|-------|--------|----------|---------|');
    markdownLines.push(`| ${stars} | ${forks} | ${openIssues} | ${language} | ${license} |`);
    markdownLines.push('');
    if (topics.length > 0) {
      markdownLines.push(`**Topics:** ${topics.map((t) => `\`${t}\``).join(' ')}`);
    }
    if (homepage) {
      markdownLines.push(`**Homepage:** [${homepage}](${homepage})`);
    }
    markdownLines.push(`**Created:** ${createdAt} | **Updated:** ${updatedAt}`);

    return {
      title: name,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format GitHub user data
   */
  private formatUser(user: Record<string, unknown>): {
    title: string;
    text: string;
    markdown: string;
  } {
    const login = String(user.login || 'Unknown');
    const name = String(user.name || login);
    const bio = String(user.bio || '');
    const company = String(user.company || '');
    const location = String(user.location || '');
    const publicRepos = user.public_repos || 0;
    const followers = user.followers || 0;
    const following = user.following || 0;
    const blog = String(user.blog || '');
    const type = String(user.type || 'User');

    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(`${name} (@${login})`);
    lines.push('='.repeat(30));
    if (bio) lines.push(bio);
    lines.push('');
    lines.push(`Type: ${type}`);
    lines.push(`Public Repos: ${publicRepos} | Followers: ${followers} | Following: ${following}`);
    if (company) lines.push(`Company: ${company}`);
    if (location) lines.push(`Location: ${location}`);
    if (blog) lines.push(`Blog: ${blog}`);

    // Markdown format
    markdownLines.push(`# ${name} (@${login})`);
    if (bio) markdownLines.push(`> ${bio}`);
    markdownLines.push('');
    markdownLines.push('| Repos | Followers | Following |');
    markdownLines.push('|-------|-----------|-----------|');
    markdownLines.push(`| ${publicRepos} | ${followers} | ${following} |`);
    markdownLines.push('');
    if (company) markdownLines.push(`**Company:** ${company}`);
    if (location) markdownLines.push(`**Location:** ${location}`);
    if (blog) markdownLines.push(`**Blog:** [${blog}](${blog})`);

    return {
      title: `${name} (@${login})`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Format GitHub issue/PR data
   */
  private formatIssue(
    issue: Record<string, unknown>,
    isPR: boolean
  ): { title: string; text: string; markdown: string } {
    const title = String(issue.title || 'Untitled');
    const number = issue.number;
    const state = String(issue.state || 'unknown');
    const author = (issue.user as Record<string, unknown>)?.login || 'unknown';
    const body = String(issue.body || '');
    const labels = ((issue.labels || []) as Array<Record<string, unknown>>)
      .map((l) => String(l.name))
      .filter(Boolean);
    const createdAt = String(issue.created_at || '');
    const comments = issue.comments || 0;

    const lines: string[] = [];
    const markdownLines: string[] = [];
    const typeLabel = isPR ? 'Pull Request' : 'Issue';

    // Text format
    lines.push(`${typeLabel} #${number}: ${title}`);
    lines.push('='.repeat(50));
    lines.push(`State: ${state} | Author: @${author} | Comments: ${comments}`);
    lines.push(`Created: ${createdAt}`);
    if (labels.length > 0) lines.push(`Labels: ${labels.join(', ')}`);
    lines.push('');
    if (body) lines.push(body);

    // Markdown format
    markdownLines.push(`# ${typeLabel} #${number}: ${title}`);
    markdownLines.push(`**State:** ${state} | **Author:** @${author} | **Comments:** ${comments}`);
    markdownLines.push(`**Created:** ${createdAt}`);
    if (labels.length > 0) {
      markdownLines.push(`**Labels:** ${labels.map((l) => `\`${l}\``).join(' ')}`);
    }
    markdownLines.push('');
    if (body) markdownLines.push(body);

    return {
      title: `${typeLabel} #${number}: ${title}`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }
}

// Export singleton instance
export const gitHubHandler = new GitHubHandler();
