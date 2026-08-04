// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DetailPanel from "./DetailPanel.jsx";

/* ---------------------------------------------------------------------
   The detail panel is where a project is actually edited, so it is where
   work can actually be lost. The unit tests prove validateProject and
   changeProjectType behave; these prove the panel WIRES them up — that
   Save calls onSave with the edit, that a refused save does not, and that
   closing with unsaved changes asks first.

   A component can pass every unit test its logic has and still never call
   the function.
   --------------------------------------------------------------------- */

const NOW = Date.parse("2026-08-04T12:00:00Z");
const now = () => NOW;

const people = [
  { id: "p1", display_name: "Rae LeBlanc", staff_position: "resident", pgy_level: 2 },
  { id: "p2", display_name: "Priya Raman", staff_position: "attending" },
  { id: "p3", display_name: "Sofia Marchetti", staff_position: "attending" },
  { id: "p4", display_name: "Dana Reyes", staff_position: "research_fellow" },
  { id: "p5", display_name: "Gone Away", staff_position: "attending", employment_end_date: "2024-01-01" },
];

const project = (over = {}) => ({
  id: "x1",
  title: "Disseminated gonococcal rash",
  project_type: "case_report",
  work_status: "in_edit",
  authors: ["p1", "p2"],
  purpose: "",
  notes: "",
  next_action: "",
  next_action_due_date: "",
  irb_status: "not_applicable",
  academic_year: 2026,
  updated_at: "2026-08-01T00:00:00.000Z",
  archived_at: null,
  details: { case_number: "CR-2026-001", diagnosis: "DGI", why_unique: "Unusual sequence" },
  venues: [],
  ...over,
});

function setup(over = {}, props = {}) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const onArchive = vi.fn();
  const onAddPerson = vi.fn((name, staff_position) => ({
    id: `new-${name}`, display_name: name, staff_position,
  }));
  const p = project(over);
  render(
    <DetailPanel
      project={p}
      people={people}
      projects={[p]}
      onSave={onSave}
      onClose={onClose}
      onArchive={onArchive}
      onAddPerson={onAddPerson}
      now={now}
    />
  );
  return { onSave, onClose, onArchive, onAddPerson, user: userEvent.setup() };
}

const saveButton = () => screen.getByRole("button", { name: "Save changes" });
const titleBox = () => screen.getByDisplayValue("Disseminated gonococcal rash");

