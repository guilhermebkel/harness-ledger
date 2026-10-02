# Analysis script in Node/TypeScript, not Python

The bottleneck is reading files and parsing JSON, where Node is at least as fast as standard Python; the real gains come from streaming line by line, an incremental cache keyed by mtime and size, and parsing files in parallel. Node is guaranteed wherever Claude Code runs; Python is not.

Revisit if the analysis gets slow on a real history even with the cache, or if v2 needs heavier statistics. Python would then be an optional step using only the standard library, with a warning when it is missing.
