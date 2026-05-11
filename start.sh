#!/bin/bash
ROOT=~/Desktop/Portfolio/personal-agent
cd "$ROOT/backend" && uvicorn main:app --reload &
cd "$ROOT/frontend" && npm run dev
