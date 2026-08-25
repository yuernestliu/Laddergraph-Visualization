// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { sanitizeGraphvizSvgMarkup } from "../src/app/svg-sanitizer.js";

function parseSanitizedSvg(markup) {
  const template = document.createElement("template");
  template.innerHTML = sanitizeGraphvizSvgMarkup(markup);
  return template.content.querySelector("svg");
}

describe("Graphviz SVG sanitation", () => {
  it("preserves the Graphviz structure used by node and edge interactions", () => {
    const svg = parseSanitizedSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50">
        <g id="graph0" class="graph" transform="scale(1 1)">
          <polygon fill="white" stroke="transparent" points="0,0 100,0 100,50 0,50" />
          <g id="node1" class="node">
            <title>a</title>
            <ellipse fill="#fff" stroke="#333" cx="20" cy="20" rx="10" ry="8" />
            <text x="20" y="23" text-anchor="middle" font-family="sans-serif" font-size="10">A</text>
          </g>
          <g id="edge1" class="edge"><title>a-&gt;b</title><path d="M30,20 L70,20" /></g>
        </g>
      </svg>
    `);

    expect(svg.getAttribute("viewBox")).toBe("0 0 100 50");
    expect(svg.querySelector("g.node > title").textContent).toBe("a");
    expect(svg.querySelector("g.edge > title").textContent).toBe("a->b");
    expect(svg.querySelector("ellipse").getAttribute("fill")).toBe("#fff");
  });

  it("removes scripts, event handlers, links, embedded resources, and inline CSS", () => {
    const svg = parseSanitizedSvg(`
      <svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">
        <script>alert(1)</script>
        <foreignObject><div onclick="alert(2)">bad</div></foreignObject>
        <a href="javascript:alert(3)" target="_blank">
          <g class="node"><title>safe-node</title><ellipse style="fill:url(https://evil.example/a)" /></g>
        </a>
        <image href="https://evil.example/tracker.png" />
        <path id="paint" fill="url(https://evil.example/paint)" stroke="url(#safeGradient)" d="M0,0 L1,1" />
      </svg>
    `);

    expect(svg.querySelector("g.node > title").textContent).toBe("safe-node");
    expect(svg.querySelector("script, foreignObject, a, image")).toBeNull();
    expect(svg.outerHTML).not.toMatch(/onload|onclick|javascript:|evil\.example|style=/i);
    expect(svg.querySelector("#paint").hasAttribute("fill")).toBe(false);
    expect(svg.querySelector("#paint").getAttribute("stroke")).toBe("url(#safeGradient)");
  });

  it("rejects output without exactly one SVG root", () => {
    expect(() => sanitizeGraphvizSvgMarkup("<div>not svg</div>")).toThrow(/SVG/);
    expect(() => sanitizeGraphvizSvgMarkup("<svg></svg><svg></svg>")).toThrow(/唯一/);
  });
});
