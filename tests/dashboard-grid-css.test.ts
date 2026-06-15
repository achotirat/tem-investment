import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("dashboard grid CSS", () => {
  const stylesheet = readFileSync("app/globals.css", "utf8");

  it("defines every dashboard span used by panels", () => {
    expect(stylesheet).toMatch(/\.span-5\s*\{\s*grid-column:\s*span 5;/);
    expect(stylesheet).toMatch(/\.span-7\s*\{\s*grid-column:\s*span 7;/);
  });

  it("collapses five and seven column panels on narrow screens", () => {
    const responsiveBlock = stylesheet.slice(stylesheet.indexOf("@media (max-width: 920px)"));

    expect(responsiveBlock).toContain(".span-5");
    expect(responsiveBlock).toContain(".span-7");
  });
});
