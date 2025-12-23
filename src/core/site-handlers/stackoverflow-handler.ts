/**
 * Stack Exchange API Handler
 *
 * Extracts content from Stack Overflow and other Stack Exchange sites.
 * Supports questions and answers with full formatting.
 */

import { logger } from '../../utils/logger.js';
import {
  BaseSiteHandler,
  type FetchFunction,
  type SiteHandlerOptions,
  type SiteHandlerResult,
} from './types.js';

const STACK_SITES = [
  'stackoverflow.com',
  'serverfault.com',
  'superuser.com',
  'askubuntu.com',
  'stackexchange.com',
];

const SE_API = 'https://api.stackexchange.com/2.3';

export class StackOverflowHandler extends BaseSiteHandler {
  readonly name = 'StackOverflow';
  readonly strategy = 'api:stackoverflow' as const;

  canHandle(url: string): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;
    return STACK_SITES.some((site) => parsed.hostname.endsWith(site));
  }

  async extract(
    url: string,
    fetch: FetchFunction,
    opts: SiteHandlerOptions
  ): Promise<SiteHandlerResult | null> {
    const { site, questionId } = this.parseStackExchangeUrl(url);
    if (!questionId) {
      return null;
    }

    const apiUrl = `${SE_API}/questions/${questionId}?site=${site}&filter=withbody`;

    logger.intelligence.debug(`Trying StackExchange API: ${apiUrl}`);

    try {
      const response = await fetch(apiUrl, {
        ...opts,
        headers: {
          ...opts.headers,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        logger.intelligence.debug(`StackExchange API returned ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        items?: Array<Record<string, unknown>>;
      };

      if (!data.items || data.items.length === 0) {
        return null;
      }

      const question = data.items[0];

      // Also fetch answers
      let answers: Array<Record<string, unknown>> = [];
      try {
        const answersUrl = `${SE_API}/questions/${questionId}/answers?site=${site}&filter=withbody&sort=votes&order=desc`;
        const answersResponse = await fetch(answersUrl, opts);
        if (answersResponse.ok) {
          const answersData = (await answersResponse.json()) as {
            items?: Array<Record<string, unknown>>;
          };
          answers = answersData.items || [];
        }
      } catch {
        // Answers fetch failed, continue without them
      }

      const formatted = this.formatQuestion(question, answers);

      if (formatted.text.length < (opts.minContentLength || 100)) {
        return null;
      }

      logger.intelligence.info(`StackExchange API extraction successful`, {
        site,
        questionId,
        contentLength: formatted.text.length,
        answersCount: answers.length,
      });

      return this.createResult(
        url,
        apiUrl,
        {
          title: formatted.title,
          text: formatted.text,
          markdown: formatted.markdown,
          structured: { question, answers },
        },
        'high'
      );
    } catch (error) {
      logger.intelligence.debug(`StackExchange API failed: ${error}`);
      return null;
    }
  }

  /**
   * Parse Stack Exchange URL to get site and question ID
   */
  private parseStackExchangeUrl(url: string): {
    site: string;
    questionId: string | null;
  } {
    const parsed = this.parseUrl(url);
    if (!parsed) {
      return { site: 'stackoverflow', questionId: null };
    }

    const hostname = parsed.hostname;

    // Determine site parameter for API
    let site = 'stackoverflow';
    if (hostname.includes('serverfault')) site = 'serverfault';
    else if (hostname.includes('superuser')) site = 'superuser';
    else if (hostname.includes('askubuntu')) site = 'askubuntu';
    else if (hostname.includes('stackexchange')) {
      // Format: sitename.stackexchange.com
      const match = hostname.match(/^([^.]+)\.stackexchange\.com$/);
      if (match) site = match[1];
    }

    // Extract question ID from URL
    // Patterns: /questions/12345/..., /q/12345, /a/12345
    const questionMatch = parsed.pathname.match(/\/questions\/(\d+)/);
    const shortMatch = parsed.pathname.match(/\/q\/(\d+)/);

    const questionId = questionMatch?.[1] || shortMatch?.[1] || null;

    return { site, questionId };
  }

  /**
   * Format Stack Exchange question data
   */
  private formatQuestion(
    question: Record<string, unknown>,
    answers: Array<Record<string, unknown>>
  ): { title: string; text: string; markdown: string } {
    const title = String(question.title || 'Question');
    const body = String(question.body || '');
    const score = question.score || 0;
    const viewCount = question.view_count || 0;
    const answerCount = question.answer_count || 0;
    const isAnswered = question.is_answered || false;
    const tags = (question.tags || []) as string[];
    const owner = (question.owner as Record<string, unknown>) || {};
    const authorName = String(owner.display_name || 'Anonymous');
    const createdAt = question.creation_date
      ? new Date(Number(question.creation_date) * 1000).toISOString()
      : '';

    const lines: string[] = [];
    const markdownLines: string[] = [];

    // Text format
    lines.push(title);
    lines.push('='.repeat(50));
    lines.push(
      `Score: ${score} | Views: ${viewCount} | Answers: ${answerCount}${isAnswered ? ' (Accepted)' : ''}`
    );
    lines.push(`Asked by: ${authorName} | ${createdAt}`);
    lines.push(`Tags: ${tags.join(', ')}`);
    lines.push('');
    // Strip HTML from body
    const cleanBody = body
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    lines.push(cleanBody);

    // Markdown format
    markdownLines.push(`# ${title}`);
    markdownLines.push(
      `**Score:** ${score} | **Views:** ${viewCount} | **Answers:** ${answerCount}${isAnswered ? ' (Accepted answer)' : ''}`
    );
    markdownLines.push(`**Asked by:** ${authorName} | **Date:** ${createdAt}`);
    markdownLines.push(`**Tags:** ${tags.map((t) => `\`${t}\``).join(' ')}`);
    markdownLines.push('');
    markdownLines.push('## Question');
    markdownLines.push('');
    // Keep HTML structure for markdown but simplify
    const mdBody = body
      .replace(/<pre><code>/g, '\n```\n')
      .replace(/<\/code><\/pre>/g, '\n```\n')
      .replace(/<code>/g, '`')
      .replace(/<\/code>/g, '`')
      .replace(/<p>/g, '\n\n')
      .replace(/<\/p>/g, '')
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '');
    markdownLines.push(mdBody.trim());

    // Add top answers
    if (answers.length > 0) {
      lines.push('');
      lines.push('--- Answers ---');
      markdownLines.push('');
      markdownLines.push('## Answers');

      for (const answer of answers.slice(0, 3)) {
        const answerBody = String(answer.body || '');
        const answerScore = answer.score || 0;
        const isAccepted = answer.is_accepted || false;
        const answerOwner = (answer.owner as Record<string, unknown>) || {};
        const answerAuthor = String(answerOwner.display_name || 'Anonymous');

        lines.push('');
        lines.push(
          `${isAccepted ? '[ACCEPTED] ' : ''}[${answerScore}] by ${answerAuthor}:`
        );
        const cleanAnswer = answerBody
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        lines.push(
          cleanAnswer.substring(0, 500) +
            (cleanAnswer.length > 500 ? '...' : '')
        );

        markdownLines.push('');
        markdownLines.push(
          `### ${isAccepted ? 'Accepted Answer' : 'Answer'} by ${answerAuthor} (${answerScore} votes)`
        );
        const mdAnswer = answerBody
          .replace(/<pre><code>/g, '\n```\n')
          .replace(/<\/code><\/pre>/g, '\n```\n')
          .replace(/<code>/g, '`')
          .replace(/<\/code>/g, '`')
          .replace(/<p>/g, '\n\n')
          .replace(/<\/p>/g, '')
          .replace(/<br\s*\/?>/g, '\n')
          .replace(/<[^>]+>/g, '');
        markdownLines.push(mdAnswer.trim());
      }
    }

    return {
      title,
      text: lines.join('\n'),
      markdown: markdownLines.join('\n'),
    };
  }
}

// Export singleton for convenience
export const stackOverflowHandler = new StackOverflowHandler();
