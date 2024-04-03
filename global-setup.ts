import { chromium, Page, type FullConfig } from "@playwright/test";
import Mustache from "mustache";
import path from "node:path";
import fs from "node:fs/promises";
import { PBUObject, PBU_OBJECT_KEY } from "./common";
import { PBUOptions, SourceMap } from ".";

const getTestTitles = async (page: Page) => {
  return await page.evaluate((PBU_OBJECT_KEY: string) => {
    const PBUObj = (window as any)[PBU_OBJECT_KEY];

    if (!(PBUObj.constructor.name === "PBUObject")) {
      return [];
    }

    return Array.from((PBUObj as PBUObject).tests.keys());
  }, PBU_OBJECT_KEY);
};

const getSourceMaps = async (page: Page, sourceMaps: SourceMap[]) => {
  const client = await page.context().newCDPSession(page);
  await client.send("Debugger.enable");
  client.on("Debugger.scriptParsed", (payload) => {
    if (
      payload.url &&
      !payload.url.includes("/node_modules/") &&
      payload.sourceMapURL
    ) {
      sourceMaps.push({
        url: payload.url,
        sourceMapUrl: payload.sourceMapURL,
      });
    }
  });
};

const generateBrowserUnitTestFile = async (
  templateFile: string,
  testFile: string,
  view: any
) => {
  const header = `/*
  This file was automatically generated by "playwright-browser-unit".
  Any modifications made to this file may be overwritten.
*/`;
  const template = await fs.readFile(templateFile, "utf8");
  const output = Mustache.render(template, view);
  await fs.writeFile(testFile, `${header}\n${output}`);
};

const getTestFile = (config: FullConfig<PBUOptions>) => {
  const testFile =
    config.projects[0].use.pbuTestFile || "browser-unit.test.ts";
  return path.isAbsolute(testFile)
    ? testFile
    : path.resolve(config.projects[0].testDir, testFile);
};

const getPBUOptions = (config: FullConfig<PBUOptions>): PBUOptions => {
  return {
    pbuURL: config.projects[0].use.pbuURL || "http://localhost:3000",
    pbuTestFile: getTestFile(config),
  };
};

async function globalSetup(config: FullConfig<PBUOptions>) {
  // get playwright-browser-unit options with default values
  const pbuOptions = getPBUOptions(config);

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // source maps are stored in this variable when pbuURL is loaded
  const sourceMaps: SourceMap[] = [];
  getSourceMaps(page, sourceMaps);
  
  await page.goto(pbuOptions.pbuURL);
  
  // get the test titles from the PBUObject in the page enviroment
  const testTitles = await getTestTitles(page);
  
  // view used for expanding the mustache template
  const view = {
    testTitles,
    sourceMaps: sourceMaps,
  };

  // reads the template, render it, and save the test file
  await generateBrowserUnitTestFile(
    path.join(__dirname, "browser-unit.test.in"),
    pbuOptions.pbuTestFile,
    view
  );
}

export default globalSetup;