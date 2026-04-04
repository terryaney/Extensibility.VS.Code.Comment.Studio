/**
 * Simple XML parser for doc comments. Uses regex-based parsing since 
 * doc comments are typically well-formed but we need graceful fallback.
 */

export interface XmlElement {
  tagName: string;
  attributes: Map<string, string>;
  children: XmlNode[];
}

export interface XmlTextNode {
  text: string;
}

export type XmlNode = XmlElement | XmlTextNode;

export function isElement(node: XmlNode): node is XmlElement {
  return 'tagName' in node;
}

export function isText(node: XmlNode): node is XmlTextNode {
  return 'text' in node && !('tagName' in node);
}

/**
 * Parses XML content into a list of top-level nodes.
 * Wraps in a <root> element for parsing, returns children of root.
 * On parse failure, returns undefined.
 */
export function parseXmlContent(xmlContent: string): XmlNode[] | undefined {
  if (!xmlContent || !xmlContent.trim()) {
    return undefined;
  }

  try {
    const wrapped = `<root>${xmlContent}</root>`;
    const root = parseElement(wrapped, 0);
    if (root && isElement(root.node)) {
      return root.node.children;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

interface ParseResult {
  node: XmlNode;
  endIndex: number;
}

function parseElement(xml: string, start: number): ParseResult | undefined {
  // Skip whitespace
  let i = start;
  while (i < xml.length && (xml[i] === ' ' || xml[i] === '\t' || xml[i] === '\n' || xml[i] === '\r')) {
    i++;
  }

  if (i >= xml.length || xml[i] !== '<') {
    return undefined;
  }

  // Check for closing tag
  if (xml[i + 1] === '/') {
    return undefined;
  }

  // Parse tag name
  let j = i + 1;
  while (j < xml.length && xml[j] !== ' ' && xml[j] !== '/' && xml[j] !== '>' && xml[j] !== '\t' && xml[j] !== '\n' && xml[j] !== '\r') {
    j++;
  }
  const tagName = xml.substring(i + 1, j);

  // Parse attributes
  const attributes = new Map<string, string>();
  let k = j;
  while (k < xml.length && xml[k] !== '>' && xml[k] !== '/') {
    // Skip whitespace
    while (k < xml.length && (xml[k] === ' ' || xml[k] === '\t' || xml[k] === '\n' || xml[k] === '\r')) {
      k++;
    }
    if (k >= xml.length || xml[k] === '>' || xml[k] === '/') break;

    // Parse attribute name
    let attrStart = k;
    while (k < xml.length && xml[k] !== '=' && xml[k] !== ' ' && xml[k] !== '>' && xml[k] !== '/') {
      k++;
    }
    const attrName = xml.substring(attrStart, k);

    if (xml[k] === '=') {
      k++; // skip =
      const quote = xml[k];
      if (quote === '"' || quote === "'") {
        k++; // skip opening quote
        let valStart = k;
        while (k < xml.length && xml[k] !== quote) {
          k++;
        }
        attributes.set(attrName, xml.substring(valStart, k));
        k++; // skip closing quote
      }
    }
  }

  // Self-closing tag
  if (k < xml.length && xml[k] === '/') {
    k++; // skip /
    if (k < xml.length && xml[k] === '>') {
      k++; // skip >
    }
    return {
      node: { tagName, attributes, children: [] },
      endIndex: k,
    };
  }

  // Skip >
  if (k < xml.length && xml[k] === '>') {
    k++;
  }

  // Parse children
  const children: XmlNode[] = [];
  while (k < xml.length) {
    // Check for closing tag
    if (xml[k] === '<' && k + 1 < xml.length && xml[k + 1] === '/') {
      // Skip to end of closing tag
      while (k < xml.length && xml[k] !== '>') {
        k++;
      }
      k++; // skip >
      break;
    }

    // Try to parse child element
    if (xml[k] === '<') {
      const childResult = parseElement(xml, k);
      if (childResult) {
        children.push(childResult.node);
        k = childResult.endIndex;
        continue;
      }
    }

    // Parse text content
    let textStart = k;
    while (k < xml.length && xml[k] !== '<') {
      k++;
    }
    const text = xml.substring(textStart, k);
    if (text) {
      children.push({ text });
    }
  }

  return {
    node: { tagName, attributes, children },
    endIndex: k,
  };
}

/**
 * Extracts the text content of an attribute from an element.
 */
export function getAttr(element: XmlElement, name: string): string {
  return element.attributes.get(name) ?? '';
}

/**
 * Recursively extracts all text content from a node tree.
 */
export function extractText(nodes: XmlNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (isText(node)) {
      parts.push(node.text);
    } else if (isElement(node)) {
      parts.push(extractText(node.children));
    }
  }
  return parts.join('');
}
