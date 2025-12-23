/**
 * PyPI API Handler
 *
 * Extracts package information from pypi.org using the JSON API.
 * Provides detailed package metadata, dependencies, and version info.
 */

import { logger } from '../../utils/logger.js';
import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';

export class PyPIHandler extends BaseSiteHandler {
  readonly name = 'PyPI';
  readonly strategy = 'api:pypi' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    const hostname = parsed.hostname.toLowerCase();

    // Match pypi.org and pypi.python.org
    if (hostname === 'pypi.org' || hostname === 'www.pypi.org') {
      // /project/{package} or /project/{package}/{version}
      return /^\/project\/[^/]+/.test(parsed.pathname);
    }

    if (hostname === 'pypi.python.org') {
      // /pypi/{package} or /pypi/{package}/{version}
      return /^\/pypi\/[^/]+/.test(parsed.pathname);
    }

    return false;
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const packageName = this.getPackageName(url);
    if (!packageName) {
      logger.intelligence.debug('Could not extract PyPI package name from URL');
      return null;
    }

    // PyPI JSON API endpoint
    const apiUrl = `https://pypi.org/pypi/${encodeURIComponent(packageName)}/json`;

    try {
      const response = await fetch(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(
          `PyPI API returned ${response.status} for ${packageName}`
        );
        return null;
      }

      const data = (await response.json()) as Record<string, unknown>;
      const releases = data.releases as Record<string, unknown[]>;
      const formatted = this.formatPackage(data, releases);

      if (!formatted.text || formatted.text.length < (opts.minContentLength || 100)) {
        logger.intelligence.debug('PyPI API response too short');
        return null;
      }

      const info = data.info as Record<string, unknown> | undefined;
      logger.intelligence.info(`PyPI API extraction successful`, {
        package: packageName,
        version: info?.version || 'unknown',
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
      logger.intelligence.debug(`PyPI API failed: ${error}`);
      return null;
    }
  }

  /**
   * Extract package name from PyPI URL
   * Handles various URL formats:
   * - pypi.org/project/{package}
   * - pypi.org/project/{package}/{version}
   * - pypi.python.org/pypi/{package}
   * - pypi.python.org/pypi/{package}/{version}
   */
  private getPackageName(url: string): string | null {
    const parsed = this.parseUrl(url);
    if (!parsed) return null;

    const hostname = parsed.hostname.toLowerCase();
    const pathParts = parsed.pathname.split('/').filter(Boolean);

    if (hostname === 'pypi.org' || hostname === 'www.pypi.org') {
      // /project/{package}/...
      if (pathParts[0] === 'project' && pathParts[1]) {
        return pathParts[1];
      }
    }

    if (hostname === 'pypi.python.org') {
      // /pypi/{package}/...
      if (pathParts[0] === 'pypi' && pathParts[1]) {
        return pathParts[1];
      }
    }

    return null;
  }

  /**
   * Format PyPI package metadata into readable content
   */
  private formatPackage(
    pkg: Record<string, unknown>,
    releases: Record<string, unknown[]>
  ): { title: string; text: string; markdown: string } {
    const info = pkg.info as Record<string, unknown> | undefined;
    if (!info) {
      return { title: '', text: '', markdown: '' };
    }

    const name = String(info.name || '');
    const version = String(info.version || '');
    const summary = String(info.summary || '');
    const description = String(info.description || '');
    const author = String(info.author || info.maintainer || '');
    const authorEmail = String(info.author_email || info.maintainer_email || '');
    const license = String(info.license || '');
    const requiresPython = String(info.requires_python || '');
    const homePage = String(info.home_page || '');
    const projectUrls = info.project_urls as Record<string, string> | undefined;
    const classifiers = info.classifiers as string[] | undefined;
    const requiresDist = info.requires_dist as string[] | undefined;
    const keywords = String(info.keywords || '');

    // Build plain text
    const lines: string[] = [];
    lines.push(`${name} ${version}`);
    if (summary) lines.push(summary);
    lines.push('');

    if (author) lines.push(`Author: ${author}`);
    if (authorEmail) lines.push(`Email: ${authorEmail}`);
    if (license) lines.push(`License: ${license}`);
    if (requiresPython) lines.push(`Requires Python: ${requiresPython}`);

    if (homePage) lines.push(`Homepage: ${homePage}`);
    if (projectUrls) {
      const urls = Object.entries(projectUrls);
      if (urls.length > 0) {
        lines.push('Links:');
        for (const [label, link] of urls.slice(0, 5)) {
          lines.push(`  ${label}: ${link}`);
        }
      }
    }

    if (requiresDist && requiresDist.length > 0) {
      lines.push('');
      lines.push('Dependencies:');
      // Filter out extras (those with markers like "; extra ==")
      // Using regex to handle variable whitespace per PEP 508
      const mainDeps = requiresDist.filter((d) => !/;\s*extra\s*==/.test(d));
      for (const dep of mainDeps.slice(0, 10)) {
        // Remove version specifiers for brevity
        const depName = dep.split(/[<>=!;\[]/)[0].trim();
        lines.push(`  - ${depName}`);
      }
      if (mainDeps.length > 10) {
        lines.push(`  - ...and ${mainDeps.length - 10} more`);
      }
    }

    if (description) {
      lines.push('');
      lines.push('Description:');
      // Truncate long descriptions
      const truncatedDesc =
        description.length > 2000
          ? description.substring(0, 2000) + '...'
          : description;
      lines.push(truncatedDesc);
    }

    // Build markdown
    const markdownLines: string[] = [];
    markdownLines.push(`# ${name}`);
    markdownLines.push('');
    if (summary) markdownLines.push(`> ${summary}`);
    markdownLines.push('');
    markdownLines.push(`**Version:** ${version}`);
    if (author) markdownLines.push(`**Author:** ${author}`);
    if (license) markdownLines.push(`**License:** ${license}`);
    if (requiresPython) markdownLines.push(`**Python:** ${requiresPython}`);
    markdownLines.push('');

    // Links
    if (homePage || (projectUrls && Object.keys(projectUrls).length > 0)) {
      markdownLines.push('## Links');
      if (homePage) markdownLines.push(`- [Homepage](${homePage})`);
      if (projectUrls) {
        for (const [label, link] of Object.entries(projectUrls).slice(0, 5)) {
          markdownLines.push(`- [${label}](${link})`);
        }
      }
      markdownLines.push('');
    }

    // Dependencies
    if (requiresDist && requiresDist.length > 0) {
      // Using regex to handle variable whitespace per PEP 508
      const mainDeps = requiresDist.filter((d) => !/;\s*extra\s*==/.test(d));
      if (mainDeps.length > 0) {
        markdownLines.push('## Dependencies');
        for (const dep of mainDeps.slice(0, 10)) {
          const depName = dep.split(/[<>=!;\[]/)[0].trim();
          markdownLines.push(`- ${depName}`);
        }
        if (mainDeps.length > 10) {
          markdownLines.push(`- *...and ${mainDeps.length - 10} more*`);
        }
        markdownLines.push('');
      }
    }

    // Classifiers (Python versions, topics, etc.)
    if (classifiers && classifiers.length > 0) {
      const pythonVersions = classifiers
        .filter((c) => c.startsWith('Programming Language :: Python ::'))
        .map((c) => c.replace('Programming Language :: Python :: ', ''))
        .filter((v) => /^\d/.test(v)); // Only version numbers

      if (pythonVersions.length > 0) {
        markdownLines.push(`**Supported Python:** ${pythonVersions.join(', ')}`);
      }

      const topics = classifiers
        .filter((c) => c.startsWith('Topic :: '))
        .map((c) => c.replace('Topic :: ', '').split(' :: ')[0]);
      const uniqueTopics = [...new Set(topics)];

      if (uniqueTopics.length > 0) {
        markdownLines.push(`**Topics:** ${uniqueTopics.slice(0, 5).join(', ')}`);
      }
      markdownLines.push('');
    }

    // Keywords
    if (keywords) {
      markdownLines.push(`**Keywords:** ${keywords}`);
      markdownLines.push('');
    }

    // Release info
    const releaseVersions = Object.keys(releases || {});
    if (releaseVersions.length > 0) {
      markdownLines.push(`*${releaseVersions.length} releases available*`);
    }

    // Last release date
    const currentRelease = releases?.[version] as
      | Array<Record<string, unknown>>
      | undefined;
    if (currentRelease && currentRelease.length > 0) {
      const uploadTime =
        currentRelease[0]?.upload_time_iso_8601 || currentRelease[0]?.upload_time;
      if (uploadTime) {
        const releaseDate = new Date(String(uploadTime));
        if (!isNaN(releaseDate.getTime())) {
          markdownLines.push(`*Last release: ${releaseDate.toLocaleDateString()}*`);
        }
      }
    }

    return {
      title: `${name} - PyPI`,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }
}

// Export singleton for convenience
export const pypiHandler = new PyPIHandler();
