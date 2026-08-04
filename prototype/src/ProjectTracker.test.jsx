// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ProjectTracker from "./ProjectTracker.jsx";

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

describe("the staleness banners are gone", () => {
  it("shows no untouched-for notice at all", () => {
    expect(screen.queryByText(/not been touched/i)).toBeNull();
  });

  it("no longer offers an age filter", () => {
    expect(screen.queryByLabelText(/how long since the last update/i)).toBeNull();
  });
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
    expect(screen.getByRole("button", { name: "Show archived projects" }))
      .toHaveAttribute("aria-pressed", "true");
    expect(rowTitles().length).toBeGreaterThan(0);
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
