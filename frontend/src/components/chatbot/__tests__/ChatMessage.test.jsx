import React from "react";
import { TextDecoder, TextEncoder } from "util";
import { fireEvent, render } from "@testing-library/react";
import { FormattedText, parseMessageBlocks } from "components/chatbot/ChatMessage";
import { readEventStream } from "hooks/useChatStream";
import useDragScroll from "hooks/useDragScroll";

jest.mock("components/common/LazySection", () => ({ useSectionVisible: () => true }));
jest.mock("react-router-dom", () => ({ Link: ({ to, ...props }) => <a href={to} {...props} /> }), { virtual: true });

test("parses paragraphs, headings, bold and both list kinds", () => {
  expect(parseMessageBlocks("## Top\nIntro\n- a\n* b\n1. one\n2) two\n\nEnd")).toEqual([
    { type: "paragraph", text: "**Top**" },
    { type: "paragraph", text: "Intro" },
    { type: "list", ordered: false, items: ["a", "b"] },
    { type: "list", ordered: true, items: ["one", "two"] },
    { type: "paragraph", text: "End" },
  ]);
});

test("model HTML renders as text, never as markup", () => {
  const { container } = render(<FormattedText text={'**Hay** <img src=x onerror="alert(1)">\n- <script>x</script>'} />);
  expect(container.querySelector("img, script")).toBeNull();
  expect(container.querySelector("strong").textContent).toBe("Hay");
  expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  expect(container.querySelectorAll("ul li")).toHaveLength(1);
});

test("readEventStream joins frames split across chunks", async () => {
  global.TextDecoder = TextDecoder;
  const encoder = new TextEncoder();
  const chunks = ['data: {"type":"tok', 'en","content":"Xin"}\n\ndata: {"type":"done","answer":"Xin chao"}'].map((c) =>
    encoder.encode(c)
  );
  const body = { getReader: () => ({ read: async () => (chunks.length ? { value: chunks.shift(), done: false } : { done: true }) }) };
  const events = [];
  await readEventStream(body, (event) => events.push(event));
  expect(events).toEqual([
    { type: "token", content: "Xin" },
    { type: "done", answer: "Xin chao" },
  ]);
});

test("useDragScroll scrolls on drag and swallows the click that ends the drag", () => {
  const onClick = jest.fn();
  const Row = () => (
    <div data-testid="row" {...useDragScroll()}>
      <button onClick={onClick}>chip</button>
    </div>
  );
  const { getByTestId, getByText } = render(<Row />);
  const row = getByTestId("row");
  row.scrollLeft = 100;

  fireEvent.mouseDown(getByText("chip"), { button: 0, clientX: 50 });
  fireEvent.mouseMove(document, { clientX: 20 });
  fireEvent.mouseUp(document);
  fireEvent.click(getByText("chip"));
  expect(row.scrollLeft).toBe(130);
  expect(onClick).not.toHaveBeenCalled();

  fireEvent.mouseDown(getByText("chip"), { button: 0, clientX: 50 });
  fireEvent.mouseUp(document);
  fireEvent.click(getByText("chip"));
  expect(onClick).toHaveBeenCalledTimes(1);
});
