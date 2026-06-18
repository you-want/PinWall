#!/bin/bash
# PinWall Test Runner
# Usage: ./scripts/test.sh [command]
# Commands:
#   unit        - Run frontend unit tests (Vitest)
#   rust        - Run Rust backend tests (Cargo test)
#   e2e         - Run Playwright E2E tests
#   all         - Run all tests (unit + rust + e2e)
#   coverage    - Run frontend tests with coverage report
#   help        - Show this help message

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

case "${1:-all}" in
  unit)
    echo "=== Running frontend unit tests ==="
    cd "$PROJECT_DIR"
    pnpm test:run
    ;;
  rust)
    echo "=== Running Rust backend tests ==="
    cd "$PROJECT_DIR/src-tauri"
    cargo test
    ;;
  e2e)
    echo "=== Running Playwright E2E tests ==="
    cd "$PROJECT_DIR"
    npx playwright test
    ;;
  all)
    echo "=== Running all tests ==="
    cd "$PROJECT_DIR"
    pnpm test:run
    cd src-tauri
    cargo test
    echo "=== All tests passed ==="
    ;;
  coverage)
    echo "=== Running tests with coverage ==="
    cd "$PROJECT_DIR"
    pnpm test:coverage
    ;;
  help|--help|-h)
    echo "PinWall Test Runner"
    echo ""
    echo "Usage: ./scripts/test.sh [command]"
    echo ""
    echo "Commands:"
    echo "  unit        Run frontend unit tests (Vitest)"
    echo "  rust        Run Rust backend tests (Cargo test)"
    echo "  e2e         Run Playwright E2E tests"
    echo "  all         Run all tests (unit + rust)"
    echo "  coverage    Run frontend tests with Istanbul coverage"
    echo "  help        Show this help message"
    ;;
  *)
    echo "Unknown command: $1"
    echo "Run './scripts/test.sh help' for usage."
    exit 1
    ;;
esac
