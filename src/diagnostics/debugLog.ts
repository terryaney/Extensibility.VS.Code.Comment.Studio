/**
 * Lightweight debug logging for KAT Comment Studio.
 *
 * Set DEBUG = true to enable. Output goes to the "KAT Comment Studio" Output channel.
 * The reflow cycle cap (MAX_REFLOW_CYCLES) halts auto-reflow after N firings so that
 * debugging sessions don't run indefinitely.
 *
 * To disable: set DEBUG = false and recompile.
 */
import * as vscode from 'vscode';

export const DEBUG = true; // ← flip to false and recompile before shipping

/** Reflow will be halted after this many cycles while DEBUG is true. */
const MAX_REFLOW_CYCLES = 100;

let _channel: vscode.OutputChannel | undefined;
let _reflowCount = 0;

function channel(): vscode.OutputChannel {
  if (!_channel) {
    _channel = vscode.window.createOutputChannel('KAT Comment Studio (Debug)');
  }
  return _channel;
}

/**
 * Log a debug message to the KAT Comment Studio output channel.
 * @param ctx   Short context label (e.g. 'autoReflow', 'decorMgr').
 * @param msg   Human-readable message.
 * @param data  Optional extra data — serialised inline with JSON.stringify.
 */
export function dbg(ctx: string, msg: string, data?: unknown): void {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23); // HH:mm:ss.mmm
  const suffix = data !== undefined ? `  ${JSON.stringify(data)}` : '';
  channel().appendLine(`[${ts}] [${ctx}] ${msg}${suffix}`);
}

/**
 * Returns true and increments the cycle counter if the reflow may proceed.
 * Returns false (and logs a warning) once MAX_REFLOW_CYCLES is reached.
 * Has no effect when DEBUG = false.
 */
export function canReflow(): boolean {
  if (!DEBUG) return true;
  if (_reflowCount >= MAX_REFLOW_CYCLES) {
    channel().appendLine(
      `[KAT-CS] *** REFLOW HALTED: reached ${MAX_REFLOW_CYCLES}-cycle debug cap. ` +
      `Set DEBUG=false or call resetReflowCycles() to resume. ***`,
    );
    return false;
  }
  _reflowCount++;
  return true;
}

/** Reset the reflow cycle counter (call when document changes or on new session). */
export function resetReflowCycles(): void {
  _reflowCount = 0;
}

/** Reveal the output channel in the Output panel. */
export function showDebugChannel(): void {
  channel().show(true);
}

/** Dispose the output channel. Call from extension deactivate(). */
export function disposeDebugChannel(): void {
  _channel?.dispose();
  _channel = undefined;
}
