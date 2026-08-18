#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT="$SCRIPT_DIR/setup-dokku-deploy-secrets.sh"

fail() {
	printf 'FAIL: %s\n' "$*" >&2
	exit 1
}

assert_contains() {
	local expected="$1"
	local file="$2"
	grep -Fq -- "$expected" "$file" || fail "Expected '$expected' in $file"
}

test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT
mkdir -p "$test_dir/bin"

cat >"$test_dir/bin/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'gh' >>"$TEST_COMMAND_LOG"
printf ' %q' "$@" >>"$TEST_COMMAND_LOG"
printf '\n' >>"$TEST_COMMAND_LOG"

case "$1 $2" in
	"secret set")
		cat >"$TEST_DIR/$3.stdin"
		;;
	"secret list")
		printf 'DOKKU_SSH_PORT\n'
		;;
	"run view")
		if [[ " $* " == *" --json workflowName,status,conclusion "* ]]; then
			printf 'Deploy\tcompleted\tfailure\n'
		fi
		;;
esac
EOF

cat >"$test_dir/bin/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'ssh' >>"$TEST_COMMAND_LOG"
printf ' %q' "$@" >>"$TEST_COMMAND_LOG"
printf '\n' >>"$TEST_COMMAND_LOG"
EOF

cat >"$test_dir/bin/ssh-keygen" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
[[ "${TEST_REJECT_KEY:-false}" != true ]]
EOF

chmod +x "$test_dir/bin/gh" "$test_dir/bin/ssh" "$test_dir/bin/ssh-keygen"
printf '%s\n' 'mock-private-key-material' >"$test_dir/deploy-key"

export PATH="$test_dir/bin:$PATH"
export TEST_COMMAND_LOG="$test_dir/commands.log"
export TEST_DIR="$test_dir"

bash -n "$SCRIPT"
output="$test_dir/output.log"
"$SCRIPT" --key "$test_dir/deploy-key" --rerun 32192213112 >"$output"

cmp -s "$test_dir/deploy-key" "$test_dir/DOKKU_SSH_PRIVATE_KEY.stdin" || fail "Private key was not passed unchanged over stdin"
[[ "$(cat "$test_dir/DOKKU_HOST.stdin")" == "95.111.232.131" ]] || fail "Unexpected DOKKU_HOST secret value"
assert_contains "ssh -i $test_dir/deploy-key -p 22" "$TEST_COMMAND_LOG"
assert_contains "gh secret delete DOKKU_SSH_PORT --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
assert_contains "gh run rerun 32192213112 --failed --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
assert_contains "gh run watch 32192213112 --exit-status --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
if grep -Fq 'mock-private-key-material' "$output" "$TEST_COMMAND_LOG"; then
	fail "Private key material was logged"
fi

: >"$TEST_COMMAND_LOG"
export TEST_REJECT_KEY=true
if "$SCRIPT" --key "$test_dir/deploy-key" >"$output" 2>&1; then
	fail "Passphrase-protected or invalid key should be rejected"
fi
if grep -Fq 'secret set' "$TEST_COMMAND_LOG"; then
	fail "Secrets were changed after key validation failed"
fi

printf 'Dokku deploy setup script tests passed.\n'
