/**
 * UI Manager
 *
 * Coordinates all UI components for the Connect SDK
 */

import type {
  ConnectTheme,
  GlobalUIOptions,
  FetchUIOptions,
  FetchProgress,
  ConnectError,
  AuthPromptConfig,
} from '../types.js';
import { ProgressOverlay } from './progress-overlay.js';
import { AuthModal, type AuthModalResult } from './auth-modal.js';
import { ErrorToast } from './error-toast.js';

export class UIManager {
  private globalOptions: GlobalUIOptions;
  private theme?: ConnectTheme;
  private progressOverlay: ProgressOverlay | null = null;
  private authModal: AuthModal | null = null;
  private errorToast: ErrorToast | null = null;

  constructor(globalOptions: GlobalUIOptions = {}, theme?: ConnectTheme) {
    this.globalOptions = globalOptions;
    this.theme = theme;
  }

  /**
   * Check if progress should be shown for a fetch
   */
  shouldShowProgress(fetchUI?: FetchUIOptions): boolean {
    // Per-fetch option overrides global
    if (fetchUI?.showProgress !== undefined) {
      return fetchUI.showProgress;
    }
    return this.globalOptions.showProgress ?? false;
  }

  /**
   * Get container for UI components
   */
  private getContainer(fetchUI?: FetchUIOptions): HTMLElement {
    return fetchUI?.container ?? this.globalOptions.container ?? document.body;
  }

  /**
   * Show progress overlay
   */
  showProgress(fetchUI?: FetchUIOptions): void {
    if (!this.shouldShowProgress(fetchUI)) return;

    const container = this.getContainer(fetchUI);
    this.progressOverlay = new ProgressOverlay(container, this.theme);
    this.progressOverlay.show();
  }

  /**
   * Update progress overlay
   */
  updateProgress(progress: FetchProgress): void {
    this.progressOverlay?.update(progress);
  }

  /**
   * Hide progress overlay
   */
  hideProgress(): void {
    this.progressOverlay?.hide();
    this.progressOverlay = null;
  }

  /**
   * Show auth prompt modal
   */
  async showAuthPrompt(
    config: AuthPromptConfig,
    fetchUI?: FetchUIOptions
  ): Promise<AuthModalResult> {
    const container = this.getContainer(fetchUI);
    this.authModal = new AuthModal(container, this.theme);
    const result = await this.authModal.show(config);
    this.authModal = null;
    return result;
  }

  /**
   * Show error toast
   */
  showError(error: ConnectError): void {
    if (!this.globalOptions.showErrors) return;

    const container = this.globalOptions.container ?? document.body;
    const duration = this.globalOptions.errorDuration ?? 5000;

    this.errorToast = new ErrorToast(container, this.theme, duration);
    this.errorToast.show(error);
  }

  /**
   * Hide error toast
   */
  hideError(): void {
    this.errorToast?.hide();
    this.errorToast = null;
  }

  /**
   * Clean up all UI components
   */
  destroy(): void {
    this.progressOverlay?.destroy();
    this.progressOverlay = null;

    this.authModal?.destroy();
    this.authModal = null;

    this.errorToast?.destroy();
    this.errorToast = null;
  }
}
