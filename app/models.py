from pydantic import BaseModel, field_validator


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
    title: str | None = None
    body: str | None = None
    assignee: str | None = None
    status: str | None = None
    priority: int | None = None
    goal_mode: bool | None = None
    workspace_path: str | None = None
    workspace_kind: str | None = None


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
