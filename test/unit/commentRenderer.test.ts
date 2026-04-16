import { describe, it, expect } from 'vitest';
import { renderXmlContent, getStrippedSummaryFromXml, NO_SUMMARY_PLACEHOLDER, renderToMarkdownString, renderCommentBlock, getStrippedSummary } from '../../src/rendering/commentRenderer';
import { SegmentType, CommentSectionType, GitRepositoryInfo, GitHostingProvider, XmlDocCommentBlock } from '../../src/types';

describe('XmlDocCommentRenderer', () => {
  // --- Missing Summary Tests ---
  describe('missing summary', () => {
    it('should return placeholder when no summary element exists', () => {
      const result = getStrippedSummaryFromXml('<remarks>Only remarks.</remarks>');
      expect(result).toBe(NO_SUMMARY_PLACEHOLDER);
    });

    it('should add placeholder summary section when summary is missing', () => {
      const result = renderXmlContent('<remarks>Only remarks.</remarks>');
      expect(result.sections.find(s => s.type === CommentSectionType.Summary)).toBeDefined();
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary)!;
      const hasPlaceholder = summary.lines.flatMap(l => l.segments).some(s => s.text === NO_SUMMARY_PLACEHOLDER);
      expect(hasPlaceholder).toBe(true);
    });

    it('should return placeholder for empty summary', () => {
      const result = getStrippedSummaryFromXml('<summary>   </summary><returns>value</returns>');
      expect(result).toBe(NO_SUMMARY_PLACEHOLDER);
    });

    it('should add placeholder section for empty summary', () => {
      const result = renderXmlContent('<summary>   </summary><returns>value</returns>');
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary)!;
      expect(summary).toBeDefined();
      const hasPlaceholder = summary.lines.flatMap(l => l.segments).some(s => s.text === NO_SUMMARY_PLACEHOLDER);
      expect(hasPlaceholder).toBe(true);
    });
  });

  // --- Inheritdoc Tests ---
  describe('inheritdoc', () => {
    it('should return inherited message for inheritdoc', () => {
      const result = getStrippedSummaryFromXml('<inheritdoc/>');
      expect(result).toBe('(Documentation inherited)');
    });

    it('should return inherited message with type name for inheritdoc with cref', () => {
      const result = getStrippedSummaryFromXml('<inheritdoc cref="IDisposable.Dispose"/>');
      expect(result).toBe('(Documentation inherited from Dispose)');
    });

    it('should handle full cref with type prefix', () => {
      const result = getStrippedSummaryFromXml('<inheritdoc cref="T:System.IDisposable"/>');
      expect(result).toBe('(Documentation inherited from IDisposable)');
    });

    it('should create summary section for inheritdoc', () => {
      const result = renderXmlContent('<inheritdoc/>');
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      expect(summary).toBeDefined();
      const allSegments = summary!.lines.flatMap(l => l.segments);
      expect(allSegments.some(s => s.text.includes('Documentation inherited'))).toBe(true);
    });

    it('should include type name in code segment for inheritdoc with cref', () => {
      const result = renderXmlContent('<inheritdoc cref="ICloneable.Clone"/>');
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      expect(summary).toBeDefined();
      const allSegments = summary!.lines.flatMap(l => l.segments);
      expect(allSegments.some(s => s.type === SegmentType.Code && s.text === 'Clone')).toBe(true);
    });

    it('should use italic for inherited documentation message', () => {
      const result = renderXmlContent('<inheritdoc/>');
      const allSegments = result.sections.find(s => s.type === CommentSectionType.Summary)!.lines.flatMap(l => l.segments);
      expect(allSegments.some(s => s.type === SegmentType.Italic)).toBe(true);
    });
  });

  // --- Remarks Tests ---
  describe('remarks', () => {
    it('should preserve line breaks in remarks with XML tags', () => {
      const xml = `<summary>Test summary</summary>
<remarks>
Line 1 with <c>SomeType</c> reference.
Line 2 with <c>AnotherType</c> reference.
</remarks>`;

      const result = renderXmlContent(xml);
      const remarksSection = result.sections.find(s => s.type === CommentSectionType.Remarks);
      expect(remarksSection).toBeDefined();

      const contentLines = remarksSection!.lines.filter(l => l.segments.length > 0 && l.segments.some(s => s.text.trim()));
      expect(contentLines.length).toBeGreaterThanOrEqual(2);

      const linesWithCode = contentLines.filter(l => l.segments.some(s => s.type === SegmentType.Code));
      expect(linesWithCode.length).toBeGreaterThanOrEqual(2);
    });

    it('should preserve structure with mixed content', () => {
      const xml = `<remarks>
First paragraph with <c>Code1</c>.
Second paragraph with <see cref="Type"/> reference.
</remarks>`;

      const result = renderXmlContent(xml);
      const remarksSection = result.sections.find(s => s.type === CommentSectionType.Remarks);
      expect(remarksSection).toBeDefined();

      const contentLines = remarksSection!.lines.filter(l => l.segments.length > 0 && l.segments.some(s => s.text.trim()));
      expect(contentLines.length).toBeGreaterThanOrEqual(2);
    });

    it('should render inline code in remarks', () => {
      const xml = `<remarks>
Use <c>MyMethod</c> for processing.
</remarks>`;

      const result = renderXmlContent(xml);
      const remarksSection = result.sections.find(s => s.type === CommentSectionType.Remarks);
      expect(remarksSection).toBeDefined();

      const allSegments = remarksSection!.lines.flatMap(l => l.segments);
      const codeSegment = allSegments.find(s => s.type === SegmentType.Code);
      expect(codeSegment).toBeDefined();
      expect(codeSegment!.text).toBe('MyMethod');
    });
  });

  // --- Parameter Section Tests ---
  describe('parameters', () => {
    it('should create parameter section with name and heading', () => {
      const xml = `<summary>Does work.</summary>
<param name="value">The value to process.</param>`;

      const result = renderXmlContent(xml);
      const paramSection = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(paramSection).toBeDefined();
      expect(paramSection!.name).toBe('value');
      expect(paramSection!.heading).toBe("Parameter 'value':");

      const renderedText = paramSection!.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(renderedText).toContain('The value to process.');
    });

    it('should create type parameter section with name and heading', () => {
      const xml = `<summary>Does generic work.</summary>
<typeparam name="TItem">The item type.</typeparam>`;

      const result = renderXmlContent(xml);
      const typeParamSection = result.sections.find(s => s.type === CommentSectionType.TypeParam);
      expect(typeParamSection).toBeDefined();
      expect(typeParamSection!.name).toBe('TItem');
      expect(typeParamSection!.heading).toBe("Type parameter 'TItem':");
    });

    it('should preserve declaration order for multiple params', () => {
      const xml = `<summary>Multiple parameters.</summary>
<param name="first">First value.</param>
<param name="second">Second value.</param>`;

      const result = renderXmlContent(xml);
      const paramSections = result.sections.filter(s => s.type === CommentSectionType.Param);
      expect(paramSections).toHaveLength(2);
      expect(paramSections[0].name).toBe('first');
      expect(paramSections[1].name).toBe('second');
    });

    it('should keep param and add summary placeholder when summary is missing', () => {
      const xml = '<param name="path">Path to file.</param>';

      const result = renderXmlContent(xml);
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      expect(summary).toBeDefined();
      const hasPlaceholder = summary!.lines.flatMap(l => l.segments).some(s => s.text === NO_SUMMARY_PLACEHOLDER);
      expect(hasPlaceholder).toBe(true);

      const paramSection = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(paramSection).toBeDefined();
      expect(paramSection!.name).toBe('path');
    });
  });

  // --- Malformed XML Tests ---
  describe('malformed XML', () => {
    it('should fall back to plain text summary for malformed XML', () => {
      const xml = '<summary>Broken <c>tag';
      const result = renderXmlContent(xml);

      expect(result.sections.length).toBeGreaterThan(0);
      const allText = result.sections
        .flatMap(s => s.lines)
        .flatMap(l => l.segments)
        .map(s => s.text)
        .join('');
      expect(allText).toContain('Broken');
    });

    it('should strip tags and return text for malformed XML summary', () => {
      const xml = '<summary>Broken <c>tag';
      const result = getStrippedSummaryFromXml(xml);
      expect(result).toBe('Broken `tag`');
    });
  });

  // --- Para element truncation for CodeLens ---
  describe('para truncation in getStrippedSummaryFromXml', () => {
    it('should use text before first <para> when present', () => {
      const xml = '<summary>Intro text.<para>More detail here.</para><para>Even more.</para></summary>';
      const result = getStrippedSummaryFromXml(xml);
      expect(result).toBe('Intro text.');
    });

    it('should use first <para> content when no text precedes it', () => {
      const xml = '<summary><para>First paragraph.</para><para>Second paragraph.</para></summary>';
      const result = getStrippedSummaryFromXml(xml);
      expect(result).toBe('First paragraph.');
    });

    it('should use whitespace-only pre-para text as empty, falling back to first <para>', () => {
      const xml = '<summary>   <para>First paragraph.</para></summary>';
      const result = getStrippedSummaryFromXml(xml);
      expect(result).toBe('First paragraph.');
    });

    it('should return full text when no <para> elements are present', () => {
      const xml = '<summary>Plain summary text without paragraphs.</summary>';
      const result = getStrippedSummaryFromXml(xml);
      expect(result).toBe('Plain summary text without paragraphs.');
    });
  });


  describe('issue references in rendered content', () => {
    it('should render both issue reference and code in summary', () => {
      const xml = '<summary>Fix #7 using <c>Apply()</c>.</summary>';
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };

      const result = renderXmlContent(xml, repoInfo);
      const summarySegments = result.sections
        .find(s => s.type === CommentSectionType.Summary)!
        .lines.flatMap(l => l.segments);

      expect(summarySegments.some(s => s.type === SegmentType.IssueReference && s.text === '#7')).toBe(true);
      expect(summarySegments.some(s => s.type === SegmentType.Code && s.text === 'Apply()')).toBe(true);
    });
  });

  // --- renderToMarkdownString Tests ---
  describe('renderToMarkdownString', () => {
    function makeBlock(xmlContent: string): XmlDocCommentBlock {
      return {
        startOffset: 0,
        endOffset: xmlContent.length,
        startLine: 0,
        endLine: 0,
        indentation: '',
        xmlContent,
        isMultiLineStyle: false,
      };
    }

    it('should render summary as plain text without heading', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Hello world</summary>'));
      expect(md).toContain('Hello world');
      expect(md).not.toContain('**Summary**');
    });

    it('should render parameters with heading and name', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Test</summary><param name="value">The value</param>'));
      expect(md).toContain('**Parameter `value`**');
      expect(md).toContain('The value');
    });

    it('should render returns section', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Test</summary><returns>A boolean result.</returns>'));
      expect(md).toContain('**Returns**');
      expect(md).toContain('A boolean result.');
    });

    it('should render remarks section', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Test</summary><remarks>Some extra details.</remarks>'));
      expect(md).toContain('**Remarks**');
      expect(md).toContain('Some extra details.');
    });

    it('should render inline code as backticked text', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Use <c>MyMethod</c> for processing.</summary>'));
      expect(md).toContain('`MyMethod`');
    });

    it('should render see cref as code', () => {
      const md = renderToMarkdownString(makeBlock('<summary>See <see cref="MyClass"/> for details.</summary>'));
      expect(md).toContain('`MyClass`');
    });

    it('should render bold text with markdown bold', () => {
      const md = renderToMarkdownString(makeBlock('<summary>This is <b>important</b>.</summary>'));
      expect(md).toContain('**important**');
    });

    it('should render exception section', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Test</summary><exception cref="T:System.ArgumentNullException">When value is null.</exception>'));
      expect(md).toContain('**Throws `ArgumentNullException`**');
      expect(md).toContain('When value is null.');
    });

    it('should separate sections with horizontal rules', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Test</summary><returns>Something</returns>'));
      expect(md).toContain('---');
    });

    it('should handle inheritdoc', () => {
      const md = renderToMarkdownString(makeBlock('<inheritdoc/>'));
      expect(md).toContain('Documentation inherited');
    });

    it('should handle issue references with repo info', () => {
      const repoInfo: GitRepositoryInfo = {
        provider: GitHostingProvider.GitHub,
        owner: 'owner',
        repository: 'repo',
        baseUrl: 'https://github.com',
      };
      const md = renderToMarkdownString(makeBlock('<summary>Fix #42 issue.</summary>'), repoInfo);
      expect(md).toContain('[#42]');
      expect(md).toContain('https://github.com');
    });
    it('should render paramref as backticked code in markdown', () => {
      const md = renderToMarkdownString(makeBlock('<summary>Use <paramref name="count"/> wisely.</summary>'));
      expect(md).toContain('`count`');
    });

    it('should render typeparamref as backticked code in markdown', () => {
      const md = renderToMarkdownString(makeBlock('<summary>The <typeparamref name="TResult"/> type.</summary>'));
      expect(md).toContain('`TResult`');
    });
  });

  // --- Inline Reference SegmentType Tests ---
  describe('inline reference segment types', () => {
    it('should create ParamRef segment for <paramref/>', () => {
      const result = renderXmlContent('<summary>Use <paramref name="value"/> here.</summary>');
      const allSegments = result.sections.find(s => s.type === CommentSectionType.Summary)!.lines.flatMap(l => l.segments);
      const paramRef = allSegments.find(s => s.type === SegmentType.ParamRef);
      expect(paramRef).toBeDefined();
      expect(paramRef!.text).toBe('value');
    });

    it('should create TypeParamRef segment for <typeparamref/>', () => {
      const result = renderXmlContent('<summary>The type <typeparamref name="T"/> must implement IDisposable.</summary>');
      const allSegments = result.sections.find(s => s.type === CommentSectionType.Summary)!.lines.flatMap(l => l.segments);
      const typeParamRef = allSegments.find(s => s.type === SegmentType.TypeParamRef);
      expect(typeParamRef).toBeDefined();
      expect(typeParamRef!.text).toBe('T');
    });

    it('should create TypeRef segment for <see cref="T:..."/>', () => {
      const result = renderXmlContent('<summary>Returns a <see cref="T:System.String"/>.</summary>');
      const allSegments = result.sections.find(s => s.type === CommentSectionType.Summary)!.lines.flatMap(l => l.segments);
      const typeRef = allSegments.find(s => s.type === SegmentType.TypeRef);
      expect(typeRef).toBeDefined();
      expect(typeRef!.text).toBe('String');
    });

    it('should keep Code segment for non-type <see cref/>', () => {
      const result = renderXmlContent('<summary>See <see cref="M:MyClass.DoWork"/>.</summary>');
      const allSegments = result.sections.find(s => s.type === CommentSectionType.Summary)!.lines.flatMap(l => l.segments);
      const codeRef = allSegments.find(s => s.type === SegmentType.Code && s.text === 'DoWork');
      expect(codeRef).toBeDefined();
      // Should NOT be TypeRef
      expect(allSegments.find(s => s.type === SegmentType.TypeRef)).toBeUndefined();
    });
  });

  // --- See Also table rendering ---
  describe('seealso table rendering', () => {
    function makeBlock(xmlContent: string): XmlDocCommentBlock {
      return { startOffset: 0, endOffset: xmlContent.length, startLine: 0, endLine: 0, indentation: '', xmlContent, isMultiLineStyle: false };
    }

    it('should create one section per <seealso cref> entry', () => {
      const xml = '<summary>Test</summary><seealso cref="T:System.String"/><seealso cref="T:System.Int32"/>';
      const result = renderXmlContent(xml);
      const seeAlsoSections = result.sections.filter(s => s.type === CommentSectionType.SeeAlso);
      expect(seeAlsoSections).toHaveLength(2);
      expect(seeAlsoSections[0].name).toBe('String');
      expect(seeAlsoSections[1].name).toBe('Int32');
    });

    it('should set nameLink as command URI for cref entries', () => {
      const xml = '<summary>Test</summary><seealso cref="T:System.String"/>';
      const result = renderXmlContent(xml);
      const seeAlsoSection = result.sections.find(s => s.type === CommentSectionType.SeeAlso);
      expect(seeAlsoSection).toBeDefined();
      expect(seeAlsoSection!.nameLink).toContain('command:workbench.action.quickOpen');
      expect(seeAlsoSection!.nameLink).toContain('%23String');
    });

    it('should set name to "Visit Url" and nameLink to href for href entries', () => {
      const xml = '<summary>Test</summary><seealso href="https://example.com">Link Text</seealso>';
      const result = renderXmlContent(xml);
      const seeAlsoSection = result.sections.find(s => s.type === CommentSectionType.SeeAlso);
      expect(seeAlsoSection).toBeDefined();
      expect(seeAlsoSection!.name).toBe('Visit Url');
      expect(seeAlsoSection!.nameLink).toBe('https://example.com');
    });

    it('should store inner text as description for href entries', () => {
      const xml = '<summary>Test</summary><seealso href="https://example.com">Link Text</seealso>';
      const result = renderXmlContent(xml);
      const seeAlsoSection = result.sections.find(s => s.type === CommentSectionType.SeeAlso)!;
      const descText = seeAlsoSection.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(descText).toBe('Link Text');
    });

    it('should produce section data with name and command URI (not bullet list) for cref', () => {
      const xml = '<summary>Test</summary><seealso cref="T:System.String"/>';
      const result = renderXmlContent(xml);
      const seeAlsoSection = result.sections.find(s => s.type === CommentSectionType.SeeAlso)!;
      // Name and link are on the section, not embedded as bullet segments
      expect(seeAlsoSection.name).toBe('String');
      expect(seeAlsoSection.nameLink).toContain('workbench.action.quickOpen');
      // No bullet text in lines
      const allText = seeAlsoSection.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(allText).not.toContain('• ');
    });

    it('should produce section data with Visit Url name and href link', () => {
      const xml = '<summary>Test</summary><seealso href="https://example.com">Docs</seealso>';
      const result = renderXmlContent(xml);
      const seeAlsoSection = result.sections.find(s => s.type === CommentSectionType.SeeAlso)!;
      expect(seeAlsoSection.name).toBe('Visit Url');
      expect(seeAlsoSection.nameLink).toBe('https://example.com');
      const descText = seeAlsoSection.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(descText).toContain('Docs');
    });

    it('should reject non-http/https href schemes to prevent command injection', () => {
      const xml = '<summary>Test</summary><seealso href="command:evil.command">Bad</seealso>';
      const result = renderXmlContent(xml);
      const seeAlsoSections = result.sections.filter(s => s.type === CommentSectionType.SeeAlso);
      expect(seeAlsoSections).toHaveLength(0);
    });

    it('should have empty lines array for self-closing cref seealso', () => {
      const xml = '<summary>Test</summary><seealso cref="T:System.String"/>';
      const result = renderXmlContent(xml);
      const seeAlsoSection = result.sections.find(s => s.type === CommentSectionType.SeeAlso)!;
      expect(seeAlsoSection.lines).toHaveLength(0);
    });
  });
});

