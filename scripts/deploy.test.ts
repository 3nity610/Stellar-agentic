import { expect } from "chain";
import { describe, it } from "mocha";

import {
  buildEnvBlock,
  buildPlan,
  defaultConfig,
  parseArgs,
  renderDeploymentReport,
  type DeployConfig,
  type DeployPlan,
} from "./deploy";

describe("scripts/deploy", () => {
  describe("parseArgs", () => {
    it("returns the default config when no arguments are provided", () => {
      expect(parseArgs([])).to.deep.equal(defaultConfig);
    });

    it("parses network, dry-run and output flags", () => {
      const config = parseArgs([
        "--network",
        "goerli",
        "--dry-run",
        "--output",
        "deployments/goerli.json",
        "--env-output",
        ".env.goerli",
      ]);

      expect(config.network).to.equal("goerli");
      expect(config.dryRun).to.equal(true);
      expect(config.output).to.equal("deployments/goerli.json");
      expect(config.envOutput).to.equal(".env.goerli");
    });

    it("supports the --network=value form", () => {
      const config = parseArgs(["--network=sepolia"]);
      expect(config.network.to.equal("sepolia");
    });

    it("throws on an unknown flag", () => {
      expect(() => parseArgs(["--nope"])).to.throw();
    });

    it("throws when a flag requiring a value is missing its value", () => {
      expect(() => parseArgs(["--network"])).to.throw();
    });
  });

  describe("buildPlan", () => {
    const config: DeployConfig = {
      ...defaultConfig,
      network: "goerli",
    };

    it("produces the expected deployment order", () => {
      const plan = buildPlan(config);
      expect(plan.order).to.deep.equal([
        "TokenFactory",
        "Registry",
        "Resolver",
        "Router",
        "PoolFactory",
        "Pool",
        "Governance",
      ]);
    });

    it("wires every contract after it is deployed", () => {
      const plan = buildPlan(config);
      const deployedNames = new Set<string>();

      for (const step of plan.steps) {
        for (const wire of step.wiring) {
          expect(deployedNames.has(wire.target)).to.equal(
            true,
            `${wire.target} must be deployed before ${step.name} wires it`,
          );
        }
        deployedNames.add(step.name);
      }
    });

    it("records the address of every deployed contract", () => {
      const plan = buildPlan(config);
      const names = plan.steps.map((step) => step.name);
      expect(new Set(names).size).to.equal(names.length);
      expect(names).to.deep.equal(plan.order);
    });
  });

  describe("buildEnvBlock", () => {
    it("renders a single block of NETWORK_NAME=address lines", () => {
      const block = buildEnvBlock({
        TokenFactory: "0x0000000000000000000000000000000000000001",
        Registry: "0x0000000000000000000000000000000000000002",
      });

      expect(block).to.equal(
        [
          "TOKEN_FACTORY=0x0000000000000000000000000000000000000001",
          "REGISTRY=0x0000000000000000000000000000000000000002",
        ].join("\n"),
      );
    });

    it("sorts entries for deterministic output", () => {
      const block = buildEnvBlock({
        Registry: "0x0000000000000000000000000000000000000002",
        TokenFactory: "0x0000000000000000000000000000000000000001",
      });

      expect(block.split("\n")).to.deep.equal([
        "REGISTRY=0x0000000000000000000000000000000000000002",
        "TOKEN_FACTORY=0x00000000000000000000000000000000000000001",
      ]);
    });
  });

  describe("renderDeploymentReport", () => {
    const plan: DeployPlan = buildPlan({ ...defaultConfig, network: "goerli" });
    const addresses = {
      TokenFactory: "0x0000000000000000000000000000000000000001",
      Registry: "0x0000000000000000000000000000000000000002",
    } as Record<string, string>;

    it("produces valid JSON with the expected shape", () => {
      const json = renderDeploymentReport(plan, addresses);
      const parsed = JSON.parse(json) as {
        network: string;
        order: string[];
        contracts: Record<string, string>;
      };

      expect(parsed.network).to.equal("goerli");
      expect(parsed.order).to.deep.equal(plan.order);
      expect(parsed.contracts.TokenFactory).to.equal(addresses.TokenFactory);
      expect(parsed.contracts.Registry).to.equal(addresses.Registry);
    });

    it("emits an env block that matches the addresses", () => {
      const json = renderDeploymentReport(plan, addresses);
      const parsed = JSON.parse(json) as { envBlock: string };

      expect(parsed.envBlock).to.equal(buildEnvBlock(addresses));
    });
  });
});
