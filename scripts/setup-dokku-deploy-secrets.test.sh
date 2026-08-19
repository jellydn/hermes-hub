#!/usr/bin/env bash

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT="$SCRIPT_DIR/setup-dokku-deploy-secrets.sh"

fail() {
	printf 'FAIL: %s\n' "$*" >&2
	exit 1
}

assert_contains() {
	grep -Fq -- "$1" "$2" || fail "Expected '$1' in $2"
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
	"secret set") cat >"$TEST_DIR/$3.stdin" ;;
	"secret list") printf '%s\n' "${TEST_SECRET_LIST:-}" ;;
	"run view")
		if [[ " $* " == *" --json workflowName,status,conclusion "* ]]; then
			printf 'Deploy\tcompleted\tfailure\n'
		fi
		;;
esac
EOF

cat >"$test_dir/bin/ssh-keygen" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

if [[ " $* " == *" -y "* ]]; then
	printf 'ssh-ed25519 test-public-key\n'
	exit 0
fi

key_path=""
while (($# > 0)); do
	if [[ "$1" == "-f" ]]; then
		key_path="$2"
		break
	fi
	shift
done
[[ -n "$key_path" ]]
printf '%s\n' 'test-private-key-fixture' >"$key_path"
printf '%s\n' 'ssh-ed25519 test-public-key github-actions:test' >"$key_path.pub"
EOF

cat >"$test_dir/bin/ssh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'ssh' >>"$TEST_COMMAND_LOG"
printf ' %q' "$@" >>"$TEST_COMMAND_LOG"
printf '\n' >>"$TEST_COMMAND_LOG"

if [[ " $* " == *" dokku@dokku.example.test version "* ]]; then
	[[ -f "$TEST_DIR/deploy-key-authorized" ]]
	exit
fi

if [[ " $* " == *" ssh-keys:remove "* ]]; then
	rm -f "$TEST_DIR/deploy-key-authorized"
	exit 0
fi

if [[ " $* " == *" ssh-keys:add "* ]]; then
	cat >"$TEST_DIR/installed-public-key"
	touch "$TEST_DIR/deploy-key-authorized"
fi
EOF

chmod +x "$test_dir/bin/gh" "$test_dir/bin/ssh" "$test_dir/bin/ssh-keygen"
export PATH="$test_dir/bin:$PATH"
export TEST_COMMAND_LOG="$test_dir/commands.log"
export TEST_DIR="$test_dir"
export TEST_SECRET_LIST="DOKKU_SSH_PORT"

bash -n "$SCRIPT"
output="$test_dir/output.log"
deploy_key="$test_dir/generated/deploy-key"
"$SCRIPT" \
	--host dokku.example.test \
	--admin-user deploy-admin \
	--deploy-key "$deploy_key" \
	--rerun 32192213112 >"$output"

[[ -f "$deploy_key" && -f "$deploy_key.pub" ]] || fail "Dedicated key pair was not generated"
cmp -s "$deploy_key" "$test_dir/DOKKU_SSH_PRIVATE_KEY.stdin" || fail "Private key was not passed unchanged over stdin"
cmp -s "$deploy_key.pub" "$test_dir/installed-public-key" || fail "Public key was not installed unchanged"
[[ "$(cat "$test_dir/DOKKU_HOST.stdin")" == "dokku.example.test" ]] || fail "Unexpected DOKKU_HOST value"
assert_contains "deploy-admin@dokku.example.test dokku version" "$TEST_COMMAND_LOG"
assert_contains "ssh-keys:add hermes-hub-github-actions" "$TEST_COMMAND_LOG"
assert_contains "gh secret delete DOKKU_SSH_PORT --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
assert_contains "gh run rerun 32192213112 --failed --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
assert_contains "gh run watch 32192213112 --exit-status --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
if grep -Fq 'test-private-key-fixture' "$output" "$TEST_COMMAND_LOG"; then
	fail "Private key material was logged"
fi

# A second run reuses the local key and already-authorized remote key without reinstalling it.
: >"$TEST_COMMAND_LOG"
export TEST_SECRET_LIST=""
"$SCRIPT" --host dokku.example.test --admin-user deploy-admin --deploy-key "$deploy_key" >"$output"
if grep -Fq 'ssh-keys:add' "$TEST_COMMAND_LOG"; then
	fail "An already-working deployment key was reinstalled"
fi
assert_contains "already installed; leaving remote keys unchanged" "$output"

# Non-default ports are stored explicitly instead of deleting the override.
: >"$TEST_COMMAND_LOG"
"$SCRIPT" --host dokku.example.test --port 2222 --deploy-key "$deploy_key" >"$output"
[[ "$(cat "$test_dir/DOKKU_SSH_PORT.stdin")" == "2222" ]] || fail "Non-default port was not stored"
assert_contains "gh secret set DOKKU_SSH_PORT --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"

# Missing host input fails before any remote or secret mutation.
: >"$TEST_COMMAND_LOG"
if env -u DOKKU_HOST "$SCRIPT" --deploy-key "$deploy_key" >"$output" 2>&1; then
	fail "Missing host input should fail"
fi
if grep -Eq 'ssh |secret set' "$TEST_COMMAND_LOG"; then
	fail "Missing host input caused a remote or secret mutation"
fi

printf 'Dokku deploy setup script tests passed.\n'
