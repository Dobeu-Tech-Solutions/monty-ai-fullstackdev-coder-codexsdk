#!/bin/bash

# Authentication Test Script
# Manual testing of authentication flow
# Run this script to verify authentication works as expected

echo "🧪 Authentication Test Suite"
echo "=============================="
echo ""

# Test 1: Check if montyx command is available
echo "Test 1: Verify montyx command is available"
if ! command -v montyx &> /dev/null; then
    echo "✗ montyx command not found"
    echo "  Please run: npm link (for local development) or npm install -g monty-autonomous-fullstack-dev-multillm"
    echo "  Then use: montyx --help"
    exit 1
fi
echo "✓ montyx command found"
echo ""

# Test 2: Check authentication status
echo "Test 2: Check current authentication status"
montyx whoami
echo ""

# Test 3: Prompt user to test login flow
read -p "Would you like to test the login flow? (y/N): " test_login
if [[ $test_login =~ ^[Yy]$ ]]; then
    echo ""
    echo "Test 3: Testing login flow"
    echo "  Please follow the prompts..."
    montyx logout
    montyx login

    if [ $? -eq 0 ]; then
        echo "✓ Login successful"
    else
        echo "✗ Login failed"
        exit 1
    fi
    echo ""
fi

# Test 4: Verify authentication after login
echo "Test 4: Verify authentication status after login"
montyx whoami
if [ $? -eq 0 ]; then
    echo "✓ Authentication verified"
else
    echo "✗ Authentication check failed"
    exit 1
fi
echo ""

# Test 5: Test agent execution with valid credentials
read -p "Would you like to test agent execution? (y/N): " test_agent
if [[ $test_agent =~ ^[Yy]$ ]]; then
    echo ""
    echo "Test 5: Testing agent execution"
    echo "  Creating temporary test directory..."

    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"

    echo "  Running agent in: $TEST_DIR"
    montyx init --spec="Build a simple counter app with React"

    if [ $? -eq 0 ]; then
        echo "✓ Agent executed successfully"
    else
        echo "✗ Agent execution failed"
        cd -
        rm -rf "$TEST_DIR"
        exit 1
    fi

    cd -
    rm -rf "$TEST_DIR"
    echo ""
fi

echo "✓ All tests completed!"
echo ""
echo "Manual verification checklist:"
echo "  [ ] Credentials stored in ~/.monty/credentials.json"
echo "  [ ] File permissions are secure (0600 on Unix, restricted on Windows)"
echo "  [ ] montyx whoami shows correct authentication method"
echo "  [ ] Agent can start and make API calls"
echo "  [ ] Token expiration is displayed correctly"
echo ""