describe('JSDoc/TSDoc Renderer', () => {
  describe('getStrippedSummaryFromXml with JSDoc content', () => {
    it('should extract free-text description as summary', () => {
      const content = 'Gets the current user.\n@param {string} id - The user id.';
      const result = getStrippedSummaryFromXml(content, undefined, 'javascript');
      expect(result).toBe('Gets the current user.');
    });

    it('should fall back to @brief if no free-text description', () => {
      const content = '@brief Short summary.\n@param {string} id - id';
      const result = getStrippedSummaryFromXml(content, undefined, 'typescript');
      expect(result).toBe('Short summary.');
    });

    it('should return placeholder when no description at all', () => {
      const content = '@param {string} id - The user id.';
      const result = getStrippedSummaryFromXml(content, undefined, 'javascript');
      expect(result).toBe(NO_SUMMARY_PLACEHOLDER);
    });
  });

  describe('renderXmlContent with JSDoc languageId routing', () => {
    it('should render free-text as Summary section', () => {
      const content = 'Fetches data from the server.';
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      expect(summary).toBeDefined();
      const text = summary!.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(text).toContain('Fetches data from the server.');
    });

    it('should render @param with type as TypeRef + Text', () => {
      const content = '@param {string} name - The user name.';
      const result = renderXmlContent(content, undefined, undefined, 'typescript');
      const param = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(param).toBeDefined();
      expect(param!.name).toBe('name');
      const segments = param!.lines.flatMap(l => l.segments);
      const typeRef = segments.find(s => s.type === SegmentType.TypeRef);
      expect(typeRef?.text).toBe('string');
      const descText = segments.find(s => s.type === SegmentType.Text && s.text.includes('user name'));
      expect(descText).toBeDefined();
    });

    it('should render @param without type as plain text', () => {
      const content = '@param name - The user name.';
      const result = renderXmlContent(content, undefined, undefined, 'typescript');
      const param = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(param).toBeDefined();
      expect(param!.name).toBe('name');
      const segments = param!.lines.flatMap(l => l.segments);
      const typeRef = segments.find(s => s.type === SegmentType.TypeRef);
      expect(typeRef).toBeUndefined();
    });

    it('should parse optional param [name]', () => {
      const content = '@param {string} [label] - Optional label.';
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const param = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(param).toBeDefined();
      expect(param!.name).toBe('label');
    });

    it('should parse optional param with default [name=default]', () => {
      const content = '@param {number} [timeout=5000] - Timeout in ms.';
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const param = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(param).toBeDefined();
      expect(param!.name).toBe('timeout');
    });

    it('should render multiple @param entries', () => {
      const content = [
        '@param {string} destination - Target id.',
        '@param {object} props - Configuration.',
        '@param {HTMLElement} el - Clicked element.',
      ].join('\n');
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const params = result.sections.filter(s => s.type === CommentSectionType.Param);
      expect(params).toHaveLength(3);
      expect(params[0].name).toBe('destination');
      expect(params[1].name).toBe('props');
      expect(params[2].name).toBe('el');
    });

    it('should render @returns with type', () => {
      const content = '@returns {boolean} True if valid.';
      const result = renderXmlContent(content, undefined, undefined, 'typescript');
      const returns = result.sections.find(s => s.type === CommentSectionType.Returns);
      expect(returns).toBeDefined();
      const typeRef = returns!.lines.flatMap(l => l.segments).find(s => s.type === SegmentType.TypeRef);
      expect(typeRef?.text).toBe('boolean');
    });

    it('should render @throws with type as exception name', () => {
      const content = '@throws {TypeError} When value is invalid.';
      const result = renderXmlContent(content, undefined, undefined, 'typescript');
      const ex = result.sections.find(s => s.type === CommentSectionType.Exception);
      expect(ex).toBeDefined();
      expect(ex!.name).toBe('TypeError');
    });

    it('should render @example as Code segments', () => {
      const content = '@example\nconst x = doThing();\nconsole.log(x);';
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const example = result.sections.find(s => s.type === CommentSectionType.Example);
      expect(example).toBeDefined();
      const codeSegs = example!.lines.flatMap(l => l.segments).filter(s => s.type === SegmentType.Code);
      expect(codeSegs.length).toBeGreaterThan(0);
    });

    it('should render @deprecated as Other section with warning heading', () => {
      const content = '@deprecated Use newMethod() instead.';
      const result = renderXmlContent(content, undefined, undefined, 'typescript');
      const other = result.sections.find(s => s.type === CommentSectionType.Other);
      expect(other).toBeDefined();
      expect(other!.heading).toBe('⚠️ Deprecated');
    });

    it('should render @remarks as Remarks section', () => {
      const content = '@remarks This is an internal API.';
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const remarks = result.sections.find(s => s.type === CommentSectionType.Remarks);
      expect(remarks).toBeDefined();
    });

    it('should handle full JSDoc block: summary + params + returns', () => {
      const content = [
        'Nexgen Navigation Support.',
        '@param {string} destination - The target id.',
        '@param {object} props - Configuration.',
        '@returns {Promise<void>} Resolves when done.',
      ].join('\n');
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      const params = result.sections.filter(s => s.type === CommentSectionType.Param);
      const returns = result.sections.find(s => s.type === CommentSectionType.Returns);
      expect(summary).toBeDefined();
      expect(params).toHaveLength(2);
      expect(returns).toBeDefined();
    });

    it('should use @arg as alias for @param', () => {
      const content = '@arg {string} name - The name.';
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const param = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(param).toBeDefined();
      expect(param!.name).toBe('name');
    });

    it('should handle nested generic types like Object.<string, Array<T>>', () => {
      const content = '@param {Object.<string, Array<number>>} map - The map.';
      const result = renderXmlContent(content, undefined, undefined, 'typescript');
      const param = result.sections.find(s => s.type === CommentSectionType.Param);
      expect(param).toBeDefined();
      const typeRef = param!.lines.flatMap(l => l.segments).find(s => s.type === SegmentType.TypeRef);
      expect(typeRef?.text).toBe('Object.<string, Array<number>>');
    });

    it('should add placeholder summary when only @param tags present', () => {
      const content = '@param {string} id - The id.';
      const result = renderXmlContent(content, undefined, undefined, 'javascript');
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary);
      expect(summary).toBeDefined();
      const hasPlaceholder = summary!.lines.flatMap(l => l.segments).some(s => s.text === NO_SUMMARY_PLACEHOLDER);
      expect(hasPlaceholder).toBe(true);
    });
  });
});

