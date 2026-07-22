#!/usr/bin/env bash
# download-portable-python.sh — Fetch and prepare a standalone Python distribution for macOS arm64.
#
# Usage:
#   cd dependencies/darwin_arm64 && ./download-portable-python.sh
#
# Output: Creates ./portable-python-<VERSION>/ with Python + required pip packages.
# This directory is symlinked by build-mac.sh into mac-deps/portable-python and
# bundled into the .app via electron-builder extraFiles.

set -euo pipefail
cd "$(dirname "$0")"

# ── Atomic configuration ────────────────────────────────────────────────
# Source-of-truth values. Derived values (PYTHON_ARCHIVE, PYTHON_URL) are
# computed from these so they can never get out of sync.

PYTHON_DIR_NAME="portable-python"
PYTHON_VERSION="3.14.6"
PYTHON_BUILD_TAG="20260610"
PYTHON_TRIPLE="aarch64-apple-darwin"
PYTHON_SHA256="953db72ff2dea68b5112231b1ba77163ec9114f87c7ece530b3ea742a3b492c5"

# ── Derived configuration ───────────────────────────────────────────────

PYTHON_ARCHIVE="cpython-${PYTHON_VERSION}+${PYTHON_BUILD_TAG}-${PYTHON_TRIPLE}-install_only.tar.gz"
PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${PYTHON_BUILD_TAG}/${PYTHON_ARCHIVE}"
PYTHON_DIR="${PYTHON_DIR_NAME}-${PYTHON_VERSION}"

# pip package versions and wheel hashes (pure Python, installed via host interpreter)
PYSERIAL_VERSION="3.5"
PYSERIAL_WHEEL_SHA256="c4451db6ba391ca6ca299fb3ec7bae67a5c55dde170964c7a14ceefec02f2cf0"
SETUPTOOLS_VERSION="83.0.0"
SETUPTOOLS_WHEEL_SHA256="29b23c360f22f414dc7336bb39178cc7bcbf6021ed2733cde173f09dba19abb3"

# ── Output directory ────────────────────────────────────────────────────

PORTABLE="$(pwd -P 2>/dev/null)/${PYTHON_DIR}"

# ── Helpers ─────────────────────────────────────────────────────────────

sha256() {
  if command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# ── Safety check ────────────────────────────────────────────────────────
# Refuse to overwrite an existing non-empty directory. If you need to rebuild,
# delete the directory manually first.

if [ -d "$PORTABLE" ]; then
    if [ -n "$(ls -A "${PORTABLE}" 2>/dev/null)" ]; then
        echo "Error: ${PORTABLE} already exists and is not empty." >&2
        exit 1
    fi
fi

# ── Staging setup ───────────────────────────────────────────────────────
# Each tool is prepared inside a staging directory on the same filesystem and
# moved to its final location as the last step, so a failed or interrupted run
# never leaves a partial directory behind that a retry would then skip.

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
STAGING="$(mktemp -d "${PWD}/.staging.XXXXXX")"
trap 'rm -rf "$TMP_DIR" "$STAGING"' EXIT

# ── Download and verify ─────────────────────────────────────────────────

echo "▶ Downloading Python ${PYTHON_VERSION} (${PYTHON_TRIPLE})..."

ARCHIVE="${TMP_DIR}/${PYTHON_ARCHIVE}"
curl -fL --retry 3 -o "$ARCHIVE" "$PYTHON_URL" >&2

ACTUAL_SHA256="$(sha256 "$ARCHIVE")"
if [ "$ACTUAL_SHA256" != "$PYTHON_SHA256" ]; then
    echo "Error: SHA256 mismatch for ${PYTHON_ARCHIVE}" >&2
    echo "  Expected: ${PYTHON_SHA256}" >&2
    echo "  Actual:   ${ACTUAL_SHA256}" >&2
    exit 1
fi
echo "   Checksum verified"

# ── Extract and install pip packages ────────────────────────────────────

tar xzf "$ARCHIVE" -C "$STAGING"

# pyserial is required for serial port flashing, setuptools provides the
# distutils shim required by PlatformIO on Python >= 3.12. Both are pure
# Python wheels, so any host interpreter can install them into the bundle.
cat > "${TMP_DIR}/requirements.txt" <<EOF
pyserial==${PYSERIAL_VERSION} --hash=sha256:${PYSERIAL_WHEEL_SHA256}
setuptools==${SETUPTOOLS_VERSION} --hash=sha256:${SETUPTOOLS_WHEEL_SHA256}
EOF

python3 -m pip install --quiet --no-compile --no-deps --require-hashes \
  --target "${STAGING}/python/lib/python${PYTHON_VERSION%.*}/site-packages" \
  --requirement "${TMP_DIR}/requirements.txt"

# ── Move to final location ──────────────────────────────────────────────

mv "${STAGING}/python" "$PORTABLE"
echo "✓ Installed Python ${PYTHON_VERSION} to ${PYTHON_DIR}"
