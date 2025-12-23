/**
 * NPM Registry API Handler
 *
 * Extracts package information from npmjs.com and registry.npmjs.org.
 * Provides detailed package metadata, dependencies, and version info.
 */

import { logger } from '../../utils/logger.js';
import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';

export class NpmHandler extends BaseSiteHandler {
  readonly name = 'NPM';
  readonly strategy = 'api:npm' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return (
      parsed.hostname === 'www.npmjs.com' ||
      parsed.hostname === 'npmjs.com' ||
      parsed.hostname === 'registry.npmjs.org'
    );
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const packageName = this.getPackageName(url);
    if (!packageName) {
      return null;
    }

    // Encode package name for URL (handles scoped packages like @types/node)
    const encodedName = packageName.replace('/', '%2F');
    const apiUrl = `https://registry.npmjs.org/${encodedName}`;

    logger.intelligence.debug(`Trying NPM Registry API: ${apiUrl}`);

    try {
      const response = await fetch(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`NPM Registry API returned ${response.status}`);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        logger.intelligence.debug(
          `NPM Registry API returned non-JSON: ${contentType}`
        );
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;

      if (!data.name) {
        logger.intelligence.debug('NPM Registry API returned invalid package data');
        return null;
      }

      // Get latest version
      const distTags = data['dist-tags'] as Record<string, string> | undefined;
      const latestVersion = distTags?.latest || 'unknown';

      const formatted = this.formatPackage(data, latestVersion);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug(`NPM content too short: ${formatted.text.length}`);
        return null;
      }

      logger.intelligence.info(`NPM Registry API extraction successful`, {
        package: packageName,
        version: latestVersion,
        contentLength: formatted.text.length,
      });

