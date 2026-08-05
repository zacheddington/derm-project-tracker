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
  { id: "x1", authors: ["p1", "p3"], archived_at: null },
  { id: "x2", authors: ["p1", "p2"], archived_at: null },   // Rae on two: the count is not 1 by accident
  { id: "x3", authors: ["p1"], archived_at: "2026-02-01T00:00:00Z" },
  // p4 Ellen Voss and p5 Ben Iwu deliberately have none.
];

function setup() {
  const onSavePerson = vi.fn();
  const onAddPerson = vi.fn();
  const onShowProjects = vi.fn();
  const onClose = vi.fn();
  render(
    <RosterPanel
      people={people}
      projects={projects}
      onSavePerson={onSavePerson}
      onAddPerson={onAddPerson}
      onShowProjects={onShowProjects}
      onClose={onClose}
      now={NOW}
    />
  );
  return { onSavePerson, onAddPerson, onShowProjects, onClose, user: userEvent.setup() };
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

describe("finding the right people", () => {
  it("narrows to a position", async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText("Filter the roster by position"), "attending");
    expect(shownNames()).toHaveLength(1);
    expect(shownNames()[0]).toContain("Priya Raman");
  });

  it("puts the people with nothing on at the top when sorted by load", async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText("Sort the roster"), "load");
    // Ben Iwu has none; Rae has two.
    expect(shownNames()[0]).toContain("Ben Iwu");
    expect(shownNames()[shownNames().length - 1]).toContain("Rae LeBlanc");
  });

  it("is alphabetical by default", () => {
    setup();
    const names = shownNames().map((t) => t.split(/Resident|Attending|External/)[0].trim());
    expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("combines a position with the sort", async () => {
    const { user } = setup();
    await user.selectOptions(screen.getByLabelText("Filter the roster by position"), "resident");
    await user.selectOptions(screen.getByLabelText("Sort the roster"), "load");
    expect(shownNames()).toHaveLength(2);
    expect(shownNames()[0]).toContain("Tomi Okafor");   // 1 active
    expect(shownNames()[1]).toContain("Rae LeBlanc");   // 2 active
  });
});

describe("getting from a person to their work", () => {
  it("shows everything they have done when the name is clicked", async () => {
    // Not just active: the point of clicking a name is "what has this
    // person done", which spans the archive.
    const { onShowProjects, user } = setup();
    const rae = rows().find((r) => r.textContent.includes("Rae LeBlanc"));
    await user.click(within(rae).getByRole("button", { name: "Rae LeBlanc" }));
    expect(onShowProjects).toHaveBeenCalledWith("p1", "both");
  });

  it("offers the pencil beside the name rather than across the row", async () => {
    const { user } = setup();
    const rae = rows().find((r) => r.textContent.includes("Rae LeBlanc"));
    await user.click(within(rae).getByRole("button", { name: "Edit Rae LeBlanc" }));
    expect(screen.getByDisplayValue("Rae LeBlanc")).toBeInTheDocument();
  });
});

describe("leaving a half-finished staff edit", () => {
  const editRow = async (user, name) => {
    const row = rows().find((r) => r.textContent.includes(name));
    await user.click(within(row).getByRole("button", { name: `Edit ${name}` }));
  };

  it("closes without fuss when nothing changed", async () => {
    const { user } = setup();
    await editRow(user, "Tomi Okafor");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "You have unsaved changes" })).toBeNull();
  });

  it("asks, and offers all three ways out", async () => {
    const { user } = setup();
    await editRow(user, "Tomi Okafor");
    await user.type(screen.getByDisplayValue("Tomi Okafor"), "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    const dialog = screen.getByRole("dialog", { name: "You have unsaved changes" });
    for (const label of ["Save now", "Keep editing", "Discard"]) {
      expect(within(dialog).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("saves from the dialog", async () => {
    const { onSavePerson, user } = setup();
    await editRow(user, "Tomi Okafor");
    await user.type(screen.getByDisplayValue("Tomi Okafor"), "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Save now" }));

    expect(onSavePerson).toHaveBeenCalledTimes(1);
    expect(onSavePerson.mock.calls[0][1].display_name).toBe("Tomi Okafor!");
  });

  it("discards without saving", async () => {
    const { onSavePerson, user } = setup();
    await editRow(user, "Tomi Okafor");
    await user.type(screen.getByDisplayValue("Tomi Okafor"), "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(onSavePerson).not.toHaveBeenCalled();
    expect(shownNames().join(" ")).toContain("Tomi Okafor");
  });

  it("notices a changed end date, not just a changed name", async () => {
    const { user } = setup();
    await editRow(user, "Tomi Okafor");
    await user.type(screen.getByLabelText("End date"), "06302027");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog", { name: "You have unsaved changes" })).toBeInTheDocument();
  });
});

describe("saving a staff edit with the keyboard", () => {
  it("saves on Enter in the name field", async () => {
    const { onSavePerson, user } = setup();
    const row = rows().find((r) => r.textContent.includes("Tomi Okafor"));
    await user.click(within(row).getByRole("button", { name: "Edit Tomi Okafor" }));

    const nameBox = screen.getByDisplayValue("Tomi Okafor");
    await user.clear(nameBox);
    await user.type(nameBox, "Tomi Albrecht{Enter}");

    expect(onSavePerson).toHaveBeenCalledTimes(1);
    expect(onSavePerson.mock.calls[0][1].display_name).toBe("Tomi Albrecht");
  });
});

describe("editing someone", () => {
  const editRowFor = async (user, name) => {
    const row = rows().find((r) => r.textContent.includes(name));
    await user.click(within(row).getByRole("button", { name: `Edit ${name}` }));
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

  it("splits the load into active and archived", () => {
    setup();
    const rae = rows().find((r) => r.textContent.includes("Rae LeBlanc"));
    expect(rae.textContent).toContain("2 projects active");
    expect(rae.textContent).toContain("1 project archived");
  });

  it("says zero rather than saying nothing", () => {
    // Finding who has no work is most of what the roster is for; a person
    // with none used to render no count at all.
    setup();
    const ben = rows().find((r) => r.textContent.includes("Ben Iwu"));
    expect(ben.textContent).toContain("0 projects active");
    expect(ben.textContent).toContain("0 projects archived");
  });

  it("pluralises the singular case", () => {
    setup();
    const rae = rows().find((r) => r.textContent.includes("Rae LeBlanc"));
    expect(rae.textContent).not.toContain("1 projects archived");
  });

  it("sends you to that person's active projects", async () => {
    const { onShowProjects, user } = setup();
    const rae = rows().find((r) => r.textContent.includes("Rae LeBlanc"));
    await user.click(within(rae).getByRole("button", { name: /2 projects active/ }));
    expect(onShowProjects).toHaveBeenCalledWith("p1", "active");
  });

  it("sends you to that person's archived projects", async () => {
    const { onShowProjects, user } = setup();
    const rae = rows().find((r) => r.textContent.includes("Rae LeBlanc"));
    await user.click(within(rae).getByRole("button", { name: /1 project archived/ }));
    expect(onShowProjects).toHaveBeenCalledWith("p1", "archived");
  });

  it("keeps the links live even at zero, so you can confirm the emptiness", async () => {
    const { onShowProjects, user } = setup();
    const ben = rows().find((r) => r.textContent.includes("Ben Iwu"));
    await user.click(within(ben).getByRole("button", { name: /0 projects active/ }));
    expect(onShowProjects).toHaveBeenCalledWith("p5", "active");
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
