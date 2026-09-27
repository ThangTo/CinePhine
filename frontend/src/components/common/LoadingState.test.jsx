import React from "react";
import { render, screen } from "@testing-library/react";
import ThemeContext, { themes } from "contexts/ThemeContext";
import LoadingState, { BarSpinner } from "./LoadingState";

jest.mock("services/utils/apiRequest", () => ({ __esModule: true, default: jest.fn() }));

test("Christmas page loading uses a snowman and accessible status", () => {
  const { container } = render(<ThemeContext.Provider value={{ theme: themes.christmas }}><LoadingState /></ThemeContext.Provider>);
  expect(container.querySelector(".snowman-loader")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Đang tải");
});

test("turning the theme off restores the default loader", () => {
  const { container, rerender } = render(<ThemeContext.Provider value={{ theme: themes.christmas }}><LoadingState /></ThemeContext.Provider>);
  rerender(<ThemeContext.Provider value={{ theme: themes.default }}><LoadingState /></ThemeContext.Provider>);
  expect(container.querySelector(".snowman-loader")).toBeNull();
  expect(container.querySelector(".loading-bars")).toBeTruthy();
});

test("button loading stays compact even in Christmas theme", () => {
  const { container } = render(<ThemeContext.Provider value={{ theme: themes.christmas }}><BarSpinner className="w-4 h-4" /></ThemeContext.Provider>);
  expect(container.querySelector(".snowman-loader")).toBeNull();
  expect(screen.getByRole("status")).toBeTruthy();
});

test("loading also works outside a theme provider", () => {
  render(<LoadingState />);
  expect(screen.getByRole("status")).toBeTruthy();
});
