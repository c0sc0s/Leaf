import json
from dataclasses import dataclass
from pathlib import Path

from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

from .blocks import reflow
from .chunks import chunk, to_json

IMAGE_SCALE = 2.0


@dataclass(frozen=True)
class Options:
    models: Path | None = None
    ocr: bool = False
    code: bool = False


def converter(options: Options) -> DocumentConverter:
    pipeline = PdfPipelineOptions(
        artifacts_path=options.models,
        do_ocr=options.ocr,
        do_code_enrichment=options.code,
        generate_picture_images=True,
        images_scale=IMAGE_SCALE,
    )
    return DocumentConverter(
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline)}
    )


def convert(
    engine: DocumentConverter, pdf: Path, out: Path, pages: tuple[int, int] | None = None
) -> dict:
    result = engine.convert(pdf, page_range=pages) if pages else engine.convert(pdf)
    doc = result.document
    content = reflow(doc)
    out.mkdir(parents=True, exist_ok=True)
    (out / "images").mkdir(exist_ok=True)
    for name, image in content.images.items():
        image.save(out / name)
    write_json(out / "blocks.json", content.to_json())
    write_json(out / "chunks.json", to_json(chunk(content.blocks)))
    write_json(out / "docling.json", doc.export_to_dict())
    (out / "document.md").write_text(doc.export_to_markdown(), encoding="utf-8")
    return {
        "status": result.status.value,
        "pages": len(doc.pages),
        "blocks": len(content.blocks),
        "images": len(content.images),
    }


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1), encoding="utf-8")
