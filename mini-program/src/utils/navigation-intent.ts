/** Platform-independent navigation rule, kept separate for unit tests. */
export const shouldNavigateBack = (stackLength: number) => stackLength > 1;
