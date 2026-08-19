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
	"secret set")
		cat >"$TEST_DIR/$3.stdin"
		printf '%s\n' "$3" >>"$TEST_DIR/secret-names"
		;;
	"secret list")
		{
			printf '%s\n' "${TEST_SECRET_LIST:-}"
			cat "$TEST_DIR/secret-names" 2>/dev/null || true
		} | awk 'NF && !seen[$0]++'
		;;
	"workflow run") ;;
	"run list")
		if [[ "$*" == *"dokku-setup-"* ]]; then
			printf '%s\n' "${TEST_DISPATCH_RUN_ID:-987654321}"
		else
			printf '%s\n' "${TEST_COMPETING_RUN_ID:-111111111}"
		fi
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

if [[ "${TEST_ADMIN_FAILURE:-false}" == true && " $* " == *" deploy-admin@dokku.example.test dokku version "* ]]; then
	exit 1
fi

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
	exit 0
fi

if [[ " $* " == *" plugin:list "* ]]; then
	if [[ "${TEST_PLUGIN_LIST-acl}" == "none" ]]; then
		exit 0
	fi
	printf '%s\n' "${TEST_PLUGIN_LIST-acl}"
	exit 0
fi

if [[ " $* " == *" plugin:install "* ]]; then
	printf 'acl\n' >"$TEST_DIR/acl-installed"
	exit 0
fi

if [[ " $* " == *" acl:add "* ]]; then
	printf 'hermes-hub-github-actions\n' >"$TEST_DIR/acl-users"
	exit 0
fi

if [[ " $* " == *" acl:list "* ]]; then
	if [[ -f "$TEST_DIR/acl-users" ]]; then
		cat "$TEST_DIR/acl-users"
	else
		printf 'hermes-hub-github-actions\n'
	fi
	exit 0
fi

if [[ " $* " == *" dokku apps:exists "* ]]; then
	[[ "${TEST_APP_EXISTS:-false}" == true ]]
	exit
fi

if [[ " $* " == *" dokku config:get "* ]]; then
	if [[ " $* " == *" DATABASE_URL "* ]]; then
		printf '%s' "${TEST_REMOTE_DATABASE_URL:-}"
	elif [[ " $* " == *" ENCRYPTION_KEY "* ]]; then
		printf '%s' "${TEST_REMOTE_ENCRYPTION_KEY:-}"
	elif [[ " $* " == *" BETTER_AUTH_SECRET "* ]]; then
		printf '%s' "${TEST_REMOTE_BETTER_AUTH_SECRET:-}"
	elif [[ " $* " == *" BETTER_AUTH_URL "* ]]; then
		printf '%s' "${TEST_REMOTE_BETTER_AUTH_URL:-}"
	fi
	exit 0
fi
EOF

cat >"$test_dir/bin/ssh-keyscan" <<'EOF'
#!/usr/bin/env bash
host=""
for host; do :; done
printf '%s ssh-ed25519 AAAATESTKNOWNHOST\n' "$host"
EOF

chmod +x "$test_dir/bin/gh" "$test_dir/bin/ssh" "$test_dir/bin/ssh-keyscan"
export PATH="$test_dir/bin:$PATH"
export TEST_COMMAND_LOG="$test_dir/commands.log"
export TEST_DIR="$test_dir"
export TEST_DISPATCH_RUN_ID=987654321
export TEST_COMPETING_RUN_ID=111111111
export TEST_SECRET_LIST="DOKKU_SSH_PORT
DOKKU_APP
DATABASE_URL
ENCRYPTION_KEY
BETTER_AUTH_SECRET
BETTER_AUTH_URL"

bash -n "$SCRIPT"
output="$test_dir/output.log"
deploy_key="$test_dir/generated/deploy-key"
"$SCRIPT" \
	--host dokku.example.test \
	--admin-user deploy-admin \
	--deploy-key "$deploy_key" \
	--rerun 32192213112 >"$output"

