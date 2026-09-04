#!/bin/bash

BASE_URL="http://localhost:3000"

# Function to login and get cookie
login() {
    local username=$1
    local password=$2
    local cookie_file=$3
    
    curl -s -c "$cookie_file" -X POST -H "Content-Type: application/json" \
        -d "{\"username\":\"$username\",\"password\":\"$password\"}" \
        "$BASE_URL/login" > /dev/null
}

echo "--- Testing Owner (admin) ---"
login "admin" "password123" "cookie_admin.txt"
# Should succeed (200)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "cookie_admin.txt" "$BASE_URL/users")
echo "GET /users (Owner): $STATUS (Expected: 200)"

echo "--- Testing Operator (operator) ---"
login "operator" "password123" "cookie_operator.txt"
# Should succeed (200)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "cookie_operator.txt" "$BASE_URL/users")
echo "GET /users (Operator): $STATUS (Expected: 200)"

# Should fail (403) - Delete User
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE -b "cookie_operator.txt" "$BASE_URL/users/regularuser")
echo "DELETE /users/regularuser (Operator): $STATUS (Expected: 403)"

echo "--- Testing Teknisi (regularuser) ---"
login "regularuser" "password123" "cookie_teknisi.txt"
# Should fail (403)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -b "cookie_teknisi.txt" "$BASE_URL/users")
echo "GET /users (Teknisi): $STATUS (Expected: 403)"

# Cleanup
rm cookie_admin.txt cookie_operator.txt cookie_teknisi.txt
