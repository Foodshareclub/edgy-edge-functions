import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search"

serve(async (req) => {
  // Initialize Supabase client
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  )

  // Fetch addresses that need geocoding
  const { data: addresses, error } = await supabaseClient
    .from('address')
    .select('id, generated_full_address')
    .is('latitude', null)
    .is('longitude', null)
    .limit(10)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  let processedCount = 0
  for (const address of addresses) {
    try {
      const params = new URLSearchParams({
        q: address.generated_full_address,
        format: 'json',
        limit: '1'
      })
      const response = await fetch(`${NOMINATIM_BASE_URL}?${params}`)
      const data = await response.json()

      if (data.length > 0) {
        const { lat, lon } = data[0]
        await supabaseClient
          .from('address')
          .update({ latitude: lat, longitude: lon })
          .eq('id', address.id)
        processedCount++
      }

      // Add a delay to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
      console.error(`Error processing address ${address.id}: ${error.message}`)
    }
  }

  return new Response(
    JSON.stringify({ message: `Processed ${processedCount} out of ${addresses.length} addresses` }),
    { headers: { "Content-Type": "application/json" } },
  )
})