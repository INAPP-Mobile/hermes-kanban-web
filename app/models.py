from pydantic import BaseModel, ConfigDict, field_validator


class TaskCreate(BaseModel):
    title: str
    body: str = ""
    assignee: str = "worker"
    priority: int = 0
    goal_mode: bool = False
    goal_max_turns: int = 20
    parent_ids: list[str] = []
    child_ids: list[str] = []
    workspace_path: str | None = None
    auto_decompose: bool = False
    status: str = "todo"

    @field_validator("title", "body")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("must not be empty")
        return v.strip()


class TaskUpdate(BaseModel):
    """Update contract for an existing kanban task.

    Only `status` is a supported mutation — the Hermes CLI has no command to
    edit a live task's title/body/priority/workspace/assignee, so those fields
    are intentionally absent. `extra="forbid"` hard-rejects any field-edit
    attempt at the schema layer (default Pydantic silently drops extras,
    which would turn a field edit into a silent no-op instead of a rejection).
    """

    model_config = ConfigDict(extra="forbid")

    status: str | None = None


class DependencyCreate(BaseModel):
    parent_id: str
    child_id: str


class CommentCreate(BaseModel):
    author: str = "kanban-manager"
    body: str


class BoardCreate(BaseModel):
    slug: str
    default_workdir: str | None = None
    auto_decompose: bool = False


class ProfileCreate(BaseModel):
    name: str
    model: str = ""
    description: str = ""
    clone_from: str = ""
