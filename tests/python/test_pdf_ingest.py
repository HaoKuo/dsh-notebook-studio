"""验证文字层检查及跨栏矢量图裁切。"""

import tempfile
import unittest
from pathlib import Path

import pymupdf

from worker.pdf_ingest import extract


class PdfIngestTests(unittest.TestCase):
    def test_vector_figure_spanning_columns(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "paper.pdf"
            document = pymupdf.open()
            page = document.new_page(width=612, height=792)
            for index in range(8):
                page.insert_text((45, 530 + index * 14), "Evidence supports this finding. " * 4)
            for x in (130, 190, 270, 380):
                page.draw_rect(pymupdf.Rect(x, 150, x + 65, 285), color=(0, 0, 0))
            page.insert_text((140, 345), "Fig. 1. A diagram spanning both columns")
            document.save(path)
            document.close()
            result = extract(path, Path(root), "sha256:" + "a" * 64)
            self.assertEqual(result["pageCount"], 1)
            self.assertEqual(len(result["figures"]), 1)
            self.assertGreater(result["figures"][0]["bbox"][2], 440)
            self.assertTrue((Path(root) / result["figures"][0]["path"]).is_file())

    def test_no_text_layer_stops_without_ocr(self):
        with tempfile.TemporaryDirectory() as root:
            path = Path(root) / "scan.pdf"
            document = pymupdf.open()
            document.new_page()
            document.save(path)
            document.close()
            with self.assertRaisesRegex(ValueError, "文字层"):
                extract(path, Path(root), "sha256:" + "b" * 64)


if __name__ == "__main__":
    unittest.main()
