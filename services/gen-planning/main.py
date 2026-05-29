from __future__ import annotations

import os
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import PromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field


class GenerateWBSRequest(BaseModel):
    project_goal: str = Field(min_length=1)
    team_size: int = Field(gt=0)
    sprint_length_weeks: int = Field(gt=0)
    tech_stack: List[str]


class WBSTask(BaseModel):
    title: str
    description: str
    estimated_story_points: int = Field(ge=1)
    complexity_score: int = Field(ge=1, le=5)
    dependencies: List[str] = []


class WBSEpic(BaseModel):
    name: str
    description: str
    tasks: List[WBSTask]


class WBSOutput(BaseModel):
    epics: List[WBSEpic]


app = FastAPI(title="Gen Planning Service", version="1.0.0")

allowed_origin = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[allowed_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def build_mock_wbs(request: GenerateWBSRequest) -> dict:
    tech_label = ", ".join(request.tech_stack) if request.tech_stack else "the chosen stack"
    sprint_label = f"{request.sprint_length_weeks}-week sprints"
    return {
        "epics": [
            {
                "name": "Discovery and Planning",
                "description": f"Align scope, architecture, and delivery plan for {request.project_goal} using {tech_label}.",
                "tasks": [
                    {
                        "title": "Define scope and success metrics",
                        "description": "Capture business goals, acceptance criteria, and delivery constraints.",
                        "estimated_story_points": 5,
                        "complexity_score": 2,
                        "dependencies": []
                    },
                    {
                        "title": "Draft architecture outline",
                        "description": f"Map services, data flow, and deployment strategy for the {tech_label} stack.",
                        "estimated_story_points": 8,
                        "complexity_score": 3,
                        "dependencies": ["Define scope and success metrics"]
                    }
                ]
            },
            {
                "name": "Core Delivery",
                "description": f"Build the minimum usable version of the product across {sprint_label}.",
                "tasks": [
                    {
                        "title": "Implement foundation services",
                        "description": "Set up the main domain models, APIs, and integration points.",
                        "estimated_story_points": 13,
                        "complexity_score": 4,
                        "dependencies": ["Draft architecture outline"]
                    },
                    {
                        "title": "Build primary user workflow",
                        "description": "Deliver the key end-to-end user journey for the project goal.",
                        "estimated_story_points": 13,
                        "complexity_score": 4,
                        "dependencies": ["Implement foundation services"]
                    }
                ]
            },
            {
                "name": "Stabilization and Release",
                "description": "Harden the release, validate risks, and prepare rollout support.",
                "tasks": [
                    {
                        "title": "Testing and quality hardening",
                        "description": "Add regression tests, review edge cases, and stabilize the release candidate.",
                        "estimated_story_points": 8,
                        "complexity_score": 3,
                        "dependencies": ["Build primary user workflow"]
                    },
                    {
                        "title": "Release readiness review",
                        "description": "Confirm deployment checklist, monitoring, and launch ownership.",
                        "estimated_story_points": 5,
                        "complexity_score": 2,
                        "dependencies": ["Testing and quality hardening"]
                    }
                ]
            }
        ]
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/generate-wbs", response_model=WBSOutput)
def generate_wbs(request: GenerateWBSRequest) -> WBSOutput:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return WBSOutput.model_validate(build_mock_wbs(request))

    parser = JsonOutputParser(pydantic_object=WBSOutput)
    prompt = PromptTemplate(
        template=(
            "You are a senior product delivery planner. Generate a structured Work Breakdown Structure for the project below.\n"
            "Use the exact JSON schema from the format instructions.\n"
            "Project goal: {project_goal}\n"
            "Team size: {team_size}\n"
            "Sprint length in weeks: {sprint_length_weeks}\n"
            "Tech stack: {tech_stack}\n\n"
            "{format_instructions}"
        ),
        input_variables=["project_goal", "team_size", "sprint_length_weeks", "tech_stack"],
        partial_variables={"format_instructions": parser.get_format_instructions()}
    )
    llm = ChatOpenAI(model="gpt-4o", temperature=0.2, api_key=api_key)
    chain = prompt | llm | parser

    try:
        parsed = chain.invoke(
            {
                "project_goal": request.project_goal,
                "team_size": request.team_size,
                "sprint_length_weeks": request.sprint_length_weeks,
                "tech_stack": ", ".join(request.tech_stack),
            }
        )
        return WBSOutput.model_validate(parsed)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to generate WBS: {exc}") from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8004, reload=False)
