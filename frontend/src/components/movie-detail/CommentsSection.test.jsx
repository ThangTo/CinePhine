import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CommentsSection from "./CommentsSection";
import movieService from "services/movie.service";

jest.mock("services/movie.service", () => ({
  __esModule: true,
  default: { postComment: jest.fn() },
}));
jest.mock("hooks/useAuth", () => () => ({
  isAuthenticated: true,
  user: { id: "user-1" },
}));
jest.mock("hooks/useToast", () => () => ({
  toasts: [],
  success: jest.fn(),
  warning: jest.fn(),
}));
jest.mock("components/common/ToastContainer", () => () => null);
jest.mock("components/movie-detail/comment/CommentsList", () => () => null);
jest.mock("components/movie-detail/comment/RatingsList", () => () => null);
jest.mock("components/movie-detail/comment/CommentInput", () => (props) => (
  <div>
    <input
      aria-label="Comment"
      value={props.commentText}
      onChange={(event) => props.setCommentText(event.target.value)}
    />
    <button disabled={props.isSubmitting} onClick={props.onSubmit}>Send</button>
  </div>
));

const movie = { id: "movie-1", comments: [] };

beforeEach(() => {
  jest.clearAllMocks();
  movieService.postComment.mockResolvedValue({ id: "comment-1" });
});

const submitComment = async () => {
  fireEvent.change(screen.getByLabelText("Comment"), { target: { value: "Hello" } });
  fireEvent.click(screen.getByText("Send"));
  await waitFor(() => expect(screen.getByLabelText("Comment").value).toBe(""));
};

test("sends the current episode and updates it after changing episodes", async () => {
  const { rerender } = render(<CommentsSection movie={movie} episodeId={3} />);
  await submitComment();
  expect(movieService.postComment).toHaveBeenLastCalledWith("movie-1", {
    content: "Hello", isSpoiler: false, episodeId: 3,
  });

  rerender(<CommentsSection movie={movie} episodeId={4} />);
  await submitComment();
  expect(movieService.postComment).toHaveBeenLastCalledWith("movie-1", {
    content: "Hello", isSpoiler: false, episodeId: 4,
  });
});

test.each([undefined, null, 0, NaN])("omits episode when unavailable: %s", async (episodeId) => {
  render(<CommentsSection movie={movie} episodeId={episodeId} />);
  await submitComment();
  expect(movieService.postComment).toHaveBeenCalledWith("movie-1", {
    content: "Hello", isSpoiler: false,
  });
});
