#!/usr/bin/env python
# -*- coding: utf-8 -*-
r"""
Mermaid SVG → PNG 高清转换工具（基于 Playwright / Chromium）

两种使用模式：

【1】批量模式 —— 把目录里所有 SVG 一次性转成 PNG：
    python convert_svg_to_png.py [输入目录] [-o 输出目录] [-s 缩放]
    python convert_svg_to_png.py "C:/Users/Cornex/Desktop/时序图draw/图片"
    python convert_svg_to_png.py -f diagram.svg -o ./out -s 8 -r

【2】管道模式 —— 从 stdin 读取 SVG 字符串，写到指定路径（给程序调用）：
    type in.svg | python convert_svg_to_png.py --stdin -o out.png -s 8
    # 等价于：把 SVG 内容直接喂进去
    echo "<svg>...</svg>" | python convert_svg_to_png.py --stdin -o out.png

【3】剪贴板 —— 转换后自动复制 PNG 到系统剪贴板（仅 Windows）：
    python convert_svg_to_png.py -f in.svg --clipboard
    type in.svg | python convert_svg_to_png.py --stdin --clipboard

【4】stdout 输出 base64 —— 给程序直接读 PNG：
    type in.svg | python convert_svg_to_png.py --stdin --stdout-base64 > png.b64

可选参数：
    -s, --scale N        缩放倍数（device_scale_factor），默认 8（推荐 6~10）
    -o, --output PATH    PNG 输出路径（单文件）或目录（批量）
    -r, --recursive      批量模式下递归处理子目录
    --clipboard          转换后复制到系统剪贴板
    --stdout-base64      把 PNG base64 输出到 stdout
    --no-cleanup         保留生成的临时 SVG 文件
    --quiet              只输出错误和最终汇总
"""

import os
import sys
import asyncio
import argparse
import base64
import shutil
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright

# ============== 默认配置 ==============

# 用户主目录的默认 SVG / PNG 目录
DEFAULT_DIR = r"C:\Users\Cornex\Desktop\时序图draw\图片"
DEFAULT_SCALE = 8  # 8x 已经是视网膜级，再高文件会非常大
TEMP_SVG_NAME = "_mermaid_temp_input.svg"


# ============== 参数解析 ==============

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="convert_svg_to_png",
        description="Mermaid SVG → PNG 高清转换工具（Playwright 渲染）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    # 输入：目录（位置参数，可选）
    p.add_argument(
        "input_dir", nargs="?", default=None,
        help=f"包含 SVG 的输入目录（默认：{DEFAULT_DIR}）"
    )
    # 单文件
    p.add_argument(
        "-f", "--file", type=str, default=None,
        help="转换单个 SVG 文件（优先级高于 input_dir）"
    )
    # 输出
    p.add_argument(
        "-o", "--output", type=str, default=None,
        help="PNG 输出路径：单文件模式下是文件路径，批量模式下是目录"
    )
    # 缩放
    p.add_argument(
        "-s", "--scale", type=int, default=DEFAULT_SCALE,
        help=f"缩放倍数 / device_scale_factor，默认 {DEFAULT_SCALE}"
    )
    # 递归
    p.add_argument(
        "-r", "--recursive", action="store_true",
        help="批量模式下递归处理子目录里的 SVG"
    )
    # 管道模式
    p.add_argument(
        "--stdin", action="store_true",
        help="从 stdin 读取 SVG 字符串（管道模式）"
    )
    # 剪贴板
    p.add_argument(
        "--clipboard", action="store_true",
        help="转换完成后把 PNG 复制到系统剪贴板（仅 Windows）"
    )
    # stdout base64
    p.add_argument(
        "--stdout-base64", action="store_true",
        help="把 PNG 转 base64 后输出到 stdout（程序集成用）"
    )
    # 静默
    p.add_argument(
        "--quiet", action="store_true",
        help="只输出错误和最终汇总"
    )
    # 保留临时文件
    p.add_argument(
        "--no-cleanup", action="store_true",
        help="保留生成的临时 SVG 文件（调试用）"
    )
    return p.parse_args()


