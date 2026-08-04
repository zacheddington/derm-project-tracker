import { describe, it, expect } from "vitest";
import {
  rowsFromWrite, rowFromWrite, writeOne, writeMany, describeWriteFailure,
  NotPermittedError, MissingSelectError, DatabaseError,
} from "./supabaseWrite.js";

/* No Supabase here on purpose. These assert against the exact shapes
   PostgREST returns, which is what the helper has to tell apart. The
   dangerous one is the first: data: [] with error: null. */

const REFUSED = { data: [], error: null };
const OK_ONE = { data: [{ id: "x1", title: "Saved" }], error: null };
const OK_MANY = { data: [{ id: "a" }, { id: "b" }], error: null };
const NO_SELECT = { data: null, error: null };
const DB_ERROR = { data: null, error: { message: "duplicate key value", code: "23505" } };

describe("a blocked write is never mistaken for a successful one", () => {
  it("throws on the exact shape RLS produces", () => {
    // { data: [], error: null }. Reading only `error` here — which is the
    // obvious way to write it — reports success on a refused write.
    expect(() => rowsFromWrite(REFUSED, "edit this project")).toThrow(NotPermittedError);
  });

  it("says it plainly, in words worth showing a user", () => {
    try {
      rowsFromWrite(REFUSED, "edit this project");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err.message).toMatch(/do not have permission to edit this project/);
      expect(err.message).toMatch(/Nothing was changed/);
    }
  });

  it("flags itself as a denial so a UI need not match on the message", () => {
    try {
      rowsFromWrite(REFUSED, "remove this author");
    } catch (err) {
      expect(err.isPermissionDenial).toBe(true);
      expect(err.description).toBe("remove this author");
    }
  });
});

describe("successful writes", () => {
  it("returns the affected rows", () => {
    expect(rowsFromWrite(OK_ONE, "edit this project")).toEqual([{ id: "x1", title: "Saved" }]);
  });

  it("returns several when several changed", () => {
    expect(rowsFromWrite(OK_MANY, "reassign authors")).toHaveLength(2);
  });

  it("accepts a single object, which .single() returns instead of an array", () => {
    expect(rowsFromWrite({ data: { id: "x1" }, error: null }, "edit")).toEqual([{ id: "x1" }]);
  });
});

describe("exactly one row", () => {
  it("unwraps the single row", () => {
    expect(rowFromWrite(OK_ONE, "edit this project")).toEqual({ id: "x1", title: "Saved" });
  });

  it("still refuses an empty result", () => {
    expect(() => rowFromWrite(REFUSED, "edit this project")).toThrow(NotPermittedError);
  });

  it("objects when more rows changed than intended", () => {
    // Two rows from an update-by-id means the filter was wrong. Better to
    // fail than to quietly return the first one.
    expect(() => rowFromWrite(OK_MANY, "edit this project")).toThrow(DatabaseError);
    expect(() => rowFromWrite(OK_MANY, "edit this project")).toThrow(/changed 2/);
  });
});

describe("the forgotten .select()", () => {
  it("refuses to guess when there is no rows array", () => {
    // A successful write without .select() returns data: null, which is
    // indistinguishable from a refusal if you are counting rows.
    expect(() => rowsFromWrite(NO_SELECT, "edit this project")).toThrow(MissingSelectError);
  });

  it("tells the developer exactly what to add", () => {
    try {
      rowsFromWrite(NO_SELECT, "edit this project");
    } catch (err) {
      expect(err.message).toMatch(/Add \.select\(\)/);
    }
  });

  it("does not report it as a permission problem", () => {
    // Blaming the user for our bug sends them to an admin who cannot help.
    try {
      rowsFromWrite(NO_SELECT, "edit this project");
    } catch (err) {
      expect(err.isPermissionDenial).toBeUndefined();
    }
  });

  it("rejects a malformed result rather than treating it as empty", () => {
    expect(() => rowsFromWrite(undefined, "edit")).toThrow(MissingSelectError);
    expect(() => rowsFromWrite(null, "edit")).toThrow(MissingSelectError);
  });
});

describe("real database errors stay distinguishable from refusals", () => {
  it("wraps the error and keeps its code", () => {
    try {
      rowsFromWrite(DB_ERROR, "add this person");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(DatabaseError);
      expect(err.code).toBe("23505");
      expect(err.message).toMatch(/duplicate key/);
    }
  });

  it("prefers the database's own error over a row count", () => {
    // error set AND data empty: the constraint is the real story.
    const both = { data: [], error: { message: "violates check constraint", code: "23514" } };
    expect(() => rowsFromWrite(both, "save")).toThrow(DatabaseError);
  });
});

describe("awaiting the query directly", () => {
  it("writeOne resolves to the row", async () => {
    await expect(writeOne(Promise.resolve(OK_ONE), "edit this project"))
      .resolves.toEqual({ id: "x1", title: "Saved" });
  });

  it("writeOne rejects a silently refused write", async () => {
    await expect(writeOne(Promise.resolve(REFUSED), "edit this project"))
      .rejects.toBeInstanceOf(NotPermittedError);
  });

  it("writeMany resolves to all rows", async () => {
    await expect(writeMany(Promise.resolve(OK_MANY), "reassign")).resolves.toHaveLength(2);
  });
});

describe("turning a failure into something to show", () => {
  it("marks a refusal as the user's to see, not a crash", () => {
    const d = describeWriteFailure(new NotPermittedError("edit this project"));
    expect(d).toMatchObject({ permissionDenied: true, isBug: false });
    expect(d.message).toMatch(/permission/);
  });

  it("hides our own bug behind a generic message", () => {
    const d = describeWriteFailure(new MissingSelectError("edit this project"));
    expect(d).toMatchObject({ permissionDenied: false, isBug: true });
    expect(d.message).not.toMatch(/select\(\)/);
  });

  it("passes a database message through, since it is often actionable", () => {
    const d = describeWriteFailure(new DatabaseError("add this person", { message: "duplicate key" }));
    expect(d).toMatchObject({ permissionDenied: false, isBug: false });
    expect(d.message).toMatch(/duplicate key/);
  });

  it("treats anything unrecognised as a bug", () => {
    expect(describeWriteFailure(new TypeError("boom"))).toMatchObject({ isBug: true });
  });
});
