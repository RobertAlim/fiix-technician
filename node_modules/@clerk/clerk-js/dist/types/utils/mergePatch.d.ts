/**
 * Computes a JSON Merge Patch (RFC 7396) that, when deep-merged into `current`,
 * produces `desired`. Keys present in `current` but absent from `desired`
 * receive `null` in the patch (RFC 7396 null-delete semantics).
 *
 * Used to express *replace* semantics through a merge endpoint: the SDK
 * holds the current resource state locally, the consumer passes the desired
 * state, and we send the diff that makes the server side end up at the
 * desired state.
 *
 * Behaviour:
 *  - both plain objects: recurse; emit only keys whose value changes
 *  - `desired === null`: returned verbatim (caller decides what null means)
 *  - any other type mismatch: `desired` is returned (full replace at that node)
 */
export declare function computeMergePatch(current: unknown, desired: unknown): unknown;