# ============== 核心转换逻辑 ==============

async def _render_svg_to_png_file(page, svg_file_url: str, png_path: Path) -> bool:
    """用 Playwright 把 svg_file_url 指向的 SVG 渲染并截到 png_path"""
    try:
        await page.goto(svg_file_url, wait_until="networkidle")
    except Exception:
        # 某些 SVG 无 networkidle 也无所谓，退回 load
        try:
            await page.goto(svg_file_url, wait_until="load")
        except Exception as e:
            raise RuntimeError(f"加载 SVG 失败：{e}")
    svg_el = await page.query_selector("svg")
    if not svg_el:
        raise RuntimeError("页面中未找到 <svg> 元素")
    png_path.parent.mkdir(parents=True, exist_ok=True)
    await svg_el.screenshot(path=str(png_path), omit_background=False)
    return True


async def convert_svg_string(svg_content: str, png_path: Path, scale: int) -> None:
    """把 SVG 字符串渲染成 PNG 写到 png_path"""
    # 把 SVG 写到 png_path 旁边的临时文件
    png_path.parent.mkdir(parents=True, exist_ok=True)
    temp_svg = png_path.parent / TEMP_SVG_NAME
    temp_svg.write_text(svg_content, encoding="utf-8")
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            try:
                context = await browser.new_context(device_scale_factor=scale)
                page = await context.new_page()
                url = "file:///" + str(temp_svg.resolve()).replace("\\", "/")
                await _render_svg_to_png_file(page, url, png_path)
            finally:
                await browser.close()
    finally:
        if temp_svg.exists():
            try:
                temp_svg.unlink()
            except OSError:
                pass


async def convert_svg_file(svg_path: Path, png_path: Path, scale: int) -> None:
    """把 SVG 文件渲染成 PNG 写到 png_path"""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            context = await browser.new_context(device_scale_factor=scale)
            page = await context.new_page()
            url = "file:///" + str(svg_path.resolve()).replace("\\", "/")
            await _render_svg_to_png_file(page, url, png_path)
        finally:
            await browser.close()


async def convert_batch(
    svg_paths: list[Path],
    out_dir: Path,
    scale: int,
    on_progress=None,  # callback(i, total, svg_path, png_path, ok, err)
) -> tuple[int, int]:
    """批量转换：每个 SVG 共用一个 browser 实例（提速）"""
    out_dir.mkdir(parents=True, exist_ok=True)
    success = 0
    fail = 0
    total = len(svg_paths)
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        try:
            context = await browser.new_context(device_scale_factor=scale)
            page = await context.new_page()
            for i, svg_path in enumerate(svg_paths, 1):
                png_path = out_dir / (svg_path.stem + ".png")
                err = None
                ok = False
                try:
                    url = "file:///" + str(svg_path.resolve()).replace("\\", "/")
                    await _render_svg_to_png_file(page, url, png_path)
                    ok = True
                    success += 1
                except Exception as e:
                    err = str(e)
                    fail += 1
                if on_progress:
                    on_progress(i, total, svg_path, png_path, ok, err)
        finally:
            await browser.close()
    return success, fail


# ============== 剪贴板 ==============

def copy_png_to_clipboard(png_path: Path) -> bool:
    """把 PNG 文件复制到系统剪贴板（仅 Windows）。
    需要 pip install pywin32 Pillow
    """
    if sys.platform != "win32":
        print("⚠ 剪贴板功能目前仅支持 Windows", file=sys.stderr)
        return False
    try:
        from PIL import Image
        import io
        import win32clipboard

        img = Image.open(png_path).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, "BMP")
        bmp_data = buf.getvalue()[14:]  # 去掉 BMP 文件头
        win32clipboard.OpenClipboard()
        try:
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32clipboard.CF_DIB, bmp_data)
        finally:
            win32clipboard.CloseClipboard()
        return True
    except ImportError:
        print(
            "⚠ 剪贴板功能需要：pip install pywin32 Pillow",
            file=sys.stderr,
        )
        return False
    except Exception as e:
        print(f"⚠ 剪贴板复制失败：{e}", file=sys.stderr)
        return False