      return this.createResult(
        url,
        apiUrl,
        {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: data,
        },
        'high'
      );
    } catch (error) {
      logger.intelligence.debug(`NPM Registry API failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract package name from NPM URL
   * Handles:
   * - https://www.npmjs.com/package/express
   * - https://www.npmjs.com/package/@types/node
   * - https://registry.npmjs.org/express
   * - https://registry.npmjs.org/@types%2Fnode
   */
  private getPackageName(url: string): string | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;

    const pathname = decodeURIComponent(parsed.pathname);

    // npmjs.com format: /package/{name} or /package/@scope/name
    if (parsed.hostname.includes('npmjs.com')) {
      const match = pathname.match(/^\/package\/(.+)$/);
      if (match) {
        return match[1];
      }
    }

    // registry.npmjs.org format: /{name} or /@scope/name
    if (parsed.hostname === 'registry.npmjs.org') {
      // Remove leading slash
      const name = pathname.slice(1);
      if (name && name !== '-') {
        return name;
      }
    }

    return null;
  }

  /**
   * Format NPM package data into readable text/markdown
   */
  private formatPackage(
    pkg: Record<string, unknown>,
    latestVersion: string
  ): { title: string; text: string; markdown: string } {
    const lines: string[] = [];
    const markdownLines: string[] = [];

    const name = String(pkg.name || 'Unknown Package');
    const description = String(pkg.description || 'No description');
    const latestInfo =
      (pkg.versions as Record<string, Record<string, unknown>> | undefined)?.[
        latestVersion
      ] || {};
    const distTags = (pkg['dist-tags'] as Record<string, string>) || {};
    const license = String(latestInfo.license || pkg.license || 'Unknown');
    const homepage = String(latestInfo.homepage || pkg.homepage || '');
    const repository = this.extractRepoUrl(
      latestInfo.repository || pkg.repository
    );
    const rawKeywords = latestInfo.keywords || pkg.keywords;
    const keywords: string[] = Array.isArray(rawKeywords) ? rawKeywords : [];
    const maintainers: Array<{ name?: string; email?: string }> = Array.isArray(
      pkg.maintainers
    )
      ? pkg.maintainers
      : [];
    const dependencies = latestInfo.dependencies as
      | Record<string, string>
      | undefined;
    const peerDependencies = latestInfo.peerDependencies as
      | Record<string, string>
      | undefined;
    const time = pkg.time as Record<string, string> | undefined;

    // Text format
    lines.push(`${name}@${latestVersion}`);
    lines.push(`License: ${license}`);
    lines.push('');
    lines.push(description);
    lines.push('');

    // Version info
    if (Object.keys(distTags).length > 0) {
      lines.push('Dist Tags:');
      for (const [tag, version] of Object.entries(distTags)) {
        lines.push(`  ${tag}: ${version}`);
      }
      lines.push('');
    }

    // Links
    if (homepage) {
      lines.push(`Homepage: ${homepage}`);
    }
    if (repository) {
      lines.push(`Repository: ${repository}`);
    }
    lines.push('');

    // Keywords
    if (keywords.length > 0) {
      lines.push(`Keywords: ${keywords.join(', ')}`);
      lines.push('');
    }

    // Dependencies
    if (dependencies && Object.keys(dependencies).length > 0) {
      lines.push(`Dependencies (${Object.keys(dependencies).length}):`);
      for (const [dep, version] of Object.entries(dependencies).slice(0, 15)) {
        lines.push(`  ${dep}: ${version}`);
      }
      if (Object.keys(dependencies).length > 15) {
        lines.push(
          `  ... and ${Object.keys(dependencies).length - 15} more`
        );
      }
      lines.push('');
    }

    // Maintainers
    if (maintainers.length > 0) {
      lines.push('Maintainers:');
      for (const m of maintainers.slice(0, 5)) {
        lines.push(`  ${m.name || 'Unknown'}${m.email ? ` <${m.email}>` : ''}`);
      }
      if (maintainers.length > 5) {
        lines.push(`  ... and ${maintainers.length - 5} more`);
      }
    }

    // Markdown format
    markdownLines.push(`# ${name}`);
    markdownLines.push(`**Version:** ${latestVersion} | **License:** ${license}`);
    markdownLines.push('');
    markdownLines.push(description);
    markdownLines.push('');

    // Install command
    markdownLines.push('## Installation');
    markdownLines.push('```bash');
    markdownLines.push(`npm install ${name}`);
    markdownLines.push('```');
    markdownLines.push('');

    // Links section
    if (homepage || repository) {
      markdownLines.push('## Links');
      if (homepage) {
        markdownLines.push(`- [Homepage](${homepage})`);
      }
      if (repository) {
        markdownLines.push(`- [Repository](${repository})`);
      }
      markdownLines.push(`- [npm](https://www.npmjs.com/package/${name})`);
      markdownLines.push('');
    }

    // Dist tags
    if (Object.keys(distTags).length > 0) {
      markdownLines.push('## Dist Tags');
      markdownLines.push('| Tag | Version |');
      markdownLines.push('|-----|---------|');
      for (const [tag, version] of Object.entries(distTags)) {
        markdownLines.push(`| ${tag} | ${version} |`);
      }
      markdownLines.push('');
    }

    // Keywords
    if (keywords.length > 0) {
      markdownLines.push(
        `**Keywords:** ${keywords.map((k) => `\`${k}\``).join(', ')}`
      );
      markdownLines.push('');
    }

    // Dependencies
    if (dependencies && Object.keys(dependencies).length > 0) {
      markdownLines.push(`## Dependencies (${Object.keys(dependencies).length})`);
      const depList = Object.entries(dependencies).slice(0, 10);
      for (const [dep, version] of depList) {
        markdownLines.push(`- \`${dep}\`: ${version}`);
      }
      if (Object.keys(dependencies).length > 10) {
        markdownLines.push(
          `- *...and ${Object.keys(dependencies).length - 10} more*`
        );
      }
      markdownLines.push('');
    }

    // Peer dependencies
    if (peerDependencies && Object.keys(peerDependencies).length > 0) {
      markdownLines.push(`## Peer Dependencies`);
      for (const [dep, version] of Object.entries(peerDependencies)) {
        markdownLines.push(`- \`${dep}\`: ${version}`);
      }
      markdownLines.push('');
    }

    // Maintainers
    if (maintainers.length > 0) {
      markdownLines.push('## Maintainers');
      for (const m of maintainers.slice(0, 5)) {
        markdownLines.push(`- ${m.name || 'Unknown'}`);
      }
      if (maintainers.length > 5) {
        markdownLines.push(`- *...and ${maintainers.length - 5} more*`);
      }
      markdownLines.push('');
    }

    // Last published
    if (time && time[latestVersion]) {
      const publishDate = new Date(time[latestVersion]);
      if (!isNaN(publishDate.getTime())) {
        markdownLines.push(`*Last published: ${publishDate.toLocaleDateString()}*`);
      }
    }

    return {
      title: `${name} - npm`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }

  /**
   * Extract repository URL from package.json repository field
   */
  private extractRepoUrl(repo: unknown): string {
    if (!repo) return '';

    let url = '';
    if (typeof repo === 'string') {
      url = repo;
    } else if (typeof repo === 'object' && repo !== null) {
      const repoObj = repo as Record<string, unknown>;
      url = String(repoObj.url || '');
    }

    // Convert git+https:// to https:// and remove .git suffix
    return url.replace(/^git\+/, '').replace(/\.git$/, '');
  }
}

// Export singleton for convenience
export const npmHandler = new NpmHandler();
