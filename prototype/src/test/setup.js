/* Shared test setup.

   jest-dom only registers matchers when a DOM is present, so the import
   is guarded: the pure-logic suites run in the node environment and would
   otherwise fail on a missing `document`. */
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");

  const { cleanup } = await import("@testing-library/react");
  const { afterEach } = await import("vitest");

  // React Testing Library does not auto-clean when `globals` is set via
  // config rather than detected, and a leaked component from one test
  // makes the next one's queries ambiguous in ways that read like real
  // failures.
  afterEach(() => cleanup());
}
