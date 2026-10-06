@AGENTS.md

## Claude Code specifics

- **To build a game, use the `make-game` skill.** User slash commands: `/playtest <slug>`, `/polish <slug>`, `/ship <slug>`. Phaser API questions: the `phaser4` skill.
- A PostToolUse hook (`scripts/hooks/typecheck.mjs`, configured in `.claude/settings.json`) type-checks after every `.ts` edit and feeds errors back. Fix them before moving on.
