/**
 * `useMutation` for fixture pages: every call resolves to null. It also has
 * `withOptimisticUpdate`, which the starring buttons chain onto it; there's no
 * local store to update, so it returns the same mutation.
 */
export function useMutation() {
  const mutation = async () => null;
  return Object.assign(mutation, { withOptimisticUpdate: () => mutation });
}
