import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  console.log("Function started - Searching trigger functions");

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  const missingVars = [];
  if (!supabaseUrl) missingVars.push('SUPABASE_URL');
  if (!supabaseAnonKey) missingVars.push('SUPABASE_ANON_KEY');

  if (missingVars.length > 0) {
    console.error(`Missing environment variables: ${missingVars.join(', ')}`);
    return new Response(JSON.stringify({ error: `Server configuration error. Missing: ${missingVars.join(', ')}` }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { searchString } = await req.json();

    if (!searchString) {
      return new Response(JSON.stringify({ error: "Invalid request. Search string is required." }), { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Searching for: ${searchString}`);

    // Search in trigger functions
    const { data: triggerFunctions, error: triggerError } = await supabase
      .rpc('search_trigger_functions', { search_string: searchString });

    if (triggerError) {
      throw new Error(`Error searching trigger functions: ${triggerError.message}`);
    }

    const results = {
      triggerFunctions: triggerFunctions.map(func => ({
        name: func.proname,
        matchingLines: func.prosrc.split('\n')
          .filter(line => line.toLowerCase().includes(searchString.toLowerCase()))
          .map(line => line.trim()),
        fullSource: func.prosrc
      })) || [],
      edgeFunctions: [] // Placeholder for edge functions
    };

    console.log(`Search completed. Found ${results.triggerFunctions.length} trigger functions.`);
    console.log("Note: Edge functions are not currently searchable through this method due to API limitations. To search edge functions, you would need to implement a separate system to track and search them.");

    return new Response(JSON.stringify(results), { 
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error("Unexpected error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});