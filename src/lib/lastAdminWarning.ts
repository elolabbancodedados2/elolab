export function shouldWarnAboutLastAdmin(input: {
  userLinked: boolean;
  currentActive: boolean | null;
  currentRoles: readonly string[];
  nextActive: boolean;
  nextRoles: readonly string[];
}): boolean {
  return input.userLinked
    && input.currentActive === true
    && input.currentRoles.includes('admin')
    && (!input.nextActive || !input.nextRoles.includes('admin'));
}
