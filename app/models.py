from pydantic import BaseModel


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


class TaskUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    assignee: str | None = None
    status: str | None = None
    priority: int | None = None
    goal_mode: bool | None = None


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