describe("saving", () => {
  it("starts clean, so Save is not offered until something changes", () => {
    setup();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("enables Save and flags unsaved changes once a field is edited", async () => {
    const { user } = setup();
    await user.type(titleBox(), "!");
    expect(saveButton()).toBeEnabled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("calls onSave exactly once, with the edited value", async () => {
    const { onSave, user } = setup();
    const title = titleBox();      // hold the node: clear() changes the display value
    await user.clear(title);
    await user.type(title, "Renamed project");
    await user.click(saveButton());

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toMatchObject({ id: "x1", title: "Renamed project" });
  });

  it("stamps updated_at from the injected clock, not the wall clock", async () => {
    const { onSave, user } = setup();
    await user.type(titleBox(), "!");
    await user.click(saveButton());
    expect(onSave.mock.calls[0][0].updated_at).toBe(new Date(NOW).toISOString());
  });

  it("goes back to clean after a successful save", async () => {
    const { user } = setup();
    await user.type(titleBox(), "!");
    await user.click(saveButton());
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("does not touch the project object it was handed", async () => {
    // The panel edits a draft. If it mutated the prop, cancelling would
    // not actually cancel anything.
    const p = project();
    const before = JSON.stringify(p);
    const onSave = vi.fn();
    render(
      <DetailPanel project={p} people={people} projects={[p]} onSave={onSave}
                   onClose={vi.fn()} onArchive={vi.fn()} onAddPerson={vi.fn()} now={now} />
    );
    const user = userEvent.setup();
    await user.type(screen.getByDisplayValue(p.title), "!");
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe("refusing to save a project with no authors", () => {
  const removeAuthor = (name) => screen.getByRole("button", { name: `Remove ${name}` });

  it("lets the last author be removed", async () => {
    const { user } = setup();
    await user.click(removeAuthor("Rae LeBlanc"));
    await user.click(removeAuthor("Priya Raman"));
    expect(screen.getByText(/No authors yet/i)).toBeInTheDocument();
  });

  it("raises the dialog on save and does NOT call onSave", async () => {
    // The unit test proves validateProject returns the error. This proves
    // the panel actually honours it.
    const { onSave, user } = setup();
    await user.click(removeAuthor("Rae LeBlanc"));
    await user.click(removeAuthor("Priya Raman"));
    await user.click(saveButton());

    expect(onSave).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", { name: "This project cannot be saved yet" });
    expect(within(dialog).getByText(/at least one author/i)).toBeInTheDocument();
  });

  it("saves once an author is put back", async () => {
    const { onSave, user } = setup();
    await user.click(removeAuthor("Priya Raman"));
    await user.click(saveButton());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].authors).toEqual(["p1"]);
  });

  it("dismisses the dialog and leaves the edit intact", async () => {
    const { user } = setup();
    await user.click(removeAuthor("Rae LeBlanc"));
    await user.click(removeAuthor("Priya Raman"));
    await user.click(saveButton());
    await user.click(screen.getByRole("button", { name: "Back to editing" }));

    expect(screen.queryByRole("dialog", { name: "This project cannot be saved yet" })).toBeNull();
    expect(screen.getByText(/No authors yet/i)).toBeInTheDocument();
  });

  it("refuses a year seen in the future and says so", async () => {
    const { onSave, user } = setup({ details: { case_number: "CR-2026-001", year_seen: 2026 } });
    const year = screen.getByRole("spinbutton");
    await user.clear(year);
    await user.type(year, "2099");
    await user.click(saveButton());

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be in the future/i)).toBeInTheDocument();
  });
});

describe("closing with unsaved changes", () => {
  it("closes immediately when nothing has changed", async () => {
    const { onClose, user } = setup();
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks before discarding, and does not close while asking", async () => {
    const { onClose, user } = setup();
    await user.type(titleBox(), "!");
    await user.click(screen.getByRole("button", { name: "Close panel" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Discard your changes?" })).toBeInTheDocument();
  });

  it("keeps editing when the discard is declined", async () => {
    const { onClose, user } = setup();
    await user.type(titleBox(), "!");
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("closes without saving when the discard is confirmed", async () => {
    const { onClose, onSave, user } = setup();
    await user.type(titleBox(), "!");
    await user.click(screen.getByRole("button", { name: "Close panel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("deleting a venue", () => {
  const withVenues = {
    venues: [
      { id: "v1", venue_type: "poster", venue_name: "MDS Annual", other_venue_description: "", submission_status: "accepted", target_date: "", notes: "" },
      { id: "v2", venue_type: "journal", venue_name: "JAAD Case Reports", other_venue_description: "", submission_status: "in_review", target_date: "", notes: "" },
    ],
  };
  const openVenues = async (user) => user.click(screen.getByRole("button", { name: /venues/i }));

  it("asks first, and says the deletion cannot be undone", async () => {
    const { user } = setup(withVenues);
    await openVenues(user);
    await user.click(screen.getByRole("button", { name: "Remove MDS Annual" }));

    const dialog = screen.getByRole("dialog", { name: "Delete this venue?" });
    expect(within(dialog).getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/MDS Annual/)).toBeInTheDocument();
  });

  it("keeps the venue when the confirmation is declined", async () => {
    const { user } = setup(withVenues);
    await openVenues(user);
    await user.click(screen.getByRole("button", { name: "Remove MDS Annual" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    expect(screen.getByDisplayValue("MDS Annual")).toBeInTheDocument();
    expect(screen.getByDisplayValue("JAAD Case Reports")).toBeInTheDocument();
  });

  it("removes exactly the venue that was clicked", async () => {
    const { user } = setup(withVenues);
    await openVenues(user);
    await user.click(screen.getByRole("button", { name: "Remove MDS Annual" }));
    await user.click(screen.getByRole("button", { name: "Delete venue" }));

    expect(screen.queryByDisplayValue("MDS Annual")).toBeNull();
    expect(screen.getByDisplayValue("JAAD Case Reports")).toBeInTheDocument();
  });

  it("shows the free-text kind only when the kind is Other", async () => {
    const { user } = setup(withVenues);
    await openVenues(user);
    expect(screen.queryByPlaceholderText(/Grand rounds/i)).toBeNull();

    const kind = screen.getAllByRole("combobox").find((s) =>
      [...s.options].some((o) => o.value === "internal_presentation"));
    await user.selectOptions(kind, "other");
    expect(screen.getByPlaceholderText(/Grand rounds/i)).toBeInTheDocument();
  });
});

describe("changing the project type", () => {
  it("keeps a case number that was already issued", async () => {
    const { onSave, user } = setup();
    await user.click(screen.getByRole("button", { name: "Research" }));
    await user.click(screen.getByRole("button", { name: "Case report" }));
    await user.click(saveButton());

    // Burning a second number would make "how many case reports this year"
    // overcount.
    expect(onSave.mock.calls[0][0].details.case_number).toBe("CR-2026-001");
  });

  it("swaps which detail fields are shown", async () => {
    const { user } = setup();
    expect(screen.getByText(/No patient identifiers here/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Research" }));
    expect(screen.queryByText(/No patient identifiers here/i)).toBeNull();
    expect(screen.getByText(/Research detail/i)).toBeInTheDocument();
  });
});

describe("the attending picker", () => {
  const attendingSelect = () =>
    screen.getAllByRole("combobox").find((s) =>
      [...s.options].some((o) => o.value === "__add"));

  it("offers attendings only — not residents, coordinators or leavers", () => {
    setup();
    const labels = [...attendingSelect().options].map((o) => o.textContent);
    expect(labels).toContain("Priya Raman");
    expect(labels).toContain("Sofia Marchetti");
    expect(labels).not.toContain("Rae LeBlanc");
    expect(labels).not.toContain("Dana Reyes");
    expect(labels).not.toContain("Gone Away");
  });

  it("keeps a currently-set person who is no longer eligible", () => {
    // Opening an old case report must not silently blank its attending
    // because that person has since left.
    setup({ details: { case_number: "CR-2026-001", attending_id: "p5" } });
    const labels = [...attendingSelect().options].map((o) => o.textContent);
    expect(labels.some((l) => l.startsWith("Gone Away"))).toBe(true);
  });

  it("adds a new attending to the roster and selects them", async () => {
    const { onAddPerson, onSave, user } = setup();
    await user.selectOptions(attendingSelect(), "__add");
    await user.type(screen.getByLabelText("New attending name"), "Nadia Okonkwo");
    await user.click(screen.getByRole("button", { name: /^Add$/ }));

    expect(onAddPerson).toHaveBeenCalledWith("Nadia Okonkwo", "attending", "");

    await user.click(saveButton());
    expect(onSave.mock.calls[0][0].details.attending_id).toBe("new-Nadia Okonkwo");
  });
});

describe("archiving", () => {
  it("hands the archive action the project id", async () => {
    const { onArchive, user } = setup();
    await user.click(screen.getByRole("button", { name: /Archive project/i }));
    expect(onArchive).toHaveBeenCalledWith("x1");
  });

  it("offers to restore an archived project instead", () => {
    setup({ archived_at: "2026-07-01T00:00:00.000Z" });
    expect(screen.getByRole("button", { name: /Restore project/i })).toBeInTheDocument();
  });
});
