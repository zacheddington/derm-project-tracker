// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RosterPanel from "./RosterPanel.jsx";

/* The roster is where a rename has to keep every project link, and where
   "who has left?" has to be answerable by reading the screen. Both are
   behaviours of this panel rather than of any single function. */

const NOW = Date.parse("2026-08-04T12:00:00Z");

const people = [
  { id: "p1", display_name: "Rae LeBlanc", staff_position: "resident", pgy_level: 2, employment_end_date: null },
  { id: "p2", display_name: "Tomi Okafor", staff_position: "resident", pgy_level: 3, employment_end_date: null },
  { id: "p3", display_name: "Priya Raman", staff_position: "attending", employment_end_date: null },
  { id: "p4", display_name: "Ellen Voss", staff_position: "resident", pgy_level: 1, employment_end_date: "2025-06-30" },
  { id: "p5", display_name: "Ben Iwu", staff_position: "external_collaborator", external_position: "Dermatopathologist, Baptist Health", employment_end_date: null },
];

const projects = [
  { id: "x1", authors: ["p1", "p3"] },
  { id: "x2", authors: ["p1", "p2"] },   // Rae on two, so the count is not 1 by accident
];

function setup() {
  const onSavePerson = vi.fn();
  const onAddPerson = vi.fn();
  const onClose = vi.fn();
  render(
    <RosterPanel
      people={people}
      projects={projects}
      onSavePerson={onSavePerson}
      onAddPerson={onAddPerson}
      onClose={onClose}
      now={NOW}
    />
  );
  return { onSavePerson, onAddPerson, onClose, user: userEvent.setup() };
}

const rows = () => within(screen.getByRole("list")).queryAllByRole("listitem");
const shownNames = () => rows().map((r) => r.textContent);

describe("current and former staff are separate views", () => {
  it("shows only current staff by default", () => {
    setup();
    const names = shownNames().join(" ");
    expect(names).toContain("Rae LeBlanc");
    expect(names).toContain("Ben Iwu");
    expect(names).not.toContain("Ellen Voss");
  });

  it("counts the leavers on the tab", () => {
    setup();
    expect(screen.getByRole("tab", { name: /Former staff \(1\)/ })).toBeInTheDocument();
  });

  it("shows former staff INSTEAD OF current staff", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: /Former staff/ }));

    const names = shownNames().join(" ");
    expect(names).toContain("Ellen Voss");
    expect(names).not.toContain("Rae LeBlanc");
  });

  it("says when someone left, rather than fading the row", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("tab", { name: /Former staff/ }));
    expect(screen.getByText(/left 2025-06-30/)).toBeInTheDocument();
  });

  it("hides Add someone while looking at people who have left", async () => {
    const { user } = setup();
    expect(screen.getByRole("button", { name: /Add someone/ })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Former staff/ }));
    expect(screen.queryByRole("button", { name: /Add someone/ })).toBeNull();
  });
});

describe("searching the roster", () => {
  const search = () => screen.getByLabelText("Search the roster");

  it("filters by name", async () => {
    const { user } = setup();
    await user.type(search(), "tomi");
    expect(shownNames()).toHaveLength(1);
    expect(shownNames()[0]).toContain("Tomi Okafor");
  });

  it("finds an external collaborator by their position", async () => {
    const { user } = setup();
    await user.type(search(), "dermatopath");
    expect(shownNames().join(" ")).toContain("Ben Iwu");
  });

  it("searches within the active tab only", async () => {
    const { user } = setup();
    await user.type(search(), "voss");
    expect(screen.getByText(/Nobody currently here matches/)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Former staff/ }));
    expect(shownNames().join(" ")).toContain("Ellen Voss");
  });

  it("says nothing matched rather than showing everyone", async () => {
    const { user } = setup();
    await user.type(search(), "zzzz");
    expect(screen.getByText(/Nobody currently here matches/)).toBeInTheDocument();
  });
});

describe("editing someone", () => {
  const editRowFor = async (user, name) => {
    const row = rows().find((r) => r.textContent.includes(name));
    await user.click(within(row).getByRole("button", { name: /Edit/ }));
  };

  it("renames without touching anything else, so project links survive", async () => {
    const { onSavePerson, user } = setup();
    await editRowFor(user, "Tomi Okafor");

    const nameBox = screen.getByDisplayValue("Tomi Okafor");
    await user.clear(nameBox);
    await user.type(nameBox, "Tomi Albrecht");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));

    // The id is what projects reference. The panel must patch by id and
    // never invent a new person.
    expect(onSavePerson).toHaveBeenCalledTimes(1);
    expect(onSavePerson.mock.calls[0][0]).toBe("p2");
    expect(onSavePerson.mock.calls[0][1]).toMatchObject({
      display_name: "Tomi Albrecht",
      staff_position: "resident",
    });
  });

  it("shows how many projects someone is on, so a rename is visibly consequential", () => {
    setup();
    expect(screen.getByText(/2 projects/)).toBeInTheDocument();  // Rae + Priya each on x1
  });

  it("will not save an empty name", async () => {
    const { onSavePerson, user } = setup();
    await editRowFor(user, "Tomi Okafor");
    await user.clear(screen.getByDisplayValue("Tomi Okafor"));
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    expect(onSavePerson).not.toHaveBeenCalled();
  });

  it("discards the edit on cancel", async () => {
    const { onSavePerson, user } = setup();
    await editRowFor(user, "Tomi Okafor");
    await user.type(screen.getByDisplayValue("Tomi Okafor"), "!!");
    await user.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(onSavePerson).not.toHaveBeenCalled();
    expect(shownNames().join(" ")).toContain("Tomi Okafor");
  });

  it("offers the free-text position only for external collaborators", async () => {
    const { user } = setup();
    await editRowFor(user, "Ben Iwu");
    expect(screen.getByDisplayValue("Dermatopathologist, Baptist Health")).toBeInTheDocument();

    // Close it first: two open editors would leave Ben-s field on screen
    // and the next assertion would pass for the wrong reason.
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    await editRowFor(user, "Rae LeBlanc");
    expect(screen.queryByPlaceholderText(/Pathologist, Baptist Health/)).toBeNull();
  });

  it("sends an end date as null when cleared, not as an empty string", async () => {
    // '' is not a date and Postgres would reject it; null means "still here".
    const { onSavePerson, user } = setup();
    await editRowFor(user, "Rae LeBlanc");
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(onSavePerson.mock.calls[0][1].employment_end_date).toBeNull();
  });
});
