import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "./ThemeContext";
import AdminSettingsTab from "components/admin/AdminSettingsTab";
import ThemeSelector from "components/common/ThemeSelector";
import apiRequest from "services/utils/apiRequest";
import { settingsAPI } from "services/admin.service";

jest.mock("services/utils/apiRequest", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("services/admin.service", () => ({
  settingsAPI: {
    getTheme: jest.fn(),
    getColabUrl: jest.fn(),
    getFeaturePermissions: jest.fn(),
    setTheme: jest.fn(),
  },
}));

function ThemeState() {
  const { currentTheme, serverTheme } = useTheme();
  return <output data-testid="theme-state">{serverTheme}/{currentTheme}</output>;
}

const renderSettings = () => render(
  <ThemeProvider>
    <ThemeState />
    <ThemeSelector />
    <AdminSettingsTab />
  </ThemeProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  apiRequest.mockResolvedValue({ theme: "default" });
  settingsAPI.getTheme.mockResolvedValue("default");
  settingsAPI.getColabUrl.mockResolvedValue("");
  settingsAPI.getFeaturePermissions.mockResolvedValue({});
  settingsAPI.setTheme.mockResolvedValue({ theme: "christmas" });
});

test("saving Christmas immediately updates the public theme and reveals the toggle", async () => {
  renderSettings();
  fireEvent.click(await screen.findByRole("button", { name: /Giáng Sinh/ }));
  await waitFor(() => expect(screen.getByTestId("theme-state").textContent).toBe("christmas/christmas"));
  expect(settingsAPI.setTheme).toHaveBeenCalledWith("christmas");
  expect(screen.getByTitle("Tắt theme")).toBeTruthy();
});

test("saving a theme preserves a visitor's disabled preference", async () => {
  localStorage.setItem("themeEnabled", "false");
  renderSettings();
  fireEvent.click(await screen.findByRole("button", { name: /Giáng Sinh/ }));
  await waitFor(() => expect(screen.getByTestId("theme-state").textContent).toBe("christmas/default"));
  expect(localStorage.getItem("themeEnabled")).toBe("false");
  fireEvent.click(screen.getByTitle("Bật theme"));
  expect(screen.getByTestId("theme-state").textContent).toBe("christmas/christmas");
});

test("an older pending public response cannot undo a successful admin save", async () => {
  let resolveTheme;
  apiRequest.mockImplementationOnce(() => new Promise((resolve) => { resolveTheme = resolve; }));
  renderSettings();
  fireEvent.click(await screen.findByRole("button", { name: /Giáng Sinh/ }));
  await waitFor(() => expect(screen.getByTestId("theme-state").textContent).toBe("christmas/christmas"));
  await act(async () => { resolveTheme({ theme: "default" }); });
  expect(screen.getByTestId("theme-state").textContent).toBe("christmas/christmas");
});

test("a failed save leaves the active theme unchanged", async () => {
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  settingsAPI.setTheme.mockRejectedValueOnce(new Error("Save failed"));
  try {
    renderSettings();
    fireEvent.click(await screen.findByRole("button", { name: /Giáng Sinh/ }));
    await screen.findByText("Không thể lưu cài đặt theme");
    expect(screen.getByTestId("theme-state").textContent).toBe("default/default");
    expect(screen.queryByTitle("Tắt theme")).toBeNull();
  } finally {
    errorLog.mockRestore();
  }
});
