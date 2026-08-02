import type { ProjectConfigurationInput } from "../../domain/index-inputs.js";
import { readProjectConfigurationInput } from "./project-inputs.js";

const ASTRO_CONFIGURATION_PATHS = [
  "astro.config.js",
  "astro.config.mjs",
  "astro.config.cjs",
  "astro.config.ts",
  "astro.config.mts",
  "astro.config.cts"
] as const;

export interface AstroProjectEvidence {
  readonly enabled: boolean;
  readonly configurationInputs: readonly ProjectConfigurationInput[];
}

/**
 * A root Astro configuration file is explicit project evidence. Multiple
 * competing configs are deliberately ambiguous, so endpoint conventions stay
 * disabled rather than selecting an arbitrary one.
 */
export async function detectAstroProject(projectPath: string): Promise<AstroProjectEvidence> {
  const configurationInputs = await Promise.all(
    ASTRO_CONFIGURATION_PATHS.map((path) =>
      readProjectConfigurationInput(projectPath, "astro-config", path)
    )
  );

  return {
    enabled: configurationInputs.filter((input) => input.state === "present").length === 1,
    configurationInputs
  };
}
