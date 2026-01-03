/**
 * Progress Overlay Component
 *
 * Shows a modal overlay with loading spinner and progress information
 */

import type { FetchProgress, ConnectTheme } from '../types.js';
import { injectStyles, getTheme } from './styles.js';

export class ProgressOverlay {
  private element: HTMLDivElement | null = null;
  private percentEl: HTMLDivElement | null = null;
  private stageEl: HTMLDivElement | null = null;
  private container: HTMLElement;
  private theme: Required<ConnectTheme>;

  constructor(container: HTMLElement = document.body, theme?: ConnectTheme) {
    this.container = container;
    this.theme = getTheme(theme);
  }

  show(): void {
    if (this.element) return;

    injectStyles(this.theme);

    // Create overlay
    this.element = document.createElement('div');
    this.element.className = 'ub-overlay';

    // Create card
    const card = document.createElement('div');
    card.className = 'ub-card';

    // Create progress container
    const progressContainer = document.createElement('div');
    progressContainer.className = 'ub-progress-container';

    // Create spinner
    const spinner = document.createElement('div');
    spinner.className = 'ub-spinner';

    // Create percent display
    this.percentEl = document.createElement('div');
    this.percentEl.className = 'ub-percent';
    this.percentEl.textContent = '0%';

    // Create stage display
    this.stageEl = document.createElement('div');
    this.stageEl.className = 'ub-stage';
    this.stageEl.textContent = 'Initializing...';

    // Assemble
    progressContainer.appendChild(spinner);
    progressContainer.appendChild(this.percentEl);
    progressContainer.appendChild(this.stageEl);
    card.appendChild(progressContainer);
    this.element.appendChild(card);
    this.container.appendChild(this.element);
  }

  update(progress: FetchProgress): void {
    if (!this.element) return;

    if (this.percentEl) {
      this.percentEl.textContent = `${progress.percent}%`;
    }
    if (this.stageEl) {
      this.stageEl.textContent = progress.message;
    }
  }

  hide(): void {
    if (!this.element) return;

    this.element.classList.add('ub-hiding');

    setTimeout(() => {
      this.element?.remove();
      this.element = null;
      this.percentEl = null;
      this.stageEl = null;
    }, 200);
  }

  destroy(): void {
    this.element?.remove();
    this.element = null;
    this.percentEl = null;
    this.stageEl = null;
  }
}
