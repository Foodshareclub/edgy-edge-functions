import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const API_DELAY = 500; // 500ms delay between API calls
const BATCH_SIZE = 200;
const TOTAL_LIMIT = 5000;
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isValidCoordinate(lat: number | null, long: number | null): boolean {
  return lat !== null && long !== null && (lat !== 0 || long !== 0);
}

async function processAddress(supabase: any, address: any) {
  console.log(`Processing address: ${address.generated_full_address}`);
  const fullAddress = address.generated_full_address;

  try {
    let queryUrl;
    if (fullAddress.trim() === address.country?.trim()) {
      queryUrl = `${NOMINATIM_BASE_URL}?country=${encodeURIComponent(fullAddress)}&format=json`;
    } else {
      queryUrl = `${NOMINATIM_BASE_URL}?q=${encodeURIComponent(fullAddress)}&format=json`;
    }

    const response = await fetch(queryUrl);
    const data = await response.json();

    if (data.length === 0) {
      console.log(`No coordinates found for address: ${fullAddress}`);
      return { status: 'skipped' };
    } else {
      let lat, long;
      if (fullAddress.trim() === address.country?.trim()) {
        const { boundingbox } = data[0];
        lat = (parseFloat(boundingbox[0]) + parseFloat(boundingbox[1])) / 2;
        long = (parseFloat(boundingbox[2]) + parseFloat(boundingbox[3])) / 2;
      } else {
        ({ lat, lon: long } = data[0]);
      }
      console.log(`Coordinates for ${fullAddress}: lat=${lat}, long=${long}`);

      if (!isValidCoordinate(address.lat, address.long) || 
          lat !== address.lat || 
          long !== address.long) {
        const { error: updateError } = await supabase
          .from('address')
          .update({ lat, long })
          .eq('profile_id', address.profile_id);

        if (updateError) {
          console.error(`Error updating address ${fullAddress}:`, updateError.message);
          return { status: 'error', error: updateError.message };
        } else {
          console.log(`Successfully updated coordinates for ${fullAddress}`);
          return { status: 'processed' };
        }
      } else {
        console.log(`No change in coordinates for ${fullAddress}`);
        return { status: 'unchanged' };
      }
    }
  } catch (error) {
    console.error(`Error processing address ${fullAddress}:`, error.message);
    return { status: 'error', error: error.message };
  }
}

async function processBatch(supabase: any) {
  const { data: addresses, error } = await supabase
    .from('address')
    .select('profile_id, generated_full_address, lat, long, country')
    .or('lat.is.null,long.is.null,lat.eq.0,long.eq.0')
    .order('profile_id', { ascending: true })
    .limit(TOTAL_LIMIT);

  if (error) {
    console.error("Error fetching addresses:", error.message);
    return { error: error.message };
  }

  console.log(`Fetched ${addresses?.length ?? 0} addresses for batch processing`);

  if (!addresses || addresses.length === 0) {
    return { message: "No addresses to process in batch" };
  }

  let processedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let unchangedCount = 0;

  for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
    const batch = addresses.slice(i, i + BATCH_SIZE);
    for (const address of batch) {
      const result = await processAddress(supabase, address);
      switch (result.status) {
        case 'processed':
          processedCount++;
          break;
        case 'skipped':
          skippedCount++;
          break;
        case 'unchanged':
          unchangedCount++;
          break;
        case 'error':
          errorCount++;
          break;
      }
      await delay(API_DELAY);
    }
  }

  return {
    message: `Batch processed ${processedCount} addresses, skipped ${skippedCount}, unchanged ${unchangedCount}, encountered ${errorCount} errors`,
    totalAddresses: addresses.length,
    processedCount,
    skippedCount,
    unchangedCount,
    errorCount
  };
}

async function setupTrigger(supabase: any) {
  const functionName = 'trigger_geocode_address';
  const triggerName = 'geocode_new_address';

  // Create or replace the function
  await supabase.rpc('create_or_replace_function', {
    function_name: functionName,
    function_definition: `
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM net.http_post(
          'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/update-coordinates',
          '{"address": ' || row_to_json(NEW)::text || '}',
          '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('supabase.anon_key') || '"}'
        );
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `
  });

  // Create the trigger if it doesn't exist
  await supabase.rpc('create_trigger_if_not_exists', {
    trigger_name: triggerName,
    table_name: 'address',
    function_name: functionName
  });

  console.log('Trigger setup completed');
}

serve(async (req) => {
  console.log("Function started - Geocoding addresses");

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
    return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    // Setup trigger on first run
    await setupTrigger(supabase);

    const { address, isBatch } = await req.json();
    let result;

    if (isBatch) {
      result = await processBatch(supabase);
    } else if (address) {
      result = await processAddress(supabase, address);
    } else {
      result = { error: "Invalid request. Specify either 'address' or 'isBatch'." };
    }

    console.log("Function completed", result);

    // Schedule the next run
    setTimeout(async () => {
      await fetch(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify({ isBatch: true })
      });
    }, CHECK_INTERVAL);

    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Unexpected error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});