[[ -f "$deploy_key" && -f "$deploy_key.pub" ]] || fail "Dedicated key pair was not generated"
derived_field_count="$(ssh-keygen -y -P "" -f "$deploy_key" | awk '{print NF}')"
[[ "$derived_field_count" -ge 3 ]] || fail "Regression setup expected ssh-keygen -y to include a comment"
cmp -s "$deploy_key" "$test_dir/DOKKU_SSH_PRIVATE_KEY.stdin" || fail "Private key was not passed unchanged over stdin"
cmp -s "$deploy_key.pub" "$test_dir/installed-public-key" || fail "Public key was not installed unchanged"
[[ "$(cat "$test_dir/DOKKU_HOST.stdin")" == "dokku.example.test" ]] || fail "Unexpected DOKKU_HOST value"
[[ "$(cat "$test_dir/DOKKU_APP.stdin")" == "hermes-hub" ]] || fail "Default DOKKU_APP was not stored"
[[ "$(cat "$test_dir/DOKKU_SSH_KNOWN_HOSTS.stdin")" == *"AAAATESTKNOWNHOST"* ]] || fail "Known hosts were not stored"
assert_contains "deploy-admin@dokku.example.test dokku version" "$TEST_COMMAND_LOG"
assert_contains "ssh-keys:add hermes-hub-github-actions" "$TEST_COMMAND_LOG"
assert_contains "acl:add hermes-hub hermes-hub-github-actions" "$TEST_COMMAND_LOG"
assert_contains "gh secret delete DOKKU_SSH_PORT --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
assert_contains "gh workflow run Deploy --repo jellydn/hermes-hub --ref main --field target=dokku --field correlation=dokku-setup-" "$TEST_COMMAND_LOG"
assert_contains "gh run watch 987654321 --exit-status --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
if grep -Fq 'run watch 111111111' "$TEST_COMMAND_LOG"; then
	fail "A competing workflow_dispatch was watched"
fi
if grep -Fq 'run rerun' "$TEST_COMMAND_LOG"; then
	fail "Newly written secrets must not be followed by gh run rerun"
fi
private_key_sample="$(sed -n '2p' "$deploy_key")"
if [[ -n "$private_key_sample" ]] && grep -Fq "$private_key_sample" "$output" "$TEST_COMMAND_LOG"; then
	fail "Private key material was logged"
fi
if [[ "$(uname -s)" == "Linux" ]]; then
	key_mode="$(stat -c %a "$deploy_key")"
else
	key_mode="$(stat -f %Lp "$deploy_key")"
fi
[[ "$key_mode" == "600" || "$key_mode" == "400" ]] || fail "Generated deploy key mode was $key_mode"

# A second run reuses the local key and already-authorized remote key without reinstalling it.
: >"$TEST_COMMAND_LOG"
export TEST_SECRET_LIST=""
"$SCRIPT" --host dokku.example.test --admin-user deploy-admin --deploy-key "$deploy_key" >"$output"
if grep -Fq 'ssh-keys:add' "$TEST_COMMAND_LOG"; then
	fail "An already-working deployment key was reinstalled"
fi
assert_contains "already installed; leaving remote keys unchanged" "$output"
assert_contains "acl:add hermes-hub hermes-hub-github-actions" "$TEST_COMMAND_LOG"

# Non-default ports are stored explicitly instead of deleting the override.
: >"$TEST_COMMAND_LOG"
"$SCRIPT" --host dokku.example.test --port 2222 --deploy-key "$deploy_key" >"$output"
[[ "$(cat "$test_dir/DOKKU_SSH_PORT.stdin")" == "2222" ]] || fail "Non-default port was not stored"
assert_contains "gh secret set DOKKU_SSH_PORT --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"

# Leading-zero default ports are decimal-normalized and still remove the override.
: >"$TEST_COMMAND_LOG"
export TEST_SECRET_LIST="DOKKU_SSH_PORT"
"$SCRIPT" --host dokku.example.test --port 022 --deploy-key "$deploy_key" >"$output"
assert_contains "ssh -p 22 " "$TEST_COMMAND_LOG"
assert_contains "gh secret delete DOKKU_SSH_PORT --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
if grep -Fq 'secret set DOKKU_SSH_PORT' "$TEST_COMMAND_LOG"; then
	fail "Normalized port 22 was stored as a non-default port"
