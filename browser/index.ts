import { PBUObject, PBU_OBJECT_KEY, TestBody } from "../common";
export { default as expect } from "@storybook/expect";

declare global {
  interface Window {
    [PBU_OBJECT_KEY]?: PBUObject;
  }
}

export const test = (title: string, body: TestBody) => {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof window[PBU_OBJECT_KEY] === "undefined") {
    window[PBU_OBJECT_KEY] = new PBUObject();
  }

  window[PBU_OBJECT_KEY].tests.set(title, body);

  return true;
};
