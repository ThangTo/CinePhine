import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import HalloweenDecorations from "./HalloweenDecorations";
import { HUNT_SPOTS, HUNT_TOTAL, huntPagesFor, huntSpotFor, huntSpotStyle, markHunt, readHunt } from "./HalloweenTreats";
import cursorEffectService from "services/cursorEffect.service";
import movieService from "services/movie.service";
import { vnDayKey } from "./HalloweenFortune";

const mockState = { pathname: "/", user: null };
const mockUpdateUser = jest.fn();
jest.mock("hooks/useAuth", () => ({
  __esModule: true,
  default: () => ({ user: mockState.user, openAuthModal: jest.fn(), updateUser: mockUpdateUser }),
}));
jest.mock("services/movie.service", () => ({ __esModule: true, default: { getByGenre: jest.fn() } }));
jest.mock("services/cursorEffect.service", () => ({
  __esModule: true,
  default: {
    claimHalloweenHunt: jest.fn(() => Promise.resolve({ effectId: "halloween" })),
    equip: jest.fn(() => Promise.resolve({ cursorEffectId: "halloween" })),
    drawHalloweenFortune: jest.fn(),
  },
}));
jest.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockState.pathname }),
  useNavigate: () => jest.fn(),
}), { virtual: true });

beforeEach(() => localStorage.clear());

beforeAll(() => {
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} });
  HTMLCanvasElement.prototype.getContext = () => null;
});

const renderAt = (pathname, user = null) => {
  Object.assign(mockState, { pathname, user });
  return render(<HalloweenDecorations />);
};

test("home page gets the full Halloween scene", () => {
  const slot = document.body.appendChild(Object.assign(document.createElement("div"), { className: "halloween-nightscape" }));
  const { container } = renderAt("/");
  expect(container.querySelectorAll(".halloween-web")).toHaveLength(2);
  expect(container.querySelector(".halloween-spider")).toBeTruthy();
  expect(container.querySelector(".halloween-fog")).toBeTruthy();
  expect(container.querySelectorAll(".halloween-eyes")).toHaveLength(3);
  expect(container.querySelector(".halloween-ghost")).toBeTruthy();
  expect(container.querySelector(".halloween-pumpkins")).toBeTruthy();
  expect(container.querySelector(".halloween-lightning")).toBeTruthy();
  expect(slot.querySelector(".halloween-manor .halloween-nightscape-ghost")).toBeTruthy();
  expect(slot.querySelectorAll(".halloween-bat")).toHaveLength(3);
  expect(container.querySelectorAll(".halloween-fog i")).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Kẹo hay ghẹo?" })).toBeTruthy();
  slot.remove();
});

test("watch page keeps only the cobwebs", () => {
  const { container } = renderAt("/watch/some-movie");
  expect(container.querySelectorAll(".halloween-web")).toHaveLength(2);
  expect(container.querySelector(
    ".halloween-spider, .halloween-fog, .halloween-eyes, .halloween-ghost, .halloween-pumpkins, .halloween-lightning, .halloween-treat, .halloween-hunt",
  )).toBeNull();
});

// Pages rotate daily, so tests pick from whatever today's pages are.
const pathOf = (key) => (key === "home" ? "/" : `/${key}/abc`);
const seedFound = (keys) => localStorage.setItem("cinephine:halloween-hunt", JSON.stringify(keys));

test("trick-or-treat menu opens from the pumpkin and shows hunt progress", () => {
  const [first, second] = huntPagesFor();
  seedFound([first]);
  renderAt("/nowhere");
  fireEvent.click(screen.getByRole("button", { name: "Kẹo hay ghẹo?" }));
  expect(screen.getByText(`🎃 Bí ngô ẩn: 1/${HUNT_TOTAL}`)).toBeTruthy();
  // Tells the user which pages hide a pumpkin today, ticking the ones already found.
  expect(screen.getByText(`✓ ${HUNT_SPOTS[first]}`).className).toBe("is-found");
  expect(screen.getByText(HUNT_SPOTS[second]).className).toBe("");
});

test("pumpkin hunt: hinted pages always, other pages at random, found once, persisted", () => {
  const day = "2026-10-10";
  const pages = huntPagesFor(day);
  const off = Object.keys(HUNT_SPOTS).find((key) => !pages.includes(key));
  expect(pages).toHaveLength(HUNT_TOTAL);
  expect(huntSpotFor(pathOf(pages[0]), day)).toBe(pages[0]);
  const offHits = Array.from({ length: 30 }, (_, i) => huntSpotFor(`/${off}/page-${i}`, day)).filter(Boolean);
  expect(offHits.length).toBeGreaterThan(0); // some unhinted pages hide one too...
  expect(offHits.length).toBeLessThan(30); // ...but not all of them
  expect(huntSpotFor("/account", day)).toBeNull();
  expect(huntSpotFor("/toString", day)).toBeNull();

  const page = huntPagesFor()[0];
  renderAt(pathOf(page));
  fireEvent.click(screen.getByRole("button", { name: "Bí ngô ẩn" }));
  expect(readHunt()).toEqual([page]);
  expect(screen.queryByRole("button", { name: "Bí ngô ẩn" })).toBeNull();
  expect(screen.getByRole("status").textContent).toContain(`1/${HUNT_TOTAL}`);

  expect(markHunt(page)).toEqual([page]);
  expect(markHunt("bogus")).toEqual([page]);
  localStorage.setItem("cinephine:halloween-hunt", "{broken");
  expect(readHunt()).toEqual([]);
});

