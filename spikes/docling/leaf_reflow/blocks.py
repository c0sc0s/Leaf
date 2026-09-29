from dataclasses import asdict, dataclass, field

from docling_core.types.doc import (
    CodeItem,
    DocItem,
    DocItemLabel,
    DoclingDocument,
    ListItem,
    PictureItem,
    SectionHeaderItem,
    TableItem,
    TextItem,
)
from PIL.Image import Image

FORMAT_VERSION = 1

KINDS = {
    DocItemLabel.TITLE: "heading",
    DocItemLabel.SECTION_HEADER: "heading",
    DocItemLabel.TEXT: "paragraph",
    DocItemLabel.PARAGRAPH: "paragraph",
    DocItemLabel.LIST_ITEM: "list-item",
    DocItemLabel.CODE: "code",
    DocItemLabel.FORMULA: "formula",
    DocItemLabel.CAPTION: "caption",
    DocItemLabel.FOOTNOTE: "footnote",
    DocItemLabel.REFERENCE: "reference",
    DocItemLabel.PICTURE: "figure",
    DocItemLabel.CHART: "figure",
    DocItemLabel.TABLE: "table",
    DocItemLabel.DOCUMENT_INDEX: "table",
    DocItemLabel.CHECKBOX_SELECTED: "list-item",
    DocItemLabel.CHECKBOX_UNSELECTED: "list-item",
    DocItemLabel.KEY_VALUE_REGION: "paragraph",
    DocItemLabel.FORM: "paragraph",
    DocItemLabel.HANDWRITTEN_TEXT: "paragraph",
    DocItemLabel.EMPTY_VALUE: "paragraph",
}


@dataclass(frozen=True)
class Source:
    page: int
    # PDF user-space points with a bottom-left origin, matching Leaf annotation rects.
    bbox: tuple[float, float, float, float]


@dataclass
class Block:
    id: str
    kind: str
    text: str
    sources: list[Source]
    level: int | None = None
    language: str | None = None
    image: str | None = None
    captions: list[str] = field(default_factory=list)


@dataclass
class Reflow:
    blocks: list[Block]
    images: dict[str, Image]

    def to_json(self) -> dict:
        return {"version": FORMAT_VERSION, "blocks": [asdict(block) for block in self.blocks]}


def sources_of(item: DocItem, doc: DoclingDocument) -> list[Source]:
    sources = []
    for prov in item.prov:
        height = doc.pages[prov.page_no].size.height
        box = prov.bbox.to_bottom_left_origin(height)
        sources.append(Source(prov.page_no, (box.l, box.b, box.r, box.t)))
    return sources


def text_of(item: DocItem, doc: DoclingDocument) -> str:
    if isinstance(item, TableItem):
        return item.export_to_markdown(doc)
    if isinstance(item, TextItem):
        return item.text
    return ""


def heading_level(item: DocItem) -> int | None:
    if item.label == DocItemLabel.TITLE:
        return 1
    if isinstance(item, SectionHeaderItem):
        return item.level + 1
    return None


def reflow(doc: DoclingDocument) -> Reflow:
    items = [item for item, _ in doc.iterate_items() if isinstance(item, DocItem)]
    ids = {item.self_ref: f"b{index:05d}" for index, item in enumerate(items)}
    blocks, images = [], {}
    for item in items:
        if item.label not in KINDS:
            raise ValueError(f"Unmapped Docling label {item.label!r} at {item.self_ref}")
        block = Block(
            id=ids[item.self_ref],
            kind=KINDS[item.label],
            text=text_of(item, doc),
            sources=sources_of(item, doc),
            level=heading_level(item),
        )
        if isinstance(item, CodeItem):
            block.language = item.code_language.value
        if isinstance(item, ListItem):
            block.text = f"{item.marker} {item.text}".strip() if item.marker else item.text
        if isinstance(item, (PictureItem, TableItem)):
            block.captions = [ids[ref.cref] for ref in item.captions]
            if isinstance(item, PictureItem):
                image = item.get_image(doc)
                if image is not None:
                    block.image = f"images/{block.id}.png"
                    images[block.image] = image
        blocks.append(block)
    return Reflow(blocks, images)
