import { NextResponse } from "next/server";
import { getAllTodos, createTodo, updateTodo, deleteTodo, clearCompleted } from "@/lib/todos/storage";

export const runtime = "nodejs";

export async function GET() {
  try {
    const todos = getAllTodos();
    return NextResponse.json({ ok: true, todos });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const todo = createTodo(body.text, body.priority, body.due_date, body.lead_id, body.assignee);
      return NextResponse.json({ ok: true, todo });
    }
    if (action === "update") {
      const todo = updateTodo(body.id, body.fields);
      if (!todo) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      return NextResponse.json({ ok: true, todo });
    }
    if (action === "delete") {
      const ok = deleteTodo(body.id);
      return NextResponse.json({ ok });
    }
    if (action === "clear_completed") {
      const count = clearCompleted(body.assignee);
      return NextResponse.json({ ok: true, cleared: count });
    }
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
