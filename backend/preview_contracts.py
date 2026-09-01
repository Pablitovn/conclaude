from __future__ import annotations

import inspect
import math
from typing import Any, Optional, Union, get_args, get_origin

from pydantic import BaseModel, ConfigDict, Field, create_model, field_validator

from .mastering import process_audio


def _annotation_from_default(default: Any):
    if default is None:
        return Optional[str]
    if isinstance(default, bool):
        return bool
    if isinstance(default, int) and not isinstance(default, bool):
        return int
    if isinstance(default, float):
        return float
    if isinstance(default, str):
        return str
    return Any


class _PreviewParamsBase(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    @field_validator("*", mode="after")
    @classmethod
    def validate_values(cls, value):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError("Los parámetros numéricos deben ser finitos")
        return value


def _build_preview_params_model():
    fields: dict[str, tuple[Any, Any]] = {}
    sig = inspect.signature(process_audio)
    excluded = {"input_path", "progress_cb", "preview_seconds"}
    for name, parameter in sig.parameters.items():
        if name in excluded:
            continue
        default = parameter.default
        if default is inspect.Parameter.empty:
            annotation = parameter.annotation if parameter.annotation is not inspect.Parameter.empty else Any
            fields[name] = (annotation, ...)
        else:
            fields[name] = (_annotation_from_default(default), default)

    return create_model(
        "PreviewParams",
        __base__=_PreviewParamsBase,
        __module__=__name__,
        **fields,
    )

PreviewParams = _build_preview_params_model()


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preview_source_id: str = Field(min_length=8, max_length=128)
    preview_duration_sec: int = Field(default=25, ge=25, le=25)
    params: PreviewParams


class PreviewSourceResponse(BaseModel):
    source_id: str
    duration_sec: float = Field(gt=0, le=25)
    source_sha256: str = Field(min_length=64, max_length=64)
