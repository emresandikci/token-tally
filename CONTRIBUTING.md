# Contributing

Thanks for contributing to token-tally.

## Development Setup

1. Install dependencies:

```bash
bun install
```

2. Run locally:

```bash
bun run src/cli.ts . --model gpt-4o
```

3. Run checks before opening a PR:

```bash
bun run typecheck
bun test
bun run build
```

## Branch and Commit Style

- Create focused branches for each change.
- Keep commits small and atomic.
- Use clear commit messages (Conventional Commits are preferred):

Examples:

- `feat(cli): add interactive model picker`
- `fix(scanner): respect exclude glob precedence`
- `docs(readme): clarify offline pricing behavior`

## Pull Request Guidelines

- Explain the problem and the solution clearly.
- Link related issues (for example: `Closes #12`).
- Include tests for behavior changes when possible.
- Update docs when flags, outputs, or workflows change.

## Testing Expectations

- New features should include tests when practical.
- Bug fixes should include a regression test when possible.
- Avoid flaky tests and network-only tests.

## Scope

Contributions are welcome for:

- Tokenization accuracy improvements
- Pricing data reliability and caching behavior
- Scanner correctness and performance
- CLI usability and DX
- Documentation and examples

For major architectural changes, please open an issue first to discuss design and scope.
