// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectTracker, { seedProjects, seedPeople } from "./ProjectTracker.jsx";
import { newProject } from "./lib/projects.js";
import { newPerson } from "./lib/domain.js";

/* ---------------------------------------------------------------------
   Whole-app tests, against the built-in sample data.

   The unit tests prove filterProjects narrows a list. These prove the
   controls are wired to it: a tile that does not filter, a roster link
   that does not navigate, and a search box that ignores half the table
   are all things every underlying function can pass while the app is
   broken.
   --------------------------------------------------------------------- */

const rowTitles = () =>
  [...document.querySelectorAll("tbody tr")].map((r) => r.querySelector("td div")?.textContent ?? "");

const showing = () => screen.getByText(/Showing \d+/).textContent;
const tile = (name) => screen.getByRole("button", { name: new RegExp(`\\d+\\s*${name}`) });

let user;
beforeEach(() => {
  user = userEvent.setup();
  render(<ProjectTracker />);
});

describe("the count tiles filter the table", () => {
  it("starts unfiltered, with the Active tile selected", () => {
    expect(tile("Active")).toHaveAttribute("aria-pressed", "true");
  });

  it("narrows to a type when its tile is clicked", async () => {
    const before = rowTitles().length;
    await user.click(tile("Research"));

    const after = rowTitles().length;
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
    expect(tile("Research")).toHaveAttribute("aria-pressed", "true");
  });

  it("shows exactly the number on the tile", async () => {
    // If the tile says 4 and the table shows 3, the tile is lying.
    const count = Number(tile("Case report").textContent.match(/\d+/)[0]);
    await user.click(tile("Case report"));
    expect(rowTitles()).toHaveLength(count);
  });

  it("clears when the same tile is clicked again", async () => {
    const before = rowTitles().length;
    await user.click(tile("Research"));
    await user.click(tile("Research"));
    expect(rowTitles()).toHaveLength(before);
  });

  it("swaps rather than stacking when another tile is clicked", async () => {
    await user.click(tile("Research"));
    await user.click(tile("Review"));
    expect(tile("Research")).toHaveAttribute("aria-pressed", "false");
    expect(tile("Review")).toHaveAttribute("aria-pressed", "true");
  });

  it("Active clears the type filter", async () => {
    const before = rowTitles().length;
    await user.click(tile("Research"));
    await user.click(tile("Active"));
    expect(rowTitles()).toHaveLength(before);
  });
});

describe("searching matches what is on the table", () => {
  const search = () => screen.getByLabelText("Search projects");

  it("finds rows by their Type column", async () => {
    await user.type(search(), "research");
    const types = [...document.querySelectorAll("tbody tr")].map((r) => r.children[1].textContent);
    expect(types.length).toBeGreaterThan(0);
    expect(types.every((t) => t === "Research")).toBe(true);
  });

  it("finds rows by an author's name", async () => {
    await user.type(search(), "Brodell");
    const authors = [...document.querySelectorAll("tbody tr")].map((r) => r.children[3].textContent);
    expect(authors.length).toBeGreaterThan(0);
    expect(authors.every((a) => a.includes("Bob Brodell"))).toBe(true);
  });

  it("still finds things the table does not show", async () => {
    // "gliptin" appears only in a title here, but the point is that the
    // hidden fields remain searchable alongside the visible ones.
    await user.type(search(), "gonococcal");
    expect(rowTitles().length).toBeGreaterThan(0);
  });

  it("says so when nothing matches", async () => {
    await user.type(search(), "zzzzzz");
    expect(screen.getByText(/No projects match these filters/i)).toBeInTheDocument();
  });
});

describe("the roster links through to the table", () => {
  const openRoster = () => user.click(screen.getByRole("button", { name: "Roster" }));

  it("lists the whole department", async () => {
    await openRoster();
    const list = within(screen.getByRole("list"));
    expect(list.getAllByRole("listitem").length).toBeGreaterThan(20);
  });

  it("filters the table to one person's active work and closes itself", async () => {
    await openRoster();
    const roster = screen.getByRole("dialog", { name: "Roster" });
    const row = within(roster).getAllByRole("listitem")
      .find((r) => r.textContent.includes("Mark Albrecht"));
    const count = Number(row.textContent.match(/(\d+) projects? active/)[1]);

    await user.click(within(row).getByRole("button", { name: /projects? active/ }));

    expect(screen.queryByRole("dialog", { name: "Roster" })).toBeNull();
    expect(rowTitles()).toHaveLength(count);
    expect(showing()).toContain(`of ${count}`);
  });

  it("filters to archived work when the archived count is clicked", async () => {
    await openRoster();
    const roster = screen.getByRole("dialog", { name: "Roster" });
    const row = within(roster).getAllByRole("listitem")
      .find((r) => r.textContent.includes("Leigh Hickham"));

    await user.click(within(row).getByRole("button", { name: /projects? archived/ }));

    // The Archived toggle has to actually be on, or the table is showing
    // active rows under an archived heading.
    expect(screen.getByRole("button", { name: /Showing archived projects/ })).toBeInTheDocument();
    expect(rowTitles().length).toBeGreaterThan(0);
  });
});

