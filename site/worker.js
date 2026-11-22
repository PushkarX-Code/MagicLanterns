// Static files are served by Cloudflare directly. This only runs for the launch-list form (POST /).
export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return env.ASSETS.fetch(request)
    const form = await request.formData().catch(() => null)
    const email = String(form?.get('email') ?? '').trim().toLowerCase()
    if (form?.get('company') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return new Response('Bad request', { status: 400 })
    const platform = ['mac', 'ipad', 'android'].includes(form.get('platform')) ? form.get('platform') : 'mac'
    await env.LAUNCH_LIST.put(email, JSON.stringify({ platform, at: new Date().toISOString() }))
    return new Response('ok')
  }
}
