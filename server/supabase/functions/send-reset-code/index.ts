import { createClient } from 'npm:@supabase/supabase-js@2'
import { createTransport } from 'npm:nodemailer@6'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)
const transporter = createTransport({
  service: 'gmail',
  auth: {
    user: Deno.env.get('GMAIL_USER'),
    pass: Deno.env.get('GMAIL_APP_PASSWORD'),
  },
})

Deno.serve(async (req) => {
  const { email } = await req.json()
  if (!email) return new Response('Missing email', { status: 400 })

  const { data: att } = await supabase
    .from('attendants').select('id').eq('email', email).single()
  if (!att) return new Response('Email not found', { status: 404 })

  const code = String(Math.floor(1000 + Math.random() * 9000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabase.from('reset_codes').insert({ email, code, expires_at: expiresAt })

  await transporter.sendMail({
    from: Deno.env.get('GMAIL_USER'),
    to: email,
    subject: 'Mã đặt lại mật khẩu - Smart Parking',
    html: `<p>Mã xác thực của bạn: <b>${code}</b></p>
           <p>Mã có hiệu lực trong 10 phút.</p>
           <p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>`,
  })

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})