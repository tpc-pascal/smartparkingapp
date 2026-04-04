import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  const { email, code, newPassword } = await req.json()
  if (!email || !code) return new Response('Missing fields', { status: 400 })

  const { data: rc } = await supabase
    .from('reset_codes')
    .select('id')
    .eq('email', email).eq('code', code).eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (!rc) return new Response('Invalid or expired code', { status: 400 })

  if (newPassword) {
    // Có mật khẩu → mark used + cập nhật
    await supabase.from('reset_codes').update({ used: true }).eq('id', rc.id)
    const { data: au } = await supabase.from('attendants').select('uid').eq('email', email).single()
    if (au?.uid) await supabase.auth.admin.updateUserById(au.uid, { password: newPassword })
    const encoder = new TextEncoder()
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(newPassword))
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
    await supabase.from('attendants').update({ password_hash: hash }).eq('email', email)
  } // Ngược lại: chỉ verify, KHÔNG mark used, KHÔNG update password

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})