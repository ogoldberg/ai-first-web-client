/**
 * Error Toast Component
 *
 * Shows a dismissable error notification
 */

import type { ConnectError, ConnectTheme } from '../types.js';
import { injectStyles, getTheme } from './styles.js';

export class ErrorToast {
  private element: HTMLDivElement | null = null;
  private container: HTMLElement;
  private theme: Required<ConnectTheme>;
  private duration: number;
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    container: HTMLElement = document.body,
    theme?: ConnectTheme,
    duration: number = 5000
  ) {
    this.container = container;
    this.theme = getTheme(theme);
    this.duration = duration;
  }

  show(error: ConnectError): void {
    // Remove existing toast
    if (this.element) {
      this.element.remove();
      this.element = null;
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    injectStyles(this.theme);

    // Create toast
    this.element = document.createElement('div');
    this.element.className = 'ub-toast';

    // Create icon
    const icon = document.createElement('span');
    icon.className = 'ub-toast-icon';
    icon.textContent = '\u26A0'; // Warning sign

    // Create message
    const message = document.createElement('span');
    message.className = 'ub-toast-message';
    message.textContent = error.message;

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'ub-toast-close';
    closeBtn.textContent = '\u00D7'; // X symbol
    closeBtn.onclick = () => this.hide();

    // Assemble
    this.element.appendChild(icon);
    this.element.appendChild(message);
    this.element.appendChild(closeBtn);
    this.container.appendChild(this.element);

    // Auto-hide after duration
    if (this.duration > 0) {
      this.hideTimeout = setTimeout(() => this.hide(), this.duration);
    }
  }

  hide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    if (!this.element) return;

    this.element.classList.add('ub-hiding');

    setTimeout(() => {
      this.element?.remove();
      this.element = null;
    }, 300);
  }

  destroy(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    this.element?.remove();
    this.element = null;
  }
}
