/**
 * CSS styles for Unbrowser Connect UI components
 */

import type { ConnectTheme } from '../types.js';

const DEFAULT_THEME: Required<ConnectTheme> = {
  primaryColor: '#6366f1',
  backgroundColor: '#ffffff',
  textColor: '#1f2937',
  borderRadius: '8px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

export function getTheme(custom?: ConnectTheme): Required<ConnectTheme> {
  return { ...DEFAULT_THEME, ...custom };
}

export function injectStyles(theme: Required<ConnectTheme>): void {
  if (document.getElementById('unbrowser-connect-styles')) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = 'unbrowser-connect-styles';
  style.textContent = getCSS(theme);
  document.head.appendChild(style);
}

export function getCSS(theme: Required<ConnectTheme>): string {
  return `
    .ub-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      font-family: ${theme.fontFamily};
      animation: ub-fade-in 0.2s ease-out;
    }

    @keyframes ub-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes ub-fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }

    .ub-overlay.ub-hiding {
      animation: ub-fade-out 0.2s ease-out forwards;
    }

    .ub-card {
      background: ${theme.backgroundColor};
      border-radius: ${theme.borderRadius};
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      animation: ub-slide-up 0.2s ease-out;
    }

    @keyframes ub-slide-up {
      from { transform: translateY(10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }

    .ub-title {
      color: ${theme.textColor};
      font-size: 18px;
      font-weight: 600;
      margin: 0 0 8px 0;
    }

    .ub-message {
      color: ${theme.textColor};
      opacity: 0.7;
      font-size: 14px;
      margin: 0 0 20px 0;
      line-height: 1.5;
    }

    .ub-progress-container {
      text-align: center;
    }

    .ub-spinner {
      width: 48px;
      height: 48px;
      border: 3px solid ${theme.primaryColor}20;
      border-top-color: ${theme.primaryColor};
      border-radius: 50%;
      animation: ub-spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes ub-spin {
      to { transform: rotate(360deg); }
    }

    .ub-percent {
      font-size: 24px;
      font-weight: 600;
      color: ${theme.textColor};
      margin-bottom: 4px;
    }

    .ub-stage {
      font-size: 14px;
      color: ${theme.textColor};
      opacity: 0.7;
    }

    .ub-buttons {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .ub-btn {
      padding: 10px 20px;
      border-radius: ${theme.borderRadius};
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }

    .ub-btn-primary {
      background: ${theme.primaryColor};
      color: white;
    }

    .ub-btn-primary:hover {
      filter: brightness(1.1);
    }

    .ub-btn-secondary {
      background: transparent;
      color: ${theme.textColor};
      border: 1px solid ${theme.textColor}30;
    }

    .ub-btn-secondary:hover {
      background: ${theme.textColor}10;
    }

    .ub-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #ef4444;
      color: white;
      padding: 12px 20px;
      border-radius: ${theme.borderRadius};
      font-family: ${theme.fontFamily};
      font-size: 14px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
      z-index: 999999;
      animation: ub-slide-in 0.3s ease-out;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 400px;
    }

    @keyframes ub-slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }

    .ub-toast.ub-hiding {
      animation: ub-slide-out 0.3s ease-out forwards;
    }

    @keyframes ub-slide-out {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }

    .ub-toast-icon {
      flex-shrink: 0;
    }

    .ub-toast-message {
      flex: 1;
    }

    .ub-toast-close {
      background: none;
      border: none;
      color: white;
      opacity: 0.7;
      cursor: pointer;
      padding: 4px;
      font-size: 18px;
      line-height: 1;
    }

    .ub-toast-close:hover {
      opacity: 1;
    }
  `;
}
