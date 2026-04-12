/**
 * Matches an enum member line: an identifier optionally followed by `= value`
 * and an optional trailing comma.  Examples:
 *   `Weeks = 5`, `Weeks = 5,`, `Weeks,`, `None = 0x00`, `Last = -1,`
 */
const ENUM_MEMBER_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*(=\s*[^,\s][^,]*)?\s*,?\s*$/;

/**
 * C# declaration keywords and modifiers that cannot appear at the start of an
 * enum member.  If a line begins with any of these (case-sensitive), it is not
 * an enum member.
 */
const CSHARP_DECL_PREFIXES = new Set([
  'public', 'private', 'protected', 'internal', 'static', 'abstract', 'virtual',
  'override', 'sealed', 'readonly', 'partial', 'async', 'extern', 'new',
  'class', 'interface', 'struct', 'enum', 'delegate', 'record',
  'void', 'int', 'string', 'bool', 'double', 'float', 'long', 'byte',
  'char', 'object', 'var', 'dynamic', 'return', 'using', 'namespace',
]);

/**
 * Tries to detect a C# enum member in a trimmed source line.
 * Returns `{ name, value }` where `value` is the raw numeric/hex literal
 * (without `=` or leading/trailing whitespace) if an assignment is present,
 * or `undefined` when there is no assignment.  Returns `undefined` when the
 * line is not recognised as an enum member.
 */
export function detectEnumMember(line: string): { name: string; value: string | undefined } | undefined {
  const m = ENUM_MEMBER_RE.exec(line);
  if (!m) return undefined;

  const firstWord = m[1];
  if (CSHARP_DECL_PREFIXES.has(firstWord)) return undefined;

  const value = m[2] !== undefined ? m[2].replace(/^=\s*/, '').trimEnd() : undefined;
  return { name: firstWord, value };
}
