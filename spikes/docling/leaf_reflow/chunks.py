from dataclasses import asdict, dataclass

from .blocks import Block

MAX_CHARS = 2400


@dataclass
class Chunk:
    id: str
    headings: list[str]
    blocks: list[str]
    pages: list[int]
    text: str


def render(block: Block) -> str:
    """Prefix every block with its id so model answers can cite a location in the reader."""
    if block.kind == "figure":
        body = f"[figure] {block.image or 'no image'}"
    elif block.kind == "code":
        body = f"```{block.language or ''}\n{block.text}\n```"
    else:
        body = block.text
    return f"[{block.id}] {body}"


def chunk(blocks: list[Block], max_chars: int = MAX_CHARS) -> list[Chunk]:
    """Split at headings, then at block boundaries once a section exceeds max_chars."""
    chunks: list[Chunk] = []
    headings: list[tuple[int, str]] = []
    members: list[Block] = []

    def flush() -> None:
        if not members:
            return
        chunks.append(
            Chunk(
                id=f"c{len(chunks):05d}",
                headings=[title for _, title in headings],
                blocks=[block.id for block in members],
                pages=sorted({source.page for block in members for source in block.sources}),
                text="\n\n".join(render(block) for block in members),
            )
        )
        members.clear()

    for block in blocks:
        if block.kind == "heading":
            flush()
            level = block.level or 1
            headings = [entry for entry in headings if entry[0] < level] + [(level, block.text)]
            continue
        if members and sum(len(render(m)) for m in members) + len(render(block)) > max_chars:
            flush()
        members.append(block)
    flush()
    return chunks


def to_json(chunks: list[Chunk]) -> list[dict]:
    return [asdict(item) for item in chunks]
