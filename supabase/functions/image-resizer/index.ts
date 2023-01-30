import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
import { BufReader } from "https://deno.land/std@0.131.0/io/bufio.ts";
import { readLine } from "https://deno.land/std@0.131.0/io/util.ts";

import { config } from "https://deno.land/x/dotenv/mod.ts";

const bucketName = 'posts';

const updateImage = async (imageId: string, imageBuffer: Uint8Array) => {
    const apiKey = config().SUPABASE_API_KEY;
    const response = await fetch(`https://api.supabase.co/bucket/${bucketName}/${imageId}`, {
        method: 'PUT',
        body: imageBuffer,
        headers: new Headers({
            'Content-Type': 'image/jpeg',
            'Authorization': `Bearer ${apiKey}`
        }),
    });
    if (!response.ok) {
        throw new Error(`Error updating image: ${response.status}`);
    }
    console.log("Image updated successfully!");
};

const imageId = '1644347323145739.jpg';
const imageBuffer = await Deno.readFile("https://iazmjdjwnkilycbjwpzp.supabase.co/storage/v1/object/public/posts/10/1644347323145739.jpg");

try {
    await updateImage(imageId, imageBuffer);
} catch (error) {
    console.error(error);
}