fi

# Leading-zero non-default ports must not be parsed as octal.
: >"$TEST_COMMAND_LOG"
export TEST_SECRET_LIST=""
"$SCRIPT" --host dokku.example.test --port 08 --deploy-key "$deploy_key" >"$output"
[[ "$(cat "$test_dir/DOKKU_SSH_PORT.stdin")" == "8" ]] || fail "Leading-zero port 08 was not stored as 8"
assert_contains "ssh -p 8 " "$TEST_COMMAND_LOG"
assert_contains "gh secret set DOKKU_SSH_PORT --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"

# Explicit app names are stored in DOKKU_APP.
: >"$TEST_COMMAND_LOG"
"$SCRIPT" --host dokku.example.test --app hermes-prod --deploy-key "$deploy_key" >"$output"
[[ "$(cat "$test_dir/DOKKU_APP.stdin")" == "hermes-prod" ]] || fail "Explicit DOKKU_APP was not stored"
assert_contains "gh secret set DOKKU_APP --repo jellydn/hermes-hub" "$TEST_COMMAND_LOG"
assert_contains "acl:add hermes-prod hermes-hub-github-actions" "$TEST_COMMAND_LOG"

# Existing Dokku app config is copied into GitHub secrets and never printed.
: >"$TEST_COMMAND_LOG"
rm -f "$test_dir/DATABASE_URL.stdin"
export TEST_APP_EXISTS=true
export TEST_REMOTE_DATABASE_URL='postgres://dokku:remote-secret@10.0.0.2/hermes'
export TEST_REMOTE_ENCRYPTION_KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
export TEST_REMOTE_BETTER_AUTH_SECRET='auth-secret-from-dokku'
export TEST_REMOTE_BETTER_AUTH_URL='https://dokku.example.test'
"$SCRIPT" --host dokku.example.test --deploy-key "$deploy_key" >"$output"
[[ "$(cat "$test_dir/DATABASE_URL.stdin")" == "$TEST_REMOTE_DATABASE_URL" ]] || fail "Remote DATABASE_URL was not stored"
[[ "$(cat "$test_dir/ENCRYPTION_KEY.stdin")" == "$TEST_REMOTE_ENCRYPTION_KEY" ]] || fail "Remote ENCRYPTION_KEY was not stored"
[[ "$(cat "$test_dir/BETTER_AUTH_SECRET.stdin")" == "$TEST_REMOTE_BETTER_AUTH_SECRET" ]] || fail "Remote BETTER_AUTH_SECRET was not stored"
[[ "$(cat "$test_dir/BETTER_AUTH_URL.stdin")" == "$TEST_REMOTE_BETTER_AUTH_URL" ]] || fail "Remote BETTER_AUTH_URL was not stored"
if grep -Fq 'remote-secret' "$output" "$TEST_COMMAND_LOG"; then
	fail "Remote DATABASE_URL value was logged"
fi
assert_contains "contents hidden" "$output"
unset TEST_APP_EXISTS TEST_REMOTE_DATABASE_URL TEST_REMOTE_ENCRYPTION_KEY TEST_REMOTE_BETTER_AUTH_SECRET TEST_REMOTE_BETTER_AUTH_URL

# Ambient local DATABASE_URL is ignored so a developer .env cannot leak.
: >"$TEST_COMMAND_LOG"
rm -f "$test_dir/DATABASE_URL.stdin"
DATABASE_URL='postgresql://localhost/should-not-leak' \
	"$SCRIPT" --host dokku.example.test --deploy-key "$deploy_key" >"$output"
if [[ -f "$test_dir/DATABASE_URL.stdin" ]]; then
	fail "Ambient DATABASE_URL was stored as a GitHub secret"
fi

# Secret-valued argv flags are rejected.
: >"$TEST_COMMAND_LOG"
if "$SCRIPT" --host dokku.example.test --database-url 'postgres://dokku:flag-secret@10.0.0.3/hermes' --deploy-key "$deploy_key" >"$output" 2>&1; then
	fail "Argv DATABASE_URL should be rejected"
