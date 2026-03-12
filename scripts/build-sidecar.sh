#!/bin/bash
# ============================================================================
# build-sidecar.sh
# 将 Node.js 网关打包为单文件二进制 + 复制 cloudflared，供 Tauri 打包使用。
# 输出到 src-tauri/binaries/，文件名包含 Tauri 平台三元组后缀。
# ============================================================================

set -e

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   OpenClawAnywhere Sidecar Build Script      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ─── 检测 pkg ────────────────────────────────────────────────────────────────

if ! command -v pkg &> /dev/null; then
  echo "[build] pkg 未安装，正在安装 @yao-pkg/pkg..."
  npm install -g @yao-pkg/pkg
fi

# ─── 检测平台三元组 ──────────────────────────────────────────────────────────

OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) TARGET="node18-macos-arm64"; TRIPLE="aarch64-apple-darwin" ;;
      *)     TARGET="node18-macos-x64";   TRIPLE="x86_64-apple-darwin" ;;
    esac
    ;;
  Linux)
    case "$ARCH" in
      aarch64) TARGET="node18-linux-arm64"; TRIPLE="aarch64-unknown-linux-gnu" ;;
      *)       TARGET="node18-linux-x64";   TRIPLE="x86_64-unknown-linux-gnu" ;;
    esac
    ;;
  MINGW*|MSYS*|CYGWIN*)
    TARGET="node18-win-x64"
    TRIPLE="x86_64-pc-windows-msvc"
    ;;
  *)
    echo "[build] ❌ 不支持的操作系统: $OS"
    exit 1
    ;;
esac

OUTDIR="src-tauri/binaries"
mkdir -p "$OUTDIR"

echo "[build] 平台: $OS / $ARCH"
echo "[build] pkg target: $TARGET"
echo "[build] Tauri triple: $TRIPLE"
echo ""

# ─── Step 1: 打包 Node.js 网关 ──────────────────────────────────────────────

SIDECAR_NAME="openclaw-gateway-${TRIPLE}"

# Windows 需要 .exe 后缀
if [[ "$OS" == MINGW* ]] || [[ "$OS" == MSYS* ]] || [[ "$OS" == CYGWIN* ]]; then
  SIDECAR_NAME="${SIDECAR_NAME}.exe"
fi

echo "[Step 1/3] 打包 Node.js 网关为单文件二进制..."
pkg run.js \
  --target "$TARGET" \
  --output "$OUTDIR/$SIDECAR_NAME" \
  --compress GZip

echo "[build] ✅ Sidecar: $OUTDIR/$SIDECAR_NAME"
echo ""

# ─── Step 2: 复制 cloudflared ────────────────────────────────────────────────

echo "[Step 2/3] 复制 cloudflared 二进制..."

CLOUDFLARED_SRC=""
CLOUDFLARED_DEST="$OUTDIR/cloudflared-${TRIPLE}"

if [ -f "bin/cloudflared" ]; then
  CLOUDFLARED_SRC="bin/cloudflared"
elif [ -f "bin/cloudflared.exe" ]; then
  CLOUDFLARED_SRC="bin/cloudflared.exe"
  CLOUDFLARED_DEST="${CLOUDFLARED_DEST}.exe"
fi

if [ -n "$CLOUDFLARED_SRC" ]; then
  cp "$CLOUDFLARED_SRC" "$CLOUDFLARED_DEST"
  chmod +x "$CLOUDFLARED_DEST" 2>/dev/null || true
  echo "[build] ✅ cloudflared: $CLOUDFLARED_DEST"
else
  echo "[build] ⚠️  bin/ 下未找到 cloudflared，跳过复制。"
  echo "[build]    请先运行 'node run.js' 自动下载，或手动放入 bin/ 目录。"
fi
echo ""

# ─── Step 3: 验证产物 ───────────────────────────────────────────────────────

echo "[Step 3/3] 验证构建产物..."
echo ""

ls -lh "$OUTDIR/" | grep -v ".gitkeep"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ Sidecar 构建完成                        ║"
echo "║   接下来运行: npm run tauri:build             ║"
echo "╚══════════════════════════════════════════════╝"
echo ""