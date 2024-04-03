import { Page } from "@playwright/test";
import { SourceMapConsumer } from "source-map-js";
import { PBUObject, PBU_OBJECT_KEY } from "./common";

export type SourceMap = {
  url: string;
  sourceMapUrl: string;
};

export type PBUOptions = {
  pbuURL: string,
  pbuTestFile: string 
}

const parseSourceMapURL = (sourceMapURL: string) => {
  const parts = sourceMapURL.split(",");
  const base64Data = parts[1];
  const jsonData = Buffer.from(base64Data, "base64").toString("utf-8");
  return JSON.parse(jsonData);
};

const processErrorMessage = (rawMessage: string) => {
  const lines = rawMessage.split("\n");
  const atIndex = lines.findIndex((line) => line.trimStart().startsWith("at "));
  const firstLines = atIndex !== -1 ? lines.slice(0, atIndex) : lines;
  return firstLines.join("\n").replace(/^page.evaluate: Error: /gi, "");
};

const processStackSource = (rawSource: string, sourcesRoot?: string) => {
  let source = rawSource;
  source = source.replace("webpack://_N_E/", "");
  const regexPattern = /(^.+?)\?(\d+)$/gi;
  const match = regexPattern.exec(source);
  if (match !== null) {
    source = match[1];
  }
  return source;
};

const processErrorStack = (rawStack: string, sourceMaps: SourceMap[]) => {
  let stack = rawStack;

  for (const sm of sourceMaps) {
    if (!stack.includes(sm.url)) {
      continue;
    }

    const escapedUrl = sm.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regexPattern = new RegExp(`(${escapedUrl}):(\\d+):(\\d+)`, "g");
    const rawSourceMap = parseSourceMapURL(sm.sourceMapUrl)
    const smc = new SourceMapConsumer(rawSourceMap);

    let match;
    while ((match = regexPattern.exec(stack)) !== null) {
      const matched = match[0];
      const line = Number(match[2]);
      const column = Number(match[3]);
      const mapped = smc.originalPositionFor({
        line,
        column,
      });
      mapped.source = processStackSource(
        mapped.source,
        rawSourceMap.sourceRoot
      );
      stack = stack.replace(
        matched,
        `${mapped.source}:${mapped.line}:${mapped.column}`
      );
    }
  }

  return stack;
};

export const processError = (rawError: any, sourceMaps: SourceMap[]) => {
  const message = rawError.message
    ? processErrorMessage(rawError.message)
    : undefined;

  const stack = rawError.stack
    ? processErrorStack(rawError.stack, sourceMaps)
    : undefined;

  const error = new Error(message);
  error.stack = stack;
  return error;
};

export const evaluateTest = async (
  page: Page,
  title: string,
  sourceMaps: SourceMap[]
) => {
  try {
    // evaluates the test body in the page enviroment
    await page.evaluate(
      ([title, PBU_OBJECT_KEY]) => {
        const PBUObj = (window as any)[PBU_OBJECT_KEY];

        if (!(PBUObj.constructor.name === "PBUObject")) {
          return [];
        }

        const body = (PBUObj as PBUObject).tests.get(title);

        if (typeof body === "undefined") {
          throw new Error(`"${title}" test body not found`);
        }

        return body();
      },
      [title, PBU_OBJECT_KEY]
    );
  } catch (error) {
    // uses the source maps loaded during the global setup to improve
    // error reporting
    throw processError(error, sourceMaps);
  }
};
