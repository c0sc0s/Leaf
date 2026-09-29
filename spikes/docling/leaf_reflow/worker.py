"""Parser process: one JSON request per stdin line, one JSON event per stdout line.

Request:  {"id": str, "method": "convert", "params": {"pdf", "out", "pages"?, "ocr"?, "code"?, "models"?}}
Events:   {"event": "ready"} once, then {"id", "event": "started" | "result" | "error", ...}
The host cancels a job by terminating the process; conversions hold no state worth recovering.
"""

import json
import sys
import time
from pathlib import Path

started = time.perf_counter()
from docling.datamodel.base_models import InputFormat  # noqa: E402

from .convert import Options, converter, convert  # noqa: E402

engines = {}


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def engine_for(options: Options) -> tuple[object, float]:
    if options in engines:
        return engines[options], 0.0
    begin = time.perf_counter()
    engine = converter(options)
    engine.initialize_pipeline(InputFormat.PDF)
    engines[options] = engine
    return engine, time.perf_counter() - begin


def handle(request: dict) -> dict:
    if request["method"] != "convert":
        raise ValueError(f"Unknown method {request['method']!r}")
    params = request["params"]
    models = params.get("models")
    options = Options(
        models=Path(models) if models else None,
        ocr=params.get("ocr", False),
        code=params.get("code", False),
    )
    engine, load = engine_for(options)
    begin = time.perf_counter()
    pages = tuple(params["pages"]) if params.get("pages") else None
    summary = convert(engine, Path(params["pdf"]), Path(params["out"]), pages)
    return {**summary, "modelLoadSeconds": load, "convertSeconds": time.perf_counter() - begin}


def main() -> None:
    emit({"event": "ready", "importSeconds": time.perf_counter() - started})
    for line in sys.stdin:
        request = json.loads(line)
        emit({"id": request["id"], "event": "started"})
        try:
            emit({"id": request["id"], "event": "result", "result": handle(request)})
        except Exception as error:
            emit({"id": request["id"], "event": "error", "error": f"{type(error).__name__}: {error}"})
            raise


if __name__ == "__main__":
    main()
