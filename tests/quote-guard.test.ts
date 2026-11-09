import { describe, expect, it } from "vitest";
import { isGrounded, keepGrounded } from "@/lib/quoteGuard";

const src = "내가 어제 친구랑 같이 서울에 왔어요. 초행길이라 길을 잃었나 봐요.";
describe("quote guard", () => {
  it("keeps verbatim quotes (whitespace-insensitive)", () => {
    expect(isGrounded("어제 친구랑 같이  서울에 왔어요", src)).toBe(true);
  });
  it("drops invented quotes", () => {
    expect(isGrounded("1962년에 서울에 왔어요", src)).toBe(false);
    expect(isGrounded("", src)).toBe(false);
  });
  it("filters a list", () => {
    const kept = keepGrounded([{ quote: "초행길", why: "a" }, { quote: "부산", why: "b" }], src);
    expect(kept.map((k) => k.quote)).toEqual(["초행길"]);
  });
});
