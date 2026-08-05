// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthorPicker from "./AuthorPicker.jsx";
import QuickCapture from "./QuickCapture.jsx";

const NOW = Date.parse("2026-08-04T12:00:00Z");

const people = [
  { id: "p1", display_name: "Rae LeBlanc", staff_position: "resident", pgy_level: 2 },
  { id: "p2", display_name: "Tomi Okafor", staff_position: "resident", pgy_level: 3 },
  { id: "p3", display_name: "Priya Raman", staff_position: "attending" },
  { id: "p4", display_name: "Ellen Voss", staff_position: "resident", employment_end_date: "2025-06-30" },
];

function pickerSetup(selected = ["p1"]) {
  const onChange = vi.fn();
  const onAddPerson = vi.fn((name, staff_position) => ({
    id: "new-1", display_name: name, staff_position,
  }));
  const { rerender } = render(
    <AuthorPicker people={people} selected={selected} onChange={onChange}
                  onAddPerson={onAddPerson} now={NOW} />
  );
  return { onChange, onAddPerson, rerender, user: userEvent.setup() };
}

describe("removing authors", () => {
  it("offers a remove control for every author, including the last one", () => {
    pickerSetup(["p1"]);
    expect(screen.getByRole("button", { name: "Remove Rae LeBlanc" })).toBeEnabled();
  });

  it("reports the removal upward rather than swallowing it", async () => {
    const { onChange, user } = pickerSetup(["p1", "p2"]);
    await user.click(screen.getByRole("button", { name: "Remove Tomi Okafor" }));
    expect(onChange).toHaveBeenCalledWith(["p1"]);
  });

  it("warns when there is nobody left", () => {
    pickerSetup([]);
    expect(screen.getByText(/No authors yet/i)).toBeInTheDocument();
  });
});

describe("finding someone", () => {
  it("suggests nobody until you type", () => {
    pickerSetup([]);
    expect(screen.queryByRole("button", { name: /Rae LeBlanc/ })).toBeNull();
  });

  it("matches on part of a name, case-insensitively", async () => {
    const { user } = pickerSetup([]);
    await user.type(screen.getByLabelText("Search for an author"), "leb");
    expect(screen.getByRole("button", { name: /Rae LeBlanc/ })).toBeInTheDocument();
  });

  it("does not offer someone already on the project", async () => {
    const { user } = pickerSetup(["p1"]);
    await user.type(screen.getByLabelText("Search for an author"), "a");
    expect(screen.queryByRole("button", { name: /Rae LeBlanc.*Resident/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Priya Raman/ })).toBeInTheDocument();
  });

  it("does not offer someone who has left", async () => {
    const { user } = pickerSetup([]);
    await user.type(screen.getByLabelText("Search for an author"), "voss");
    expect(screen.queryByRole("button", { name: /Ellen Voss/ })).toBeNull();
  });

  it("adds the person that was picked", async () => {
    const { onChange, user } = pickerSetup(["p1"]);
    await user.type(screen.getByLabelText("Search for an author"), "priya");
    await user.click(screen.getByRole("button", { name: /Priya Raman/ }));
    expect(onChange).toHaveBeenCalledWith(["p1", "p3"]);
  });
});

