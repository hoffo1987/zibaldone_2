import { memoText } from "./cache";
import { clean, plain } from "./sanitize";

test("cached HTML keeps the exact sanitized output and remains safe after edits", () => {
  const a = '<p style="color:red" onclick="evil()">Ciao &amp; mondo</p><script>evil()</script><img src="javascript:evil()">';
  expect(clean(a)).toBe('<p style="color:red">Ciao &amp; mondo</p>');
  expect(clean(a)).toBe(clean(a));
  expect(plain('<p>Ciao</p><div>mondo<br>ancora</div>')).toBe('Ciao mondo ancora ');
  expect(clean('<p>Modificato</p>')).toBe('<p>Modificato</p>');
  expect(clean(a)).not.toContain('script');
});

test("text cache respects the character budget and refreshes recently used entries", () => {
  const work = jest.fn(s => s.toUpperCase());
  const cached = memoText(work, 12, 2);
  cached('aa'); cached('bb'); cached('aa'); cached('cc'); cached('aa');
  expect(work).toHaveBeenCalledTimes(3);
  cached('bb'); expect(work).toHaveBeenCalledTimes(4);
  cached('oversized'); cached('oversized'); expect(work).toHaveBeenCalledTimes(6);
  cached(''); cached(''); expect(work).toHaveBeenCalledTimes(7);
});
