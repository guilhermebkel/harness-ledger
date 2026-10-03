# Costs count what a change would save, until it worked, and never twice

A cost tells the person how much a problem took from them, so it has to measure what fixing it would give back. Three choices follow, detailed in `docs/cost-model.md`:

- **Until it worked.** A failure costs the whole chain: from the first failed call until a call doing the same job worked, with the reasoning, looking around and fixes in between. Counting only the agent's first reaction (the previous model) left out most of what a wrong command costs.
- **Avoidable work, not total work.** A repeated workflow costs what a script would save: the messages around the steps, without the steps' own runs and without the one call the script still takes. Loaded material costs its carry, the cached input it adds to every later message, because that is what trimming or splitting it saves.
- **Nothing twice.** Failure chains are counted first; a corrected turn leaves out what they already counted. Fix loops (the same check rerun after fixing the code) are kept apart from failures in the totals, since fixing is work, not waste.

Each signal states its method and whether its number is a lower bound, an upper bound or an estimate, so the report can say "at least", "at most" or "about".

## Considered Options

- Reaction-only failure cost: rejected. Cheap and simple, but it undercounted chains of several attempts and ignored diagnosis.
- Counting a chain's cost once, on its first failure's signal: rejected. A chain often mixes signals (`npm test`, then `npx jest`); sharing the cost keeps each signal's number meaningful and the totals exact.
- Pricing carry at the full input price: rejected. Providers cache repeated context; cached input is cheaper, and pricing it as fresh input would overstate the saving.
