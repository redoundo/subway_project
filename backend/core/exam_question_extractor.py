
import fitz  # pymupdf
import re
import os
import platform
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

dpi : int = 300
zoom = dpi / 72
mat = fitz.Matrix(zoom, zoom)

# HTML 렌더링 좌표로의 변환에 사용할 Matrix
# pdf2htmlEX 에서 --zoom 1.3 을 사용할 예정이며,
# 1pt = 1/72 inch, CSS px 는 1in = 96px 이므로 1pt ~= 96/72 px
CSS_PX_PER_PT = 96 / 72
HTML_ZOOM = 1.3
html_mat = fitz.Matrix(HTML_ZOOM * CSS_PX_PER_PT, HTML_ZOOM * CSS_PX_PER_PT)


def _symbol_to_index(symbol: str) -> Optional[int]:
    mapping = {
        "①": 1,
        "②": 2,
        "③": 3,
        "④": 4,
        "⑤": 5,
    }
    return mapping.get(symbol)


def _rect_to_html_coords(rect: fitz.Rect) -> Tuple[float, float, float, float]:
    transformed = rect * html_mat
    x0, y0, x1, y1 = map(float, transformed)
    return x0, y0, x1, y1


def extract_questions_options_positions_by_page(pdf_path: str) -> Dict[str, Dict[str, Dict[str, Dict[str, float]]]]:
    """
    Extracts question numbers and option markers (①~⑤) with their positions for each page.

    Returns a nested dict:
    {
      "1": {                          # page number (1-based)
        "1": {                        # question number (as string)
          "1": {"x0":..,"y0":..,"x1":..,"y1":..},  # option index 1~5
          ...
        },
        ...
      },
      ...
    }

    Coordinates are scaled for pdf2htmlEX output assuming --zoom 1.3 and CSS px.
    """
    doc = fitz.open(pdf_path)

    # Patterns
    question_pattern = re.compile(r"^(\d+)\.\s")

    pages: Dict[str, Dict[str, Dict[str, Dict[str, float]]]] = {}

    for page_index in range(doc.page_count):
        page = doc.load_page(page_index)
        page_key = str(page_index + 1)
        pages[page_key] = {}

        # Track current question while scanning in reading order
        current_question: Optional[str] = None

        # Read blocks (x0, y0, x1, y1, text, block_no, block_type)
        blocks = page.get_text("blocks")
        for block in blocks:
            if len(block) < 7 or block[6] != 0:
                continue

            block_rect = fitz.Rect(block[0], block[1], block[2], block[3])
            text = block[4] or ""

            # Update current question if a new question number appears at the start of any line
            for raw_line in text.split("\n"):
                line = raw_line.strip()
                if not line:
                    continue
                q_match = question_pattern.match(line)
                if q_match:
                    current_question = q_match.group(1)
                    if current_question not in pages[page_key]:
                        pages[page_key][current_question] = {}

            # Find any option symbols present in the block text
            # We search for actual glyphs ①~⑤ anywhere in the block
            if not current_question:
                # If we haven't seen a question yet, skip options to avoid mis-association
                continue

            has_option_symbol = any(sym in text for sym in ("①", "②", "③", "④", "⑤"))
            if not has_option_symbol:
                continue

            # For each option symbol, locate its instances and keep the one inside the block
            for symbol in ("①", "②", "③", "④", "⑤"):
                if symbol not in text:
                    continue
                instances = page.search_for(symbol)
                for inst in instances:
                    # Keep only instances whose rect is within the block rect
                    if (
                        block_rect.x0 > inst.x0
                        or inst.y0 < block_rect.y0
                        or inst.x1 > block_rect.x1
                        or inst.y1 > block_rect.y1
                    ):
                        continue

                    x0, y0, x1, y1 = _rect_to_html_coords(inst)
                    opt_index = _symbol_to_index(symbol)
                    if opt_index is None:
                        continue

                    # Initialize question dict if not present (redundant safety)
                    qdict = pages[page_key].setdefault(current_question, {})
                    # Save the first good instance; if multiple, prefer the top-most (smallest y0)
                    existing = qdict.get(str(opt_index))
                    if existing is None or y0 < float(existing["y0"]):
                        qdict[str(opt_index)] = {
                            "x0": x0,
                            "y0": y0,
                            "x1": x1,
                            "y1": y1,
                        }
    doc.close()
    return pages

