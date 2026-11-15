import type { SanitizeConfig } from './types';

const ALLOWED_TAGS = new Set([
  'a', 'blockquote', 'br', 'code', 'details', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'iframe', 'img', 'li', 'mark', 'ol', 'p', 'pre', 'span', 'strong', 'sub', 'summary',
  'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul'
]);

const ALLOWED_ATTRIBUTES = new Set([
  'alt', 'aria-hidden', 'class', 'colspan', 'data-section-id', 'data-verse', 'href', 'rel',
  'rowspan', 'src', 'style', 'target', 'title', 'data-media-json'
]);

const ALLOWED_STYLE_PROPERTIES = new Set(['background-color', 'color', 'text-align']);

export function sanitizeRichTextHtml(html: string): string {
  if (typeof html !== 'string' || !html.trim()) {
    return '';
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
  const wrapper = document.createElement('div');
  const config: SanitizeConfig = {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyleProperties: ALLOWED_STYLE_PROPERTIES
  };

  Array.from(doc.body.childNodes).forEach((child) => {
    const sanitizedNode = sanitizeRichTextNode(child, config);
    if (sanitizedNode) {
      wrapper.appendChild(sanitizedNode);
    }
  });

  return wrapper.innerHTML;
}

function sanitizeRichTextNode(node: Node, config: SanitizeConfig): Node | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE || !(node instanceof Element)) {
    return null;
  }

  const tagName = node.tagName.toLowerCase();
  const fragment = document.createDocumentFragment();

  if (!config.allowedTags.has(tagName)) {
    Array.from(node.childNodes).forEach((child) => {
      const sanitizedChild = sanitizeRichTextNode(child, config);
      if (sanitizedChild) {
        fragment.appendChild(sanitizedChild);
      }
    });
    return fragment;
  }

  const cleanElement = document.createElement(tagName);

  Array.from(node.attributes).forEach((attribute) => {
    const attrName = attribute.name.toLowerCase();
    if (attrName.startsWith('on') || !config.allowedAttributes.has(attrName)) {
      return;
    }

    if (attrName === 'href' || attrName === 'src') {
      const safeUrl = sanitizeTeacherUrl(attribute.value);
      if (!safeUrl) {
        return;
      }
      cleanElement.setAttribute(attrName, safeUrl);
      if (tagName === 'a') {
        cleanElement.setAttribute('rel', 'noopener noreferrer');
      }
      return;
    }

    if (attrName === 'style') {
      const safeStyle = sanitizeInlineStyle(attribute.value, config.allowedStyleProperties);
      if (safeStyle) {
        cleanElement.setAttribute('style', safeStyle);
      }
      return;
    }

    if (attrName === 'class') {
      const safeClasses = attribute.value
        .split(/\s+/)
        .filter((token) => /^[a-zA-Z0-9_-]+$/.test(token));
      if (safeClasses.length > 0) {
        cleanElement.setAttribute('class', safeClasses.join(' '));
      }
      return;
    }

    cleanElement.setAttribute(attrName, attribute.value);
  });

  Array.from(node.childNodes).forEach((child) => {
    const sanitizedChild = sanitizeRichTextNode(child, config);
    if (sanitizedChild) {
      cleanElement.appendChild(sanitizedChild);
    }
  });

  return cleanElement;
}

export function sanitizeTeacherUrl(url: string): string {
  if (typeof url !== 'string') {
    return '';
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('bst-media:')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Ignore parse failures and fall back to local-path validation.
  }

  return trimmed.startsWith('/') ||
    trimmed.startsWith('assets/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
    ? trimmed
    : '';
}

export function sanitizeInlineStyle(styleValue: string, allowedProperties: Set<string>): string {
  if (typeof styleValue !== 'string') {
    return '';
  }

  return styleValue
    .split(';')
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [property, ...valueParts] = rule.split(':');
      const normalizedProperty = property?.trim().toLowerCase();
      const normalizedValue = valueParts.join(':').trim();

      if (!normalizedProperty || !allowedProperties.has(normalizedProperty)) {
        return '';
      }

      if (!/^[#(),.%\-\w\s]+$/.test(normalizedValue)) {
        return '';
      }

      return `${normalizedProperty}: ${normalizedValue}`;
    })
    .filter(Boolean)
    .join('; ');
}
