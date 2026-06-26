import { expect, test, describe } from "bun:test";
import plugin from "../src/plugin.ts";

function createHooks() {
  return plugin({ client: {}, directory: "C:\\mock" } as any);
}

describe("opencode-image-paste-plugin", () => {
  test("replaces relative markdown refs with absolute paths from file:// URLs", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = {
      message: { role: "user" },
      parts: [
        {
          type: "text",
          text: "Please read this image: ![my_image.png](my_image.png) and this link: [my_image.png](my_image.png)"
        },
        {
          type: "file",
          mime: "image/png",
          filename: "my_image.png",
          url: "file:///C:/Users/Nguyen%20Chien%20Cong/Pictures/my_image.png"
        }
      ]
    };

    await hook({ sessionID: "s1" } as any, output);

    expect(output.parts[0].text).toBe(
      "Please read this image: ![my_image.png](C:/Users/Nguyen Chien Cong/Pictures/my_image.png) and this link: [my_image.png](C:/Users/Nguyen Chien Cong/Pictures/my_image.png)\n" +
      "[IMPORTANT: The image file \"my_image.png\" is located at absolute path: C:/Users/Nguyen Chien Cong/Pictures/my_image.png]"
    );
  });

  test("resolves from source.path when url is not absolute", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = {
      message: { role: "user" },
      parts: [
        { type: "text", text: "Analyzing ![photo.jpg](photo.jpg)" },
        {
          type: "file",
          mime: "image/jpeg",
          filename: "photo.jpg",
          url: "photo.jpg", // stripped, not absolute
          source: {
            type: "file",
            path: "C:\\Users\\Nguyen Chien Cong\\Pictures\\photo.jpg"
          }
        }
      ]
    };

    await hook({ sessionID: "s2" } as any, output);

    expect(output.parts[0].text).toBe(
      "Analyzing ![photo.jpg](C:/Users/Nguyen Chien Cong/Pictures/photo.jpg)\n" +
      "[IMPORTANT: The image file \"photo.jpg\" is located at absolute path: C:/Users/Nguyen Chien Cong/Pictures/photo.jpg]"
    );
  });

  test("does not modify text when no absolute path can be resolved", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = {
      message: { role: "user" },
      parts: [
        { type: "text", text: "No change: ![image.png](image.png)" },
        { type: "file", mime: "image/png", filename: "image.png", url: "data:image/png;base64,123" }
      ]
    };

    await hook({ sessionID: "s3" } as any, output);

    expect(output.parts[0].text).toBe("No change: ![image.png](image.png)");
  });

  test("does not modify text when there are no file parts", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = {
      message: { role: "user" },
      parts: [{ type: "text", text: "Hello world" }]
    };

    await hook({ sessionID: "s4" } as any, output);

    expect(output.parts[0].text).toBe("Hello world");
  });

  test("handles messages with no parts gracefully", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = { message: { role: "user" }, parts: [] };
    await hook({ sessionID: "s5" } as any, output);
    // no crash = pass
  });

  test("handles multiple different images in one message", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = {
      message: { role: "user" },
      parts: [
        { type: "text", text: "![a.png](a.png) and ![b.jpg](b.jpg)" },
        { type: "file", mime: "image/png", filename: "a.png", url: "file:///D:/imgs/a.png" },
        { type: "file", mime: "image/jpeg", filename: "b.jpg", url: "file:///D:/imgs/b.jpg" }
      ]
    };

    await hook({ sessionID: "s6" } as any, output);

    expect(output.parts[0].text).toBe(
      "![a.png](D:/imgs/a.png) and ![b.jpg](D:/imgs/b.jpg)\n" +
      "[IMPORTANT: The image file \"a.png\" is located at absolute path: D:/imgs/a.png]\n" +
      "[IMPORTANT: The image file \"b.jpg\" is located at absolute path: D:/imgs/b.jpg]"
    );
  });

  test("leaves already-absolute paths untouched", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = {
      message: { role: "user" },
      parts: [
        { type: "text", text: "![img](C:/already/absolute/img.png)" },
        { type: "file", mime: "image/png", filename: "img.png", url: "file:///C:/already/absolute/img.png" }
      ]
    };

    await hook({ sessionID: "s7" } as any, output);

    expect(output.parts[0].text).toBe(
      "![img](C:/already/absolute/img.png)\n" +
      "[IMPORTANT: The image file \"img.png\" is located at absolute path: C:/already/absolute/img.png]"
    );
  });

  test("prefers source.path over file:// url", async () => {
    const hooks = await createHooks();
    const hook = hooks["chat.message"]!;

    const output: any = {
      message: { role: "user" },
      parts: [
        { type: "text", text: "![x.png](x.png)" },
        {
          type: "file",
          mime: "image/png",
          filename: "x.png",
          url: "file:///E:/wrong/x.png",
          source: { type: "file", path: "F:\\correct\\x.png" }
        }
      ]
    };

    await hook({ sessionID: "s8" } as any, output);

    expect(output.parts[0].text).toBe(
      "![x.png](F:/correct/x.png)\n" +
      "[IMPORTANT: The image file \"x.png\" is located at absolute path: F:/correct/x.png]"
    );
  });
});