# ============== 主流程 ==============

async def amain(args: argparse.Namespace) -> int:
    quiet = args.quiet

    def log(msg: str):
        if not quiet:
            print(msg)

    def log_err(msg: str):
        print(msg, file=sys.stderr)

    # ---------- 模式 1: 管道模式（stdin → 文件） ----------
    if args.stdin:
        svg_content = sys.stdin.read()
        if not svg_content or not svg_content.strip():
            log_err("✗ stdin 内容为空")
            return 2
        # 输出路径
        if args.output:
            png_path = Path(args.output)
        else:
            png_path = Path.cwd() / "output.png"
        png_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            await convert_svg_string(svg_content, png_path, args.scale)
        except Exception as e:
            log_err(f"✗ 转换失败：{e}")
            return 1
        kb = png_path.stat().st_size / 1024
        log(f"✓ 已生成：{png_path} ({kb:.1f} KB, {args.scale}x)")

        # 复制到剪贴板
        if args.clipboard:
            if copy_png_to_clipboard(png_path):
                log("📋 已复制到剪贴板")

        # stdout 输出 base64
        if args.stdout_base64:
            png_bytes = png_path.read_bytes()
            sys.stdout.write(base64.b64encode(png_bytes).decode("ascii"))
            sys.stdout.flush()
        return 0

    # ---------- 模式 2: 单文件模式 ----------
    if args.file:
        svg_path = Path(args.file)
        if not svg_path.is_file() or svg_path.suffix.lower() != ".svg":
            log_err(f"✗ 不是有效的 SVG 文件：{svg_path}")
            return 1
        if args.output:
            png_path = Path(args.output)
        else:
            png_path = svg_path.with_suffix(".png")
        try:
            await convert_svg_file(svg_path, png_path, args.scale)
        except Exception as e:
            log_err(f"✗ 转换失败：{e}")
            return 1
        kb = png_path.stat().st_size / 1024
        log(f"✓ {svg_path.name} → {png_path.name} ({kb:.1f} KB, {args.scale}x)")
        if args.clipboard:
            if copy_png_to_clipboard(png_path):
                log("📋 已复制到剪贴板")
        if args.stdout_base64:
            png_bytes = png_path.read_bytes()
            sys.stdout.write(base64.b64encode(png_bytes).decode("ascii"))
            sys.stdout.flush()
        return 0

    # ---------- 模式 3: 批量模式 ----------
    in_dir = Path(args.input_dir) if args.input_dir else Path(DEFAULT_DIR)
    if not in_dir.is_dir():
        log_err(f"✗ 目录不存在：{in_dir}")
        return 1
    pattern = "**/*.svg" if args.recursive else "*.svg"
    svgs = sorted(in_dir.glob(pattern))
    if not svgs:
        log_err(f"未在 {in_dir} 找到 SVG 文件")
        return 1
    out_dir = Path(args.output) if args.output else in_dir

    log(f"输入目录：{in_dir}")
    log(f"输出目录：{out_dir}")
    log(f"缩放倍数：{args.scale}x")
    log(f"文件数量：{len(svgs)} 个")
    log("-" * 56)

    def on_progress(i, total, svg_path, png_path, ok, err):
        if ok:
            kb = png_path.stat().st_size / 1024
            log(f"  [{i:>{len(str(total))}}/{total}] ✓ {svg_path.name}  →  {png_path.name}  ({kb:.1f} KB)")
        else:
            log(f"  [{i:>{len(str(total))}}/{total}] ✗ {svg_path.name}  ({err})")

    success, fail = await convert_batch(svgs, out_dir, args.scale, on_progress=on_progress)
    log("-" * 56)
    log(f"完成：✓ {success} 成功, ✗ {fail} 失败")
    return 0 if fail == 0 else 1


def main() -> int:
    args = parse_args()
    try:
        return asyncio.run(amain(args))
    except KeyboardInterrupt:
        print("用户中断", file=sys.stderr)
        return 130


if __name__ == "__main__":
    sys.exit(main())
