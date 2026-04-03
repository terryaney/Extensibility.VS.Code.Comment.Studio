const { findAllCommentBlocks } = require('./out/parsing/commentParser');

const csharpStyle = {
  languageId: 'csharp',
  singleLineDocPrefix: '///',
  supportsMultiLineDoc: true,
  multiLineDocStart: '/**',
  multiLineDocEnd: '*/',
  multiLineContinuation: '*',
};

// Test case 1: Comment block with blank line between /// lines
const lines1 = [
  '/// <summary>',
  '/// First line.',
  '',  // Empty line
  '/// Second line.',
  '/// </summary>',
];

const blocks1 = findAllCommentBlocks(lines1, csharpStyle);
console.log('Test 1 - Blank line in middle:');
console.log('Blocks found:', blocks1.length);
if (blocks1.length > 0) {
  blocks1.forEach((b, i) => {
    console.log(\  Block \: lines \-\\);
    console.log(\  Content: \\);
  });
}

// Test case 2: Whitespace-only line between /// lines
const lines2 = [
  '/// <summary>',
  '/// First line.',
  '   ',  // Whitespace-only line
  '/// Second line.',
  '/// </summary>',
];

const blocks2 = findAllCommentBlocks(lines2, csharpStyle);
console.log('\nTest 2 - Whitespace-only line in middle:');
console.log('Blocks found:', blocks2.length);
if (blocks2.length > 0) {
  blocks2.forEach((b, i) => {
    console.log(\  Block \: lines \-\\);
  });
}

// Test case 3: No blank line between /// lines
const lines3 = [
  '/// <summary>',
  '/// First line.',
  '/// Second line.',
  '/// </summary>',
];

const blocks3 = findAllCommentBlocks(lines3, csharpStyle);
console.log('\nTest 3 - No blank line:');
console.log('Blocks found:', blocks3.length);
if (blocks3.length > 0) {
  blocks3.forEach((b, i) => {
    console.log(\  Block \: lines \-\\);
    console.log(\  Content: \\);
  });
}
