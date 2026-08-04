/* ---------------------------------------------------------------------
   Write helpers for the Supabase client.

   THIS IS NOT PROTOTYPE CODE. The prototype has no backend. This lives
   here because this is where the repo's tested, framework-free logic
   lives, and it exists *before* the Next.js application so that the
   application is built on it rather than on a warning in a document.
   Move it with the app when the app exists.

   ---------------------------------------------------------------------
   The problem it solves.

   Row Level Security refuses a write by matching ZERO ROWS. It does not
   raise. So a blocked UPDATE comes back from PostgREST as:

       { data: [], error: null }

   which is character-for-character what a successful update of zero
   matching rows looks like, and — crucially — what most code treats as
   success. Write it the obvious way:

       const { error } = await supabase.from("projects").update(patch).eq("id", id);
       if (error) toast.error(error.message);
       else toast.success("Saved");

   …and a user without permission is told their edit saved. It did not.
   They close the tab. The change is gone. Nobody finds out until someone
   asks why the status never changed.

   This is the single most likely production bug in this codebase, it is
   silent, and it is a data-integrity bug rather than a cosmetic one.

   ---------------------------------------------------------------------
   The other half of the trap.

   PostgREST only returns rows when you ask for them. Without .select(),
   a SUCCESSFUL update returns `data: null` — indistinguishable from a
   refusal if you are counting rows. So these helpers refuse to guess:
   forgetting .select() is a programming error and says so, loudly, at
   the call site rather than in production.
   --------------------------------------------------------------------- */

/* Thrown when the database accepted the statement and changed nothing.
   Always means "not permitted" or "no longer there" — never "saved". */
export class NotPermittedError extends Error {
  constructor(description) {
    super(
      `You do not have permission to ${description}, or it no longer exists. ` +
      `Nothing was changed.`
    );
    this.name = "NotPermittedError";
    this.description = description;
    /* Lets a UI distinguish "tell the user calmly" from "something broke",
       without string-matching the message. */
    this.isPermissionDenial = true;
  }
}

/* Thrown when the caller forgot .select(). A bug in our code, not the
   user's problem — worded for whoever is reading the stack trace. */
export class MissingSelectError extends Error {
  constructor(description) {
    super(
      `Cannot tell whether "${description}" succeeded: the query returned no rows array. ` +
      `Add .select() to the write — without it PostgREST returns data: null on success, ` +
      `which is indistinguishable from a row-level-security refusal.`
    );
    this.name = "MissingSelectError";
  }
}

/* Thrown when the database itself objected — a constraint, a bad value,
   a connection problem. Distinct from a silent refusal on purpose. */
export class DatabaseError extends Error {
  constructor(description, cause) {
    super(`Could not ${description}: ${cause?.message ?? "unknown database error"}`);
    this.name = "DatabaseError";
    this.cause = cause;
    this.code = cause?.code;
  }
}

/* The core check. Give it the AWAITED result of a Supabase write that
   ends in .select(), plus a human description of what was attempted, and
   it returns the affected rows or throws.

   `description` is shown to the user, so phrase it as the action:
   "edit this project", "remove this author". */
export function rowsFromWrite(result, description) {
  if (!result || typeof result !== "object") {
    throw new MissingSelectError(description);
  }
  const { data, error } = result;

  // A real database error. Surface it as itself; it is not a denial.
  if (error) throw new DatabaseError(description, error);

  // null/undefined means .select() was never called, so "how many rows
  // changed?" is unanswerable. Refuse to assume either way.
  if (data == null) throw new MissingSelectError(description);

  const rows = Array.isArray(data) ? data : [data];

  // The whole point.
  if (rows.length === 0) throw new NotPermittedError(description);

  return rows;
}

/* For writes that must affect exactly one row: updating a project by id,
   deleting one venue. More than one means the filter was wrong, which is
   worth failing on rather than shrugging at. */
export function rowFromWrite(result, description) {
  const rows = rowsFromWrite(result, description);
  if (rows.length > 1) {
    throw new DatabaseError(
      description,
      new Error(`expected to change one row, changed ${rows.length} — check the filter`)
    );
  }
  return rows[0];
}

/* Convenience wrappers so a call site reads as one expression:

     const saved = await writeOne(
       supabase.from("projects").update(patch).eq("id", id).select(),
       "edit this project"
     );
*/
export async function writeOne(query, description) {
  return rowFromWrite(await query, description);
}

export async function writeMany(query, description) {
  return rowsFromWrite(await query, description);
}

/* For a UI layer: turns any of the above into a message worth showing,
   and says whether it was a refusal (calm) or a fault (alarming). */
export function describeWriteFailure(err) {
  if (err instanceof NotPermittedError) {
    return { message: err.message, permissionDenied: true, isBug: false };
  }
  if (err instanceof MissingSelectError) {
    return { message: "Something went wrong saving that.", permissionDenied: false, isBug: true };
  }
  if (err instanceof DatabaseError) {
    return { message: err.message, permissionDenied: false, isBug: false };
  }
  return { message: "Something went wrong saving that.", permissionDenied: false, isBug: true };
}
