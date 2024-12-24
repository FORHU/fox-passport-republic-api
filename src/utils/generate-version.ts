import { execSync } from "child_process";

import packageJson from "../../package.json";

export const getVersionString = (): string => {
  const version = packageJson.version;
  let commitHash = "unknown";
  try {
    commitHash = execSync("git rev-parse --short HEAD").toString().trim();
  } catch (error) {
    console.error("Error fetching commit hash:", error);
  }

  return `v${version}-${commitHash}`;
};
