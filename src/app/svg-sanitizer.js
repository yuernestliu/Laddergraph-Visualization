import DOMPurify from "dompurify";

const GRAPHVIZ_SVG_TAGS = [
  "svg",
  "g",
  "title",
  "desc",
  "path",
  "polygon",
  "polyline",
  "ellipse",
  "circle",
  "rect",
  "line",
  "text",
  "tspan",
];

const GRAPHVIZ_SVG_ATTRIBUTES = [
  "aria-label",
  "class",
  "cx",
  "cy",
  "d",
  "dominant-baseline",
  "fill",
  "fill-opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "id",
  "opacity",
  "overflow",
  "points",
  "preserveAspectRatio",
  "role",
  "rx",
  "ry",
  "stroke",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-opacity",
  "stroke-width",
  "text-anchor",
  "transform",
  "version",
  "viewBox",
  "width",
  "x",
  "x1",
  "x2",
  "y",
  "y1",
  "y2",
  "xmlns",
  "xml:space",
];

const URL_VALUE_PATTERN = /url\s*\(\s*([^)]*)\)/gi;
const SAFE_LOCAL_FRAGMENT_PATTERN = /^['"]?#[A-Za-z_][\w:.-]*['"]?$/;

function removeExternalPaintReferences(root) {
  for (const element of root.querySelectorAll("*")) {
    for (const attributeName of ["fill", "stroke"]) {
      const value = element.getAttribute(attributeName);
      if (!value || !/url\s*\(/i.test(value)) continue;

      const references = Array.from(value.matchAll(URL_VALUE_PATTERN), (match) => match[1].trim());
      if (!references.length || references.some((reference) => !SAFE_LOCAL_FRAGMENT_PATTERN.test(reference))) {
        element.removeAttribute(attributeName);
      }
    }
  }
}

export function sanitizeGraphvizSvgMarkup(svgMarkup) {
  if (typeof svgMarkup !== "string" || !svgMarkup.trim()) {
    throw new Error("Graphviz 没有返回有效 SVG。");
  }

  // DOT is user-controlled, so the SVG is allow-listed before it enters the live DOM.
  const sanitized = DOMPurify.sanitize(svgMarkup, {
    ALLOWED_TAGS: GRAPHVIZ_SVG_TAGS,
    ALLOWED_ATTR: GRAPHVIZ_SVG_ATTRIBUTES,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
  });

  const template = document.createElement("template");
  template.innerHTML = sanitized.trim();
  const elementChildren = Array.from(template.content.children);
  if (elementChildren.length !== 1 || elementChildren[0].localName !== "svg") {
    throw new Error("Graphviz 没有返回唯一且有效的 SVG 根元素。");
  }

  const svg = elementChildren[0];
  removeExternalPaintReferences(svg);
  return svg.outerHTML;
}