def convert_pdf_to_html_with_wsl(
    pdf_path: str,
    output_html_path: Optional[str] = None,
    zoom: float = HTML_ZOOM,
    embed: str = "cfijo",
) -> str:
    """
    Convert a PDF to a single self-contained HTML using pdf2htmlEX.

    - Prefers WSL on Windows. On Linux/macOS, calls pdf2htmlEX directly.
    - Embeds assets to produce a single HTML file.
    - Returns the path to the generated HTML file.
    """
    pdf_path = str(Path(pdf_path).resolve())
    if output_html_path is None:
        out_dir = tempfile.mkdtemp(prefix="pdf2html_")
        output_html_path = str(Path(out_dir) / (Path(pdf_path).stem + ".html"))
    else:
        Path(output_html_path).parent.mkdir(parents=True, exist_ok=True)

    system = platform.system().lower()
    pdf2html = shutil.which("pdf2htmlEX.AppImage")
    use_wsl = False

    if system.startswith("windows"):
        # Prefer WSL if available
        use_wsl = shutil.which("wsl") is not None or shutil.which("wsl.exe") is not None
        if not use_wsl:
            raise RuntimeError(
                "pdf2htmlEX is not available on Windows without WSL. Install WSL and pdf2htmlEX."
            )

    # Build command
    if use_wsl:
        # Convert Windows paths to WSL paths using wslpath
        def to_wsl(p: str) -> str:
            try:
                converted = subprocess.check_output(["wsl", "wslpath", "-a", p], text=True).strip()
                return converted
            except Exception:
                # Fallback heuristic: map C:\ -> /mnt/c/
                drive, rest = p[0].lower(), p[2:].replace("\\", "/")
                return f"/mnt/{drive}{rest}"

        wsl_pdf = to_wsl(pdf_path)
        wsl_out = to_wsl(str(Path(output_html_path).resolve()))
        cmd = [
            "wsl",
            "pdf2htmlEX.AppImage",
            f"--zoom", str(zoom),
            "--embed", embed,
            "--dest-dir", os.path.dirname(wsl_out) or ".",
            "--optimize-text", "1",
            wsl_pdf,
            os.path.basename(wsl_out),
        ]
    else:
        if pdf2html is None:
            raise RuntimeError("pdf2htmlEX binary not found in PATH. Please install it.")
        cmd = [
            pdf2html,
            f"--zoom", str(zoom),
            "--embed", embed,
            "--dest-dir", str(Path(output_html_path).parent),
            "--optimize-text", "1",
            pdf_path,
            str(Path(output_html_path).name),
        ]

    subprocess.run(cmd, check=True)
    if not Path(output_html_path).exists():
        raise RuntimeError("Failed to generate HTML with pdf2htmlEX.")
    return str(Path(output_html_path).resolve())


def build_exam_html_and_index(
    pdf_path: str,
    output_html_path: Optional[str] = None,
    return_html_string: bool = True,
) -> Dict[str, Any]:
    """
    High-level helper to be used by create_exams.

    - Extracts question/option positions per page, scaled for pdf2htmlEX rendering.
    - Converts the PDF to HTML using pdf2htmlEX (via WSL on Windows).
    - Returns a dict suitable for DB storage and frontend rendering:
      {"html": "<string or path>", "pages": {page: {question: {opt: {x0,y0,x1,y1}}}}}
    """
    pages = extract_questions_options_positions_by_page(pdf_path)

    html_path = convert_pdf_to_html_with_wsl(pdf_path, output_html_path)

    if return_html_string:
        with open(html_path, "r", encoding="utf-8", errors="ignore") as f:
            html_content = f.read()
        # Keep the file for traceability if explicit output path provided, else clean up
        if output_html_path is None:
            try:
                os.remove(html_path)
                parent = Path(html_path).parent
                # Remove temp dir if empty
                if parent.exists() and parent.name.startswith("pdf2html_"):
                    shutil.rmtree(parent, ignore_errors=True)
            except Exception:
                pass
        result_html: Any = html_content
    else:
        result_html = html_path

    return {
        "html": result_html,
        "pages": pages,
    }

