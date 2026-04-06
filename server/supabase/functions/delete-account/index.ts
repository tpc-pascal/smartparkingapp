import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  const { uid, serverId } = await req.json()
  if (!uid) return new Response('Missing uid', { status: 400 })

  // 1. Delete auth user
  const { error: authErr } = await supabase.auth.admin.deleteUser(uid)
  if (authErr) {
    console.error('deleteAuthUser error:', authErr)
    return new Response(JSON.stringify({ ok: false, error: `Failed to delete auth user: ${authErr.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 2. Delete storage images with prefix
  const { data: files } = await supabase.storage.from('parking-images').list('', { prefix: uid })
  if (files && files.length > 0) {
    const paths = files.map(f => f.name)
    await supabase.storage.from('parking-images').remove(paths)
  }

  // 3. Delete parking logs (via sessions, if serverId provided)
  if (serverId) {
    const { data: sessions } = await supabase.from('sessions').select('id').eq('attendant_id', serverId)
    if (sessions && sessions.length > 0) {
      const ids = sessions.map(s => s.id)
      await supabase.from('parking_logs').delete().in('session_id', ids)
    }
  }
  
  // 3.5 Delete sessions (if serverId provided)
  if (serverId) {
    await supabase.from('sessions').delete().eq('attendant_id', serverId)
  }

  // 4. Delete attendant row
  await supabase.from('attendants').delete().eq('uid', uid)

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
