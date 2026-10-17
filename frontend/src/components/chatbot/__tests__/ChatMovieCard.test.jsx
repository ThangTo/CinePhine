import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ChatMovieCard from "components/chatbot/ChatMovieCard";
import useAuth from "hooks/useAuth";
import userService from "services/user.service";

jest.mock("hooks/useAuth", () => jest.fn());
jest.mock("services/user.service", () => ({ dislikeMovie: jest.fn() }));
jest.mock("components/common/OptimizedImage", () => (props) => <img alt={props.alt} />);
jest.mock("react-router-dom", () => ({ Link: ({ to, ...props }) => <a href={to} {...props} /> }), { virtual: true });

const movie = { id: "m1", title: "Phim A", year: 2024, genres: ["Hài"], reason: "Vì bạn thích Phim B" };

test("shows the reason; guests get no dislike button", () => {
  useAuth.mockReturnValue({ isAuthenticated: false });
  render(<ChatMovieCard movie={movie} />);
  expect(screen.getByText("Vì bạn thích Phim B")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Không hợp/ })).toBeNull();
});

test("Không hợp hides the movie for logged-in users; a failure offers a retry", async () => {
  useAuth.mockReturnValue({ isAuthenticated: true });
  userService.dislikeMovie.mockRejectedValueOnce(new Error("500")).mockResolvedValueOnce({});
  render(<ChatMovieCard movie={movie} />);

  fireEvent.click(screen.getByRole("button", { name: "Không hợp Phim A" }));
  fireEvent.click(await screen.findByRole("button", { name: "Lỗi, thử lại Phim A" }));

  expect(await screen.findByText("Đã ẩn khỏi gợi ý")).toBeTruthy();
  expect(userService.dislikeMovie).toHaveBeenCalledTimes(2);
  expect(userService.dislikeMovie).toHaveBeenCalledWith("m1");
  expect(screen.queryByRole("button")).toBeNull();
});
