#!/bin/bash

# SKALE Plugin Test Runner
# This script provides easy commands to run various test configurations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if bun is installed
if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed. Please install it first:"
    echo "npm install -g bun"
    exit 1
fi

# Print usage information
usage() {
    echo "SKALE Plugin Test Runner"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  all              Run all tests"
    echo "  getBalance       Run GetBalance action tests"
    echo "  swap             Run Swap action tests"
    echo "  transfer         Run Transfer action tests"
    echo "  coverage         Run all tests with coverage"
    echo "  watch            Run tests in watch mode"
    echo "  verbose          Run all tests with verbose output"
    echo "  help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 all"
    echo "  $0 getBalance"
    echo "  $0 coverage"
}

# Navigate to the plugin root directory
cd "$(dirname "$0")/.."

# Parse command line arguments
case "${1:-all}" in
    "all")
        print_status "Running all SKALE plugin tests..."
        bun test tests/
        print_success "All tests completed!"
        ;;
    
    "getBalance")
        print_status "Running GetBalance action tests..."
        bun test tests/getBalance.test.ts
        print_success "GetBalance tests completed!"
        ;;
    
    "swap")
        print_status "Running Swap action tests..."
        bun test tests/swap.test.ts
        print_success "Swap tests completed!"
        ;;
    
    "transfer")
        print_status "Running Transfer action tests..."
        bun test tests/transfer.test.ts
        print_success "Transfer tests completed!"
        ;;
    
    "coverage")
        print_status "Running all tests with coverage..."
        bun test tests/ --coverage
        print_success "Coverage tests completed!"
        ;;
    
    "watch")
        print_status "Running tests in watch mode..."
        print_warning "Press Ctrl+C to stop watching"
        bun test tests/ --watch
        ;;
    
    "verbose")
        print_status "Running all tests with verbose output..."
        bun test tests/ --verbose
        print_success "Verbose tests completed!"
        ;;
    
    "help"|"-h"|"--help")
        usage
        ;;
    
    *)
        print_error "Unknown command: $1"
        echo ""
        usage
        exit 1
        ;;
esac
