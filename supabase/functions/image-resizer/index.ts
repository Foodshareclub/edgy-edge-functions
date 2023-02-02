import { compress } from "https://deno.land/x/compress/mod.ts";

interface Event {
  data: any;
}

export default async ({ event }: { event: Event }) => {
  // Get the image file from the event object
  const image = event.data;
  
  // Compress the image using the compress library
  const compressedImage = await compress(image);

  return {
    statusCode: 200,
    body: JSON.stringify({
      compressedImage: compressedImage
    })
  };
};
