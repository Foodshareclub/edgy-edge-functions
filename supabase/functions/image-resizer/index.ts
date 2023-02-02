import { serve } from "https://deno.land/std@0.57.0/http/server.ts";
import { readFileSync } from "https://deno.land/std@0.57.0/fs/read_file.ts";
import { Sharp } from "https://deno.land/x/sharp/mod.ts";

interface Event {
  data: any;
}

export default async ({ event }: { event: Event }) => {
  // Get the image file from the event object
  const image = event.data;
  
  // Read the image into memory
  const imageData = readFileSync(image);

  // Create a Sharp instance and resize the image
  const sharp = new Sharp(imageData);
  const resizedImage = await sharp.resize({
    width: 100,
    height: 100
  }).toBuffer();

  return {
    statusCode: 200,
    body: JSON.stringify({
      resizedImage: resizedImage
    })
  };
};
