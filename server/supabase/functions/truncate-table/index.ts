import { createClient } from 'npm:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing Authorization header' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const token = authHeader.slice(7)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { table, tables } = await req.json()
  const tableNames = tables || (table ? [table] : [])

  if (tableNames.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing table or tables' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const allowed = ['attendants', 'sessions', 'parking_logs']

  for (const t of tableNames) {
    if (!allowed.includes(t)) {
      return new Response(JSON.stringify({ ok: false, error: `Table not allowed: ${t}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    const { error } = await supabase.from(t).delete().neq('id', 0)
    if (error) {
      console.error(`truncate-table error for ${t}:`, error)
      return new Response(JSON.stringify({ ok: false, error: `Failed to truncate ${t}: ${error.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