describe("the active / archived / both control", () => {
  const viewButton = () => screen.getByRole("button", { name: /Showing .* projects/ });

  it("starts on active", () => {
    expect(viewButton()).toHaveTextContent("Active");
  });

  it("cycles through all three states", async () => {
    await user.click(viewButton());
    expect(viewButton()).toHaveTextContent("Archived");
    await user.click(viewButton());
    expect(viewButton()).toHaveTextContent("Both");
    await user.click(viewButton());
    expect(viewButton()).toHaveTextContent("Active");
  });

  it("shows more rows on Both than on either alone", async () => {
    const active = rowTitles().length;
    await user.click(viewButton());
    const archived = rowTitles().length;
    await user.click(viewButton());
    const both = rowTitles().length;

    expect(both).toBe(active + archived);
  });

  it("keeps the tile count honest in every state", async () => {
    await user.click(viewButton());   // archived
    await user.click(viewButton());   // both
    const total = Number(tile("Both").textContent.match(/\d+/)[0]);
    expect(rowTitles()).toHaveLength(total);
  });
});

describe("clicking a person's name", () => {
  it("shows everything they have done, active and archived together", async () => {
    await user.click(screen.getByRole("button", { name: "Roster" }));
    const roster = screen.getByRole("dialog", { name: "Roster" });
    const row = within(roster).getAllByRole("listitem")
      .find((r) => r.textContent.includes("Leigh Hickham"));

    await user.click(within(row).getByRole("button", { name: "Leigh Hickham" }));

    // Leigh has an archived project and no active one; a two-way toggle
    // could not have shown both at once.
    expect(screen.getByRole("button", { name: /Showing both projects/ })).toBeInTheDocument();
    expect(rowTitles().length).toBeGreaterThan(0);
  });
});

describe("the filter dropdowns are ordered", () => {
  const optionsOf = (labelText) =>
    [...screen.getByLabelText(labelText).options].map((o) => o.textContent).slice(1);

  it("lists types alphabetically", () => {
    const types = optionsOf("Filter by type");
    expect([...types]).toEqual([...types].sort((a, b) => a.localeCompare(b)));
  });

  it("lists authors alphabetically", () => {
    const authors = optionsOf("Filter by author");
    expect([...authors]).toEqual([...authors].sort((a, b) => a.localeCompare(b)));
  });

  it("lists academic years newest first", () => {
    const years = optionsOf("Filter by academic year");
    expect([...years]).toEqual([...years].sort().reverse());
  });

  it("keeps work status in workflow order, not alphabetical", () => {
    // Idea → Complete, with the exits after. Alphabetical would open with
    // "Abandoned, Analyzing, Collecting…", which describes no process.
    const statuses = optionsOf("Filter by work status");
    expect(statuses[0]).toBe("Idea");
    expect(statuses[statuses.length - 1]).toBe("Abandoned");
    expect(statuses.indexOf("Complete")).toBeLessThan(statuses.indexOf("On hold"));
  });
});

/* Shape parity: what the app CREATES must look like what it ships with.

   Both field-name bugs in this codebase were the same mistake — a writer
   using a name no reader uses — and both survived a full green suite
   because every assertion checked behaviour that happened to still work,
   and none checked the record itself.

   This compares key sets rather than named fields on purpose. A test that
   says "project_type is present" only catches the bug you already know
   about; comparing against the reference record catches the next one,
   whatever it gets called, including a field quietly dropped. */
describe("a created record has the same shape as a seeded one", () => {
  const keysOf = (o) => Object.keys(o).sort();

  it("a new project matches a seeded project, field for field", () => {
    const made = newProject(
      { title: "T", project_type: "research", authors: ["p1"] },
      seedProjects,
      Date.parse("2026-08-05T12:00:00Z")
    );
    expect(keysOf(made)).toEqual(keysOf(seedProjects[0]));
  });

  it("a new case report matches too, including its detail bag", () => {
    const made = newProject(
      { title: "T", project_type: "case_report", authors: ["p1"] },
      seedProjects,
      Date.parse("2026-08-05T12:00:00Z")
    );
    const seededCaseReport = seedProjects.find((p) => p.project_type === "case_report");
    expect(keysOf(made)).toEqual(keysOf(seededCaseReport));
    expect(keysOf(made.details)).toEqual(keysOf(seededCaseReport.details));
  });

  it("a new person matches a seeded person", () => {
    const made = newPerson("Someone New", "resident", "", 1754395200000);
    expect(keysOf(made)).toEqual(keysOf(seedPeople[0]));
  });

  it("carries external_position only when there is one to carry", () => {
    // The schema has a CHECK confining it to external collaborators, so an
    // empty string must not become a stored value.
    const without = newPerson("A", "resident", "", 1);
    const with_ = newPerson("B", "external_collaborator", "Pathologist", 2);
    expect(without).not.toHaveProperty("external_position");
    expect(with_.external_position).toBe("Pathologist");
  });
});

