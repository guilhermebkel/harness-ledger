import { describe, expect, it } from "vitest";
import type { SessionFacts } from "@/Shared/Protocols/SessionProtocol.js";
import { SessionFactsBuilder } from "@/Shared/Utils/SessionFactsFixtureUtil.js";
import { AttributionService } from "./AttributionService.js";
import { FailureChainService } from "./FailureChainService.js";

const IDLE_MS = 5 * 60_000;
const MESSAGE_TOKENS = 1100;

function chainsOf(session: SessionFacts) {
  const index = new AttributionService(new Set()).buildSessionIndex(session);
  return new FailureChainService(IDLE_MS).chainsOf(session, index);
}

describe("FailureChainService", () => {
  it("costs a wrong command from the first failure until the working call is issued, with every message between", () => {
    const session = new SessionFactsBuilder()
      .call("npm test", { isError: true, runSeconds: 2 })
      .wait(10).say()
      .call("ls")
      .wait(5).call("npx jest", { isError: true })
      .wait(5).call("pnpm test", { runSeconds: 30 })
      .build();
    const [chain] = chainsOf(session);
    expect(chain?.kind).toBe("wrong_command");
    expect(chain?.failures.map((call) => call.key)).toStrictEqual(["npm test", "npx jest"]);
    expect(chain?.recovery?.key).toBe("pnpm test");
    expect(chain?.cost.activeMs).toBe(24_000);
    const usage = chain?.cost.usage;
    expect((usage?.input ?? 0) + (usage?.output ?? 0)).toBe(4 * MESSAGE_TOKENS);
  });

  it("calls rerunning the same command after fixes a fix loop", () => {
    const session = new SessionFactsBuilder()
      .call("pnpm lint", { isError: true })
      .call("Edit", { category: "edit", filePath: "src/a.ts" })
      .call("pnpm lint", { isError: true })
      .call("Edit", { category: "edit", filePath: "src/a.ts" })
      .call("pnpm lint")
      .build();
    const chains = chainsOf(session);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.kind).toBe("fix_loop");
    expect(chains[0]?.failures).toHaveLength(2);
  });

  it("chains a tool that fails on the same file until it works", () => {
    const session = new SessionFactsBuilder()
      .call("Edit", { category: "edit", filePath: "src/a.ts", isError: true })
      .call("Read", { category: "read", filePath: "src/a.ts" })
      .call("Edit", { category: "edit", filePath: "src/a.ts", isError: true })
      .call("Edit", { category: "edit", filePath: "src/a.ts" })
      .build();
    const [chain] = chainsOf(session);
    expect(chain?.failures).toHaveLength(2);
    expect(chain?.kind).toBe("retry");
  });

  it("calls the same program with other arguments a different command, not a fix loop", () => {
    const session = new SessionFactsBuilder()
      .call("python3 a.py", { isError: true })
      .call("python3 b.py")
      .build();
    session.tools.forEach((call) => {
      call.key = "python3";
    });
    expect(chainsOf(session)[0]?.kind).toBe("wrong_command");
  });

  it("doesn't let a chain reach an attempt long after, across other work", () => {
    const builder = new SessionFactsBuilder().call("AskUserQuestion", { category: "other", isError: true });
    for (let step = 0; step < 12; step++) {
      builder.call("Read", { category: "read", filePath: `src/f${step}.ts` });
    }
    const [chain] = chainsOf(builder.call("AskUserQuestion", { category: "other" }).build());
    expect(chain?.kind).toBe("unrecovered");
  });

  it("follows a blocked command to the rewritten one that passed", () => {
    const session = new SessionFactsBuilder()
      .call("rm -rf build", { isError: true, kind: "hook_blocked" })
      .call("rm -r build")
      .build();
    const [chain] = chainsOf(session);
    expect(chain?.kind).toBe("wrong_command");
    expect(chain?.recovery?.key).toBe("rm -r build");
  });

  it("closes an unrecovered chain at the reaction to its last failure when the agent moves on", () => {
    const session = new SessionFactsBuilder()
      .call("make build", { isError: true })
      .wait(20).call("make build", { isError: true })
      .wait(10).say()
      .call("git add -A")
      .build();
    const [chain] = chainsOf(session);
    expect(chain?.kind).toBe("unrecovered");
    expect(chain?.failures).toHaveLength(2);
    expect(chain?.cost.activeMs).toBe(32_000);
  });

  it("leaves idle gaps out of the time", () => {
    const session = new SessionFactsBuilder()
      .call("npm test", { isError: true })
      .wait(3600).say()
      .call("pnpm test")
      .build();
    const [chain] = chainsOf(session);
    expect(chain?.cost.activeMs).toBe(0);
  });

  it("doesn't chain plans the person rejected", () => {
    const session = new SessionFactsBuilder()
      .call("ExitPlanMode", { category: "plan", isError: true, kind: "user_rejected" })
      .build();
    expect(chainsOf(session)).toStrictEqual([]);
  });
});