function makeBlock(overrides: Partial<XmlDocCommentBlock> = {}): XmlDocCommentBlock {
  return {
    startOffset: 0,
    endOffset: 10,
    startLine: 0,
    endLine: 0,
    indentation: '',
    xmlContent: '',
    isMultiLineStyle: true,
    ...overrides,
  };
}

describe('memberName Details fallback', () => {
  describe('renderCommentBlock', () => {
    it('uses name Details when summary is missing and memberName is set', () => {
      const block = makeBlock({
        xmlContent: '@param {string} id - The id.',
        languageId: 'javascript',
        memberName: 'navigate',
      });
      const result = renderCommentBlock(block);
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary)!;
      const text = summary.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(text).toBe('navigate Details');
    });

    it('does NOT override a real summary with member name', () => {
      const block = makeBlock({
        xmlContent: '<summary>Real description.</summary>',
        languageId: 'csharp',
        memberName: 'MyMethod',
      });
      const result = renderCommentBlock(block);
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary)!;
      const text = summary.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(text).toContain('Real description');
      expect(text).not.toContain('MyMethod Details');
    });

    it('falls back to NO_SUMMARY_PLACEHOLDER when memberName is not set', () => {
      const block = makeBlock({
        xmlContent: '@param {string} id - The id.',
        languageId: 'javascript',
      });
      const result = renderCommentBlock(block);
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary)!;
      const text = summary.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(text).toBe(NO_SUMMARY_PLACEHOLDER);
    });

    it('uses name Details for C# XML block without summary', () => {
      const block = makeBlock({
        xmlContent: '<param name="id">The id.</param>',
        languageId: 'csharp',
        memberName: 'GetById',
      });
      const result = renderCommentBlock(block);
      const summary = result.sections.find(s => s.type === CommentSectionType.Summary)!;
      const text = summary.lines.flatMap(l => l.segments).map(s => s.text).join('');
      expect(text).toBe('GetById Details');
    });
  });

  describe('getStrippedSummary', () => {
    it('returns name Details when summary is missing and memberName set', () => {
      const block = makeBlock({
        xmlContent: '@param {string} id - The id.',
        languageId: 'javascript',
        memberName: 'navigate',
      });
      expect(getStrippedSummary(block)).toBe('navigate Details');
    });

    it('returns real summary text when present', () => {
      const block = makeBlock({
        xmlContent: '<summary>Does the work.</summary>',
        languageId: 'csharp',
        memberName: 'DoWork',
      });
      expect(getStrippedSummary(block)).toBe('Does the work.');
    });

    it('returns name Details for empty xmlContent with memberName', () => {
      const block = makeBlock({ xmlContent: '', memberName: 'myVar' });
      expect(getStrippedSummary(block)).toBe('myVar Details');
    });

    it('returns NO_SUMMARY_PLACEHOLDER for empty xmlContent without memberName', () => {
      const block = makeBlock({ xmlContent: '' });
      expect(getStrippedSummary(block)).toBe(NO_SUMMARY_PLACEHOLDER);
    });
  });
});
