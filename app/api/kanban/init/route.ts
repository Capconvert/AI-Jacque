import { sql } from '@vercel/postgres';

export async function POST() {
  try {
    await sql`DO $$ BEGIN
      CREATE TYPE task_status AS ENUM ('TODO', 'DOING', 'DONE');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

    await sql`DO $$ BEGIN
      CREATE TYPE task_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

    await sql`DO $$ BEGIN
      CREATE TYPE task_activity_type AS ENUM (
        'CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED',
        'PRIORITY_CHANGED', 'TITLE_CHANGED', 'DESCRIPTION_CHANGED',
        'DUE_DATE_CHANGED', 'COMPLETED', 'REOPENED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`;

    await sql`CREATE TABLE IF NOT EXISTS kanban_boards (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      created_by VARCHAR(255) NOT NULL DEFAULT 'system',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    await sql`CREATE TABLE IF NOT EXISTS kanban_tasks (
      id SERIAL PRIMARY KEY,
      board_id INT NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
      title VARCHAR(500) NOT NULL,
      description TEXT,
      status task_status NOT NULL DEFAULT 'TODO',
      priority task_priority NOT NULL DEFAULT 'NORMAL',
      position INT NOT NULL DEFAULT 0,
      assignee VARCHAR(255),
      created_by VARCHAR(255) NOT NULL DEFAULT 'system',
      due_date TIMESTAMP,
      completed_at TIMESTAMP,
      doing_started_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    await sql`CREATE INDEX IF NOT EXISTS idx_kanban_tasks_board_status_position
      ON kanban_tasks(board_id, status, position)`;

    await sql`CREATE INDEX IF NOT EXISTS idx_kanban_tasks_assignee
      ON kanban_tasks(assignee)`;

    await sql`CREATE TABLE IF NOT EXISTS kanban_task_activities (
      id SERIAL PRIMARY KEY,
      task_id INT NOT NULL REFERENCES kanban_tasks(id) ON DELETE CASCADE,
      actor VARCHAR(255) NOT NULL DEFAULT 'system',
      type task_activity_type NOT NULL,
      old_value TEXT,
      new_value TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`;

    await sql`CREATE INDEX IF NOT EXISTS idx_kanban_activities_task_created
      ON kanban_task_activities(task_id, created_at DESC)`;

    const existing = await sql`SELECT id FROM kanban_boards LIMIT 1`;
    if (existing.rows.length === 0) {
      await sql`INSERT INTO kanban_boards (name, description, created_by)
        VALUES ('Capconvert Ops', 'Default board for Capconvert internal work', 'system')`;
    }

    return Response.json({ success: true, message: 'Kanban schema initialized' });
  } catch (error) {
    console.error('Kanban init error:', error);
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