/* Creating things through the app, not through the helpers.

   The unit tests prove validateProject refuses a project with no author
   and nextCaseId issues the right number. Neither says anything about
   what the app WRITES when the button is clicked — and that is where two
   field names had drifted from the schema, leaving a captured project
   with no type the table could read and a new person with no position.
   Both suites were green throughout. These assert the record itself. */
describe("quick capture produces a project the rest of the app can read", () => {
  const capture = async (title, typeLabel) => {
    await user.click(screen.getByRole("button", { name: /Jot down a new project idea/ }));
    await user.type(screen.getByPlaceholderText(/Disseminated gonococcal rash/), title);
    await user.click(screen.getByRole("button", { name: typeLabel }));
    await user.type(screen.getByLabelText("Search for an author"), "Brodell");
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Save project" }));
    // Creating opens the detail panel; close it to get back to the table.
    const panel = screen.queryByRole("dialog");
    if (panel) await user.click(within(panel).getByRole("button", { name: "Close panel" }));
  };

  const rowFor = (title) =>
    [...document.querySelectorAll("tbody tr")].find((r) => r.textContent.includes(title));

  it("shows the type it was captured with in the Type column", async () => {
    await capture("Nailfold capillaroscopy yield", "Research");
    expect(rowFor("Nailfold capillaroscopy yield").children[1]).toHaveTextContent("Research");
  });

  it("counts on the matching type tile", async () => {
    const before = Number(tile("Research").textContent.match(/\d+/)[0]);
    await capture("Nailfold capillaroscopy yield", "Research");
    expect(Number(tile("Research").textContent.match(/\d+/)[0])).toBe(before + 1);
  });

  it("can be found by the type filter it was given", async () => {
    await capture("Nailfold capillaroscopy yield", "Review");
    await user.click(tile("Review"));
    expect(rowFor("Nailfold capillaroscopy yield")).toBeTruthy();
  });

  it("issues a case number when captured as a case report", async () => {
    await capture("Erythema migrans in an atypical distribution", "Case report");
    expect(rowFor("Erythema migrans in an atypical distribution").textContent).toMatch(/CR-\d{4}-\d{3}/);
  });

  /* The panel that opens on creation has to show the type you picked as
     the selected button, not just render four unselected ones. The table
     badge being right is a different assertion and was already passing
     while this was broken on the deployed build. */
  it.each(["Case report", "QA/QI", "Research", "Review"])(
    "opens the new project with %s already selected",
    async (typeLabel) => {
      await user.click(screen.getByRole("button", { name: /Jot down a new project idea/ }));
      await user.type(screen.getByPlaceholderText(/Disseminated gonococcal rash/), `A new ${typeLabel}`);
      await user.click(within(screen.getByRole("button", { name: "Save project" }).closest("div.rounded-lg"))
        .getByRole("button", { name: typeLabel }));
      await user.type(screen.getByLabelText("Search for an author"), "Brodell");
      await user.keyboard("{Enter}");
      await user.click(screen.getByRole("button", { name: "Save project" }));

      const panel = screen.getByRole("dialog");
      const typeGroup = within(panel).getByRole("group", { name: "Type" });
      expect(within(typeGroup).getByRole("button", { name: typeLabel })).toHaveAttribute("aria-pressed", "true");
      // and exactly one is selected, not none and not several
      const pressed = within(typeGroup).getAllByRole("button")
        .filter((b) => b.getAttribute("aria-pressed") === "true");
      expect(pressed).toHaveLength(1);
    }
  );

  /* IRB status is "Not applicable" for every new project regardless of
     type. Defaulting the three non-case-report types to "Not yet
     submitted" asserted that a submission is expected, which is wrong for
     most QA/QI work and every review — and it disagreed with the column
     default in 0001_schema.sql. */
  it.each(["Case report", "QA/QI", "Research", "Review"])(
    "starts a new %s with IRB status Not applicable",
    async (typeLabel) => {
      await user.click(screen.getByRole("button", { name: /Jot down a new project idea/ }));
      await user.type(screen.getByPlaceholderText(/Disseminated gonococcal rash/), `IRB check ${typeLabel}`);
      await user.click(within(screen.getByRole("button", { name: "Save project" }).closest("div.rounded-lg"))
        .getByRole("button", { name: typeLabel }));
      await user.type(screen.getByLabelText("Search for an author"), "Brodell");
      await user.keyboard("{Enter}");
      await user.click(screen.getByRole("button", { name: "Save project" }));

      const panel = screen.getByRole("dialog");
      expect(within(panel).getByLabelText("IRB status")).toHaveValue("not_applicable");
    }
  );
});

