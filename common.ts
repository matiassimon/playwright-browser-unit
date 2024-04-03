export type TestBody = () => void | Promise<void>;

export const PBU_OBJECT_KEY = "PBUObject";

export class PBUObject {
  tests: Map<string, TestBody> = new Map<string, TestBody>();
}