describe("picking an author from the keyboard", () => {
  const search = () => screen.getByLabelText("Search for an author");
  const options = () =>
    screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-selected"));
  const highlighted = () => options().find((b) => b.getAttribute("aria-selected") === "true");

  it("highlights the top match as soon as there is one", async () => {
    const { user } = pickerSetup([]);
    await user.type(search(), "a");
    expect(highlighted()).toBe(options()[0]);
  });

  it("takes the highlighted match on Enter", async () => {
    const { onChange, user } = pickerSetup([]);
    await user.type(search(), "priya");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["p3"]);
  });

  it("takes it on Tab too, which is the key people reach for", async () => {
    const { onChange, user } = pickerSetup([]);
    await user.type(search(), "priya");
    await user.tab();
    expect(onChange).toHaveBeenCalledWith(["p3"]);
  });

  it("moves down and up the list with the arrows", async () => {
    const { onChange, user } = pickerSetup([]);
    await user.type(search(), "a");          // several matches
    await user.keyboard("{ArrowDown}");
    expect(highlighted()).toBe(options()[1]);
    await user.keyboard("{ArrowUp}");
    expect(highlighted()).toBe(options()[0]);
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("wraps around rather than sticking at the ends", async () => {
    const { user } = pickerSetup([]);
    await user.type(search(), "a");
    await user.keyboard("{ArrowUp}");        // up from the top
    expect(highlighted()).toBe(options()[options().length - 1]);
  });

  it("puts the highlight back on the top match when the query changes", async () => {
    const { user } = pickerSetup([]);
    await user.type(search(), "a");
    await user.keyboard("{ArrowDown}");
    await user.type(search(), "r");          // new query, new list
    expect(highlighted()).toBe(options()[0]);
  });

  it("does not swallow Tab when there is nothing to take", async () => {
    // Hijacking Tab with an empty list would trap focus in the box.
    const { onChange, user } = pickerSetup([]);
    await user.click(search());
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers names in alphabetical order", async () => {
    const { user } = pickerSetup([]);
    await user.type(search(), "a");
    const names = options().map((b) => b.textContent);
    expect([...names]).toEqual([...names].sort((x, y) => x.localeCompare(y)));
  });
});

describe("adding someone to the roster inline", () => {
  it("offers to create the name that was typed", async () => {
    const { user } = pickerSetup([]);
    await user.type(screen.getByLabelText("Search for an author"), "Nadia Okonkwo");
    expect(screen.getByRole("button", { name: /Add .Nadia Okonkwo. to the roster/ })).toBeInTheDocument();
  });

  it("creates the person and selects them in one step", async () => {
    const { onChange, onAddPerson, user } = pickerSetup(["p1"]);
    await user.type(screen.getByLabelText("Search for an author"), "Nadia Okonkwo");
    await user.click(screen.getByRole("button", { name: /Add .Nadia Okonkwo. to the roster/ }));
    await user.click(screen.getByRole("button", { name: /Add to roster/ }));

    expect(onAddPerson).toHaveBeenCalledWith("Nadia Okonkwo", "resident", "");
    expect(onChange).toHaveBeenCalledWith(["p1", "new-1"]);
  });

  it("asks for a position only when the role is external collaborator", async () => {
    const { user } = pickerSetup([]);
    await user.type(screen.getByLabelText("Search for an author"), "Sam");
    await user.click(screen.getByRole("button", { name: /Add .Sam. to the roster/ }));

    expect(screen.queryByLabelText("Position or role")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Role"), "external_collaborator");
    expect(screen.getByLabelText("Position or role")).toBeInTheDocument();
  });

  it("passes the position through when one is given", async () => {
    const { onAddPerson, user } = pickerSetup([]);
    await user.type(screen.getByLabelText("Search for an author"), "Sam");
    await user.click(screen.getByRole("button", { name: /Add .Sam. to the roster/ }));
    await user.selectOptions(screen.getByLabelText("Role"), "external_collaborator");
    await user.type(screen.getByLabelText("Position or role"), "Pathologist, Baptist");
    await user.click(screen.getByRole("button", { name: /Add to roster/ }));

    expect(onAddPerson).toHaveBeenCalledWith("Sam", "external_collaborator", "Pathologist, Baptist");
  });
});

/* --------------------------------------------------------------------- */

describe("quick capture", () => {
  function captureSetup() {
    const onCreate = vi.fn();
    const onAddPerson = vi.fn((name, staff_position) => ({ id: "new-1", display_name: name, staff_position }));
    render(<QuickCapture people={people} onCreate={onCreate} onAddPerson={onAddPerson} now={() => NOW} />);
    return { onCreate, onAddPerson, user: userEvent.setup() };
  }

  const open = async (user) => user.click(screen.getByRole("button", { name: /Jot down a new project idea/ }));

  it("shows no elapsed-time counter", async () => {
    const { user } = captureSetup();
    await open(user);
    // A stopwatch on someone recording a case report was the wrong thing
    // to show them; it measured a design target, not their work.
    expect(screen.queryByText(/^\d+s$/)).toBeNull();
  });

  it("starts with no author rather than guessing one", async () => {
    const { user } = captureSetup();
    await open(user);
    expect(screen.getByText(/No authors yet/i)).toBeInTheDocument();
  });

  it("refuses to create a project with no author, and says why", async () => {
    const { onCreate, user } = captureSetup();
    await open(user);
    await user.type(screen.getByPlaceholderText(/Disseminated gonococcal rash/), "A new idea");
    await user.click(screen.getByRole("button", { name: "Save project" }));

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/at least one author/i)).toBeInTheDocument();
  });

  it("refuses a blank title", async () => {
    const { onCreate, user } = captureSetup();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Save project" }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/needs a title/i)).toBeInTheDocument();
  });

  it("creates the project once title and author are both present", async () => {
    const { onCreate, user } = captureSetup();
    await open(user);
    await user.type(screen.getByPlaceholderText(/Disseminated gonococcal rash/), "  A new idea  ");
    await user.type(screen.getByLabelText("Search for an author"), "priya");
    await user.click(screen.getByRole("button", { name: /Priya Raman/ }));
    await user.click(screen.getByRole("button", { name: "Save project" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      title: "A new idea",          // trimmed
      type: "case_report",          // the default
      authors: ["p3"],
    });
  });

  it("carries the chosen type through", async () => {
    const { onCreate, user } = captureSetup();
    await open(user);
    await user.type(screen.getByPlaceholderText(/Disseminated gonococcal rash/), "A review");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.type(screen.getByLabelText("Search for an author"), "priya");
    await user.click(screen.getByRole("button", { name: /Priya Raman/ }));
    await user.click(screen.getByRole("button", { name: "Save project" }));

    expect(onCreate.mock.calls[0][0].type).toBe("review");
  });

  it("warns about a possible identifier without blocking the save", async () => {
    const { user } = captureSetup();
    await open(user);
    await user.type(screen.getByPlaceholderText(/Disseminated gonococcal rash/), "Seen 4/12/2025");
    expect(screen.getByRole("status")).toHaveTextContent(/full date/i);
    expect(screen.getByRole("button", { name: "Save project" })).toBeEnabled();
  });
});