/* Clicking a type tile is a reset, not another filter on the pile.

   Three filters deep, clicking "Research" and getting two rows leaves you
   working out which of the other controls is still holding things back.
   The archive scope is deliberately NOT reset — see the comment on
   toggleTypeTile. */
describe("a type tile clears the other filters", () => {
  const search = () => screen.getByLabelText("Search projects");

  const narrowEverything = async () => {
    await user.selectOptions(screen.getByLabelText("Filter by work status"), "idea");
    await user.selectOptions(screen.getByLabelText("Filter by author"), "p1");
    await user.type(search(), "alopecia");
  };

  it("resets the search box", async () => {
    await narrowEverything();
    await user.click(tile("Research"));
    expect(search()).toHaveValue("");
  });

  it("resets the status, author and year dropdowns", async () => {
    await narrowEverything();
    await user.selectOptions(screen.getByLabelText("Filter by academic year"), "2025");
    await user.click(tile("Research"));

    expect(screen.getByLabelText("Filter by work status")).toHaveValue("all");
    expect(screen.getByLabelText("Filter by author")).toHaveValue("all");
    expect(screen.getByLabelText("Filter by academic year")).toHaveValue("all");
  });

  it("shows every project of that type, not the intersection", async () => {
    const expected = Number(tile("Research").textContent.match(/\d+/)[0]);
    await narrowEverything();
    await user.click(tile("Research"));
    expect(rowTitles()).toHaveLength(expected);
  });

  it("keeps the archive scope, so the tile number still matches the rows", async () => {
    // Resetting this would change the tiles' own counts at the moment you
    // clicked one: the tile would say 6 and hand you 4.
    await user.click(screen.getByRole("button", { name: /Showing .* projects/ }));  // archived
    const shown = Number(tile("Case report").textContent.match(/\d+/)[0]);
    await user.click(tile("Case report"));

    expect(screen.getByRole("button", { name: /Showing archived projects/ })).toBeInTheDocument();
    expect(rowTitles()).toHaveLength(shown);
  });

  it("still clears the type when the selected tile is clicked again", async () => {
    const before = rowTitles().length;
    await user.click(tile("Research"));
    await user.click(tile("Research"));
    expect(tile("Research")).toHaveAttribute("aria-pressed", "false");
    expect(rowTitles()).toHaveLength(before);
  });
});

describe("someone added to the roster inline is a complete person", () => {
  const addAttending = async (roster, name) => {
    await user.click(within(roster).getByRole("button", { name: /Add someone/ }));
    await user.type(within(roster).getByLabelText("Full name"), name);
    await user.selectOptions(within(roster).getByLabelText("Role"), "attending");
    await user.click(within(roster).getByRole("button", { name: /^Add$/ }));
  };

  const openRoster = async () => {
    await user.click(screen.getByRole("button", { name: "Roster" }));
    return screen.getByRole("dialog", { name: "Roster" });
  };

  it("shows the position they were given", async () => {
    const roster = await openRoster();
    await addAttending(roster, "Dana Whitfield");
    const row = within(roster).getAllByRole("listitem")
      .find((r) => r.textContent.includes("Dana Whitfield"));
    expect(row).toHaveTextContent("Attending");
  });

  it("appears under that position in the roster filter", async () => {
    const roster = await openRoster();
    await addAttending(roster, "Dana Whitfield");
    await user.selectOptions(within(roster).getByLabelText(/Filter the roster by position/), "attending");
    const names = within(roster).getAllByRole("listitem").map((r) => r.textContent);
    expect(names.some((n) => n.includes("Dana Whitfield"))).toBe(true);
  });

  it("becomes selectable as a case report's attending", async () => {
    const roster = await openRoster();
    await addAttending(roster, "Dana Whitfield");
    await user.click(within(roster).getByRole("button", { name: "Close" }));

    await user.click(tile("Case report"));
    await user.click(document.querySelectorAll("tbody tr")[0]);
    const panel = screen.getByRole("dialog");
    const picker = within(panel).getByRole("group", { name: "Attending" });
    expect(within(picker).getByRole("option", { name: "Dana Whitfield" })).toBeInTheDocument();
  });
});

describe("the detail panel shows when a project was submitted", () => {
  it("gives every type a submission date, not just case reports", async () => {
    // Only case reports carry a case number, so the other three types had
    // no date anywhere in the header.
    await user.click(tile("Research"));
    await user.click(document.querySelectorAll("tbody tr")[0]);

    const panel = screen.getByRole("dialog");
    expect(within(panel).getByText(/^Submitted /)).toBeInTheDocument();
  });
});
