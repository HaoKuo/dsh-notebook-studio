"""从可信的 dsh 附件路径提取逐页证据与可追溯的文献插图。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import pymupdf


CAPTION = re.compile(r"^\s*(?:fig(?:ure)?\.?|图)\s*\d+[A-Za-z]?\b", re.IGNORECASE)
DOI = re.compile(r"\b10\.\d{4,9}/[-._;()/:A-Z0-9]+", re.IGNORECASE)
SOURCE_ID = re.compile(r"^sha256:([0-9a-f]{64})$")
MAX_PAGES = 500
MAX_FIGURES_PER_SOURCE = 12


def candidate_clip(page: pymupdf.Page, caption_rect: pymupdf.Rect) -> tuple[pymupdf.Rect | None, float]:
    """只裁切图注上方有实际图片或矢量图形的区域。"""
    page_rect = page.rect
    middle = (page_rect.x0 + page_rect.x1) / 2
    if caption_rect.x1 < middle - 12:
        left, right = page_rect.x0, middle
    elif caption_rect.x0 > middle + 12:
        left, right = middle, page_rect.x1
    else:
        left, right = page_rect.x0, page_rect.x1

    upper = max(page_rect.y0, caption_rect.y0 - min(360, page_rect.height * 0.52))
    lower = caption_rect.y0 - 7
    nearby: list[pymupdf.Rect] = []
    for image in page.get_image_info():
        rect = pymupdf.Rect(image["bbox"])
        if (
            rect.width >= 65
            and rect.height >= 45
            and rect.y1 <= caption_rect.y0 + 10
            and rect.y1 >= upper
            and rect.x1 > left + 15
            and rect.x0 < right - 15
        ):
            nearby.append(rect)

    if nearby:
        score = 2.0
    else:
        # 论文的流程图经常只有 PDF 路径，没有嵌入位图；收集同一区域的图形边界。
        for drawing in page.get_drawings():
            rect = pymupdf.Rect(drawing["rect"])
            if (rect.y0 < upper or rect.y1 > lower + 10
                    or rect.x1 <= left + 12 or rect.x0 >= right - 12
                    or rect.width < 3 or rect.height < 3
                    or rect.get_area() > page_rect.get_area() * 0.45):
                continue
            nearby.append(rect)
        if len(nearby) < 4:
            return None, 0
        score = 1.7

    union = nearby[0]
    for rect in nearby[1:]:
        union |= rect
    if union.width < 100 or union.height < 70:
        return None, 0
    clip = pymupdf.Rect(max(left + 4, union.x0 - 9), max(upper, union.y0 - 9),
                        min(right - 4, union.x1 + 9), min(lower, union.y1 + 7))
    score += min(union.get_area() / max(page_rect.get_area(), 1), 1)

    clip &= page_rect
    return clip, score


def extract_figures(page: pymupdf.Page, source_hash: str, page_number: int,
                    output: Path, remaining: int) -> list[dict]:
    figures: list[dict] = []
    if remaining <= 0:
        return figures
    for block in page.get_text("blocks", sort=True):
        if len(block) < 7 or block[6] != 0:
            continue
        caption = " ".join(block[4].split())
        if not CAPTION.match(caption):
            continue
        caption_rect = pymupdf.Rect(block[:4])
        clip, score = candidate_clip(page, caption_rect)
        if clip is None or clip.width < 100 or clip.height < 75:
            continue
        index = len(figures) + 1
        filename = f"{source_hash}-p{page_number:03d}-f{index:02d}.png"
        relative_path = f"figures/{filename}"
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(2, 2), clip=clip, alpha=False)
        if pixmap.width < 250 or pixmap.height < 150:
            continue
        pixmap.save(output / filename)
        figures.append({
            "id": f"{source_hash}:p{page_number}:f{index}",
            "page": page_number,
            "caption": caption[:380],
            "path": relative_path,
            "bbox": [round(value, 2) for value in clip],
            "width": pixmap.width,
            "height": pixmap.height,
            "score": round(score, 2),
        })
        if len(figures) >= remaining:
            break
    return figures


def extract(pdf_path: Path, output_root: Path, source_id: str) -> dict:
    # 某些 PDF 的 ICC 色彩配置会让底层 MuPDF 向 stdout 打印告警，污染 JSON 协议。
    pymupdf.TOOLS.mupdf_display_errors(False)
    pymupdf.TOOLS.mupdf_display_warnings(False)
    match = SOURCE_ID.fullmatch(source_id)
    if match is None:
        raise ValueError("来源 ID 不符合 dsh 内容哈希格式")
    source_hash = match.group(1)
    output = output_root / "figures"
    output.mkdir(parents=True, exist_ok=True)

    with pymupdf.open(pdf_path) as document:
        if not document.is_pdf or document.needs_pass:
            raise ValueError("文件不是可读取的 PDF，或需要密码")
        if document.page_count > MAX_PAGES:
            raise ValueError(f"PDF 超过 {MAX_PAGES} 页，不适合首版批量分析")

        pages: list[dict] = []
        figures: list[dict] = []
        for index, page in enumerate(document):
            text = page.get_text("text", sort=True).strip()
            pages.append({"page": index + 1, "text": text})
            remaining = MAX_FIGURES_PER_SOURCE - len(figures)
            if remaining:
                figures.extend(extract_figures(page, source_hash, index + 1, output, remaining))

        readable = sum(len(page["text"].split()) for page in pages)
        if readable < 50:
            for figure in figures:
                (output_root / figure["path"]).unlink(missing_ok=True)
            raise ValueError("PDF 缺少可复制文字层；首版不提供扫描件 OCR")

        metadata_title = (document.metadata or {}).get("title") or ""
        title = metadata_title.strip()
        if not title or title.lower() in {"untitled", "document", "microsoft word"}:
            title = next((line.strip() for line in pages[0]["text"].splitlines()
                          if len(line.strip()) >= 12), pdf_path.stem)
        first_pages = "\n".join(page["text"] for page in pages[:3])
        doi = DOI.search(first_pages)
        return {
            "title": title[:220],
            "doi": doi.group(0).rstrip(".,;)") if doi else None,
            "pageCount": document.page_count,
            "pages": pages,
            "figures": figures,
        }


def main() -> int:
    parser = argparse.ArgumentParser(description="提取 PDF 页面与文献插图")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--source-id", required=True)
    arguments = parser.parse_args()
    try:
        result = extract(Path(arguments.input), Path(arguments.output), arguments.source_id)
    except (OSError, RuntimeError, ValueError, pymupdf.FileDataError) as error:
        print(str(error), file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
