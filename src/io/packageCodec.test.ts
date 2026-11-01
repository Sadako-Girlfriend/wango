import { describe, expect, it } from "vitest";
import type { ProjectData } from "@/domain";
import { encodeJsonWango } from "./jsonCodec";
import {
  decodeWangoBytes,
  encodePackageWango,
  looksLikeZip,
} from "./packageCodec";

const sampleProject: ProjectData = {
  name: "测试项目",
  tree: [
    {
      id: "root",
      title: "根节点",
      content: "正文",
      children: [],
      attachments: [],
    },
  ],
};

describe("encodePackageWango", () => {
  it("无附件时也产出 ZIP 字节", async () => {
    const bytes = await encodePackageWango(sampleProject, []);
    expect(looksLikeZip(bytes)).toBe(true);

    const decoded = await decodeWangoBytes(bytes);
    expect(decoded.projectData.name).toBe("测试项目");
    expect(decoded.projectData.tree[0]?.title).toBe("根节点");
    expect(decoded.files).toEqual([]);
  });

  it("有附件时写入 attachments/ 并可还原", async () => {
    const project: ProjectData = {
      ...sampleProject,
      tree: [
        {
          ...sampleProject.tree[0]!,
          attachments: [
            {
              id: "a1",
              name: "图.png",
              mime: "image/png",
              relPath: "attachments/a1/图.png",
            },
          ],
        },
      ],
    };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const bytes = await encodePackageWango(project, [
      { relPath: "attachments/a1/图.png", data: png },
    ]);
    expect(looksLikeZip(bytes)).toBe(true);

    const decoded = await decodeWangoBytes(bytes);
    expect(decoded.files).toHaveLength(1);
    expect(decoded.files[0]?.relPath).toBe("attachments/a1/图.png");
    const got = decoded.files[0]!.data;
    const gotBytes = got instanceof Uint8Array ? got : new Uint8Array(got);
    expect(Array.from(gotBytes)).toEqual(Array.from(png));
  });
});

describe("decodeWangoBytes", () => {
  it("兼容老版本纯 JSON", async () => {
    const json = encodeJsonWango(sampleProject);
    const bytes = new TextEncoder().encode(json);
    expect(looksLikeZip(bytes)).toBe(false);

    const decoded = await decodeWangoBytes(bytes);
    expect(decoded.projectData.name).toBe("测试项目");
    expect(decoded.files).toEqual([]);
  });
});