test("pumpkin pages and spots stay put within a day and move across days", () => {
  expect(huntSpotStyle("home", "2026-10-10")).toEqual(huntSpotStyle("home", "2026-10-10"));
  const days = Array.from({ length: 30 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
  const month = days.map((day) => huntSpotStyle("movie", day));
  const edgeOf = (style) => (style.bottom ? "bottom" : style.left ? "left" : "right");
  expect(new Set(month.map(edgeOf)).size).toBe(3); // left, right and bottom all show up
  month.filter((style) => style.top).forEach(({ top }) => expect(parseInt(top, 10)).toBeGreaterThanOrEqual(30));
  expect(new Set(days.flatMap((day) => huntPagesFor(day))).size).toBe(Object.keys(HUNT_SPOTS).length); // every page gets a turn
});

test("last pumpkin opens the reward popup: guest is asked to log in, member gets the effect", async () => {
  const last = huntPagesFor()[0];
  const four = Object.keys(HUNT_SPOTS).filter((key) => key !== last).slice(0, HUNT_TOTAL - 1);
  seedFound(four);
  const guest = renderAt(pathOf(last));
  fireEvent.click(screen.getByRole("button", { name: "Bí ngô ẩn" }));
  expect(screen.getByRole("dialog").textContent).toContain("Bạn đã tìm đủ bí ngô ẩn!");
  expect(screen.getByRole("button", { name: "Đăng nhập để nhận quà" })).toBeTruthy();
  guest.unmount();

  localStorage.clear();
  seedFound(four);
  const member = renderAt(pathOf(last), { _id: "u1" });
  fireEvent.click(screen.getByRole("button", { name: "Bí ngô ẩn" }));
  expect(await screen.findByRole("button", { name: "Trang bị ngay" })).toBeTruthy();
  expect(cursorEffectService.claimHalloweenHunt).toHaveBeenCalledWith([...four, last]);
  expect(localStorage.getItem("cinephine:halloween-hunt:claimed:u1")).toBe("1");
  member.unmount();

  // A finished hunter sees no more pumpkins, even on today's pages they never visited.
  seedFound(Object.keys(HUNT_SPOTS).filter((key) => !huntPagesFor().includes(key)).slice(0, HUNT_TOTAL));
  renderAt(pathOf(last));
  expect(screen.queryByRole("button", { name: "Bí ngô ẩn" })).toBeNull();
});

const openFortune = () => {
  fireEvent.click(screen.getByRole("button", { name: "Kẹo hay ghẹo?" }));
  fireEvent.click(screen.getByRole("button", { name: "🍬 Kẹo" }));
  fireEvent.click(screen.getByRole("button", { name: "Kẹo số 1" }));
};

test("fortune candy: guest draws a free coinless fortune, member gets coins once per day", async () => {
  movieService.getByGenre.mockResolvedValue({ data: [{ id: "m1", title: "Ngôi Nhà Ma" }] });
  const guest = renderAt("/");
  openFortune();
  expect(await screen.findByText("Quẻ hôm nay của bạn", {}, { timeout: 2000 })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Đăng nhập để bốc kẹo/ })).toBeTruthy();
  expect(await screen.findByText("Ngôi Nhà Ma")).toBeTruthy();
  expect(JSON.parse(localStorage.getItem("cinephine:halloween-fortune:guest")).dateKey).toBe(vnDayKey());
  guest.unmount();

  const member = { _id: "u1", coin: 100 };
  cursorEffectService.drawHalloweenFortune.mockResolvedValueOnce({
    dateKey: vnDayKey(), tier: "cat", coins: 30, pick: 2, coinBalance: 130, alreadyDrawn: false,
  });
  const first = renderAt("/", member);
  openFortune();
  expect(await screen.findByText("+30 xu", {}, { timeout: 2000 })).toBeTruthy();
  expect(mockUpdateUser).toHaveBeenCalledWith({ ...member, coin: 130 });
  first.unmount();

  // Same day: the saved fortune shows straight away, no candy to pick.
  renderAt("/", member);
  fireEvent.click(screen.getByRole("button", { name: "Kẹo hay ghẹo?" }));
  fireEvent.click(screen.getByRole("button", { name: "🍬 Kẹo" }));
  expect(screen.getByText("Quẻ hôm nay của bạn")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Kẹo số 1" })).toBeNull();
  expect(cursorEffectService.drawHalloweenFortune).toHaveBeenCalledTimes(1);
});

test("an equipped cursor effect replaces the ghost follower", () => {
  const { container } = renderAt("/", { cursorEffectId: "sparkle" });
  expect(container.querySelector(".halloween-ghost")).toBeNull();
  expect(container.querySelector(".halloween-spider")).toBeTruthy();
});
