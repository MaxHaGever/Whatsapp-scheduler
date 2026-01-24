export type Lang = "he" | "ru";

export type UserState = {
  lang: Lang;
  stage: "new" | "awaiting_request" | "awaiting_slot_choice";
};

const stateByUser = new Map<string, UserState>();

export function getUserState(userId: string): UserState {
  return stateByUser.get(userId) ?? { lang: "he", stage: "new" };
}

export function setUserState(userId: string, patch: Partial<UserState>) {
  const current = getUserState(userId);
  stateByUser.set(userId, { ...current, ...patch });
}

export function clearUserState(userId: string) {
  stateByUser.delete(userId);
}
