#!/bin/bash
# Test bridge.ping manually

# Create test JSON request
REQUEST='{"v":1,"id":"test-1","method":"bridge.ping","params":{}}'
LENGTH=${#REQUEST}

# Convert length to little-endian 4-byte hex
printf '%08x' $LENGTH | sed 's/\(..\)\(..\)\(..\)\(..\)/\\x\4\\x\3\\x\2\\x\1/' | xargs printf

# Output the JSON
printf '%s' "$REQUEST"
