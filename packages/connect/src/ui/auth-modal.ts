/**
 * Auth Modal Component
 *
 * Shows a modal prompting user before opening auth popup
 */

import type { AuthPromptConfig, ConnectTheme } from '../types.js';
import { injectStyles, getTheme } from './styles.js';

export interface AuthModalResult {
  confirmed: boolean;
}

export class AuthModal {
  private element: HTMLDivElement | null = null;
  private container: HTMLElement;
  private theme: Required<ConnectTheme>;

  constructor(container: HTMLElement = document.body, theme?: ConnectTheme) {
    this.container = container;
    this.theme = getTheme(theme);
  }

  show(config: AuthPromptConfig = {}): Promise<AuthModalResult> {
    return new Promise((resolve) => {
      if (this.element) {
        this.element.remove();
      }

      injectStyles(this.theme);

      const {
        title = 'Sign In Required',
        message = 'A popup window will open for you to sign in. Please complete the sign-in process to continue.',
        buttonText = 'Continue',
        cancelText = 'Cancel',
        showCancel = true,
      } = config;

      // Create overlay
      this.element = document.createElement('div');
      this.element.className = 'ub-overlay';

      // Create card
      const card = document.createElement('div');
      card.className = 'ub-card';

      // Create title
      const titleEl = document.createElement('h2');
      titleEl.className = 'ub-title';
      titleEl.textContent = title;

      // Create message
      const messageEl = document.createElement('p');
      messageEl.className = 'ub-message';
      messageEl.textContent = message;

      // Create buttons container
      const buttons = document.createElement('div');
      buttons.className = 'ub-buttons';

      // Create cancel button
      if (showCancel) {
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'ub-btn ub-btn-secondary';
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => {
          this.hide();
          resolve({ confirmed: false });
        };
        buttons.appendChild(cancelBtn);
      }

      // Create continue button
      const continueBtn = document.createElement('button');
      continueBtn.className = 'ub-btn ub-btn-primary';
      continueBtn.textContent = buttonText;
      continueBtn.onclick = () => {
        this.hide();
        resolve({ confirmed: true });
      };
      buttons.appendChild(continueBtn);

      // Assemble
      card.appendChild(titleEl);
      card.appendChild(messageEl);
      card.appendChild(buttons);
      this.element.appendChild(card);
      this.container.appendChild(this.element);

      // Focus continue button
      continueBtn.focus();
    });
  }

  hide(): void {
    if (!this.element) return;

    this.element.classList.add('ub-hiding');

    setTimeout(() => {
      this.element?.remove();
      this.element = null;
    }, 200);
  }

  destroy(): void {
    this.element?.remove();
    this.element = null;
  }
}
