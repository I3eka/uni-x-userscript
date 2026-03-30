/**
 * Styled console logger — prefixes all output with [Uni-X] and color-codes by level.
 */

export const Logger = {
  log: (msg: string, ...args: unknown[]): void =>
    console.log(`%c[Uni-X] \u2139\uFE0F ${msg}`, 'color: #3b82f6', ...args),

  success: (msg: string, ...args: unknown[]): void =>
    console.log(`%c[Uni-X] \u2705 ${msg}`, 'color: #10b981', ...args),

  error: (msg: string, ...args: unknown[]): void =>
    console.error(`%c[Uni-X] \u274C ${msg}`, 'color: #ef4444', ...args),
} as const;
