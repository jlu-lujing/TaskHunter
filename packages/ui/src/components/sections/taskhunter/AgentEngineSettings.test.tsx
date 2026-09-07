import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@/lib/i18n";

import { AgentEngineSettings } from "./AgentEngineSettings";

const renderSettings = () =>
  renderToStaticMarkup(
    <I18nProvider>
      <AgentEngineSettings />
    </I18nProvider>,
  );

describe("AgentEngineSettings", () => {
  test("renders the engine selector with both options and the credential section", () => {
    const markup = renderSettings();
    expect(markup).toContain("data-settings-item=\"engine.selector\"");
    expect(markup).toContain("data-settings-item=\"engine.api-key\"");
    expect(markup).toContain("OpenCode CLI");
    expect(markup).toContain("Not configured");
  });

  test("shows the default builtin model ref before the server responds", () => {
    expect(renderSettings()).toContain("opencode-go/deepseek-v4-flash");
  });

  test("renders the custom providers form with anchored fields", () => {
    const markup = renderSettings();
    expect(markup).toContain("data-settings-item=\"engine.providers\"");
    // No providers configured yet: the add form renders instead of a list.
    expect(markup).toContain("Add provider");
    expect(markup).toContain("x-my-provider");
  });
});
