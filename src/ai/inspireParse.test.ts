import { describe, expect, it } from "vitest";
import { parseInspireJson } from "./inspire";

describe("parseInspireJson", () => {
  it("parses tree and assigns ids", () => {
    const project = parseInspireJson(
      JSON.stringify({
        name: "Demo",
        tree: [
          {
            title: "Root",
            content: "Hello",
            children: [{ title: "Child", content: "", children: [] }],
          },
        ],
      }),
    );
    expect(project.name).toBe("Demo");
    expect(project.tree).toHaveLength(1);
    expect(project.tree[0].id).toBeTruthy();
    expect(project.tree[0].children[0].title).toBe("Child");
    expect(project.tree[0].attachments).toEqual([]);
  });

  it("strips markdown fences", () => {
    const project = parseInspireJson(
      "```json\n{\"name\":\"X\",\"tree\":[{\"title\":\"A\",\"content\":\"\",\"children\":[]}]}\n```",
    );
    expect(project.name).toBe("X");
    expect(project.tree[0].title).toBe("A");
  });
});
