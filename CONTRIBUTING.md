# Contributing

InboxKey is a source-available project under the PolyForm Noncommercial 1.0.0 License. Contributions are welcome.

## Before you start

- Read [`development.md`](extension/development.md) for build commands and project structure.
- All data processing must stay local. No external API calls, no telemetry, no transmission of user data.
- Do not report security vulnerabilities through public issues. See [SECURITY.md](SECURITY.md).

## Pull requests

1. Branch from `main`.
2. Verify `npm run build` and `npm run type-check` pass from the `extension/` directory.
3. Open a PR against `main` with a clear description of what changed and why.

## License

By submitting a pull request, you agree that your contribution is licensed under the [PolyForm Noncommercial 1.0.0 License](LICENSE).
