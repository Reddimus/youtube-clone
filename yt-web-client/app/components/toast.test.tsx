import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ToastProvider, useToast } from "./toast";

function Trigger() {
  const { notify } = useToast();

  return (
    <button
      type="button"
      onClick={() => {
        notify("Upload complete.", "success");
      }}
    >
      Notify
    </button>
  );
}

describe("ToastProvider", () => {
  it("announces messages in a polite live region rather than an alert()", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Notify" }));

    const message = screen.getByText("Upload complete.");
    expect(message).toBeInTheDocument();
    expect(message.closest("ol")).toHaveAttribute("aria-live", "polite");
  });

  it("lets a message be dismissed", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Notify" }));
    await user.click(
      screen.getByRole("button", { name: "Dismiss notification" }),
    );

    expect(screen.queryByText("Upload complete.")).not.toBeInTheDocument();
  });

  it("stacks multiple messages", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Notify" }));
    await user.click(screen.getByRole("button", { name: "Notify" }));

    expect(screen.getAllByText("Upload complete.")).toHaveLength(2);
  });

  it("refuses to be used outside a provider", () => {
    // React logs the thrown error; the assertion is that it throws at all.
    expect(() => render(<Trigger />)).toThrow(
      "useToast must be used inside a ToastProvider.",
    );
  });
});