fi
assert_contains "exposes secrets in process arguments" "$output"
if grep -Fq 'flag-secret' "$TEST_COMMAND_LOG"; then
	fail "Rejected argv secret was logged"
fi

# File-based secrets are stored without placing the value in argv.
: >"$TEST_COMMAND_LOG"
printf '%s' 'postgres://dokku:file-secret@10.0.0.3/hermes' >"$test_dir/database-url"
"$SCRIPT" \
	--host dokku.example.test \
	--database-url-file "$test_dir/database-url" \
	--deploy-key "$deploy_key" >"$output"
[[ "$(cat "$test_dir/DATABASE_URL.stdin")" == 'postgres://dokku:file-secret@10.0.0.3/hermes' ]] || fail "File DATABASE_URL was not stored"
if grep -Fq 'file-secret' "$output" "$TEST_COMMAND_LOG"; then
	fail "File DATABASE_URL value was logged"
fi

# Admin key path uses IdentitiesOnly and BatchMode.
: >"$TEST_COMMAND_LOG"
"$SCRIPT" \
	--host dokku.example.test \
	--admin-user deploy-admin \
	--admin-key "$deploy_key" \
	--deploy-key "$deploy_key" >"$output"
assert_contains "IdentitiesOnly=yes" "$TEST_COMMAND_LOG"
assert_contains "BatchMode=yes" "$TEST_COMMAND_LOG"

# Missing ACL plugin is installed before the key is restricted.
: >"$TEST_COMMAND_LOG"
export TEST_PLUGIN_LIST=none
"$SCRIPT" --host dokku.example.test --deploy-key "$deploy_key" >"$output"
assert_contains "plugin:install https://github.com/dokku-community/dokku-acl.git acl" "$TEST_COMMAND_LOG"
unset TEST_PLUGIN_LIST

# --rerun without the remaining required Deploy secrets fails before dispatch.
: >"$TEST_COMMAND_LOG"
: >"$test_dir/secret-names"
export TEST_SECRET_LIST=""
if "$SCRIPT" --host dokku.example.test --deploy-key "$deploy_key" --rerun 32192213112 >"$output" 2>&1; then
	fail "Missing required Deploy secrets should fail"
fi
assert_contains "DATABASE_URL secret is required" "$output"
if grep -Eq 'workflow run|run rerun' "$TEST_COMMAND_LOG"; then
	fail "Workflow was started without required Deploy secrets"
fi

# Invalid app names fail before any remote or secret mutation.
: >"$TEST_COMMAND_LOG"
if "$SCRIPT" --host dokku.example.test --app 'Hermes Hub' --deploy-key "$deploy_key" >"$output" 2>&1; then
	fail "Invalid app name should fail"
fi
if grep -Eq 'ssh |secret set' "$TEST_COMMAND_LOG"; then
	fail "Invalid app name caused a remote or secret mutation"
fi

# Missing host input fails before any remote or secret mutation.
: >"$TEST_COMMAND_LOG"
if env -u DOKKU_HOST "$SCRIPT" --deploy-key "$deploy_key" >"$output" 2>&1; then
	fail "Missing host input should fail"
fi
if grep -Eq 'ssh |secret set' "$TEST_COMMAND_LOG"; then
	fail "Missing host input caused a remote or secret mutation"
fi

# Failed administrative bootstrap stops before local key generation or mutation.
: >"$TEST_COMMAND_LOG"
export TEST_ADMIN_FAILURE=true
failed_admin_key="$test_dir/admin-failure/deploy-key"
if "$SCRIPT" \
	--host dokku.example.test \
	--admin-user deploy-admin \
	--deploy-key "$failed_admin_key" >"$output" 2>&1; then
	fail "Failed administrative SSH should stop setup"
fi
[[ ! -e "$failed_admin_key" ]] || fail "Deployment key was created after administrative SSH failed"
assert_contains "Administrative SSH bootstrap failed" "$output"
if grep -Fq 'secret set' "$TEST_COMMAND_LOG"; then
	fail "Secrets were changed after administrative SSH failed"
fi

printf 'Dokku deploy setup script tests passed.\n'
